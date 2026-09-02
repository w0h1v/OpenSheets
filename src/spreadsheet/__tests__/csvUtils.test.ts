import { parseCSV, exportToCSV, downloadCSV, importFromCSVFile } from '../utils/csvUtils';
import { CellData, keyOf } from '../types/spreadsheet';

const dataOf = (cells: Array<[number, number, CellData]>) =>
  new Map(cells.map(([r, c, d]) => [keyOf(r, c), d] as [string, CellData]));

const valueAt = (data: Map<string, CellData>, r: number, c: number) => data.get(keyOf(r, c))?.value;

describe('csvUtils', () => {
  describe('parseCSV', () => {
    it('splits rows and columns and converts numeric text to numbers', () => {
      const { data, rows, cols } = parseCSV('name,qty\nwidget,3');
      expect(valueAt(data, 0, 0)).toBe('name');
      expect(valueAt(data, 0, 1)).toBe('qty');
      expect(valueAt(data, 1, 0)).toBe('widget');
      expect(valueAt(data, 1, 1)).toBe(3);
      expect(rows).toBe(2);
      expect(cols).toBe(2);
    });

    it('keeps delimiters inside quoted fields', () => {
      const { data, cols } = parseCSV('"a, b",c');
      expect(valueAt(data, 0, 0)).toBe('a, b');
      expect(valueAt(data, 0, 1)).toBe('c');
      expect(cols).toBe(2);
    });

    it('unescapes doubled quotes inside quoted fields', () => {
      const { data } = parseCSV('"say ""hi""",x');
      expect(valueAt(data, 0, 0)).toBe('say "hi"');
      expect(valueAt(data, 0, 1)).toBe('x');
    });

    it('accepts CRLF line endings', () => {
      const { data, rows } = parseCSV('a,b\r\nc,d\r\n');
      expect(valueAt(data, 1, 0)).toBe('c');
      expect(valueAt(data, 1, 1)).toBe('d');
      expect(rows).toBe(2);
    });

    it('leaves empty fields out of the sparse map but counts their column', () => {
      const { data, cols } = parseCSV('a,,c');
      expect(data.has(keyOf(0, 1))).toBe(false);
      expect(valueAt(data, 0, 2)).toBe('c');
      expect(cols).toBe(3);
    });

    it('skips blank lines without consuming a row index', () => {
      const { data, rows } = parseCSV('a\n\n   \nb');
      expect(valueAt(data, 1, 0)).toBe('b');
      expect(rows).toBe(2);
    });

    it('only converts text that round-trips exactly as a number', () => {
      const { data } = parseCSV('007,1e3, 42 ,-2.5');
      expect(valueAt(data, 0, 0)).toBe('007');
      expect(valueAt(data, 0, 1)).toBe('1e3');
      expect(valueAt(data, 0, 2)).toBe(42);
      expect(valueAt(data, 0, 3)).toBe(-2.5);
    });

    it('honours a custom delimiter', () => {
      const { data } = parseCSV('a;b', { delimiter: ';' });
      expect(valueAt(data, 0, 0)).toBe('a');
      expect(valueAt(data, 0, 1)).toBe('b');
    });

    it('returns an empty sheet for empty input', () => {
      expect(parseCSV('')).toEqual({ data: new Map(), rows: 0, cols: 0 });
    });
  });

  describe('exportToCSV', () => {
    it('writes rows up to the last populated cell, filling gaps with empty fields', () => {
      const data = dataOf([[0, 0, { value: 'a' }], [1, 2, { value: 'c' }]]);
      expect(exportToCSV(data, 100, 100)).toBe('a,,\n,,c');
    });

    it('quotes values containing the delimiter, quotes or newlines', () => {
      const data = dataOf([[0, 0, { value: 'a,b' }], [0, 1, { value: 'say "hi"' }], [0, 2, { value: 'line\nbreak' }]]);
      expect(exportToCSV(data, 1, 3)).toBe('"a,b","say ""hi""","line\nbreak"');
    });

    it('exports values by default and formulas when asked', () => {
      const data = dataOf([[0, 0, { value: 3, formula: '=1+2' }], [0, 1, { value: null }]]);
      expect(exportToCSV(data, 1, 2)).toBe('3,');
      expect(exportToCSV(data, 1, 2, { includeFormulas: true })).toBe('=1+2,');
    });

    it('uses the configured line break and delimiter', () => {
      const data = dataOf([[0, 0, { value: 1 }], [1, 0, { value: 2 }]]);
      expect(exportToCSV(data, 2, 1, { lineBreak: '\r\n', delimiter: ';' })).toBe('1\r\n2');
      const wide = dataOf([[0, 0, { value: 1 }], [0, 1, { value: 2 }]]);
      expect(exportToCSV(wide, 1, 2, { delimiter: ';' })).toBe('1;2');
    });

    it('round-trips through parseCSV', () => {
      const original = dataOf([
        [0, 0, { value: 'name' }], [0, 1, { value: 'note' }],
        [1, 0, { value: 12.5 }], [1, 1, { value: 'quote "me", please' }],
        [2, 1, { value: true }],
      ]);
      const { data } = parseCSV(exportToCSV(original, 3, 2));
      expect(valueAt(data, 0, 0)).toBe('name');
      expect(valueAt(data, 1, 0)).toBe(12.5);
      expect(valueAt(data, 1, 1)).toBe('quote "me", please');
      expect(valueAt(data, 2, 1)).toBe('true');
      expect(data.has(keyOf(2, 0))).toBe(false);
    });
  });

  describe('downloadCSV', () => {
    const createObjectURL = jest.fn((_blob: Blob) => 'blob:sheet');
    const revokeObjectURL = jest.fn((_url: string) => undefined);

    beforeEach(() => {
      Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
      Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    });

    afterEach(() => {
      Reflect.deleteProperty(URL, 'createObjectURL');
      Reflect.deleteProperty(URL, 'revokeObjectURL');
      jest.restoreAllMocks();
    });

    it('clicks a temporary download link and revokes the object URL', () => {
      const clicked: HTMLAnchorElement[] = [];
      jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
        clicked.push(this);
      });

      downloadCSV(dataOf([[0, 0, { value: 'a' }]]), 10, 10, 'export.csv');

      expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
      expect(clicked).toHaveLength(1);
      expect(clicked[0].getAttribute('href')).toBe('blob:sheet');
      expect(clicked[0].getAttribute('download')).toBe('export.csv');
      expect(document.body.contains(clicked[0])).toBe(false);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:sheet');
    });
  });

  describe('importFromCSVFile', () => {
    it('reads and parses a File', async () => {
      const file = new File(['h1,h2\n1,2'], 'sheet.csv', { type: 'text/csv' });
      const { data, rows, cols } = await importFromCSVFile(file);
      expect(valueAt(data, 0, 0)).toBe('h1');
      expect(valueAt(data, 1, 1)).toBe(2);
      expect([rows, cols]).toEqual([2, 2]);
    });
  });
});
