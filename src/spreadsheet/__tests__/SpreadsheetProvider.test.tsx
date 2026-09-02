import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SpreadsheetProvider, SpreadsheetProviderProps } from '../SpreadsheetProvider';
import { useSpreadsheet, useSpreadsheetBase } from '../SpreadsheetContext';
import { PersistenceAdapter, PersistedState, SaveResult, SyncStatus, Version } from '../persistence/types';
import { CellData, keyOf } from '../types/spreadsheet';

const IDLE: SyncStatus = { connected: true, syncing: false, pendingChanges: 0, mode: 'local' };

const persistedDoc = (over: Partial<PersistedState> = {}): PersistedState => ({
  version: '2.0.0',
  data: [['0:0', { value: 'from storage' }]],
  rowHeights: [30],
  colWidths: [120],
  frozenRows: 1,
  frozenCols: 0,
  metadata: { id: 'doc', title: 'doc', createdAt: 1, updatedAt: 1, revision: 1 },
  ...over,
});

// An adapter that records calls and answers from an in-memory document
const makeAdapter = (initial: PersistedState | null = null) => {
  let stored = initial;
  const versions: Version[] = [];
  const snapshots = new Map<string, PersistedState>();
  const adapter: PersistenceAdapter & {
    saved: PersistedState[];
    save: jest.Mock<Promise<SaveResult>, [string, PersistedState]>;
    load: jest.Mock<Promise<PersistedState | null>, [string]>;
  } = {
    saved: [],
    save: jest.fn(async (_id: string, state: PersistedState): Promise<SaveResult> => {
      stored = state;
      adapter.saved.push(state);
      return { success: true, timestamp: 1, revision: adapter.saved.length };
    }),
    load: jest.fn(async (_id: string) => stored),
    delete: jest.fn(async () => { stored = null; }),
    saveVersion: jest.fn(async (_id: string, state: PersistedState, label?: string) => {
      const version = { id: `v${versions.length + 1}`, timestamp: 1, label, size: 1, revision: 1 };
      versions.push(version);
      snapshots.set(version.id, state);
      return version;
    }),
    loadVersion: jest.fn(async (_id: string, versionId: string) => snapshots.get(versionId) ?? null),
    listVersions: jest.fn(async () => versions),
    exists: jest.fn(async () => stored !== null),
    getMetadata: jest.fn(async () => null),
    updateMetadata: jest.fn(async () => {}),
    getSyncStatus: jest.fn(() => IDLE),
  };
  return adapter;
};

// Renders the context so tests can assert on it, and exposes it for direct calls
type Ctx = ReturnType<typeof useSpreadsheet>;
let ctx: Ctx;
let baseCtx: ReturnType<typeof useSpreadsheetBase>;

const Probe: React.FC = () => {
  ctx = useSpreadsheet();
  baseCtx = useSpreadsheetBase();
  return (
    <div>
      <span data-testid="a1">{String(ctx.getCell(0, 0)?.value ?? '')}</span>
      <span data-testid="dirty">{String(ctx.dirty)}</span>
      <span data-testid="persisted">{String(ctx.persisted)}</span>
      <span data-testid="syncing">{String(ctx.syncStatus.syncing)}</span>
      <span data-testid="history">{`${ctx.canUndo}/${ctx.canRedo}`}</span>
    </div>
  );
};

const renderProvider = (props: Partial<SpreadsheetProviderProps> = {}) =>
  render(
    <SpreadsheetProvider spreadsheetId="doc" maxRows={10} maxCols={10} {...props}>
      <Probe />
    </SpreadsheetProvider>
  );

const text = (id: string) => screen.getByTestId(id).textContent;

