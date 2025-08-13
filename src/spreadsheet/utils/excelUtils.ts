import * as XLSX from 'xlsx';
import { CellData, SparseMatrix, keyOf, CellFormat } from '../types/spreadsheet';
import { autoDetectFormat } from './formatUtils';

export interface ExcelImportOptions {
  sheetIndex?: number;
  sheetName?: string;
  headerRow?: boolean;
  maxRows?: number;
  maxCols?: number;
  includeFormatting?: boolean;
  autoDetectFormats?: boolean;
  preserveFormulas?: boolean;
}

export interface ExcelExportOptions {
  sheetName?: string;
  includeFormulas?: boolean;
  includeFormatting?: boolean;
  author?: string;
  title?: string;
  description?: string;
  formatAsTable?: boolean;
  freezeHeaders?: boolean;
}

export async function importFromExcel(
  file: File,
  options: ExcelImportOptions = {}
): Promise<{ data: SparseMatrix<CellData>; rows: number; cols: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary', cellFormula: true });
        
        // Select worksheet
        let worksheet: XLSX.WorkSheet;
        if (options.sheetName) {
          worksheet = workbook.Sheets[options.sheetName];
          if (!worksheet) {
            throw new Error(`Sheet "${options.sheetName}" not found`);
          }
        } else {
          const sheetIndex = options.sheetIndex ?? 0;
          const sheetName = workbook.SheetNames[sheetIndex];
          if (!sheetName) {
            throw new Error(`Sheet index ${sheetIndex} not found`);
          }
          worksheet = workbook.Sheets[sheetName];
        }
        
        // Convert to sparse matrix
        const result = convertWorksheetToSparseMatrix(worksheet, options);
        resolve(result);
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Failed to read Excel file'));
    };
    
    reader.readAsBinaryString(file);
  });
}

function convertWorksheetToSparseMatrix(
  worksheet: XLSX.WorkSheet,
  options: ExcelImportOptions
): { data: SparseMatrix<CellData>; rows: number; cols: number } {
  const data = new Map<string, CellData>();
  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
  
  const maxRows = Math.min(range.e.r + 1, options.maxRows ?? 1000);
  const maxCols = Math.min(range.e.c + 1, options.maxCols ?? 100);
  
  for (let row = 0; row < maxRows; row++) {
    for (let col = 0; col < maxCols; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
      const cell = worksheet[cellAddress];
      
      if (cell) {
        const cellData: CellData = { value: '' };
        
        // Handle value
        if (cell.v !== undefined) {
          cellData.value = cell.v;
        }
        
        // Handle formula
        if (cell.f && options.preserveFormulas !== false) {
          cellData.formula = '=' + cell.f;
        }
        
        // Handle formatting
        if (options.includeFormatting && cell.s) {
          cellData.format = convertExcelFormatToOpenSheets(cell.s);
        } else if (options.autoDetectFormats !== false && cellData.value) {
          // Auto-detect format from value
          const detected = autoDetectFormat(cellData.value);
          cellData.format = detected.format;
          cellData.value = detected.value;
        }
        
        // Handle cell type
        switch (cell.t) {
          case 'n': // number
            cellData.value = Number(cell.v);
            break;
          case 's': // string
            cellData.value = String(cell.v);
            break;
          case 'b': // boolean
            cellData.value = Boolean(cell.v);
            break;
          case 'd': // date
            cellData.value = cell.v;
            break;
        }
        
        if (Object.keys(cellData).length > 0) {
          data.set(keyOf(row, col), cellData);
        }
      }
    }
  }
  
  return { data, rows: maxRows, cols: maxCols };
}

function convertExcelFormatToOpenSheets(style: any): CellFormat {
  const format: CellFormat = {};
  
  if (style.font) {
    if (style.font.bold) format.bold = true;
    if (style.font.italic) format.italic = true;
    if (style.font.underline) format.underline = true;
    if (style.font.strike) format.strikethrough = true;
    if (style.font.color) format.color = `#${style.font.color.rgb || '000000'}`;
  }
  
  if (style.fill && style.fill.fgColor) {
    format.backgroundColor = `#${style.fill.fgColor.rgb || 'FFFFFF'}`;
  }
  
  if (style.alignment) {
    if (style.alignment.horizontal) {
      format.textAlign = style.alignment.horizontal;
    }
    if (style.alignment.vertical) {
      format.verticalAlign = style.alignment.vertical;
    }
  }
  
  return format;
}

