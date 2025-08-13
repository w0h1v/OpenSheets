import React, { ChangeEvent, useEffect, useState } from 'react';
import { useSpreadsheetPersisted } from '../../src/spreadsheet/SpreadsheetContextPersisted';
import { columnToLetter } from '../../src/spreadsheet/utils/columnUtils';
import styles from '../../src/spreadsheet/components/FormulaBar.module.css';

export const FormulaBar: React.FC = () => {
  const { state, dispatch, getCell, setCell } = useSpreadsheetPersisted();
  const active = state.selection.active;
  const [localValue, setLocalValue] = useState('');

  useEffect(() => {
    if (active) {
      const cellData = getCell(active.row, active.col);
      setLocalValue(
        state.formulaInput || 
        cellData?.formula || 
        cellData?.value?.toString() || 
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
        setCell(active.row, active.col, { formula: newValue });
      } else {
        const numValue = parseFloat(newValue);
        setCell(active.row, active.col, { 
          value: isNaN(numValue) ? newValue : numValue 
        });
      }
      dispatch({ type: 'SET_EDITING', payload: null });
      dispatch({ type: 'SET_FORMULA_INPUT', payload: '' });
    } else if (e.key === 'Escape') {
      setLocalValue('');
      dispatch({ type: 'SET_EDITING', payload: null });
      dispatch({ type: 'SET_FORMULA_INPUT', payload: '' });
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.cellReference}>
        {active ? `${columnToLetter(active.col)}${active.row + 1}` : ''}
      </div>
      <div className={styles.formulaInput}>
        <span className={styles.functionIcon}>fx</span>
        <input
          type="text"
          value={localValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={active ? "Enter value or formula..." : "Select a cell"}
          disabled={!active}
          className={styles.input}
        />
      </div>
    </div>
  );
};