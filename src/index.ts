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

// ---------------------------------------------------------------------------
// Providers and their hooks
// ---------------------------------------------------------------------------
export { SpreadsheetProvider, useSpreadsheet } from './spreadsheet/SpreadsheetContext';
export { SpreadsheetProviderEnhanced, useSpreadsheetEnhanced } from './spreadsheet/SpreadsheetContextEnhanced';
export { SpreadsheetProviderPersisted, useSpreadsheetPersisted } from './spreadsheet/SpreadsheetContextPersisted';
export type { PersistedTableProps } from './spreadsheet/SpreadsheetContextPersisted';

// ---------------------------------------------------------------------------
// Grid and chrome
// ---------------------------------------------------------------------------
export { SpreadsheetTable } from './spreadsheet/components/SpreadsheetTable';
export { SpreadsheetTableOptimized } from './spreadsheet/components/SpreadsheetTableOptimized';
export { CellRenderer } from './spreadsheet/components/CellRenderer';
export { CellRendererOptimized } from './spreadsheet/components/CellRendererOptimized';
export { FormulaBar } from './spreadsheet/components/FormulaBar';
export { FormattingToolbar } from './spreadsheet/components/FormattingToolbar';
export { SelectionOverlay } from './spreadsheet/components/SelectionOverlay';
export { ContextMenu } from './spreadsheet/components/ContextMenu';
export { ResizeHandle } from './spreadsheet/components/ResizeHandle';
export { DataValidation } from './spreadsheet/components/DataValidation';
export { PersistenceStatus } from './spreadsheet/components/PersistenceStatus';
export { CellDropdown } from './spreadsheet/components/CellDropdown';
export { DropdownArrow } from './spreadsheet/components/DropdownArrow';
export { ColumnFilter } from './spreadsheet/components/ColumnFilter';
export { FilterButton } from './spreadsheet/components/FilterButton';
export { ColorPickerPopover } from './spreadsheet/components/ColorPickerPopover';
export { CommentIndicator } from './spreadsheet/components/CommentIndicator';
export type { CommentEntry } from './spreadsheet/components/CommentIndicator';
export { ConditionalFormattingPanel, ConditionalFormattingButton } from './spreadsheet/components/ConditionalFormatting';
export { SheetFormattingPanel, useSheetFormatting } from './spreadsheet/components/SheetFormatting';
export { FindReplaceBar } from './spreadsheet/components/FindReplaceBar';
export { ChartPanel } from './spreadsheet/components/ChartPanel';
export type { ChartType, ChartPanelState } from './spreadsheet/components/ChartPanel';
export { DropdownMenu } from './spreadsheet/components/Menu';
export type { MenuEntry } from './spreadsheet/components/Menu';
export * from './spreadsheet/components/icons';

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------
export { useUndoRedo } from './spreadsheet/hooks/useUndoRedo';
export { useMultiSelection } from './spreadsheet/hooks/useMultiSelection';
export { useKeyboardShortcuts } from './spreadsheet/hooks/useKeyboardShortcuts';
export { useClipboard } from './spreadsheet/hooks/useClipboard';
export { useTheme } from './spreadsheet/hooks/useTheme';
export type { Theme } from './spreadsheet/hooks/useTheme';

// ---------------------------------------------------------------------------
// Collaboration (client side; the relay is `opensheets/server`)
// ---------------------------------------------------------------------------
export { useCollaboration } from './spreadsheet/collaboration/useCollaboration';
export {
  setCollabUsers, getCollabUsers, pushCollabToast, getCollabToasts, subscribeCollab, COLLAB_PALETTE,
} from './spreadsheet/collaboration/presenceStore';
export type { CollabUser, CollabToast } from './spreadsheet/collaboration/presenceStore';
export {
  getIdentity, getAuthToken, subscribeAuth, getClientId, adoptServerIdentity, login, register, logout,
} from './spreadsheet/collaboration/authStore';
export type { Identity, AuthSession } from './spreadsheet/collaboration/authStore';
export { SpreadsheetCRDT, OperationalTransform } from './spreadsheet/collaboration/crdt';
export type { CRDTOperation, VectorClock } from './spreadsheet/collaboration/crdt';
export { WebSocketCollaborationService } from './spreadsheet/collaboration/websocketService';
export type { CollaborationMessage, UserPresence } from './spreadsheet/collaboration/websocketService';
export * from './spreadsheet/utils/editContext';
export * from './spreadsheet/utils/sheetRegistry';

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------
export { PersistenceManager } from './spreadsheet/persistence/PersistenceManager';
export type { PersistenceMode } from './spreadsheet/persistence/PersistenceManager';
export { LocalStorageAdapter } from './spreadsheet/persistence/LocalStorageAdapter';
export { ApiAdapter } from './spreadsheet/persistence/ApiAdapter';
export * from './spreadsheet/persistence/types';

// ---------------------------------------------------------------------------
// State, types and utilities
// ---------------------------------------------------------------------------
export { spreadsheetReducer } from './spreadsheet/reducers/spreadsheetReducer';
export * from './spreadsheet/types/spreadsheet';
export * from './spreadsheet/types/actions';
export * from './spreadsheet/utils/columnUtils';
export * from './spreadsheet/utils/formulaUtils';
export * from './spreadsheet/utils/selectionUtils';
export * from './spreadsheet/utils/clipboardUtils';
export * from './spreadsheet/utils/csvUtils';
export * from './spreadsheet/utils/formatUtils';
export {
  applyFilters, evaluateFilterRule, sortData, getColumnUniqueValues, createFilterRule,
} from './spreadsheet/utils/filterUtils';
export {
  evaluateConditionalFormat, applyConditionalFormatting, getApplicableConditionalFormats, combineConditionalFormats,
} from './spreadsheet/utils/conditionalFormattingUtils';
