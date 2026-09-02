import React, { createContext, useContext, useReducer, useCallback, useMemo, useEffect, useRef } from 'react';
import { TableProps, SpreadsheetState, CellData, keyOf } from './types/spreadsheet';
import { SpreadsheetAction } from './types/actions';
import { spreadsheetReducer } from './reducers/spreadsheetReducer';
import { useUndoRedo } from './hooks/useUndoRedo';
import {
  SpreadsheetContextInstance,
} from './SpreadsheetContext';
import { SpreadsheetEnhancedContext } from './SpreadsheetContextEnhanced';
import { PersistenceManager } from './persistence/PersistenceManager';
import type { PersistenceAdapter } from './persistence/types';
import { SyncStatus, SaveResult } from './persistence/types';

interface SpreadsheetContextValue {
  state: SpreadsheetState;
  dispatch: React.Dispatch<SpreadsheetAction>;
  getCell: (r: number, c: number) => CellData | undefined;
  setCell: (r: number, c: number, data: Partial<CellData>) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  save: () => Promise<SaveResult>;
  load: () => Promise<void>;
  saveVersion: (label?: string) => Promise<void>;
  loadVersion: (versionId: string) => Promise<void>;
  listVersions: () => Promise<{ id: string; label?: string; timestamp: number }[]>;
  syncStatus: SyncStatus;
  dirty: boolean;
}

export interface PersistedTableProps extends TableProps {
  spreadsheetId?: string;
  /** Where documents are stored; defaults to this browser's localStorage. */
  adapter?: PersistenceAdapter;
  autoSave?: boolean;
  autoSaveInterval?: number;
  onSyncStatusChange?: (status: SyncStatus) => void;
  onSaveComplete?: (result: SaveResult) => void;
  onLoadComplete?: (success: boolean) => void;
}

export const SpreadsheetContext = createContext<SpreadsheetContextValue | null>(null);

// Enhanced reducer with persistence support
const enhancedReducer = (state: SpreadsheetState, action: SpreadsheetAction): SpreadsheetState => {
  // Handle special restore state action
  if (action.type === 'RESTORE_STATE') {
    return action.payload;
  }

  // Apply a React-style setState updater against the accumulated state
  // (used by the base-context bridge)
  if ((action as any).type === 'APPLY_SET_STATE') {
    const updater = (action as any).payload;
    return typeof updater === 'function' ? updater(state) : updater;
  }

  // Handle load from persistence
  if (action.type === 'LOAD_STATE') {
    const loadedState = action.payload;
    return {
      ...state,
      data: loadedState.data,
      rowHeights: loadedState.rowHeights || state.rowHeights,
      colWidths: loadedState.colWidths || state.colWidths,
      validation: loadedState.validation || state.validation,
      comments: loadedState.comments || state.comments,
      frozenRows: loadedState.frozenRows,
      frozenCols: loadedState.frozenCols,
      merges: loadedState.merges,
      filters: loadedState.filters,
      protectedRanges: loadedState.protectedRanges,
    };
  }

  return spreadsheetReducer(state, action);
};

