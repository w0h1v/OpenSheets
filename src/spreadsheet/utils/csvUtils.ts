import { CellData, SparseMatrix, keyOf } from '../types/spreadsheet';

interface CSVOptions {
  delimiter?: string;
  quote?: string;
  escape?: string;
  lineBreak?: string;
  includeHeaders?: boolean;
  includeFormulas?: boolean;
}

const defaultOptions: CSVOptions = {
  delimiter: ',',
  quote: '"',
  escape: '"',
  lineBreak: '\n',
  includeHeaders: true,
  includeFormulas: false,
};

export function parseCSV(
  csvText: string,
  options: CSVOptions = {}
): { data: SparseMatrix<CellData>; rows: number; cols: number } {
  const opts = { ...defaultOptions, ...options };
  const data = new Map<string, CellData>();
  
  const lines = csvText.split(/\r?\n/);
  let maxCol = 0;
  let row = 0;

  for (const line of lines) {
    if (!line.trim()) continue;
    
    const cells = parseCSVLine(line, opts.delimiter!, opts.quote!, opts.escape!);
    maxCol = Math.max(maxCol, cells.length);
    
    cells.forEach((cellValue, col) => {
      if (cellValue !== '') {
        // Try to parse as number
        const numValue = Number(cellValue);
        const value = !isNaN(numValue) && cellValue.trim() === String(numValue) 
          ? numValue 
          : cellValue;
        
        data.set(keyOf(row, col), { value });
      }
    });
    
    row++;
  }

  return { data, rows: row, cols: maxCol };
}

function parseCSVLine(line: string, delimiter: string, quote: string, escape: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (inQuotes) {
      if (char === quote) {
        if (nextChar === quote || nextChar === escape) {
          // Escaped quote
          current += quote;
          i += 2;
        } else {
          // End of quoted field
          inQuotes = false;
          i++;
        }
      } else {
        current += char;
        i++;
      }
    } else {
      if (char === quote) {
        inQuotes = true;
        i++;
      } else if (char === delimiter) {
        cells.push(current);
        current = '';
        i++;
      } else {
        current += char;
        i++;
      }
    }
  }

  cells.push(current);
  return cells;
}

export function exportToCSV(
  data: SparseMatrix<CellData>,
  _maxRows: number,
  _maxCols: number,
  options: CSVOptions = {}
): string {
  const opts = { ...defaultOptions, ...options };
  const lines: string[] = [];

  // Find actual data bounds
  let actualMaxRow = 0;
  let actualMaxCol = 0;
  data.forEach((_, key) => {
    const [row, col] = key.split(':').map(Number);
    actualMaxRow = Math.max(actualMaxRow, row);
    actualMaxCol = Math.max(actualMaxCol, col);
  });

  // Generate CSV
  for (let row = 0; row <= actualMaxRow; row++) {
    const cells: string[] = [];
    
    for (let col = 0; col <= actualMaxCol; col++) {
      const cellData = data.get(keyOf(row, col));
      let value = '';
      
      if (cellData) {
        if (opts.includeFormulas && cellData.formula) {
          value = cellData.formula;
        } else {
          value = cellData.value?.toString() ?? '';
        }
      }
      
      // Escape the value if needed
      if (value.includes(opts.delimiter!) || value.includes(opts.quote!) || value.includes('\n')) {
        value = opts.quote + value.replace(new RegExp(opts.quote!, 'g'), opts.escape! + opts.quote) + opts.quote;
      }
      
      cells.push(value);
    }
    
    lines.push(cells.join(opts.delimiter!));
  }

  return lines.join(opts.lineBreak!);
}

export function downloadCSV(
  data: SparseMatrix<CellData>,
  maxRows: number,
  maxCols: number,
  filename: string = 'spreadsheet.csv',
  options: CSVOptions = {}
): void {
  const csv = exportToCSV(data, maxRows, maxCols, options);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  
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
        const text = e.target?.result as string;
        const result = parseCSV(text);
        resolve(result);
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    
    reader.readAsText(file);
  });
}