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

test('TOGGLE_MERGE is rejected inside a range protected by someone else', () => {
  // Regression: the overlap test compared a row against a column, so a merge
  // whose first row exceeded the protected range's last column slipped through
  const protectedState: SpreadsheetState = {
    ...base,
    protectedRanges: [
      { id: 'p1', range: { startRow: 0, startCol: 0, endRow: 99, endCol: 1 }, owner: 'someone-else' },
    ],
  };
  const attempted = spreadsheetReducer(protectedState, {
    type: 'TOGGLE_MERGE',
    payload: { range: { startRow: 5, startCol: 0, endRow: 6, endCol: 1 } },
  } as any);
  expect(attempted.merges ?? []).toEqual([]);

  const outside = spreadsheetReducer(protectedState, {
    type: 'TOGGLE_MERGE',
    payload: { range: { startRow: 5, startCol: 4, endRow: 6, endCol: 5 } },
  } as any);
  expect(outside.merges).toEqual([{ startRow: 5, startCol: 4, endRow: 6, endCol: 5 }]);
});
