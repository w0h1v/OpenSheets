import { CellRef, FormulaSyntaxError, OperatorSymbol, RangeRef, Token, tokenize } from './tokenizer';
import { FormulaError } from './values';

export type BinaryOperator = Exclude<OperatorSymbol, '%'>;

export type Expr =
  | { readonly type: 'number'; readonly value: number }
  | { readonly type: 'string'; readonly value: string }
  | { readonly type: 'boolean'; readonly value: boolean }
  | { readonly type: 'error'; readonly value: FormulaError }
  | { readonly type: 'cell'; readonly ref: CellRef }
  | { readonly type: 'range'; readonly ref: RangeRef }
  | { readonly type: 'name'; readonly name: string }
  | { readonly type: 'unary'; readonly op: '-' | '+'; readonly operand: Expr }
  | { readonly type: 'percent'; readonly operand: Expr }
  | { readonly type: 'binary'; readonly op: BinaryOperator; readonly left: Expr; readonly right: Expr }
  | { readonly type: 'call'; readonly name: string; readonly args: readonly Expr[] };

// Excel precedence, lowest first; postfix % and unary sign bind tighter than all of these
const BINARY_PRECEDENCE: Record<BinaryOperator, number> = {
  '=': 1,
  '<>': 1,
  '<': 1,
  '>': 1,
  '<=': 1,
  '>=': 1,
  '&': 2,
  '+': 3,
  '-': 3,
  '*': 4,
  '/': 4,
  '^': 5,
};

const LOWEST_PRECEDENCE = 1;

// Deep nesting is only ever produced by hostile input; fail before the call stack does
const MAX_NESTING = 200;

const describe = (token: Token): string => {
  switch (token.type) {
    case 'eof':
      return 'end of formula';
    case 'number':
      return `number ${token.value}`;
    case 'string':
      return `string "${token.value}"`;
    case 'identifier':
      return `name '${token.value}'`;
    case 'error':
      return token.value;
    case 'cell':
    case 'range':
      return 'reference';
    case 'operator':
      return `'${token.value}'`;
    case 'lparen':
      return "'('";
    case 'rparen':
      return "')'";
    case 'comma':
      return "','";
  }
};

class Parser {
  private index = 0;
  private nesting = 0;

  constructor(private readonly tokens: readonly Token[]) {}

  parse(): Expr {
    const expr = this.parseBinary(LOWEST_PRECEDENCE);
    const trailing = this.peek();
    if (trailing.type !== 'eof') throw this.unexpected(trailing);
    return expr;
  }

  private peek(): Token {
    return this.tokens[this.index];
  }

  private next(): Token {
    const token = this.tokens[this.index];
    if (token.type !== 'eof') this.index++;
    return token;
  }

  private unexpected(token: Token): FormulaSyntaxError {
    return new FormulaSyntaxError(`Unexpected ${describe(token)}`, token.pos);
  }

  private parseBinary(minPrecedence: number): Expr {
    let left = this.parseUnary();
    for (;;) {
      const token = this.peek();
      if (token.type !== 'operator' || token.value === '%') break;
      const op = token.value;
      const precedence = BINARY_PRECEDENCE[op];
      if (precedence < minPrecedence) break;
      this.index++;
      const right = this.parseBinary(op === '^' ? precedence : precedence + 1);
      left = { type: 'binary', op, left, right };
    }
    return left;
  }

  private parseUnary(): Expr {
    const token = this.peek();
    if (token.type === 'operator' && (token.value === '-' || token.value === '+')) {
      const op = token.value;
      this.index++;
      return this.nested(() => ({ type: 'unary', op, operand: this.parseUnary() }));
    }
    return this.parsePostfix();
  }

  private parsePostfix(): Expr {
    let expr = this.parsePrimary();
    for (;;) {
      const token = this.peek();
      if (token.type !== 'operator' || token.value !== '%') return expr;
      this.index++;
      expr = { type: 'percent', operand: expr };
    }
  }

  private parsePrimary(): Expr {
    const token = this.next();
    switch (token.type) {
      case 'number':
        return { type: 'number', value: token.value };
      case 'string':
        return { type: 'string', value: token.value };
      case 'error':
        return { type: 'error', value: token.value };
      case 'cell':
        return { type: 'cell', ref: token.ref };
      case 'range':
        return { type: 'range', ref: token.ref };
      case 'identifier': {
        if (this.peek().type === 'lparen') {
          this.index++;
          const args = this.nested(() => this.parseArguments());
          return { type: 'call', name: token.value.toUpperCase(), args };
        }
        const upper = token.value.toUpperCase();
        if (upper === 'TRUE') return { type: 'boolean', value: true };
        if (upper === 'FALSE') return { type: 'boolean', value: false };
        return { type: 'name', name: token.value };
      }
      case 'lparen': {
        const inner = this.nested(() => this.parseBinary(LOWEST_PRECEDENCE));
        const closing = this.next();
        if (closing.type !== 'rparen') {
          throw new FormulaSyntaxError(`Expected ')' but found ${describe(closing)}`, closing.pos);
        }
        return inner;
      }
      default:
        throw this.unexpected(token);
    }
  }

  private parseArguments(): Expr[] {
    const args: Expr[] = [];
    if (this.peek().type === 'rparen') {
      this.index++;
      return args;
    }
    for (;;) {
      args.push(this.parseBinary(LOWEST_PRECEDENCE));
      const separator = this.next();
      if (separator.type === 'rparen') return args;
      if (separator.type !== 'comma') {
        throw new FormulaSyntaxError(`Expected ',' or ')' but found ${describe(separator)}`, separator.pos);
      }
    }
  }

  private nested<T>(parse: () => T): T {
    if (this.nesting >= MAX_NESTING) {
      throw new FormulaSyntaxError('Formula is nested too deeply', this.peek().pos);
    }
    this.nesting++;
    try {
      return parse();
    } finally {
      this.nesting--;
    }
  }
}

// Parses the expression body of a formula (the text after the leading '=');
// throws FormulaSyntaxError on malformed input
export function parseFormula(source: string): Expr {
  return new Parser(tokenize(source)).parse();
}
