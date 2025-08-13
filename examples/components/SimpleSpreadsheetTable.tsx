import React, { useRef, useCallback, useEffect, useState } from 'react';
import { useSpreadsheetPersisted } from '../../src/spreadsheet/SpreadsheetContextPersisted';
import { columnToLetter } from '../../src/spreadsheet/utils/columnUtils';
import { keyOf } from '../../src/spreadsheet/types/spreadsheet';
import { FormulaEngine } from '../../src/spreadsheet/utils/hyperformulaEngine';
import styles from '../../src/spreadsheet/components/SpreadsheetTable.module.css';

// Create a single formula engine instance
const formulaEngine = new FormulaEngine();

export const SpreadsheetTableOptimized: React.FC = () => {
  const { state, dispatch, getCell, setCell } = useSpreadsheetPersisted();
  const tableRef = useRef<HTMLTableElement>(null);
  const [evaluatedData, setEvaluatedData] = useState<Map<string, any>>(new Map());
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<{row: number, col: number} | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<{row: number, col: number} | null>(null);

  // Evaluate formulas whenever data changes
  useEffect(() => {
    const evaluated = new Map<string, any>();
    
    // First pass: Set all non-formula values
    state.data.forEach((cellData, key) => {
      const [rowStr, colStr] = key.split(':');
      const row = parseInt(rowStr);
      const col = parseInt(colStr);
      
      if (cellData.value !== undefined && !cellData.formula) {
        formulaEngine.setCell(row, col, cellData.value);
        evaluated.set(key, cellData.value);
      }
    });
    
    // Second pass: Evaluate formulas
    state.data.forEach((cellData, key) => {
      const [rowStr, colStr] = key.split(':');
      const row = parseInt(rowStr);
      const col = parseInt(colStr);
      
      if (cellData.formula) {
        try {
          formulaEngine.setCell(row, col, cellData.formula);
          const result = formulaEngine.getCellValue(row, col);
          evaluated.set(key, result);
        } catch (error) {
          evaluated.set(key, '#ERROR');
        }
      }
    });
    
    setEvaluatedData(evaluated);
  }, [state.data]);

  // Check if a cell is in selection range
  const isCellSelected = useCallback((row: number, col: number) => {
    if (!selectionStart || !selectionEnd) {
      return state.selection.active?.row === row && state.selection.active?.col === col;
    }
    
    const minRow = Math.min(selectionStart.row, selectionEnd.row);
    const maxRow = Math.max(selectionStart.row, selectionEnd.row);
    const minCol = Math.min(selectionStart.col, selectionEnd.col);
    const maxCol = Math.max(selectionStart.col, selectionEnd.col);
    
    return row >= minRow && row <= maxRow && col >= minCol && col <= maxCol;
  }, [selectionStart, selectionEnd, state.selection.active]);

  const handleMouseDown = useCallback((e: React.MouseEvent, row: number, col: number) => {
    e.preventDefault();
    
    if (e.shiftKey && state.selection.active) {
      // Shift+click: extend selection from active cell
      setSelectionStart(state.selection.active);
      setSelectionEnd({ row, col });
      setIsSelecting(false);
      
      // Update state with range selection
      dispatch({
        type: 'SET_SELECTION',
        payload: {
          ranges: [{
            start: state.selection.active,
            end: { row, col }
          }],
          active: { row, col }
        }
      });
    } else if (e.ctrlKey || e.metaKey) {
      // Ctrl/Cmd+click: add to selection (multi-select)
      const newRange = { start: { row, col }, end: { row, col } };
      dispatch({
        type: 'ADD_SELECTION_RANGE',
        payload: newRange
      });
    } else {
      // Regular click: start new selection
      setIsSelecting(true);
      setSelectionStart({ row, col });
      setSelectionEnd({ row, col });
      
      dispatch({
        type: 'SET_SELECTION',
        payload: {
          ranges: [{ start: { row, col }, end: { row, col } }],
          active: { row, col }
        }
      });
    }
  }, [dispatch, state.selection.active]);

  const handleMouseEnter = useCallback((row: number, col: number) => {
    if (isSelecting && selectionStart) {
      setSelectionEnd({ row, col });
      
      // Update selection range in state
      dispatch({
        type: 'SET_SELECTION',
        payload: {
          ranges: [{
            start: selectionStart,
            end: { row, col }
          }],
          active: { row, col }
        }
      });
    }
  }, [isSelecting, selectionStart, dispatch]);

  const handleMouseUp = useCallback(() => {
    if (isSelecting) {
      setIsSelecting(false);
      
      // Finalize selection
      if (selectionStart && selectionEnd) {
        dispatch({
          type: 'SET_SELECTION',
          payload: {
            ranges: [{
              start: selectionStart,
              end: selectionEnd
            }],
            active: selectionEnd
          }
        });
      }
    }
  }, [isSelecting, selectionStart, selectionEnd, dispatch]);

  // Add global mouse up listener
  useEffect(() => {
    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, [handleMouseUp]);

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

    // Handle Ctrl+A (Select All)
    if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
      e.preventDefault();
      dispatch({
        type: 'SET_SELECTION',
        payload: {
          ranges: [{
            start: { row: 0, col: 0 },
            end: { row: 49, col: 25 }
          }],
          active: { row: 0, col: 0 }
        }
      });
      setSelectionStart({ row: 0, col: 0 });
      setSelectionEnd({ row: 49, col: 25 });
      return;
    }

    // Handle arrow keys with Shift for selection
    if (e.shiftKey) {
      e.preventDefault();
      let newRow = row;
      let newCol = col;
      
      switch (e.key) {
        case 'ArrowUp': newRow = Math.max(0, row - 1); break;
        case 'ArrowDown': newRow = Math.min(state.maxRows - 1, row + 1); break;
        case 'ArrowLeft': newCol = Math.max(0, col - 1); break;
        case 'ArrowRight': newCol = Math.min(state.maxCols - 1, col + 1); break;
      }
      
      if (newRow !== row || newCol !== col) {
        if (!selectionStart) {
          setSelectionStart(active);
        }
        setSelectionEnd({ row: newRow, col: newCol });
        
        dispatch({
          type: 'SET_SELECTION',
          payload: {
            ranges: [{
              start: selectionStart || active,
              end: { row: newRow, col: newCol }
            }],
            active: { row: newRow, col: newCol }
          }
        });
      }
      return;
    }

    // Regular navigation (clears selection)
    switch (e.key) {
      case 'Enter':
        if (state.editing) {
          dispatch({ type: 'SET_EDITING', payload: null });
        } else {
          handleCellDoubleClick(row, col);
        }
        break;
      case 'Escape':
        if (state.editing) {
          dispatch({ type: 'SET_EDITING', payload: null });
          dispatch({ type: 'SET_FORMULA_INPUT', payload: '' });
        }
        setSelectionStart(null);
        setSelectionEnd(null);
        break;
      case 'Delete':
      case 'Backspace':
        if (!state.editing) {
          // Delete all selected cells
          if (selectionStart && selectionEnd) {
            const minRow = Math.min(selectionStart.row, selectionEnd.row);
            const maxRow = Math.max(selectionStart.row, selectionEnd.row);
            const minCol = Math.min(selectionStart.col, selectionEnd.col);
            const maxCol = Math.max(selectionStart.col, selectionEnd.col);
            
            for (let r = minRow; r <= maxRow; r++) {
              for (let c = minCol; c <= maxCol; c++) {
                setCell(r, c, { value: '', formula: undefined });
              }
            }
          } else {
            setCell(row, col, { value: '', formula: undefined });
          }
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (row > 0) {
          const newPos = { row: row - 1, col };
          dispatch({
            type: 'SET_SELECTION',
            payload: {
              ranges: [{ start: newPos, end: newPos }],
              active: newPos
            }
          });
          setSelectionStart(null);
          setSelectionEnd(null);
        }
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (row < state.maxRows - 1) {
          const newPos = { row: row + 1, col };
          dispatch({
            type: 'SET_SELECTION',
            payload: {
              ranges: [{ start: newPos, end: newPos }],
              active: newPos
            }
          });
          setSelectionStart(null);
          setSelectionEnd(null);
        }
        break;
      case 'ArrowLeft':
        e.preventDefault();
        if (col > 0) {
          const newPos = { row, col: col - 1 };
          dispatch({
            type: 'SET_SELECTION',
            payload: {
              ranges: [{ start: newPos, end: newPos }],
              active: newPos
            }
          });
          setSelectionStart(null);
          setSelectionEnd(null);
        }
        break;
      case 'ArrowRight':
        e.preventDefault();
        if (col < state.maxCols - 1) {
          const newPos = { row, col: col + 1 };
          dispatch({
            type: 'SET_SELECTION',
            payload: {
              ranges: [{ start: newPos, end: newPos }],
              active: newPos
            }
          });
          setSelectionStart(null);
          setSelectionEnd(null);
        }
        break;
    }
  }, [state, dispatch, setCell, handleCellDoubleClick, selectionStart, selectionEnd]);

  const renderCell = (row: number, col: number) => {
    const cellData = getCell(row, col);
    const isActive = state.selection.active?.row === row && state.selection.active?.col === col;
    const isEditing = state.editing?.row === row && state.editing?.col === col;
    const key = keyOf(row, col);
    
    if (isEditing) {
      return (
        <input
          type="text"
          defaultValue={cellData?.formula || cellData?.value?.toString() || ''}
          autoFocus
          className={styles.cellInput}
          style={{ width: '100%', border: 'none', outline: 'none', padding: '2px' }}
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

    // Get display value - either evaluated formula result or raw value
    let displayValue = '';
    if (cellData?.formula) {
      const evaluated = evaluatedData.get(key);
      if (evaluated !== undefined) {
        displayValue = typeof evaluated === 'number' ? 
          evaluated.toFixed(2).replace(/\.00$/, '') : 
          String(evaluated);
      } else {
        displayValue = cellData.formula;
      }
    } else if (cellData?.value !== undefined) {
      displayValue = String(cellData.value);
    }

    return (
      <div
        style={{
          fontWeight: cellData?.format?.bold ? 'bold' : 'normal',
          fontStyle: cellData?.format?.italic ? 'italic' : 'normal',
          textDecoration: cellData?.format?.underline ? 'underline' : 'none',
          color: cellData?.format?.color || 'inherit',
          backgroundColor: cellData?.format?.background || 'transparent',
          textAlign: (cellData?.format?.align as any) || 'left',
          fontSize: cellData?.format?.fontSize ? `${cellData.format.fontSize}px` : 'inherit',
          padding: '4px',
          height: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}
      >
        {displayValue}
      </div>
    );
  };

  // Create visible rows and columns
  const visibleRows = Math.min(50, state.maxRows);
  const visibleCols = Math.min(26, state.maxCols);

  // Show selection info
  const getSelectionInfo = () => {
    if (selectionStart && selectionEnd) {
      const minRow = Math.min(selectionStart.row, selectionEnd.row);
      const maxRow = Math.max(selectionStart.row, selectionEnd.row);
      const minCol = Math.min(selectionStart.col, selectionEnd.col);
      const maxCol = Math.max(selectionStart.col, selectionEnd.col);
      const rows = maxRow - minRow + 1;
      const cols = maxCol - minCol + 1;
      
      if (rows > 1 || cols > 1) {
        return `${rows}R x ${cols}C`;
      }
    }
    return null;
  };

  const selectionInfo = getSelectionInfo();

  return (
    <div style={{ flex: 1, overflow: 'auto', position: 'relative' }}>
      {selectionInfo && (
        <div style={{
          position: 'absolute',
          top: '8px',
          right: '8px',
          background: 'rgba(0, 0, 0, 0.7)',
          color: 'white',
          padding: '4px 8px',
          borderRadius: '4px',
          fontSize: '12px',
          zIndex: 10
        }}>
          {selectionInfo}
        </div>
      )}
      <table ref={tableRef} style={{ 
        borderCollapse: 'collapse', 
        width: '100%',
        fontSize: '13px',
        fontFamily: 'Arial, sans-serif',
        userSelect: 'none'
      }}>
        <thead>
          <tr>
            <th style={{ 
              background: '#f8f9fa', 
              border: '1px solid #e0e0e0',
              padding: '4px 8px',
              width: '40px',
              position: 'sticky',
              top: 0,
              left: 0,
              zIndex: 2
            }}></th>
            {Array.from({ length: visibleCols }, (_, i) => (
              <th key={i} style={{ 
                background: '#f8f9fa', 
                border: '1px solid #e0e0e0',
                padding: '4px 8px',
                minWidth: '80px',
                position: 'sticky',
                top: 0,
                zIndex: 1
              }}>
                {columnToLetter(i)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: visibleRows }, (_, rowIndex) => (
            <tr key={rowIndex}>
              <th style={{ 
                background: '#f8f9fa', 
                border: '1px solid #e0e0e0',
                padding: '4px 8px',
                position: 'sticky',
                left: 0
              }}>
                {rowIndex + 1}
              </th>
              {Array.from({ length: visibleCols }, (_, colIndex) => {
                const isSelected = isCellSelected(rowIndex, colIndex);
                const isActive = state.selection.active?.row === rowIndex && 
                                state.selection.active?.col === colIndex;
                return (
                  <td
                    key={colIndex}
                    style={{ 
                      border: '1px solid #e0e0e0',
                      padding: 0,
                      height: '28px',
                      background: isActive ? '#1a73e8' : isSelected ? '#e3f2fd' : 'white',
                      color: isActive ? 'white' : 'inherit',
                      cursor: 'cell',
                      position: 'relative'
                    }}
                    onMouseDown={(e) => handleMouseDown(e, rowIndex, colIndex)}
                    onMouseEnter={() => handleMouseEnter(rowIndex, colIndex)}
                    onDoubleClick={() => handleCellDoubleClick(rowIndex, colIndex)}
                    onKeyDown={(e) => handleKeyDown(e, rowIndex, colIndex)}
                    tabIndex={0}
                  >
                    {renderCell(rowIndex, colIndex)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};