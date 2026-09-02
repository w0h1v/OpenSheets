import { readFileSync } from 'fs';
import { join } from 'path';
import { evaluateFormula, parseCellRef } from '../utils/formulaUtils';
import { registerSheetData, unregisterSheetData } from '../utils/sheetRegistry';
import {
  FORMULA_FUNCTIONS,
  FormulaSyntaxError,
  getFunction,
  parseFormula,
  tokenize,
} from '../formula';
import { CellData, keyOf } from '../types/spreadsheet';

const grid = (cells: Record<string, unknown>): Map<string, CellData> => {
  const map = new Map<string, CellData>();
  for (const [ref, raw] of Object.entries(cells)) {
    const [row, col] = parseCellRef(ref);
    map.set(
      keyOf(row, col),
      typeof raw === 'string' && raw.startsWith('=') ? { value: raw, formula: raw } : { value: raw }
    );
  }
  return map;
};

const accessorFor = (map: Map<string, CellData>) => (row: number, col: number) => map.get(keyOf(row, col));

const evalWith = (formula: string, cells: Record<string, unknown> = {}) =>
  evaluateFormula(formula, accessorFor(grid(cells)));

describe('formula tokenizer', () => {
  it('tokenizes numbers in integer, decimal and exponent forms', () => {
    const values = tokenize('1 2.5 .5 1e3 1.5E-2 7.')
      .filter((t) => t.type === 'number')
      .map((t) => (t.type === 'number' ? t.value : NaN));
    expect(values).toEqual([1, 2.5, 0.5, 1000, 0.015, 7]);
  });

  it('unescapes doubled quotes inside strings', () => {
    const [token] = tokenize('"say ""hi"""');
    expect(token).toMatchObject({ type: 'string', value: 'say "hi"' });
  });

  it('reads cell references with any mix of $ anchors', () => {
    const refs = tokenize('A1 $A$1 $A1 A$1 a1').map((t) => (t.type === 'cell' ? t.ref : null));
    expect(refs.slice(0, 5)).toEqual([
      { sheet: null, row: 0, col: 0, absRow: false, absCol: false },
      { sheet: null, row: 0, col: 0, absRow: true, absCol: true },
      { sheet: null, row: 0, col: 0, absRow: false, absCol: true },
      { sheet: null, row: 0, col: 0, absRow: true, absCol: false },
      { sheet: null, row: 0, col: 0, absRow: false, absCol: false },
    ]);
  });

  it('reads ranges and sheet-qualified references, quoted names allowing spaces', () => {
    const [range, quoted, plain] = tokenize("B3:A1 'My Sheet'!A1:B2 Sheet1!$C$3");
    expect(range).toMatchObject({
      type: 'range',
      ref: { sheet: null, startRow: 0, startCol: 0, endRow: 2, endCol: 1 },
    });
    expect(quoted).toMatchObject({
      type: 'range',
      ref: { sheet: 'My Sheet', startRow: 0, startCol: 0, endRow: 1, endCol: 1 },
    });
    expect(plain).toMatchObject({ type: 'cell', ref: { sheet: 'Sheet1', row: 2, col: 2 } });
  });

  it('reads every operator, parentheses and commas', () => {
    const types = tokenize('(1+2-3*4/5^6%)&"a"=1<>2<3>4<=5>=6,7').map((t) =>
      t.type === 'operator' ? t.value : t.type
    );
    expect(types).toEqual([
      'lparen', 'number', '+', 'number', '-', 'number', '*', 'number', '/', 'number', '^', 'number', '%',
      'rparen', '&', 'string', '=', 'number', '<>', 'number', '<', 'number', '>', 'number', '<=', 'number',
      '>=', 'number', 'comma', 'number', 'eof',
    ]);
  });

  it('treats a cell-shaped word followed by ( as a function name', () => {
    expect(tokenize('LOG10(1)')[0]).toMatchObject({ type: 'identifier', value: 'LOG10' });
  });

  it('reports unterminated strings, stray characters and bad sheet references', () => {
    expect(() => tokenize('"abc')).toThrow(FormulaSyntaxError);
    expect(() => tokenize('1;2')).toThrow(/Unexpected character ';'/);
    expect(() => tokenize("'Sheet")).toThrow(/Unterminated sheet name/);
    expect(() => tokenize('Sheet1!SUM')).toThrow(/Expected a cell reference/);
    expect(() => tokenize('$SUM')).toThrow(/\$/);
  });
});

