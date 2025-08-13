import React from 'react';
import {
  SpreadsheetProviderPersisted,
  SpreadsheetTableOptimized,
  FormulaBar,
  FormattingToolbar,
  PersistenceStatus,
  useSpreadsheetPersisted,
} from '../src/spreadsheet/indexEnhanced';

/**
 * Example 1: Local Storage Only (Simplest)
 * Data is saved to browser's localStorage automatically
 */
export const LocalStorageExample: React.FC = () => {
  return (
    <SpreadsheetProviderPersisted
      spreadsheetId="my-local-spreadsheet"
      persistenceMode="local"
      autoSave={true}
      autoSaveInterval={3000} // Save every 3 seconds
    >
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        <PersistenceStatus />
        <FormattingToolbar />
        <FormulaBar />
        <div style={{ flex: 1 }}>
          <SpreadsheetTableOptimized />
        </div>
      </div>
    </SpreadsheetProviderPersisted>
  );
};

/**
 * Example 2: API/Backend with Real-time Sync
 * Data syncs with your backend server and supports collaboration
 */
export const ApiBackendExample: React.FC = () => {
  const apiConfig = {
    baseUrl: 'https://api.yourserver.com',
    wsUrl: 'wss://api.yourserver.com/ws',
    apiKey: process.env.REACT_APP_API_KEY || '',
    userId: 'user123',
  };

  return (
    <SpreadsheetProviderPersisted
      spreadsheetId="shared-spreadsheet-001"
      persistenceMode="api"
      apiConfig={apiConfig}
      autoSave={true}
      autoSaveInterval={5000}
      onSyncStatusChange={(status) => {
        console.log('Sync status:', status);
      }}
      onSaveComplete={(result) => {
        if (result.success) {
          console.log('Saved successfully at', new Date(result.timestamp));
        } else {
          console.error('Save failed:', result.error);
        }
      }}
    >
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        <PersistenceStatus />
        <FormattingToolbar />
        <FormulaBar />
        <div style={{ flex: 1 }}>
          <SpreadsheetTableOptimized />
        </div>
      </div>
    </SpreadsheetProviderPersisted>
  );
};

/**
 * Example 3: Hybrid Mode (Best of Both)
 * Saves to localStorage for instant access AND syncs with backend
 * Works offline and syncs when connection is restored
 */
export const HybridModeExample: React.FC = () => {
  const [loadError, setLoadError] = React.useState<string | null>(null);
  
  const apiConfig = {
    baseUrl: process.env.REACT_APP_API_URL || 'http://localhost:3001',
    wsUrl: process.env.REACT_APP_WS_URL || 'ws://localhost:3001',
    apiKey: process.env.REACT_APP_API_KEY || '',
    userId: localStorage.getItem('userId') || `user_${Date.now()}`,
  };

  // Save userId for next session
  React.useEffect(() => {
    localStorage.setItem('userId', apiConfig.userId);
  }, [apiConfig.userId]);

  return (
    <SpreadsheetProviderPersisted
      spreadsheetId="hybrid-spreadsheet"
      persistenceMode="hybrid"
      apiConfig={apiConfig}
      autoSave={true}
      autoSaveInterval={5000}
      onLoadComplete={(success) => {
        if (!success) {
          setLoadError('Failed to load spreadsheet data');
        }
      }}
      onSyncStatusChange={(status) => {
        // Show user-friendly notifications
        if (!status.connected && status.mode !== 'local') {
          console.log('📡 Working offline - changes will sync when reconnected');
        }
        if (status.pendingChanges > 0) {
          console.log(`⏳ ${status.pendingChanges} changes waiting to sync`);
        }
      }}
    >
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        <PersistenceStatus />
        
        {loadError && (
          <div style={{
            background: '#fee',
            color: '#c00',
            padding: '8px 16px',
            borderBottom: '1px solid #fcc'
          }}>
            {loadError}
          </div>
        )}
        
        <FormattingToolbar />
        <FormulaBar />
        <div style={{ flex: 1 }}>
          <SpreadsheetTableOptimized />
        </div>
      </div>
    </SpreadsheetProviderPersisted>
  );
};

