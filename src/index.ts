/*
 * Public entry point of the `opensheets` package (bundled to dist/ by
 * scripts/build.mjs). Import the stylesheets once in your app:
 *
 *   import 'opensheets/styles.css';          // component styles
 *   import 'opensheets/styles/tokens.css';   // design tokens (light/dark)
 *
 * Features with their own dependencies live in subpath entries so the core
 * never pulls them in:
 *
 *   opensheets/excel         Excel import/export        (peer: xlsx)
 *   opensheets/hyperformula  HyperFormula-backed engine (peer: hyperformula, GPL-3.0)
 *   opensheets/server        collaboration relay        (peers: ws, redis)
 */

// Providers and their hooks
export { SpreadsheetProviderEnhanced, useSpreadsheetEnhanced } from './spreadsheet/SpreadsheetContextEnhanced';
export { SpreadsheetProviderPersisted, useSpreadsheetPersisted } from './spreadsheet/SpreadsheetContextPersisted';
export type { PersistedTableProps } from './spreadsheet/SpreadsheetContextPersisted';

// Grid and chrome
export { SpreadsheetTableOptimized } from './spreadsheet/components/SpreadsheetTableOptimized';
export { FormulaBar } from './spreadsheet/components/FormulaBar';
export { FormattingToolbar } from './spreadsheet/components/FormattingToolbar';
export { FindReplaceBar } from './spreadsheet/components/FindReplaceBar';
export { ChartPanel } from './spreadsheet/components/ChartPanel';
export type { ChartType, ChartPanelState } from './spreadsheet/components/ChartPanel';
export { ConditionalFormattingPanel } from './spreadsheet/components/ConditionalFormatting';
export { DataValidation } from './spreadsheet/components/DataValidation';
export { DropdownMenu } from './spreadsheet/components/Menu';
export type { MenuEntry } from './spreadsheet/components/Menu';
export * from './spreadsheet/components/icons';

// Hooks
export { useUndoRedo } from './spreadsheet/hooks/useUndoRedo';
export { useTheme } from './spreadsheet/hooks/useTheme';
export type { Theme } from './spreadsheet/hooks/useTheme';

// Collaboration (client side; the relay is `opensheets/server`)
export { useCollaboration } from './spreadsheet/collaboration/useCollaboration';
export { getCollabUsers, getCollabToasts, subscribeCollab, COLLAB_PALETTE } from './spreadsheet/collaboration/presenceStore';
export type { CollabUser, CollabToast } from './spreadsheet/collaboration/presenceStore';
export { getIdentity, getAuthToken, subscribeAuth, login, register, logout } from './spreadsheet/collaboration/authStore';
export type { Identity, AuthSession } from './spreadsheet/collaboration/authStore';
export { registerSheetData, unregisterSheetData } from './spreadsheet/utils/sheetRegistry';

// Persistence
export { PersistenceManager } from './spreadsheet/persistence/PersistenceManager';
export { LocalStorageAdapter } from './spreadsheet/persistence/LocalStorageAdapter';
export type {
  PersistenceAdapter, PersistedState, SpreadsheetMetadata, SaveResult, Version, SyncStatus,
} from './spreadsheet/persistence/types';

// State, types and utilities
export { spreadsheetReducer } from './spreadsheet/reducers/spreadsheetReducer';
export * from './spreadsheet/types/spreadsheet';
export type { SpreadsheetAction } from './spreadsheet/types/actions';
export { columnToLetter, letterToColumn } from './spreadsheet/utils/columnUtils';
export { parseCellRef, cellRefToString, cellsInRange, evaluateFormula } from './spreadsheet/utils/formulaUtils';
export { normalizeRect, isCellInSelection, singleCellSelection } from './spreadsheet/utils/selectionUtils';
export { parseCSV, exportToCSV, downloadCSV, importFromCSVFile } from './spreadsheet/utils/csvUtils';
export { formatCellValue, autoDetectFormat, PREDEFINED_FORMATS } from './spreadsheet/utils/formatUtils';
export type { NumberFormatOptions, DateFormatOptions } from './spreadsheet/utils/formatUtils';
export { applyFilters, sortData, getColumnUniqueValues, createFilterRule } from './spreadsheet/utils/filterUtils';
export { evaluateConditionalFormat, combineConditionalFormats } from './spreadsheet/utils/conditionalFormattingUtils';
