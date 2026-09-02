import { spreadsheetReducer } from '../reducers/spreadsheetReducer';
import { SpreadsheetAction } from '../types/actions';
import { CellData, SelectionRect, SpreadsheetState, keyOf } from '../types/spreadsheet';
import { setEditAuthor } from '../utils/editContext';

const rect = (startRow: number, startCol: number, endRow: number, endCol: number): SelectionRect =>
  ({ startRow, startCol, endRow, endCol });

const makeState = (overrides: Partial<SpreadsheetState> = {}): SpreadsheetState => ({
  data: new Map(),
  maxRows: 20,
  maxCols: 20,
  selection: { ranges: [], active: null },
  editing: null,
  formulaInput: '',
  ...overrides,
});

// [row, col, cell] triples become a sparse data map; cells default to an empty value
const stateWith = (
  cells: Array<[number, number, Partial<CellData>]>,
  overrides: Partial<SpreadsheetState> = {}
): SpreadsheetState => {
  const data = new Map<string, CellData>();
  cells.forEach(([r, c, d]) => data.set(keyOf(r, c), { value: '', ...d }));
  return makeState({ data, ...overrides });
};

const reduce = (state: SpreadsheetState, ...actions: SpreadsheetAction[]) =>
  actions.reduce(spreadsheetReducer, state);

const cellAt = (state: SpreadsheetState, r: number, c: number) => state.data.get(keyOf(r, c));
const valueAt = (state: SpreadsheetState, r: number, c: number) => cellAt(state, r, c)?.value;
const formulaAt = (state: SpreadsheetState, r: number, c: number) => cellAt(state, r, c)?.formula;
const sortedKeys = (state: SpreadsheetState) => Array.from(state.data.keys()).sort();

const set = (row: number, col: number, data: Partial<CellData>): SpreadsheetAction =>
  ({ type: 'SET_CELL', payload: { row, col, data } });

