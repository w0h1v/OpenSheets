import React, { useState, useCallback, useEffect } from 'react';
import {
  SpreadsheetProviderPersisted,
  PersistenceStatus,
  useSpreadsheetPersisted,
  SpreadsheetTableOptimized,
  FormulaBar,
  FormattingToolbar,
} from '../src/spreadsheet/indexEnhanced';

interface VersionEntry {
  id: string;
  label?: string;
  timestamp: number;
}

// Version history panel wired to the real persistence layer
const VersionHistory: React.FC<{ onRestored?: () => void }> = ({ onRestored }) => {
  const { saveVersion, loadVersion, listVersions } = useSpreadsheetPersisted();
  const [versions, setVersions] = useState<VersionEntry[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const list = await listVersions();
    setVersions([...list].sort((a, b) => b.timestamp - a.timestamp));
  }, [listVersions]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleSave = async () => {
    const label = prompt('Version label:');
    if (!label) return;
    setBusy(true);
    try {
      await saveVersion(label);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async (id: string) => {
    if (!confirm('Restore this version? Current unsaved changes will be replaced.')) return;
    setBusy(true);
    try {
      await loadVersion(id);
      onRestored?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      width: '220px',
      borderLeft: '1px solid #e0e0e0',
      padding: '12px',
      background: '#f8f9fa',
      overflowY: 'auto',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <h4 style={{ margin: 0 }}>Version History</h4>
        <button onClick={refresh} title="Refresh" style={{ fontSize: '12px' }}>↻</button>
      </div>
      <button onClick={handleSave} disabled={busy} style={{ width: '100%', marginBottom: '12px' }}>
        Save Current Version
      </button>
      {versions.length === 0 && (
        <div style={{ fontSize: '12px', color: '#5f6368' }}>No saved versions yet</div>
      )}
      {versions.map((v) => (
        <div key={v.id} style={{
          marginBottom: '10px',
          padding: '8px',
          background: 'white',
          border: '1px solid #e0e0e0',
          borderRadius: '4px',
        }}>
          <div style={{ fontWeight: 500 }}>{v.label || 'Unnamed version'}</div>
          <small style={{ color: '#5f6368' }}>
            {new Date(v.timestamp).toLocaleString()}
          </small>
          <div>
            <button
              onClick={() => handleRestore(v.id)}
              disabled={busy}
              style={{ marginTop: '4px', fontSize: '12px' }}
            >
              Restore
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

// Test Controls Component
const TestControls: React.FC = () => {
  const { state, dispatch, save } = useSpreadsheetPersisted();
  const [message, setMessage] = useState('');

  const showMessage = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 3000);
  };

  // Loaders dispatch CLEAR_ALL first, so each dataset fully replaces
  // whatever is currently on the sheet
  const loadBasicData = () => {
    dispatch({ type: 'CLEAR_ALL' });

    dispatch({ type: 'SET_CELL', payload: { row: 0, col: 0, data: { value: 'Product', format: { bold: true, background: '#f0f0f0' } } } });
    dispatch({ type: 'SET_CELL', payload: { row: 0, col: 1, data: { value: 'Price', format: { bold: true, background: '#f0f0f0' } } } });
    dispatch({ type: 'SET_CELL', payload: { row: 0, col: 2, data: { value: 'Quantity', format: { bold: true, background: '#f0f0f0' } } } });
    dispatch({ type: 'SET_CELL', payload: { row: 0, col: 3, data: { value: 'Total', format: { bold: true, background: '#f0f0f0' } } } });

    dispatch({ type: 'SET_CELL', payload: { row: 1, col: 0, data: { value: 'Laptop' } } });
    dispatch({ type: 'SET_CELL', payload: { row: 1, col: 1, data: { value: 999.99 } } });
    dispatch({ type: 'SET_CELL', payload: { row: 1, col: 2, data: { value: 5 } } });
    dispatch({ type: 'SET_CELL', payload: { row: 1, col: 3, data: { formula: '=B2*C2' } } });

    dispatch({ type: 'SET_CELL', payload: { row: 2, col: 0, data: { value: 'Mouse' } } });
    dispatch({ type: 'SET_CELL', payload: { row: 2, col: 1, data: { value: 29.99 } } });
    dispatch({ type: 'SET_CELL', payload: { row: 2, col: 2, data: { value: 10 } } });
    dispatch({ type: 'SET_CELL', payload: { row: 2, col: 3, data: { formula: '=B3*C3' } } });

    dispatch({ type: 'SET_CELL', payload: { row: 3, col: 0, data: { value: 'Keyboard' } } });
    dispatch({ type: 'SET_CELL', payload: { row: 3, col: 1, data: { value: 79.99 } } });
    dispatch({ type: 'SET_CELL', payload: { row: 3, col: 2, data: { value: 7 } } });
    dispatch({ type: 'SET_CELL', payload: { row: 3, col: 3, data: { formula: '=B4*C4' } } });

    dispatch({ type: 'SET_CELL', payload: { row: 5, col: 0, data: { value: 'TOTAL:', format: { bold: true } } } });
    dispatch({ type: 'SET_CELL', payload: { row: 5, col: 3, data: { formula: '=SUM(D2:D4)', format: { bold: true, color: '#1a73e8' } } } });

    showMessage('Loaded basic data');
  };

  const loadFormulaData = () => {
    dispatch({ type: 'CLEAR_ALL' });

    dispatch({ type: 'SET_CELL', payload: { row: 0, col: 0, data: { value: 'Formula Examples', format: { bold: true, fontSize: 16 } } } });

    for (let i = 0; i < 10; i++) {
      dispatch({ type: 'SET_CELL', payload: { row: i + 2, col: 0, data: { value: Math.floor(Math.random() * 100) } } });
      dispatch({ type: 'SET_CELL', payload: { row: i + 2, col: 1, data: { value: Math.floor(Math.random() * 100) } } });
    }

    dispatch({ type: 'SET_CELL', payload: { row: 2, col: 3, data: { value: 'SUM A:', format: { bold: true } } } });
    dispatch({ type: 'SET_CELL', payload: { row: 2, col: 4, data: { formula: '=SUM(A3:A12)' } } });

    dispatch({ type: 'SET_CELL', payload: { row: 3, col: 3, data: { value: 'AVG B:', format: { bold: true } } } });
    dispatch({ type: 'SET_CELL', payload: { row: 3, col: 4, data: { formula: '=AVERAGE(B3:B12)' } } });

    dispatch({ type: 'SET_CELL', payload: { row: 4, col: 3, data: { value: 'MAX:', format: { bold: true } } } });
    dispatch({ type: 'SET_CELL', payload: { row: 4, col: 4, data: { formula: '=MAX(A3:B12)' } } });

    dispatch({ type: 'SET_CELL', payload: { row: 5, col: 3, data: { value: 'MIN:', format: { bold: true } } } });
    dispatch({ type: 'SET_CELL', payload: { row: 5, col: 4, data: { formula: '=MIN(A3:B12)' } } });

    showMessage('Loaded formula examples');
  };

  const loadLargeData = () => {
    dispatch({ type: 'CLEAR_ALL' });

    for (let row = 0; row < 100; row++) {
      for (let col = 0; col < 13; col++) {
        if (row === 0) {
          dispatch({ type: 'SET_CELL', payload: {
            row, col,
            data: { value: `Col ${col + 1}`, format: { bold: true, background: '#e8eaed' } },
          }});
        } else if (col === 0) {
          dispatch({ type: 'SET_CELL', payload: {
            row, col,
            data: { value: `Row ${row}`, format: { bold: true, background: '#e8eaed' } },
          }});
        } else {
          dispatch({ type: 'SET_CELL', payload: {
            row, col,
            data: { value: row * 100 + col },
          }});
        }
      }
    }

    showMessage('Loaded 100x13 grid');
  };

  const clearAll = async () => {
    if (!confirm('Clear all data? This cannot be undone (except via undo).')) return;
    dispatch({ type: 'CLEAR_ALL' });
    // Wait a frame so the reducer result has rendered before saving,
    // otherwise the pre-clear snapshot would be persisted
    await new Promise((r) => setTimeout(r, 50));
    await save();
    showMessage('Cleared all data');
  };

  const saveNow = async () => {
    const result = await save();
    showMessage(result.success ? 'Saved successfully' : 'Save failed');
  };

  return (
    <div style={{
      background: 'white',
      padding: '8px 20px',
      borderBottom: '1px solid #e0e0e0',
      display: 'flex',
      gap: '20px',
      alignItems: 'center',
      flexWrap: 'wrap'
    }}>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button onClick={loadBasicData}>Load Basic</button>
        <button onClick={loadFormulaData}>Load Formulas</button>
        <button onClick={loadLargeData}>Load Large</button>
        <button onClick={clearAll} style={{ background: '#ea4335', color: 'white' }}>Clear</button>
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        <button onClick={saveNow} style={{ background: '#34a853', color: 'white' }}>Save Now</button>
      </div>

      {message && (
        <div style={{
          padding: '6px 12px',
          background: '#323232',
          color: 'white',
          borderRadius: '4px',
          fontSize: '13px'
        }}>
          {message}
        </div>
      )}

      <div style={{ marginLeft: 'auto', fontSize: '13px', color: '#5f6368' }}>
        Cells: {state.data.size} |
        Selected: {state.selection.active ?
          `${String.fromCharCode(65 + state.selection.active.col)}${state.selection.active.row + 1}` :
          'None'}
      </div>
    </div>
  );
};

// Main App Component
const TestApp: React.FC = () => {
  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        padding: '10px 20px'
      }}>
        <h1 style={{ fontSize: '20px', margin: 0 }}>OpenSheets Demo</h1>
      </div>

      <TestControls />
      <PersistenceStatus />
      <FormattingToolbar />
      <FormulaBar />

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <SpreadsheetTableOptimized />
        </div>
        <VersionHistory />
      </div>
    </div>
  );
};

// App with Provider
export default function App() {
  return (
    <SpreadsheetProviderPersisted
      spreadsheetId="test-spreadsheet"
      persistenceMode="local"
      autoSave={true}
      autoSaveInterval={5000}
      maxRows={1000}
      maxCols={100}
    >
      <TestApp />
    </SpreadsheetProviderPersisted>
  );
}
