import { FilterRule, CellData, SparseMatrix, keyOf } from '../types/spreadsheet';

/**
 * Apply filter rules to determine which rows should be hidden
 */
export function applyFilters(
  data: SparseMatrix<CellData>,
  filters: FilterRule[],
  maxRows: number,
  _maxCols: number
): Set<number> {
  const hiddenRows = new Set<number>();

  if (!filters.length) {
    return hiddenRows;
  }

  // Check each row against all filter rules
  for (let row = 0; row < maxRows; row++) {
    let shouldHide = false;

    // All filter rules must pass (AND logic)
    for (const filter of filters) {
      const cellKey = keyOf(row, filter.column);
      const cellData = data.get(cellKey);
      const value = cellData?.value;

      if (!evaluateFilterRule(value, filter)) {
        shouldHide = true;
        break; // If any filter fails, hide the row
      }
    }

    if (shouldHide) {
      hiddenRows.add(row);
    }
  }

  return hiddenRows;
}

/**
 * Evaluate a single filter rule against a cell value
 */
export function evaluateFilterRule(value: any, rule: FilterRule): boolean {
  if (rule.customFunction) {
    return rule.customFunction(value);
  }

  // Handle empty/null values
  const isEmpty = value === null || value === undefined || value === '';
  
  switch (rule.condition) {
    case 'isEmpty':
      return isEmpty;
    case 'isNotEmpty':
      return !isEmpty;
  }

  // If value is empty and condition isn't isEmpty/isNotEmpty, it fails most conditions
  if (isEmpty && rule.condition !== 'isEmpty' && rule.condition !== 'isNotEmpty') {
    return rule.condition === 'notEquals' || rule.condition === 'notContains';
  }

  const stringValue = String(value);
  const ruleValue = String(rule.value || '');
  
  // Apply case sensitivity for text comparisons
  const compareValue = rule.caseSensitive ? stringValue : stringValue.toLowerCase();
  const compareRuleValue = rule.caseSensitive ? ruleValue : ruleValue.toLowerCase();

  switch (rule.condition) {
    case 'equals':
      if (rule.type === 'number') {
        return Number(value) === Number(rule.value);
      } else if (rule.type === 'date') {
        return new Date(value).getTime() === new Date(rule.value).getTime();
      }
      return compareValue === compareRuleValue;

    case 'notEquals':
      if (rule.type === 'number') {
        return Number(value) !== Number(rule.value);
      } else if (rule.type === 'date') {
        return new Date(value).getTime() !== new Date(rule.value).getTime();
      }
      return compareValue !== compareRuleValue;

    case 'contains':
      return compareValue.includes(compareRuleValue);

    case 'notContains':
      return !compareValue.includes(compareRuleValue);

    case 'startsWith':
      return compareValue.startsWith(compareRuleValue);

    case 'endsWith':
      return compareValue.endsWith(compareRuleValue);

    case 'greaterThan':
      if (rule.type === 'number') {
        return Number(value) > Number(rule.value);
      } else if (rule.type === 'date') {
        return new Date(value).getTime() > new Date(rule.value).getTime();
      }
      return stringValue > ruleValue;

    case 'lessThan':
      if (rule.type === 'number') {
        return Number(value) < Number(rule.value);
      } else if (rule.type === 'date') {
        return new Date(value).getTime() < new Date(rule.value).getTime();
      }
      return stringValue < ruleValue;

    case 'greaterEqual':
      if (rule.type === 'number') {
        return Number(value) >= Number(rule.value);
      } else if (rule.type === 'date') {
        return new Date(value).getTime() >= new Date(rule.value).getTime();
      }
      return stringValue >= ruleValue;

    case 'lessEqual':
      if (rule.type === 'number') {
        return Number(value) <= Number(rule.value);
      } else if (rule.type === 'date') {
        return new Date(value).getTime() <= new Date(rule.value).getTime();
      }
      return stringValue <= ruleValue;

    case 'between':
      if (rule.type === 'number') {
        const numValue = Number(value);
        return numValue >= Number(rule.value) && numValue <= Number(rule.value2);
      } else if (rule.type === 'date') {
        const dateValue = new Date(value).getTime();
        return dateValue >= new Date(rule.value).getTime() && 
               dateValue <= new Date(rule.value2).getTime();
      }
      return stringValue >= ruleValue && stringValue <= String(rule.value2 || '');

    case 'notBetween':
      if (rule.type === 'number') {
        const numValue = Number(value);
        return !(numValue >= Number(rule.value) && numValue <= Number(rule.value2));
      } else if (rule.type === 'date') {
        const dateValue = new Date(value).getTime();
        return !(dateValue >= new Date(rule.value).getTime() && 
                dateValue <= new Date(rule.value2).getTime());
      }
      return !(stringValue >= ruleValue && stringValue <= String(rule.value2 || ''));

    case 'isTrue':
      return Boolean(value) === true;

    case 'isFalse':
      return Boolean(value) === false;

    default:
      return true;
  }
}

/**
 * Sort data by column
 */
