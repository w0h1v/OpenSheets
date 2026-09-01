import React, { useState, useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
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
import { DropdownMenu, MenuEntry } from '../src/spreadsheet/components/Menu';
import { FindReplaceBar } from '../src/spreadsheet/components/FindReplaceBar';
import { ChartPanel } from '../src/spreadsheet/components/ChartPanel';
import { useCollaboration } from '../src/spreadsheet/collaboration/useCollaboration';
import {
  subscribeCollab, getCollabUsers, getCollabToasts, CollabUser,
} from '../src/spreadsheet/collaboration/presenceStore';
import { keyOf } from '../src/spreadsheet/types/spreadsheet';
import { downloadCSV } from '../src/spreadsheet/utils/csvUtils';
import { exportToExcel } from '../src/spreadsheet/utils/excelUtils';
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

/* ---------------- Collaboration ---------------- */

// Applies/streams collaboration state; renders nothing
const CollabLayer: React.FC<{ sheetId: string }> = ({ sheetId }) => {
  const { state, dispatch } = useSpreadsheetPersisted();
  const stateRef = useRef(state);
  stateRef.current = state;
  useCollaboration({
    sheetId,
    getState: () => stateRef.current,
    dispatch,
  });
  return null;
};

const AvatarStack: React.FC = () => {
  const users = useSyncExternalStore(subscribeCollab, getCollabUsers);
  if (!users.length) return null;
  return (
    <div className="avatarStack" title={users.map((u) => u.name).join(', ')}>
      {users.slice(0, 4).map((u: CollabUser) => (
        <span key={u.id} className="avatar" style={{ background: u.color }} title={u.name}>
          {u.name[0].toUpperCase()}
        </span>
      ))}
      {users.length > 4 && <span className="avatar avatarMore">+{users.length - 4}</span>}
    </div>
  );
};

const CollabToasts: React.FC = () => {
  const toasts = useSyncExternalStore(subscribeCollab, getCollabToasts);
  if (!toasts.length) return null;
  return (
    <div className="toastStack">
      {toasts.map((t) => (
        <div key={t.id} className="toast" style={{ borderColor: t.color }}>
          <span className="toastDot" style={{ background: t.color }} />
          {t.text}
        </div>
      ))}
    </div>
  );
};

// Sheet tab presence hint: shows who else is editing this sheet
const TabPresence: React.FC<{ sheetId: string; activeSheet: string }> = ({ sheetId, activeSheet }) => {
  const users = useSyncExternalStore(subscribeCollab, getCollabUsers);
  const here = users.filter((u) => u.sheetId === sheetId && sheetId !== activeSheet);
  if (!here.length) return null;
  return (
    <span className="tabPresence" title={`${here.map((u) => u.name).join(', ')} editing`}>
      {here.map((u) => (
        <span key={u.id} className="tabPresenceDot" style={{ background: u.color }} />
      ))}
    </span>
  );
};

/* ---------------- Menu bar + dialogs ---------------- */

const ShortcutsDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div className="dialogBackdrop" onMouseDown={onClose}>
    <div className="dialog" onMouseDown={(e) => e.stopPropagation()}>
      <div className="dialogHeader">
        <h3>Keyboard shortcuts</h3>
        <button onClick={onClose} title="Close">✕</button>
      </div>
      <div className="shortcutGrid">
        {[
          ['Move selection', 'Arrows / Tab / Shift+Tab'],
          ['Jump to data edge', 'Ctrl/Cmd + Arrow'],
          ['Select all', 'Ctrl/Cmd + A'],
          ['Start editing', 'Type text, Enter, or F2'],
          ['Commit + move down', 'Enter'],
          ['Cancel edit', 'Escape'],
          ['Clear cell', 'Delete / Backspace'],
          ['Copy / Cut / Paste', '⌘C / ⌘X / ⌘V'],
          ['Undo / Redo', '⌘Z / ⌘⇧Z / ⌘Y'],
          ['Fill handle', 'Drag cell corner'],
          ['Extend selection', 'Shift + Arrow / Shift + Click'],
          ['Add to selection', 'Ctrl/Cmd + Click'],
          ['Save', '⌘S'],
        ].map(([action, keys]) => (
          <React.Fragment key={action}>
            <span className="shortcutAction">{action}</span>
            <span className="shortcutKeys">{keys}</span>
          </React.Fragment>
        ))}
      </div>
    </div>
  </div>
);

const ShareDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [role, setRole] = useState<'view' | 'comment' | 'edit'>(() => {
    try { return JSON.parse(localStorage.getItem('opensheets-share-role') || '"edit"'); } catch { return 'edit'; }
  });
  const [copied, setCopied] = useState(false);
  const link = typeof window !== 'undefined' ? window.location.href : '';

  const setAndPersist = (r: typeof role) => {
    setRole(r);
    try { localStorage.setItem('opensheets-share-role', JSON.stringify(r)); } catch { /* ignore */ }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable */ }
  };

  return (
    <div className="dialogBackdrop" onMouseDown={onClose}>
      <div className="dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="dialogHeader">
          <h3>Share spreadsheet</h3>
          <button onClick={onClose} title="Close">✕</button>
        </div>
        <p className="dialogNote">
          This build runs entirely in your browser — the link below points at your local
          demo. In a hosted deployment it would grant the selected access level.
        </p>
        <div className="shareRow">
          <select value={role} onChange={(e) => setAndPersist(e.target.value as typeof role)}>
            <option value="view">Anyone with the link — view</option>
            <option value="comment">Anyone with the link — comment</option>
            <option value="edit">Anyone with the link — edit</option>
          </select>
          <button className="primary" onClick={copyLink}>{copied ? 'Copied!' : 'Copy link'}</button>
        </div>
        <input className="shareLink" readOnly value={link} onFocus={(e) => e.target.select()} />
      </div>
    </div>
  );
};

