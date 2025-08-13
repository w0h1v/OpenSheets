import { useEffect } from 'react';
import { useSpreadsheet } from '../SpreadsheetContext';
import { serializeTabular, parseTabular } from '../utils/clipboardUtils';
import { normalizeRect } from '../utils/selectionUtils';

export const useClipboard = () => {
  const { state, getCell, setCell } = useSpreadsheet();

  useEffect(() => {
    const handleCopy = async (e: ClipboardEvent) => {
      if (!state.selection.ranges.length) return;
      
      const rect = normalizeRect(state.selection.ranges[0]);
      const rows: string[][] = [];
      
      for (let r = rect.startRow; r <= rect.endRow; r++) {
        const cols: string[] = [];
        for (let c = rect.startCol; c <= rect.endCol; c++) {
          const cell = getCell(r, c);
          cols.push(cell?.value?.toString() ?? '');
        }
        rows.push(cols);
      }
      
      const text = serializeTabular(rows);
      e.clipboardData?.setData('text/plain', text);
      e.preventDefault();
    };

    const handlePaste = async (e: ClipboardEvent) => {
      if (state.readOnly) return;
      
      const text = e.clipboardData?.getData('text/plain');
      if (!text) return;
      
      const data = parseTabular(text);
      const start = state.selection.active;
      if (!start) return;
      
      e.preventDefault();
      
      data.forEach((row, i) => {
        row.forEach((val, j) => {
          const targetRow = start.row + i;
          const targetCol = start.col + j;
          if (targetRow < state.maxRows && targetCol < state.maxCols) {
            setCell(targetRow, targetCol, { value: val });
          }
        });
      });
    };

    const handleCut = async (e: ClipboardEvent) => {
      if (state.readOnly) return;
      
      // First copy
      await handleCopy(e);
      
      // Then clear the selection
      if (!state.selection.ranges.length) return;
      const rect = normalizeRect(state.selection.ranges[0]);
      
      for (let r = rect.startRow; r <= rect.endRow; r++) {
        for (let c = rect.startCol; c <= rect.endCol; c++) {
          setCell(r, c, { value: '', formula: undefined });
        }
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        const event = new ClipboardEvent('copy', { 
          clipboardData: new DataTransfer() 
        });
        handleCopy(event);
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        // Paste will be handled by the paste event
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'x') {
        const event = new ClipboardEvent('cut', { 
          clipboardData: new DataTransfer() 
        });
        handleCut(event);
      }
    };

    document.addEventListener('copy', handleCopy);
    document.addEventListener('paste', handlePaste);
    document.addEventListener('cut', handleCut);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('paste', handlePaste);
      document.removeEventListener('cut', handleCut);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [state.selection, state.readOnly, state.maxRows, state.maxCols, getCell, setCell]);
};