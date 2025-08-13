// Enhanced exports with all new features
export { SpreadsheetProviderEnhanced, useSpreadsheetEnhanced } from './SpreadsheetContextEnhanced';
export { SpreadsheetProviderPersisted, useSpreadsheetPersisted } from './SpreadsheetContextPersisted';
export { SpreadsheetTableOptimized } from './components/SpreadsheetTableOptimized';
export { CellRendererOptimized } from './components/CellRendererOptimized';
export { FormulaBar } from './components/FormulaBar';
export { FormattingToolbar } from './components/FormattingToolbar';
export { SelectionOverlay } from './components/SelectionOverlay';
export { ContextMenu } from './components/ContextMenu';
export { ResizeHandle } from './components/ResizeHandle';
export { DataValidation } from './components/DataValidation';
export { PersistenceStatus } from './components/PersistenceStatus';

// Hooks
export { useUndoRedo } from './hooks/useUndoRedo';
export { useMultiSelection } from './hooks/useMultiSelection';
export { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
export { useClipboard } from './hooks/useClipboard';

// Utils
export * from './utils/columnUtils';
export * from './utils/formulaUtils';
export * from './utils/selectionUtils';
export * from './utils/clipboardUtils';
export * from './utils/csvUtils';
export * from './utils/excelUtils';
export { FormulaEngine } from './utils/hyperformulaEngine';

// Collaboration
export { SpreadsheetCRDT, OperationalTransform } from './collaboration/crdt';
export { WebSocketCollaborationService } from './collaboration/websocketService';

// Persistence
export { PersistenceManager } from './persistence/PersistenceManager';
export { LocalStorageAdapter } from './persistence/LocalStorageAdapter';
export { ApiAdapter } from './persistence/ApiAdapter';
export * from './persistence/types';

// Types
export * from './types/spreadsheet';
export * from './types/actions';

// Reducers
export { spreadsheetReducer } from './reducers/spreadsheetReducer';

// Legacy exports for backward compatibility
export { SpreadsheetProvider, useSpreadsheet } from './SpreadsheetContext';
export { SpreadsheetTable } from './components/SpreadsheetTable';
export { CellRenderer } from './components/CellRenderer';