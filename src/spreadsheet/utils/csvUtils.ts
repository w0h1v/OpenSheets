import { CellData, CellValue, SparseMatrix, keyOf, parseKey } from '../types/spreadsheet';

export interface CSVOptions {
  delimiter?: string;
  quote?: string;
  lineBreak?: string;
  /** Write formulas instead of their computed values. */
  includeFormulas?: boolean;
  /**
   * Prefix text values that start with a character a spreadsheet app would
   * interpret as a formula (= + - @, tab, CR) with a quote, so an exported
   * file cannot execute on open (OWASP CSV-injection guidance). Numbers are
   * never touched, and includeFormulas output is written as-is.
   */
  guardFormulaInjection?: boolean;
}

const DEFAULTS: Required<CSVOptions> = {
  delimiter: ',',
  quote: '"',
  lineBreak: '\n',
  includeFormulas: false,
  guardFormulaInjection: true,
};

// Numeric-looking text becomes a number; everything else stays text
const coerce = (text: string): CellValue => {
  const trimmed = text.trim();
  if (trimmed === '') return text;
  const n = Number(trimmed);
  return Number.isFinite(n) && String(n) === trimmed ? n : text;
};

/**
 * RFC 4180 parsing: quoted fields may contain delimiters, line breaks and
 * doubled quotes; CR, LF and CRLF all end a record; a line with nothing on
 * it is skipped.
 */
export function parseCSV(
  csvText: string,
  options: CSVOptions = {}
): { data: SparseMatrix<CellData>; rows: number; cols: number } {
  const { delimiter, quote } = { ...DEFAULTS, ...options };
  const data = new Map<string, CellData>();
  let row = 0;
  let col = 0;
  let cols = 0;
  let field = '';
  let quoted = false;

  const endField = () => {
    if (field !== '') data.set(keyOf(row, col), { value: coerce(field) });
    col++;
    cols = Math.max(cols, col);
    field = '';
  };
  const endRow = () => {
    if (col === 0 && field.trim() === '') {
      field = '';
      return;
    }
    endField();
    row++;
    col = 0;
  };

  for (let i = 0; i < csvText.length; i++) {
    const ch = csvText[i];
    if (quoted) {
      if (ch !== quote) field += ch;
      else if (csvText[i + 1] === quote) { field += quote; i++; }
      else quoted = false;
    } else if (ch === quote && field === '') {
      quoted = true;
    } else if (ch === delimiter) {
      endField();
    } else if (ch === '\n') {
      endRow();
    } else if (ch === '\r') {
      if (csvText[i + 1] === '\n') i++;
      endRow();
    } else {
      field += ch;
    }
  }
  if (field !== '' || col > 0) endRow();

  return { data, rows: row, cols };
}

export function exportToCSV(data: SparseMatrix<CellData>, options: CSVOptions = {}): string {
  const { delimiter, quote, lineBreak, includeFormulas, guardFormulaInjection } = { ...DEFAULTS, ...options };
  let lastRow = -1;
  let lastCol = -1;
  data.forEach((_, key) => {
    const [row, col] = parseKey(key);
    lastRow = Math.max(lastRow, row);
    lastCol = Math.max(lastCol, col);
  });

  const escape = (text: string) =>
    text.includes(delimiter) || text.includes(quote) || /[\r\n]/.test(text)
      ? quote + text.split(quote).join(quote + quote) + quote
      : text;

  const lines: string[] = [];
  for (let row = 0; row <= lastRow; row++) {
    const cells: string[] = [];
    for (let col = 0; col <= lastCol; col++) {
      const cell = data.get(keyOf(row, col));
      let text = '';
      let isFormula = false;
      if (cell) {
        if (includeFormulas && cell.formula) {
          text = cell.formula;
          isFormula = true;
        } else if (cell.value instanceof Date) {
          text = cell.value.toISOString();
        } else {
          text = String(cell.value ?? '');
        }
      }
      // Only string values can carry an injection; numbers and dates export
      // as themselves, and an explicit includeFormulas export is intentional
      if (guardFormulaInjection && !isFormula && typeof cell?.value === 'string' && /^[=+\-@\t\r]/.test(text)) {
        text = `'${text}`;
      }
      cells.push(escape(text));
    }
    lines.push(cells.join(delimiter));
  }
  return lines.join(lineBreak);
}

export function downloadCSV(data: SparseMatrix<CellData>, filename = 'spreadsheet.csv', options: CSVOptions = {}): void {
  const blob = new Blob([exportToCSV(data, options)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function importFromCSVFile(file: File): Promise<{ data: SparseMatrix<CellData>; rows: number; cols: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        resolve(parseCSV(String(e.target?.result ?? '')));
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}
