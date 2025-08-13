import { useEffect, useRef, useCallback } from 'react';
import { SpreadsheetAction } from '../types/actions';
import { SelectionRect, SpreadsheetState } from '../types/spreadsheet';
import { normalizeRect } from '../utils/selectionUtils';

export function useMultiSelection(
  state: SpreadsheetState,
  dispatch: React.Dispatch<SpreadsheetAction>
) {
  const isSelecting = useRef(false);
  const selectionStart = useRef<{ row: number; col: number } | null>(null);
  const shiftPressed = useRef(false);
  const ctrlPressed = useRef(false);

  const startSelection = useCallback((row: number, col: number, multi: boolean = false) => {
    if (multi && state.selection.ranges.length > 0) {
      // Add to existing selection
      dispatch({
        type: 'ADD_SELECTION_RANGE',
        payload: { startRow: row, startCol: col, endRow: row, endCol: col },
      });
    } else {
      // Start new selection
      dispatch({
        type: 'SET_SELECTION',
        payload: {
          ranges: [{ startRow: row, startCol: col, endRow: row, endCol: col }],
          active: { row, col },
        },
      });
    }
    selectionStart.current = { row, col };
    isSelecting.current = true;
  }, [state.selection.ranges, dispatch]);

  const updateSelection = useCallback((row: number, col: number) => {
    if (!isSelecting.current || !selectionStart.current) return;

    const lastRangeIndex = state.selection.ranges.length - 1;
    const newRange: SelectionRect = {
      startRow: selectionStart.current.row,
      startCol: selectionStart.current.col,
      endRow: row,
      endCol: col,
    };

    // Update the last range in the selection
    const newRanges = [...state.selection.ranges];
    newRanges[lastRangeIndex] = newRange;

    dispatch({
      type: 'SET_SELECTION',
      payload: {
        ranges: newRanges,
        active: { row, col },
      },
    });
  }, [state.selection.ranges, dispatch]);

  const endSelection = useCallback(() => {
    isSelecting.current = false;
    selectionStart.current = null;
  }, []);

  const handleKeyboardSelection = useCallback((e: KeyboardEvent) => {
    const active = state.selection.active;
    if (!active) return;

    let newRow = active.row;
    let newCol = active.col;
    let handled = false;

    // Check for arrow keys
    switch (e.key) {
      case 'ArrowUp':
        if (newRow > 0) {
          newRow--;
          handled = true;
        }
        break;
      case 'ArrowDown':
        if (newRow < state.maxRows - 1) {
          newRow++;
          handled = true;
        }
        break;
      case 'ArrowLeft':
        if (newCol > 0) {
          newCol--;
          handled = true;
        }
        break;
      case 'ArrowRight':
        if (newCol < state.maxCols - 1) {
          newCol++;
          handled = true;
        }
        break;
    }

    if (!handled) return;

    e.preventDefault();

    if (e.shiftKey) {
      // Extend selection
      if (state.selection.ranges.length === 0) {
        // Start new selection from active cell
        dispatch({
          type: 'SET_SELECTION',
          payload: {
            ranges: [{
              startRow: active.row,
              startCol: active.col,
              endRow: newRow,
              endCol: newCol,
            }],
            active: { row: newRow, col: newCol },
          },
        });
      } else {
        // Extend existing selection
        const lastRange = state.selection.ranges[state.selection.ranges.length - 1];
        const newRanges = [...state.selection.ranges];
        
        // Keep the original start point, update the end point
        if (selectionStart.current) {
          newRanges[newRanges.length - 1] = {
            startRow: selectionStart.current.row,
            startCol: selectionStart.current.col,
            endRow: newRow,
            endCol: newCol,
          };
        } else {
          // If no selection start, use the first corner of the last range
          newRanges[newRanges.length - 1] = {
            ...lastRange,
            endRow: newRow,
            endCol: newCol,
          };
        }

        dispatch({
          type: 'SET_SELECTION',
          payload: {
            ranges: newRanges,
            active: { row: newRow, col: newCol },
          },
        });
      }
    } else if (e.ctrlKey || e.metaKey) {
      // Ctrl+Arrow: Jump to edge of data
      let jumpRow = newRow;
      let jumpCol = newCol;

      switch (e.key) {
        case 'ArrowUp':
          // Find first non-empty cell above or top edge
          while (jumpRow > 0 && !state.data.get(`${jumpRow}:${newCol}`)) {
            jumpRow--;
          }
          break;
        case 'ArrowDown':
          // Find first non-empty cell below or bottom edge
          while (jumpRow < state.maxRows - 1 && !state.data.get(`${jumpRow}:${newCol}`)) {
            jumpRow++;
          }
          break;
        case 'ArrowLeft':
          // Find first non-empty cell to the left or left edge
          while (jumpCol > 0 && !state.data.get(`${newRow}:${jumpCol}`)) {
            jumpCol--;
          }
          break;
        case 'ArrowRight':
          // Find first non-empty cell to the right or right edge
          while (jumpCol < state.maxCols - 1 && !state.data.get(`${newRow}:${jumpCol}`)) {
            jumpCol++;
          }
          break;
      }

      dispatch({
        type: 'SET_SELECTION',
        payload: {
          ranges: [{ startRow: jumpRow, startCol: jumpCol, endRow: jumpRow, endCol: jumpCol }],
          active: { row: jumpRow, col: jumpCol },
        },
      });
    } else {
      // Normal movement - single cell selection
      dispatch({
        type: 'SET_SELECTION',
        payload: {
          ranges: [{ startRow: newRow, startCol: newCol, endRow: newRow, endCol: newCol }],
          active: { row: newRow, col: newCol },
        },
      });
      selectionStart.current = { row: newRow, col: newCol };
    }
  }, [state, dispatch]);

  const selectAll = useCallback(() => {
    // Find the bounds of actual data
    let minRow = state.maxRows, maxRow = 0;
    let minCol = state.maxCols, maxCol = 0;
    let hasData = false;

    state.data.forEach((_, key) => {
      const [row, col] = key.split(':').map(Number);
      minRow = Math.min(minRow, row);
      maxRow = Math.max(maxRow, row);
      minCol = Math.min(minCol, col);
      maxCol = Math.max(maxCol, col);
      hasData = true;
    });

    if (!hasData) {
      // Select a reasonable default area if no data
      maxRow = Math.min(20, state.maxRows - 1);
      maxCol = Math.min(10, state.maxCols - 1);
      minRow = 0;
      minCol = 0;
    }

    dispatch({
      type: 'SET_SELECTION',
      payload: {
        ranges: [{ startRow: minRow, startCol: minCol, endRow: maxRow, endCol: maxCol }],
        active: { row: minRow, col: minCol },
      },
    });
  }, [state.data, state.maxRows, state.maxCols, dispatch]);

  // Track Shift and Ctrl key states
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') shiftPressed.current = true;
      if (e.key === 'Control' || e.key === 'Meta') ctrlPressed.current = true;
      
      // Ctrl+A or Cmd+A to select all
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        selectAll();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') shiftPressed.current = false;
      if (e.key === 'Control' || e.key === 'Meta') ctrlPressed.current = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [selectAll]);

  // Set up keyboard selection handler
  useEffect(() => {
    window.addEventListener('keydown', handleKeyboardSelection);
    return () => window.removeEventListener('keydown', handleKeyboardSelection);
  }, [handleKeyboardSelection]);

  return {
    startSelection,
    updateSelection,
    endSelection,
    isShiftPressed: () => shiftPressed.current,
    isCtrlPressed: () => ctrlPressed.current,
    selectAll,
  };
}