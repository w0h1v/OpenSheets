import React, { useState, useCallback } from 'react';
import {
  SpreadsheetProviderPersisted,
  PersistenceStatus,
  useSpreadsheetPersisted,
  keyOf
} from '../src/spreadsheet/indexEnhanced';
import { CellData } from '../src/spreadsheet/types/spreadsheet';
import { FormattingToolbar } from './components/FormattingToolbarWrapper';
import { FormulaBar } from './components/FormulaBarWrapper';
import { SpreadsheetTableOptimized } from './components/ResizableSpreadsheetTable';

// Test Controls Component
const TestControls: React.FC = () => {
  const { state, dispatch, save, saveVersion } = useSpreadsheetPersisted();
  const [message, setMessage] = useState('');

  const showMessage = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 3000);
  };

  const loadBasicData = () => {
    // Clear existing data first
    dispatch({ type: 'CLEAR_ALL' });
    
    // Headers - use dispatch to set individual cells
    dispatch({ type: 'SET_CELL', payload: { row: 0, col: 0, data: { value: 'Product', format: { bold: true, background: '#f0f0f0' } } } });
    dispatch({ type: 'SET_CELL', payload: { row: 0, col: 1, data: { value: 'Price', format: { bold: true, background: '#f0f0f0' } } } });
    dispatch({ type: 'SET_CELL', payload: { row: 0, col: 2, data: { value: 'Quantity', format: { bold: true, background: '#f0f0f0' } } } });
    dispatch({ type: 'SET_CELL', payload: { row: 0, col: 3, data: { value: 'Total', format: { bold: true, background: '#f0f0f0' } } } });
    
    // Products
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
    
    // Total
    dispatch({ type: 'SET_CELL', payload: { row: 5, col: 0, data: { value: 'TOTAL:', format: { bold: true } } } });
    dispatch({ type: 'SET_CELL', payload: { row: 5, col: 3, data: { formula: '=SUM(D2:D4)', format: { bold: true, color: '#1a73e8' } } } });
    
    showMessage('Loaded basic data');
  };

  const loadFormulaData = () => {
    dispatch({ type: 'CLEAR_ALL' });
    
    dispatch({ type: 'SET_CELL', payload: { row: 0, col: 0, data: { value: 'Formula Examples', format: { bold: true, fontSize: 16 } } } });
    
    // Random numbers
    for (let i = 0; i < 10; i++) {
      dispatch({ type: 'SET_CELL', payload: { row: i + 2, col: 0, data: { value: Math.floor(Math.random() * 100) } } });
      dispatch({ type: 'SET_CELL', payload: { row: i + 2, col: 1, data: { value: Math.floor(Math.random() * 100) } } });
    }
    
    // Formulas
    dispatch({ type: 'SET_CELL', payload: { row: 2, col: 3, data: { value: 'SUM A:', format: { bold: true } } } });
    dispatch({ type: 'SET_CELL', payload: { row: 2, col: 4, data: { formula: '=SUM(A3:A12)' } } });
    
    dispatch({ type: 'SET_CELL', payload: { row: 3, col: 3, data: { value: 'AVG B:', format: { bold: true } } } });
    dispatch({ type: 'SET_CELL', payload: { row: 3, col: 4, data: { formula: '=AVERAGE(B3:B12)' } } });
    
    dispatch({ type: 'SET_CELL', payload: { row: 4, col: 3, data: { value: 'MAX:', format: { bold: true } } } });
    dispatch({ type: 'SET_CELL', payload: { row: 4, col: 4, data: { formula: '=MAX(A3:B12)' } } });
    
    dispatch({ type: 'SET_CELL', payload: { row: 5, col: 3, data: { value: 'MIN:', format: { bold: true } } } });
    dispatch({ type: 'SET_CELL', payload: { row: 5, col: 4, data: { formula: '=MIN(A3:B12)' } } });
    
    dispatch({ type: 'SET_CELL', payload: { row: 7, col: 3, data: { value: 'Today:', format: { bold: true } } } });
    dispatch({ type: 'SET_CELL', payload: { row: 7, col: 4, data: { formula: '=TODAY()' } } });
    
    showMessage('Loaded formula examples');
  };

  const loadLargeData = () => {
    dispatch({ type: 'CLEAR_ALL' });
    
    // Only load visible portion for performance
    for (let row = 0; row < 50; row++) {
      for (let col = 0; col < 26; col++) {
        if (row === 0) {
          dispatch({ type: 'SET_CELL', payload: { 
            row, 
            col, 
            data: { 
              value: `Col ${col + 1}`, 
              format: { bold: true, background: '#e8eaed' } 
            }
          }});
        } else if (col === 0) {
          dispatch({ type: 'SET_CELL', payload: { 
            row, 
            col, 
            data: { 
              value: `Row ${row}`, 
              format: { bold: true, background: '#e8eaed' } 
            }
          }});
        } else {
          dispatch({ type: 'SET_CELL', payload: { 
            row, 
            col, 
            data: { value: row * 100 + col }
          }});
        }
      }
    }
    
    showMessage('Loaded large grid');
  };

  const clearAll = () => {
    if (confirm('Clear all data?')) {
      dispatch({ type: 'CLEAR_ALL' });
      showMessage('Cleared all data');
    }
  };

  const saveNow = async () => {
    const result = await save();
    if (result.success) {
      showMessage('Saved successfully');
    } else {
      showMessage('Save failed');
    }
  };

  const createVersion = async () => {
    const label = prompt('Version label:');
    if (label) {
      await saveVersion(label);
      showMessage(`Created version: ${label}`);
    }
  };

  return (
    <div style={{
      background: 'white',
      padding: '12px 20px',
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
        <button onClick={clearAll} style={{ background: '#ea4335' }}>Clear</button>
      </div>
      
      <div style={{ display: 'flex', gap: '8px' }}>
        <button onClick={saveNow} style={{ background: '#34a853' }}>Save Now</button>
        <button onClick={createVersion}>Version</button>
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
        padding: '16px 20px'
      }}>
        <h1 style={{ fontSize: '24px', margin: 0 }}>OpenSheets Test Application</h1>
        <p style={{ fontSize: '14px', margin: '4px 0 0 0', opacity: 0.9 }}>
          Full-featured spreadsheet with LocalStorage persistence
        </p>
      </div>
      
      <TestControls />
      <PersistenceStatus />
      <FormattingToolbar />
      <FormulaBar />
      
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <SpreadsheetTableOptimized />
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