/*
 * Value model shared by the parser, evaluator and function library. Errors
 * travel as their spreadsheet-visible strings, so a cell that literally holds
 * "#REF!" (which is what a row deletion writes into a formula) behaves like an
 * error too.
 */

export const FORMULA_ERRORS = [
  '#DIV/0!',
  '#VALUE!',
  '#NAME?',
  '#REF!',
  '#CYCLE!',
  '#N/A',
  '#NUM!',
  '#ERROR!',
] as const;

export type FormulaError = (typeof FORMULA_ERRORS)[number];

const ERROR_SET: ReadonlySet<string> = new Set<string>(FORMULA_ERRORS);

export const isFormulaError = (value: unknown): value is FormulaError =>
  typeof value === 'string' && ERROR_SET.has(value);

export type ScalarValue = number | string | boolean | Date | null;

export interface RangeValue {
  readonly kind: 'range';
  readonly rows: number;
  readonly cols: number;
  readonly values: readonly ScalarValue[];
}

export type Value = ScalarValue | RangeValue;

export const isRange = (value: Value): value is RangeValue =>
  typeof value === 'object' && value !== null && !(value instanceof Date);

// A one-cell range stands in for its cell wherever a scalar is expected
export const toScalar = (value: Value): ScalarValue => {
  if (!isRange(value)) return value;
  return value.values.length === 1 ? value.values[0] : '#VALUE!';
};

const MS_PER_DAY = 86_400_000;
const SERIAL_EPOCH = Date.UTC(1899, 11, 30);

// Excel serial day number, built from local calendar fields so that local
// midnight lands on a whole number
export const dateToSerial = (date: Date): number =>
  (Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
    date.getMilliseconds()
  ) -
    SERIAL_EPOCH) /
  MS_PER_DAY;

const NUMERIC_TEXT = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

export const parseNumericText = (text: string): number | null => {
  const trimmed = text.trim();
  return trimmed !== '' && NUMERIC_TEXT.test(trimmed) ? Number(trimmed) : null;
};

export const finite = (n: number): number | FormulaError => (Number.isFinite(n) ? n : '#NUM!');

export const toNumber = (value: ScalarValue): number | FormulaError => {
  if (value === null) return 0;
  if (typeof value === 'number') return finite(value);
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Date) return dateToSerial(value);
  if (isFormulaError(value)) return value;
  const n = parseNumericText(value);
  return n === null ? '#VALUE!' : n;
};

// 15 significant digits, the precision spreadsheets display, so 0.1+0.2 reads as 0.3
export const numberToText = (n: number): string => String(Number(n.toPrecision(15)));

export const toText = (value: ScalarValue): string => {
  if (value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (value instanceof Date) return numberToText(dateToSerial(value));
  return numberToText(value);
};

export const toBoolean = (value: ScalarValue): boolean | FormulaError => {
  if (value === null) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (value instanceof Date) return true;
  if (isFormulaError(value)) return value;
  const upper = value.trim().toUpperCase();
  if (upper === 'TRUE') return true;
  if (upper === 'FALSE') return false;
  return '#VALUE!';
};

// Ordering between types: numbers (and dates) < text < booleans
export const typeRank = (value: NonNullable<ScalarValue>): 0 | 1 | 2 =>
  typeof value === 'string' ? 1 : typeof value === 'boolean' ? 2 : 0;

const blankAs = (other: NonNullable<ScalarValue>): NonNullable<ScalarValue> =>
  typeof other === 'string' ? '' : typeof other === 'boolean' ? false : 0;

const order = (x: number | string, y: number | string): -1 | 0 | 1 =>
  x < y ? -1 : x > y ? 1 : 0;

// Callers screen error values first; text compares case-insensitively
export const compareValues = (a: ScalarValue, b: ScalarValue): -1 | 0 | 1 => {
  if (a === null) return b === null ? 0 : compareValues(blankAs(b), b);
  if (b === null) return compareValues(a, blankAs(a));
  if (typeof a === 'string') {
    if (typeof b === 'string') return order(a.toLowerCase(), b.toLowerCase());
    return typeof b === 'boolean' ? -1 : 1;
  }
  if (typeof a === 'boolean') {
    return typeof b === 'boolean' ? order(Number(a), Number(b)) : 1;
  }
  if (typeof b === 'string' || typeof b === 'boolean') return -1;
  const x = a instanceof Date ? dateToSerial(a) : a;
  const y = b instanceof Date ? dateToSerial(b) : b;
  return order(x, y);
};
