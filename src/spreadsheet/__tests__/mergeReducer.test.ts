import { spreadsheetReducer } from '../reducers/spreadsheetReducer';
import { SpreadsheetState } from '../types/spreadsheet';

const base: SpreadsheetState = {
  data: new Map(),
  maxRows: 10,
  maxCols: 10,
  selection: { ranges: [{ startRow: 0, startCol: 1, endRow: 0, endCol: 2 }], active: null },
  editing: null,
  formulaInput: '',
};

test('TOGGLE_MERGE adds and removes merges', () => {
  const merged = spreadsheetReducer(base, {
    type: 'TOGGLE_MERGE',
    payload: { range: { startRow: 0, startCol: 1, endRow: 0, endCol: 2 } },
  } as any);
  expect(merged.merges).toEqual([{ startRow: 0, startCol: 1, endRow: 0, endCol: 2 }]);
  const unmerged = spreadsheetReducer(merged, {
    type: 'TOGGLE_MERGE',
    payload: { range: { startRow: 0, startCol: 1, endRow: 0, endCol: 2 } },
  } as any);
  expect(unmerged.merges).toEqual([]);
});