describe('SpreadsheetProvider', () => {
  let storage: Record<string, string>;

  beforeEach(() => {
    storage = {};
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: jest.fn((k: string) => storage[k] ?? null),
        setItem: jest.fn((k: string, v: string) => { storage[k] = v; }),
        removeItem: jest.fn((k: string) => { delete storage[k]; }),
        clear: jest.fn(() => { storage = {}; }),
        key: jest.fn(() => null),
        length: 0,
      },
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('persistence "none"', () => {
    it('never touches storage and reports itself unpersisted', async () => {
      renderProvider();
      act(() => { ctx.setCell(0, 0, { value: 'typed' }); });

      await waitFor(() => expect(text('a1')).toBe('typed'));
      expect(text('persisted')).toBe('false');
      expect(text('dirty')).toBe('false');
      expect(window.localStorage.setItem).not.toHaveBeenCalled();
    });

    it('resolves save, load and the version helpers without an adapter', async () => {
      renderProvider();
      await act(async () => {
        expect(await ctx.save()).toEqual({ success: true, timestamp: expect.any(Number) });
        expect(await ctx.load()).toBeUndefined();
        expect(await ctx.saveVersion('v')).toBeUndefined();
        expect(await ctx.loadVersion('v1')).toBeUndefined();
        expect(await ctx.listVersions()).toEqual([]);
      });
      expect(window.localStorage.setItem).not.toHaveBeenCalled();
      expect(ctx.syncStatus).toEqual(IDLE);
    });
  });

  describe('initial state', () => {
    it('seeds the grid from initialData and the given dimensions', () => {
      const initialData = new Map<string, CellData>([[keyOf(0, 0), { value: 'seed' }]]);
      renderProvider({ initialData, maxRows: 3, maxCols: 2, readOnly: true });

      expect(text('a1')).toBe('seed');
      expect(ctx.state.maxRows).toBe(3);
      expect(ctx.state.rowHeights).toEqual([22, 22, 22]);
      expect(ctx.state.colWidths).toEqual([96, 96]);
      expect(ctx.state.readOnly).toBe(true);
    });

    it('throws when the hooks are used outside a provider', () => {
      const Outside: React.FC = () => { useSpreadsheet(); return null; };
      jest.spyOn(console, 'error').mockImplementation(() => {});
      expect(() => render(<Outside />)).toThrow('useSpreadsheet must be used inside a SpreadsheetProvider');
    });
  });

  describe('persistence "local"', () => {
    it('loads the stored document on mount and reports the result', async () => {
      storage.opensheets_doc = JSON.stringify(persistedDoc());
      const onLoadComplete = jest.fn();
      renderProvider({ persistence: 'local', onLoadComplete });

      await waitFor(() => expect(text('a1')).toBe('from storage'));
      expect(onLoadComplete).toHaveBeenCalledWith(true);
      expect(ctx.state.frozenRows).toBe(1);
      expect(ctx.state.rowHeights).toEqual([30]);
      expect(text('persisted')).toBe('true');
      expect(text('dirty')).toBe('false');
    });

    it('reports an empty load when nothing is stored', async () => {
      const onLoadComplete = jest.fn();
      renderProvider({ persistence: 'local', onLoadComplete });
      await waitFor(() => expect(onLoadComplete).toHaveBeenCalledWith(false));
      expect(text('a1')).toBe('');
    });

    it('writes to localStorage when saved', async () => {
      renderProvider({ persistence: 'local', autoSave: false });
      act(() => { ctx.setCell(0, 0, { value: 'typed' }); });
      await act(async () => { await ctx.save(); });

      expect(JSON.parse(storage.opensheets_doc).data).toEqual([['0:0', expect.objectContaining({ value: 'typed' })]]);
    });
  });

  describe('autosave', () => {
    it('marks the document dirty and saves once the interval elapses', async () => {
      jest.useFakeTimers();
      const adapter = makeAdapter();
      const onSaveComplete = jest.fn();
      renderProvider({ persistence: adapter, autoSaveInterval: 5000, onSaveComplete });
      await act(async () => { await Promise.resolve(); });

      act(() => { ctx.setCell(0, 0, { value: 'typed' }); });
      expect(text('dirty')).toBe('true');
      expect(adapter.save).not.toHaveBeenCalled();

      act(() => { jest.advanceTimersByTime(4999); });
      expect(adapter.save).not.toHaveBeenCalled();

      await act(async () => { jest.advanceTimersByTime(1); });
      expect(adapter.save).toHaveBeenCalledTimes(1);
      expect(adapter.saved[0].data).toEqual([['0:0', expect.objectContaining({ value: 'typed' })]]);
      expect(onSaveComplete).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
      await waitFor(() => expect(text('dirty')).toBe('false'));
    });

    it('waits for the edit to finish before saving', async () => {
      jest.useFakeTimers();
      const adapter = makeAdapter();
      renderProvider({ persistence: adapter, autoSaveInterval: 1000 });
      await act(async () => { await Promise.resolve(); });

      act(() => { ctx.dispatch({ type: 'SET_EDITING', payload: { row: 0, col: 0 } }); });
      act(() => { ctx.setCell(0, 0, { value: 'half typed' }); });
      act(() => { jest.advanceTimersByTime(5000); });
      expect(adapter.save).not.toHaveBeenCalled();

      act(() => { ctx.dispatch({ type: 'SET_EDITING', payload: null }); });
      await act(async () => { jest.advanceTimersByTime(1000); });
      expect(adapter.save).toHaveBeenCalledTimes(1);
    });

    it('does not autosave when disabled', async () => {
      jest.useFakeTimers();
      const adapter = makeAdapter();
      renderProvider({ persistence: adapter, autoSave: false, autoSaveInterval: 100 });
      await act(async () => { await Promise.resolve(); });

      act(() => { ctx.setCell(0, 0, { value: 'typed' }); });
      act(() => { jest.advanceTimersByTime(10000); });

      expect(adapter.save).not.toHaveBeenCalled();
      expect(text('dirty')).toBe('true');
    });

    it('flushes unsaved edits when the provider unmounts', async () => {
      const adapter = makeAdapter();
      const view = render(
        <SpreadsheetProvider spreadsheetId="doc" persistence={adapter} autoSave={false}>
          <Probe />
        </SpreadsheetProvider>
      );
      await waitFor(() => expect(adapter.load).toHaveBeenCalled());
      act(() => { ctx.setCell(0, 0, { value: 'unsaved' }); });

      await act(async () => { view.unmount(); });

      expect(adapter.save).toHaveBeenCalledTimes(1);
    });
  });

  describe('Ctrl+S', () => {
    it('saves a persisted document and suppresses the browser default', async () => {
      const adapter = makeAdapter();
      renderProvider({ persistence: adapter, autoSave: false });
      await waitFor(() => expect(adapter.load).toHaveBeenCalled());

      const prevented = !fireEvent.keyDown(window, { key: 's', ctrlKey: true, cancelable: true });

      expect(prevented).toBe(true);
      await waitFor(() => expect(adapter.save).toHaveBeenCalledTimes(1));
    });

    it('does nothing for an unpersisted document', () => {
      renderProvider();
      const prevented = !fireEvent.keyDown(window, { key: 's', metaKey: true, cancelable: true });
      expect(prevented).toBe(false);
    });
  });

  describe('custom adapter', () => {
    it('routes every persistence call through the given adapter', async () => {
      const adapter = makeAdapter(persistedDoc());
      renderProvider({ persistence: adapter, autoSave: false });

      await waitFor(() => expect(text('a1')).toBe('from storage'));
      expect(adapter.load).toHaveBeenCalledWith('doc');

      await act(async () => { await ctx.saveVersion('milestone'); });
      expect(adapter.saveVersion).toHaveBeenCalledWith('doc', expect.any(Object), 'milestone');
      expect(await ctx.listVersions()).toEqual([{ id: 'v1', timestamp: 1, label: 'milestone', size: 1, revision: 1 }]);
    });

    it('restores a saved version into the document', async () => {
      const adapter = makeAdapter();
      renderProvider({ persistence: adapter, autoSave: false });
      await waitFor(() => expect(adapter.load).toHaveBeenCalled());

      act(() => { ctx.setCell(0, 0, { value: 'v1 content' }); });
      await act(async () => { await ctx.saveVersion('first'); });
      act(() => { ctx.setCell(0, 0, { value: 'later edit' }); });
      await waitFor(() => expect(text('a1')).toBe('later edit'));

      await act(async () => { await ctx.loadVersion('v1'); });

      expect(text('a1')).toBe('v1 content');
      await act(async () => { await ctx.loadVersion('missing'); });
      expect(text('a1')).toBe('v1 content');
    });

    it('surfaces sync status from the adapter and while saving', async () => {
      const adapter = makeAdapter();
      const onSyncStatusChange = jest.fn();
      renderProvider({ persistence: adapter, autoSave: false, onSyncStatusChange });
      await waitFor(() => expect(adapter.load).toHaveBeenCalled());

      const busy: SyncStatus = { ...IDLE, syncing: true, pendingChanges: 2 };
      act(() => { adapter.onSyncStatusChange?.(busy); });

      expect(onSyncStatusChange).toHaveBeenCalledWith(busy);
      await waitFor(() => expect(text('syncing')).toBe('true'));
    });

    it('reports a failed save without losing the dirty flag', async () => {
      const adapter = makeAdapter();
      adapter.save.mockRejectedValueOnce(new Error('adapter offline'));
      renderProvider({ persistence: adapter, autoSave: false });
      await waitFor(() => expect(adapter.load).toHaveBeenCalled());
      act(() => { ctx.setCell(0, 0, { value: 'typed' }); });

      let result!: SaveResult;
      await act(async () => { result = await ctx.save(); });

      expect(result).toEqual({ success: false, timestamp: expect.any(Number), error: 'adapter offline' });
      expect(text('dirty')).toBe('true');
    });

    it('reports a load failure through onLoadComplete', async () => {
      const adapter = makeAdapter();
      adapter.load.mockRejectedValueOnce(new Error('unreadable'));
      const onLoadComplete = jest.fn();
      renderProvider({ persistence: adapter, onLoadComplete });
      await waitFor(() => expect(onLoadComplete).toHaveBeenCalledWith(false));
    });
  });

  describe('undo and redo', () => {
    it('steps back and forward through document edits', async () => {
      renderProvider();
      expect(text('history')).toBe('false/false');

      act(() => { ctx.setCell(0, 0, { value: 'first' }); });
      await waitFor(() => expect(text('a1')).toBe('first'));
      act(() => { ctx.setCell(0, 0, { value: 'second' }); });
      await waitFor(() => expect(text('history')).toBe('true/false'));

      fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
      await waitFor(() => expect(text('a1')).toBe('first'));

      fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true });
      await waitFor(() => expect(text('a1')).toBe('second'));
    });

    it('ignores selection-only changes', async () => {
      renderProvider();
      act(() => { ctx.dispatch({ type: 'SET_SELECTION', payload: { ranges: [], active: { row: 1, col: 1 } } }); });
      await waitFor(() => expect(ctx.state.selection.active).toEqual({ row: 1, col: 1 }));
      expect(text('history')).toBe('false/false');
    });
  });

  describe('callbacks', () => {
    it('reports selection changes', async () => {
      const onSelectionChange = jest.fn();
      renderProvider({ onSelectionChange });
      const selection = { ranges: [{ startRow: 1, startCol: 1, endRow: 1, endCol: 1 }], active: { row: 1, col: 1 } };

      act(() => { ctx.dispatch({ type: 'SET_SELECTION', payload: selection }); });

      await waitFor(() => expect(onSelectionChange).toHaveBeenLastCalledWith(selection));
    });

    it('reports the active cell after an edit, but not mid-edit', async () => {
      const onCellChange = jest.fn();
      renderProvider({ onCellChange });

      act(() => {
        ctx.dispatch({
          type: 'BATCH',
          payload: [
            { type: 'SET_SELECTION', payload: { ranges: [], active: { row: 0, col: 0 } } },
            { type: 'SET_EDITING', payload: { row: 0, col: 0 } },
          ],
        });
      });
      act(() => { ctx.setCell(0, 0, { value: 'typing' }); });
      expect(onCellChange).not.toHaveBeenCalled();

      act(() => { ctx.dispatch({ type: 'SET_EDITING', payload: null }); });

      await waitFor(() => expect(onCellChange).toHaveBeenCalledWith(0, 0, expect.objectContaining({ value: 'typing' })));
    });
  });

  describe('base context bridge', () => {
    it('applies a functional setState against the current state', async () => {
      renderProvider();

      act(() => {
        baseCtx.setState((prev) => ({ ...prev, formulaInput: '=SUM(A1:A2)' }));
      });

      await waitFor(() => expect(ctx.state.formulaInput).toBe('=SUM(A1:A2)'));
      act(() => { baseCtx.setState({ ...ctx.state, formulaInput: 'literal' }); });
      await waitFor(() => expect(ctx.state.formulaInput).toBe('literal'));
    });

    it('shares one state with the main context', async () => {
      renderProvider();
      act(() => { ctx.setCell(1, 1, { value: 'shared' }); });
      await waitFor(() => expect(baseCtx.getCell(1, 1)?.value).toBe('shared'));
      expect(baseCtx.state).toBe(ctx.state);
    });
  });
});
