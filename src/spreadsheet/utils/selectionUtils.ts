import { Selection, SelectionRect } from '../types/spreadsheet';

export const normalizeRect = (rect: SelectionRect): SelectionRect => ({
  startRow: Math.min(rect.startRow, rect.endRow),
  startCol: Math.min(rect.startCol, rect.endCol),
  endRow: Math.max(rect.startRow, rect.endRow),
  endCol: Math.max(rect.startCol, rect.endCol),
});

export const isCellInSelection = (
  row: number,
  col: number,
  selection: Selection
): boolean => {
  for (const rect of selection.ranges) {
    const n = normalizeRect(rect);
    if (
      row >= n.startRow &&
      row <= n.endRow &&
      col >= n.startCol &&
      col <= n.endCol
    ) {
      return true;
    }
  }
  return false;
};

export const singleCellSelection = (
  row: number,
  col: number
): Selection => ({
  ranges: [{ startRow: row, startCol: col, endRow: row, endCol: col }],
  active: { row, col },
});