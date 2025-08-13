export interface CellData {
  value: any;
  formula?: string;
  format?: CellFormat;
  metadata?: any;
}

export interface BorderStyle {
  top?: BorderSide;
  right?: BorderSide;
  bottom?: BorderSide;
  left?: BorderSide;
}

export interface BorderSide {
  color?: string;
  style?: 'solid' | 'dashed' | 'dotted';
  width?: number;
}

export interface CellFormat {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  textAlign?: 'left' | 'center' | 'right';
  verticalAlign?: 'top' | 'middle' | 'bottom';
  backgroundColor?: string;
  color?: string;
  borders?: BorderStyle;
  numberFormat?: string;
}

export interface SelectionRect {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

export interface Selection {
  ranges: SelectionRect[];
  active: { row: number; col: number } | null;
}

export interface TableProps {
  initialData?: SparseMatrix<CellData>;
  onCellChange?: (row: number, col: number, data: CellData) => void;
  onSelectionChange?: (selection: Selection) => void;
  readOnly?: boolean;
  maxRows?: number;
  maxCols?: number;
}

export type SparseMatrix<T> = Map<string, T>;

export const keyOf = (row: number, col: number) => `${row}:${col}`;
export const parseKey = (key: string) =>
  key.split(':').map(Number) as [number, number];

export interface SpreadsheetState {
  data: SparseMatrix<CellData>;
  maxRows: number;
  maxCols: number;
  selection: Selection;
  editing: { row: number; col: number } | null;
  formulaInput: string;
  readOnly?: boolean;
  rowHeights?: number[];
  colWidths?: number[];
  validation?: Map<string, ValidationRule>;
  clipboardData?: { cells: CellData[][]; source: SelectionRect };
}

export interface ValidationRule {
  type: 'number' | 'date' | 'list' | 'custom' | 'text';
  min?: number | Date;
  max?: number | Date;
  list?: string[];
  customValidator?: (value: any) => boolean;
  errorMessage?: string;
  showError?: boolean;
}