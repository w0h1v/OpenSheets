import { useCallback } from 'react';
import type React from 'react';
import { useSpreadsheetBase } from '../SpreadsheetContext';
import { serializeTabular, parseTabular } from '../utils/clipboardUtils';
import { normalizeRect } from '../utils/selectionUtils';

// Native and React clipboard events share this shape, as does the event
// the Ctrl/Cmd+C/X keydown path synthesizes
interface ClipboardLikeEvent {
  clipboardData: DataTransfer | null;
  preventDefault: () => void;
}

/*
 * Copy, cut and paste for the current selection. The handlers are attached
 * to the grid's focusable container rather than document, so clipboard
 * events only reach the grid that has focus.
 */
export const useClipboard = () => {
  const { state, getCell, setCell } = useSpreadsheetBase();
  const { selection, readOnly, maxRows, maxCols } = state;

  const handleCopy = useCallback((e: ClipboardLikeEvent) => {
    if (!selection.ranges.length) return;

    const rect = normalizeRect(selection.ranges[0]);
    const rows: string[][] = [];

    for (let r = rect.startRow; r <= rect.endRow; r++) {
      const cols: string[] = [];
      for (let c = rect.startCol; c <= rect.endCol; c++) {
        const cell = getCell(r, c);
        cols.push(cell?.value?.toString() ?? '');
      }
      rows.push(cols);
    }

    e.clipboardData?.setData('text/plain', serializeTabular(rows));
    e.preventDefault();
  }, [selection, getCell]);

  const handlePaste = useCallback((e: ClipboardLikeEvent) => {
    if (readOnly) return;

    const text = e.clipboardData?.getData('text/plain');
    if (!text) return;

    const data = parseTabular(text);
    const start = selection.active;
    if (!start) return;

    e.preventDefault();

    data.forEach((row, i) => {
      row.forEach((val, j) => {
        const targetRow = start.row + i;
        const targetCol = start.col + j;
        if (targetRow < maxRows && targetCol < maxCols) {
          setCell(targetRow, targetCol, { value: val });
        }
      });
    });
  }, [readOnly, selection.active, maxRows, maxCols, setCell]);

  const handleCut = useCallback((e: ClipboardLikeEvent) => {
    if (readOnly) return;

    // First copy
    handleCopy(e);

    // Then clear the selection
    if (!selection.ranges.length) return;
    const rect = normalizeRect(selection.ranges[0]);

    for (let r = rect.startRow; r <= rect.endRow; r++) {
      for (let c = rect.startCol; c <= rect.endCol; c++) {
        setCell(r, c, { value: '', formula: undefined });
      }
    }
  }, [readOnly, handleCopy, selection.ranges, setCell]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    if (e.key === 'c') {
      handleCopy(new ClipboardEvent('copy', { clipboardData: new DataTransfer() }));
    } else if (e.key === 'x') {
      handleCut(new ClipboardEvent('cut', { clipboardData: new DataTransfer() }));
    }
    // Ctrl/Cmd+V is handled by the paste event
  }, [handleCopy, handleCut]);

  return { handleCopy, handlePaste, handleCut, handleKeyDown };
};
