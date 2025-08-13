import React, { createContext, useContext, useState } from 'react';
import { TableProps, SpreadsheetState, SparseMatrix, CellData, keyOf } from './types/spreadsheet';

interface SpreadsheetContextValue {
  state: SpreadsheetState;
  setState: React.Dispatch<React.SetStateAction<SpreadsheetState>>;
  getCell: (r: number, c: number) => CellData | undefined;
  setCell: (r: number, c: number, data: Partial<CellData>) => void;
}

const SpreadsheetContext = createContext<SpreadsheetContextValue | null>(null);

export const SpreadsheetProvider: React.FC<React.PropsWithChildren<TableProps>> = ({
  initialData,
  maxRows = 1000,
  maxCols = 100,
  readOnly = false,
  children,
}) => {
  const [state, setState] = useState<SpreadsheetState>({
    data: initialData ?? new Map(),
    maxRows,
    maxCols,
    selection: { ranges: [], active: null },
    editing: null,
    formulaInput: '',
    readOnly,
  });

  const getCell = (r: number, c: number) => state.data.get(keyOf(r, c));
  
  const setCell = (r: number, c: number, data: Partial<CellData>) => {
    setState((prev) => {
      const key = keyOf(r, c);
      const existing = prev.data.get(key) ?? {};
      const updated = { ...existing, ...data };
      const newMap = new Map(prev.data);
      newMap.set(key, updated);
      return { ...prev, data: newMap };
    });
  };

  return (
    <SpreadsheetContext.Provider value={{ state, setState, getCell, setCell }}>
      {children}
    </SpreadsheetContext.Provider>
  );
};

export const useSpreadsheet = () => {
  const ctx = useContext(SpreadsheetContext);
  if (!ctx) throw new Error('useSpreadsheet must be used within SpreadsheetProvider');
  return ctx;
};