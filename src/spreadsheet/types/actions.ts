import { CellData, Selection, SelectionRect, CellFormat } from './spreadsheet';

export type SpreadsheetAction =
  | { type: 'SET_CELL'; payload: { row: number; col: number; data: Partial<CellData> } }
  | { type: 'SET_CELLS'; payload: { updates: Array<{ row: number; col: number; data: Partial<CellData> }> } }
  | { type: 'CLEAR_CELL'; payload: { row: number; col: number } }
  | { type: 'CLEAR_RANGE'; payload: { range: SelectionRect } }
  | { type: 'SET_SELECTION'; payload: Selection }
  | { type: 'ADD_SELECTION_RANGE'; payload: SelectionRect }
  | { type: 'SET_EDITING'; payload: { row: number; col: number } | null }
  | { type: 'SET_FORMULA_INPUT'; payload: string }
  | { type: 'INSERT_ROW'; payload: { index: number; count?: number } }
  | { type: 'INSERT_COLUMN'; payload: { index: number; count?: number } }
  | { type: 'DELETE_ROW'; payload: { index: number; count?: number } }
  | { type: 'DELETE_COLUMN'; payload: { index: number; count?: number } }
  | { type: 'SET_ROW_HEIGHT'; payload: { row: number; height: number } }
  | { type: 'SET_COLUMN_WIDTH'; payload: { col: number; width: number } }
  | { type: 'APPLY_FORMAT_TO_SELECTION'; payload: Partial<CellFormat> }
  | { type: 'FILL_RANGE'; payload: { range: SelectionRect; direction: 'down' | 'right' | 'up' | 'left'; type: 'copy' | 'series' } }
  | { type: 'SORT_RANGE'; payload: { range: SelectionRect; column: number; ascending: boolean } }
  | { type: 'SET_VALIDATION'; payload: { row: number; col: number; validation: ValidationRule } }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'BATCH'; payload: SpreadsheetAction[] };

export interface ValidationRule {
  type: 'number' | 'date' | 'list' | 'custom' | 'text';
  min?: number | Date;
  max?: number | Date;
  list?: string[];
  customValidator?: (value: any) => boolean;
  errorMessage?: string;
  showError?: boolean;
}

export interface Command {
  execute: () => void;
  undo: () => void;
  redo: () => void;
  description: string;
}