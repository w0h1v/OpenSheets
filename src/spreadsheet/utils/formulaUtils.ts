import { letterToColumn, columnToLetter } from './columnUtils';
import { evaluateFormula as evaluateWithEngine } from '../formula/evaluator';

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

/**
 * Evaluates a formula with the built-in parser/interpreter. The accessor may
 * return raw values or CellData objects; formula cells are evaluated
 * recursively with cycle detection. See src/spreadsheet/formula/evaluator.ts
 * for the value semantics.
 */
export const evaluateFormula = (
  formula: string,
  getCellValue: (r: number, c: number) => any
): any => evaluateWithEngine(formula, getCellValue);

export { FORMULA_FUNCTIONS } from '../formula/functions';
export type { FormulaFunctionInfo } from '../formula/functions';
