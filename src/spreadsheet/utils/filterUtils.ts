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

  // If value is empty, it fails most conditions (isEmpty/isNotEmpty already returned above)
  if (isEmpty) {
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

const DATE_LIKE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?)?/;

const isDateString = (value: string): boolean =>
  DATE_LIKE.test(value) && !Number.isNaN(new Date(value).getTime());

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
