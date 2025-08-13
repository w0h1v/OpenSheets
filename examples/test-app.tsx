import React, { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import {
  SpreadsheetProviderPersisted,
  SpreadsheetTableOptimized,
  FormulaBar,
  FormattingToolbar,
  PersistenceStatus,
  useSpreadsheetPersisted,
  keyOf
} from '../src/spreadsheet/indexEnhanced';
import { CellData } from '../src/spreadsheet/types/spreadsheet';
import { exportToCSV, importFromCSV } from '../src/spreadsheet/utils/csvUtils';
import { exportToExcel, importFromExcel } from '../src/spreadsheet/utils/excelUtils';
import './test-app.css';

// Test data generators
const generateBasicData = (): Map<string, CellData> => {
  const data = new Map<string, CellData>();
  
  // Headers
  data.set(keyOf(0, 0), { value: 'Product', format: { bold: true, background: '#f0f0f0' } });
  data.set(keyOf(0, 1), { value: 'Price', format: { bold: true, background: '#f0f0f0' } });
  data.set(keyOf(0, 2), { value: 'Quantity', format: { bold: true, background: '#f0f0f0' } });
  data.set(keyOf(0, 3), { value: 'Total', format: { bold: true, background: '#f0f0f0' } });
  
  // Sample products
  const products = [
    ['Laptop', 999.99, 5],
    ['Mouse', 29.99, 10],
    ['Keyboard', 79.99, 7],
    ['Monitor', 299.99, 3],
    ['Webcam', 59.99, 8]
  ];
  
  products.forEach((product, index) => {
    const row = index + 1;
    data.set(keyOf(row, 0), { value: product[0] as string });
    data.set(keyOf(row, 1), { value: product[1] as number });
    data.set(keyOf(row, 2), { value: product[2] as number });
    data.set(keyOf(row, 3), { formula: `=B${row + 1}*C${row + 1}` });
  });
  
  // Summary row
  data.set(keyOf(7, 0), { value: 'Total:', format: { bold: true } });
  data.set(keyOf(7, 3), { formula: '=SUM(D2:D6)', format: { bold: true, color: '#1a73e8' } });
  
  return data;
};

const generateFormulaData = (): Map<string, CellData> => {
  const data = new Map<string, CellData>();
  
  // Title
  data.set(keyOf(0, 0), { 
    value: 'Formula Showcase', 
    format: { bold: true, fontSize: 16, color: '#1a73e8' } 
  });
  
  // Generate random numbers
  data.set(keyOf(2, 0), { value: 'Dataset A', format: { bold: true } });
  data.set(keyOf(2, 1), { value: 'Dataset B', format: { bold: true } });
  
  for (let i = 0; i < 20; i++) {
    data.set(keyOf(3 + i, 0), { value: Math.floor(Math.random() * 100) });
    data.set(keyOf(3 + i, 1), { value: Math.floor(Math.random() * 100) });
  }
  
  // Statistical functions
  const stats = [
    ['SUM A:', '=SUM(A4:A23)'],
    ['SUM B:', '=SUM(B4:B23)'],
    ['AVG A:', '=AVERAGE(A4:A23)'],
    ['AVG B:', '=AVERAGE(B4:B23)'],
    ['MAX:', '=MAX(A4:B23)'],
    ['MIN:', '=MIN(A4:B23)'],
    ['COUNT:', '=COUNT(A4:B23)'],
    ['MEDIAN A:', '=MEDIAN(A4:A23)']
  ];
  
  data.set(keyOf(2, 3), { value: 'Statistics', format: { bold: true, background: '#e8f0fe' } });
  data.set(keyOf(2, 4), { value: 'Result', format: { bold: true, background: '#e8f0fe' } });
  
  stats.forEach((stat, index) => {
    data.set(keyOf(3 + index, 3), { value: stat[0] });
    data.set(keyOf(3 + index, 4), { formula: stat[1], format: { color: '#188038' } });
  });
  
  // Date functions
  data.set(keyOf(12, 3), { value: 'Today:', format: { bold: true } });
  data.set(keyOf(12, 4), { formula: '=TODAY()' });
  
  // Logical functions
  data.set(keyOf(14, 3), { value: 'IF Example:', format: { bold: true } });
  data.set(keyOf(14, 4), { formula: '=IF(A4>50,"High","Low")' });
  
  // Text functions
  data.set(keyOf(16, 3), { value: 'Concatenate:', format: { bold: true } });
  data.set(keyOf(16, 4), { formula: '=CONCATENATE("Total: ",SUM(A4:A23))' });
  
  return data;
};

const generateLargeData = (): Map<string, CellData> => {
  const data = new Map<string, CellData>();
  
  // Create a 100x100 grid
  for (let row = 0; row < 100; row++) {
    for (let col = 0; col < 100; col++) {
      if (row === 0) {
        // Column headers
        data.set(keyOf(row, col), { 
          value: `Col ${String.fromCharCode(65 + (col % 26))}${Math.floor(col / 26)}`, 
          format: { bold: true, background: '#e8eaed', align: 'center' } 
        });
      } else if (col === 0) {
        // Row headers
        data.set(keyOf(row, col), { 
          value: `Row ${row}`, 
          format: { bold: true, background: '#e8eaed' } 
        });
      } else {
        // Data cells with some formulas
        if ((row + col) % 10 === 0) {
          // Every 10th cell is a formula
          data.set(keyOf(row, col), { 
            formula: `=ROW()*COLUMN()` 
          });
        } else {
          data.set(keyOf(row, col), { 
            value: row * 100 + col 
          });
        }
      }
    }
  }
  
  return data;
};

// Test controls component
const TestControls: React.FC = () => {
  const { 
    state, 
    dispatch, 
    save, 
    saveVersion, 
    syncStatus 
  } = useSpreadsheetPersisted();
  
  const [autoSaveInterval, setAutoSaveInterval] = useState(3000);
  const [showStats, setShowStats] = useState(false);

  const loadSampleData = useCallback((type: 'basic' | 'formulas' | 'large') => {
    let data: Map<string, CellData>;
    
    switch (type) {
      case 'basic':
        data = generateBasicData();
        break;
      case 'formulas':
        data = generateFormulaData();
        break;
      case 'large':
        data = generateLargeData();
        break;
    }
    
    dispatch({ type: 'LOAD_STATE' as any, payload: { data } });
    showToast(`Loaded ${type} dataset`);
  }, [dispatch]);

  const clearAll = useCallback(() => {
    if (confirm('Clear all data? This action cannot be undone.')) {
      dispatch({ type: 'CLEAR_ALL' });
      showToast('Cleared all data');
    }
  }, [dispatch]);

  const testFormatting = useCallback(() => {
    if (!state.selection.active) {
      showToast('Please select a cell first');
      return;
    }
    
    const { row, col } = state.selection.active;
    const formats = [
      { bold: true, italic: true, color: '#ea4335', background: '#fce4ec' },
      { fontSize: 18, color: '#1a73e8', underline: true },
      { background: '#34a853', color: 'white', bold: true },
      { strikethrough: true, italic: true, color: '#5f6368' }
    ];
    
    const randomFormat = formats[Math.floor(Math.random() * formats.length)];
    
    dispatch({
      type: 'SET_CELL',
      payload: {
        row,
        col,
        data: {
          value: 'Formatted Text',
          format: randomFormat
        }
      }
    });
    
    showToast('Applied random formatting');
  }, [state.selection, dispatch]);

  const testValidation = useCallback(() => {
    if (!state.selection.active) {
      showToast('Please select a cell first');
      return;
    }
    
    const { row, col } = state.selection.active;
    
    dispatch({
      type: 'SET_VALIDATION',
      payload: {
        row,
        col,
        validation: {
          type: 'number',
          min: 0,
          max: 100,
          errorMessage: 'Please enter a number between 0 and 100'
        }
      }
    });
    
    showToast('Added validation: 0-100');
  }, [state.selection, dispatch]);

  const handleExport = useCallback(async (format: 'csv' | 'excel') => {
    if (format === 'csv') {
      exportToCSV(state.data, state.maxRows, state.maxCols, 'spreadsheet.csv');
      showToast('Exported to CSV');
    } else {
      await exportToExcel(state.data, state.maxRows, state.maxCols, 'spreadsheet.xlsx');
      showToast('Exported to Excel');
    }
  }, [state]);

  const handleImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.xlsx,.xls';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      try {
        let importedData;
        if (file.name.endsWith('.csv')) {
          importedData = await importFromCSV(file);
        } else {
          importedData = await importFromExcel(file);
        }
        
        dispatch({ type: 'LOAD_STATE' as any, payload: { data: importedData.data } });
        showToast(`Imported ${file.name}`);
      } catch (error) {
        showToast(`Import failed: ${error}`);
      }
    };
    input.click();
  }, [dispatch]);

  const saveManually = useCallback(async () => {
    const result = await save();
    if (result.success) {
      showToast('Saved successfully');
    } else {
      showToast(`Save failed: ${result.error}`);
    }
  }, [save]);

  const createVersion = useCallback(async () => {
    const label = prompt('Enter version label:');
    if (label) {
      await saveVersion(label);
      showToast(`Created version: ${label}`);
    }
  }, [saveVersion]);

  return (
    <div className="test-controls">
      <div className="control-group">
        <label>Sample Data:</label>
        <button onClick={() => loadSampleData('basic')}>Basic</button>
        <button onClick={() => loadSampleData('formulas')}>Formulas</button>
        <button onClick={() => loadSampleData('large')}>Large (100x100)</button>
        <button onClick={clearAll} className="danger">Clear All</button>
      </div>

      <div className="control-group">
        <label>Test Features:</label>
        <button onClick={testFormatting}>Formatting</button>
        <button onClick={testValidation}>Validation</button>
        <button onClick={() => setShowStats(!showStats)}>
          {showStats ? 'Hide' : 'Show'} Stats
        </button>
      </div>

      <div className="control-group">
        <label>Import/Export:</label>
        <button onClick={handleImport}>Import</button>
        <button onClick={() => handleExport('csv')}>Export CSV</button>
        <button onClick={() => handleExport('excel')}>Export Excel</button>
      </div>

      <div className="control-group">
        <label>Persistence:</label>
        <button onClick={saveManually} className="success">Save Now</button>
        <button onClick={createVersion}>Create Version</button>
        <select 
          value={autoSaveInterval} 
          onChange={(e) => setAutoSaveInterval(Number(e.target.value))}
        >
          <option value="0">No auto-save</option>
          <option value="3000">3 seconds</option>
          <option value="5000">5 seconds</option>
          <option value="10000">10 seconds</option>
        </select>
      </div>

      {showStats && (
        <div className="stats-panel">
          <span>Cells: {state.data.size}</span>
          <span>Selected: {state.selection.active ? 
            `${String.fromCharCode(65 + state.selection.active.col)}${state.selection.active.row + 1}` : 
            'None'}</span>
          <span>Status: {syncStatus.syncing ? '⟳ Saving...' : 
            syncStatus.pendingChanges > 0 ? `${syncStatus.pendingChanges} unsaved` : 
            '✓ Saved'}</span>
        </div>
      )}
    </div>
  );
};

