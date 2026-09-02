import React, { createContext, useContext, useReducer, useCallback, useMemo, useEffect } from 'react';
import { TableProps, SpreadsheetState, CellData, keyOf } from './types/spreadsheet';
import { SpreadsheetAction } from './types/actions';
import { spreadsheetReducer } from './reducers/spreadsheetReducer';
import { useUndoRedo } from './hooks/useUndoRedo';
import { SpreadsheetContextInstance } from './SpreadsheetContext';

interface SpreadsheetContextValue {
  state: SpreadsheetState;
  dispatch: React.Dispatch<SpreadsheetAction>;
  getCell: (r: number, c: number) => CellData | undefined;
  setCell: (r: number, c: number, data: Partial<CellData>) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const SpreadsheetContext = createContext<SpreadsheetContextValue | null>(null);
// Exported so components that try the persisted context first can read this
// one unconditionally (calling hooks conditionally violates the rules of hooks)
export const SpreadsheetEnhancedContext = SpreadsheetContext;

// Create enhanced reducer with middleware support
const enhancedReducer = (state: SpreadsheetState, action: SpreadsheetAction): SpreadsheetState => {
  if (action.type === 'RESTORE_STATE') return action.payload;

  // Apply a React-style setState updater against the accumulated state so
  // functional updates composed with other actions in the same batch are
  // not lost.
  if (action.type === 'APPLY_SET_STATE') {
    const updater = action.payload;
    return typeof updater === 'function' ? updater(state) : updater;
  }

  return spreadsheetReducer(state, action);
};

export const SpreadsheetProviderEnhanced: React.FC<React.PropsWithChildren<TableProps>> = ({
  initialData,
  maxRows = 1000,
  maxCols = 100,
  readOnly = false,
  onCellChange,
  onSelectionChange,
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

  // Bridge state for components that consume the base SpreadsheetContext
  // (CellRenderer, SelectionOverlay, etc.) so both context flavors work in
  // the same tree. The updater is applied inside the reducer so it sees the
  // accumulated state, including actions dispatched earlier in the same batch.
  const bridgedSetState = useCallback((action: React.SetStateAction<SpreadsheetState>) => {
    dispatch({ type: 'APPLY_SET_STATE', payload: action } as unknown as SpreadsheetAction);
  }, []);

  // Undo/Redo support
  const { undo, redo, canUndo, canRedo } = useUndoRedo(state, dispatch);

  // Memoized getCell function
  const getCell = useCallback((r: number, c: number) => {
    return state.data.get(keyOf(r, c));
  }, [state.data]);

  // Memoized setCell function that dispatches action
  const setCell = useCallback((r: number, c: number, data: Partial<CellData>) => {
    dispatch({ type: 'SET_CELL', payload: { row: r, col: c, data } });
  }, [dispatch]);

  // Call onCellChange callback when cells change
  useEffect(() => {
    if (onCellChange && state.editing === null) {
      // Get the last modified cell (simplified approach)
      // In production, track which cell was modified
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

  const contextValue = useMemo(() => ({
    state,
    dispatch,
    getCell,
    setCell,
    undo,
    redo,
    canUndo,
    canRedo,
  }), [state, dispatch, getCell, setCell, undo, redo, canUndo, canRedo]);

  const bridgeValue = useMemo(() => ({
    state,
    setState: bridgedSetState,
    getCell,
    setCell,
  }), [state, bridgedSetState, getCell, setCell]);

  return (
    <SpreadsheetContext.Provider value={contextValue}>
      <SpreadsheetContextInstance.Provider value={bridgeValue}>
        {children}
      </SpreadsheetContextInstance.Provider>
    </SpreadsheetContext.Provider>
  );
};

export const useSpreadsheetEnhanced = () => {
  const ctx = useContext(SpreadsheetContext);
  if (!ctx) throw new Error('useSpreadsheetEnhanced must be used within SpreadsheetProviderEnhanced');
  return ctx;
};