const MenuBar: React.FC<{
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  onToggleHistory: () => void;
  historyOpen: boolean;
  compact: boolean;
  onToggleCompact: () => void;
  onShare: () => void;
  onShortcuts: () => void;
  onInsertChart: (range: { startRow: number; startCol: number; endRow: number; endCol: number }) => void;
  onFind: () => void;
}> = ({ theme, toggleTheme, onToggleHistory, historyOpen, compact, onToggleCompact, onShare, onShortcuts, onInsertChart, onFind }) => {
  const { state, dispatch, save, saveVersion, undo, redo, canUndo, canRedo } = useSpreadsheetPersisted();
  const csvInputRef = useRef<HTMLInputElement>(null);
  const active = state.selection.active;
  const range = state.selection.ranges[0];

  const importCSV = async (file: File | undefined) => {
    if (!file) return;
    const { importFromCSVFile } = await import('../src/spreadsheet/utils/csvUtils');
    try {
      const result = await importFromCSVFile(file);
      dispatch({ type: 'CLEAR_ALL' });
      const updates: Array<{ row: number; col: number; data: any }> = [];
      result.data.forEach((cell, key) => {
        const [row, col] = key.split(':').map(Number);
        updates.push({ row, col, data: cell });
      });
      dispatch({ type: 'SET_CELLS', payload: { updates } });
    } catch {
      alert('Failed to import CSV');
    }
  };

  const fileMenu: MenuEntry[] = [
    { label: 'New sheet', onClick: () => dispatch({ type: 'CLEAR_ALL' }) },
    { label: 'Save now', shortcut: '⌘S', onClick: () => save() },
    { label: 'Save version', onClick: () => { const l = prompt('Version label:'); if (l) saveVersion(l); } },
    { separator: true, label: '' },
    { label: 'Import CSV…', onClick: () => csvInputRef.current?.click() },
    { label: 'Download as CSV', onClick: () => downloadCSV(state.data, state.maxRows, state.maxCols, 'opensheets.csv') },
    { label: 'Download as Excel', onClick: () => exportToExcel(state.data, state.maxRows, state.maxCols, 'opensheets.xlsx') },
    { separator: true, label: '' },
    { label: 'Version history', checked: historyOpen, onClick: onToggleHistory },
  ];

  const editMenu: MenuEntry[] = [
    { label: 'Undo', shortcut: '⌘Z', disabled: !canUndo, onClick: () => undo() },
    { label: 'Redo', shortcut: '⌘⇧Z', disabled: !canRedo, onClick: () => redo() },
    { separator: true, label: '' },
    { label: 'Cut', shortcut: '⌘X', onClick: () => document.execCommand('cut') },
    { label: 'Copy', shortcut: '⌘C', onClick: () => document.execCommand('copy') },
    { label: 'Paste', shortcut: '⌘V', onClick: () => document.execCommand('paste') },
    { separator: true, label: '' },
    {
      label: 'Find and replace',
      shortcut: '⌘F',
      onClick: onFind,
    },
    { separator: true, label: '' },
    {
      label: 'Delete selection',
      disabled: !range,
      onClick: () => range && dispatch({ type: 'CLEAR_RANGE', payload: { range } }),
    },
    { label: 'Select all', shortcut: '⌘A', onClick: () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true })) },
  ];

  const viewMenu: MenuEntry[] = [
    { label: 'Dark mode', checked: theme === 'dark', onClick: toggleTheme },
    { label: 'Version history panel', checked: historyOpen, onClick: onToggleHistory },
    { label: 'Compact density', checked: compact, onClick: onToggleCompact },
  ];

  const insertMenu: MenuEntry[] = [
    { label: 'Row above', disabled: !active, onClick: () => active && dispatch({ type: 'INSERT_ROW', payload: { index: active.row } }) },
    { label: 'Row below', disabled: !active, onClick: () => active && dispatch({ type: 'INSERT_ROW', payload: { index: active.row + 1 } }) },
    { label: 'Column left', disabled: !active, onClick: () => active && dispatch({ type: 'INSERT_COLUMN', payload: { index: active.col } }) },
    { label: 'Column right', disabled: !active, onClick: () => active && dispatch({ type: 'INSERT_COLUMN', payload: { index: active.col + 1 } }) },
    { separator: true, label: '' },
    {
      label: 'Function…',
      onClick: () => {
        if (!active) return;
        dispatch({ type: 'SET_FORMULA_INPUT', payload: '=' });
        document.querySelector<HTMLInputElement>('input[placeholder*="Enter value or formula"]')?.focus();
      },
    },
    { separator: true, label: '' },
    {
      label: 'Chart from selection…',
      disabled: !range,
      onClick: () => range && onInsertChart(range),
    },
    {
      label: 'Comment on cell…',
      disabled: !active,
      onClick: () => {
        if (!active) return;
        const text = prompt('Comment:');
        if (!text) return;
        dispatch({
          type: 'SET_COMMENT',
          payload: {
            key: `${active.row}:${active.col}`,
            comment: { author: 'You', text, timestamp: Date.now() },
          },
        });
      },
    },
  ];

  const formatCell = (fmt: Record<string, unknown>) => {
    if (!active) return;
    const key = keyOf(active.row, active.col);
    const existing = state.data.get(key);
    dispatch({
      type: 'SET_CELL',
      payload: {
        row: active.row,
        col: active.col,
        data: { value: existing?.value ?? '', format: { ...(existing?.format || {}), ...fmt } },
      },
    });
  };

  const formatMenu: MenuEntry[] = [
    { label: 'Bold', shortcut: '⌘B', onClick: () => formatCell({ bold: !state.data.get(keyOf(active?.row ?? 0, active?.col ?? 0))?.format?.bold }) },
    { label: 'Italic', shortcut: '⌘I', onClick: () => formatCell({ italic: true }) },
    { label: 'Underline', shortcut: '⌘U', onClick: () => formatCell({ underline: true }) },
    { label: 'Strikethrough', onClick: () => formatCell({ strikethrough: true }) },
    { separator: true, label: '' },
    { label: 'Wrap text', onClick: () => formatCell({ wrapText: true }) },
    {
      label: 'All borders',
      onClick: () => formatCell({
        borders: {
          top: { style: 'solid', width: 1, color: '#000' },
          right: { style: 'solid', width: 1, color: '#000' },
          bottom: { style: 'solid', width: 1, color: '#000' },
          left: { style: 'solid', width: 1, color: '#000' },
        },
      }),
    },
    { separator: true, label: '' },
    { label: 'Clear formatting', onClick: () => active && dispatch({ type: 'SET_CELL', payload: { row: active.row, col: active.col, data: { value: state.data.get(keyOf(active.row, active.col))?.value ?? '' } } }) },
  ];

  const sortSelection = (ascending: boolean) => {
    if (!range || active === null) return;
    dispatch({ type: 'SORT_RANGE', payload: { range, column: active.col, ascending } });
  };

  const dataMenu: MenuEntry[] = [
    { label: 'Sort range A → Z', disabled: !range, onClick: () => sortSelection(true) },
    { label: 'Sort range Z → A', disabled: !range, onClick: () => sortSelection(false) },
    { separator: true, label: '' },
    {
      label: state.filters?.length ? 'Clear filters' : 'Create a filter',
      onClick: () => {
        if (state.filters?.length) {
          dispatch({ type: 'SET_FILTERS', payload: { filters: [] } });
        } else {
          document.querySelector<HTMLButtonElement>('button[title="Create a filter"]')?.click();
        }
      },
    },
  ];

  const helpMenu: MenuEntry[] = [
    { label: 'Keyboard shortcuts', onClick: onShortcuts },
    { label: 'About OpenSheets', onClick: () => alert('OpenSheets — an open-source, Google Sheets-style spreadsheet component for React.') },
  ];

  return (
    <nav className="menuRow">
      <input
        ref={csvInputRef}
        type="file"
        accept=".csv,text/csv"
        style={{ display: 'none' }}
        onChange={(e) => { importCSV(e.target.files?.[0]); e.target.value = ''; }}
      />
      <DropdownMenu label="File" entries={fileMenu} />
      <DropdownMenu label="Edit" entries={editMenu} />
      <DropdownMenu label="View" entries={viewMenu} />
      <DropdownMenu label="Insert" entries={insertMenu} />
      <DropdownMenu label="Format" entries={formatMenu} />
      <DropdownMenu label="Data" entries={dataMenu} />
      <DropdownMenu label="Help" entries={helpMenu} />
    </nav>
  );
};

