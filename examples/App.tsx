import React, { useState, useCallback, useEffect } from 'react';
import {
  SpreadsheetProviderPersisted,
  useSpreadsheetPersisted,
  SpreadsheetTableOptimized,
  FormulaBar,
  FormattingToolbar,
} from '../src/spreadsheet/indexEnhanced';
import '../src/spreadsheet/styles/tokens.css';
import { useTheme } from '../src/spreadsheet/hooks/useTheme';
import {
  GridGlyphIcon, SunIcon, MoonIcon, HistoryIcon, AddSheetIcon,
} from '../src/spreadsheet/components/icons';
import { keyOf } from '../src/spreadsheet/types/spreadsheet';
import './chrome.css';

interface VersionEntry {
  id: string;
  label?: string;
  timestamp: number;
}

/* ---------------- Version history (right panel) ---------------- */

const VersionHistory: React.FC<{ onClose: () => void }> = ({ onClose }) => {
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
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="versionPanel">
      <div className="versionPanelHeader">
        <h4>Version history</h4>
        <button onClick={onClose} title="Close">✕</button>
      </div>
      <button className="versionSave" onClick={handleSave} disabled={busy}>
        Save current version
      </button>
      {versions.length === 0 && <div className="versionEmpty">No saved versions yet</div>}
      {versions.map((v) => (
        <div key={v.id} className="versionCard">
          <div className="versionLabel">{v.label || 'Unnamed version'}</div>
          <small>{new Date(v.timestamp).toLocaleString()}</small>
          <button onClick={() => handleRestore(v.id)} disabled={busy}>Restore</button>
        </div>
      ))}
    </aside>
  );
};

/* ---------------- Dev drawer (test controls) ---------------- */

const DevDrawer: React.FC = () => {
  const { state, dispatch, save } = useSpreadsheetPersisted();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');

  const showMessage = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 3000);
  };

  // Loaders replace the sheet (CLEAR_ALL first)
  const loadBasicData = () => {
    dispatch({ type: 'CLEAR_ALL' });
    dispatch({ type: 'SET_CELL', payload: { row: 0, col: 0, data: { value: 'Product', format: { bold: true } } } });
    dispatch({ type: 'SET_CELL', payload: { row: 0, col: 1, data: { value: 'Price', format: { bold: true } } } });
    dispatch({ type: 'SET_CELL', payload: { row: 0, col: 2, data: { value: 'Quantity', format: { bold: true } } } });
    dispatch({ type: 'SET_CELL', payload: { row: 0, col: 3, data: { value: 'Total', format: { bold: true } } } });
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
    dispatch({ type: 'SET_CELL', payload: { row: 5, col: 3, data: { formula: '=SUM(D2:D4)', format: { bold: true } } } });
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
    dispatch({ type: 'SET_CELL', payload: { row: 7, col: 3, data: { value: 'Today:', format: { bold: true } } } });
    dispatch({ type: 'SET_CELL', payload: { row: 7, col: 4, data: { formula: '=TODAY()' } } });
    showMessage('Loaded formula examples');
  };

  const loadLargeData = () => {
    dispatch({ type: 'CLEAR_ALL' });
    for (let row = 0; row < 100; row++) {
      for (let col = 0; col < 13; col++) {
        if (row === 0) {
          dispatch({ type: 'SET_CELL', payload: { row, col, data: { value: `Col ${col + 1}`, format: { bold: true } } } });
        } else if (col === 0) {
          dispatch({ type: 'SET_CELL', payload: { row, col, data: { value: `Row ${row}`, format: { bold: true } } } });
        } else {
          dispatch({ type: 'SET_CELL', payload: { row, col, data: { value: row * 100 + col } } });
        }
      }
    }
    showMessage('Loaded 100x13 grid');
  };

  const clearAll = async () => {
    if (!confirm('Clear all data?')) return;
    dispatch({ type: 'CLEAR_ALL' });
    await new Promise((r) => setTimeout(r, 50));
    await save();
    showMessage('Cleared all data');
  };

  const saveNow = async () => {
    const result = await save();
    showMessage(result.success ? 'Saved' : 'Save failed');
  };

  return (
    <div className="devDrawer">
      <button className="devToggle" onClick={() => setOpen(!open)} title="Dev/test controls">
        Dev {open ? '▾' : '▸'}
      </button>
      {open && (
        <div className="devBody">
          <button onClick={loadBasicData}>Load Basic</button>
          <button onClick={loadFormulaData}>Load Formulas</button>
          <button onClick={loadLargeData}>Load Large</button>
          <button className="danger" onClick={clearAll}>Clear</button>
          <button className="primary" onClick={saveNow}>Save Now</button>
          <span className="devMeta">Cells: {state.data.size}</span>
          {message && <span className="devToast">{message}</span>}
        </div>
      )}
    </div>
  );
};

/* ---------------- Sheet tabs + selection stats ---------------- */

const SHEET_LIST_KEY = 'opensheets_demo_sheet_list';
interface SheetMeta { id: string; name: string }

