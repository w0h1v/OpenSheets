import { SpreadsheetState, CellData, keyOf, parseKey } from '../types/spreadsheet';
import { SpreadsheetAction } from '../types/actions';
import { updateFormulaReferences } from '../utils/formulaUtils';
import { normalizeRect } from '../utils/selectionUtils';

export function spreadsheetReducer(
  state: SpreadsheetState,
  action: SpreadsheetAction
): SpreadsheetState {
  switch (action.type) {
    case 'SET_CELL': {
      const { row, col, data } = action.payload;
      const key = keyOf(row, col);
      const existing = state.data.get(key) || { value: '' };
      const updated: CellData = { ...existing, ...data, value: data.value ?? existing.value };
      const newData = new Map(state.data);
      
      if (updated.value === '' && !updated.formula && !updated.format) {
        newData.delete(key);
      } else {
        newData.set(key, updated);
      }
      
      return { ...state, data: newData };
    }

    case 'SET_CELLS': {
      const newData = new Map(state.data);
      action.payload.updates.forEach(({ row, col, data }) => {
        const key = keyOf(row, col);
        const existing = newData.get(key) || { value: '' };
        const updated: CellData = { ...existing, ...data, value: data.value ?? existing.value };
        
        if (updated.value === '' && !updated.formula && !updated.format) {
          newData.delete(key);
        } else {
          newData.set(key, updated);
        }
      });
      return { ...state, data: newData };
    }

    case 'CLEAR_CELL': {
      const { row, col } = action.payload;
      const newData = new Map(state.data);
      newData.delete(keyOf(row, col));
      return { ...state, data: newData };
    }

    case 'CLEAR_RANGE': {
      const { range } = action.payload;
      const normalized = normalizeRect(range);
      const newData = new Map(state.data);
      
      for (let r = normalized.startRow; r <= normalized.endRow; r++) {
        for (let c = normalized.startCol; c <= normalized.endCol; c++) {
          newData.delete(keyOf(r, c));
        }
      }
      
      return { ...state, data: newData };
    }

    case 'SET_SELECTION':
      return { ...state, selection: action.payload };

    case 'ADD_SELECTION_RANGE':
      return {
        ...state,
        selection: {
          ...state.selection,
          ranges: [...state.selection.ranges, action.payload],
        },
      };

    case 'SET_EDITING':
      return { ...state, editing: action.payload };

    case 'SET_FORMULA_INPUT':
      return { ...state, formulaInput: action.payload };

    case 'INSERT_ROW': {
      const { index, count = 1 } = action.payload;
      const newData = new Map<string, CellData>();
      const newRowHeights = [...(state.rowHeights || [])];
      
      // Shift existing data down
      state.data.forEach((cellData, key) => {
        const [row, col] = parseKey(key);
        if (row >= index) {
          // Update formulas that reference shifted cells
          const updatedCellData = cellData.formula
            ? { ...cellData, formula: updateFormulaReferences(cellData.formula, 'insertRow', index, count) }
            : cellData;
          newData.set(keyOf(row + count, col), updatedCellData);
        } else {
          // Update formulas in cells above the insertion point
          const updatedCellData = cellData.formula
            ? { ...cellData, formula: updateFormulaReferences(cellData.formula, 'insertRow', index, count) }
            : cellData;
          newData.set(key, updatedCellData);
        }
      });
      
      // Insert default heights for new rows
      for (let i = 0; i < count; i++) {
        newRowHeights.splice(index, 0, 28);
      }
      
      return {
        ...state,
        data: newData,
        rowHeights: newRowHeights,
        maxRows: state.maxRows + count,
      };
    }

    case 'INSERT_COLUMN': {
      const { index, count = 1 } = action.payload;
      const newData = new Map<string, CellData>();
      const newColWidths = [...(state.colWidths || [])];
      
      // Shift existing data right
      state.data.forEach((cellData, key) => {
        const [row, col] = parseKey(key);
        if (col >= index) {
          // Update formulas that reference shifted cells
          const updatedCellData = cellData.formula
            ? { ...cellData, formula: updateFormulaReferences(cellData.formula, 'insertColumn', index, count) }
            : cellData;
          newData.set(keyOf(row, col + count), updatedCellData);
        } else {
          // Update formulas in cells to the left of insertion point
          const updatedCellData = cellData.formula
            ? { ...cellData, formula: updateFormulaReferences(cellData.formula, 'insertColumn', index, count) }
            : cellData;
          newData.set(key, updatedCellData);
        }
      });
      
      // Insert default widths for new columns
      for (let i = 0; i < count; i++) {
        newColWidths.splice(index, 0, 100);
      }
      
      return {
        ...state,
        data: newData,
        colWidths: newColWidths,
        maxCols: state.maxCols + count,
      };
    }

    case 'DELETE_ROW': {
      const { index, count = 1 } = action.payload;
      const newData = new Map<string, CellData>();
      const newRowHeights = [...(state.rowHeights || [])];
      
      state.data.forEach((cellData, key) => {
        const [row, col] = parseKey(key);
        if (row >= index && row < index + count) {
          // Skip deleted rows
          return;
        } else if (row >= index + count) {
          // Shift rows up
          const updatedCellData = cellData.formula
            ? { ...cellData, formula: updateFormulaReferences(cellData.formula, 'deleteRow', index, count) }
            : cellData;
          newData.set(keyOf(row - count, col), updatedCellData);
        } else {
          // Update formulas in remaining cells
          const updatedCellData = cellData.formula
            ? { ...cellData, formula: updateFormulaReferences(cellData.formula, 'deleteRow', index, count) }
            : cellData;
          newData.set(key, updatedCellData);
        }
      });
      
      // Remove row heights
      newRowHeights.splice(index, count);
      
      return {
        ...state,
        data: newData,
        rowHeights: newRowHeights,
        maxRows: Math.max(10, state.maxRows - count),
      };
    }

    case 'DELETE_COLUMN': {
      const { index, count = 1 } = action.payload;
      const newData = new Map<string, CellData>();
      const newColWidths = [...(state.colWidths || [])];
      
      state.data.forEach((cellData, key) => {
        const [row, col] = parseKey(key);
        if (col >= index && col < index + count) {
          // Skip deleted columns
          return;
        } else if (col >= index + count) {
          // Shift columns left
          const updatedCellData = cellData.formula
            ? { ...cellData, formula: updateFormulaReferences(cellData.formula, 'deleteColumn', index, count) }
            : cellData;
          newData.set(keyOf(row, col - count), updatedCellData);
        } else {
          // Update formulas in remaining cells
          const updatedCellData = cellData.formula
            ? { ...cellData, formula: updateFormulaReferences(cellData.formula, 'deleteColumn', index, count) }
            : cellData;
          newData.set(key, updatedCellData);
        }
      });
      
      // Remove column widths
      newColWidths.splice(index, count);
      
      return {
        ...state,
        data: newData,
        colWidths: newColWidths,
        maxCols: Math.max(10, state.maxCols - count),
      };
    }

    case 'SET_ROW_HEIGHT': {
      const { row, height } = action.payload;
      const newHeights = [...(state.rowHeights || Array(state.maxRows).fill(28))];
      newHeights[row] = height;
      return { ...state, rowHeights: newHeights };
    }

    case 'SET_COLUMN_WIDTH': {
      const { col, width } = action.payload;
      const newWidths = [...(state.colWidths || Array(state.maxCols).fill(100))];
      newWidths[col] = width;
      return { ...state, colWidths: newWidths };
    }

    case 'APPLY_FORMAT_TO_SELECTION': {
      const format = action.payload;
      if (!state.selection.ranges.length) return state;
      
      const newData = new Map(state.data);
      state.selection.ranges.forEach(range => {
        const normalized = normalizeRect(range);
        for (let r = normalized.startRow; r <= normalized.endRow; r++) {
          for (let c = normalized.startCol; c <= normalized.endCol; c++) {
            const key = keyOf(r, c);
            const existing = newData.get(key) || { value: '' };
            const updatedCell: CellData = {
              ...existing,
              format: { ...(existing.format || {}), ...format },
            };
            newData.set(key, updatedCell);
          }
        }
      });
      
      return { ...state, data: newData };
    }

    case 'FILL_RANGE': {
      const { range, direction, type } = action.payload;
      const normalized = normalizeRect(range);
      const newData = new Map(state.data);
      
      // Get source cell based on direction
      let sourceRow = normalized.startRow;
      let sourceCol = normalized.startCol;
      if (direction === 'up') sourceRow = normalized.endRow;
      if (direction === 'left') sourceCol = normalized.endCol;
      
      const sourceKey = keyOf(sourceRow, sourceCol);
      const sourceCell = state.data.get(sourceKey);
      
      if (!sourceCell) return state;
      
      // Fill the range
      for (let r = normalized.startRow; r <= normalized.endRow; r++) {
        for (let c = normalized.startCol; c <= normalized.endCol; c++) {
          if (r === sourceRow && c === sourceCol) continue;
          
          const key = keyOf(r, c);
          if (type === 'copy') {
            newData.set(key, { ...sourceCell });
          } else if (type === 'series') {
            // Handle series fill (numbers, dates, etc.)
            const value = sourceCell.value;
            if (typeof value === 'number') {
              let increment = 1;
              if (direction === 'down') increment = r - sourceRow;
              else if (direction === 'up') increment = sourceRow - r;
              else if (direction === 'right') increment = c - sourceCol;
              else if (direction === 'left') increment = sourceCol - c;
              
              newData.set(key, {
                ...sourceCell,
                value: value + increment,
                formula: undefined,
              });
            } else {
              // For non-numeric, just copy
              newData.set(key, { ...sourceCell });
            }
          }
        }
      }
      
      return { ...state, data: newData };
    }

    case 'SORT_RANGE': {
      const { range, column, ascending } = action.payload;
      const normalized = normalizeRect(range);
      
      // Extract data from the range
      const rows: Array<{ index: number; data: (CellData | undefined)[] }> = [];
      for (let r = normalized.startRow; r <= normalized.endRow; r++) {
        const rowData: (CellData | undefined)[] = [];
        for (let c = normalized.startCol; c <= normalized.endCol; c++) {
          rowData.push(state.data.get(keyOf(r, c)));
        }
        rows.push({ index: r, data: rowData });
      }
      
      // Sort rows based on the specified column
      rows.sort((a, b) => {
        const aVal = a.data[column - normalized.startCol]?.value;
        const bVal = b.data[column - normalized.startCol]?.value;
        
        if (aVal === bVal) return 0;
        if (aVal === undefined) return 1;
        if (bVal === undefined) return -1;
        
        const comparison = aVal < bVal ? -1 : 1;
        return ascending ? comparison : -comparison;
      });
      
      // Create new data map with sorted data
      const newData = new Map(state.data);
      rows.forEach((row, newRowIndex) => {
        const targetRow = normalized.startRow + newRowIndex;
        row.data.forEach((cellData, colIndex) => {
          const targetCol = normalized.startCol + colIndex;
          const key = keyOf(targetRow, targetCol);
          if (cellData) {
            newData.set(key, cellData);
          } else {
            newData.delete(key);
          }
        });
      });
      
      return { ...state, data: newData };
    }

    case 'SET_VALIDATION': {
      const { row, col, validation } = action.payload;
      const newValidation = new Map(state.validation || new Map());
      const key = keyOf(row, col);
      
      if (validation === null) {
        newValidation.delete(key);
      } else {
        newValidation.set(key, validation);
      }
      
      return { ...state, validation: newValidation };
    }

    case 'UPDATE_SHEET_FORMATTING': {
      return {
        ...state,
        sheetFormatting: {
          ...state.sheetFormatting,
          ...action.payload,
        },
      };
    }

    case 'BATCH': {
      return action.payload.reduce(spreadsheetReducer, state);
    }

    case 'UNDO':
    case 'REDO':
      // These will be handled by the undo/redo middleware
      return state;

    default:
      return state;
  }
}