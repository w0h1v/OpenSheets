import React, { useState, useRef, useEffect } from 'react';
import { useSpreadsheet } from '../SpreadsheetContext';
import { evaluateFormula } from '../utils/formulaUtils';
import styles from './CellRenderer.module.css';

interface Props {
  row: number;
  col: number;
}

export const CellRenderer: React.FC<Props> = ({ row, col }) => {
  const { state, setState, getCell, setCell } = useSpreadsheet();
  const cellData = getCell(row, col);
  const isEditing =
    state.editing && state.editing.row === row && state.editing.col === col;

  const [tempValue, setTempValue] = useState(
    cellData?.formula ?? cellData?.value ?? ''
  );
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleDoubleClick = () => {
    if (!state.readOnly) {
      setState((prev) => ({
        ...prev,
        editing: { row, col },
        formulaInput: cellData?.formula ?? cellData?.value ?? '',
      }));
      setTempValue(cellData?.formula ?? cellData?.value ?? '');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      const newValue = tempValue;
      if (newValue.startsWith('=')) {
        setCell(row, col, { formula: newValue, value: newValue });
      } else {
        setCell(row, col, { value: newValue });
      }
      setState((prev) => ({ ...prev, editing: null, formulaInput: '' }));
    } else if (e.key === 'Escape') {
      setState((prev) => ({ ...prev, editing: null, formulaInput: '' }));
    }
  };

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        className={styles.input}
        value={tempValue}
        onChange={(e) => setTempValue(e.target.value)}
        onKeyDown={handleKeyDown}
      />
    );
  }

  const format = cellData?.format || {};
  const style: React.CSSProperties = {
    fontWeight: format.bold ? 'bold' : undefined,
    fontStyle: format.italic ? 'italic' : undefined,
    textDecoration: `${format.underline ? 'underline ' : ''}${format.strikethrough ? 'line-through' : ''}`.trim() || undefined,
    backgroundColor: format.backgroundColor,
    color: format.color,
    textAlign: format.textAlign,
  };

  let displayValue = cellData?.value ?? '';
  if (cellData?.formula && cellData.formula.startsWith('=')) {
    displayValue = evaluateFormula(cellData.formula, (r, c) => getCell(r, c)?.value);
  }

  return (
    <div className={styles.cell} onDoubleClick={handleDoubleClick} style={style}>
      {displayValue}
    </div>
  );
};