/* ---------------- Chart host (persisted per sheet) ---------------- */

interface ChartRecord {
  id: string;
  range: { startRow: number; startCol: number; endRow: number; endCol: number };
  type?: 'bar' | 'line' | 'pie';
  pos?: { x: number; y: number };
}

const chartsKey = (sheetId: string) => `opensheets_charts_${sheetId}`;

const loadCharts = (sheetId: string): ChartRecord[] => {
  try {
    return JSON.parse(localStorage.getItem(chartsKey(sheetId)) || '[]');
  } catch {
    return [];
  }
};

const ChartHost: React.FC<{
  sheetId: string;
  pending: { startRow: number; startCol: number; endRow: number; endCol: number } | null;
  onConsumed: () => void;
}> = ({ sheetId, pending, onConsumed }) => {
  const { state } = useSpreadsheetPersisted();
  const [charts, setCharts] = useState<ChartRecord[]>(() => loadCharts(sheetId));

  const persist = (next: ChartRecord[]) => {
    setCharts(next);
    try {
      localStorage.setItem(chartsKey(sheetId), JSON.stringify(next));
    } catch { /* quota */ }
  };

  // A new chart arrives from Insert > Chart from selection
  useEffect(() => {
    if (!pending) return;
    const n = charts.length;
    persist([...charts, {
      id: `c-${Date.now()}`,
      range: pending,
      pos: { x: 80 + (n % 4) * 30, y: 100 + (n % 4) * 30 },
    }]);
    onConsumed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 40 }}>
      {charts.map((c) => (
        <ChartPanel
          key={c.id}
          range={c.range}
          data={state.data}
          initial={c.type || c.pos ? { type: c.type ?? 'bar', pos: c.pos ?? { x: 80, y: 120 } } : undefined}
          onStateChange={(st) => persist(charts.map((x) => (x.id === c.id ? { ...x, type: st.type, pos: st.pos } : x)))}
          onClose={() => persist(charts.filter((x) => x.id !== c.id))}
        />
      ))}
    </div>
  );
};

