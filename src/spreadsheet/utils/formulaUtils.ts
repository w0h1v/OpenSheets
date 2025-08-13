import { letterToColumn, columnToLetter } from './columnUtils';

export const parseCellRef = (ref: string): [number, number] => {
  const match = ref.match(/(\$?)([A-Z]+)(\$?)(\d+)/);
  if (!match) throw new Error(`Invalid cell reference: ${ref}`);
  const col = letterToColumn(match[2]);
  const row = parseInt(match[4], 10) - 1;
  return [row, col];
};

export const cellRefToString = (row: number, col: number, absoluteRow = false, absoluteCol = false): string => {
  const colStr = absoluteCol ? '$' + columnToLetter(col) : columnToLetter(col);
  const rowStr = absoluteRow ? '$' + (row + 1) : String(row + 1);
  return colStr + rowStr;
};

export const isAbsoluteRef = (ref: string): { row: boolean; col: boolean } => {
  const match = ref.match(/(\$?)([A-Z]+)(\$?)(\d+)/);
  if (!match) return { row: false, col: false };
  return {
    col: match[1] === '$',
    row: match[3] === '$',
  };
};

export const cellsInRange = (start: string, end: string): [number, number][] => {
  const [sr, sc] = parseCellRef(start);
  const [er, ec] = parseCellRef(end);
  const rows = sr <= er ? [sr, er] : [er, sr];
  const cols = sc <= ec ? [sc, ec] : [ec, sc];
  const output: [number, number][] = [];
  for (let r = rows[0]; r <= rows[1]; r++) {
    for (let c = cols[0]; c <= cols[1]; c++) {
      output.push([r, c]);
    }
  }
  return output;
};

export const updateFormulaReferences = (
  formula: string,
  operation: 'insertRow' | 'deleteRow' | 'insertColumn' | 'deleteColumn',
  index: number,
  count: number = 1
): string => {
  if (!formula.startsWith('=')) return formula;

  // Update cell references in the formula
  return formula.replace(/(\$?)([A-Z]+)(\$?)(\d+)/g, (_match, dollarCol, colLetters, dollarRow, rowNum) => {
    const col = letterToColumn(colLetters);
    const row = parseInt(rowNum, 10) - 1;
    const isAbsCol = dollarCol === '$';
    const isAbsRow = dollarRow === '$';

    let newRow = row;
    let newCol = col;

    if (operation === 'insertRow' && !isAbsRow && row >= index) {
      newRow = row + count;
    } else if (operation === 'deleteRow' && !isAbsRow) {
      if (row >= index && row < index + count) {
        return '#REF!';
      } else if (row >= index + count) {
        newRow = row - count;
      }
    } else if (operation === 'insertColumn' && !isAbsCol && col >= index) {
      newCol = col + count;
    } else if (operation === 'deleteColumn' && !isAbsCol) {
      if (col >= index && col < index + count) {
        return '#REF!';
      } else if (col >= index + count) {
        newCol = col - count;
      }
    }

    return cellRefToString(newRow, newCol, isAbsRow, isAbsCol);
  });
};

export const evaluateFormula = (
  formula: string,
  getCellValue: (r: number, c: number) => any
): any => {
  if (!formula.startsWith('=')) return formula;
  let expr = formula.slice(1);

  // Handle cell references with absolute notation
  expr = expr.replace(/(\$?)([A-Z]+)(\$?)(\d+)(?!:)/g, (match, _dollarCol, _colLetters, _dollarRow, _rowNum) => {
    const [r, c] = parseCellRef(match);
    const value = getCellValue(r, c);
    return JSON.stringify(value ?? 0);
  });

  // Handle ranges
  expr = expr.replace(/(\$?)([A-Z]+)(\$?)(\d+):(\$?)([A-Z]+)(\$?)(\d+)/g, (match) => {
    const [start, end] = match.split(':');
    const cells = cellsInRange(start, end);
    const values = cells.map(([r, c]) => getCellValue(r, c)).filter(v => v !== undefined && v !== null);
    return JSON.stringify(values);
  });

  // Handle functions
  expr = expr.replace(/(SUM|AVERAGE|COUNT|MIN|MAX|IF|CONCAT|LEN|ROUND|ABS)\(([^)]+)\)/gi, (match, fnName, args) => {
    const parts = args.split(',').map((p: string) => p.trim());
    let values: any[] = [];
    
    for (const part of parts) {
      try {
        const parsed = JSON.parse(part);
        if (Array.isArray(parsed)) {
          values.push(...parsed);
        } else {
          values.push(parsed);
        }
      } catch {
        // If not JSON, treat as literal value
        values.push(part);
      }
    }

    switch (fnName.toUpperCase()) {
      case 'SUM':
        return String(values.flat().reduce((a, b) => Number(a) + Number(b), 0));
      case 'AVERAGE':
        const nums = values.flat().map(Number).filter(n => !isNaN(n));
        return String(nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0);
      case 'COUNT':
        return String(values.flat().filter(v => v !== null && v !== undefined && v !== '').length);
      case 'MIN':
        return String(Math.min(...values.flat().map(Number).filter(n => !isNaN(n))));
      case 'MAX':
        return String(Math.max(...values.flat().map(Number).filter(n => !isNaN(n))));
      case 'IF':
        return values[0] ? values[1] : values[2];
      case 'CONCAT':
        return String(values.flat().join(''));
      case 'LEN':
        return String(String(values[0]).length);
      case 'ROUND':
        return String(Math.round(Number(values[0])));
      case 'ABS':
        return String(Math.abs(Number(values[0])));
      default:
        return match;
    }
  });

  try {
    // eslint-disable-next-line no-new-func
    return Function(`"use strict"; return (${expr})`)();
  } catch {
    return `#ERROR`;
  }
};