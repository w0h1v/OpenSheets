// Public library entry point. Design tokens live in a subpath export —
// consumers import 'opensheets/styles/tokens.css' (see exports map).
// `main`/`types` in package.json point at dist/index.js / dist/index.d.ts,
// which are produced by `npm run build` from this file.

// Core (state-hook) API
export {
  SpreadsheetProvider,
  useSpreadsheet,
} from './spreadsheet/SpreadsheetContext';

// Enhanced API (undo/redo, actions, persistence) — recommended
export {
  SpreadsheetProviderEnhanced,
  useSpreadsheetEnhanced,
} from './spreadsheet/SpreadsheetContextEnhanced';
export { SpreadsheetProviderPersisted } from './spreadsheet/SpreadsheetContextPersisted';

// Components
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

// Hooks
export { useUndoRedo } from './spreadsheet/hooks/useUndoRedo';
export { useMultiSelection } from './spreadsheet/hooks/useMultiSelection';
export { useKeyboardShortcuts } from './spreadsheet/hooks/useKeyboardShortcuts';
export { useClipboard } from './spreadsheet/hooks/useClipboard';

// Types and utilities
export * from './spreadsheet/types/spreadsheet';
export * from './spreadsheet/utils/columnUtils';
export * from './spreadsheet/utils/formulaUtils';
export * from './spreadsheet/utils/selectionUtils';
export * from './spreadsheet/utils/clipboardUtils';
