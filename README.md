# OpenSheets 2.0 - Enterprise-Grade Spreadsheet Component

A production-ready, Google Sheets-like spreadsheet component for React with advanced features including real-time collaboration, formula engine, and comprehensive accessibility support.

## 🚀 Features

### Core Spreadsheet Functionality
- **Virtual Scrolling**: Handles 1000+ rows/columns efficiently
- **Cell Editing**: In-cell and formula bar editing with full keyboard support
- **Advanced Formulas**: 400+ Excel-compatible functions via HyperFormula
- **Multi-cell Selection**: Range selection with mouse and keyboard
- **Copy/Paste**: Full clipboard support with formatting preservation
- **Undo/Redo**: Complete action history with keyboard shortcuts

### Advanced Features
- **Real-time Collaboration**: WebSocket-based with CRDT conflict resolution
- **Import/Export**: CSV and Excel file support (XLSX/XLS)
- **Data Validation**: Built-in validation rules with custom validators
- **Cell Formatting**: Rich text formatting, colors, alignment, borders
- **Responsive Resizing**: Column/row resizing with persistence
- **Range Operations**: Fill down/up, auto-fill series, sort ranges

### Persistence & Data Storage
- **Multi-tier Persistence**: LocalStorage, API backend, or hybrid mode
- **Auto-save**: Configurable automatic saving with debouncing
- **Offline Support**: Queue changes when offline, sync when reconnected
- **Version History**: Save/restore named versions with timestamps
- **Conflict Resolution**: CRDT-based with multiple resolution strategies
- **Data Compression**: Automatic compression for localStorage
- **Real-time Sync**: WebSocket-based synchronization across sessions

### Performance Optimizations
- **React.memo**: Optimized cell rendering prevents unnecessary re-renders
- **useMemo/useCallback**: Expensive calculations cached
- **Dynamic Virtualization**: Only visible cells rendered
- **Lazy Loading**: Formulas evaluated on-demand
- **Batch Updates**: Multiple operations grouped for efficiency

### Accessibility (WCAG 2.1 AA Compliant)
- **Full Keyboard Navigation**: Arrow keys, Tab, Ctrl+arrows
- **Screen Reader Support**: ARIA labels and live regions
- **Focus Management**: Proper focus trapping and indicators
- **High Contrast Mode**: Supports system preferences
- **Keyboard Shortcuts**: Industry-standard shortcuts

## 📦 Installation

```bash
npm install opensheets
# or
yarn add opensheets
# or
pnpm add opensheets
```

## 🔧 Quick Start

### Basic Usage (Memory Only)
```tsx
import React from 'react';
import {
  SpreadsheetProviderEnhanced,
  SpreadsheetTableOptimized,
  FormulaBar,
  FormattingToolbar
} from 'opensheets';

function App() {
  return (
    <SpreadsheetProviderEnhanced>
      <FormattingToolbar />
      <FormulaBar />
      <SpreadsheetTableOptimized />
    </SpreadsheetProviderEnhanced>
  );
}
```

### With Persistence (LocalStorage)
```tsx
import {
  SpreadsheetProviderPersisted,
  SpreadsheetTableOptimized,
  PersistenceStatus
} from 'opensheets';

function App() {
  return (
    <SpreadsheetProviderPersisted
      spreadsheetId="my-spreadsheet"
      persistenceMode="local"
      autoSave={true}
      autoSaveInterval={3000}
    >
      <PersistenceStatus />
      <SpreadsheetTableOptimized />
    </SpreadsheetProviderPersisted>
  );
}
```

## 📖 Advanced Usage

### With Initial Data

```tsx
import { keyOf } from 'opensheets';

const initialData = new Map();
initialData.set(keyOf(0, 0), { value: 'Product', format: { bold: true } });
initialData.set(keyOf(1, 0), { value: 100 });
initialData.set(keyOf(1, 1), { formula: '=A2*2' });

<SpreadsheetProviderEnhanced 
  initialData={initialData}
  maxRows={500}
  maxCols={50}
>
  {/* components */}
</SpreadsheetProviderEnhanced>
```

### Real-time Collaboration

```tsx
import { WebSocketCollaborationService } from 'opensheets';

const collabService = new WebSocketCollaborationService(
  userId,
  sessionId,
  'wss://your-server.com/spreadsheet'
);

collabService.onCellUpdate = (row, col, data) => {
  // Handle remote cell updates
};

collabService.onPresenceUpdate = (users) => {
  // Show other users' cursors
};
```

