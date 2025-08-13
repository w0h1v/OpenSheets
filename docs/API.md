# OpenSheets API Documentation

## Persistence Adapters

OpenSheets provides a flexible persistence system with multiple storage backends. All adapters implement the `PersistenceAdapter` interface.

## Core Interfaces

### PersistenceAdapter

```typescript
interface PersistenceAdapter {
  save(id: string, state: PersistedState): Promise<SaveResult>;
  load(id: string): Promise<PersistedState | null>;
  delete(id: string): Promise<void>;
  saveVersion(id: string, state: PersistedState, label?: string): Promise<Version>;
  loadVersion(id: string, versionId: string): Promise<PersistedState | null>;
  listVersions(id: string): Promise<Version[]>;
  deleteVersion(id: string, versionId: string): Promise<void>;
  getMetadata(id: string): Promise<SpreadsheetMetadata | null>;
  getSyncStatus(): SyncStatus;
  destroy(): void;
}
```

### PersistedState

```typescript
interface PersistedState {
  data: Map<string, CellData>;
  rowHeights?: number[];
  colWidths?: number[];
  validation?: Map<string, ValidationRule>;
  metadata?: {
    title?: string;
    lastModified: number;
    version: string;
  };
}
```

### SaveResult

```typescript
interface SaveResult {
  success: boolean;
  timestamp: number;
  version?: string;
  error?: string;
}
```

## Adapters

### LocalStorageAdapter

Stores spreadsheet data in the browser's localStorage with automatic compression.

```typescript
import { LocalStorageAdapter } from 'opensheets/persistence';

const adapter = new LocalStorageAdapter({
  prefix: 'spreadsheet_',  // Key prefix in localStorage
  compress: true,          // Enable compression
  maxSize: 5 * 1024 * 1024, // 5MB limit
  maxVersions: 10          // Max version history
});
```

**Features:**
- Automatic compression using CompressionStream API
- Fallback to LZ-string for older browsers
- Version history management
- Automatic cleanup when quota exceeded
- Synchronous access for fast loads

**Methods:**

```typescript
// Save spreadsheet
await adapter.save('doc-1', state);

// Load spreadsheet
const state = await adapter.load('doc-1');

// Save a version
await adapter.saveVersion('doc-1', state, 'Before major changes');

// List versions
const versions = await adapter.listVersions('doc-1');

// Load specific version
const oldState = await adapter.loadVersion('doc-1', 'v1');
```

### ApiAdapter

Connects to a backend API for cloud storage with real-time synchronization.

```typescript
import { ApiAdapter } from 'opensheets/persistence';

const adapter = new ApiAdapter({
  baseUrl: 'https://api.yourserver.com',
  wsUrl: 'wss://api.yourserver.com/ws',
  apiKey: 'your-api-key',
  userId: 'user123',
  conflictStrategy: 'last-write-wins',
  retryAttempts: 3,
  retryDelay: 1000,
  offlineQueueSize: 100
});
```

**Features:**
- WebSocket real-time sync
- Offline queue with automatic retry
- Conflict resolution strategies
- Optimistic updates
- Delta synchronization
- Presence awareness

**Conflict Resolution Strategies:**

1. **last-write-wins** (default): Most recent change wins
2. **merge**: Attempts to merge non-conflicting changes
3. **manual**: Returns conflicts for user resolution

**API Endpoints Required:**

```typescript
// Your backend should implement these endpoints:

// Save spreadsheet
POST /api/spreadsheets/:id
Body: PersistedState
Response: SaveResult

// Load spreadsheet
GET /api/spreadsheets/:id
Response: PersistedState

// Delete spreadsheet
DELETE /api/spreadsheets/:id

// Version management
POST /api/spreadsheets/:id/versions
GET /api/spreadsheets/:id/versions
GET /api/spreadsheets/:id/versions/:versionId
DELETE /api/spreadsheets/:id/versions/:versionId

// WebSocket events
ws.on('cell-update', { row, col, data })
ws.on('presence-update', { userId, cursor })
ws.on('sync-request', { changes })
```

**WebSocket Protocol:**

```typescript
// Client to Server
{
  type: 'cell-update',
  payload: {
    spreadsheetId: string,
    userId: string,
    changes: CellChange[],
    vectorClock: VectorClock
  }
}

// Server to Client
{
  type: 'sync-update',
  payload: {
    changes: CellChange[],
    vectorClock: VectorClock,
    userId: string
  }
}
```

### HybridAdapter (via PersistenceManager)

Combines LocalStorage and API adapters for optimal performance and reliability.

