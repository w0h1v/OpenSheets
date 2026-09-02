import { PersistenceManager } from '../persistence/PersistenceManager';
import { PersistenceAdapter, PersistedState, SaveResult } from '../persistence/types';
import { SpreadsheetState } from '../types/spreadsheet';

const makeAdapter = () => ({
  save: jest.fn<Promise<SaveResult>, [string, PersistedState]>(),
  load: jest.fn<Promise<PersistedState | null>, [string]>(),
  delete: jest.fn<Promise<void>, [string]>(),
  saveVersion: jest.fn(),
  loadVersion: jest.fn<Promise<PersistedState | null>, [string, string]>(),
  listVersions: jest.fn(),
  exists: jest.fn(),
  getMetadata: jest.fn(),
  updateMetadata: jest.fn(),
  getSyncStatus: jest.fn(),
  onSyncStatusChange: undefined as PersistenceAdapter['onSyncStatusChange'],
}) satisfies PersistenceAdapter;

const makeState = (overrides: Partial<SpreadsheetState> = {}): SpreadsheetState => ({
  data: new Map([['0:0', { value: 'a' }], ['1:1', { value: 2, formula: '=1+1' }]]),
  maxRows: 50,
  maxCols: 5,
  selection: { ranges: [{ startRow: 0, startCol: 0, endRow: 0, endCol: 0 }], active: { row: 0, col: 0 } },
  editing: null,
  formulaInput: '',
  ...overrides,
});

const persistedDoc = (): PersistedState => ({
  version: '2.0.0',
  data: [['3:3', { value: 'loaded' }]],
  rowHeights: [30],
  colWidths: [120],
  validation: [['3:3', { type: 'list', list: ['x'] }]],
  comments: [['3:3', { author: 'me', text: 'hi', timestamp: 1 }]],
  frozenRows: 1,
  frozenCols: 2,
  merges: [{ startRow: 0, startCol: 0, endRow: 1, endCol: 1 }],
  filters: [{ column: 0, type: 'text', condition: 'isEmpty' }],
  protectedRanges: [{ id: 'p', range: { startRow: 0, startCol: 0, endRow: 0, endCol: 0 }, owner: 'me' }],
  metadata: { id: 'doc', title: 'doc', createdAt: 1, updatedAt: 1, revision: 3 },
});

const ok: SaveResult = { success: true, timestamp: 1 };

