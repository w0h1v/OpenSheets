import { ConditionalFormat, CellFormat, SparseMatrix, CellData, keyOf } from '../types/spreadsheet';
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
    case 'contains': {
      // Support multiple values separated by commas
      const searchTerms = ruleText.split(',').map(term => term.trim());
      return searchTerms.some(term => textValue.includes(term));
    }
    
    case 'notContains':
      return !textValue.includes(ruleText);
    
    case 'equal':
      return textValue === ruleText;
    
    case 'notEqual':
      return textValue !== ruleText;
    
    case 'startsWith':
      return textValue.startsWith(ruleText);
    
    case 'endsWith': {
      // Support multiple extensions separated by commas
      const extensions = ruleText.split(',').map(ext => ext.trim());
      return extensions.some(ext => textValue.endsWith(ext));
    }
    
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
    
    case 'between': {
      const ruleDate2 = parseRuleDate(rule.value2);
      return ruleDate2 ? (dateValue >= ruleDate && dateValue <= ruleDate2) : false;
    }
    
    default:
      return false;
  }
}

/**
 * Formula conditions are spreadsheet formulas evaluated against the tested
 * cell; `value`, `row` and `col` in the rule stand for that cell. Anything
 * the evaluator rejects, or that yields an error value, is no match.
 */
function evaluateFormulaCondition(
  value: any,
  rule: ConditionalFormat,
  row: number,
  col: number,
  data: SparseMatrix<CellData>,
  getCell?: (r: number, c: number) => CellData | undefined
): boolean {
  const formula = rule.value1;
  if (typeof formula !== 'string' || !formula.trim()) return false;
  const literal = typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : `"${String(value ?? '').replace(/"/g, '""')}"`;
  const expression = formula
    .replace(/^=/, '')
    .replace(/\bvalue\b/g, literal)
    .replace(/\brow\b/g, String(row + 1))
    .replace(/\bcol\b/g, String(col + 1));
  const lookup = getCell ?? ((r: number, c: number) => data.get(keyOf(r, c)));
  try {
    const result = evaluateFormula('=' + expression, lookup);
    if (typeof result === 'string' && result.startsWith('#')) return false;
    return Boolean(result);
  } catch {
    return false;
  }
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
