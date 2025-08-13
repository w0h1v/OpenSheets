import React, { ChangeEvent, useEffect, useState } from 'react';
import { useSpreadsheetEnhanced } from '../SpreadsheetContextEnhanced';
import { columnToLetter } from '../utils/columnUtils';
import styles from './FormulaBar.module.css';

export const FormulaBar: React.FC = () => {
  const { state, dispatch, getCell, setCell } = useSpreadsheetEnhanced();
  const active = state.selection.active;
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

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setLocalValue(e.target.value);
    dispatch({ type: 'SET_FORMULA_INPUT', payload: e.target.value });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && active) {
      const newValue = localValue;
      if (newValue.startsWith('=')) {
        setCell(active.row, active.col, { formula: newValue, value: newValue });
      } else {
        setCell(active.row, active.col, { value: newValue });
      }
      setState((prev) => ({ ...prev, formulaInput: '' }));
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