// Info panel component
const InfoPanel: React.FC = () => {
  const [show, setShow] = useState(false);

  return (
    <>
      <button 
        className="info-button" 
        onClick={() => setShow(!show)}
      >
        ℹ️ Help & Shortcuts
      </button>
      
      {show && (
        <div className="info-panel">
          <button className="close-button" onClick={() => setShow(false)}>×</button>
          
          <h3>Keyboard Shortcuts</h3>
          <div className="shortcuts">
            <div><kbd>↑↓←→</kbd> Navigate</div>
            <div><kbd>Enter</kbd> Edit cell</div>
            <div><kbd>Tab</kbd> Next cell</div>
            <div><kbd>F2</kbd> Edit in place</div>
            <div><kbd>Escape</kbd> Cancel</div>
            <div><kbd>Delete</kbd> Clear cell</div>
            <div><kbd>Ctrl+C</kbd> Copy</div>
            <div><kbd>Ctrl+V</kbd> Paste</div>
            <div><kbd>Ctrl+Z</kbd> Undo</div>
            <div><kbd>Ctrl+Y</kbd> Redo</div>
            <div><kbd>Ctrl+S</kbd> Save</div>
            <div><kbd>Ctrl+A</kbd> Select all</div>
          </div>
          
          <h3>Formula Examples</h3>
          <ul>
            <li><code>=SUM(A1:A10)</code></li>
            <li><code>=AVERAGE(B:B)</code></li>
            <li><code>=IF(A1&gt;10,"Yes","No")</code></li>
            <li><code>=VLOOKUP(A1,D:E,2,0)</code></li>
            <li><code>=TODAY()</code></li>
            <li><code>=CONCATENATE(A1," ",B1)</code></li>
          </ul>
          
          <h3>Tips</h3>
          <ul>
            <li>Double-click cell borders to auto-resize</li>
            <li>Drag fill handle to copy formulas</li>
            <li>Right-click for context menu</li>
            <li>Shift+Click to select range</li>
            <li>Ctrl+Click for multi-select</li>
          </ul>
        </div>
      )}
    </>
  );
};

