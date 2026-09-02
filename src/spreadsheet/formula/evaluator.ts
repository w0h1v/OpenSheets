/*
 * Formula evaluation over a parsed AST. Nothing here ever executes formula
 * text as code: the tokenizer, parser and this interpreter are the whole
 * pipeline, and formulas from other collaborators can only ever read cells.
 *
 * Semantics
 * - Values are numbers, text, booleans, Dates, empty (null) or one of the
 *   error strings in FORMULA_ERRORS. Errors propagate through every operator
 *   and function except IFERROR, the IS* predicates and COUNT.
 * - Arithmetic coerces numeric-looking text and booleans (TRUE = 1) to
 *   numbers and anything else is #VALUE!; empty cells are 0 in arithmetic and
 *   "" in text. Dates take part as Excel serial day numbers. Division by zero
 *   is #DIV/0!, and any non-finite result is #NUM!.
 * - "&" joins the text form of both sides. "%" divides by 100. "^" is
 *   exponentiation (right-associative). Comparisons are numeric for numbers,
 *   case-insensitive for text, and across types follow numbers < text <
 *   booleans; an empty cell compares as 0, "" or FALSE to match the other side.
 * - Cell values that are numeric-looking text are treated as numbers, because
 *   in-grid editing stores what was typed; an empty string is an empty cell.
 * - A range where a scalar is required is #VALUE!; a single cell passed to a
 *   function behaves as a one-cell range, so SUM(A1) ignores text in A1 the
 *   way SUM(A1:A1) does. Aggregates skip empty cells; COUNTA counts anything
 *   non-empty.
 * - Unknown function or bare name is #NAME?, wrong argument count is #VALUE!,
 *   malformed formula text is #ERROR!. Formulas over 8 kB, ranges over
 *   250,000 cells (#REF!) and more than 1,000,000 cell reads per evaluation
 *   are refused. A formula cell referenced while it is already being
 *   evaluated is #CYCLE!, with a depth cap as a backstop.
 * - Sheet-qualified references resolve through the sheet registry; an
 *   unregistered sheet is #REF!. Formulas found in another sheet's cells
 *   resolve their own references against that sheet.
 * - TODAY() and NOW() return Date objects for the renderer to format.
 */

import { getSheetData } from '../utils/sheetRegistry';
import { getFunction } from './functions';
import { BinaryOperator, Expr, parseFormula } from './parser';
import { FormulaSyntaxError, RangeRef } from './tokenizer';
import {
  FormulaError,
  ScalarValue,
  Value,
  compareValues,
  finite,
  isFormulaError,
  parseNumericText,
  toNumber,
  toScalar,
  toText,
} from './values';

export type CellAccessor = (row: number, col: number) => unknown;

export type FormulaResult = number | string | boolean | Date;

const MAX_FORMULA_LENGTH = 8192;
const MAX_RANGE_CELLS = 250_000;
const MAX_CELL_READS = 1_000_000;
const MAX_DEPTH = 100;
const AST_CACHE_LIMIT = 500;

type ParseEntry = { readonly ast: Expr } | { readonly error: string };

// Insertion order doubles as recency: hits are re-inserted, evictions take the head
const astCache = new Map<string, ParseEntry>();

const parseCached = (source: string): ParseEntry => {
  const hit = astCache.get(source);
  if (hit) {
    astCache.delete(source);
    astCache.set(source, hit);
    return hit;
  }
  let entry: ParseEntry;
  try {
    entry = { ast: parseFormula(source) };
  } catch (err) {
    if (!(err instanceof FormulaSyntaxError)) throw err;
    entry = { error: err.message };
  }
  if (astCache.size >= AST_CACHE_LIMIT) {
    const oldest = astCache.keys().next();
    if (!oldest.done) astCache.delete(oldest.value);
  }
  astCache.set(source, entry);
  return entry;
};

interface SheetScope {
  readonly label: string;
  readonly read: CellAccessor;
}