describe('PersistenceManager', () => {
  let adapter: ReturnType<typeof makeAdapter>;

  beforeEach(() => {
    adapter = makeAdapter();
    jest.spyOn(Date, 'now').mockReturnValue(5000);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('save', () => {
    it('serializes the document for the adapter and reports completion', async () => {
      adapter.save.mockResolvedValue(ok);
      const onSaveComplete = jest.fn();
      const manager = new PersistenceManager({ spreadsheetId: 'doc', adapter, onSaveComplete });
      const state = makeState({
        rowHeights: [1, 2],
        colWidths: [3],
        validation: new Map([['0:0', { type: 'number', min: 1 }]]),
        comments: new Map([['0:0', { author: 'me', text: 'note', timestamp: 9 }]]),
        frozenRows: 1,
        frozenCols: 0,
        merges: [{ startRow: 0, startCol: 0, endRow: 0, endCol: 1 }],
        filters: [{ column: 1, type: 'number', condition: 'greaterThan', value: 1 }],
        protectedRanges: [{ id: 'p1', range: { startRow: 0, startCol: 0, endRow: 0, endCol: 0 }, owner: 'me' }],
      });

      const result = await manager.save(state);

      expect(result).toBe(ok);
      expect(onSaveComplete).toHaveBeenCalledWith(ok);
      expect(adapter.save).toHaveBeenCalledTimes(1);
      const [id, persisted] = adapter.save.mock.calls[0];
      expect(id).toBe('doc');
      expect(persisted).toEqual({
        version: '2.0.0',
        data: [['0:0', { value: 'a' }], ['1:1', { value: 2, formula: '=1+1' }]],
        rowHeights: [1, 2],
        colWidths: [3],
        validation: [['0:0', { type: 'number', min: 1 }]],
        comments: [['0:0', { author: 'me', text: 'note', timestamp: 9 }]],
        frozenRows: 1,
        frozenCols: 0,
        merges: state.merges,
        filters: state.filters,
        protectedRanges: state.protectedRanges,
        metadata: { id: 'doc', title: 'doc', createdAt: 5000, updatedAt: 5000, revision: 0 },
      });
    });

    it('defaults missing sizes to empty arrays and leaves absent maps undefined', async () => {
      adapter.save.mockResolvedValue(ok);
      const manager = new PersistenceManager({ spreadsheetId: 'doc', adapter });
      await manager.save(makeState());
      const persisted = adapter.save.mock.calls[0][1];
      expect(persisted.rowHeights).toEqual([]);
      expect(persisted.colWidths).toEqual([]);
      expect(persisted.validation).toBeUndefined();
      expect(persisted.comments).toBeUndefined();
    });

    it('runs saves one at a time, in order', async () => {
      let finishFirst!: (result: SaveResult) => void;
      adapter.save
        .mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve; }))
        .mockResolvedValueOnce({ success: true, timestamp: 2 });
      const manager = new PersistenceManager({ spreadsheetId: 'doc', adapter });

      const first = manager.save(makeState());
      const second = manager.save(makeState());
      await Promise.resolve();
      expect(adapter.save).toHaveBeenCalledTimes(1);

      finishFirst({ success: true, timestamp: 1 });
      expect((await first).timestamp).toBe(1);
      expect((await second).timestamp).toBe(2);
      expect(adapter.save).toHaveBeenCalledTimes(2);
    });

    it('lets the next save run after a failed one', async () => {
      adapter.save.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(ok);
      const manager = new PersistenceManager({ spreadsheetId: 'doc', adapter });
      const failed = manager.save(makeState());
      const next = manager.save(makeState());
      await expect(failed).rejects.toThrow('boom');
      expect(await next).toBe(ok);
    });
  });

  describe('load', () => {
    it('rebuilds spreadsheet state from the persisted document', async () => {
      adapter.load.mockResolvedValue(persistedDoc());
      const manager = new PersistenceManager({ spreadsheetId: 'doc', adapter, maxRows: 20, maxCols: 4 });

      const state = await manager.load();

      expect(adapter.load).toHaveBeenCalledWith('doc');
      expect(state).toEqual({
        data: new Map([['3:3', { value: 'loaded' }]]),
        maxRows: 20,
        maxCols: 4,
        selection: { ranges: [], active: null },
        editing: null,
        formulaInput: '',
        rowHeights: [30],
        colWidths: [120],
        validation: new Map([['3:3', { type: 'list', list: ['x'] }]]),
        comments: new Map([['3:3', { author: 'me', text: 'hi', timestamp: 1 }]]),
        frozenRows: 1,
        frozenCols: 2,
        merges: [{ startRow: 0, startCol: 0, endRow: 1, endCol: 1 }],
        filters: [{ column: 0, type: 'text', condition: 'isEmpty' }],
        protectedRanges: [{ id: 'p', range: { startRow: 0, startCol: 0, endRow: 0, endCol: 0 }, owner: 'me' }],
      });
    });

    it('falls back to a 1000x100 grid and leaves absent maps undefined', async () => {
      adapter.load.mockResolvedValue({ ...persistedDoc(), validation: undefined, comments: undefined });
      const state = await new PersistenceManager({ spreadsheetId: 'doc', adapter }).load();
      expect(state?.maxRows).toBe(1000);
      expect(state?.maxCols).toBe(100);
      expect(state?.validation).toBeUndefined();
      expect(state?.comments).toBeUndefined();
    });

    it('resolves null when nothing is stored', async () => {
      adapter.load.mockResolvedValue(null);
      expect(await new PersistenceManager({ spreadsheetId: 'doc', adapter }).load()).toBeNull();
    });
  });

  describe('versions, delete and status', () => {
    it('delegates to the adapter with the spreadsheet id', async () => {
      const version = { id: 'v1', timestamp: 1, size: 1, revision: 1 };
      adapter.saveVersion.mockResolvedValue(version);
      adapter.listVersions.mockResolvedValue([version]);
      adapter.loadVersion.mockResolvedValue(persistedDoc());
      adapter.delete.mockResolvedValue(undefined);
      const status = { connected: true, syncing: false, pendingChanges: 0, mode: 'local' as const };
      adapter.getSyncStatus.mockReturnValue(status);
      const manager = new PersistenceManager({ spreadsheetId: 'doc', adapter });

      expect(await manager.saveVersion(makeState(), 'label')).toBe(version);
      expect(adapter.saveVersion).toHaveBeenCalledWith('doc', expect.objectContaining({ version: '2.0.0' }), 'label');
      expect(await manager.listVersions()).toEqual([version]);
      expect((await manager.loadVersion('v1'))?.data.get('3:3')).toEqual({ value: 'loaded' });
      expect(adapter.loadVersion).toHaveBeenCalledWith('doc', 'v1');
      adapter.loadVersion.mockResolvedValue(null);
      expect(await manager.loadVersion('v2')).toBeNull();
      await manager.delete();
      expect(adapter.delete).toHaveBeenCalledWith('doc');
      expect(manager.getSyncStatus()).toBe(status);
    });

    it('wires the sync status callback into the adapter', () => {
      const onSyncStatusChange = jest.fn();
      new PersistenceManager({ spreadsheetId: 'doc', adapter, onSyncStatusChange });
      expect(adapter.onSyncStatusChange).toBe(onSyncStatusChange);
    });
  });

  it('uses a LocalStorageAdapter when no adapter is given', async () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => store.clear(),
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      get length() { return store.size; },
    };
    Object.defineProperty(window, 'localStorage', { configurable: true, value: storage });

    const manager = new PersistenceManager({ spreadsheetId: 'doc', maxRows: 10, maxCols: 10 });
    expect((await manager.save(makeState())).success).toBe(true);
    expect(store.has('opensheets_doc')).toBe(true);
    const loaded = await manager.load();
    expect(loaded?.data.get('1:1')).toEqual({ value: 2, formula: '=1+1' });
    expect(manager.getSyncStatus().mode).toBe('local');
  });
});
