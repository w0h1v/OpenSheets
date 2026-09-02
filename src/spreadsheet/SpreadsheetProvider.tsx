import React, { useReducer, useCallback, useMemo, useEffect, useRef, useState } from 'react';
import { TableProps, SpreadsheetState, CellData, keyOf, DEFAULT_ROW_HEIGHT, DEFAULT_COL_WIDTH } from './types/spreadsheet';
import { SpreadsheetAction } from './types/actions';
import { spreadsheetReducer } from './reducers/spreadsheetReducer';
import { useUndoRedo } from './hooks/useUndoRedo';
import {
  SpreadsheetContextInstance, SpreadsheetContext, SpreadsheetContextValue,
  SpreadsheetUiContext, SpreadsheetUiStores,
} from './SpreadsheetContext';
import { createFilterPanelStore } from './utils/filterPanelStore';
import { createFormulaHighlightStore } from './utils/formulaHighlightStore';
import { PersistenceManager } from './persistence/PersistenceManager';
import type { PersistenceAdapter, SyncStatus, SaveResult } from './persistence/types';

/**
 * Where a document is stored: nowhere (in memory only), this browser's
 * localStorage, or any adapter implementing PersistenceAdapter.
 */
export type Persistence = 'none' | 'local' | PersistenceAdapter;

export interface SpreadsheetProviderProps extends TableProps {
  /** Identifies the document for persistence and collaboration. */
  spreadsheetId?: string;
  persistence?: Persistence;
  /** Save automatically after edits settle (only with persistence). */
  autoSave?: boolean;
  autoSaveInterval?: number;
  onSyncStatusChange?: (status: SyncStatus) => void;
  onSaveComplete?: (result: SaveResult) => void;
  onLoadComplete?: (loaded: boolean) => void;
}

const IDLE_STATUS: SyncStatus = { connected: true, syncing: false, pendingChanges: 0, mode: 'local' };

// Serializes the parts of the state that persistence saves, for change detection
const documentSignature = (state: SpreadsheetState) =>
  JSON.stringify({ data: state.data, comments: state.comments }, (_k, v) => (v instanceof Map ? Array.from(v.entries()) : v));

const reducer = (state: SpreadsheetState, action: SpreadsheetAction): SpreadsheetState => {
  if (action.type === 'RESTORE_STATE') return action.payload;
  // A React-style setState updater applied against the accumulated state,
  // so functional updates composed with other actions in one batch are kept
  if (action.type === 'APPLY_SET_STATE') {
    const updater = action.payload;
    return typeof updater === 'function' ? updater(state) : updater;
  }
  if (action.type === 'LOAD_STATE') {
    const loaded = action.payload;
    return {
      ...state,
      data: loaded.data,
      rowHeights: loaded.rowHeights || state.rowHeights,
      colWidths: loaded.colWidths || state.colWidths,
      validation: loaded.validation || state.validation,
      comments: loaded.comments || state.comments,
      frozenRows: loaded.frozenRows,
      frozenCols: loaded.frozenCols,
      merges: loaded.merges,
      filters: loaded.filters,
      protectedRanges: loaded.protectedRanges,
      docMeta: loaded.docMeta ?? state.docMeta,
    };
  }
  return spreadsheetReducer(state, action);
};

/**
 * Owns a spreadsheet's state, undo history and persistence. Every other
 * component and hook in the package reads it through useSpreadsheet().
 */