export function exportToExcel(
  data: SparseMatrix<CellData>,
  _maxRows: number,
  _maxCols: number,
  filename: string = 'spreadsheet.xlsx',
  options: ExcelExportOptions = {}
): void {
  // Create workbook
  const wb = XLSX.utils.book_new();
  
  // Set workbook properties
  if (options.author || options.title) {
    wb.Props = {
      Title: options.title || 'Spreadsheet',
      Author: options.author || 'OpenSheets',
      CreatedDate: new Date(),
    };
  }
  
  // Create worksheet data
  const wsData: any[][] = [];
  
  // Find actual data bounds
  let actualMaxRow = 0;
  let actualMaxCol = 0;
  data.forEach((_, key) => {
    const [row, col] = key.split(':').map(Number);
    actualMaxRow = Math.max(actualMaxRow, row);
    actualMaxCol = Math.max(actualMaxCol, col);
  });
  
  // Build worksheet array
  for (let row = 0; row <= actualMaxRow; row++) {
    const rowData: any[] = [];
    for (let col = 0; col <= actualMaxCol; col++) {
      const cellData = data.get(keyOf(row, col));
      if (cellData) {
        if (options.includeFormulas && cellData.formula) {
          rowData[col] = cellData.formula;
        } else {
          rowData[col] = cellData.value ?? '';
        }
      } else {
        rowData[col] = '';
      }
    }
    wsData[row] = rowData;
  }
  
  // Create worksheet
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  
  // Apply formulas if requested
  if (options.includeFormulas) {
    data.forEach((cellData, key) => {
      if (cellData.formula) {
        const [row, col] = key.split(':').map(Number);
        const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
        if (ws[cellAddress]) {
          ws[cellAddress].f = cellData.formula.substring(1); // Remove '=' prefix
        }
      }
    });
  }
  
  // Apply formatting if requested
  if (options.includeFormatting) {
    data.forEach((cellData, key) => {
      if (cellData.format) {
        const [row, col] = key.split(':').map(Number);
        const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
        if (ws[cellAddress]) {
          ws[cellAddress].s = convertToExcelFormat(cellData.format);
        }
      }
    });
  }
  
  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(wb, ws, options.sheetName || 'Sheet1');
  
  // Write file
  XLSX.writeFile(wb, filename);
}

function convertToExcelFormat(format: CellFormat): any {
  const style: any = {};
  
  // Font styles
  const font: any = {};
  if (format.bold) font.bold = true;
  if (format.italic) font.italic = true;
  if (format.underline) font.underline = true;
  if (format.strikethrough) font.strike = true;
  if (format.fontFamily) font.name = format.fontFamily;
  if (format.fontSize) font.sz = format.fontSize;
  if (format.color) {
    font.color = { rgb: format.color.replace('#', '').toUpperCase() };
  }
  
  if (Object.keys(font).length > 0) {
    style.font = font;
  }
  
  // Fill/background color
  if (format.backgroundColor) {
    style.fill = {
      fgColor: { rgb: format.backgroundColor.replace('#', '').toUpperCase() }
    };
  }
  
  // Alignment
  const alignment: any = {};
  if (format.textAlign) {
    alignment.horizontal = format.textAlign;
  }
  if (format.verticalAlign) {
    alignment.vertical = format.verticalAlign;
  }
  if (format.wrapText) {
    alignment.wrapText = true;
  }
  if (format.textRotation) {
    alignment.textRotation = format.textRotation;
  }
  
  if (Object.keys(alignment).length > 0) {
    style.alignment = alignment;
  }
  
  // Borders
  if (format.borders) {
    const borders: any = {};
    if (format.borders.top) {
      borders.top = {
        style: format.borders.top.style || 'thin',
        color: { rgb: (format.borders.top.color || '#000000').replace('#', '').toUpperCase() }
      };
    }
    if (format.borders.right) {
      borders.right = {
        style: format.borders.right.style || 'thin',
        color: { rgb: (format.borders.right.color || '#000000').replace('#', '').toUpperCase() }
      };
    }
    if (format.borders.bottom) {
      borders.bottom = {
        style: format.borders.bottom.style || 'thin',
        color: { rgb: (format.borders.bottom.color || '#000000').replace('#', '').toUpperCase() }
      };
    }
    if (format.borders.left) {
      borders.left = {
        style: format.borders.left.style || 'thin',
        color: { rgb: (format.borders.left.color || '#000000').replace('#', '').toUpperCase() }
      };
    }
    
    if (Object.keys(borders).length > 0) {
      style.border = borders;
    }
  }
  
  // Number format
  if (format.numberFormat && format.formatType !== 'text') {
    style.numFmt = format.numberFormat;
  }
  
  return style;
}

export function getWorksheetNames(file: File): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        resolve(workbook.SheetNames);
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Failed to read Excel file'));
    };
    
    reader.readAsBinaryString(file);
  });
}