```typescript
import { PersistenceManager } from 'opensheets/persistence';

const manager = new PersistenceManager({
  mode: 'hybrid',
  spreadsheetId: 'doc-1',
  apiConfig: {
    baseUrl: 'https://api.yourserver.com',
    wsUrl: 'wss://api.yourserver.com/ws',
    apiKey: 'your-api-key',
    userId: 'user123'
  },
  autoSave: true,
  autoSaveInterval: 5000,
  onSyncStatusChange: (status) => {
    console.log('Sync status:', status);
  }
});
```

**Behavior:**
- Saves to both localStorage and API
- Loads from localStorage first (fast), then syncs with API
- Falls back to localStorage if API is unavailable
- Queues changes when offline
- Automatically syncs when connection restored

## Usage Examples

### Basic Save/Load

```typescript
const { save, load } = useSpreadsheetPersisted();

// Save current state
const result = await save();
if (result.success) {
  console.log('Saved at', new Date(result.timestamp));
}

// Load state
await load();
```

### Version Management

```typescript
const { saveVersion, loadVersion } = useSpreadsheetPersisted();

// Save a named version
await saveVersion('Before formula changes');

// Load a previous version
await loadVersion('version-123');

// List all versions
const versions = await listVersions();
versions.forEach(v => {
  console.log(v.label, new Date(v.timestamp));
});
```

### Handling Sync Status

```typescript
<SpreadsheetProviderPersisted
  onSyncStatusChange={(status) => {
    if (!status.connected) {
      showNotification('Working offline');
    }
    if (status.pendingChanges > 0) {
      showNotification(`${status.pendingChanges} changes pending`);
    }
    if (status.error) {
      showError(status.error);
    }
  }}
>
```

### Conflict Resolution

```typescript
// Manual conflict resolution
const adapter = new ApiAdapter({
  conflictStrategy: 'manual',
  onConflict: (conflicts) => {
    // Show UI for user to resolve conflicts
    return conflicts.map(c => ({
      cell: c.cell,
      resolution: 'local' // or 'remote'
    }));
  }
});
```

### Offline Queue Management

```typescript
const adapter = new ApiAdapter({
  offlineQueueSize: 100,
  onQueueFull: () => {
    // Warn user that offline changes may be lost
    alert('Too many offline changes. Please reconnect.');
  }
});

// Check queue status
const status = adapter.getSyncStatus();
console.log(`${status.pendingChanges} changes waiting to sync`);
```

## Performance Considerations

### LocalStorage
- **Pros**: Fast, synchronous, works offline
- **Cons**: Limited storage (5-10MB), browser-specific
- **Best for**: Single-user, small datasets, offline-first apps

### API Backend
- **Pros**: Unlimited storage, multi-user, cross-device sync
- **Cons**: Network latency, requires backend infrastructure
- **Best for**: Collaboration, large datasets, enterprise apps

### Hybrid Mode
- **Pros**: Fast loads, offline support, reliable sync
- **Cons**: More complex, storage overhead
- **Best for**: Production apps requiring both speed and reliability

## Security Considerations

1. **API Keys**: Store securely, never commit to version control
2. **User Authentication**: Implement proper auth on backend
3. **Data Encryption**: Consider encrypting sensitive data
4. **CORS**: Configure properly for WebSocket connections
5. **Rate Limiting**: Implement on backend to prevent abuse

## Error Handling

```typescript
try {
  await save();
} catch (error) {
  if (error.code === 'QUOTA_EXCEEDED') {
    // Clear old data or use compression
  } else if (error.code === 'NETWORK_ERROR') {
    // Retry or fallback to local storage
  } else if (error.code === 'CONFLICT') {
    // Handle merge conflict
  }
}
```

## Custom Adapters

You can create custom adapters by implementing the `PersistenceAdapter` interface:

```typescript
class CustomAdapter implements PersistenceAdapter {
  async save(id: string, state: PersistedState): Promise<SaveResult> {
    // Your implementation
  }
  
  async load(id: string): Promise<PersistedState | null> {
    // Your implementation
  }
  
  // ... implement other required methods
}

// Use with PersistenceManager
const manager = new PersistenceManager({
  customAdapter: new CustomAdapter()
});
```

## Testing

```typescript
import { MockAdapter } from 'opensheets/persistence/testing';

// Use mock adapter for tests
const mockAdapter = new MockAdapter();
mockAdapter.setMockData('doc-1', testState);

// Test save
const result = await mockAdapter.save('doc-1', newState);
expect(result.success).toBe(true);

// Test load
const loaded = await mockAdapter.load('doc-1');
expect(loaded).toEqual(newState);
```