interface EvalState {
  readonly chain: Set<string>;
  readonly memo: Map<string, ScalarValue>;
  depth: number;
  cellReads: number;
}

interface CellLike {
  readonly value?: unknown;
  readonly formula?: unknown;
}

const isCellLike = (raw: unknown): raw is CellLike =>
  typeof raw === 'object' && raw !== null && !Array.isArray(raw) && !(raw instanceof Date) && 'value' in raw;

const normalizeCellValue = (raw: unknown): ScalarValue => {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : '#NUM!';
  if (typeof raw === 'boolean') return raw;
  if (raw instanceof Date) return raw;
  if (typeof raw === 'string') {
    if (raw === '') return null;
    return parseNumericText(raw) ?? raw;
  }
  if (typeof raw === 'bigint') return Number(raw);
  return '#VALUE!';
};

const resolveScope = (sheet: string | null, scope: SheetScope): SheetScope | FormulaError => {
  if (sheet === null) return scope;
  const data = getSheetData(sheet);
  if (!data) return '#REF!';
  return { label: sheet, read: (row, col) => data.get(`${row}:${col}`) };
};

const evaluateCellFormula = (
  formula: string,
  scope: SheetScope,
  row: number,
  col: number,
  state: EvalState
): ScalarValue => {
  const key = `${scope.label}!${row}:${col}`;
  const memoized = state.memo.get(key);
  if (memoized !== undefined) return memoized;
  if (state.chain.has(key) || state.depth >= MAX_DEPTH) return '#CYCLE!';
  if (formula.length > MAX_FORMULA_LENGTH) return '#ERROR!';
  state.chain.add(key);
  state.depth++;
  let value: ScalarValue;
  try {
    value = toScalar(evaluateSource(formula.slice(1), scope, state));
  } finally {
    state.chain.delete(key);
    state.depth--;
  }
  state.memo.set(key, value);
  return value;
};

const readCell = (scope: SheetScope, row: number, col: number, state: EvalState): ScalarValue => {
  const raw = scope.read(row, col);
  if (isCellLike(raw)) {
    if (typeof raw.formula === 'string' && raw.formula.startsWith('=')) {
      return evaluateCellFormula(raw.formula, scope, row, col, state);
    }
    return normalizeCellValue(raw.value);
  }
  return normalizeCellValue(raw);
};

const readRange = (ref: RangeRef, scope: SheetScope, state: EvalState): Value => {
  const target = resolveScope(ref.sheet, scope);
  if (isFormulaError(target)) return target;
  const rows = ref.endRow - ref.startRow + 1;
  const cols = ref.endCol - ref.startCol + 1;
  const size = rows * cols;
  if (size > MAX_RANGE_CELLS || state.cellReads + size > MAX_CELL_READS) return '#REF!';
  state.cellReads += size;
  const values: ScalarValue[] = new Array(size);
  let i = 0;
  for (let r = ref.startRow; r <= ref.endRow; r++) {
    for (let c = ref.startCol; c <= ref.endCol; c++) {
      values[i++] = readCell(target, r, c, state);
    }
  }
  return { kind: 'range', rows, cols, values };
};

type ArithmeticOperator = '+' | '-' | '*' | '/' | '^';

const ARITHMETIC: Record<ArithmeticOperator, (x: number, y: number) => Value> = {
  '+': (x, y) => finite(x + y),
  '-': (x, y) => finite(x - y),
  '*': (x, y) => finite(x * y),
  '/': (x, y) => (y === 0 ? '#DIV/0!' : finite(x / y)),
  '^': (x, y) => finite(Math.pow(x, y)),
};

const COMPARISON: Record<Exclude<BinaryOperator, ArithmeticOperator | '&'>, (order: number) => boolean> = {
  '=': (order) => order === 0,
  '<>': (order) => order !== 0,
  '<': (order) => order < 0,
  '>': (order) => order > 0,
  '<=': (order) => order <= 0,
  '>=': (order) => order >= 0,
};

