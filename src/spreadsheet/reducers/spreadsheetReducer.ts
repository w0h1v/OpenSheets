import { SpreadsheetState, CellData, keyOf, parseKey, SelectionRect, DOCUMENT_FIELDS, DocumentField, DEFAULT_ROW_HEIGHT, DEFAULT_COL_WIDTH } from '../types/spreadsheet';
import { SpreadsheetAction } from '../types/actions';
import { stampEditMeta, getEditAuthor, isRemoteApplying } from '../utils/editContext';
import { updateFormulaReferences } from '../utils/formulaUtils';
import { normalizeRect } from '../utils/selectionUtils';

let protectedRangeSeq = 0;

/**
 * Shift/prune merged regions for row/column insertions and deletions.
 * Inserts shift merges at/after the index; deletes drop merges that
 * intersect the removed range and shift the rest.
 */
function shiftMerges(
  merges: SelectionRect[] | undefined,
  op: 'insertRow' | 'deleteRow' | 'insertColumn' | 'deleteColumn',
  index: number,
  count: number
): SelectionRect[] | undefined {
  if (!merges || !merges.length) return merges;
  const horizontal = op === 'insertRow' || op === 'deleteRow';
  const out: SelectionRect[] = [];
  for (const m of merges) {
    const start = horizontal ? m.startRow : m.startCol;
    const end = horizontal ? m.endRow : m.endCol;
    if (op === 'insertRow' || op === 'insertColumn') {
      if (start >= index) {
        out.push(horizontal
          ? { ...m, startRow: start + count, endRow: end + count }
          : { ...m, startCol: start + count, endCol: end + count });
      } else if (end >= index) {
        // Insertion lands inside the merge: grow it
        out.push(horizontal
          ? { ...m, endRow: end + count }
          : { ...m, endCol: end + count });
      } else {
        out.push(m);
      }
    } else {
      if (end < index) {
        out.push(m);
      } else if (start >= index + count) {
        out.push(horizontal
          ? { ...m, startRow: start - count, endRow: end - count }
          : { ...m, startCol: start - count, endCol: end - count });
      } else if (start >= index && end < index + count) {
        // Entirely inside the deleted range: drop it
      } else {
        // Partial overlap: the surviving cells keep their positions before the
        // deletion and shift back by count after it
        const newStart = start < index ? start : index;
        const newEnd = end >= index + count ? end - count : index - 1;
        out.push(horizontal
          ? { ...m, startRow: newStart, endRow: newEnd }
          : { ...m, startCol: newStart, endCol: newEnd });
      }
    }
  }
  return out;
}

/**
 * Cell-level permissions: writes intersecting a protected range are
 * rejected unless the current editor is the range's owner.
 */
function isWriteAllowed(
  state: SpreadsheetState,
  row: number,
  col: number
): boolean {
  const ranges = state.protectedRanges;
  if (!ranges || !ranges.length) return true;
  const author = getEditAuthor();
  return !ranges.some(
    (p) =>
      row >= p.range.startRow && row <= p.range.endRow
      && col >= p.range.startCol && col <= p.range.endCol
      && p.owner !== author
  );
}

function rangeProtectedForOthers(
  state: SpreadsheetState,
  range: SelectionRect
): boolean {
  const ranges = state.protectedRanges;
  if (!ranges || !ranges.length) return false;
  const author = getEditAuthor();
  return ranges.some(
    (p) =>
      p.owner !== author
      && !(range.endRow < p.range.startRow || range.startRow > p.range.endRow
        || range.endCol < p.range.startCol || range.startCol > p.range.endCol)
  );
}

/**
 * Document fields (merges, protected ranges, filters, freezes, sizes) carry
 * a last-writer stamp so collaborators converge on them the same way cells
 * do. Local changes are stamped here; remote ones arrive already stamped.
 */
function stampDocumentFields(before: SpreadsheetState, after: SpreadsheetState): SpreadsheetState {
  if (after === before || isRemoteApplying()) return after;
  let docMeta = after.docMeta;
  for (const field of DOCUMENT_FIELDS) {
    if (after[field] !== before[field]) docMeta = { ...(docMeta ?? {}), [field]: stampEditMeta() };
  }
  return docMeta === after.docMeta ? after : { ...after, docMeta };
}

