/*
 * Tiny pub/sub store connecting the formula bar (which parses refs while
 * editing) to the grid (which outlines the referenced cells). Kept as a
 * module-level store so components share it without provider plumbing.
 */

export interface FormulaHighlight {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
  color: string;
}

export const HIGHLIGHT_PALETTE = ['#16a34a', '#2563eb', '#9333ea', '#ea580c', '#0d9488'];

let highlights: FormulaHighlight[] = [];
const listeners = new Set<() => void>();

export function setFormulaHighlights(next: FormulaHighlight[]) {
  highlights = next;
  listeners.forEach((l) => l());
}

export function subscribeFormulaHighlights(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getFormulaHighlights() {
  return highlights;
}
