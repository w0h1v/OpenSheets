import { useRef, useCallback, useEffect } from 'react';
import { SpreadsheetState } from '../types/spreadsheet';
import { SpreadsheetAction } from '../types/actions';
import { isRemoteApplying } from '../utils/editContext';

interface UndoRedoState {
  past: SpreadsheetState[];
  present: SpreadsheetState;
  future: SpreadsheetState[];
}

// JSON.stringify renders a Map as "{}", which would make any two states
// with Maps look identical; serialize Maps as entry arrays instead
const serializeState = (s: SpreadsheetState): string =>
  JSON.stringify(s, (_k, v) => (v instanceof Map ? Array.from(v.entries()) : v));

// Undo/redo tracks DOCUMENT content only. Selection, editing and the
// formula-input buffer are ephemeral UI state: recording them would make
// every click an undo step and bury real edits.
const serializeDocument = (s: SpreadsheetState): string =>
  serializeState(({
    data: s.data,
    merges: s.merges,
    filters: s.filters,
    comments: s.comments,
    frozenRows: s.frozenRows,
    frozenCols: s.frozenCols,
    rowHeights: s.rowHeights,
    colWidths: s.colWidths,
    maxRows: s.maxRows,
    maxCols: s.maxCols,
    validation: s.validation,
  }) as unknown as SpreadsheetState);

export function useUndoRedo(
  state: SpreadsheetState,
  dispatch: React.Dispatch<SpreadsheetAction>,
  maxHistorySize: number = 50
) {
  const history = useRef<UndoRedoState>({
    past: [],
    present: state,
    future: [],
  });
  const restoring = useRef(false);

  const canUndo = history.current.past.length > 0;
  const canRedo = history.current.future.length > 0;

  const saveState = useCallback((newState: SpreadsheetState) => {
    const { past, present } = history.current;

    // Only document changes create undo steps; UI-state-only changes just
    // advance the present pointer without touching the history stacks
    if (serializeDocument(present) === serializeDocument(newState)) {
      history.current = { ...history.current, present: newState };
      return;
    }

    // Add current state to past
    const newPast = [...past, present];
    
    // Limit history size
    if (newPast.length > maxHistorySize) {
      newPast.shift();
    }

    history.current = {
      past: newPast,
      present: newState,
      future: [], // Clear future on new action
    };
  }, [maxHistorySize]);

  const undo = useCallback(() => {
    const { past, present, future } = history.current;

    if (past.length === 0) return;

    const previous = past[past.length - 1];
    const newPast = past.slice(0, past.length - 1);

    history.current = {
      past: newPast,
      present: previous,
      future: [present, ...future],
    };

    // Update the actual state
    return previous;
  }, []);

  const redo = useCallback(() => {
    const { past, present, future } = history.current;
    
    if (future.length === 0) return;

    const next = future[0];
    const newFuture = future.slice(1);

    history.current = {
      past: [...past, present],
      present: next,
      future: newFuture,
    };

    // Return the new state
    return next;
  }, []);

  const reset = useCallback(() => {
    history.current = {
      past: [],
      present: state,
      future: [],
    };
  }, [state]);

  // Update present state when state changes. States produced by undo/redo
  // themselves just move the history cursor; they must not be recorded as
  // new history entries.
  useEffect(() => {
    if (history.current.present === state) return;
    if (restoring.current || isRemoteApplying()) {
      restoring.current = false;
      history.current.present = state;
      return;
    }
    saveState(state);
  }, [state, saveState]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        const previousState = undo();
        if (previousState) {
          // Dispatch a special action to restore state
          restoring.current = true;
          dispatch({ type: 'RESTORE_STATE', payload: previousState });
        }
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        const nextState = redo();
        if (nextState) {
          // Dispatch a special action to restore state
          restoring.current = true;
          dispatch({ type: 'RESTORE_STATE', payload: nextState });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, dispatch]);

  return {
    undo,
    redo,
    canUndo,
    canRedo,
    saveState,
    reset,
  };
}