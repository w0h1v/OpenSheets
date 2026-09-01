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

const MAX_FORMULA_DEPTH = 32;

export const evaluateFormula = (
  formula: string,
  getCellValue: (r: number, c: number) => any
): any => evaluateFormulaDepth(formula, getCellValue, 0);

// Resolves the value of a referenced cell. Accepts either a raw value or a
// CellData object from context getCell(); formula cells are evaluated
// recursively (with a depth cap that surfaces as #CYCLE!)
const evaluateFormulaDepth = (
  formula: string,
  getCellValue: (r: number, c: number) => any,
  depth: number
): any => {
  if (!formula.startsWith('=')) return formula;
  if (depth > MAX_FORMULA_DEPTH) return '#CYCLE!';
  const cellValueOf = (v: any): any => {
    if (v === null || typeof v !== 'object' || Array.isArray(v) || !('value' in v)) {
      return v;
    }
    const cell = v as { value?: any; formula?: string };
    if (cell.formula && String(cell.formula).startsWith('=')) {
      return evaluateFormulaDepth(cell.formula, getCellValue, depth + 1);
    }
    return cell.value;
  };
  let expr = formula.slice(1);

  // Ranges must be replaced first so their cell refs are not each
  // substituted as single values (which would corrupt A1:A3)
  expr = expr.replace(/(\$?[A-Z]+\$?\d+):(\$?[A-Z]+\$?\d+)/g, (match) => {
    const [start, end] = match.split(':');
    const cells = cellsInRange(start, end);
    const values = cells
      .map(([r, c]) => cellValueOf(getCellValue(r, c)))
      .filter((v) => v !== undefined && v !== null);
    return JSON.stringify(values);
  });

  // Single cell references
  expr = expr.replace(/(\$?)([A-Z]+)(\$?)(\d+)/g, (match) => {
    const [r, c] = parseCellRef(match);
    const value = cellValueOf(getCellValue(r, c));
    return JSON.stringify(value ?? 0);
  });

  // Split function arguments on top-level commas only, so JSON arrays
  // produced by range substitution (e.g. [10,20,30]) stay intact
  const splitArgs = (args: string): string[] => {
    const parts: string[] = [];
    let depth = 0;
    let inString = false;
    let current = '';
    for (const ch of args) {
      if (ch === '"') inString = !inString;
      if (!inString && (ch === '[' || ch === '(')) depth++;
      if (!inString && (ch === ']' || ch === ')')) depth--;
      if (ch === ',' && depth === 0 && !inString) {
        parts.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    if (current.trim() !== '') parts.push(current);
    return parts;
  };

  // Handle functions (args contain no nested parentheses at this point;
  // ranges have already become JSON arrays)
  expr = expr.replace(/(SUM|AVERAGE|COUNT|MIN|MAX|IF|CONCAT|LEN|ROUND|ABS|TODAY|NOW)\(([^()]*)\)/gi, (match, fnName, args) => {
    const values: any[] = [];

    for (const part of splitArgs(args)) {
      const trimmed = part.trim();
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          values.push(...parsed);
        } else {
          values.push(parsed);
        }
      } catch {
        // If not JSON, treat as literal value
        values.push(trimmed);
      }
    }

    const flat = values.flat();
    switch (fnName.toUpperCase()) {
      case 'SUM':
        return String(flat.reduce((a, b) => Number(a) + Number(b), 0));
      case 'AVERAGE': {
        const nums = flat.map(Number).filter((n) => !isNaN(n));
        return String(nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0);
      }
      case 'COUNT':
        return String(flat.filter((v) => v !== null && v !== undefined && v !== '').length);
      case 'MIN':
        return String(Math.min(...flat.map(Number).filter((n) => !isNaN(n))));
      case 'MAX':
        return String(Math.max(...flat.map(Number).filter((n) => !isNaN(n))));
      case 'IF':
        return String(values[0] ? values[1] : values[2]);
      case 'CONCAT':
        return String(flat.join(''));
      case 'LEN':
        return String(String(values[0]).length);
      case 'ROUND':
        return String(Math.round(Number(values[0])));
      case 'ABS':
        return String(Math.abs(Number(values[0])));
      case 'TODAY': {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        return JSON.stringify(d.toISOString());
      }
      case 'NOW':
        return JSON.stringify(new Date().toISOString());
      default:
        return match;
    }
  });

  try {
    // eslint-disable-next-line no-new-func
    const result = Function(`"use strict"; return (${expr})`)();
    if (typeof result === 'number' && !isFinite(result)) {
      return '#ERROR';
    }
    // TODAY()/NOW() come back as ISO strings; hand the caller a real Date
    if (typeof result === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(result)) {
      return new Date(result);
    }
    return result;
  } catch {
    return `#ERROR`;
  }
};
