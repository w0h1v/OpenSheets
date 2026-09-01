import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { SpreadsheetContext } from '../SpreadsheetContextPersisted';
import { SpreadsheetEnhancedContext } from '../SpreadsheetContextEnhanced';
import { columnToLetter } from '../utils/columnUtils';
import { evaluateFormula } from '../utils/formulaUtils';
import { keyOf, CellData } from '../types/spreadsheet';
import styles from './FindReplace.module.css';

/*
 * Find & replace bar (⌘F / ⌘H). Searches raw values and formula results,
 * navigates matches with selection, replace / replace all.
 */
export const FindReplaceBar: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const persistedContext = useContext(SpreadsheetContext);
  const enhancedContext = useContext(SpreadsheetEnhancedContext);
  const context = persistedContext || enhancedContext;
  const { state, dispatch } = context as typeof context & { dispatch: React.Dispatch<any> };

  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [index, setIndex] = useState(0);
  const [showReplace, setShowReplace] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const matches = useMemo(() => {
    if (!query) return [] as Array<{ key: string; row: number; col: number }>;
    const q = matchCase ? query : query.toLowerCase();
    const found: Array<{ key: string; row: number; col: number }> = [];
    state.data.forEach((cell: CellData, key: string) => {
      const [rowStr, colStr] = key.split(':');
      const row = Number(rowStr);
      const col = Number(colStr);
      let text = '';
      if (cell.formula && String(cell.formula).startsWith('=')) {
        text = String(evaluateFormula(cell.formula, (r, c) => state.data.get(keyOf(r, c))));
      } else {
        text = String(cell.value ?? '');
      }
      const hay = matchCase ? text : text.toLowerCase();
      if (text !== '' && hay.includes(q)) found.push({ key, row, col });
    });
    return found.sort((a, b) => (a.row - b.row) || (a.col - b.col));
  }, [query, matchCase, state.data]);

  useEffect(() => {
    if (index >= matches.length) setIndex(0);
  }, [matches.length, index]);

  const goto = useCallback((i: number) => {
    const m = matches[i];
    if (!m) return;
    dispatch({
      type: 'SET_SELECTION',
      payload: {
        ranges: [{ startRow: m.row, startCol: m.col, endRow: m.row, endCol: m.col }],
        active: { row: m.row, col: m.col },
      },
    });
  }, [matches, dispatch]);

  const next = useCallback(() => {
    if (!matches.length) return;
    const i = (index + 1) % matches.length;
    setIndex(i);
    goto(i);
  }, [index, matches.length, goto]);

  const prev = useCallback(() => {
    if (!matches.length) return;
    const i = (index - 1 + matches.length) % matches.length;
    setIndex(i);
    goto(i);
  }, [index, matches.length, goto]);

  const replaceCurrent = () => {
    const m = matches[index];
    if (!m) return;
    const cell = state.data.get(m.key);
    const text = String(cell?.value ?? '');
    const flags = matchCase ? 'g' : 'gi';
    const updated = text.replace(new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags), replacement);
    const num = parseFloat(updated);
    dispatch({
      type: 'SET_CELL',
      payload: { row: m.row, col: m.col, data: { value: updated.trim() !== '' && !isNaN(num) ? num : updated } },
    });
    next();
  };

  const replaceAll = () => {
    if (!query) return;
    const flags = matchCase ? 'g' : 'gi';
    const re = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
    const updates: Array<{ row: number; col: number; data: Partial<CellData> }> = [];
    matches.forEach((m) => {
      const cell = state.data.get(m.key);
      if (!cell || cell.formula) return;
      const updated = String(cell.value ?? '').replace(re, replacement);
      const num = parseFloat(updated);
      updates.push({ row: m.row, col: m.col, data: { value: updated.trim() !== '' && !isNaN(num) ? num : updated } });
    });
    if (updates.length) dispatch({ type: 'SET_CELLS', payload: { updates } });
  };

  const currentMatch = matches[index];

  return (
    <div className={styles.bar}>
      <input
        ref={inputRef}
        className={styles.input}
        placeholder="Find"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setIndex(0); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); e.shiftKey ? prev() : next(); }
          if (e.key === 'Escape') onClose();
        }}
      />
      <button className={styles.iconBtn} onClick={prev} title="Previous (Shift+Enter)">↑</button>
      <button className={styles.iconBtn} onClick={next} title="Next (Enter)">↓</button>
      <span className={styles.count}>
        {matches.length ? `${index + 1} of ${matches.length}` : query ? 'No results' : ''}
      </span>
      {showReplace && (
        <>
          <input
            className={styles.input}
            placeholder="Replace with"
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
          />
          <button className={styles.textBtn} onClick={replaceCurrent} disabled={!matches.length}>Replace</button>
          <button className={styles.textBtn} onClick={replaceAll} disabled={!matches.length}>Replace all</button>
        </>
      )}
      <button
        className={styles.textBtn}
        onClick={() => setShowReplace(!showReplace)}
        title="Toggle replace (⌘H)"
      >
        {showReplace ? 'Hide replace' : 'Replace…'}
      </button>
      <label className={styles.caseToggle} title="Match case">
        <input type="checkbox" checked={matchCase} onChange={(e) => setMatchCase(e.target.checked)} />
        Aa
      </label>
      {currentMatch && (
        <span className={styles.locator}>
          {columnToLetter(currentMatch.col)}{currentMatch.row + 1}
        </span>
      )}
      <button className={styles.iconBtn} onClick={onClose} title="Close (Esc)">✕</button>
    </div>
  );
};
