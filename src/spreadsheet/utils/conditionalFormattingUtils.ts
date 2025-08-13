import { ConditionalFormat, CellFormat, SparseMatrix, CellData } from '../types/spreadsheet';
import { evaluateFormula } from './formulaUtils';

/**
 * Evaluate if a cell should have conditional formatting applied
 */
export function evaluateConditionalFormat(
  value: any,
  rule: ConditionalFormat,
  row: number,
  col: number,
  data: SparseMatrix<CellData>,
  getCell?: (r: number, c: number) => CellData | undefined
): boolean {
  if (!rule) return false;

  switch (rule.type) {
    case 'cellValue':
      return evaluateCellValueCondition(value, rule);
    
    case 'textContains':
      return evaluateTextContainsCondition(value, rule);
    
    case 'dateOccurring':
      return evaluateDateCondition(value, rule);
    
    case 'formula':
      return evaluateFormulaCondition(value, rule, row, col, data, getCell);
    
    default:
      return false;
  }
}

/**
 * Evaluate cell value conditions (numbers, general comparisons)
 */
function evaluateCellValueCondition(value: any, rule: ConditionalFormat): boolean {
  const cellValue = convertToComparableValue(value);
  const ruleValue = convertToComparableValue(rule.value1);
  const ruleValue2 = rule.value2 !== undefined ? convertToComparableValue(rule.value2) : undefined;

  switch (rule.condition) {
    case 'greaterThan':
      return cellValue > ruleValue;
    
    case 'lessThan':
      return cellValue < ruleValue;
    
    case 'equal':
      return cellValue === ruleValue;
    
    case 'notEqual':
      return cellValue !== ruleValue;
    
    case 'between':
      return ruleValue2 !== undefined && cellValue >= ruleValue && cellValue <= ruleValue2;
    
    case 'notBetween':
      return ruleValue2 !== undefined && !(cellValue >= ruleValue && cellValue <= ruleValue2);
    
    case 'contains':
      return String(cellValue).toLowerCase().includes(String(ruleValue).toLowerCase());
    
    case 'startsWith':
      return String(cellValue).toLowerCase().startsWith(String(ruleValue).toLowerCase());
    
    case 'endsWith':
      return String(cellValue).toLowerCase().endsWith(String(ruleValue).toLowerCase());
    
    default:
      return false;
  }
}

/**
 * Evaluate text-specific conditions
 */
function evaluateTextContainsCondition(value: any, rule: ConditionalFormat): boolean {
  const textValue = String(value).toLowerCase();
  const ruleText = String(rule.value1 || '').toLowerCase();

  switch (rule.condition) {
    case 'contains':
      // Support multiple values separated by commas
      const searchTerms = ruleText.split(',').map(term => term.trim());
      return searchTerms.some(term => textValue.includes(term));
    
    case 'notContains':
      return !textValue.includes(ruleText);
    
    case 'equal':
      return textValue === ruleText;
    
    case 'notEqual':
      return textValue !== ruleText;
    
    case 'startsWith':
      return textValue.startsWith(ruleText);
    
    case 'endsWith':
      // Support multiple extensions separated by commas
      const extensions = ruleText.split(',').map(ext => ext.trim());
      return extensions.some(ext => textValue.endsWith(ext));
    
    default:
      return false;
  }
}

/**
 * Evaluate date-specific conditions
 */
function evaluateDateCondition(value: any, rule: ConditionalFormat): boolean {
  const dateValue = parseDate(value);
  if (!dateValue) return false;

  const ruleDate = parseRuleDate(rule.value1);
  if (!ruleDate) return false;

  switch (rule.condition) {
    case 'greaterThan':
      return dateValue > ruleDate;
    
    case 'lessThan':
      return dateValue < ruleDate;
    
    case 'equal':
      return dateValue.getTime() === ruleDate.getTime();
    
    case 'between':
      const ruleDate2 = parseRuleDate(rule.value2);
      return ruleDate2 ? (dateValue >= ruleDate && dateValue <= ruleDate2) : false;
    
    default:
      return false;
  }
}

/**
 * Evaluate formula-based conditions
 */
function evaluateFormulaCondition(
  value: any,
  rule: ConditionalFormat,
  row: number,
  col: number,
  data: SparseMatrix<CellData>,
  getCell?: (r: number, c: number) => CellData | undefined
): boolean {
  try {
    const formula = rule.value1;
    if (!formula) return false;

    // Replace placeholders in formula
    let processedFormula = formula;
    
    // Replace common placeholders
    processedFormula = processedFormula.replace(/\bvalue\b/g, String(value));
    processedFormula = processedFormula.replace(/\brow\b/g, String(row + 1)); // 1-based
    processedFormula = processedFormula.replace(/\bcol\b/g, String(col + 1)); // 1-based
    
    // Replace cell references like A1 with actual cell addresses
    processedFormula = processedFormula.replace(/A1/g, `${row + 1}:${col}`);
    
    // Handle special DFIR functions
    if (processedFormula.includes('TODAY()')) {
      const today = new Date();
      processedFormula = processedFormula.replace(/TODAY\(\)/g, today.getTime().toString());
    }

    // For complex formulas, try to evaluate using the formula engine
    if (getCell) {
      const result = evaluateFormula('=' + processedFormula, getCell);
      return Boolean(result);
    }

    // Fallback: simple evaluation
    return evaluateSimpleFormula(processedFormula, value, row, col, data);
  } catch (error) {
    console.warn('Conditional formatting formula evaluation failed:', error);
    return false;
  }
}

/**
 * Simple formula evaluation for common DFIR patterns
 */
