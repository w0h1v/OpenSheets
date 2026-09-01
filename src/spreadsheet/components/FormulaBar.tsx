import React, { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useSpreadsheetEnhanced } from '../SpreadsheetContextEnhanced';
import { columnToLetter } from '../utils/columnUtils';
import { normalizeRect } from '../utils/selectionUtils';
import { parseCellRef, cellsInRange } from '../utils/formulaUtils';
import {
  setFormulaHighlights, HIGHLIGHT_PALETTE, FormulaHighlight,
} from '../utils/formulaHighlightStore';
import styles from './FormulaBar.module.css';

// Extract A1 ranges and single refs from a formula, in order of appearance
const refsInFormula = (formula: string): Array<[number, number, number, number]> => {
  const out: Array<[number, number, number, number]> = [];
  if (!formula.startsWith('=')) return out;
  const rangeRe = /(\$?[A-Z]+\$?\d+):(\$?[A-Z]+\$?\d+)/g;
  const singleRe = /(\$?[A-Z]+\$?\d+)/g;
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = rangeRe.exec(formula)) !== null) {
    try {
      const cells = cellsInRange(m[1], m[2]);
      const rows = cells.map((c) => c[0]);
      const cols = cells.map((c) => c[1]);
      const entry: [number, number, number, number] = [
        Math.min(...rows), Math.min(...cols), Math.max(...rows), Math.max(...cols),
      ];
      const k = entry.join(',');
      if (!seen.has(k)) { seen.add(k); out.push(entry); }
    } catch { /* invalid ref */ }
  }
  const withoutRanges = formula.replace(rangeRe, '0');
  while ((m = singleRe.exec(withoutRanges)) !== null) {
    try {
      const [r, c] = parseCellRef(m[1]);
      const k = `${r},${c},${r},${c}`;
      if (!seen.has(k)) { seen.add(k); out.push([r, c, r, c]); }
    } catch { /* invalid ref */ }
  }
  return out;
};

export const FormulaBar: React.FC = () => {
  const { state, dispatch, getCell, setCell } = useSpreadsheetEnhanced();
  const active = state.selection.active;
  // Track the cell the current bar text belongs to, so a commit always
  // targets the cell that was selected when typing started, even if the
  // selection changes before the re-render commits
  const committedRef = useRef<{ row: number; col: number } | null>(null);
  const [localValue, setLocalValue] = useState('');

  useEffect(() => {
    if (active) {
      const cellData = getCell(active.row, active.col);
      const raw = state.formulaInput || cellData?.formula || cellData?.value || '';
      setLocalValue(String(raw));
    } else {
      setLocalValue('');
    }
  }, [active, state.formulaInput, getCell]);

  // A new active cell starts a fresh bar session (keyed on the cell, not
  // the object identity, so same-cell re-renders don't clear highlights)
  const prevActiveRef = useRef('');
  useEffect(() => {
    const sig = active ? `${active.row}:${active.col}` : '';
    if (sig === prevActiveRef.current) return;
    prevActiveRef.current = sig;
    committedRef.current = null;
    setFormulaHighlights([]);
  }, [active]);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setLocalValue(e.target.value);
    // Live range highlights while editing a formula
    const refs = refsInFormula(e.target.value);
    setFormulaHighlights(
      refs.slice(0, HIGHLIGHT_PALETTE.length).map((r, i): FormulaHighlight => ({
        startRow: r[0], startCol: r[1], endRow: r[2], endCol: r[3],
        color: HIGHLIGHT_PALETTE[i],
      }))
    );
    if (!committedRef.current && active) {
      committedRef.current = { row: active.row, col: active.col };
    }
    dispatch({ type: 'SET_FORMULA_INPUT', payload: e.target.value });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      const target = committedRef.current ?? active;
      if (!target) return;
      const newValue = localValue;
      if (newValue.startsWith('=')) {
        setCell(target.row, target.col, { formula: newValue, value: newValue });
      } else {
        // Store numeric input as numbers so alignment/series-fill/formulas work
        const numValue = parseFloat(newValue);
        const value = newValue.trim() !== '' && !isNaN(numValue) ? numValue : newValue;
        setCell(target.row, target.col, { value });
      }
      committedRef.current = null;
      dispatch({ type: 'SET_FORMULA_INPUT', payload: '' });
      setFormulaHighlights([]);
      // Reset the bar and move the selection down, like Sheets/Excel
      setLocalValue('');
      dispatch({
        type: 'SET_SELECTION',
        payload: {
          ranges: [{
            startRow: target.row + 1,
            startCol: target.col,
            endRow: target.row + 1,
            endCol: target.col,
          }],
          active: { row: target.row + 1, col: target.col },
        },
      });
      (e.target as HTMLInputElement).blur();
    } else if (e.key === 'Escape') {
      // Revert the bar to the active cell's stored content
      committedRef.current = null;
      setFormulaHighlights([]);
      dispatch({ type: 'SET_FORMULA_INPUT', payload: '' });
      if (active) {
        const cellData = getCell(active.row, active.col);
        setLocalValue(
          cellData?.formula || cellData?.value?.toString() || ''
        );
      } else {
        setLocalValue('');
      }
      (e.target as HTMLInputElement).blur();
    }
  };

  // Name box shows a range reference when a multi-cell range is selected
  const firstRange = state.selection.ranges[0];
  const nameRef = (() => {
    if (firstRange) {
      const r = normalizeRect(firstRange);
      const a = `${columnToLetter(r.startCol)}${r.startRow + 1}`;
      const b = `${columnToLetter(r.endCol)}${r.endRow + 1}`;
      return a === b ? a : `${a}:${b}`;
    }
    return active ? `${columnToLetter(active.col)}${active.row + 1}` : '';
  })();

  // Colored segments mirroring the grid highlight palette, for the overlay
  // behind the transparent-text input
  const isFormula = localValue.startsWith('=');
  const segments = useMemo(() => {
    if (!isFormula) return [] as Array<{ text: string; color?: string }>;
    const refs = refsInFormula(localValue);
    const segs: Array<{ text: string; color?: string }> = [];
    const colorOf = (i: number) => HIGHLIGHT_PALETTE[Math.min(i, HIGHLIGHT_PALETTE.length - 1)];
    const re = /(\$?[A-Z]+\$?\d+):(\$?[A-Z]+\$?\d+)|(\$?[A-Z]+\$?\d+)/g;
    let last = 0;
    let refIdx = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(localValue)) !== null) {
      const ref = m[0];
      // match against parsed refs in order to reuse the same palette index
      if (refIdx >= refs.length) refIdx = refs.length - 1;
      if (m.index > last) segs.push({ text: localValue.slice(last, m.index) });
      segs.push({ text: ref, color: colorOf(refIdx) });
      refIdx++;
      last = m.index + ref.length;
    }
    if (last < localValue.length) segs.push({ text: localValue.slice(last) });
    return segs;
  }, [localValue, isFormula]);

  return (
    <div className={styles.container}>
      <span className={styles.nameBox}>{nameRef}</span>
      <span className={styles.fx}>fx</span>
      <div className={styles.inputWrap}>
        {isFormula && (
          <div className={styles.overlay} aria-hidden="true">
            {segments.map((seg, i) => (
              <span key={i} style={seg.color ? { color: seg.color, fontWeight: 600 } : undefined}>
                {seg.text}
              </span>
            ))}
          </div>
        )}
        <input
          className={`${styles.input} ${isFormula ? styles.inputFormula : ''}`}
          type="text"
          value={localValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={active ? 'Enter value or formula' : 'Select a cell'}
          disabled={!active}
        />
      </div>
    </div>
  );
};