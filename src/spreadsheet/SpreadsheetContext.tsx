import { createContext, useContext } from 'react';
import type React from 'react';
import { SpreadsheetState, CellData } from './types/spreadsheet';

/*
 * The base context: a setState-style view of the spreadsheet that the grid
 * internals (cell renderer, keyboard and clipboard hooks) read. Both
 * providers publish it; consumers use the provider hooks instead.
 */
export interface SpreadsheetContextValue {
  state: SpreadsheetState;
  setState: React.Dispatch<React.SetStateAction<SpreadsheetState>>;
  getCell: (r: number, c: number) => CellData | undefined;
  setCell: (r: number, c: number, data: Partial<CellData>) => void;
}

export const SpreadsheetContextInstance = createContext<SpreadsheetContextValue | null>(null);

export const useSpreadsheet = () => {
  const ctx = useContext(SpreadsheetContextInstance);
  if (!ctx) throw new Error('useSpreadsheet must be used inside a spreadsheet provider');
  return ctx;
};
