import { applyFilters, evaluateFilterRule, sortData, getColumnUniqueValues, createFilterRule } from '../utils/filterUtils';
import { CellData, CellValue, FilterRule, keyOf } from '../types/spreadsheet';

// One column of values, row by row; `undefined` leaves the cell out entirely
const column = (col: number, values: Array<CellValue | undefined>, into = new Map<string, CellData>()) => {
  values.forEach((value, row) => {
    if (value !== undefined) into.set(keyOf(row, col), { value });
  });
  return into;
};

const rule = (condition: FilterRule['condition'], value?: unknown, extra: Partial<FilterRule> = {}): FilterRule =>
  ({ column: 0, type: 'text', condition, value, ...extra });

describe('filterUtils', () => {
  describe('applyFilters', () => {
    it('hides nothing when there are no filters', () => {
      expect(applyFilters(column(0, ['a']), [], 5, 1).size).toBe(0);
    });

    it('hides rows failing any rule (rules are ANDed)', () => {
      const data = column(0, ['apple', 'avocado', 'banana', 'apricot']);
      column(1, [10, 3, 20, 8], data);
      const hidden = applyFilters(
        data,
        [rule('startsWith', 'a'), rule('greaterThan', 5, { column: 1, type: 'number' })],
        4,
        2
      );
      expect(Array.from(hidden).sort()).toEqual([1, 2]);
    });

    it('treats missing cells as empty values', () => {
      const data = column(0, ['x', undefined, 'y']);
      expect(Array.from(applyFilters(data, [rule('isEmpty')], 3, 1))).toEqual([0, 2]);
      expect(Array.from(applyFilters(data, [rule('isNotEmpty')], 3, 1))).toEqual([1]);
    });
  });

  describe('evaluateFilterRule', () => {
    it('lets a custom function decide on its own', () => {
      const custom = rule('equals', 'ignored', { customFunction: (v) => v === 42 });
      expect(evaluateFilterRule(42, custom)).toBe(true);
      expect(evaluateFilterRule('ignored', custom)).toBe(false);
    });

    it('isEmpty and isNotEmpty treat null, undefined and the empty string as empty', () => {
      for (const empty of [null, undefined, '']) {
        expect(evaluateFilterRule(empty, rule('isEmpty'))).toBe(true);
        expect(evaluateFilterRule(empty, rule('isNotEmpty'))).toBe(false);
      }
      expect(evaluateFilterRule(0, rule('isEmpty'))).toBe(false);
      expect(evaluateFilterRule('x', rule('isNotEmpty'))).toBe(true);
    });

    it('empty values only satisfy the negative conditions', () => {
      expect(evaluateFilterRule('', rule('notEquals', 'a'))).toBe(true);
      expect(evaluateFilterRule(null, rule('notContains', 'a'))).toBe(true);
      expect(evaluateFilterRule('', rule('equals', ''))).toBe(false);
      expect(evaluateFilterRule('', rule('contains', ''))).toBe(false);
      expect(evaluateFilterRule(undefined, rule('greaterThan', 0, { type: 'number' }))).toBe(false);
    });

    it('equals and notEquals compare text case-insensitively unless asked otherwise', () => {
      expect(evaluateFilterRule('Hello', rule('equals', 'hello'))).toBe(true);
      expect(evaluateFilterRule('Hello', rule('equals', 'hello', { caseSensitive: true }))).toBe(false);
      expect(evaluateFilterRule('Hello', rule('notEquals', 'hello'))).toBe(false);
      expect(evaluateFilterRule('Hello', rule('notEquals', 'hello', { caseSensitive: true }))).toBe(true);
    });

    it('equals and notEquals compare numbers and dates by value', () => {
      expect(evaluateFilterRule('5', rule('equals', 5, { type: 'number' }))).toBe(true);
      expect(evaluateFilterRule(5, rule('notEquals', '5', { type: 'number' }))).toBe(false);
      expect(evaluateFilterRule(new Date('2024-01-15'), rule('equals', '2024-01-15', { type: 'date' }))).toBe(true);
      expect(evaluateFilterRule('2024-01-16', rule('notEquals', '2024-01-15', { type: 'date' }))).toBe(true);
    });

    it('contains, notContains, startsWith and endsWith match substrings', () => {
      expect(evaluateFilterRule('Spreadsheet', rule('contains', 'SHEET'))).toBe(true);
      expect(evaluateFilterRule('Spreadsheet', rule('contains', 'SHEET', { caseSensitive: true }))).toBe(false);
      expect(evaluateFilterRule('Spreadsheet', rule('notContains', 'grid'))).toBe(true);
      expect(evaluateFilterRule('Spreadsheet', rule('startsWith', 'spread'))).toBe(true);
      expect(evaluateFilterRule('Spreadsheet', rule('startsWith', 'sheet'))).toBe(false);
      expect(evaluateFilterRule('Spreadsheet', rule('endsWith', 'sheet'))).toBe(true);
      expect(evaluateFilterRule(12345, rule('endsWith', '45'))).toBe(true);
    });

    it('orders numbers numerically for the comparison conditions', () => {
      const num = (condition: FilterRule['condition'], value: number) => rule(condition, value, { type: 'number' });
      expect(evaluateFilterRule(10, num('greaterThan', 9))).toBe(true);
      expect(evaluateFilterRule('10', num('greaterThan', 9))).toBe(true);
      expect(evaluateFilterRule(9, num('greaterThan', 9))).toBe(false);
      expect(evaluateFilterRule(9, num('greaterEqual', 9))).toBe(true);
      expect(evaluateFilterRule(8, num('lessThan', 9))).toBe(true);
      expect(evaluateFilterRule(9, num('lessThan', 9))).toBe(false);
      expect(evaluateFilterRule(9, num('lessEqual', 9))).toBe(true);
    });

    it('orders dates chronologically for the comparison conditions', () => {
      const date = (condition: FilterRule['condition'], value: string) => rule(condition, value, { type: 'date' });
      expect(evaluateFilterRule('2024-02-01', date('greaterThan', '2024-01-31'))).toBe(true);
      expect(evaluateFilterRule('2024-01-01', date('greaterEqual', '2024-01-01'))).toBe(true);
      expect(evaluateFilterRule('2023-12-31', date('lessThan', '2024-01-01'))).toBe(true);
      expect(evaluateFilterRule('2024-01-01', date('lessEqual', '2024-01-01'))).toBe(true);
      expect(evaluateFilterRule('2024-01-02', date('lessThan', '2024-01-01'))).toBe(false);
    });

    it('orders text lexicographically for the comparison conditions', () => {
      expect(evaluateFilterRule('b', rule('greaterThan', 'a'))).toBe(true);
      expect(evaluateFilterRule('a', rule('greaterEqual', 'a'))).toBe(true);
      expect(evaluateFilterRule('a', rule('lessThan', 'b'))).toBe(true);
      expect(evaluateFilterRule('b', rule('lessEqual', 'a'))).toBe(false);
    });

    it('between and notBetween are inclusive for numbers, dates and text', () => {
      const num = rule('between', 5, { type: 'number', value2: 10 });
      expect(evaluateFilterRule(5, num)).toBe(true);
      expect(evaluateFilterRule(10, num)).toBe(true);
      expect(evaluateFilterRule(11, num)).toBe(false);
      expect(evaluateFilterRule(11, { ...num, condition: 'notBetween' })).toBe(true);
      expect(evaluateFilterRule(7, { ...num, condition: 'notBetween' })).toBe(false);

      const date = rule('between', '2024-01-01', { type: 'date', value2: '2024-01-31' });
      expect(evaluateFilterRule('2024-01-15', date)).toBe(true);
      expect(evaluateFilterRule('2024-02-01', date)).toBe(false);
      expect(evaluateFilterRule('2024-02-01', { ...date, condition: 'notBetween' })).toBe(true);

      const text = rule('between', 'b', { value2: 'd' });
      expect(evaluateFilterRule('c', text)).toBe(true);
      expect(evaluateFilterRule('e', text)).toBe(false);
      expect(evaluateFilterRule('e', { ...text, condition: 'notBetween' })).toBe(true);
    });

    it('isTrue and isFalse coerce the value to a boolean', () => {
      expect(evaluateFilterRule(true, rule('isTrue', undefined, { type: 'boolean' }))).toBe(true);
      expect(evaluateFilterRule('yes', rule('isTrue', undefined, { type: 'boolean' }))).toBe(true);
      expect(evaluateFilterRule(0, rule('isTrue', undefined, { type: 'boolean' }))).toBe(false);
      expect(evaluateFilterRule(false, rule('isFalse', undefined, { type: 'boolean' }))).toBe(true);
      expect(evaluateFilterRule(1, rule('isFalse', undefined, { type: 'boolean' }))).toBe(false);
    });

    it('passes values through for an unknown condition', () => {
      expect(evaluateFilterRule('x', rule('someday' as FilterRule['condition'], 'y'))).toBe(true);
    });
  });

  describe('sortData', () => {
    it('sorts numbers ascending and descending', () => {
      const data = column(0, [10, 2, 33]);
      expect(sortData(data, 0, 'asc', 3)).toEqual([1, 0, 2]);
      expect(sortData(data, 0, 'desc', 3)).toEqual([2, 0, 1]);
    });

    it('compares numeric strings as numbers', () => {
      expect(sortData(column(0, ['10', '9']), 0, 'asc', 2)).toEqual([1, 0]);
    });

    it('compares ISO date strings chronologically', () => {
      const data = column(0, ['2024-03-01', '2023-12-31', '2024-01-15T09:00']);
      expect(sortData(data, 0, 'asc', 3)).toEqual([1, 2, 0]);
      expect(sortData(data, 0, 'desc', 3)).toEqual([0, 2, 1]);
    });

    it('compares text case-insensitively', () => {
      expect(sortData(column(0, ['banana', 'Apple', 'cherry']), 0, 'asc', 3)).toEqual([1, 0, 2]);
    });

    it('sorts missing cells first and leaves hidden rows out', () => {
      const data = column(0, [5, undefined, 3]);
      expect(sortData(data, 0, 'asc', 3)).toEqual([1, 2, 0]);
      expect(sortData(data, 0, 'asc', 3, new Set([1]))).toEqual([2, 0]);
    });
  });

  describe('getColumnUniqueValues', () => {
    it('counts occurrences and sorts numbers before text', () => {
      const data = column(0, [3, 1, 3, 'b', 'a']);
      expect(getColumnUniqueValues(data, 0, 5)).toEqual([
        { value: 1, count: 1 },
        { value: 3, count: 2 },
        { value: 'a', count: 1 },
        { value: 'b', count: 1 },
      ]);
    });

    it('counts blank rows as the empty value', () => {
      const data = column(0, ['x']);
      expect(getColumnUniqueValues(data, 0, 3)).toEqual([
        { value: '', count: 2 },
        { value: 'x', count: 1 },
      ]);
    });
  });

  describe('createFilterRule', () => {
    it('defaults to a case-insensitive text rule', () => {
      expect(createFilterRule(2, 'contains', 'x')).toEqual({
        column: 2,
        type: 'text',
        condition: 'contains',
        value: 'x',
        caseSensitive: false,
      });
    });

    it('accepts a type and extra options', () => {
      expect(createFilterRule(0, 'between', 1, 'number', { value2: 9, caseSensitive: true })).toEqual({
        column: 0,
        type: 'number',
        condition: 'between',
        value: 1,
        value2: 9,
        caseSensitive: true,
      });
    });
  });
});