### Custom Formula Engine

```tsx
import { FormulaEngine } from 'opensheets';

const engine = new FormulaEngine({
  dateFormats: ['DD/MM/YYYY'],
  currencySymbol: '€',
  decimalSeparator: ',',
  thousandSeparator: '.',
  functionArgSeparator: ';'
});

engine.setCell(0, 0, '=SUM(A2:A10)');
const result = engine.getCellValue(0, 0);
```

### Excel Import/Export

```tsx
import { importFromExcel, exportToExcel } from 'opensheets';

// Import
const file = event.target.files[0];
const { data, rows, cols } = await importFromExcel(file, {
  sheetIndex: 0,
  includeFormulas: true
});

// Export
exportToExcel(data, maxRows, maxCols, 'report.xlsx', {
  includeFormatting: true,
  author: 'John Doe'
});
```

### Data Validation

```tsx
dispatch({
  type: 'SET_VALIDATION',
  payload: {
    row: 0,
    col: 0,
    validation: {
      type: 'number',
      min: 0,
      max: 100,
      errorMessage: 'Value must be between 0 and 100'
    }
  }
});
```

### Persistence with API Backend

```tsx
import { SpreadsheetProviderPersisted } from 'opensheets';

function App() {
  const apiConfig = {
    baseUrl: 'https://api.yourserver.com',
    wsUrl: 'wss://api.yourserver.com/ws',
    apiKey: process.env.REACT_APP_API_KEY,
    userId: 'user123'
  };

  return (
    <SpreadsheetProviderPersisted
      spreadsheetId="shared-doc-001"
      persistenceMode="api"
      apiConfig={apiConfig}
      autoSave={true}
      onSyncStatusChange={(status) => {
        console.log('Sync status:', status);
      }}
    >
      <PersistenceStatus />
      <SpreadsheetTableOptimized />
    </SpreadsheetProviderPersisted>
  );
}
```

### Hybrid Persistence (Best of Both)

```tsx
// Saves to both localStorage AND API backend
// Works offline with automatic sync when reconnected
<SpreadsheetProviderPersisted
  spreadsheetId="hybrid-doc"
  persistenceMode="hybrid"
  apiConfig={apiConfig}
  autoSave={true}
>
  {/* Your spreadsheet components */}
</SpreadsheetProviderPersisted>
```

### Version Management

```tsx
const { saveVersion, loadVersion } = useSpreadsheetPersisted();

// Save a named version
await saveVersion('Before major changes');

// Load a specific version
await loadVersion('version-id');
```

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Arrow Keys` | Navigate cells |
| `Tab` / `Shift+Tab` | Move right/left |
| `Enter` / `Shift+Enter` | Move down/up or edit |
| `F2` | Edit active cell |
| `Escape` | Cancel editing |
| `Delete` / `Backspace` | Clear cell |
| `Ctrl+C` | Copy |
| `Ctrl+X` | Cut |
| `Ctrl+V` | Paste |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo |
| `Ctrl+A` | Select all |
| `Ctrl+Arrow` | Jump to data edge |
| `Shift+Arrow` | Extend selection |
| `Ctrl+Click` | Multi-select cells |
| `Ctrl+S` | Save (when persistence enabled) |

## 🧪 Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

## 📊 Performance Benchmarks

| Operation | 100x100 Grid | 1000x100 Grid | 10000x100 Grid |
|-----------|-------------|---------------|----------------|
| Initial Render | <100ms | <200ms | <300ms |
| Scroll (60fps) | ✅ | ✅ | ✅ |
| Cell Update | <10ms | <10ms | <10ms |
| Formula Calc | <50ms | <100ms | <200ms |
| Copy 100 cells | <20ms | <20ms | <20ms |

## 🛠️ Architecture

### State Management
- **useReducer Pattern**: Predictable state updates with action types
- **Immutable Updates**: All state changes are immutable
- **Command Pattern**: Undo/redo with state snapshots

### Formula Engine
- **HyperFormula**: 400+ Excel-compatible functions
- **Dependency Graph**: Automatic recalculation on changes
- **Circular Reference Detection**: Prevents infinite loops
- **Custom Functions**: Extensible function library

### Collaboration
- **CRDT**: Conflict-free replicated data types
- **Vector Clocks**: Causality tracking
- **Operational Transform**: Alternative conflict resolution
- **Presence System**: Real-time cursor/selection sharing

## 📁 Project Structure

```
/src/spreadsheet
├── components/           # UI components
├── hooks/               # React hooks
├── utils/               # Utility functions
├── types/               # TypeScript definitions
├── reducers/            # State reducers
├── collaboration/       # Real-time collaboration
├── persistence/         # Data persistence adapters
│   ├── LocalStorageAdapter.ts
│   ├── ApiAdapter.ts
│   └── PersistenceManager.ts
└── __tests__/          # Test files
```

## 🔧 Configuration

### Environment Variables

```bash
# API Configuration (for persistence)
REACT_APP_API_URL=https://api.yourserver.com
REACT_APP_WS_URL=wss://api.yourserver.com/ws
REACT_APP_API_KEY=your-api-key