// Version Control Panel Component (must be inside provider)
const VersionControlPanel: React.FC = () => {
  const { saveVersion, loadVersion } = useSpreadsheetPersisted();
  const [versions, setVersions] = React.useState<any[]>([]);
  
  const handleSaveVersion = async () => {
    const label = prompt('Enter version label:');
    if (label) {
      await saveVersion(label);
      // Refresh version list
      loadVersionList();
    }
  };
  
  const loadVersionList = async () => {
    // This would call your API or persistence manager
    // For demo, using mock data
    setVersions([
      { id: 'v1', label: 'Initial version', timestamp: Date.now() - 86400000 },
      { id: 'v2', label: 'After formulas added', timestamp: Date.now() - 3600000 },
    ]);
  };
  
  React.useEffect(() => {
    loadVersionList();
  }, []);
  
  return (
    <>
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        padding: '8px', 
        background: '#f8f9fa',
        borderBottom: '1px solid #e0e0e0'
      }}>
        <PersistenceStatus />
        <button onClick={handleSaveVersion} style={{ marginLeft: 'auto' }}>
          Save Version
        </button>
      </div>
      
      <FormattingToolbar />
      <FormulaBar />
      
      <div style={{ display: 'flex', flex: 1 }}>
        <div style={{ flex: 1 }}>
          <SpreadsheetTableOptimized />
        </div>
        
        <div style={{ 
          width: '200px', 
          borderLeft: '1px solid #e0e0e0',
          padding: '16px',
          background: '#f8f9fa'
        }}>
          <h4>Version History</h4>
          {versions.map(v => (
            <div key={v.id} style={{ marginBottom: '8px' }}>
              <div>{v.label}</div>
              <small>{new Date(v.timestamp).toLocaleString()}</small>
              <button 
                onClick={() => loadVersion(v.id)}
                style={{ marginTop: '4px', fontSize: '12px' }}
              >
                Restore
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

/**
 * Example 4: With Version Control
 * Includes UI for saving and loading versions
 */
export const VersionControlExample: React.FC = () => {
  return (
    <SpreadsheetProviderPersisted
      spreadsheetId="versioned-spreadsheet"
      persistenceMode="hybrid"
      autoSave={true}
    >
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        <VersionControlPanel />
      </div>
    </SpreadsheetProviderPersisted>
  );
};

/**
 * Example 5: Custom Conflict Resolution
 */
export const ConflictResolutionExample: React.FC = () => {
  const [conflicts, setConflicts] = React.useState<any[]>([]);
  
  const apiConfig = {
    baseUrl: 'https://api.yourserver.com',
    wsUrl: 'wss://api.yourserver.com/ws',
    apiKey: process.env.REACT_APP_API_KEY || '',
    userId: 'user123',
    conflictStrategy: 'manual' as const, // Manual conflict resolution
  };
  
  const handleConflict = (conflictList: any[]) => {
    setConflicts(conflictList);
    // Show conflict resolution UI
  };
  
  const resolveConflict = (cellKey: string, resolution: 'local' | 'server') => {
    // Implement conflict resolution logic
    setConflicts(conflicts.filter(c => c.cell !== cellKey));
  };
  
  return (
    <SpreadsheetProviderPersisted
      spreadsheetId="conflict-demo"
      persistenceMode="api"
      apiConfig={apiConfig}
      autoSave={true}
      onConflict={handleConflict}
    >
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        <PersistenceStatus />
        
        {conflicts.length > 0 && (
          <div style={{
            background: '#fff3cd',
            padding: '8px',
            borderBottom: '1px solid #ffc107'
          }}>
            <strong>Conflicts detected:</strong>
            {conflicts.map(c => (
              <div key={c.cell} style={{ marginTop: '4px' }}>
                Cell {c.cell}: 
                <button onClick={() => resolveConflict(c.cell, 'local')}>
                  Keep Local
                </button>
                <button onClick={() => resolveConflict(c.cell, 'server')}>
                  Use Server
                </button>
              </div>
            ))}
          </div>
        )}
        
        <FormattingToolbar />
        <FormulaBar />
        <div style={{ flex: 1 }}>
          <SpreadsheetTableOptimized />
        </div>
      </div>
    </SpreadsheetProviderPersisted>
  );
};

