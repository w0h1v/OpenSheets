import { createContext, useContext } from 'react';
import type React from 'react';
import { SpreadsheetState, CellData } from './types/spreadsheet';
import { SpreadsheetAction } from './types/actions';
import type { SyncStatus, SaveResult, Version } from './persistence/types';

/** What useSpreadsheet() returns: the document, its history and its persistence. */
export interface SpreadsheetContextValue {
  state: SpreadsheetState;
  dispatch: React.Dispatch<SpreadsheetAction>;
  getCell: (r: number, c: number) => CellData | undefined;
  setCell: (r: number, c: number, data: Partial<CellData>) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  save: () => Promise<SaveResult>;
  load: () => Promise<void>;
  saveVersion: (label?: string) => Promise<void>;
  loadVersion: (versionId: string) => Promise<void>;
  listVersions: () => Promise<Version[]>;
  syncStatus: SyncStatus;
  dirty: boolean;
  /** False when the provider was created with persistence="none". */
  persisted: boolean;
}

export const SpreadsheetContext = createContext<SpreadsheetContextValue | null>(null);

export const useSpreadsheet = (): SpreadsheetContextValue => {
  const ctx = useContext(SpreadsheetContext);
  if (!ctx) throw new Error('useSpreadsheet must be used inside a SpreadsheetProvider');
  return ctx;
};

/*
 * The base view: a setState-style handle on the same state that the grid
 * internals (cell renderer, keyboard and clipboard hooks) work against.
 */
export interface SpreadsheetBaseValue {
  state: SpreadsheetState;
  setState: React.Dispatch<React.SetStateAction<SpreadsheetState>>;
  getCell: (r: number, c: number) => CellData | undefined;
  setCell: (r: number, c: number, data: Partial<CellData>) => void;
}

export const SpreadsheetContextInstance = createContext<SpreadsheetBaseValue | null>(null);

export const useSpreadsheetBase = (): SpreadsheetBaseValue => {
  const ctx = useContext(SpreadsheetContextInstance);
  if (!ctx) throw new Error('useSpreadsheetBase must be used inside a SpreadsheetProvider');
  return ctx;
};
