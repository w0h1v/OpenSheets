import { letterToColumn } from '../utils/columnUtils';
import { FORMULA_ERRORS, FormulaError } from './values';

export type OperatorSymbol =
  | '+'
  | '-'
  | '*'
  | '/'
  | '^'
  | '%'
  | '&'
  | '='
  | '<>'
  | '<'
  | '>'
  | '<='
  | '>=';

export interface CellRef {
  readonly sheet: string | null;
  readonly row: number;
  readonly col: number;
  readonly absRow: boolean;
  readonly absCol: boolean;
}

export interface RangeRef {
  readonly sheet: string | null;
  readonly startRow: number;
  readonly startCol: number;
  readonly endRow: number;
  readonly endCol: number;
}

export type Token =
  | { readonly type: 'number'; readonly value: number; readonly pos: number }
  | { readonly type: 'string'; readonly value: string; readonly pos: number }
  | { readonly type: 'identifier'; readonly value: string; readonly pos: number }
  | { readonly type: 'error'; readonly value: FormulaError; readonly pos: number }
  | { readonly type: 'cell'; readonly ref: CellRef; readonly pos: number }
  | { readonly type: 'range'; readonly ref: RangeRef; readonly pos: number }
  | { readonly type: 'operator'; readonly value: OperatorSymbol; readonly pos: number }
  | { readonly type: 'lparen' | 'rparen' | 'comma' | 'eof'; readonly pos: number };

export class FormulaSyntaxError extends Error {
  readonly position: number;

  constructor(message: string, position: number) {
    super(`${message} at position ${position}`);
    this.name = 'FormulaSyntaxError';
    this.position = position;
  }
}

// Excel's grid limits (XFD1048576); a word beyond them is a name, not a reference
const MAX_COL = 16383;
const MAX_ROW = 1048575;

type CellCoords = Omit<CellRef, 'sheet'>;