export function spreadsheetReducer(
  state: SpreadsheetState,
  action: SpreadsheetAction
): SpreadsheetState {
  return stampDocumentFields(state, reduce(state, action));
}

function reduce(
  state: SpreadsheetState,
  action: SpreadsheetAction
): SpreadsheetState {
  switch (action.type) {
    case 'APPLY_REMOTE_DOCUMENT': {
      const next: SpreadsheetState = { ...state, docMeta: { ...(state.docMeta ?? {}) } };
      for (const [field, entry] of Object.entries(action.payload.fields) as Array<[DocumentField, { value: unknown; stamp: { ts: number; by: string } }]>) {
        (next as unknown as Record<string, unknown>)[field] = entry.value ?? undefined;
        next.docMeta![field] = entry.stamp;
      }
      return next;
    }

    case 'CLEAR_ALL':
      return { ...state, data: new Map(), filters: [] };

    case 'SET_FILTERS':
      return { ...state, filters: action.payload.filters };

    case 'SET_ROW_HEIGHTS':
      return { ...state, rowHeights: action.payload };

    case 'SET_COLUMN_WIDTHS':
      return { ...state, colWidths: action.payload };

    case 'TOGGLE_MERGE': {
      const rect = normalizeRect(action.payload.range);
      if (rangeProtectedForOthers(state, rect)) return state;
      const merges = [...(state.merges || [])];
      // Toggle: if the exact region (or any overlap of it) is merged, unmerge
      const idx = merges.findIndex(
        (m) => m.startRow === rect.startRow && m.startCol === rect.startCol
          && m.endRow === rect.endRow && m.endCol === rect.endCol
      );
      if (idx !== -1) {
        merges.splice(idx, 1);
      } else {
        // Remove any merges overlapping the region, then add it
        const filtered = merges.filter(
          (m) => m.endRow < rect.startRow || m.startRow > rect.endRow
            || m.endCol < rect.startCol || m.startCol > rect.endCol
        );
        filtered.push(rect);
        merges.length = 0;
        merges.push(...filtered);
      }
      return { ...state, merges };
    }

    case 'PROTECT_RANGE': {
      const range = normalizeRect(action.payload.range);
      const entry = {
        // A counter as well as the clock: ranges protected in the same
        // millisecond (a batch) must not share an id, or one UNPROTECT_RANGE
        // would drop both
        id: `pr-${Date.now()}-${protectedRangeSeq++}`,
        range,
        description: action.payload.description,
        owner: getEditAuthor(),
      };
      return { ...state, protectedRanges: [...(state.protectedRanges || []), entry] };
    }

    case 'UNPROTECT_RANGE':
      return {
        ...state,
        protectedRanges: (state.protectedRanges || []).filter((p) => p.id !== action.payload.id),
      };

    case 'SET_FROZEN':
      return {
        ...state,
        frozenRows: Math.max(0, action.payload.rows ?? state.frozenRows ?? 0),
        frozenCols: Math.max(0, action.payload.cols ?? state.frozenCols ?? 0),
      };

    case 'SET_COMMENT': {
      const comments = new Map(state.comments || []);
      if (action.payload.comment === null) {
        comments.delete(action.payload.key);
      } else {
        comments.set(action.payload.key, action.payload.comment);
      }
      return { ...state, comments };
    }

    case 'SET_CELL': {
      const { row, col, data } = action.payload;
      if (!isWriteAllowed(state, row, col)) return state;
      const key = keyOf(row, col);
      const existing = state.data.get(key) || { value: '' };
      // Remote-applied writes arrive with their stamp; local writes get one
      const editMeta = data.editMeta ?? stampEditMeta();
      const updated: CellData = { ...existing, ...data, editMeta, value: data.value ?? existing.value };
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
      action.payload.updates.filter(({ row, col }) => isWriteAllowed(state, row, col)).forEach(({ row, col, data }) => {
        const key = keyOf(row, col);
        const existing = newData.get(key) || { value: '' };
        const editMeta = data.editMeta ?? stampEditMeta();
        const updated: CellData = { ...existing, ...data, editMeta, value: data.value ?? existing.value };
        
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
      if (rangeProtectedForOthers(state, normalizeRect(action.payload.range))) return state;
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
      
      state.data.forEach((cellData, key) => {
        const [row, col] = parseKey(key);
        if (row >= index) {
          const updatedCellData = cellData.formula
            ? { ...cellData, formula: updateFormulaReferences(cellData.formula, 'insertRow', index, count) }
            : cellData;
          newData.set(keyOf(row + count, col), updatedCellData);
        } else {
          const updatedCellData = cellData.formula
            ? { ...cellData, formula: updateFormulaReferences(cellData.formula, 'insertRow', index, count) }
            : cellData;
          newData.set(key, updatedCellData);
        }
      });
      
      for (let i = 0; i < count; i++) {
        newRowHeights.splice(index, 0, DEFAULT_ROW_HEIGHT);
      }
      
      return {
        ...state,
        data: newData,
        rowHeights: newRowHeights,
        merges: shiftMerges(state.merges, 'insertRow', index, count),
        maxRows: state.maxRows + count,
      };
    }

    case 'INSERT_COLUMN': {
      const { index, count = 1 } = action.payload;
      const newData = new Map<string, CellData>();
      const newColWidths = [...(state.colWidths || [])];
      
      state.data.forEach((cellData, key) => {
        const [row, col] = parseKey(key);
        if (col >= index) {
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
      
      for (let i = 0; i < count; i++) {
        newColWidths.splice(index, 0, DEFAULT_COL_WIDTH);
      }
      
      return {
        ...state,
        data: newData,
        colWidths: newColWidths,
        merges: shiftMerges(state.merges, 'insertColumn', index, count),
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
          return;
        } else if (row >= index + count) {
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
      
      newRowHeights.splice(index, count);
      
      return {
        ...state,
        data: newData,
        rowHeights: newRowHeights,
        merges: shiftMerges(state.merges, 'deleteRow', index, count),
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
          return;
        } else if (col >= index + count) {
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
      
      newColWidths.splice(index, count);
      
      return {
        ...state,
        data: newData,
        colWidths: newColWidths,
        merges: shiftMerges(state.merges, 'deleteColumn', index, count),
        maxCols: Math.max(10, state.maxCols - count),
      };
    }

    case 'SET_ROW_HEIGHT': {
      const { row, height } = action.payload;
      const newHeights = [...(state.rowHeights || Array(state.maxRows).fill(22))];
      newHeights[row] = height;
      return { ...state, rowHeights: newHeights };
    }

    case 'SET_COLUMN_WIDTH': {
      const { col, width } = action.payload;
      const newWidths = [...(state.colWidths || Array(state.maxCols).fill(96))];
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
      
      let sourceRow = normalized.startRow;
      let sourceCol = normalized.startCol;
      if (direction === 'up') sourceRow = normalized.endRow;
      if (direction === 'left') sourceCol = normalized.endCol;
      
      const sourceKey = keyOf(sourceRow, sourceCol);
      const sourceCell = state.data.get(sourceKey);
      
      if (!sourceCell) return state;
      
      for (let r = normalized.startRow; r <= normalized.endRow; r++) {
        for (let c = normalized.startCol; c <= normalized.endCol; c++) {
          if (r === sourceRow && c === sourceCol) continue;
          
          const key = keyOf(r, c);
          if (type === 'copy') {
            newData.set(key, { ...sourceCell });
          } else if (type === 'series') {
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
      
      const rows: Array<{ index: number; data: (CellData | undefined)[] }> = [];
      for (let r = normalized.startRow; r <= normalized.endRow; r++) {
        const rowData: (CellData | undefined)[] = [];
        for (let c = normalized.startCol; c <= normalized.endCol; c++) {
          rowData.push(state.data.get(keyOf(r, c)));
        }
        rows.push({ index: r, data: rowData });
      }
      
      rows.sort((a, b) => {
        const aVal = a.data[column - normalized.startCol]?.value;
        const bVal = b.data[column - normalized.startCol]?.value;
        
        if (aVal === bVal) return 0;
        if (aVal === undefined || aVal === null) return 1;
        if (bVal === undefined || bVal === null) return -1;

        const av = aVal instanceof Date ? aVal.getTime() : aVal;
        const bv = bVal instanceof Date ? bVal.getTime() : bVal;
        const comparison = typeof av === 'number' && typeof bv === 'number'
          ? (av < bv ? -1 : 1)
          : String(av).localeCompare(String(bv));
        return ascending ? comparison : -comparison;
      });
      
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


    default:
      return state;
  }
}