describe('spreadsheetReducer', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(1000);
    setEditAuthor('local');
  });

  afterEach(() => {
    jest.restoreAllMocks();
    setEditAuthor('local');
  });

  describe('SET_CELL', () => {
    it('stores the cell and stamps it with the current author and time', () => {
      setEditAuthor('alice');
      const next = reduce(makeState(), set(0, 0, { value: 42 }));
      expect(cellAt(next, 0, 0)).toEqual({ value: 42, editMeta: { ts: 1000, by: 'alice' } });
    });

    it('keeps the edit stamp carried by a remote write', () => {
      const editMeta = { ts: 5, by: 'bob' };
      const next = reduce(makeState(), set(0, 0, { value: 'x', editMeta }));
      expect(cellAt(next, 0, 0)?.editMeta).toEqual(editMeta);
    });

    it('merges into the existing cell, keeping fields the update leaves out', () => {
      const next = reduce(
        makeState(),
        set(1, 1, { value: 3, formula: '=1+2' }),
        set(1, 1, { format: { bold: true } })
      );
      expect(cellAt(next, 1, 1)).toMatchObject({ value: 3, formula: '=1+2', format: { bold: true } });
    });

    it('removes a cell cleared to an empty value with no formula or format', () => {
      const next = reduce(makeState(), set(0, 0, { value: 'x' }), set(0, 0, { value: '' }));
      expect(next.data.has(keyOf(0, 0))).toBe(false);
    });

    it('keeps an emptied cell that still carries a format', () => {
      const next = reduce(makeState(), set(0, 0, { value: '', format: { bold: true } }));
      expect(cellAt(next, 0, 0)).toMatchObject({ value: '', format: { bold: true } });
    });

    it('does not mutate the previous state', () => {
      const state = makeState();
      reduce(state, set(0, 0, { value: 1 }));
      expect(state.data.size).toBe(0);
    });
  });

  describe('SET_CELLS', () => {
    it('applies every update in one step with a stamp on each', () => {
      setEditAuthor('carol');
      const next = reduce(makeState(), {
        type: 'SET_CELLS',
        payload: { updates: [{ row: 0, col: 0, data: { value: 1 } }, { row: 2, col: 3, data: { value: 'b' } }] },
      });
      expect(valueAt(next, 0, 0)).toBe(1);
      expect(cellAt(next, 2, 3)).toEqual({ value: 'b', editMeta: { ts: 1000, by: 'carol' } });
    });

    it('deletes cells that an update empties', () => {
      const next = reduce(stateWith([[0, 0, { value: 'old' }]]), {
        type: 'SET_CELLS',
        payload: { updates: [{ row: 0, col: 0, data: { value: '' } }] },
      });
      expect(next.data.size).toBe(0);
    });
  });

  describe('CLEAR_CELL and CLEAR_RANGE', () => {
    it('CLEAR_CELL removes just that cell', () => {
      const next = reduce(stateWith([[0, 0, { value: 1 }], [0, 1, { value: 2 }]]), {
        type: 'CLEAR_CELL',
        payload: { row: 0, col: 0 },
      });
      expect(sortedKeys(next)).toEqual(['0:1']);
    });

    it('CLEAR_RANGE normalizes a reversed rectangle and leaves cells outside it alone', () => {
      const state = stateWith([[0, 0, { value: 1 }], [1, 1, { value: 2 }], [2, 2, { value: 3 }], [5, 5, { value: 4 }]]);
      const next = reduce(state, { type: 'CLEAR_RANGE', payload: { range: rect(2, 2, 0, 0) } });
      expect(sortedKeys(next)).toEqual(['5:5']);
    });
  });

  describe('CLEAR_ALL and SET_FILTERS', () => {
    it('SET_FILTERS replaces the filter list', () => {
      const filters = [{ column: 0, type: 'text' as const, condition: 'contains' as const, value: 'a' }];
      expect(reduce(makeState(), { type: 'SET_FILTERS', payload: { filters } }).filters).toBe(filters);
    });

    it('CLEAR_ALL drops all data and filters but keeps the rest of the state', () => {
      const state = stateWith([[0, 0, { value: 1 }]], {
        filters: [{ column: 0, type: 'text', condition: 'isEmpty' }],
        merges: [rect(0, 0, 1, 1)],
      });
      const next = reduce(state, { type: 'CLEAR_ALL' });
      expect(next.data.size).toBe(0);
      expect(next.filters).toEqual([]);
      expect(next.merges).toEqual([rect(0, 0, 1, 1)]);
    });
  });

  describe('selection and editing state', () => {
    it('SET_SELECTION replaces the selection', () => {
      const selection = { ranges: [rect(1, 1, 2, 2)], active: { row: 1, col: 1 } };
      expect(reduce(makeState(), { type: 'SET_SELECTION', payload: selection }).selection).toBe(selection);
    });

    it('ADD_SELECTION_RANGE appends a range and keeps the active cell', () => {
      const state = makeState({ selection: { ranges: [rect(0, 0, 0, 0)], active: { row: 0, col: 0 } } });
      const next = reduce(state, { type: 'ADD_SELECTION_RANGE', payload: rect(3, 3, 4, 4) });
      expect(next.selection).toEqual({ ranges: [rect(0, 0, 0, 0), rect(3, 3, 4, 4)], active: { row: 0, col: 0 } });
    });

    it('SET_EDITING and SET_FORMULA_INPUT update their fields', () => {
      const editing = reduce(makeState(), { type: 'SET_EDITING', payload: { row: 2, col: 3 } });
      expect(editing.editing).toEqual({ row: 2, col: 3 });
      expect(reduce(editing, { type: 'SET_EDITING', payload: null }).editing).toBeNull();
      expect(reduce(makeState(), { type: 'SET_FORMULA_INPUT', payload: '=SUM(A1)' }).formulaInput).toBe('=SUM(A1)');
    });
  });

  describe('INSERT_ROW', () => {
    const state = stateWith(
      [
        [0, 0, { value: 1 }],
        [2, 0, { value: 3 }],
        [0, 1, { value: 3, formula: '=A3' }],
        [3, 1, { value: 4, formula: '=A1+A3' }],
      ],
      {
        rowHeights: [10, 11, 12, 13],
        merges: [rect(2, 0, 3, 0), rect(0, 2, 2, 2), rect(0, 3, 0, 3)],
      }
    );

    it('shifts cells at or below the index down and rewrites formula references', () => {
      const next = reduce(state, { type: 'INSERT_ROW', payload: { index: 1 } });
      expect(valueAt(next, 0, 0)).toBe(1);
      expect(cellAt(next, 2, 0)).toBeUndefined();
      expect(valueAt(next, 3, 0)).toBe(3);
      expect(formulaAt(next, 0, 1)).toBe('=A4');
      expect(cellAt(next, 3, 1)).toBeUndefined();
      expect(formulaAt(next, 4, 1)).toBe('=A1+A4');
    });

    it('inserts default heights, grows the grid and shifts merges', () => {
      const next = reduce(state, { type: 'INSERT_ROW', payload: { index: 1 } });
      expect(next.rowHeights).toEqual([10, 28, 11, 12, 13]);
      expect(next.maxRows).toBe(21);
      // A merge below moves, a merge spanning the index grows, a merge above stays
      expect(next.merges).toEqual([rect(3, 0, 4, 0), rect(0, 2, 3, 2), rect(0, 3, 0, 3)]);
    });

    it('honours count', () => {
      const next = reduce(state, { type: 'INSERT_ROW', payload: { index: 0, count: 2 } });
      expect(valueAt(next, 2, 0)).toBe(1);
      expect(formulaAt(next, 2, 1)).toBe('=A5');
      expect(next.rowHeights).toEqual([28, 28, 10, 11, 12, 13]);
      expect(next.maxRows).toBe(22);
    });
  });

  describe('INSERT_COLUMN', () => {
    const state = stateWith(
      [
        [0, 0, { value: 1 }],
        [0, 2, { value: 3 }],
        [1, 0, { value: 3, formula: '=C1' }],
        [1, 3, { value: 4, formula: '=A1+C1' }],
      ],
      {
        colWidths: [50, 60, 70, 80],
        merges: [rect(0, 2, 0, 3), rect(0, 0, 0, 2), rect(3, 0, 3, 0)],
      }
    );

    it('shifts cells at or right of the index and rewrites formula references', () => {
      const next = reduce(state, { type: 'INSERT_COLUMN', payload: { index: 1 } });
      expect(valueAt(next, 0, 0)).toBe(1);
      expect(cellAt(next, 0, 2)).toBeUndefined();
      expect(valueAt(next, 0, 3)).toBe(3);
      expect(formulaAt(next, 1, 0)).toBe('=D1');
      expect(formulaAt(next, 1, 4)).toBe('=A1+D1');
    });

    it('inserts default widths, grows the grid and shifts merges', () => {
      const next = reduce(state, { type: 'INSERT_COLUMN', payload: { index: 1, count: 1 } });
      expect(next.colWidths).toEqual([50, 100, 60, 70, 80]);
      expect(next.maxCols).toBe(21);
      expect(next.merges).toEqual([rect(0, 3, 0, 4), rect(0, 0, 0, 3), rect(3, 0, 3, 0)]);
    });
  });

  describe('DELETE_ROW', () => {
    const state = stateWith(
      [
        [0, 0, { value: 0 }],
        [1, 0, { value: 1 }],
        [2, 0, { value: 2 }],
        [3, 0, { value: 3 }],
        [4, 0, { value: 4 }],
        [0, 1, { value: 1, formula: '=A2' }],
        [4, 1, { value: 4, formula: '=A5+A1' }],
      ],
      {
        rowHeights: [10, 11, 12, 13, 14],
        merges: [rect(1, 0, 2, 0), rect(0, 0, 3, 0), rect(2, 0, 4, 0), rect(3, 0, 4, 0), rect(0, 5, 0, 5)],
      }
    );

    it('drops the deleted rows, shifts the rest up and marks dangling references', () => {
      const next = reduce(state, { type: 'DELETE_ROW', payload: { index: 1, count: 2 } });
      expect(valueAt(next, 0, 0)).toBe(0);
      expect(valueAt(next, 1, 0)).toBe(3);
      expect(valueAt(next, 2, 0)).toBe(4);
      expect(cellAt(next, 3, 0)).toBeUndefined();
      expect(cellAt(next, 4, 0)).toBeUndefined();
      expect(formulaAt(next, 0, 1)).toBe('=#REF!');
      expect(formulaAt(next, 2, 1)).toBe('=A3+A1');
    });

    it('removes heights, shrinks the grid and prunes or shifts merges', () => {
      const next = reduce(state, { type: 'DELETE_ROW', payload: { index: 1, count: 2 } });
      expect(next.rowHeights).toEqual([10, 13, 14]);
      expect(next.maxRows).toBe(18);
      expect(next.merges).toEqual([
        // rect(1,0,2,0) lay entirely inside the deleted rows and is gone
        rect(0, 0, 1, 0), // rows 0 and 3 survive, so two rows remain merged
        rect(1, 0, 2, 0), // head deleted: rows 3-4 survive and shift back
        rect(1, 0, 2, 0), // entirely below: shifted
        rect(0, 5, 0, 5), // above: untouched
      ]);
    });

    it('keeps the surviving head of a merge whose tail is deleted', () => {
      const merged = makeState({ merges: [rect(0, 0, 3, 0)] });
      const next = reduce(merged, { type: 'DELETE_ROW', payload: { index: 2, count: 5 } });
      expect(next.merges).toEqual([rect(0, 0, 1, 0)]);
    });

    it('never shrinks the grid below ten rows', () => {
      const next = reduce(makeState({ maxRows: 11 }), { type: 'DELETE_ROW', payload: { index: 0, count: 5 } });
      expect(next.maxRows).toBe(10);
    });
  });

  describe('DELETE_COLUMN', () => {
    const state = stateWith(
      [
        [0, 0, { value: 0 }],
        [0, 1, { value: 1 }],
        [0, 2, { value: 2 }],
        [1, 0, { value: 2, formula: '=C1' }],
        [1, 1, { value: 1, formula: '=B1' }],
        [1, 2, { value: 0, formula: '=A1' }],
      ],
      {
        colWidths: [50, 60, 70],
        merges: [rect(0, 1, 0, 1), rect(0, 0, 0, 2), rect(0, 2, 0, 3)],
      }
    );

    it('drops the deleted columns, shifts the rest left and marks dangling references', () => {
      const next = reduce(state, { type: 'DELETE_COLUMN', payload: { index: 1 } });
      expect(valueAt(next, 0, 0)).toBe(0);
      expect(valueAt(next, 0, 1)).toBe(2);
      expect(cellAt(next, 0, 2)).toBeUndefined();
      expect(formulaAt(next, 1, 0)).toBe('=B1');
      expect(formulaAt(next, 1, 1)).toBe('=A1');
      expect(cellAt(next, 1, 2)).toBeUndefined();
    });

    it('removes widths, shrinks the grid and prunes or shifts merges', () => {
      const next = reduce(state, { type: 'DELETE_COLUMN', payload: { index: 1 } });
      expect(next.colWidths).toEqual([50, 70]);
      expect(next.maxCols).toBe(19);
      expect(next.merges).toEqual([rect(0, 0, 0, 1), rect(0, 1, 0, 2)]);
    });

    it('never shrinks the grid below ten columns', () => {
      const next = reduce(makeState({ maxCols: 12 }), { type: 'DELETE_COLUMN', payload: { index: 0, count: 6 } });
      expect(next.maxCols).toBe(10);
    });
  });

  describe('TOGGLE_MERGE', () => {
    it('normalizes a reversed rectangle before merging', () => {
      const next = reduce(makeState(), { type: 'TOGGLE_MERGE', payload: { range: rect(2, 2, 0, 0) } });
      expect(next.merges).toEqual([rect(0, 0, 2, 2)]);
    });

    it('replaces every merge overlapping the new region and keeps the others', () => {
      const state = makeState({ merges: [rect(0, 0, 0, 1), rect(5, 5, 6, 6)] });
      const next = reduce(state, { type: 'TOGGLE_MERGE', payload: { range: rect(0, 1, 1, 2) } });
      expect(next.merges).toEqual([rect(5, 5, 6, 6), rect(0, 1, 1, 2)]);
    });
  });

  describe('protected ranges', () => {
    const protect = (range: SelectionRect, description?: string): SpreadsheetAction =>
      ({ type: 'PROTECT_RANGE', payload: { range, description } });

    it('PROTECT_RANGE records the normalized range owned by the current author', () => {
      setEditAuthor('alice');
      const next = reduce(makeState(), protect(rect(3, 3, 1, 1), 'Totals'));
      expect(next.protectedRanges).toHaveLength(1);
      expect(next.protectedRanges?.[0]).toMatchObject({
        range: rect(1, 1, 3, 3),
        description: 'Totals',
        owner: 'alice',
      });
      expect(next.protectedRanges?.[0].id).toMatch(/^pr-/);
    });

    it('assigns distinct ids to ranges protected within the same millisecond', () => {
      const next = reduce(makeState(), { type: 'BATCH', payload: [protect(rect(0, 0, 0, 0)), protect(rect(5, 5, 5, 5))] });
      const [first, second] = next.protectedRanges ?? [];
      expect(first.id).not.toBe(second.id);
      const unprotected = reduce(next, { type: 'UNPROTECT_RANGE', payload: { id: first.id } });
      expect(unprotected.protectedRanges).toEqual([second]);
    });

    it('UNPROTECT_RANGE ignores unknown ids', () => {
      const next = reduce(makeState(), protect(rect(0, 0, 0, 0)));
      expect(reduce(next, { type: 'UNPROTECT_RANGE', payload: { id: 'nope' } }).protectedRanges).toEqual(next.protectedRanges);
    });

    describe('write rejection', () => {
      let state: SpreadsheetState;

      beforeEach(() => {
        setEditAuthor('owner');
        state = reduce(stateWith([[1, 1, { value: 'kept' }]]), protect(rect(0, 0, 2, 2)));
      });

      it('rejects a SET_CELL from someone else inside the range', () => {
        setEditAuthor('intruder');
        expect(reduce(state, set(1, 1, { value: 'changed' }))).toBe(state);
      });

      it('lets the owner write inside their own range', () => {
        expect(valueAt(reduce(state, set(1, 1, { value: 'changed' })), 1, 1)).toBe('changed');
      });

      it('allows anyone to write outside the range', () => {
        setEditAuthor('intruder');
        expect(valueAt(reduce(state, set(5, 5, { value: 'ok' })), 5, 5)).toBe('ok');
      });

      it('SET_CELLS drops only the updates that land inside the range', () => {
        setEditAuthor('intruder');
        const next = reduce(state, {
          type: 'SET_CELLS',
          payload: { updates: [{ row: 1, col: 1, data: { value: 'changed' } }, { row: 5, col: 5, data: { value: 'ok' } }] },
        });
        expect(valueAt(next, 1, 1)).toBe('kept');
        expect(valueAt(next, 5, 5)).toBe('ok');
      });

      it('rejects a CLEAR_RANGE that even partially touches the range', () => {
        setEditAuthor('intruder');
        expect(reduce(state, { type: 'CLEAR_RANGE', payload: { range: rect(2, 2, 6, 6) } })).toBe(state);
      });

      it('lets the owner clear inside the range', () => {
        const next = reduce(state, { type: 'CLEAR_RANGE', payload: { range: rect(0, 0, 2, 2) } });
        expect(next.data.size).toBe(0);
      });
    });
  });

  describe('FILL_RANGE', () => {
    const fill = (range: SelectionRect, direction: 'down' | 'right' | 'up' | 'left', type: 'copy' | 'series'): SpreadsheetAction =>
      ({ type: 'FILL_RANGE', payload: { range, direction, type } });
    const source: CellData = { value: 10, formula: '=5*2', format: { bold: true } };

    it('copies the top cell downwards', () => {
      const next = reduce(stateWith([[0, 0, source]]), fill(rect(0, 0, 2, 0), 'down', 'copy'));
      expect(cellAt(next, 1, 0)).toEqual(source);
      expect(cellAt(next, 2, 0)).toEqual(source);
    });

    it('copies the left cell rightwards', () => {
      const next = reduce(stateWith([[0, 0, source]]), fill(rect(0, 0, 0, 2), 'right', 'copy'));
      expect(cellAt(next, 0, 1)).toEqual(source);
      expect(cellAt(next, 0, 2)).toEqual(source);
    });

    it('copies the bottom cell upwards', () => {
      const next = reduce(stateWith([[2, 0, source]]), fill(rect(0, 0, 2, 0), 'up', 'copy'));
      expect(cellAt(next, 0, 0)).toEqual(source);
      expect(cellAt(next, 1, 0)).toEqual(source);
    });

    it('copies the right cell leftwards', () => {
      const next = reduce(stateWith([[0, 2, source]]), fill(rect(0, 0, 0, 2), 'left', 'copy'));
      expect(cellAt(next, 0, 0)).toEqual(source);
      expect(cellAt(next, 0, 1)).toEqual(source);
    });

    it('extends a numeric series in each direction, dropping the formula', () => {
      const down = reduce(stateWith([[0, 0, source]]), fill(rect(0, 0, 2, 0), 'down', 'series'));
      expect([valueAt(down, 1, 0), valueAt(down, 2, 0)]).toEqual([11, 12]);
      expect(formulaAt(down, 1, 0)).toBeUndefined();
      expect(cellAt(down, 1, 0)?.format).toEqual({ bold: true });

      const right = reduce(stateWith([[0, 0, source]]), fill(rect(0, 0, 0, 2), 'right', 'series'));
      expect([valueAt(right, 0, 1), valueAt(right, 0, 2)]).toEqual([11, 12]);

      const up = reduce(stateWith([[2, 0, source]]), fill(rect(0, 0, 2, 0), 'up', 'series'));
      expect([valueAt(up, 1, 0), valueAt(up, 0, 0)]).toEqual([11, 12]);

      const left = reduce(stateWith([[0, 2, source]]), fill(rect(0, 0, 0, 2), 'left', 'series'));
      expect([valueAt(left, 0, 1), valueAt(left, 0, 0)]).toEqual([11, 12]);
    });

    it('copies non-numeric values when asked for a series', () => {
      const next = reduce(stateWith([[0, 0, { value: 'abc' }]]), fill(rect(0, 0, 1, 0), 'down', 'series'));
      expect(cellAt(next, 1, 0)).toEqual({ value: 'abc' });
    });

    it('is a no-op when the source cell is empty', () => {
      const state = makeState();
      expect(reduce(state, fill(rect(0, 0, 3, 0), 'down', 'copy'))).toBe(state);
    });
  });

  describe('SORT_RANGE', () => {
    const sort = (range: SelectionRect, column: number, ascending: boolean): SpreadsheetAction =>
      ({ type: 'SORT_RANGE', payload: { range, column, ascending } });
    const column = (state: SpreadsheetState, col: number, rows: number) =>
      Array.from({ length: rows }, (_, r) => valueAt(state, r, col));

    const table = stateWith([
      [0, 0, { value: 3 }], [0, 1, { value: 'c' }],
      [1, 0, { value: 1 }], [1, 1, { value: 'a' }],
      [2, 0, { value: 2 }], [2, 1, { value: 'b' }],
    ]);

    it('sorts rows ascending by the chosen column, carrying the other columns along', () => {
      const next = reduce(table, sort(rect(0, 0, 2, 1), 0, true));
      expect(column(next, 0, 3)).toEqual([1, 2, 3]);
      expect(column(next, 1, 3)).toEqual(['a', 'b', 'c']);
    });

    it('sorts descending', () => {
      const next = reduce(table, sort(rect(0, 0, 2, 1), 0, false));
      expect(column(next, 0, 3)).toEqual([3, 2, 1]);
      expect(column(next, 1, 3)).toEqual(['c', 'b', 'a']);
    });

    it('sorts by a column other than the first', () => {
      const next = reduce(table, sort(rect(0, 0, 2, 1), 1, false));
      expect(column(next, 0, 3)).toEqual([3, 2, 1]);
    });

    it('orders numbers numerically before text and keeps empty cells last either way', () => {
      const mixed = stateWith([
        [0, 0, { value: 'banana' }],
        [1, 0, { value: 3 }],
        [2, 0, { value: 'apple' }],
        [3, 0, { value: 10 }],
      ]);
      const asc = reduce(mixed, sort(rect(0, 0, 4, 0), 0, true));
      expect(column(asc, 0, 5)).toEqual([3, 10, 'apple', 'banana', undefined]);
      const desc = reduce(mixed, sort(rect(0, 0, 4, 0), 0, false));
      expect(column(desc, 0, 5)).toEqual(['banana', 'apple', 10, 3, undefined]);
    });

    it('leaves rows with equal keys in their original order', () => {
      const ties = stateWith([
        [0, 0, { value: 'same' }], [0, 1, { value: 'first' }],
        [1, 0, { value: 'same' }], [1, 1, { value: 'second' }],
      ]);
      const next = reduce(ties, sort(rect(0, 0, 1, 1), 0, true));
      expect(column(next, 1, 2)).toEqual(['first', 'second']);
    });

    it('compares dates by their instant', () => {
      const d = (y: number, m: number, day: number) => new Date(y, m, day);
      const dates = stateWith([[0, 0, { value: d(2024, 0, 2) }], [1, 0, { value: d(2023, 5, 1) }], [2, 0, { value: d(2024, 0, 1) }]]);
      const next = reduce(dates, sort(rect(0, 0, 2, 0), 0, true));
      expect(column(next, 0, 3)).toEqual([d(2023, 5, 1), d(2024, 0, 1), d(2024, 0, 2)]);
    });
  });

  describe('SET_VALIDATION and SET_COMMENT', () => {
    it('adds and removes validation rules, creating the map on first use', () => {
      const validation = { type: 'list' as const, list: ['a', 'b'] };
      const withRule = reduce(makeState(), { type: 'SET_VALIDATION', payload: { row: 0, col: 0, validation } });
      expect(withRule.validation?.get('0:0')).toBe(validation);
      const cleared = reduce(withRule, { type: 'SET_VALIDATION', payload: { row: 0, col: 0, validation: null } });
      expect(cleared.validation?.size).toBe(0);
    });

    it('adds and removes comments', () => {
      const comment = { author: 'me', text: 'hi', timestamp: 1 };
      const added = reduce(makeState(), { type: 'SET_COMMENT', payload: { key: '0:0', comment } });
      expect(added.comments?.get('0:0')).toBe(comment);
      const removed = reduce(added, { type: 'SET_COMMENT', payload: { key: '0:0', comment: null } });
      expect(removed.comments?.has('0:0')).toBe(false);
    });
  });

  describe('SET_FROZEN', () => {
    it('updates only the given axis and defaults the other to zero', () => {
      const rows = reduce(makeState(), { type: 'SET_FROZEN', payload: { rows: 2 } });
      expect([rows.frozenRows, rows.frozenCols]).toEqual([2, 0]);
      const cols = reduce(rows, { type: 'SET_FROZEN', payload: { cols: 1 } });
      expect([cols.frozenRows, cols.frozenCols]).toEqual([2, 1]);
    });

    it('clamps negative values to zero', () => {
      const next = reduce(makeState(), { type: 'SET_FROZEN', payload: { rows: -3, cols: -1 } });
      expect([next.frozenRows, next.frozenCols]).toEqual([0, 0]);
    });
  });

  describe('row heights and column widths', () => {
    it('SET_ROW_HEIGHTS and SET_COLUMN_WIDTHS replace the arrays', () => {
      const next = reduce(
        makeState(),
        { type: 'SET_ROW_HEIGHTS', payload: [1, 2] },
        { type: 'SET_COLUMN_WIDTHS', payload: [3, 4] }
      );
      expect(next.rowHeights).toEqual([1, 2]);
      expect(next.colWidths).toEqual([3, 4]);
    });

    it('SET_ROW_HEIGHT updates one entry without mutating the old array', () => {
      const state = makeState({ rowHeights: [10, 10, 10] });
      const next = reduce(state, { type: 'SET_ROW_HEIGHT', payload: { row: 1, height: 40 } });
      expect(next.rowHeights).toEqual([10, 40, 10]);
      expect(state.rowHeights).toEqual([10, 10, 10]);
    });

    it('SET_ROW_HEIGHT and SET_COLUMN_WIDTH fill in defaults when no sizes exist yet', () => {
      const state = makeState({ maxRows: 3, maxCols: 2 });
      const rows = reduce(state, { type: 'SET_ROW_HEIGHT', payload: { row: 2, height: 50 } });
      expect(rows.rowHeights).toEqual([22, 22, 50]);
      const cols = reduce(state, { type: 'SET_COLUMN_WIDTH', payload: { col: 0, width: 150 } });
      expect(cols.colWidths).toEqual([150, 96]);
    });
  });

  describe('APPLY_FORMAT_TO_SELECTION', () => {
    it('is a no-op without a selection', () => {
      const state = makeState();
      expect(reduce(state, { type: 'APPLY_FORMAT_TO_SELECTION', payload: { bold: true } })).toBe(state);
    });

    it('merges the format into every cell of every range, creating empty cells as needed', () => {
      const state = stateWith([[0, 0, { value: 'x', format: { italic: true } }]], {
        selection: { ranges: [rect(1, 0, 0, 0), rect(3, 3, 3, 3)], active: null },
      });
      const next = reduce(state, { type: 'APPLY_FORMAT_TO_SELECTION', payload: { bold: true } });
      expect(cellAt(next, 0, 0)).toEqual({ value: 'x', format: { italic: true, bold: true } });
      expect(cellAt(next, 1, 0)).toEqual({ value: '', format: { bold: true } });
      expect(cellAt(next, 3, 3)).toEqual({ value: '', format: { bold: true } });
      expect(next.data.size).toBe(3);
    });
  });

  it('UPDATE_SHEET_FORMATTING merges into the existing sheet formatting', () => {
    const state = makeState({ sheetFormatting: { theme: 'dark', showGridlines: true } });
    const next = reduce(state, { type: 'UPDATE_SHEET_FORMATTING', payload: { showGridlines: false } });
    expect(next.sheetFormatting).toEqual({ theme: 'dark', showGridlines: false });
  });

  describe('BATCH', () => {
    it('applies the actions in order against the accumulating state', () => {
      const next = reduce(makeState(), {
        type: 'BATCH',
        payload: [set(0, 0, { value: 'moved' }), { type: 'INSERT_ROW', payload: { index: 0 } }],
      });
      expect(cellAt(next, 0, 0)).toBeUndefined();
      expect(valueAt(next, 1, 0)).toBe('moved');
    });

    it('returns the same state for an empty batch', () => {
      const state = makeState();
      expect(reduce(state, { type: 'BATCH', payload: [] })).toBe(state);
    });
  });

  it('UNDO, REDO and unknown actions leave the state untouched', () => {
    const state = makeState();
    expect(reduce(state, { type: 'UNDO' })).toBe(state);
    expect(reduce(state, { type: 'REDO' })).toBe(state);
    expect(reduce(state, { type: 'NOT_AN_ACTION' } as unknown as SpreadsheetAction)).toBe(state);
  });
});
