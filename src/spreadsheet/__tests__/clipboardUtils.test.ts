import { serializeTabular, parseTabular } from '../utils/clipboardUtils';

describe('clipboardUtils', () => {
  it('serializes rows as tab-separated lines', () => {
    expect(serializeTabular([['a', 'b'], ['c', 'd']])).toBe('a\tb\nc\td');
  });

  it('parses tab-separated lines back into rows', () => {
    expect(parseTabular('a\tb\nc\td')).toEqual([['a', 'b'], ['c', 'd']]);
  });

  it('round-trips a grid with empty cells', () => {
    const grid = [['1', '', '3'], ['', 'x', '']];
    expect(parseTabular(serializeTabular(grid))).toEqual(grid);
  });

  it('strips carriage returns from Windows line endings', () => {
    expect(parseTabular('a\tb\r\nc\td\r\n')).toEqual([['a', 'b'], ['c', 'd'], ['']]);
  });

  it('treats a single value as a one-cell grid', () => {
    expect(parseTabular('hello')).toEqual([['hello']]);
    expect(serializeTabular([['hello']])).toBe('hello');
  });
});
