/*
 * Which column's filter panel is open. The toolbar button and the filtered
 * column-header badges both publish here; the grid subscribes and owns the
 * panel (it has the data and dispatch access).
 */

let openColumn: number | null = null;
const listeners = new Set<() => void>();

export function setFilterPanelColumn(col: number | null) {
  openColumn = col;
  listeners.forEach((l) => l());
}

export function getFilterPanelColumn() {
  return openColumn;
}

export function subscribeFilterPanel(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
