import { useEffect } from 'react';
import { useSpreadsheet } from '../SpreadsheetContext';
import { singleCellSelection } from '../utils/selectionUtils';

export const useKeyboardShortcuts = () => {
  const { state, setState } = useSpreadsheet();
  const active = state.selection.active;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!active) return;
      
      // Don't handle navigation if we're editing
      if (state.editing) return;

      let handled = false;
      let newRow = active.row;
      let newCol = active.col;

      switch(e.key) {
        case 'ArrowUp':
          newRow = Math.max(0, active.row - 1);
          handled = true;
          break;
        case 'ArrowDown':
          newRow = Math.min(state.maxRows - 1, active.row + 1);
          handled = true;
          break;
        case 'ArrowLeft':
          newCol = Math.max(0, active.col - 1);
          handled = true;
          break;
        case 'ArrowRight':
          newCol = Math.min(state.maxCols - 1, active.col + 1);
          handled = true;
          break;
        case 'Tab':
          if (e.shiftKey) {
            newCol = Math.max(0, active.col - 1);
          } else {
            newCol = Math.min(state.maxCols - 1, active.col + 1);
          }
          handled = true;
          break;
        case 'Enter':
          if (e.shiftKey) {
            newRow = Math.max(0, active.row - 1);
          } else {
            newRow = Math.min(state.maxRows - 1, active.row + 1);
          }
          handled = true;
          break;
        case 'Delete':
        case 'Backspace':
          if (!state.editing && !state.readOnly) {
            // Clear cell content
            const { setCell } = useSpreadsheet();
            setCell(active.row, active.col, { value: '', formula: undefined });
            handled = true;
          }
          break;
      }

      if (handled) {
        e.preventDefault();
        setState((prev) => ({
          ...prev,
          selection: singleCellSelection(newRow, newCol),
        }));
      }

      // Start editing on any printable character
      if (!state.editing && !state.readOnly && e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        setState((prev) => ({
          ...prev,
          editing: { row: active.row, col: active.col },
          formulaInput: e.key,
        }));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [active, state.editing, state.readOnly, state.maxRows, state.maxCols, setState]);
};