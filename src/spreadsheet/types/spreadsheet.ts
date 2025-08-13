export interface ConditionalFormat {
  type: 'cellValue' | 'textContains' | 'dateOccurring' | 'formula';
  condition: 'greaterThan' | 'lessThan' | 'between' | 'equal' | 'notEqual' | 'contains' | 'startsWith' | 'endsWith' | 'notBetween' | 'notContains';
  value1?: any;
  value2?: any; // for 'between' condition
  format: CellFormat;
}

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
  // Text formatting
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  
  // Font properties
  fontFamily?: string;
  fontSize?: number;
  color?: string;
  
  // Alignment
  textAlign?: 'left' | 'center' | 'right';
  verticalAlign?: 'top' | 'middle' | 'bottom';
  
  // Text wrapping and rotation
  wrapText?: boolean;
  textRotation?: number; // degrees
  
  // Cell appearance
  backgroundColor?: string;
  borders?: BorderStyle;
  
  // Number and date formatting
  numberFormat?: string; // Custom format string
  formatType?: 'automatic' | 'number' | 'currency' | 'percentage' | 'scientific' | 'accounting' | 'date' | 'time' | 'duration' | 'text';
  currencySymbol?: string;
  decimalPlaces?: number;
  
  // Conditional formatting (future use)
  conditionalFormat?: ConditionalFormat;
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

export interface SheetFormatting {
  theme?: string;
  showGridlines?: boolean;
  frozenRows?: number;
  frozenCols?: number;
  defaultRowHeight?: number;
  defaultColWidth?: number;
  defaultFont?: {
    family: string;
    size: number;
    color: string;
  };
}

export interface FilterRule {
  column: number;
  type: 'text' | 'number' | 'date' | 'boolean' | 'custom';
  condition: 'equals' | 'notEquals' | 'contains' | 'notContains' | 'startsWith' | 'endsWith' | 
           'greaterThan' | 'lessThan' | 'greaterEqual' | 'lessEqual' | 'between' | 'notBetween' |
           'isEmpty' | 'isNotEmpty' | 'isTrue' | 'isFalse';
  value?: any;
  value2?: any; // for 'between' conditions
  caseSensitive?: boolean;
  customFunction?: (value: any) => boolean;
}

export interface FilterState {
  rules: FilterRule[];
  hiddenRows: Set<number>;
  showFilterHeaders?: boolean;
  sortColumn?: number;
  sortDirection?: 'asc' | 'desc';
}

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
  sheetFormatting?: SheetFormatting;
  filterState?: FilterState;
}

export interface ValidationRule {
  type: 'number' | 'date' | 'list' | 'custom' | 'text';
  min?: number | Date;
  max?: number | Date;
  list?: string[];
  customValidator?: (value: any) => boolean;
  errorMessage?: string;
  showError?: boolean;
  
  // Enhanced dropdown features
  allowCustomValues?: boolean; // Allow entries not in the list
  showDropdownArrow?: boolean; // Show dropdown arrow indicator
  searchable?: boolean; // Enable search/filter in dropdown
  multiSelect?: boolean; // Allow multiple selections (comma-separated)
  placeholder?: string; // Placeholder text for empty cells
  sourceRange?: string; // Reference to range for dynamic lists (e.g., "A1:A10")
}