/* ---------------- Density (View > Compact density) ---------------- */

const DensityController: React.FC<{ compact: boolean }> = ({ compact }) => {
  const { state, dispatch } = useSpreadsheetPersisted();
  useEffect(() => {
    dispatch({
      type: 'SET_ROW_HEIGHTS',
      payload: Array(state.maxRows).fill(compact ? 20 : 22),
    });
  }, [compact, state.maxRows, dispatch]);
  return null;
};

/* ---------------- App shell ---------------- */

// Header lives inside the provider so it can read sync status; theme and
// history visibility are owned by the shell and passed down
const HeaderBar: React.FC<{
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  showHistory: boolean;
  onToggleHistory: () => void;
  compact: boolean;
  onToggleCompact: () => void;
  onShare: () => void;
  onShortcuts: () => void;
  onInsertChart: (range: { startRow: number; startCol: number; endRow: number; endCol: number }) => void;
  onFind: () => void;
}> = ({ theme, toggleTheme, showHistory, onToggleHistory, compact, onToggleCompact, onShare, onShortcuts, onInsertChart, onFind }) => {
  const { syncStatus, dirty } = useSpreadsheetPersisted();
  const savedLabel = syncStatus.syncing ? 'Saving…' : dirty ? 'Unsaved changes' : 'Saved';

  return (
    <header className="appHeader">
      <div className="logo"><GridGlyphIcon /></div>
      <div className="titleBlock">
        <div className="titleRow">
          <span className="title">Untitled spreadsheet</span>
          <span className="saved">{savedLabel}</span>
        </div>
        <MenuBar
          theme={theme}
          toggleTheme={toggleTheme}
          historyOpen={showHistory}
          onToggleHistory={onToggleHistory}
          compact={compact}
          onToggleCompact={onToggleCompact}
          onShare={onShare}
          onShortcuts={onShortcuts}
          onInsertChart={onInsertChart}
          onFind={onFind}
        />
      </div>
      <div className="headerActions">
        <AvatarStack />
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
        <button className="shareButton" onClick={onShare} title="Share">Share</button>
      </div>
    </header>
  );
};

const AppShell: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const [showHistory, setShowHistory] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [chart, setChart] = useState<{ startRow: number; startCol: number; endRow: number; endCol: number } | null>(null);

  // ⌘F / ⌘H open find & replace
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'h')) {
        e.preventDefault();
        setFindOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
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
          compact={compact}
          onToggleCompact={() => setCompact(!compact)}
          onShare={() => setShareOpen(true)}
          onShortcuts={() => setShortcutsOpen(true)}
          onInsertChart={(range) => setChart(range)}
          onFind={() => setFindOpen(true)}
        />
        {findOpen && <FindReplaceBar onClose={() => setFindOpen(false)} />}
        <FormattingToolbar />
        <FormulaBar />

        <div className="mainArea">
          <div className="gridArea">
            <SpreadsheetTableOptimized sheetId={activeId} />
          </div>
          {showHistory && <VersionHistory onClose={() => setShowHistory(false)} />}
        </div>

        <CollabLayer sheetId={activeId} />

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
                <TabPresence sheetId={sh.id} activeSheet={activeId} />
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

        <ChartHost sheetId={activeId} pending={chart} onConsumed={() => setChart(null)} />
        <DensityController compact={compact} />
        <DevDrawer />
      </SpreadsheetProviderPersisted>

      <CollabToasts />
      {shareOpen && <ShareDialog onClose={() => setShareOpen(false)} />}
      {shortcutsOpen && <ShortcutsDialog onClose={() => setShortcutsOpen(false)} />}
    </div>
  );
};

export default function App() {
  return <AppShell />;
}