const loadSheetList = (): SheetMeta[] => {
  try {
    const raw = localStorage.getItem(SHEET_LIST_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* fall through */ }
  return [{ id: 'test-spreadsheet', name: 'Sheet1' }];
};

const SelectionStats: React.FC = () => {
  const { state } = useSpreadsheetPersisted();
  const range = state.selection.ranges[0];
  if (!range) return <span />;

  const startRow = Math.min(range.startRow, range.endRow);
  const endRow = Math.max(range.startRow, range.endRow);
  const startCol = Math.min(range.startCol, range.endCol);
  const endCol = Math.max(range.startCol, range.endCol);
  const nums: number[] = [];
  for (let r = startRow; r <= endRow; r++) {
    for (let c = startCol; c <= endCol; c++) {
      const v = state.data.get(keyOf(r, c))?.value;
      if (typeof v === 'number') nums.push(v);
    }
  }
  if (!nums.length) return <span />;
  const sum = nums.reduce((a, b) => a + b, 0);
  const avg = sum / nums.length;
  return (
    <span>
      Sum {Math.round(sum * 100) / 100} · Avg {Math.round(avg * 100) / 100} · Count {nums.length}
    </span>
  );
};

/* ---------------- App shell ---------------- */

// Header lives inside the provider so it can read sync status; theme and
// history visibility are owned by the shell and passed down
const HeaderBar: React.FC<{
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  showHistory: boolean;
  onToggleHistory: () => void;
}> = ({ theme, toggleTheme, showHistory, onToggleHistory }) => {
  const { syncStatus } = useSpreadsheetPersisted();
  const savedLabel = syncStatus.syncing ? 'Saving…' : 'Saved';

  return (
    <header className="appHeader">
      <div className="logo"><GridGlyphIcon /></div>
      <div className="titleBlock">
        <div className="titleRow">
          <span className="title">Untitled spreadsheet</span>
          <span className="saved">{savedLabel}</span>
        </div>
        <nav className="menuRow">
          {['File', 'Edit', 'View', 'Insert', 'Format', 'Data', 'Help'].map((m) => (
            <button key={m} className="menuItem" title={`${m} (menus coming soon)`}>{m}</button>
          ))}
        </nav>
      </div>
      <div className="headerActions">
        <button className="headerIconBtn" onClick={toggleTheme} title="Toggle dark mode">
          {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
        </button>
        <button
          className={`headerIconBtn ${showHistory ? 'active' : ''}`}
          onClick={onToggleHistory}
          title="Version history"
        >
          <HistoryIcon />
        </button>
        <button className="shareButton" title="Share (coming soon)">Share</button>
      </div>
    </header>
  );
};

const AppShell: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const [showHistory, setShowHistory] = useState(false);
  const [sheets, setSheets] = useState<SheetMeta[]>(loadSheetList);
  const [activeId, setActiveId] = useState(() => loadSheetList()[0].id);

  const persistSheets = (list: SheetMeta[]) => {
    setSheets(list);
    try {
      localStorage.setItem(SHEET_LIST_KEY, JSON.stringify(list));
    } catch { /* ignore quota errors */ }
  };

  const addSheet = () => {
    const sheet = { id: `sheet-${Date.now()}`, name: `Sheet${sheets.length + 1}` };
    persistSheets([...sheets, sheet]);
    setActiveId(sheet.id);
  };

  const removeSheet = (id: string) => {
    if (sheets.length <= 1) return;
    if (!confirm('Delete this sheet and its saved data?')) return;
    const remaining = sheets.filter((sh) => sh.id !== id);
    persistSheets(remaining);
    if (activeId === id) setActiveId(remaining[0].id);
    try { localStorage.removeItem(`opensheets_${id}`); } catch { /* ignore */ }
  };

  const renameSheet = (id: string) => {
    const sheet = sheets.find((sh) => sh.id === id);
    const name = prompt('Sheet name:', sheet?.name);
    if (!name || !sheet) return;
    persistSheets(sheets.map((sh) => (sh.id === id ? { ...sh, name } : sh)));
  };

  return (
    <div className="appShell">
      {/* key remounts the provider so each sheet loads its own persisted state */}
      <SpreadsheetProviderPersisted
        key={activeId}
        spreadsheetId={activeId}
        persistenceMode="local"
        autoSave={true}
        autoSaveInterval={5000}
        maxRows={1000}
        maxCols={100}
      >
        <HeaderBar
          theme={theme}
          toggleTheme={toggleTheme}
          showHistory={showHistory}
          onToggleHistory={() => setShowHistory(!showHistory)}
        />
        <FormattingToolbar />
        <FormulaBar />

        <div className="mainArea">
          <div className="gridArea">
            <SpreadsheetTableOptimized />
          </div>
          {showHistory && <VersionHistory onClose={() => setShowHistory(false)} />}
        </div>

        <footer className="tabBar">
          <button className="addSheet" onClick={addSheet} title="Add sheet"><AddSheetIcon size={14} /></button>
          <div className="tabs">
            {sheets.map((sh) => (
              <div
                key={sh.id}
                className={`tab ${sh.id === activeId ? 'active' : ''}`}
                onClick={() => setActiveId(sh.id)}
                onDoubleClick={() => renameSheet(sh.id)}
                title="Double-click to rename"
              >
                {sh.name}
                {sheets.length > 1 && (
                  <span
                    className="tabClose"
                    onClick={(e) => { e.stopPropagation(); removeSheet(sh.id); }}
                    title="Delete sheet"
                  >
                    ×
                  </span>
                )}
              </div>
            ))}
          </div>
          <div className="stats"><SelectionStats /></div>
        </footer>

        <DevDrawer />
      </SpreadsheetProviderPersisted>
    </div>
  );
};

export default function App() {
  return <AppShell />;
}
