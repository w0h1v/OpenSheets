/*
 * Tiny pub/sub store connecting the formula bar (which parses refs while
 * editing) to the grid (which outlines the referenced cells). Each
 * SpreadsheetProvider creates its own store and hands it out through
 * SpreadsheetUiContext, so highlights never leak between spreadsheets.
 */

export interface FormulaHighlight {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
  color: string;
}

export const HIGHLIGHT_PALETTE = ['#16a34a', '#2563eb', '#9333ea', '#ea580c', '#0d9488'];

export interface FormulaHighlightStore {
  get: () => FormulaHighlight[];
  set: (next: FormulaHighlight[]) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createFormulaHighlightStore(): FormulaHighlightStore {
  let highlights: FormulaHighlight[] = [];
  const listeners = new Set<() => void>();

  return {
    get: () => highlights,
    set: (next) => {
      highlights = next;
      listeners.forEach((l) => l());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