export function sortData(
  data: SparseMatrix<CellData>,
  column: number,
  direction: 'asc' | 'desc',
  maxRows: number,
  hiddenRows: Set<number> = new Set()
): number[] {
  // Get all visible row indices with their values
  const rowValues: { row: number; value: any }[] = [];
  
  for (let row = 0; row < maxRows; row++) {
    if (hiddenRows.has(row)) continue;
    
    const cellKey = keyOf(row, column);
    const cellData = data.get(cellKey);
    const value = cellData?.value ?? '';
    
    rowValues.push({ row, value });
  }

  // Sort the rows
  rowValues.sort((a, b) => {
    let aVal = a.value;
    let bVal = b.value;

    // Handle numbers
    if (!isNaN(Number(aVal)) && !isNaN(Number(bVal))) {
      aVal = Number(aVal);
      bVal = Number(bVal);
    } 
    // Handle dates
    else if (isDateString(String(aVal)) && isDateString(String(bVal))) {
      aVal = new Date(aVal).getTime();
      bVal = new Date(bVal).getTime();
    }
    // Handle strings (case-insensitive)
    else {
      aVal = String(aVal).toLowerCase();
      bVal = String(bVal).toLowerCase();
    }

    if (aVal < bVal) return direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return direction === 'asc' ? 1 : -1;
    return 0;
  });

  return rowValues.map(item => item.row);
}

/**
 * Get unique values from a column for filter dropdown
 */
export function getColumnUniqueValues(
  data: SparseMatrix<CellData>,
  column: number,
  maxRows: number
): { value: any; count: number }[] {
  const valueMap = new Map<string, { value: any; count: number }>();

  for (let row = 0; row < maxRows; row++) {
    const cellKey = keyOf(row, column);
    const cellData = data.get(cellKey);
    const value = cellData?.value ?? '';
    const stringKey = String(value);

    if (valueMap.has(stringKey)) {
      valueMap.get(stringKey)!.count++;
    } else {
      valueMap.set(stringKey, { value, count: 1 });
    }
  }

  return Array.from(valueMap.values())
    .sort((a, b) => {
      // Sort by value, handling different types
      const aVal = a.value;
      const bVal = b.value;
      
      if (!isNaN(Number(aVal)) && !isNaN(Number(bVal))) {
        return Number(aVal) - Number(bVal);
      }
      
      return String(aVal).localeCompare(String(bVal));
    });
}

/**
 * DFIR-specific filter presets for common incident response scenarios
 */
export const DFIR_FILTER_PRESETS = {
  // IOC Filtering
  maliciousIPs: (value: any): boolean => {
    const ip = String(value);
    // Check against common malicious IP patterns (simplified)
    return /^(10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.|127\.)/.test(ip) === false &&
           /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip);
  },

  suspiciousFileExtensions: (value: any): boolean => {
    const filename = String(value).toLowerCase();
    const suspiciousExtensions = ['.exe', '.scr', '.bat', '.cmd', '.pif', '.com', '.vbs', '.js', '.jar', '.ps1'];
    return suspiciousExtensions.some(ext => filename.endsWith(ext));
  },

  recentActivity: (value: any): boolean => {
    const date = new Date(value);
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return date > twentyFourHoursAgo;
  },

  highSeverity: (value: any): boolean => {
    const severity = String(value).toLowerCase();
    return ['critical', 'high', 'severe'].includes(severity);
  },

  suspiciousProcessNames: (value: any): boolean => {
    const processName = String(value).toLowerCase();
    const suspiciousNames = [
      'powershell.exe', 'cmd.exe', 'rundll32.exe', 'regsvr32.exe', 
      'mshta.exe', 'wscript.exe', 'cscript.exe', 'psexec.exe'
    ];
    return suspiciousNames.some(name => processName.includes(name));
  },

  // Hash Validation
  validMD5: (value: any): boolean => {
    return /^[a-fA-F0-9]{32}$/.test(String(value));
  },

  validSHA1: (value: any): boolean => {
    return /^[a-fA-F0-9]{40}$/.test(String(value));
  },

  validSHA256: (value: any): boolean => {
    return /^[a-fA-F0-9]{64}$/.test(String(value));
  },

  // Network Analysis
  externalConnections: (value: any): boolean => {
    const ip = String(value);
    // Filter for external IPs (not private/local)
    return !/^(10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.|127\.|169\.254\.)/.test(ip);
  },

  suspiciousPorts: (value: any): boolean => {
    const port = Number(value);
    const suspiciousPorts = [4444, 5555, 6666, 7777, 8080, 9999, 31337, 12345];
    return suspiciousPorts.includes(port);
  }
};

/**
 * Helper function to detect date strings
 */
function isDateString(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  
  const datePatterns = [
    /^\d{4}-\d{2}-\d{2}/, // YYYY-MM-DD
    /^\d{1,2}\/\d{1,2}\/\d{4}/, // MM/DD/YYYY or M/D/YYYY
    /^\d{1,2}-\d{1,2}-\d{4}/, // MM-DD-YYYY
  ];

  return datePatterns.some(pattern => pattern.test(value)) && !isNaN(Date.parse(value));
}

/**
 * Create filter rule from simple parameters
 */
export function createFilterRule(
  column: number,
  condition: FilterRule['condition'],
  value: any,
  type: FilterRule['type'] = 'text',
  options?: Partial<FilterRule>
): FilterRule {
  return {
    column,
    type,
    condition,
    value,
    caseSensitive: false,
    ...options
  };
}

/**
 * Quick filters for common DFIR scenarios
 */
export function createDFIRFilter(preset: keyof typeof DFIR_FILTER_PRESETS, column: number): FilterRule {
  return {
    column,
    type: 'custom',
    condition: 'equals', // Not used for custom functions
    customFunction: DFIR_FILTER_PRESETS[preset]
  };
}