import React, { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import { useSpreadsheet } from '../SpreadsheetContext';
import { evaluateFormula } from '../utils/formulaUtils';
import { isCellInSelection } from '../utils/selectionUtils';
import styles from './CellRenderer.module.css';

interface Props {
  row: number;
  col: number;
}

// Memoized cell renderer for performance
export const CellRendererOptimized: React.FC<Props> = memo(({ row, col }) => {
  const { state, setState, getCell, setCell } = useSpreadsheet();
  const cellData = getCell(row, col);
  const isEditing =
    state.editing && state.editing.row === row && state.editing.col === col;
  const isSelected = isCellInSelection(row, col, state.selection);
  const isActive = state.selection.active?.row === row && state.selection.active?.col === col;

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

  useEffect(() => {
    if (isEditing) {
      setTempValue(state.formulaInput || cellData?.formula || cellData?.value || '');
    }
  }, [isEditing, state.formulaInput, cellData]);

  const handleDoubleClick = useCallback(() => {
    if (!state.readOnly) {
      setState((prev) => ({
        ...prev,
        editing: { row, col },
        formulaInput: cellData?.formula ?? cellData?.value ?? '',
      }));
      setTempValue(cellData?.formula ?? cellData?.value ?? '');
    }
  }, [state.readOnly, setState, row, col, cellData]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      const newValue = tempValue;
      if (typeof newValue === 'string' && newValue.startsWith('=')) {
        setCell(row, col, { formula: newValue, value: newValue });
      } else {
        setCell(row, col, { value: newValue });
      }
      setState((prev) => ({ 
        ...prev, 
        editing: null, 
        formulaInput: '',
        selection: {
          ...prev.selection,
          active: { row: row + 1, col }
        }
      }));
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const newValue = tempValue;
      if (typeof newValue === 'string' && newValue.startsWith('=')) {
        setCell(row, col, { formula: newValue, value: newValue });
      } else {
        setCell(row, col, { value: newValue });
      }
      setState((prev) => ({ 
        ...prev, 
        editing: null, 
        formulaInput: '',
        selection: {
          ...prev.selection,
          active: { row, col: col + (e.shiftKey ? -1 : 1) }
        }
      }));
    } else if (e.key === 'Escape') {
      setState((prev) => ({ ...prev, editing: null, formulaInput: '' }));
    }
  }, [tempValue, setCell, setState, row, col]);

  // Memoize expensive calculations
  const displayValue = useMemo(() => {
    if (!cellData) return '';
    if (cellData.formula && cellData.formula.startsWith('=')) {
      return evaluateFormula(cellData.formula, getCell);
    }
    return cellData.value ?? '';
  }, [cellData, getCell]);

  const cellStyle = useMemo(() => {
    const format = cellData?.format || {};
    const style: React.CSSProperties = {
      fontWeight: format.bold ? 'bold' : undefined,
      fontStyle: format.italic ? 'italic' : undefined,
      textDecoration: `${format.underline ? 'underline ' : ''}${format.strikethrough ? 'line-through' : ''}`.trim() || undefined,
      backgroundColor: format.backgroundColor,
      color: format.color,
      textAlign: format.textAlign,
    };

    if (isSelected && !isActive) {
      style.backgroundColor = format.backgroundColor || 'rgba(26, 115, 232, 0.05)';
    }
    if (isActive) {
      style.outline = '2px solid #1a73e8';
      style.outlineOffset = '-1px';
      style.zIndex = 1;
    }

    return style;
  }, [cellData?.format, isSelected, isActive]);

  // Validate cell data if validation rules exist
  const validationError = useMemo(() => {
    if (!state.validation || !cellData?.value) return null;
    const validation = state.validation.get(`${row}:${col}`);
    if (!validation) return null;

    const value = cellData.value;
    switch (validation.type) {
      case 'number':
        if (typeof value !== 'number') return 'Value must be a number';
        if (validation.min !== undefined && value < validation.min) 
          return `Value must be >= ${validation.min}`;
        if (validation.max !== undefined && value > validation.max) 
          return `Value must be <= ${validation.max}`;
        break;
      case 'list':
        if (validation.list && !validation.list.includes(String(value))) {
          return `Value must be one of: ${validation.list.join(', ')}`;
        }
        break;
      case 'custom':
        if (validation.customValidator && !validation.customValidator(value)) {
          return validation.errorMessage || 'Invalid value';
        }
        break;
    }
    return null;
  }, [state.validation, cellData?.value, row, col]);

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        className={styles.input}
        value={tempValue}
        onChange={(e) => setTempValue(e.target.value)}
        onKeyDown={handleKeyDown}
        aria-label={`Cell ${col}${row + 1} editor`}
        aria-invalid={!!validationError}
        aria-errormessage={validationError || undefined}
      />
    );
  }

  return (
    <div 
      className={`${styles.cell} ${validationError ? styles.error : ''}`}
      onDoubleClick={handleDoubleClick} 
      style={cellStyle}
      role="gridcell"
      aria-label={`Cell ${col}${row + 1}: ${displayValue}`}
      aria-selected={isSelected}
      aria-current={isActive ? 'true' : undefined}
      tabIndex={isActive ? 0 : -1}
      title={validationError || undefined}
    >
      {displayValue}
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for memo
  return prevProps.row === nextProps.row && prevProps.col === nextProps.col;
});

CellRendererOptimized.displayName = 'CellRendererOptimized';