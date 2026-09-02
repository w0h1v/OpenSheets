import React, { useState, useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import {
  SpreadsheetProviderPersisted,
  useSpreadsheetPersisted,
  SpreadsheetTableOptimized,
  FormulaBar,
  FormattingToolbar,
} from '../src';
import '../src/spreadsheet/styles/tokens.css';
import { useTheme } from '../src/spreadsheet/hooks/useTheme';
import {
  GridGlyphIcon, SunIcon, MoonIcon, HistoryIcon, AddSheetIcon,
} from '../src/spreadsheet/components/icons';
import { DropdownMenu, MenuEntry } from '../src/spreadsheet/components/Menu';
import { FindReplaceBar } from '../src/spreadsheet/components/FindReplaceBar';
import { ChartPanel } from '../src/spreadsheet/components/ChartPanel';
import { ConditionalFormattingPanel } from '../src/spreadsheet/components/ConditionalFormatting';
import { useCollaboration } from '../src/spreadsheet/collaboration/useCollaboration';
import { registerSheetData, unregisterSheetData } from '../src/spreadsheet/utils/sheetRegistry';
import {
  subscribeCollab, getCollabUsers, getCollabToasts, CollabUser,
} from '../src/spreadsheet/collaboration/presenceStore';
import { keyOf } from '../src/spreadsheet/types/spreadsheet';
import {
  getIdentity, subscribeAuth, login, register, logout,
} from '../src/spreadsheet/collaboration/authStore';
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

// Applies/streams collaboration state; also registers this sheet's data
// under its name so cross-sheet formulas (=Sheet1!A1) can resolve it
const CollabLayer: React.FC<{
  sheetId: string;
  sheetName: string;
  onSheetsReceived: (sheets: SheetMeta[]) => void;
  sendRef: React.MutableRefObject<((msg: unknown) => void) | null>;
}> = ({ sheetId, sheetName, onSheetsReceived, sendRef }) => {
  const { state, dispatch } = useSpreadsheetPersisted();
  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => {
    registerSheetData(sheetName, state.data);
    return () => unregisterSheetData(sheetName);
  }, [sheetName]);
  useEffect(() => {
    registerSheetData(sheetName, state.data);
  }, [sheetName, state.data]);
  const { send } = useCollaboration({
    sheetId,
    getState: () => stateRef.current,
    dispatch,
    onRemoteMessage: (msg) => {
      if (msg.type === 'sheets' && Array.isArray(msg.sheets)) {
        onSheetsReceived(msg.sheets);
      }
    },
  });
  sendRef.current = send;
  return null;
};

