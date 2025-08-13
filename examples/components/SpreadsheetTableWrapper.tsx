import React, { useRef, useCallback } from 'react';
import { useSpreadsheetPersisted } from '../../src/spreadsheet/SpreadsheetContextPersisted';
import { columnToLetter } from '../../src/spreadsheet/utils/columnUtils';
import { keyOf } from '../../src/spreadsheet/types/spreadsheet';
import styles from '../../src/spreadsheet/components/SpreadsheetTable.module.css';

export const SpreadsheetTableOptimized: React.FC = () => {
  const { state, dispatch, getCell, setCell } = useSpreadsheetPersisted();
  const tableRef = useRef<HTMLTableElement>(null);

  const handleCellClick = useCallback((row: number, col: number) => {
    dispatch({
      type: 'SET_SELECTION',
      payload: {
        ranges: [{ start: { row, col }, end: { row, col } }],
        active: { row, col }
      }
    });
  }, [dispatch]);

  const handleCellDoubleClick = useCallback((row: number, col: number) => {
    dispatch({ type: 'SET_EDITING', payload: { row, col } });
    const cellData = getCell(row, col);
    dispatch({ 
      type: 'SET_FORMULA_INPUT', 
      payload: cellData?.formula || cellData?.value?.toString() || ''
    });
  }, [dispatch, getCell]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent, row: number, col: number) => {
    const active = state.selection.active;
    if (!active) return;

    switch (e.key) {
      case 'Enter':
        if (state.editing) {
          // Commit edit
          dispatch({ type: 'SET_EDITING', payload: null });
        } else {
          // Start editing
          handleCellDoubleClick(row, col);
        }
        break;
      case 'Escape':
        if (state.editing) {
          dispatch({ type: 'SET_EDITING', payload: null });
          dispatch({ type: 'SET_FORMULA_INPUT', payload: '' });
        }
        break;
      case 'Delete':
      case 'Backspace':
        if (!state.editing) {
          setCell(row, col, { value: '', formula: undefined });
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (row > 0) {
          handleCellClick(row - 1, col);
        }
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (row < state.maxRows - 1) {
          handleCellClick(row + 1, col);
        }
        break;
      case 'ArrowLeft':
        e.preventDefault();
        if (col > 0) {
          handleCellClick(row, col - 1);
        }
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (col < state.maxCols - 1) {
          handleCellClick(row, col + 1);
        }
        break;
      case 'Tab':
        e.preventDefault();
        if (e.shiftKey && col > 0) {
          handleCellClick(row, col - 1);
        } else if (!e.shiftKey && col < state.maxCols - 1) {
          handleCellClick(row, col + 1);
        }
        break;
    }
  }, [state, dispatch, setCell, handleCellClick, handleCellDoubleClick]);

  const renderCell = (row: number, col: number) => {
    const cellData = getCell(row, col);
    const isActive = state.selection.active?.row === row && state.selection.active?.col === col;
    const isEditing = state.editing?.row === row && state.editing?.col === col;
    
    if (isEditing) {
      return (
        <input
          type="text"
          defaultValue={cellData?.formula || cellData?.value?.toString() || ''}
          autoFocus
          className={styles.cellInput}
          onBlur={(e) => {
            const value = e.target.value;
            if (value.startsWith('=')) {
              setCell(row, col, { formula: value });
            } else {
              const numValue = parseFloat(value);
              setCell(row, col, { value: isNaN(numValue) ? value : numValue });
            }
            dispatch({ type: 'SET_EDITING', payload: null });
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'Tab') {
              e.currentTarget.blur();
            } else if (e.key === 'Escape') {
              dispatch({ type: 'SET_EDITING', payload: null });
            }
          }}
        />
      );
    }

    let displayValue = '';
    if (cellData?.formula) {
      // In a real implementation, this would evaluate the formula
      displayValue = cellData.formula;
    } else if (cellData?.value !== undefined) {
      displayValue = cellData.value.toString();
    }

    return (
      <div
        className={`${styles.cellContent} ${isActive ? styles.active : ''}`}
        style={{
          fontWeight: cellData?.format?.bold ? 'bold' : 'normal',
          fontStyle: cellData?.format?.italic ? 'italic' : 'normal',
          textDecoration: cellData?.format?.underline ? 'underline' : 'none',
          color: cellData?.format?.color || 'inherit',
          backgroundColor: cellData?.format?.background || 'transparent',
          textAlign: (cellData?.format?.align as any) || 'left',
          fontSize: cellData?.format?.fontSize ? `${cellData.format.fontSize}px` : 'inherit',
        }}
      >
        {displayValue}
      </div>
    );
  };

  // Create visible rows and columns (simplified for now)
  const visibleRows = Math.min(50, state.maxRows);
  const visibleCols = Math.min(26, state.maxCols);

  return (
    <div className={styles.container}>
      <table ref={tableRef} className={styles.table}>
        <thead>
          <tr>
            <th className={styles.cornerCell}></th>
            {Array.from({ length: visibleCols }, (_, i) => (
              <th key={i} className={styles.headerCell}>
                {columnToLetter(i)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: visibleRows }, (_, rowIndex) => (
            <tr key={rowIndex}>
              <th className={styles.headerCell}>{rowIndex + 1}</th>
              {Array.from({ length: visibleCols }, (_, colIndex) => (
                <td
                  key={colIndex}
                  className={styles.cell}
                  onClick={() => handleCellClick(rowIndex, colIndex)}
                  onDoubleClick={() => handleCellDoubleClick(rowIndex, colIndex)}
                  onKeyDown={(e) => handleKeyDown(e, rowIndex, colIndex)}
                  tabIndex={0}
                >
                  {renderCell(rowIndex, colIndex)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};