describe('formula parser', () => {
  it('produces a typed AST with Excel precedence', () => {
    expect(parseFormula('1+2*3')).toEqual({
      type: 'binary',
      op: '+',
      left: { type: 'number', value: 1 },
      right: {
        type: 'binary',
        op: '*',
        left: { type: 'number', value: 2 },
        right: { type: 'number', value: 3 },
      },
    });
  });

  it('parses nested function calls with ranges as arguments', () => {
    expect(parseFormula('IF(SUM(A1:A2)>1, "big", MIN(1, 2))')).toMatchObject({
      type: 'call',
      name: 'IF',
      args: [
        { type: 'binary', op: '>', left: { type: 'call', name: 'SUM', args: [{ type: 'range' }] } },
        { type: 'string', value: 'big' },
        { type: 'call', name: 'MIN' },
      ],
    });
  });

  it('throws descriptive syntax errors with positions', () => {
    expect(() => parseFormula('1+')).toThrow('Unexpected end of formula at position 2');
    expect(() => parseFormula('(1')).toThrow("Expected ')' but found end of formula");
    expect(() => parseFormula('SUM(1 2)')).toThrow("Expected ',' or ')' but found number 2");
    expect(() => parseFormula(')')).toThrow("Unexpected ')' at position 0");
    expect(() => parseFormula('')).toThrow(FormulaSyntaxError);
  });
});