# Feature Flags
REACT_APP_ENABLE_COLLABORATION=true
REACT_APP_ENABLE_PERSISTENCE=true
REACT_APP_MAX_UNDO_HISTORY=50
```

### Persistence Configuration

```tsx
// Local Storage Only
const localConfig = {
  persistenceMode: 'local',
  autoSave: true,
  autoSaveInterval: 5000,
  compressionEnabled: true,
  maxVersions: 10
};

// API Backend
const apiConfig = {
  persistenceMode: 'api',
  apiConfig: {
    baseUrl: 'https://api.yourserver.com',
    wsUrl: 'wss://api.yourserver.com/ws',
    apiKey: 'your-api-key',
    userId: 'user123',
    conflictStrategy: 'last-write-wins' // or 'merge' or 'manual'
  },
  autoSave: true,
  retryAttempts: 3,
  retryDelay: 1000
};

// Hybrid Mode (Recommended for production)
const hybridConfig = {
  persistenceMode: 'hybrid',
  ...apiConfig.apiConfig,
  fallbackToLocal: true,
  syncOnReconnect: true
};
```

## 🚨 Troubleshooting

### Common Issues

**LocalStorage Quota Exceeded**
```tsx
// Enable compression or reduce version history
persistenceConfig.compressionEnabled = true;
persistenceConfig.maxVersions = 5;
```

**WebSocket Connection Failed**
```tsx
// Check CORS settings and fallback to polling
apiConfig.fallbackToPolling = true;
apiConfig.pollingInterval = 5000;
```

**Slow Performance with Large Datasets**
```tsx
// Enable virtual scrolling and lazy loading
<SpreadsheetTableOptimized 
  virtualScrolling={true}
  lazyLoadFormulas={true}
  batchSize={50}
/>
```

**Data Not Persisting**
```tsx
// Check browser settings and permissions
if (!navigator.storage || !navigator.storage.persist) {
  console.warn('Persistent storage not available');
}
```

## 🔄 Migration Guide

### From Basic to Enhanced Version

```tsx
// Old (Basic)
import { SpreadsheetProvider } from 'opensheets';

// New (Enhanced)
import { SpreadsheetProviderEnhanced } from 'opensheets';

// Or with persistence
import { SpreadsheetProviderPersisted } from 'opensheets';
```

### From Memory-only to Persisted

1. Replace provider:
```tsx
// Before
<SpreadsheetProviderEnhanced>

// After
<SpreadsheetProviderPersisted 
  spreadsheetId="unique-id"
  persistenceMode="local"
>
```

2. Add status indicator:
```tsx
import { PersistenceStatus } from 'opensheets';
// Add <PersistenceStatus /> to your UI
```

3. Handle load states:
```tsx
<SpreadsheetProviderPersisted
  onLoadComplete={(success) => {
    if (!success) {
      // Handle load failure
    }
  }}
>
```

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## 📄 License

MIT © OpenSheets Team

## 🙏 Acknowledgments

- [HyperFormula](https://hyperformula.handsontable.com/) for the formula engine
- [TanStack Virtual](https://tanstack.com/virtual) for virtualization
- [SheetJS](https://sheetjs.com/) for Excel support
- [Immer](https://immerjs.github.io/) for immutable updates

## 📞 Support

- **Documentation**: [https://opensheets.dev/docs](https://opensheets.dev/docs)
- **Issues**: [GitHub Issues](https://github.com/yourusername/opensheets/issues)
- **Discord**: [Join our community](https://discord.gg/opensheets)
- **Email**: support@opensheets.dev