export const SpreadsheetProvider: React.FC<React.PropsWithChildren<SpreadsheetProviderProps>> = ({
  spreadsheetId = 'default',
  persistence = 'none',
  autoSave = true,
  autoSaveInterval = 5000,
  initialData,
  maxRows = 1000,
  maxCols = 100,
  readOnly = false,
  onCellChange,
  onSelectionChange,
  onSyncStatusChange,
  onSaveComplete,
  onLoadComplete,
  children,
}) => {
  const initialState = useMemo<SpreadsheetState>(() => ({
    data: initialData ?? new Map(),
    maxRows,
    maxCols,
    selection: { ranges: [], active: null },
    editing: null,
    formulaInput: '',
    readOnly,
    rowHeights: Array(maxRows).fill(DEFAULT_ROW_HEIGHT),
    colWidths: Array(maxCols).fill(DEFAULT_COL_WIDTH),
    validation: new Map(),
  }), [initialData, maxRows, maxCols, readOnly]);

  const [state, dispatch] = useReducer(reducer, initialState);
  // Always-current state for async saves (a save triggered right after a
  // dispatch must not persist the pre-dispatch snapshot)
  const stateRef = useRef(state);
  stateRef.current = state;

  const [dirty, setDirty] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(IDLE_STATUS);

  const manager = useRef<PersistenceManager | null>(null);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasUnsavedChanges = useRef(false);
  const hasLoadedOnce = useRef(false);
  const saveRef = useRef<(() => Promise<SaveResult>) | null>(null);
  const lastSaved = useRef('');
  const persisted = persistence !== 'none';

  const load = useCallback(async () => {
    if (!manager.current) return;
    try {
      setSyncStatus((prev) => ({ ...prev, syncing: true }));
      const loaded = await manager.current.load();
      if (loaded) {
        dispatch({ type: 'LOAD_STATE', payload: loaded });
        lastSaved.current = documentSignature(loaded);
        setDirty(false);
      }
      onLoadComplete?.(Boolean(loaded));
    } catch {
      onLoadComplete?.(false);
    } finally {
      setSyncStatus((prev) => ({ ...prev, syncing: false }));
    }
  // Callbacks are read at call time; the identity of the document decides re-runs
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spreadsheetId]);

  const save = useCallback(async (): Promise<SaveResult> => {
    if (!manager.current) return { success: true, timestamp: Date.now() };
    try {
      setSyncStatus((prev) => ({ ...prev, syncing: true }));
      const result = await manager.current.save(stateRef.current);
      if (result.success) {
        lastSaved.current = documentSignature(stateRef.current);
        hasUnsavedChanges.current = false;
        setDirty(false);
      }
      return result;
    } catch (error) {
      return { success: false, timestamp: Date.now(), error: error instanceof Error ? error.message : 'Save failed' };
    } finally {
      setSyncStatus((prev) => ({ ...prev, syncing: false }));
    }
  }, []);
  saveRef.current = save;

  // One manager per document; the first mount loads it (StrictMode mounts
  // twice, and reloading would clobber in-memory edits)
  useEffect(() => {
    if (!persisted) {
      manager.current = null;
      return;
    }
    manager.current = new PersistenceManager({
      spreadsheetId,
      adapter: typeof persistence === 'object' ? persistence : undefined,
      maxRows,
      maxCols,
      onSyncStatusChange: (status) => {
        setSyncStatus(status);
        onSyncStatusChange?.(status);
      },
      onSaveComplete,
    });
    if (!hasLoadedOnce.current) {
      hasLoadedOnce.current = true;
      load();
    }
    return () => {
      // Flush pending edits before unmounting (switching documents faster
      // than the autosave debounce would otherwise lose them)
      if (hasUnsavedChanges.current) saveRef.current?.();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spreadsheetId, persistence]);

  const { undo, redo, canUndo, canRedo, handleKeyDown: handleUndoRedoKeyDown } = useUndoRedo(state, dispatch);

  // Autosave after edits settle, never mid-edit
  useEffect(() => {
    if (!persisted) return;
    if (documentSignature(state) !== lastSaved.current) {
      hasUnsavedChanges.current = true;
      setDirty(true);
    }
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    if (autoSave && hasUnsavedChanges.current && !state.editing) {
      autoSaveTimer.current = setTimeout(() => { save(); }, autoSaveInterval);
    }
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [state.data, state.comments, state.editing, autoSave, autoSaveInterval, persisted, save, state]);

  // Warn before leaving with unsaved edits, and try to flush them
  useEffect(() => {
    if (!persisted) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges.current) return;
      e.preventDefault();
      saveRef.current?.();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [persisted]);

  const saveVersion = useCallback(async (label?: string) => {
    if (!manager.current) return;
    try {
      setSyncStatus((prev) => ({ ...prev, syncing: true }));
      await manager.current.saveVersion(stateRef.current, label);
    } finally {
      setSyncStatus((prev) => ({ ...prev, syncing: false }));
    }
  }, []);

  const loadVersion = useCallback(async (versionId: string) => {
    if (!manager.current) return;
    try {
      setSyncStatus((prev) => ({ ...prev, syncing: true }));
      const version = await manager.current.loadVersion(versionId);
      if (version) dispatch({ type: 'LOAD_STATE', payload: version });
    } finally {
      setSyncStatus((prev) => ({ ...prev, syncing: false }));
    }
  }, []);

  const listVersions = useCallback(async () => {
    if (!manager.current) return [];
    return manager.current.listVersions();
  }, []);

  const getCell = useCallback((r: number, c: number) => state.data.get(keyOf(r, c)), [state.data]);

  const setCell = useCallback((r: number, c: number, data: Partial<CellData>) => {
    dispatch({ type: 'SET_CELL', payload: { row: r, col: c, data } });
    hasUnsavedChanges.current = true;
  }, []);

  // The base context gives grid internals a setState-style view of the same state
  const bridgedSetState = useCallback((action: React.SetStateAction<SpreadsheetState>) => {
    dispatch({ type: 'APPLY_SET_STATE', payload: action });
  }, []);
  const bridgeValue = useMemo(
    () => ({ state, setState: bridgedSetState, getCell, setCell, handleUndoRedoKeyDown }),
    [state, bridgedSetState, getCell, setCell, handleUndoRedoKeyDown]
  );

  // Panel and highlight state is per provider so grids on one page stay independent
  const [uiStores] = useState<SpreadsheetUiStores>(() => ({
    filterPanel: createFilterPanelStore(),
    formulaHighlights: createFormulaHighlightStore(),
  }));

  useEffect(() => {
    if (!onCellChange || state.editing !== null) return;
    const active = state.selection.active;
    if (!active) return;
    const cell = getCell(active.row, active.col);
    if (cell) onCellChange(active.row, active.col, cell);
  }, [state.data, state.editing, state.selection.active, onCellChange, getCell]);

  useEffect(() => {
    onSelectionChange?.(state.selection);
  }, [state.selection, onSelectionChange]);

  // Ctrl/Cmd+S saves when a document is persisted
  useEffect(() => {
    if (!persisted) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveRef.current?.();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [persisted]);

  const value = useMemo<SpreadsheetContextValue>(() => ({
    state,
    dispatch,
    getCell,
    setCell,
    undo,
    redo,
    canUndo,
    canRedo,
    save,
    load,
    saveVersion,
    loadVersion,
    listVersions,
    syncStatus,
    dirty,
    persisted,
  }), [state, getCell, setCell, undo, redo, canUndo, canRedo, save, load, saveVersion, loadVersion, listVersions, syncStatus, dirty, persisted]);

  return (
    <SpreadsheetContext.Provider value={value}>
      <SpreadsheetContextInstance.Provider value={bridgeValue}>
        <SpreadsheetUiContext.Provider value={uiStores}>
          {children}
        </SpreadsheetUiContext.Provider>
      </SpreadsheetContextInstance.Provider>
    </SpreadsheetContext.Provider>
  );
};
