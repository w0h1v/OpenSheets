import { useRef, useCallback, useEffect } from 'react';
import type React from 'react';
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

  // The latest state, read by restores so they keep the live UI state
  const latest = useRef(state);
  latest.current = state;

  // Snapshots carry whatever selection/editing state was live when they
  // were taken; a restore keeps the current UI state so undo never
  // re-opens an editor or jumps the selection
  const withLiveUi = useCallback((snapshot: SpreadsheetState): SpreadsheetState => {
    const { selection, editing, formulaInput } = latest.current;
    return { ...snapshot, selection, editing, formulaInput };
  }, []);

  // Undo and redo move the history cursor and restore the state it now
  // points at. RESTORE_STATE installs that exact object, so the effect
  // below sees present === state and records nothing for it.
  const undo = useCallback(() => {
    const { past, present, future } = history.current;

    if (past.length === 0) return;

    const restored = withLiveUi(past[past.length - 1]);

    history.current = {
      past: past.slice(0, past.length - 1),
      present: restored,
      future: [present, ...future],
    };

    dispatch({ type: 'RESTORE_STATE', payload: restored });
  }, [withLiveUi, dispatch]);

  const redo = useCallback(() => {
    const { past, present, future } = history.current;

    if (future.length === 0) return;

    const restored = withLiveUi(future[0]);

    history.current = {
      past: [...past, present],
      present: restored,
      future: future.slice(1),
    };

    dispatch({ type: 'RESTORE_STATE', payload: restored });
  }, [withLiveUi, dispatch]);

  const reset = useCallback(() => {
    history.current = {
      past: [],
      present: state,
      future: [],
    };
  }, [state]);

  // Record document changes as they happen. Remote-applied edits
  // (collaboration) advance the cursor without creating history.
  useEffect(() => {
    if (history.current.present === state) return;
    if (isRemoteApplying()) {
      history.current.present = state;
      return;
    }
    saveState(state);
  }, [state, saveState]);

  // Ctrl/Cmd+Z undoes; Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y redoes. The grid
  // attaches this to its focusable container so it fires per grid.
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    // Shift+Z reports an uppercase key
    const key = e.key.toLowerCase();
    if (key === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
    } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
      e.preventDefault();
      redo();
    }
  }, [undo, redo]);

  return {
    undo,
    redo,
    canUndo,
    canRedo,
    saveState,
    reset,
    handleKeyDown,
  };
}