function evaluateSimpleFormula(
  formula: string,
  value: any,
  _row: number,
  _col: number,
  _data: SparseMatrix<CellData>
): boolean {
  const stringValue = String(value);

  // IP address patterns
  if (formula.includes('NOT(OR(LEFT')) {
    // External IP detection
    const ip = stringValue;
    const privatePatterns = [
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^192\.168\./,
      /^127\./,
      /^169\.254\./
    ];
    return !privatePatterns.some(pattern => pattern.test(ip));
  }

  // Hash length detection
  if (formula.includes('OR(LEN')) {
    const len = stringValue.length;
    return len === 32 || len === 40 || len === 64; // MD5, SHA1, SHA256
  }

  // Duplicate detection (simplified)
  if (formula.includes('COUNTIF')) {
    let count = 0;
    _data.forEach((cellData: CellData) => {
      if (cellData.value === value) count++;
    });
    return count > 1;
  }

  // Default: try to parse as boolean expression
  try {
    // Very basic expression evaluation - in production, use a proper expression parser
    if (formula.includes('>') || formula.includes('<') || formula.includes('=')) {
      return eval(formula); // Note: Use proper expression parser in production
    }
  } catch {
    // Ignore evaluation errors
  }

  return false;
}

/**
 * Convert value to comparable format (number if possible, string otherwise)
 */
function convertToComparableValue(value: any): any {
  if (value === null || value === undefined) return 0;
  
  const numValue = Number(value);
  if (!isNaN(numValue)) return numValue;
  
  return String(value);
}

/**
 * Parse date from various formats
 */
function parseDate(value: any): Date | null {
  if (value instanceof Date) return value;
  
  const dateValue = new Date(value);
  return isNaN(dateValue.getTime()) ? null : dateValue;
}

/**
 * Parse rule date, handling special keywords like "TODAY()"
 */
function parseRuleDate(ruleValue: any): Date | null {
  if (!ruleValue) return null;
  
  const rule = String(ruleValue);
  
  // Handle TODAY() and relative dates
  if (rule.includes('TODAY()')) {
    const today = new Date();
    
    if (rule === 'TODAY()') {
      return today;
    }
    
    // Handle TODAY()-1, TODAY()+1, etc.
    const match = rule.match(/TODAY\(\)\s*([+-])\s*(\d+)/);
    if (match) {
      const operator = match[1];
      const days = parseInt(match[2]);
      const date = new Date(today);
      
      if (operator === '+') {
        date.setDate(date.getDate() + days);
      } else {
        date.setDate(date.getDate() - days);
      }
      
      return date;
    }
  }
  
  return parseDate(ruleValue);
}

/**
 * Apply conditional formatting to a cell's base format
 */
export function applyConditionalFormatting(
  baseFormat: CellFormat | undefined,
  conditionalFormat: CellFormat,
  shouldApply: boolean
): CellFormat {
  if (!shouldApply) {
    return baseFormat || {};
  }

  return {
    ...baseFormat,
    ...conditionalFormat,
    // Merge specific properties that might need special handling
    borders: conditionalFormat.borders || baseFormat?.borders,
  };
}

/**
 * Get all conditional formats that should be applied to a cell
 */
export function getApplicableConditionalFormats(
  value: any,
  row: number,
  col: number,
  data: SparseMatrix<CellData>,
  conditionalFormats: ConditionalFormat[],
  getCell?: (r: number, c: number) => CellData | undefined
): CellFormat[] {
  const applicableFormats: CellFormat[] = [];

  for (const rule of conditionalFormats) {
    if (evaluateConditionalFormat(value, rule, row, col, data, getCell)) {
      applicableFormats.push(rule.format);
    }
  }

  return applicableFormats;
}

/**
 * Combine multiple conditional formats with priority (later formats override earlier ones)
 */
export function combineConditionalFormats(
  baseFormat: CellFormat | undefined,
  conditionalFormats: CellFormat[]
): CellFormat {
  let combinedFormat = baseFormat || {};

  for (const conditionalFormat of conditionalFormats) {
    combinedFormat = {
      ...combinedFormat,
      ...conditionalFormat,
      // Special handling for borders - merge rather than replace
      borders: conditionalFormat.borders || combinedFormat.borders,
    };
  }

  return combinedFormat;
}

/**
 * DFIR-specific conditional formatting presets
 */
export const DFIR_CONDITIONAL_PRESETS = {
  // Severity-based coloring
  severityHighlight: {
    critical: { backgroundColor: '#dc3545', color: '#ffffff', bold: true },
    high: { backgroundColor: '#fd7e14', color: '#ffffff', bold: true },
    medium: { backgroundColor: '#ffc107', color: '#000000' },
    low: { backgroundColor: '#28a745', color: '#ffffff' },
    info: { backgroundColor: '#17a2b8', color: '#ffffff' }
  },

  // IOC type coloring
  iocTypeHighlight: {
    malware: { backgroundColor: '#ff1744', color: '#ffffff', bold: true },
    suspicious: { backgroundColor: '#ff9800', color: '#ffffff' },
    benign: { backgroundColor: '#4caf50', color: '#ffffff' },
    unknown: { backgroundColor: '#9e9e9e', color: '#ffffff' }
  },

  // Network traffic coloring
  networkTrafficHighlight: {
    internal: { backgroundColor: '#e3f2fd', color: '#0d47a1' },
    external: { backgroundColor: '#fff3e0', color: '#bf360c' },
    suspicious: { backgroundColor: '#ffebee', color: '#c62828', bold: true }
  },

  // File analysis coloring
  fileAnalysisHighlight: {
    executable: { backgroundColor: '#fce4ec', color: '#880e4f' },
    script: { backgroundColor: '#f3e5f5', color: '#4a148c' },
    document: { backgroundColor: '#e8f5e8', color: '#1b5e20' },
    archive: { backgroundColor: '#fff8e1', color: '#f57f17' }
  }
};