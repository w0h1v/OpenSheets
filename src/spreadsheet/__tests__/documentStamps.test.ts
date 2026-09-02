import { spreadsheetReducer } from '../reducers/spreadsheetReducer';
import { SpreadsheetState } from '../types/spreadsheet';
import { setEditAuthor, beginRemoteApply, endRemoteApply } from '../utils/editContext';

const base: SpreadsheetState = {
  data: new Map(),
  maxRows: 10,
  maxCols: 10,
  selection: { ranges: [], active: null },
  editing: null,
  formulaInput: '',
};

describe('document field stamps', () => {
  beforeEach(() => setEditAuthor('me'));

  it('stamps a document field when a local action changes it', () => {
    const next = spreadsheetReducer(base, {
      type: 'TOGGLE_MERGE',
      payload: { range: { startRow: 0, startCol: 0, endRow: 0, endCol: 1 } },
    });
    expect(next.docMeta?.merges?.by).toBe('me');
    expect(typeof next.docMeta?.merges?.ts).toBe('number');
    expect(next.docMeta?.filters).toBeUndefined();
  });

  it('leaves untouched fields unstamped and does not stamp cell edits', () => {
    const next = spreadsheetReducer(base, { type: 'SET_CELL', payload: { row: 0, col: 0, data: { value: 1 } } });
    expect(next.docMeta).toBeUndefined();
  });

  it('applies remote fields with their own stamps instead of restamping', () => {
    beginRemoteApply();
    try {
      const next = spreadsheetReducer(base, {
        type: 'APPLY_REMOTE_DOCUMENT',
        payload: { fields: { frozenRows: { value: 3, stamp: { ts: 42, by: 'them' } } } },
      });
      expect(next.frozenRows).toBe(3);
      expect(next.docMeta?.frozenRows).toEqual({ ts: 42, by: 'them' });
    } finally {
      endRemoteApply();
    }
  });

  it('a later local change replaces a remote stamp', () => {
    beginRemoteApply();
    const remote = spreadsheetReducer(base, {
      type: 'APPLY_REMOTE_DOCUMENT',
      payload: { fields: { protectedRanges: { value: [], stamp: { ts: 1, by: 'them' } } } },
    });
    endRemoteApply();
    const local = spreadsheetReducer(remote, {
      type: 'PROTECT_RANGE',
      payload: { range: { startRow: 0, startCol: 0, endRow: 1, endCol: 1 } },
    });
    expect(local.protectedRanges).toHaveLength(1);
    expect(local.docMeta?.protectedRanges?.by).toBe('me');
  });
});