// Broadcasts the sheet list to collaborators; applies remote lists without
// echoing them back (suppress flag breaks the feedback loop)
const useSheetsSync = (
  sheets: SheetMeta[],
  setSheets: (s: SheetMeta[]) => void,
  sendRef: React.MutableRefObject<((msg: unknown) => void) | null>
) => {
  const suppressRef = useRef(false);
  const lastSigRef = useRef(JSON.stringify(sheets));

  useEffect(() => {
    const sig = JSON.stringify(sheets);
    if (sig === lastSigRef.current) return;
    lastSigRef.current = sig;
    if (suppressRef.current) {
      suppressRef.current = false;
      return;
    }
    sendRef.current?.({ type: 'sheets', sheets });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheets]);

  const receive = useCallback((remote: SheetMeta[]) => {
    const sig = JSON.stringify(remote);
    if (sig === lastSigRef.current) return;
    suppressRef.current = true;
    lastSigRef.current = sig;
    try {
      localStorage.setItem(SHEET_LIST_KEY, sig);
    } catch { /* quota */ }
    setSheets(remote);
  }, [setSheets]);

  return receive;
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

/* ---------------- Protected ranges (cell-level permissions) ---------------- */

const ProtectionHost: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const { state, dispatch } = useSpreadsheetPersisted();
  // Hooks run unconditionally: the early return used to sit above useState,
  // which changed the hook count when the dialog opened
  const [description, setDescription] = useState('');
  const identity = useSyncExternalStore(subscribeAuth, getIdentity);
  if (!open) return null;
  const range = state.selection.ranges[0];

  return (
    <div className="dialogBackdrop" onMouseDown={onClose}>
      <div className="dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="dialogHeader">
          <h3>Protected ranges</h3>
          <button onClick={onClose} title="Close">✕</button>
        </div>
        <p className="dialogNote">
          Edits inside a protected range are rejected for everyone except its creator.
          Select a range on the sheet, then press Protect.
        </p>
        {range && (
          <div className="shareRow">
            <input
              className="shareLink"
              style={{ flex: 1 }}
              placeholder="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <button
              className="primary"
              onClick={() => {
                dispatch({ type: 'PROTECT_RANGE', payload: { range, description: description || undefined } });
                setDescription('');
              }}
            >
              Protect selection
            </button>
          </div>
        )}
        <div className="protectList">
          {(state.protectedRanges || []).length === 0 && (
            <div className="versionEmpty">No protected ranges</div>
          )}
          {(state.protectedRanges || []).map((p) => {
            const cols = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','X','Y','Z'];
            const label = `${cols[p.range.startCol] ?? '?'}${p.range.startRow + 1}:` +
              `${cols[p.range.endCol] ?? '?'}${p.range.endRow + 1}`;
            return (
              <div key={p.id} className="protectRow">
                <span className="protectLabel">{label}</span>
                <span className="protectDesc">{p.description || 'Protected range'}</span>
                {p.owner === identity.id && <span className="protectOwner">yours</span>}
                <button onClick={() => dispatch({ type: 'UNPROTECT_RANGE', payload: { id: p.id } })}>
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

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

/* ---------------- Account (sign in / create account) ---------------- */

const AccountButton: React.FC<{ onClick: () => void }> = ({ onClick }) => {
  const identity = useSyncExternalStore(subscribeAuth, getIdentity);
  const title = identity.authenticated
    ? `Signed in as ${identity.name}`
    : `Collaborating as guest ${identity.name} — sign in`;
  return (
    <button className="accountButton" onClick={onClick} title={title} aria-label={title}>
      <span className="avatar" style={{ background: identity.color }}>{identity.name[0].toUpperCase()}</span>
      <span className="accountLabel">{identity.authenticated ? identity.name : 'Sign in'}</span>
    </button>
  );
};

const AccountDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const identity = useSyncExternalStore(subscribeAuth, getIdentity);
  const [mode, setMode] = useState<'signin' | 'create'>('signin');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'signin') await login(name, password);
      else await register(name, password);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    setBusy(true);
    try {
      await logout();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dialogBackdrop" onMouseDown={onClose}>
      <div className="dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="dialogHeader">
          <h3>{identity.authenticated ? 'Your account' : mode === 'signin' ? 'Sign in' : 'Create account'}</h3>
          <button onClick={onClose} title="Close">✕</button>
        </div>
        {identity.authenticated ? (
          <>
            <div className="accountCard">
              <span className="avatar accountAvatar" style={{ background: identity.color }}>
                {identity.name[0].toUpperCase()}
              </span>
              <div>
                <div className="accountName">{identity.name}</div>
                <div className="accountHint">Signed in on this browser</div>
              </div>
            </div>
            <p className="dialogNote">
              Your edits and protected ranges are attributed to this account in every tab and on
              every device you sign in on.
            </p>
            <div className="shareRow">
              <button className="primary" onClick={signOut} disabled={busy}>Sign out</button>
            </div>
          </>
        ) : (
          <form className="authForm" onSubmit={submit}>
            <p className="dialogNote">
              You are collaborating as guest <b>{identity.name}</b> in this tab. Sign in to keep one
              identity across tabs and devices.
            </p>
            <div className="authTabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'signin'}
                className={mode === 'signin' ? 'active' : ''}
                onClick={() => { setMode('signin'); setError(null); }}
              >
                Sign in
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'create'}
                className={mode === 'create' ? 'active' : ''}
                onClick={() => { setMode('create'); setError(null); }}
              >
                Create account
              </button>
            </div>
            <label className="authField">
              Name
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="username"
                required
                minLength={2}
                maxLength={24}
              />
            </label>
            <label className="authField">
              Password
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                required
                minLength={6}
              />
            </label>
            {error && <div className="authError" role="alert">{error}</div>}
            <div className="shareRow">
              <button className="primary" type="submit" disabled={busy}>
                {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
              </button>
            </div>
          </form>
        )}
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
  onShortcuts: () => void;
  onInsertChart: (range: { startRow: number; startCol: number; endRow: number; endCol: number }) => void;
  onFind: () => void;
  onConditionalFormatting: () => void;
  onProtect: () => void;
}> = ({ theme, toggleTheme, onToggleHistory, historyOpen, compact, onToggleCompact, onShortcuts, onInsertChart, onFind, onConditionalFormatting, onProtect }) => {
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

  const frozenRows = state.frozenRows ?? 0;
  const frozenCols = state.frozenCols ?? 0;
  const setFrozen = (rows: number | undefined, cols: number | undefined) =>
    dispatch({ type: 'SET_FROZEN', payload: { rows, cols } });

  const viewMenu: MenuEntry[] = [
    { label: 'Dark mode', checked: theme === 'dark', onClick: toggleTheme },
    { label: 'Version history panel', checked: historyOpen, onClick: onToggleHistory },
    { label: 'Compact density', checked: compact, onClick: onToggleCompact },
    { separator: true, label: '' },
    { label: 'Freeze: none', checked: frozenRows === 0 && frozenCols === 0, onClick: () => setFrozen(0, 0) },
    { label: 'Freeze: 1 row', checked: frozenRows === 1, onClick: () => setFrozen(1, undefined) },
    { label: 'Freeze: 2 rows', checked: frozenRows === 2, onClick: () => setFrozen(2, undefined) },
    { label: 'Freeze: 1 column', checked: frozenCols === 1, onClick: () => setFrozen(undefined, 1) },
    { label: 'Freeze: 2 columns', checked: frozenCols === 2, onClick: () => setFrozen(undefined, 2) },
    { label: 'Freeze: 1 row + 1 column', checked: frozenRows === 1 && frozenCols === 1, onClick: () => setFrozen(1, 1) },
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
    {
      label: 'Merge cells (selection)',
      disabled: !range,
      onClick: () => range && dispatch({ type: 'TOGGLE_MERGE', payload: { range } }),
    },
    { separator: true, label: '' },
    { label: 'Conditional formatting…', onClick: onConditionalFormatting },
    { label: 'Clear formatting', onClick: () => active && dispatch({ type: 'SET_CELL', payload: { row: active.row, col: active.col, data: { value: state.data.get(keyOf(active.row, active.col))?.value ?? '' } } }) },
  ];

  const sortSelection = (ascending: boolean) => {
    if (!range || active === null) return;
    dispatch({ type: 'SORT_RANGE', payload: { range, column: active.col, ascending } });
  };

  const dataMenu: MenuEntry[] = [
    { label: 'Sort range A → Z', disabled: !range, onClick: () => sortSelection(true) },
    { label: 'Sort range Z → A', disabled: !range, onClick: () => sortSelection(false) },
    { label: 'Protect range…', onClick: onProtect },
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

/* ---------------- Conditional formatting host ---------------- */

const ConditionalFormattingHost: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const { state } = useSpreadsheetPersisted();
  if (!open) return null;
  return (
    <ConditionalFormattingPanel
      isVisible={open}
      onClose={onClose}
      selectedRange={state.selection.ranges[0]}
    />
  );
};

/* ---------------- Density (View > Compact density) ---------------- */

const DensityController: React.FC<{ compact: boolean }> = ({ compact }) => {
  const { state, dispatch } = useSpreadsheetPersisted();
  const maxRowsRef = useRef(state.maxRows);
  maxRowsRef.current = state.maxRows;
  // Only on density toggles: re-running on maxRows changes would flatten
  // custom row heights on every row insert and pollute undo history
  useEffect(() => {
    dispatch({
      type: 'SET_ROW_HEIGHTS',
      payload: Array(maxRowsRef.current).fill(compact ? 20 : 22),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compact]);
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
  onAccount: () => void;
  onShortcuts: () => void;
  onInsertChart: (range: { startRow: number; startCol: number; endRow: number; endCol: number }) => void;
  onFind: () => void;
  onConditionalFormatting: () => void;
  onProtect: () => void;
}> = ({ theme, toggleTheme, showHistory, onToggleHistory, compact, onToggleCompact, onShare, onAccount, onShortcuts, onInsertChart, onFind, onConditionalFormatting, onProtect }) => {
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
          onShortcuts={onShortcuts}
          onInsertChart={onInsertChart}
          onFind={onFind}
          onConditionalFormatting={onConditionalFormatting}
          onProtect={onProtect}
        />
      </div>
      <div className="headerActions">
        <AvatarStack />
        <AccountButton onClick={onAccount} />
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
  const [accountOpen, setAccountOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [cfOpen, setCfOpen] = useState(false);
  const [protectOpen, setProtectOpen] = useState(false);
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
  const collabSendRef = useRef<((msg: unknown) => void) | null>(null);
  const receiveSheets = useSheetsSync(sheets, setSheets, collabSendRef);

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

  // If the active sheet was removed remotely, fall back to the first
  useEffect(() => {
    if (sheets.length && !sheets.some((sh) => sh.id === activeId)) {
      setActiveId(sheets[0].id);
    }
  }, [sheets, activeId]);

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
          onAccount={() => setAccountOpen(true)}
          onShortcuts={() => setShortcutsOpen(true)}
          onInsertChart={(range) => setChart(range)}
          onFind={() => setFindOpen(true)}
          onConditionalFormatting={() => setCfOpen(true)}
          onProtect={() => setProtectOpen(true)}
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

        <CollabLayer
          sheetId={activeId}
          sheetName={(sheets.find((sh) => sh.id === activeId) || { name: activeId }).name}
          onSheetsReceived={receiveSheets}
          sendRef={collabSendRef}
        />

        <footer className="tabBar" role="tablist" aria-label="Sheets">
          <button className="addSheet" onClick={addSheet} title="Add sheet"><AddSheetIcon size={14} /></button>
          <div className="tabs">
            {sheets.map((sh) => (
              <div
                key={sh.id}
                role="tab"
                aria-selected={sh.id === activeId}
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setActiveId(sh.id); }}
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
        <ConditionalFormattingHost open={cfOpen} onClose={() => setCfOpen(false)} />
        <ProtectionHost open={protectOpen} onClose={() => setProtectOpen(false)} />
        <DensityController compact={compact} />
        <DevDrawer />
      </SpreadsheetProviderPersisted>

      <CollabToasts />
      {shareOpen && <ShareDialog onClose={() => setShareOpen(false)} />}
      {accountOpen && <AccountDialog onClose={() => setAccountOpen(false)} />}
      {shortcutsOpen && <ShortcutsDialog onClose={() => setShortcutsOpen(false)} />}
    </div>
  );
};

export default function App() {
  return <AppShell />;
}