const isDigit = (ch: string): boolean => ch >= '0' && ch <= '9';
const isLetter = (ch: string): boolean => (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z');
const isWordChar = (ch: string): boolean => isLetter(ch) || isDigit(ch) || ch === '_' || ch === '$';
const isSpace = (ch: string): boolean => ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';

const TWO_CHAR_OPERATORS: readonly OperatorSymbol[] = ['<>', '<=', '>='];
const ONE_CHAR_OPERATORS: readonly OperatorSymbol[] = ['+', '-', '*', '/', '^', '%', '&', '=', '<', '>'];

const parseCellWord = (word: string): CellCoords | null => {
  let k = 0;
  const absCol = word.charAt(k) === '$';
  if (absCol) k++;
  const letterStart = k;
  while (isLetter(word.charAt(k))) k++;
  const letters = word.slice(letterStart, k);
  if (letters.length === 0 || letters.length > 3) return null;
  const absRow = word.charAt(k) === '$';
  if (absRow) k++;
  const digitStart = k;
  while (isDigit(word.charAt(k))) k++;
  const digits = word.slice(digitStart, k);
  if (digits.length === 0 || k !== word.length) return null;
  const row = Number(digits) - 1;
  const col = letterToColumn(letters.toUpperCase());
  if (row < 0 || row > MAX_ROW || col > MAX_COL) return null;
  return { row, col, absRow, absCol };
};

class Tokenizer {
  private pos = 0;
  private readonly tokens: Token[] = [];

  constructor(private readonly input: string) {}

  run(): Token[] {
    const { input } = this;
    while (this.pos < input.length) {
      const pos = this.pos;
      const ch = input.charAt(pos);
      if (isSpace(ch)) {
        this.pos++;
      } else if (isDigit(ch) || (ch === '.' && isDigit(input.charAt(pos + 1)))) {
        this.tokens.push(this.readNumber());
      } else if (ch === '"') {
        this.tokens.push(this.readString());
      } else if (ch === "'") {
        this.tokens.push(this.readQuotedSheetReference());
      } else if (isLetter(ch) || ch === '_' || ch === '$') {
        this.tokens.push(this.readWord());
      } else if (ch === '#') {
        this.tokens.push(this.readErrorLiteral());
      } else if (ch === '(') {
        this.tokens.push({ type: 'lparen', pos });
        this.pos++;
      } else if (ch === ')') {
        this.tokens.push({ type: 'rparen', pos });
        this.pos++;
      } else if (ch === ',') {
        this.tokens.push({ type: 'comma', pos });
        this.pos++;
      } else {
        this.tokens.push(this.readOperator());
      }
    }
    this.tokens.push({ type: 'eof', pos: input.length });
    return this.tokens;
  }

  private readOperator(): Token {
    const { input, pos } = this;
    const pair = input.slice(pos, pos + 2);
    const twoChar = TWO_CHAR_OPERATORS.find((op) => op === pair);
    if (twoChar) {
      this.pos += 2;
      return { type: 'operator', value: twoChar, pos };
    }
    const ch = input.charAt(pos);
    const oneChar = ONE_CHAR_OPERATORS.find((op) => op === ch);
    if (oneChar) {
      this.pos += 1;
      return { type: 'operator', value: oneChar, pos };
    }
    throw new FormulaSyntaxError(`Unexpected character '${ch}'`, pos);
  }

  private readNumber(): Token {
    const { input, pos } = this;
    let j = pos;
    while (isDigit(input.charAt(j))) j++;
    if (input.charAt(j) === '.') {
      j++;
      while (isDigit(input.charAt(j))) j++;
    }
    if (input.charAt(j) === 'e' || input.charAt(j) === 'E') {
      let k = j + 1;
      if (input.charAt(k) === '+' || input.charAt(k) === '-') k++;
      if (isDigit(input.charAt(k))) {
        while (isDigit(input.charAt(k))) k++;
        j = k;
      }
    }
    this.pos = j;
    return { type: 'number', value: Number(input.slice(pos, j)), pos };
  }

  private readString(): Token {
    const { input, pos } = this;
    let j = pos + 1;
    let text = '';
    for (;;) {
      if (j >= input.length) throw new FormulaSyntaxError('Unterminated string', pos);
      const ch = input.charAt(j);
      if (ch === '"') {
        if (input.charAt(j + 1) === '"') {
          text += '"';
          j += 2;
          continue;
        }
        j++;
        break;
      }
      text += ch;
      j++;
    }
    this.pos = j;
    return { type: 'string', value: text, pos };
  }

  private readWord(): Token {
    const { input, pos } = this;
    let j = pos;
    while (isWordChar(input.charAt(j))) j++;
    const word = input.slice(pos, j);
    if (input.charAt(j) === '!') {
      if (word.includes('$')) throw new FormulaSyntaxError(`Invalid sheet name '${word}'`, pos);
      this.pos = j + 1;
      return this.readReferenceAfterBang(word, pos);
    }
    const coords = parseCellWord(word);
    if (coords && input.charAt(j) !== '(') {
      this.pos = j;
      return this.readRangeTail(null, coords, pos);
    }
    const dollar = word.indexOf('$');
    if (dollar >= 0) throw new FormulaSyntaxError("Unexpected character '$'", pos + dollar);
    this.pos = j;
    return { type: 'identifier', value: word, pos };
  }

  private readQuotedSheetReference(): Token {
    const { input, pos } = this;
    let j = pos + 1;
    let name = '';
    for (;;) {
      if (j >= input.length) throw new FormulaSyntaxError('Unterminated sheet name', pos);
      const ch = input.charAt(j);
      if (ch === "'") {
        if (input.charAt(j + 1) === "'") {
          name += "'";
          j += 2;
          continue;
        }
        j++;
        break;
      }
      name += ch;
      j++;
    }
    if (input.charAt(j) !== '!') throw new FormulaSyntaxError("Expected '!' after sheet name", j);
    this.pos = j + 1;
    return this.readReferenceAfterBang(name, pos);
  }

  private readReferenceAfterBang(sheet: string, pos: number): Token {
    const coords = this.readCellWord();
    if (!coords) throw new FormulaSyntaxError(`Expected a cell reference after '${sheet}!'`, this.pos);
    return this.readRangeTail(sheet, coords, pos);
  }

  private readCellWord(): CellCoords | null {
    const { input } = this;
    let j = this.pos;
    while (isWordChar(input.charAt(j))) j++;
    const coords = parseCellWord(input.slice(this.pos, j));
    if (coords) this.pos = j;
    return coords;
  }

  // A range whose other end was deleted (A1:#REF!) is itself a #REF! error
  private readRangeTail(sheet: string | null, start: CellCoords, pos: number): Token {
    const { input } = this;
    if (input.charAt(this.pos) !== ':') {
      return { type: 'cell', ref: { sheet, ...start }, pos };
    }
    const colon = this.pos;
    this.pos++;
    if (input.charAt(this.pos) === '#') {
      const error = this.readErrorLiteral();
      if (error.type === 'error' && error.value === '#REF!') return { ...error, pos };
      throw new FormulaSyntaxError('Expected a cell reference after \':\'', colon + 1);
    }
    const end = this.readCellWord();
    if (!end) throw new FormulaSyntaxError('Expected a cell reference after \':\'', colon + 1);
    return {
      type: 'range',
      ref: {
        sheet,
        startRow: Math.min(start.row, end.row),
        startCol: Math.min(start.col, end.col),
        endRow: Math.max(start.row, end.row),
        endCol: Math.max(start.col, end.col),
      },
      pos,
    };
  }

  private readErrorLiteral(): Token {
    const { input, pos } = this;
    const literal = FORMULA_ERRORS.find((candidate) => input.startsWith(candidate, pos));
    if (!literal) throw new FormulaSyntaxError("Unexpected character '#'", pos);
    this.pos = pos + literal.length;
    if (literal === '#REF!' && input.charAt(this.pos) === ':') {
      this.pos++;
      if (input.startsWith('#REF!', this.pos)) {
        this.pos += '#REF!'.length;
      } else if (!this.readCellWord()) {
        throw new FormulaSyntaxError('Expected a cell reference after \':\'', this.pos);
      }
    }
    return { type: 'error', value: literal, pos };
  }
}

export function tokenize(input: string): Token[] {
  return new Tokenizer(input).run();
}
