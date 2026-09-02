/*
 * Which column's filter panel is open. The toolbar button and the filtered
 * column-header badges both publish here; the grid subscribes and owns the
 * panel (it has the data and dispatch access). Each SpreadsheetProvider
 * creates its own store and hands it out through SpreadsheetUiContext, so
 * two spreadsheets on one page never share a panel.
 */

export interface FilterPanelStore {
  get: () => number | null;
  set: (col: number | null) => void;
  subscribe: (listener: () => void) => () => void;
}

export function createFilterPanelStore(): FilterPanelStore {
  let openColumn: number | null = null;
  const listeners = new Set<() => void>();

  return {
    get: () => openColumn,
    set: (col) => {
      openColumn = col;
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