// Toast notification
let toastTimeout: NodeJS.Timeout;
function showToast(message: string) {
  const toast = document.getElementById('toast');
  if (!toast) {
    const newToast = document.createElement('div');
    newToast.id = 'toast';
    newToast.className = 'toast';
    document.body.appendChild(newToast);
  }
  
  const toastEl = document.getElementById('toast')!;
  toastEl.textContent = message;
  toastEl.classList.add('show');
  
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toastEl.classList.remove('show');
  }, 3000);
}

// Main test application
const TestApplication: React.FC = () => {
  return (
    <>
      <TestControls />
      <PersistenceStatus />
      <FormattingToolbar />
      <FormulaBar />
      <div className="spreadsheet-container">
        <SpreadsheetTableOptimized />
      </div>
      <InfoPanel />
    </>
  );
};

// App wrapper with persistence
const App: React.FC = () => {
  return (
    <SpreadsheetProviderPersisted
      spreadsheetId="test-spreadsheet"
      persistenceMode="local"
      autoSave={true}
      autoSaveInterval={3000}
      maxRows={1000}
      maxCols={100}
      onSyncStatusChange={(status) => {
        console.log('Sync status:', status);
      }}
      onSaveComplete={(result) => {
        if (result.success) {
          console.log('Saved at', new Date(result.timestamp));
        } else {
          console.error('Save failed:', result.error);
        }
      }}
      onLoadComplete={(success) => {
        if (success) {
          showToast('Loaded saved spreadsheet');
        }
      }}
    >
      <TestApplication />
    </SpreadsheetProviderPersisted>
  );
};

// Mount the app
const container = document.getElementById('root');
if (container) {
  const root = ReactDOM.createRoot(container);
  root.render(<App />);
}

// Export for browser console access
(window as any).OpenSheets = {
  showToast,
  generateBasicData,
  generateFormulaData,
  generateLargeData
};