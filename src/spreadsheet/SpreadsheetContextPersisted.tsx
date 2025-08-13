import React, { createContext, useContext, useReducer, useCallback, useMemo, useEffect, useRef } from 'react';
import { TableProps, SpreadsheetState, CellData, keyOf } from './types/spreadsheet';
import { SpreadsheetAction } from './types/actions';
import { spreadsheetReducer } from './reducers/spreadsheetReducer';
import { useUndoRedo } from './hooks/useUndoRedo';
import { PersistenceManager, PersistenceMode } from './persistence/PersistenceManager';
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
  syncStatus: SyncStatus;
  persistenceMode: PersistenceMode;
}

export interface PersistedTableProps extends TableProps {
  spreadsheetId?: string;
  persistenceMode?: PersistenceMode;
  autoSave?: boolean;
  autoSaveInterval?: number;
  apiConfig?: {
    baseUrl: string;
    wsUrl: string;
    apiKey?: string;
    userId: string;
  };
  onSyncStatusChange?: (status: SyncStatus) => void;
  onSaveComplete?: (result: SaveResult) => void;
  onLoadComplete?: (success: boolean) => void;
}

export const SpreadsheetContext = createContext<SpreadsheetContextValue | null>(null);

// Enhanced reducer with persistence support
const enhancedReducer = (state: SpreadsheetState, action: SpreadsheetAction): SpreadsheetState => {
  // Log actions in development
  if (process.env.NODE_ENV === 'development') {
    console.log('Spreadsheet Action:', action.type, action);
  }

  // Handle special restore state action
  if ((action as any).type === 'RESTORE_STATE') {
    return (action as any).payload;
  }

  // Handle load from persistence
  if ((action as any).type === 'LOAD_STATE') {
    const loadedState = (action as any).payload as SpreadsheetState;
    return {
      ...state,
      data: loadedState.data,
      rowHeights: loadedState.rowHeights || state.rowHeights,
      colWidths: loadedState.colWidths || state.colWidths,
      validation: loadedState.validation || state.validation,
    };
  }

  return spreadsheetReducer(state, action);
};

export const SpreadsheetProviderPersisted: React.FC<React.PropsWithChildren<PersistedTableProps>> = ({
  spreadsheetId = 'default',
  persistenceMode = 'local',
  autoSave = true,
  autoSaveInterval = 5000,
  apiConfig,
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
    rowHeights: Array(maxRows).fill(28),
    colWidths: Array(maxCols).fill(100),
    validation: new Map(),
  }), [initialData, maxRows, maxCols, readOnly]);

  const [state, dispatch] = useReducer(enhancedReducer, initialState);
  
  // Sync status
  const [syncStatus, setSyncStatus] = React.useState<SyncStatus>({
    connected: true,
    syncing: false,
    pendingChanges: 0,
    mode: persistenceMode === 'api' ? 'cloud' : persistenceMode === 'hybrid' ? 'hybrid' : 'local',
  });

  // Persistence manager
  const persistenceManager = useRef<PersistenceManager | null>(null);
  const autoSaveTimer = useRef<NodeJS.Timeout | null>(null);
  const hasUnsavedChanges = useRef(false);
  const lastSavedState = useRef<string>('');

  // Initialize persistence manager
  useEffect(() => {
    persistenceManager.current = new PersistenceManager({
      mode: persistenceMode,
      spreadsheetId,
      autoSave: false, // We'll handle auto-save ourselves
      apiConfig,
      onSyncStatusChange: (status) => {
        setSyncStatus(status);
        onSyncStatusChange?.(status);
      },
      onSaveComplete,
    });

    // Load initial data
    loadData();

    return () => {
      persistenceManager.current?.destroy();
    };
  }, [spreadsheetId, persistenceMode]);

  // Undo/Redo support
  const { undo, redo, canUndo, canRedo } = useUndoRedo(state, dispatch);

  // Load data from persistence
  const loadData = async () => {
    if (!persistenceManager.current) return;

    try {
      setSyncStatus(prev => ({ ...prev, syncing: true }));
      const loadedState = await persistenceManager.current.load();
      
      if (loadedState) {
        dispatch({ type: 'LOAD_STATE' as any, payload: loadedState });
        lastSavedState.current = JSON.stringify(loadedState.data);
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
      const result = await persistenceManager.current.save(state);
      
      if (result.success) {
        lastSavedState.current = JSON.stringify(state.data);
        hasUnsavedChanges.current = false;
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

  // Auto-save functionality
  useEffect(() => {
    if (!autoSave) return;

    // Check if state has changed
    const currentStateStr = JSON.stringify(state.data);
    if (currentStateStr !== lastSavedState.current) {
      hasUnsavedChanges.current = true;
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
  }, [state.data, state.editing, autoSave, autoSaveInterval]);

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
      await persistenceManager.current.saveVersion(state, label);
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
        dispatch({ type: 'LOAD_STATE' as any, payload: versionState });
      }
    } catch (error) {
      console.error('Failed to load version:', error);
    } finally {
      setSyncStatus(prev => ({ ...prev, syncing: false }));
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
    syncStatus,
    persistenceMode,
  }), [state, dispatch, getCell, setCell, undo, redo, canUndo, canRedo, syncStatus, persistenceMode]);

  return (
    <SpreadsheetContext.Provider value={contextValue}>
      {children}
    </SpreadsheetContext.Provider>
  );
};

export const useSpreadsheetPersisted = () => {
  const ctx = useContext(SpreadsheetContext);
  if (!ctx) throw new Error('useSpreadsheetPersisted must be used within SpreadsheetProviderPersisted');
  return ctx;
};