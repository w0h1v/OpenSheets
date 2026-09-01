import React, { ChangeEvent, useEffect, useRef, useState } from 'react';
import { useSpreadsheetEnhanced } from '../SpreadsheetContextEnhanced';
import { columnToLetter } from '../utils/columnUtils';
import styles from './FormulaBar.module.css';

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
      setLocalValue(
        state.formulaInput || 
        cellData?.formula || 
        cellData?.value || 
        ''
      );
    } else {
      setLocalValue('');
    }
  }, [active, state.formulaInput, getCell]);

  // A new active cell starts a fresh bar session
  useEffect(() => {
    committedRef.current = null;
  }, [active]);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setLocalValue(e.target.value);
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

  const cellRef = active 
    ? `${columnToLetter(active.col)}${active.row + 1}`
    : '';

  return (
    <div className={styles.container}>
      <span className={styles.cellRef}>{cellRef}</span>
      <span className={styles.label}>fx</span>
      <input
        className={styles.input}
        type="text"
        value={localValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={active ? 'Enter value or formula' : 'Select a cell'}
        disabled={!active}
      />
    </div>
  );
};