# OpenSheets 2.0 - Enterprise-Grade Spreadsheet Component

A production-ready, Google Sheets-like spreadsheet component for React with advanced features including real-time collaboration, formula engine, and comprehensive accessibility support.

## 🚀 Features

### Core Spreadsheet Functionality
- **Virtual Scrolling**: Handles 1000+ rows/columns efficiently
- **Cell Editing**: In-cell and formula bar editing with full keyboard support
- **Formulas**: built-in evaluator for everyday spreadsheet functions, with an optional HyperFormula engine (400+ functions) via `opensheets/hyperformula`
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
```

React 18 is a peer dependency. Import the stylesheets once, anywhere in your
app: the component styles and the design tokens (light/dark theming via CSS
custom properties).

```tsx
import 'opensheets/styles.css';
import 'opensheets/styles/tokens.css';
```

The package ships ESM and CommonJS builds with TypeScript types, and works
with bundlers (Vite, webpack, esbuild) as well as from Node for server
rendering and tests.

### Optional features

Features that need their own dependency live behind a subpath entry so the
core never pulls them in. Install the peer only for the ones you use.

| Subpath | What it adds | Install |
| --- | --- | --- |
| `opensheets/excel` | `.xlsx` import and export | `npm install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` (the SheetJS build; the npm registry copy is frozen at 0.18.5 with open advisories) |
| `opensheets/hyperformula` | a formula engine backed by HyperFormula (400+ functions) | `npm install hyperformula`. HyperFormula is GPL-3.0-only with a commercial licence available; the core evaluates formulas without it, so opting in is your licensing decision |
| `opensheets/server` | the collaboration relay and account endpoints | `npm install ws`, plus `redis` to run several instances |

## 🚀 Running the Demo App

The repo includes a Vite demo app in `examples/` that exercises the full
component suite:

```bash
git clone https://github.com/w0h1v/OpenSheets.git
cd OpenSheets
npm install
npm run dev        # starts the demo at http://localhost:8000
```

Other useful scripts:

| Script | What it does |
| --- | --- |
| `npm run dev` | Run the examples app with hot reload |
| `npm test` | Run the test suite (Jest + Testing Library) |
| `npm run typecheck` | Type-check the source |
| `npm run lint` | Lint the source (ESLint) |
| `npm run build` | Compile the library to `dist/` |
| `npm run build:examples` | Build a production bundle of the demo |
| `npm run demo` | Build the demo and serve it with the standalone server |
| `npm run test:relay` | Test the collaboration relay (accounts, presence, Redis fan-out) |
| `npm run test:package` | Pack the library and use it from a throwaway consumer project |
| `npm run release:check` | Everything CI runs, in order |

### Collaboration server, accounts and scaling

Both `npm run dev` and the standalone server (`npm run serve`, after
`npm run build:examples`) mount the same relay core from
`server/relayCore.mjs`, published as `opensheets/server`: a `/collab`
WebSocket relay plus `/auth/*` account endpoints.

**Identities.** Collaborators can sign in from the account button in the
header (create an account with a name and password, or sign in). A signed-in
identity is per *person*: it is shared by every tab of that browser, restored
on reload, and used for presence, edit stamps and protected-range ownership.
Without an account each tab collaborates as a guest with a random name.
Passwords are stored pbkdf2-hashed and session tokens are stored hashed, in
`examples/data/accounts.json` (git-ignored) or, with Redis, in Redis.

**Running more than one instance.** The relay keeps its state (fan-out,
per-sheet snapshots, presence, accounts) in a pluggable bus. By default that
is in-memory, which is right for a single instance. To run several instances
behind a load balancer, point them all at one Redis:

```bash
npm install redis                    # optional dependency, only needed with REDIS_URL
REDIS_URL=redis://localhost:6379 PORT=8081 npm run serve
REDIS_URL=redis://localhost:6379 PORT=8082 npm run serve
```

Any instance can serve any client; edits, presence and accounts are shared.
Each instance exposes `GET /healthz` (`{ ok, instance, bus, clients }`) for
load-balancer checks.

| Variable | Meaning |
| --- | --- |
| `PORT` | Standalone server port (default `8080`) |
| `REDIS_URL` | When set, relay state lives in Redis and instances share it |
| `OPENSHEETS_DATA_DIR` | Where `accounts.json` lives without Redis (default `examples/data`) |

**Mounting the relay in your own server.** The same core is available to
consumers; `examples/server.mjs` is a complete example.

```js
import { createServer } from 'node:http';
import { createRelay, createBus, createAccountStore } from 'opensheets/server';

const bus = createBus();               // MemoryBus, or RedisBus when REDIS_URL is set
await bus.init();
const accounts = createAccountStore(bus, './data');
await accounts.init();
const relay = createRelay({ bus, accounts });

const server = createServer(async (req, res) => {
  if (await relay.handleHttp(req, res)) return;   // /auth/*, /healthz
  // ...serve your app
});
relay.attach(server);                  // WebSocket endpoint at /collab
server.listen(8080);
```

## 🔧 Quick Start

The snippets below assume the two stylesheet imports from the installation
section are somewhere in your app.

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

The client side is one hook. Point it at the state of a provider and it
relays cell edits and selection presence through the `/collab` WebSocket on
the same origin, reconnects with backoff, and queues edits made offline.

```tsx
import { useCollaboration, useSpreadsheetPersisted } from 'opensheets';

function CollabLayer({ sheetId }: { sheetId: string }) {
  const { state, dispatch } = useSpreadsheetPersisted();
  const stateRef = React.useRef(state);
  stateRef.current = state;
  useCollaboration({ sheetId, getState: () => stateRef.current, dispatch });
  return null;
}
```

Who is connected comes from the presence store (`subscribeCollab`,
`getCollabUsers`), and identity from the auth store (`getIdentity`, `login`,
`register`, `logout`). The server side is `opensheets/server`; see
[Collaboration server, accounts and scaling](#collaboration-server-accounts-and-scaling).

`WebSocketCollaborationService` and the CRDT classes are also exported for
applications that bring their own protocol and server.

### Custom Formula Engine

The grid evaluates formulas with its built-in evaluator. For the full
HyperFormula function set, opt in through the subpath entry (GPL-3.0-only;
see [Optional features](#optional-features)).

```tsx
import { FormulaEngine } from 'opensheets/hyperformula';

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

Needs the optional `xlsx` peer dependency (see [Optional features](#optional-features)).

```tsx
import { importFromExcel, exportToExcel } from 'opensheets/excel';

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
- **Built-in evaluator**: cell references, ranges, cross-sheet references and the common functions, recalculated live
- **Optional HyperFormula engine**: 400+ Excel-compatible functions behind `opensheets/hyperformula`

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

- **Issues**: [GitHub Issues](https://github.com/w0h1v/OpenSheets/issues)
- **Security**: see [SECURITY.md](SECURITY.md) for private reporting
- **Dependency and release policy**: [docs/SUPPLY-CHAIN.md](docs/SUPPLY-CHAIN.md)
