import React, { createContext, useContext, useReducer, useCallback, useMemo, useEffect } from 'react';
import { TableProps, SpreadsheetState, CellData, keyOf } from './types/spreadsheet';
import { SpreadsheetAction } from './types/actions';
import { spreadsheetReducer } from './reducers/spreadsheetReducer';
import { useUndoRedo } from './hooks/useUndoRedo';

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

// Create enhanced reducer with middleware support
const enhancedReducer = (state: SpreadsheetState, action: SpreadsheetAction): SpreadsheetState => {
  // Log actions in development
  if (process.env.NODE_ENV === 'development') {
    console.log('Spreadsheet Action:', action.type, action);
  }

  // Handle special restore state action for undo/redo
  if ((action as any).type === 'RESTORE_STATE') {
    return (action as any).payload;
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
    rowHeights: Array(maxRows).fill(28),
    colWidths: Array(maxCols).fill(100),
    validation: new Map(),
  }), [initialData, maxRows, maxCols, readOnly]);

  const [state, dispatch] = useReducer(enhancedReducer, initialState);

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

  // Save state to localStorage for persistence
  useEffect(() => {
    const saveTimer = setTimeout(() => {
      try {
        // Save column widths and row heights
        localStorage.setItem('spreadsheet-col-widths', JSON.stringify(state.colWidths));
        localStorage.setItem('spreadsheet-row-heights', JSON.stringify(state.rowHeights));
        
        // Optionally save data (be careful with size)
        if (state.data.size < 1000) {
          const dataArray = Array.from(state.data.entries());
          localStorage.setItem('spreadsheet-data', JSON.stringify(dataArray));
        }
      } catch (e) {
        console.warn('Failed to save spreadsheet state:', e);
      }
    }, 1000);

    return () => clearTimeout(saveTimer);
  }, [state.colWidths, state.rowHeights, state.data]);

  // Load persisted state on mount
  useEffect(() => {
    try {
      const savedColWidths = localStorage.getItem('spreadsheet-col-widths');
      const savedRowHeights = localStorage.getItem('spreadsheet-row-heights');
      
      if (savedColWidths || savedRowHeights) {
        dispatch({
          type: 'BATCH',
          payload: [
            ...(savedColWidths ? [{ 
              type: 'SET_COLUMN_WIDTHS' as any, 
              payload: JSON.parse(savedColWidths) 
            }] : []),
            ...(savedRowHeights ? [{ 
              type: 'SET_ROW_HEIGHTS' as any, 
              payload: JSON.parse(savedRowHeights) 
            }] : []),
          ],
        });
      }
    } catch (e) {
      console.warn('Failed to load spreadsheet state:', e);
    }
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
  }), [state, dispatch, getCell, setCell, undo, redo, canUndo, canRedo]);

  return (
    <SpreadsheetContext.Provider value={contextValue}>
      {children}
    </SpreadsheetContext.Provider>
  );
};

export const useSpreadsheetEnhanced = () => {
  const ctx = useContext(SpreadsheetContext);
  if (!ctx) throw new Error('useSpreadsheetEnhanced must be used within SpreadsheetProviderEnhanced');
  return ctx;
};