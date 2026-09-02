import {
  evaluateConditionalFormat,
  applyConditionalFormatting,
  getApplicableConditionalFormats,
  combineConditionalFormats,
} from '../utils/conditionalFormattingUtils';
import * as formulaUtils from '../utils/formulaUtils';
import { CellData, ConditionalFormat, keyOf } from '../types/spreadsheet';

const rule = (
  type: ConditionalFormat['type'],
  condition: ConditionalFormat['condition'],
  value1?: unknown,
  value2?: unknown
): ConditionalFormat => ({ type, condition, value1, value2, format: { bold: true } });

const noData = new Map<string, CellData>();

const matches = (value: unknown, r: ConditionalFormat, row = 0, col = 0, data = noData) =>
  evaluateConditionalFormat(value, r, row, col, data);

describe('conditionalFormattingUtils', () => {
  describe('cellValue rules', () => {
    it('compares numerically when both sides are numeric', () => {
      expect(matches(15, rule('cellValue', 'greaterThan', 10))).toBe(true);
      expect(matches('15', rule('cellValue', 'greaterThan', '10'))).toBe(true);
      expect(matches(5, rule('cellValue', 'greaterThan', 10))).toBe(false);
      expect(matches(5, rule('cellValue', 'lessThan', 10))).toBe(true);
      expect(matches(10, rule('cellValue', 'lessThan', 10))).toBe(false);
    });

    it('equal and notEqual coerce numeric text', () => {
      expect(matches('10', rule('cellValue', 'equal', 10))).toBe(true);
      expect(matches('abc', rule('cellValue', 'equal', 'abc'))).toBe(true);
      expect(matches('abc', rule('cellValue', 'equal', 'ABC'))).toBe(false);
      expect(matches(3, rule('cellValue', 'notEqual', 4))).toBe(true);
      expect(matches(4, rule('cellValue', 'notEqual', 4))).toBe(false);
    });

    it('between and notBetween are inclusive and need a second value', () => {
      expect(matches(7, rule('cellValue', 'between', 5, 10))).toBe(true);
      expect(matches(10, rule('cellValue', 'between', 5, 10))).toBe(true);
      expect(matches(11, rule('cellValue', 'between', 5, 10))).toBe(false);
      expect(matches(7, rule('cellValue', 'between', 5))).toBe(false);
      expect(matches(11, rule('cellValue', 'notBetween', 5, 10))).toBe(true);
      expect(matches(7, rule('cellValue', 'notBetween', 5, 10))).toBe(false);
      expect(matches(11, rule('cellValue', 'notBetween', 5))).toBe(false);
    });

    it('matches text fragments case-insensitively', () => {
      expect(matches('Hello World', rule('cellValue', 'contains', 'WORLD'))).toBe(true);
      expect(matches('Hello World', rule('cellValue', 'startsWith', 'hello'))).toBe(true);
      expect(matches('Hello World', rule('cellValue', 'endsWith', 'world'))).toBe(true);
      expect(matches('Hello World', rule('cellValue', 'startsWith', 'world'))).toBe(false);
    });

    it('treats null as zero and rejects conditions it does not support', () => {
      expect(matches(null, rule('cellValue', 'greaterThan', -1))).toBe(true);
      expect(matches(null, rule('cellValue', 'equal', 0))).toBe(true);
      expect(matches('x', rule('cellValue', 'notContains', 'y'))).toBe(false);
    });
  });

  describe('textContains rules', () => {
    it('contains and endsWith accept comma-separated alternatives', () => {
      expect(matches('xbarx', rule('textContains', 'contains', 'foo, bar'))).toBe(true);
      expect(matches('xbazx', rule('textContains', 'contains', 'foo, bar'))).toBe(false);
      expect(matches('photo.JPG', rule('textContains', 'endsWith', '.png, .jpg'))).toBe(true);
      expect(matches('photo.gif', rule('textContains', 'endsWith', '.png, .jpg'))).toBe(false);
    });

    it('supports the plain text conditions case-insensitively', () => {
      expect(matches('Report', rule('textContains', 'notContains', 'draft'))).toBe(true);
      expect(matches('Report', rule('textContains', 'equal', 'report'))).toBe(true);
      expect(matches('Report', rule('textContains', 'notEqual', 'report'))).toBe(false);
      expect(matches('Report', rule('textContains', 'startsWith', 'rep'))).toBe(true);
      expect(matches(123, rule('textContains', 'startsWith', '12'))).toBe(true);
    });

    it('rejects conditions it does not support', () => {
      expect(matches('Report', rule('textContains', 'greaterThan', 'a'))).toBe(false);
    });
  });

  describe('dateOccurring rules', () => {
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date(2024, 0, 15, 12));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('compares dates from Date objects and strings', () => {
      expect(matches(new Date('2024-01-15'), rule('dateOccurring', 'greaterThan', '2024-01-01'))).toBe(true);
      expect(matches('2024-01-15', rule('dateOccurring', 'lessThan', '2024-01-01'))).toBe(false);
      expect(matches('2024-01-15', rule('dateOccurring', 'equal', '2024-01-15'))).toBe(true);
      expect(matches('2024-01-15', rule('dateOccurring', 'between', '2024-01-01', '2024-01-31'))).toBe(true);
      expect(matches('2024-02-15', rule('dateOccurring', 'between', '2024-01-01', '2024-01-31'))).toBe(false);
      expect(matches('2024-01-15', rule('dateOccurring', 'between', '2024-01-01'))).toBe(false);
    });

    it('understands TODAY() with day offsets', () => {
      const tomorrow = new Date(2024, 0, 16, 12);
      expect(matches(tomorrow, rule('dateOccurring', 'greaterThan', 'TODAY()'))).toBe(true);
      expect(matches(tomorrow, rule('dateOccurring', 'greaterThan', 'TODAY()+2'))).toBe(false);
      expect(matches(tomorrow, rule('dateOccurring', 'greaterThan', 'TODAY() - 1'))).toBe(true);
      expect(matches(new Date(2024, 0, 10), rule('dateOccurring', 'lessThan', 'TODAY()-3'))).toBe(true);
    });

    it('never matches unparseable dates or unsupported conditions', () => {
      expect(matches('yesterday', rule('dateOccurring', 'greaterThan', '2024-01-01'))).toBe(false);
      expect(matches('2024-01-15', rule('dateOccurring', 'greaterThan', 'someday'))).toBe(false);
      expect(matches('2024-01-15', rule('dateOccurring', 'greaterThan'))).toBe(false);
      expect(matches('2024-01-15', rule('dateOccurring', 'notEqual', '2024-01-01'))).toBe(false);
    });
  });

  describe('formula rules', () => {
    it('evaluates the formula against the tested cell', () => {
      expect(matches(15, rule('formula', 'equal', '=value>10'))).toBe(true);
      expect(matches(5, rule('formula', 'equal', '=value>10'))).toBe(false);
      expect(matches(0, rule('formula', 'equal', 'value>-1'))).toBe(true);
    });

    it('substitutes 1-based row and col for the tested cell', () => {
      expect(matches('', rule('formula', 'equal', '=row>1'), 1, 0)).toBe(true);
      expect(matches('', rule('formula', 'equal', '=row>1'), 0, 0)).toBe(false);
      expect(matches('', rule('formula', 'equal', '=col>=2'), 0, 1)).toBe(true);
    });

    it('resolves cell references through the data map or the provided lookup', () => {
      const data = new Map<string, CellData>([[keyOf(0, 0), { value: 7 }]]);
      expect(matches('', rule('formula', 'equal', '=A1>5'), 0, 0, data)).toBe(true);
      expect(matches('', rule('formula', 'equal', '=A1>9'), 0, 0, data)).toBe(false);

      const getCell = jest.fn((r: number, c: number): CellData | undefined => (r === 0 && c === 0 ? { value: 12 } : undefined));
      expect(evaluateConditionalFormat('', rule('formula', 'equal', '=A1>9'), 0, 0, data, getCell)).toBe(true);
      expect(getCell).toHaveBeenCalledWith(0, 0);
    });

    it('never matches errors, blank formulas or non-string formulas', () => {
      expect(matches(1, rule('formula', 'equal', '=1/0'))).toBe(false);
      expect(matches(1, rule('formula', 'equal', ''))).toBe(false);
      expect(matches(1, rule('formula', 'equal', '   '))).toBe(false);
      expect(matches(1, rule('formula', 'equal', 5))).toBe(false);
    });

    describe('placeholder substitution', () => {
      let evaluate: jest.SpyInstance;

      beforeEach(() => {
        evaluate = jest.spyOn(formulaUtils, 'evaluateFormula').mockReturnValue(true);
      });

      afterEach(() => {
        evaluate.mockRestore();
      });

      const expressionFor = (value: unknown, formula: string, row = 0, col = 0) => {
        matches(value, rule('formula', 'equal', formula), row, col);
        return evaluate.mock.calls[evaluate.mock.calls.length - 1][0];
      };

      it('inlines numbers and booleans as literals', () => {
        expect(expressionFor(3.5, '=value>1')).toBe('=3.5>1');
        expect(expressionFor(true, 'value')).toBe('=true');
      });

      it('quotes strings, doubling embedded quotes', () => {
        expect(expressionFor('say "hi"', '=value')).toBe('="say ""hi"""');
        expect(expressionFor(undefined, '=value')).toBe('=""');
      });

      it('replaces whole-word placeholders only', () => {
        expect(expressionFor(1, '=revalue+rowcount', 4, 2)).toBe('=revalue+rowcount');
        expect(expressionFor(1, '=row*col', 4, 2)).toBe('=5*3');
      });

      it('treats error results and evaluator failures as no match', () => {
        evaluate.mockReturnValueOnce('#ERROR');
        expect(matches(1, rule('formula', 'equal', '=value'))).toBe(false);
        evaluate.mockReturnValueOnce('yes');
        expect(matches(1, rule('formula', 'equal', '=value'))).toBe(true);
        evaluate.mockImplementationOnce(() => { throw new Error('boom'); });
        expect(matches(1, rule('formula', 'equal', '=value'))).toBe(false);
      });
    });
  });

  it('never matches an unknown rule type or a missing rule', () => {
    expect(matches(1, rule('gradient' as ConditionalFormat['type'], 'equal', 1))).toBe(false);
    expect(matches(1, null as unknown as ConditionalFormat)).toBe(false);
  });

  describe('applyConditionalFormatting', () => {
    it('returns the base format (or an empty one) when the rule does not apply', () => {
      expect(applyConditionalFormatting({ bold: true }, { italic: true }, false)).toEqual({ bold: true });
      expect(applyConditionalFormatting(undefined, { italic: true }, false)).toEqual({});
    });

    it('layers the conditional format over the base, keeping base borders when the rule has none', () => {
      const borders = { top: { color: 'red' } };
      expect(applyConditionalFormatting({ bold: true, borders }, { italic: true }, true)).toEqual({ bold: true, italic: true, borders });
      const ruleBorders = { left: { color: 'blue' } };
      expect(applyConditionalFormatting({ borders }, { borders: ruleBorders }, true)).toEqual({ borders: ruleBorders });
    });
  });

  describe('getApplicableConditionalFormats', () => {
    it('collects the formats of the rules that match, in order', () => {
      const rules: ConditionalFormat[] = [
        { type: 'cellValue', condition: 'greaterThan', value1: 10, format: { bold: true } },
        { type: 'cellValue', condition: 'lessThan', value1: 10, format: { italic: true } },
        { type: 'textContains', condition: 'contains', value1: '5', format: { color: 'red' } },
      ];
      expect(getApplicableConditionalFormats(15, 0, 0, noData, rules)).toEqual([{ bold: true }, { color: 'red' }]);
      expect(getApplicableConditionalFormats(2, 0, 0, noData, rules)).toEqual([{ italic: true }]);
    });
  });

  describe('combineConditionalFormats', () => {
    it('lets later formats override earlier ones while keeping earlier borders', () => {
      const borders = { bottom: { color: 'green' } };
      const combined = combineConditionalFormats(
        { bold: true, color: 'black' },
        [{ color: 'red', borders }, { color: 'blue', italic: true }]
      );
      expect(combined).toEqual({ bold: true, color: 'blue', italic: true, borders });
    });

    it('starts from an empty format when there is no base', () => {
      expect(combineConditionalFormats(undefined, [])).toEqual({});
    });
  });
});
