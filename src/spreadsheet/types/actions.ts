import { CellData, Selection, SelectionRect, CellFormat, ValidationRule, SpreadsheetState, SheetFormatting } from './spreadsheet';

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
  | { type: 'SET_VALIDATION'; payload: { row: number; col: number; validation: ValidationRule | null } }
  | { type: 'UPDATE_SHEET_FORMATTING'; payload: Partial<SheetFormatting> }
  | { type: 'LOAD_STATE'; payload: SpreadsheetState }
  | { type: 'RESTORE_STATE'; payload: SpreadsheetState }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'BATCH'; payload: SpreadsheetAction[] };


export interface Command {
  execute: () => void;
  undo: () => void;
  redo: () => void;
  description: string;
}