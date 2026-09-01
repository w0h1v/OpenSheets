/*
 * Registry of every mounted sheet's data, keyed by sheet name, enabling
 * cross-sheet formula references like =Sheet1!A1 + Sheet2!B2. Each provider
 * registers its current data; formula evaluation consults the registry when
 * a reference carries a SheetName! prefix.
 */

import { CellData } from '../types/spreadsheet';

const sheets = new Map<string, Map<string, CellData>>();

// Bumped whenever any registered sheet's data changes, so formulas with
// cross-sheet refs re-evaluate live while their source sheet is edited
let version = 0;
const versionListeners = new Set<() => void>();

export function registerSheetData(name: string, data: Map<string, CellData>) {
  const prev = sheets.get(name);
  if (prev !== data) {
    sheets.set(name, data);
    version++;
    versionListeners.forEach((l) => l());
  }
}

export function subscribeRegistryVersion(listener: () => void) {
  versionListeners.add(listener);
  return () => versionListeners.delete(listener);
}

export function getRegistryVersion() {
  return version;
}

/**
 * Sheets unmount when switched away from (the demo remounts per sheet), but
 * cross-sheet formulas on other sheets still need this sheet's last-known
 * data — so unregister is a no-op; the entry refreshes on next mount.
 */
export function unregisterSheetData(_name: string) {
  void _name;
}

export function getSheetData(name: string): Map<string, CellData> | undefined {
  return sheets.get(name);
}