const isArithmetic = (op: BinaryOperator): op is ArithmeticOperator => op in ARITHMETIC;

const evaluateBinary = (op: BinaryOperator, leftValue: Value, rightValue: Value): Value => {
  const left = toScalar(leftValue);
  if (isFormulaError(left)) return left;
  const right = toScalar(rightValue);
  if (isFormulaError(right)) return right;
  if (op === '&') return toText(left) + toText(right);
  if (isArithmetic(op)) {
    const x = toNumber(left);
    if (isFormulaError(x)) return x;
    const y = toNumber(right);
    if (isFormulaError(y)) return y;
    return ARITHMETIC[op](x, y);
  }
  return COMPARISON[op](compareValues(left, right));
};

const evaluateNode = (node: Expr, scope: SheetScope, state: EvalState): Value => {
  switch (node.type) {
    case 'number':
      return finite(node.value);
    case 'string':
    case 'boolean':
    case 'error':
      return node.value;
    case 'name':
      return '#NAME?';
    case 'cell': {
      const target = resolveScope(node.ref.sheet, scope);
      if (isFormulaError(target)) return target;
      return readCell(target, node.ref.row, node.ref.col, state);
    }
    case 'range':
      return readRange(node.ref, scope, state);
    case 'unary': {
      const operand = evaluateNode(node.operand, scope, state);
      if (node.op === '+') return operand;
      const n = toNumber(toScalar(operand));
      return isFormulaError(n) ? n : finite(-n);
    }
    case 'percent': {
      const n = toNumber(toScalar(evaluateNode(node.operand, scope, state)));
      return isFormulaError(n) ? n : finite(n / 100);
    }
    case 'binary':
      return evaluateBinary(
        node.op,
        evaluateNode(node.left, scope, state),
        evaluateNode(node.right, scope, state)
      );
    case 'call':
      return evaluateCall(node.name, node.args, scope, state);
  }
};

// A direct cell argument becomes a one-cell range so functions can tell cell
// contents apart from literal arguments (SUM(A1) ignores text, SUM("x") does not)
const evaluateArgument = (node: Expr, scope: SheetScope, state: EvalState): Value => {
  if (node.type !== 'cell') return evaluateNode(node, scope, state);
  const target = resolveScope(node.ref.sheet, scope);
  if (isFormulaError(target)) return target;
  return { kind: 'range', rows: 1, cols: 1, values: [readCell(target, node.ref.row, node.ref.col, state)] };
};

const evaluateCall = (name: string, args: readonly Expr[], scope: SheetScope, state: EvalState): Value => {
  const fn = getFunction(name);
  if (!fn) return '#NAME?';
  if (args.length < fn.minArgs || args.length > fn.maxArgs) return '#VALUE!';
  return fn.call(args.map((arg) => evaluateArgument(arg, scope, state)));
};

const evaluateSource = (source: string, scope: SheetScope, state: EvalState): Value => {
  const parsed = parseCached(source);
  if ('error' in parsed) return '#ERROR!';
  return evaluateNode(parsed.ast, scope, state);
};

// An empty result displays as 0, as it does in Excel
const unwrapResult = (value: Value): FormulaResult => {
  const scalar = toScalar(value);
  return scalar === null ? 0 : scalar;
};

/**
 * Evaluates a formula (text starting with "=") against a cell accessor. The
 * accessor may hand back raw values or CellData-like objects; formula cells
 * are evaluated recursively. Text that is not a formula is returned as-is.
 */
export function evaluateFormula(formula: string, getCellValue: CellAccessor): FormulaResult {
  if (!formula.startsWith('=')) return formula;
  if (formula.length > MAX_FORMULA_LENGTH) return '#ERROR!';
  const state: EvalState = { chain: new Set(), memo: new Map(), depth: 0, cellReads: 0 };
  try {
    return unwrapResult(evaluateSource(formula.slice(1), { label: '', read: getCellValue }, state));
  } catch {
    return '#ERROR!';
  }
}
