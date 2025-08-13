import { useRef, useCallback, useEffect } from 'react';
import { SpreadsheetState } from '../types/spreadsheet';
import { SpreadsheetAction } from '../types/actions';

interface UndoRedoState {
  past: SpreadsheetState[];
  present: SpreadsheetState;
  future: SpreadsheetState[];
}

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

  const canUndo = history.current.past.length > 0;
  const canRedo = history.current.future.length > 0;

  const saveState = useCallback((newState: SpreadsheetState) => {
    const { past, present } = history.current;
    
    // Don't save if state hasn't changed
    if (JSON.stringify(present) === JSON.stringify(newState)) {
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

  // Update present state when state changes
  useEffect(() => {
    if (history.current.present !== state) {
      saveState(state);
    }
  }, [state, saveState]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        const previousState = undo();
        if (previousState) {
          // Dispatch a special action to restore state
          dispatch({ type: 'RESTORE_STATE' as any, payload: previousState });
        }
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        const nextState = redo();
        if (nextState) {
          // Dispatch a special action to restore state
          dispatch({ type: 'RESTORE_STATE' as any, payload: nextState });
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