describe('formula evaluator', () => {
  describe('operators', () => {
    it('applies precedence and associativity', () => {
      expect(evalWith('=1+2*3')).toBe(7);
      expect(evalWith('=(1+2)*3')).toBe(9);
      expect(evalWith('=10-2-3')).toBe(5);
      expect(evalWith('=100/10/2')).toBe(5);
      expect(evalWith('=2^3^2')).toBe(512);
      expect(evalWith('=2*3^2')).toBe(18);
      expect(evalWith('=1+2&3')).toBe('33');
      expect(evalWith('=1<2=TRUE')).toBe(true);
      expect(evalWith('="a"&"b"="AB"')).toBe(true);
    });

    it('binds unary minus tighter than ^ and % tighter than unary minus', () => {
      expect(evalWith('=-2^2')).toBe(4);
      expect(evalWith('=2^-1')).toBe(0.5);
      expect(evalWith('=--3')).toBe(3);
      expect(evalWith('=-50%')).toBe(-0.5);
      expect(evalWith('=200%*2')).toBe(4);
      expect(evalWith('=5%%')).toBe(0.0005);
      expect(evalWith('=+"abc"')).toBe('abc');
    });

    it('reads exponent-form and leading-dot numbers', () => {
      expect(evalWith('=1E3+1')).toBe(1001);
      expect(evalWith('=1.5e-1')).toBe(0.15);
      expect(evalWith('=.5+.5')).toBe(1);
    });

    it('concatenates the text form of values with &', () => {
      expect(evalWith('="a""b"&"c"')).toBe('a"bc');
      expect(evalWith('=1&2')).toBe('12');
      expect(evalWith('=TRUE&""')).toBe('TRUE');
      expect(evalWith('=A1&"x"')).toBe('x');
      expect(evalWith('=0.1+0.2&""')).toBe('0.3');
    });

    it('compares numbers numerically and text case-insensitively', () => {
      expect(evalWith('=1<2')).toBe(true);
      expect(evalWith('=2<=2')).toBe(true);
      expect(evalWith('=3>2')).toBe(true);
      expect(evalWith('=3>=4')).toBe(false);
      expect(evalWith('=1=1')).toBe(true);
      expect(evalWith('=1<>1')).toBe(false);
      expect(evalWith('="abc"="ABC"')).toBe(true);
      expect(evalWith('="apple"<>"Apple"')).toBe(false);
      expect(evalWith('="a"<"B"')).toBe(true);
      expect(evalWith('="b">"A"')).toBe(true);
    });

    it('orders mixed types as numbers < text < booleans', () => {
      expect(evalWith('=1="1"')).toBe(false);
      expect(evalWith('="a">1000')).toBe(true);
      expect(evalWith('=TRUE>"zzz"')).toBe(true);
      expect(evalWith('=FALSE>1')).toBe(true);
    });

    it('treats empty cells as 0, "" or FALSE depending on the other side', () => {
      expect(evalWith('=A1=0')).toBe(true);
      expect(evalWith('=A1=""')).toBe(true);
      expect(evalWith('=A1=FALSE')).toBe(true);
      expect(evalWith('=A1+1')).toBe(1);
      expect(evalWith('=A1')).toBe(0);
    });

    it('coerces numeric text and booleans in arithmetic', () => {
      expect(evalWith('="3"+4')).toBe(7);
      expect(evalWith('=" 2.5 "*2')).toBe(5);
      expect(evalWith('=TRUE+1')).toBe(2);
      expect(evalWith('=-"5"')).toBe(-5);
      expect(evalWith('="abc"+1')).toBe('#VALUE!');
      expect(evalWith('=""+1')).toBe('#VALUE!');
    });

    it('reports division by zero and non-finite results', () => {
      expect(evalWith('=1/0')).toBe('#DIV/0!');
      expect(evalWith('=10^400')).toBe('#NUM!');
      expect(evalWith('=(-8)^0.5')).toBe('#NUM!');
    });
  });

  describe('references', () => {
    const cells = { A1: 10, A2: 20, A3: 30, B1: 'x', B2: true, B3: '7' };

    it('resolves relative, absolute and lower-case references alike', () => {
      expect(evalWith('=A1', cells)).toBe(10);
      expect(evalWith('=$A$1', cells)).toBe(10);
      expect(evalWith('=$A2+A$3', cells)).toBe(50);
      expect(evalWith('=a1*2', cells)).toBe(20);
    });

    it('accepts raw-value accessors as well as CellData objects', () => {
      expect(evaluateFormula('=A1+B2', () => 5)).toBe(10);
      expect(evaluateFormula('=A1', () => undefined)).toBe(0);
      expect(evaluateFormula('=A1', () => new Date(2020, 0, 1))).toEqual(new Date(2020, 0, 1));
    });

    it('treats numeric-looking cell text as a number and empty text as empty', () => {
      expect(evalWith('=B3+1', cells)).toBe(8);
      expect(evalWith('=B3>5', cells)).toBe(true);
      expect(evalWith('=ISBLANK(C1)', { C1: '' })).toBe(true);
    });

    it('expands ranges inside aggregates, in either direction', () => {
      expect(evalWith('=SUM(A1:A3)', cells)).toBe(60);
      expect(evalWith('=SUM(A3:A1)', cells)).toBe(60);
      expect(evalWith('=SUM(B3:A1)', cells)).toBe(67);
      expect(evalWith('=MAX($A$1:$A$3)', cells)).toBe(30);
    });

    it('rejects ranges where a scalar is required', () => {
      expect(evalWith('=A1:A3', cells)).toBe('#VALUE!');
      expect(evalWith('=A1:A3+1', cells)).toBe('#VALUE!');
      expect(evalWith('=LEN(A1:A3)', cells)).toBe('#VALUE!');
      expect(evalWith('=A1:A1+1', cells)).toBe(11);
    });

    it('treats out-of-grid words as names and oversized ranges as #REF!', () => {
      expect(evalWith('=A0')).toBe('#NAME?');
      expect(evalWith('=ABCD1')).toBe('#NAME?');
      expect(evalWith('=SUM(A1:A250000)')).toBe(0);
      expect(evalWith('=SUM(A1:A250001)')).toBe('#REF!');
      expect(evalWith('=SUM(A1:XFD100000)')).toBe('#REF!');
    });

    it('refuses more than a million cell reads per evaluation', () => {
      const ranges = Array.from({ length: 5 }, () => 'A1:A250000').join(',');
      expect(evalWith(`=SUM(${ranges})`)).toBe('#REF!');
    });
  });

  describe('cross-sheet references', () => {
    beforeAll(() => {
      registerSheetData('EngineData', grid({ A1: 5, A2: '=A1*2', A3: 'x', B1: '=EngineOther!A1+1' }));
      registerSheetData('Engine Other', grid({ A1: 100, B2: 'q' }));
      registerSheetData('EngineOther', grid({ A1: 1 }));
      registerSheetData('EngineLoopA', grid({ A1: '=EngineLoopB!A1' }));
      registerSheetData('EngineLoopB', grid({ A1: '=EngineLoopA!A1' }));
    });

    afterAll(() => {
      ['EngineData', 'Engine Other', 'EngineOther', 'EngineLoopA', 'EngineLoopB'].forEach(unregisterSheetData);
    });

    it('reads cells and ranges from registered sheets', () => {
      expect(evalWith('=EngineData!A1')).toBe(5);
      expect(evalWith('=SUM(EngineData!A1:A3)')).toBe(15);
      expect(evalWith("='Engine Other'!B2")).toBe('q');
      expect(evalWith("=SUM('Engine Other'!A1:B2)")).toBe(100);
    });

    it('resolves formulas found in another sheet against that sheet', () => {
      expect(evalWith('=EngineData!A2', { A1: 999 })).toBe(10);
      expect(evalWith('=EngineData!B1')).toBe(2);
    });

    it('returns #REF! for unknown sheets', () => {
      expect(evalWith('=EngineMissing!A1')).toBe('#REF!');
      expect(evalWith('=SUM(EngineMissing!A1:A3)')).toBe('#REF!');
      expect(evalWith('=SUM(EngineMissing!A1)')).toBe('#REF!');
    });

    it('detects cycles that cross sheets', () => {
      expect(evalWith('=EngineLoopA!A1')).toBe('#CYCLE!');
    });
  });

  describe('formula cells', () => {
    it('evaluates referenced formula cells recursively', () => {
      const cells = { A1: 1, A2: '=A1+1', A3: '=A2+1', B1: '=SUM(A1:A3)' };
      expect(evalWith('=A3', cells)).toBe(3);
      expect(evalWith('=B1*2', cells)).toBe(12);
    });

    it('does not mistake shared dependencies for cycles', () => {
      const cells = { A1: 2, B1: '=A1', C1: '=A1', D1: '=B1+C1' };
      expect(evalWith('=D1', cells)).toBe(4);
      expect(evalWith('=SUM(A1:D1)', cells)).toBe(10);
    });

    it('returns #CYCLE! for a direct cycle', () => {
      expect(evalWith('=A1', { A1: '=A1' })).toBe('#CYCLE!');
      expect(evalWith('=A1+1', { A1: '=A1+1' })).toBe('#CYCLE!');
    });

    it('returns #CYCLE! for an indirect cycle and propagates it', () => {
      const cells = { A1: '=B1', B1: '=C1', C1: '=A1*2', D1: '=IFERROR(A1,"cycle")' };
      expect(evalWith('=A1', cells)).toBe('#CYCLE!');
      expect(evalWith('=SUM(A1:C1)', cells)).toBe('#CYCLE!');
      expect(evalWith('=D1', cells)).toBe('cycle');
    });

    it('caps evaluation depth as a backstop', () => {
      const chain: Record<string, unknown> = {};
      for (let i = 1; i <= 200; i++) chain[`A${i}`] = `=A${i + 1}+1`;
      chain.A201 = 0;
      expect(evalWith('=A150', chain)).toBe(51);
      expect(evalWith('=A1', chain)).toBe('#CYCLE!');
    });

    it('treats error text stored in a cell as an error', () => {
      expect(evalWith('=A1+1', { A1: '#REF!' })).toBe('#REF!');
      expect(evalWith('=IFERROR(A1,0)', { A1: '#N/A' })).toBe(0);
    });
  });

  describe('functions', () => {
    const cells = {
      A1: 1, A2: 5, A3: 10, A4: 'x', A6: true, A7: '=1/0',
      B1: 10, B2: 20, B3: 30, B4: 40, B5: 50,
      C1: true, C2: false, C3: 'note',
    };

    it('resolves names case-insensitively', () => {
      expect(evalWith('=sum(1,2)')).toBe(3);
      expect(evalWith('=Sum(1,2)')).toBe(3);
    });

    it('SUM adds numbers and skips text, booleans and empties in ranges', () => {
      expect(evalWith('=SUM(1,2,3)')).toBe(6);
      expect(evalWith('=SUM(A1:A6)', cells)).toBe(16);
      expect(evalWith('=SUM("3",TRUE)')).toBe(4);
      expect(evalWith('=SUM(A4)', cells)).toBe(0);
      expect(evalWith('=SUM("x")')).toBe('#VALUE!');
      expect(evalWith('=SUM()')).toBe('#VALUE!');
    });

    it('AVERAGE divides by the count of numbers and rejects an empty set', () => {
      expect(evalWith('=AVERAGE(1,2,3,4)')).toBe(2.5);
      expect(evalWith('=AVERAGE(A1:A3)', cells)).toBe(16 / 3);
      expect(evalWith('=AVERAGE(D1:D5)', cells)).toBe('#DIV/0!');
      expect(evalWith('=AVERAGE(A4)', cells)).toBe('#DIV/0!');
    });

    it('COUNT counts numbers only and ignores errors', () => {
      expect(evalWith('=COUNT(A1:A7)', cells)).toBe(3);
      expect(evalWith('=COUNT(1,"2",TRUE,"x")')).toBe(3);
      expect(evalWith('=COUNT(1/0, 1)')).toBe(1);
    });

    it('COUNTA counts anything non-empty', () => {
      expect(evalWith('=COUNTA(A1:A7)', cells)).toBe(6);
      expect(evalWith('=COUNTA("")')).toBe(1);
      expect(evalWith('=COUNTA(D1:D3)', cells)).toBe(0);
    });

    it('MIN and MAX ignore non-numbers and default to 0', () => {
      expect(evalWith('=MIN(3,1,2)')).toBe(1);
      expect(evalWith('=MAX(A1:A6)', cells)).toBe(10);
      expect(evalWith('=MIN(A1:A6)', cells)).toBe(1);
      expect(evalWith('=MIN(D1:D3)', cells)).toBe(0);
    });

    it('IF picks a branch and passes cell values through', () => {
      expect(evalWith('=IF(1>0,"y","n")')).toBe('y');
      expect(evalWith('=IF(FALSE,1)')).toBe(false);
      expect(evalWith('=IF(A1,"one","zero")', cells)).toBe('one');
      expect(evalWith('=IF("x",1,2)')).toBe('#VALUE!');
      expect(evalWith('=IF(1/0,1,2)')).toBe('#DIV/0!');
      expect(evalWith('=IF(TRUE,D1)', cells)).toBe(0);
      expect(evalWith('=SUM(IF(TRUE,A1:A3,B1:B3))', cells)).toBe(16);
      expect(evalWith('=IF(TRUE)')).toBe('#VALUE!');
    });

    it('IFERROR substitutes a fallback for errors only', () => {
      expect(evalWith('=IFERROR(1/0,"d")')).toBe('d');
      expect(evalWith('=IFERROR(5,"d")')).toBe(5);
      expect(evalWith('=IFERROR(A7,0)', cells)).toBe(0);
      expect(evalWith('=IFERROR(NOPE(),"missing")')).toBe('missing');
    });

    it('AND, OR and NOT use logical coercion', () => {
      expect(evalWith('=AND(TRUE,1)')).toBe(true);
      expect(evalWith('=AND(TRUE,0)')).toBe(false);
      expect(evalWith('=OR(FALSE,0)')).toBe(false);
      expect(evalWith('=OR(FALSE,"true")')).toBe(true);
      expect(evalWith('=NOT(TRUE)')).toBe(false);
      expect(evalWith('=NOT(0)')).toBe(true);
      expect(evalWith('=AND("x")')).toBe('#VALUE!');
      expect(evalWith('=AND(C1:C3)', cells)).toBe(false);
      expect(evalWith('=OR(C1:C3)', cells)).toBe(true);
      expect(evalWith('=AND(C3)', cells)).toBe('#VALUE!');
      expect(evalWith('=AND(A7)', cells)).toBe('#DIV/0!');
    });

    it('CONCAT and CONCATENATE join text forms, expanding ranges', () => {
      expect(evalWith('=CONCAT("a",1,TRUE)')).toBe('a1TRUE');
      expect(evalWith('=CONCAT(A1:A4)', cells)).toBe('1510x');
      expect(evalWith('=CONCATENATE("x","y")')).toBe('xy');
      expect(evalWith('=CONCAT("x",1/0)')).toBe('#DIV/0!');
    });

    it('LEN, UPPER, LOWER and TRIM operate on text forms', () => {
      expect(evalWith('=LEN("héllo")')).toBe(5);
      expect(evalWith('=LEN(12345)')).toBe(5);
      expect(evalWith('=LEN(D1)', cells)).toBe(0);
      expect(evalWith('=UPPER("ab")')).toBe('AB');
      expect(evalWith('=LOWER("AB")')).toBe('ab');
      expect(evalWith('=TRIM("  a   b  ")')).toBe('a b');
    });

    it('LEFT, RIGHT and MID respect bounds', () => {
      expect(evalWith('=LEFT("hello")')).toBe('h');
      expect(evalWith('=LEFT("hello",3)')).toBe('hel');
      expect(evalWith('=LEFT("hi",10)')).toBe('hi');
      expect(evalWith('=LEFT("x",-1)')).toBe('#VALUE!');
      expect(evalWith('=RIGHT("hello",2)')).toBe('lo');
      expect(evalWith('=RIGHT("hello",0)')).toBe('');
      expect(evalWith('=RIGHT(12345)')).toBe('5');
      expect(evalWith('=MID("hello",2,3)')).toBe('ell');
      expect(evalWith('=MID("hello",4,100)')).toBe('lo');
      expect(evalWith('=MID("hello",10,2)')).toBe('');
      expect(evalWith('=MID("hello",0,2)')).toBe('#VALUE!');
      expect(evalWith('=MID("hello",2,-1)')).toBe('#VALUE!');
      expect(evalWith('=MID("hello",2)')).toBe('#VALUE!');
    });

    it('ROUND family rounds halves away from zero and handles negative digits', () => {
      expect(evalWith('=ROUND(2.5)')).toBe(3);
      expect(evalWith('=ROUND(-2.5)')).toBe(-3);
      expect(evalWith('=ROUND(1.005,2)')).toBe(1.01);
      expect(evalWith('=ROUND(-1.45,1)')).toBe(-1.5);
      expect(evalWith('=ROUND(1234.567,-2)')).toBe(1200);
      expect(evalWith('=ROUND("x")')).toBe('#VALUE!');
      expect(evalWith('=ROUNDUP(1.001,2)')).toBe(1.01);
      expect(evalWith('=ROUNDUP(-1.001,2)')).toBe(-1.01);
      expect(evalWith('=ROUNDUP(1.1)')).toBe(2);
      expect(evalWith('=ROUNDDOWN(1.999,2)')).toBe(1.99);
      expect(evalWith('=ROUNDDOWN(-1.999)')).toBe(-1);
      expect(evalWith('=INT(-1.5)')).toBe(-2);
      expect(evalWith('=INT(3.9)')).toBe(3);
    });

    it('ABS, MOD, POWER, SQRT and PI follow spreadsheet conventions', () => {
      expect(evalWith('=ABS(-3)')).toBe(3);
      expect(evalWith('=MOD(10,3)')).toBe(1);
      expect(evalWith('=MOD(-3,2)')).toBe(1);
      expect(evalWith('=MOD(3,-2)')).toBe(-1);
      expect(evalWith('=MOD(1,0)')).toBe('#DIV/0!');
      expect(evalWith('=POWER(2,10)')).toBe(1024);
      expect(evalWith('=SQRT(16)')).toBe(4);
      expect(evalWith('=SQRT(-1)')).toBe('#NUM!');
      expect(evalWith('=PI()')).toBe(Math.PI);
      expect(evalWith('=PI(1)')).toBe('#VALUE!');
    });

    it('SUMIF, COUNTIF and AVERAGEIF accept every criteria form', () => {
      expect(evalWith('=SUMIF(A1:A5,">1")', cells)).toBe(15);
      expect(evalWith('=SUMIF(A1:A5,">=5",B1:B5)', cells)).toBe(50);
      expect(evalWith('=SUMIF(A1:A5,"<=3")', cells)).toBe(1);
      expect(evalWith('=SUMIF(A1:A5,"<>x",B1:B5)', cells)).toBe(110);
      expect(evalWith('=SUMIF(A1:A5,"x",B1:B5)', cells)).toBe(40);
      expect(evalWith('=SUMIF(A1:A5,"X",B1:B5)', cells)).toBe(40);
      expect(evalWith('=SUMIF(A1:A5,5,B1:B5)', cells)).toBe(20);
      expect(evalWith('=SUMIF(A1:A5,"5",B1:B5)', cells)).toBe(20);
      expect(evalWith('=SUMIF(A1:A5,"=5",B1:B5)', cells)).toBe(20);
      expect(evalWith('=SUMIF(A1:A5,">1",B1:B2)', cells)).toBe(20);
      expect(evalWith('=SUMIF(A1:A5,A2,B1:B5)', cells)).toBe(20);
      expect(evalWith('=COUNTIF(A1:A5,">1")', cells)).toBe(2);
      expect(evalWith('=COUNTIF(A1:A5,"<5")', cells)).toBe(1);
      expect(evalWith('=COUNTIF(A1:A5,"")', cells)).toBe(1);
      expect(evalWith('=COUNTIF(A1:A5,"<>")', cells)).toBe(4);
      expect(evalWith('=COUNTIF(A1:A5,"x")', cells)).toBe(1);
      expect(evalWith('=COUNTIF(A1:A5,"<>5")', cells)).toBe(4);
      expect(evalWith('=COUNTIF(C1:C3,TRUE)', cells)).toBe(1);
      expect(evalWith('=AVERAGEIF(A1:A5,">1")', cells)).toBe(7.5);
      expect(evalWith('=AVERAGEIF(A1:A5,">100")', cells)).toBe('#DIV/0!');
      expect(evalWith('=SUMIF(A1:A5,1/0)', cells)).toBe('#DIV/0!');
    });

    it('IS* predicates classify without propagating errors', () => {
      expect(evalWith('=ISBLANK(D1)', cells)).toBe(true);
      expect(evalWith('=ISBLANK(A1)', cells)).toBe(false);
      expect(evalWith('=ISBLANK("")')).toBe(false);
      expect(evalWith('=ISBLANK(1/0)')).toBe(false);
      expect(evalWith('=ISNUMBER(1)')).toBe(true);
      expect(evalWith('=ISNUMBER("1")')).toBe(false);
      expect(evalWith('=ISNUMBER(TODAY())')).toBe(true);
      expect(evalWith('=ISNUMBER(1/0)')).toBe(false);
      expect(evalWith('=ISTEXT("a")')).toBe(true);
      expect(evalWith('=ISTEXT(A4)', cells)).toBe(true);
      expect(evalWith('=ISTEXT(1)')).toBe(false);
      expect(evalWith('=ISTEXT(1/0)')).toBe(false);
    });

    it('TODAY and NOW return dates that take part in arithmetic as serials', () => {
      const today = evalWith('=TODAY()');
      expect(today).toBeInstanceOf(Date);
      const midnight = new Date();
      midnight.setHours(0, 0, 0, 0);
      expect(today).toEqual(midnight);
      const now = evalWith('=NOW()');
      expect(now).toBeInstanceOf(Date);
      expect(Math.abs((now as Date).getTime() - Date.now())).toBeLessThan(1000);
      expect(evalWith('=NOW()>=TODAY()')).toBe(true);
      expect(evalWith('=TODAY()=TODAY()')).toBe(true);
      const serial = evalWith('=TODAY()+1');
      expect(typeof serial).toBe('number');
      expect(Number.isInteger(serial)).toBe(true);
      expect(serial).toBeGreaterThan(40000);
      expect(evalWith('=TODAY(1)')).toBe('#VALUE!');
    });
  });

  describe('errors', () => {
    it('produces every error type', () => {
      expect(evalWith('=1/0')).toBe('#DIV/0!');
      expect(evalWith('="a"*2')).toBe('#VALUE!');
      expect(evalWith('=FOO()')).toBe('#NAME?');
      expect(evalWith('=foo')).toBe('#NAME?');
      expect(evalWith('=Nope!A1')).toBe('#REF!');
      expect(evalWith('=#REF!')).toBe('#REF!');
      expect(evalWith('=SUM(A1:#REF!)')).toBe('#REF!');
      expect(evalWith('=SUM(#REF!:A5)')).toBe('#REF!');
      expect(evalWith('=A1', { A1: '=A1' })).toBe('#CYCLE!');
      expect(evalWith('=#N/A')).toBe('#N/A');
      expect(evalWith('=SQRT(-1)')).toBe('#NUM!');
      expect(evalWith('=1+')).toBe('#ERROR!');
    });

    it('propagates errors through operators and functions', () => {
      expect(evalWith('=1/0+1')).toBe('#DIV/0!');
      expect(evalWith('=-(1/0)')).toBe('#DIV/0!');
      expect(evalWith('=(1/0)%')).toBe('#DIV/0!');
      expect(evalWith('="x"&1/0')).toBe('#DIV/0!');
      expect(evalWith('=1/0=1/0')).toBe('#DIV/0!');
      expect(evalWith('=SUM(1,1/0)')).toBe('#DIV/0!');
      expect(evalWith('=SUM(A1:A3)', { A2: '=NOPE()' })).toBe('#NAME?');
      expect(evalWith('=SUM(A1:A3)', { A2: '=1+' })).toBe('#ERROR!');
      expect(evalWith('=ABS(#N/A)')).toBe('#N/A');
      expect(evalWith('=NOT(1/0)')).toBe('#DIV/0!');
    });

    it('rejects malformed, empty and oversized formulas as #ERROR!', () => {
      expect(evalWith('=')).toBe('#ERROR!');
      expect(evalWith('==1')).toBe('#ERROR!');
      expect(evalWith('=1 2')).toBe('#ERROR!');
      expect(evalWith('=SUM(1,')).toBe('#ERROR!');
      expect(evalWith('="unterminated')).toBe('#ERROR!');
      expect(evalWith(`=${'1+'.repeat(5000)}1`)).toBe('#ERROR!');
      expect(evalWith(`=${'('.repeat(300)}1${')'.repeat(300)}`)).toBe('#ERROR!');
    });

    it('returns text that is not a formula unchanged', () => {
      expect(evalWith('hello')).toBe('hello');
      expect(evalWith('123')).toBe('123');
      expect(evalWith('')).toBe('');
    });

    it('survives an accessor that throws', () => {
      expect(
        evaluateFormula('=A1', () => {
          throw new Error('boom');
        })
      ).toBe('#ERROR!');
    });
  });

  describe('AST cache', () => {
    it('keeps results stable across repeated evaluations and many distinct formulas', () => {
      for (let i = 0; i < 3; i++) expect(evalWith('=SUM(1,2)+A1', { A1: i })).toBe(3 + i);
      for (let i = 0; i < 700; i++) expect(evalWith(`=${i}+1`)).toBe(i + 1);
      expect(evalWith('=SUM(1,2)+A1', { A1: 4 })).toBe(7);
      expect(evalWith('=0+1')).toBe(1);
    });
  });

  describe('security', () => {
    const sentinel = () => (globalThis as Record<string, unknown>).__x;
    const hostile = [
      '=fetch("x")',
      '=window.location',
      '=constructor.constructor("return 1")()',
      '=(globalThis.__x=1)',
      '=[].map',
      '=1;alert(1)',
      '=globalThis.__x',
      '=this',
      '=eval("1")',
      '=Function("return 1")()',
      '=__proto__',
      '=toString()',
      '=`x`',
      '=SUM(constructor)',
      '=A1',
    ];

    let fetchSpy: jest.Mock;
    let alertSpy: jest.Mock;
    let originalFetch: unknown;
    let originalAlert: unknown;

    beforeEach(() => {
      const g = globalThis as Record<string, unknown>;
      originalFetch = g.fetch;
      originalAlert = g.alert;
      fetchSpy = jest.fn();
      alertSpy = jest.fn();
      g.fetch = fetchSpy;
      g.alert = alertSpy;
    });

    afterEach(() => {
      const g = globalThis as Record<string, unknown>;
      g.fetch = originalFetch;
      g.alert = originalAlert;
      delete g.__x;
    });

    it('never executes formula text and leaves globals untouched', () => {
      expect(sentinel()).toBeUndefined();
      const cells = { A1: '=fetch("x")' };
      for (const formula of hostile) {
        const result = evalWith(formula, cells);
        expect(['#NAME?', '#ERROR!']).toContain(result);
      }
      expect(sentinel()).toBeUndefined();
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(alertSpy).not.toHaveBeenCalled();
    });

    it('does not contain dynamic code execution', () => {
      const files = [
        '../formula/evaluator.ts',
        '../formula/functions.ts',
        '../formula/parser.ts',
        '../formula/tokenizer.ts',
        '../formula/values.ts',
        '../utils/formulaUtils.ts',
      ];
      const source = files.map((file) => readFileSync(join(__dirname, file), 'utf8')).join('\n');
      expect(source).not.toMatch(/\beval\s*\(/);
      expect(source).not.toMatch(/\bnew\s+Function\b|\bFunction\s*\(/);
      expect(source).not.toMatch(/\bnew\s+RegExp\b/);
      expect(source).not.toMatch(/\bwith\s*\(/);
    });
  });
});

describe('FORMULA_FUNCTIONS', () => {
  it('lists exactly the supported functions with signatures and descriptions', () => {
    const names = FORMULA_FUNCTIONS.map((f) => f.name).sort();
    expect(names).toEqual(
      [
        'ABS', 'AND', 'AVERAGE', 'AVERAGEIF', 'CONCAT', 'CONCATENATE', 'COUNT', 'COUNTA', 'COUNTIF',
        'IF', 'IFERROR', 'INT', 'ISBLANK', 'ISNUMBER', 'ISTEXT', 'LEFT', 'LEN', 'LOWER', 'MAX', 'MID',
        'MIN', 'MOD', 'NOT', 'NOW', 'OR', 'PI', 'POWER', 'RIGHT', 'ROUND', 'ROUNDDOWN', 'ROUNDUP',
        'SQRT', 'SUM', 'SUMIF', 'TODAY', 'TRIM', 'UPPER',
      ].sort()
    );
    for (const fn of FORMULA_FUNCTIONS) {
      expect(fn.signature.startsWith(`${fn.name}(`)).toBe(true);
      expect(fn.description.length).toBeGreaterThan(0);
      expect(getFunction(fn.name.toLowerCase())).toBeDefined();
    }
    expect(getFunction('FETCH')).toBeUndefined();
  });
});