export const SpreadsheetProviderPersisted: React.FC<React.PropsWithChildren<PersistedTableProps>> = ({
  spreadsheetId = 'default',
  adapter,
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
  // Initialize state with defaults
  const initialState: SpreadsheetState = useMemo(() => ({
    data: initialData ?? new Map(),
    maxRows,
    maxCols,
    selection: { ranges: [], active: null },
    editing: null,
    formulaInput: '',
    readOnly,
    rowHeights: Array(maxRows).fill(22),
    colWidths: Array(maxCols).fill(96),
    validation: new Map(),
  }), [initialData, maxRows, maxCols, readOnly]);

  const [state, dispatch] = useReducer(enhancedReducer, initialState);
  // Always-current state for async saves (a save triggered right after a
  // dispatch must not persist the pre-dispatch snapshot)
  const stateRef = useRef(state);
  stateRef.current = state;
  
  // Sync status (dirty drives the header "Unsaved changes" label)
  const [dirty, setDirty] = React.useState(false);
  const [syncStatus, setSyncStatus] = React.useState<SyncStatus>({
    connected: true,
    syncing: false,
    pendingChanges: 0,
    mode: 'local',
  });

  // Persistence manager
  const persistenceManager = useRef<PersistenceManager | null>(null);
  const autoSaveTimer = useRef<NodeJS.Timeout | null>(null);
  const hasUnsavedChanges = useRef(false);
  const hasLoadedOnce = useRef(false);
  const saveDataRef = useRef<(() => Promise<unknown>) | null>(null);
  const lastSavedState = useRef<string>('');

  // Initialize persistence manager
  useEffect(() => {
    persistenceManager.current = new PersistenceManager({
      spreadsheetId,
      adapter,
      maxRows,
      maxCols,
      onSyncStatusChange: (status) => {
        setSyncStatus(status);
        onSyncStatusChange?.(status);
      },
      onSaveComplete,
    });

    // Load initial data (guard against StrictMode double-mount re-loading
    // and clobbering in-memory edits)
    if (!hasLoadedOnce.current) {
      hasLoadedOnce.current = true;
      loadData();
    }

    return () => {
      // Flush pending edits before unmounting (e.g. switching sheets
      // faster than the autosave debounce would otherwise lose them)
      if (hasUnsavedChanges.current) {
        saveDataRef.current?.();
      }
    };
  }, [spreadsheetId, adapter]);

  // Undo/Redo support
  const { undo, redo, canUndo, canRedo } = useUndoRedo(state, dispatch);

  // Load data from persistence
  const loadData = async () => {
    if (!persistenceManager.current) return;

    try {
      setSyncStatus(prev => ({ ...prev, syncing: true }));
      const loadedState = await persistenceManager.current.load();
      
      if (loadedState) {
        dispatch({ type: 'LOAD_STATE', payload: loadedState });
        lastSavedState.current = JSON.stringify({
          data: loadedState.data,
          comments: loadedState.comments,
        }, (_k, v) => (v instanceof Map ? Array.from(v.entries()) : v));
        setDirty(false);
        onLoadComplete?.(true);
      } else {
        onLoadComplete?.(false);
      }
    } catch (error) {
      console.error('Failed to load spreadsheet:', error);
      onLoadComplete?.(false);
    } finally {
      setSyncStatus(prev => ({ ...prev, syncing: false }));
    }
  };

  // Save data to persistence
  const saveData = async (): Promise<SaveResult> => {
    if (!persistenceManager.current) {
      return { success: false, timestamp: Date.now(), error: 'No persistence manager' };
    }

    try {
      setSyncStatus(prev => ({ ...prev, syncing: true }));
      const result = await persistenceManager.current.save(stateRef.current);
      
      if (result.success) {
        lastSavedState.current = JSON.stringify({
          data: stateRef.current.data,
          comments: stateRef.current.comments,
        }, (_k, v) => (v instanceof Map ? Array.from(v.entries()) : v));
        hasUnsavedChanges.current = false;
        setDirty(false);
      }
      
      return result;
    } catch (error) {
      console.error('Failed to save spreadsheet:', error);
      return { 
        success: false, 
        timestamp: Date.now(), 
        error: error instanceof Error ? error.message : 'Save failed' 
      };
    } finally {
      setSyncStatus(prev => ({ ...prev, syncing: false }));
    }
  };

  saveDataRef.current = saveData;

  // Auto-save functionality
  useEffect(() => {
    if (!autoSave) return;

    // Check if state has changed (data or comments)
    const currentStateStr = JSON.stringify({
      data: state.data,
      comments: state.comments,
    }, (_k, v) => (v instanceof Map ? Array.from(v.entries()) : v));
    if (currentStateStr !== lastSavedState.current) {
      hasUnsavedChanges.current = true;
      setDirty(true);
    }

    // Clear existing timer
    if (autoSaveTimer.current) {
      clearTimeout(autoSaveTimer.current);
    }

    // Set new timer
    if (hasUnsavedChanges.current && !state.editing) {
      autoSaveTimer.current = setTimeout(() => {
        saveData();
      }, autoSaveInterval);
    }

    return () => {
      if (autoSaveTimer.current) {
        clearTimeout(autoSaveTimer.current);
      }
    };
  }, [state.data, state.comments, state.editing, autoSave, autoSaveInterval]);

  // Save on window unload
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges.current) {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        
        // Try to save
        saveData();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Version management
  const saveVersion = async (label?: string) => {
    if (!persistenceManager.current) return;
    
    try {
      setSyncStatus(prev => ({ ...prev, syncing: true }));
      await persistenceManager.current.saveVersion(stateRef.current, label);
    } catch (error) {
      console.error('Failed to save version:', error);
    } finally {
      setSyncStatus(prev => ({ ...prev, syncing: false }));
    }
  };

  const loadVersion = async (versionId: string) => {
    if (!persistenceManager.current) return;
    
    try {
      setSyncStatus(prev => ({ ...prev, syncing: true }));
      const versionState = await persistenceManager.current.loadVersion(versionId);
      
      if (versionState) {
        dispatch({ type: 'LOAD_STATE', payload: versionState });
      }
    } catch (error) {
      console.error('Failed to load version:', error);
    } finally {
      setSyncStatus(prev => ({ ...prev, syncing: false }));
    }
  };

  const listVersions = async () => {
    if (!persistenceManager.current) return [];
    try {
      return await persistenceManager.current.listVersions();
    } catch (error) {
      console.error('Failed to list versions:', error);
      return [];
    }
  };

  // Memoized getCell function
  const getCell = useCallback((r: number, c: number) => {
    return state.data.get(keyOf(r, c));
  }, [state.data]);

  // Memoized setCell function
  const setCell = useCallback((r: number, c: number, data: Partial<CellData>) => {
    dispatch({ type: 'SET_CELL', payload: { row: r, col: c, data } });
    hasUnsavedChanges.current = true;
  }, [dispatch]);

  // Bridge state for components that consume the base or enhanced contexts
  // so the whole core component set works under this provider
  const bridgedSetState = useCallback((action: React.SetStateAction<SpreadsheetState>) => {
    dispatch({ type: 'APPLY_SET_STATE', payload: action } as unknown as SpreadsheetAction);
  }, []);
  const bridgeValue = useMemo(() => ({
    state,
    setState: bridgedSetState,
    getCell,
    setCell,
  }), [state, bridgedSetState, getCell, setCell]);

  // Call onCellChange callback
  useEffect(() => {
    if (onCellChange && state.editing === null) {
      const lastActive = state.selection.active;
      if (lastActive) {
        const cellData = getCell(lastActive.row, lastActive.col);
        if (cellData) {
          onCellChange(lastActive.row, lastActive.col, cellData);
        }
      }
    }
  }, [state.data, state.editing, state.selection.active, onCellChange, getCell]);

  // Call onSelectionChange callback
  useEffect(() => {
    if (onSelectionChange) {
      onSelectionChange(state.selection);
    }
  }, [state.selection, onSelectionChange]);

  // Keyboard shortcuts for save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveData();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const contextValue = useMemo(() => ({
    state,
    dispatch,
    getCell,
    setCell,
    undo,
    redo,
    canUndo,
    canRedo,
    save: saveData,
    load: loadData,
    saveVersion,
    loadVersion,
    listVersions,
    syncStatus,
    dirty,
  }), [state, dispatch, getCell, setCell, undo, redo, canUndo, canRedo, syncStatus, dirty, listVersions]);

  return (
    <SpreadsheetContext.Provider value={contextValue}>
      <SpreadsheetEnhancedContext.Provider value={contextValue as any}>
        <SpreadsheetContextInstance.Provider value={bridgeValue}>
          {children}
        </SpreadsheetContextInstance.Provider>
      </SpreadsheetEnhancedContext.Provider>
    </SpreadsheetContext.Provider>
  );
};

export const useSpreadsheetPersisted = () => {
  const ctx = useContext(SpreadsheetContext);
  if (!ctx) throw new Error('useSpreadsheetPersisted must be used within SpreadsheetProviderPersisted');
  return ctx;
};