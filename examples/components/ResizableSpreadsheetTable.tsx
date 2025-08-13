import React, { useRef, useCallback, useEffect, useState } from 'react';
import { useSpreadsheetPersisted } from '../../src/spreadsheet/SpreadsheetContextPersisted';
import { columnToLetter } from '../../src/spreadsheet/utils/columnUtils';
import { keyOf } from '../../src/spreadsheet/types/spreadsheet';
import { FormulaEngine } from '../../src/spreadsheet/utils/hyperformulaEngine';

// Create a single formula engine instance
const formulaEngine = new FormulaEngine();

export const SpreadsheetTableOptimized: React.FC = () => {
  const { state, dispatch, getCell, setCell } = useSpreadsheetPersisted();
  const tableRef = useRef<HTMLTableElement>(null);
  const [evaluatedData, setEvaluatedData] = useState<Map<string, any>>(new Map());
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<{row: number, col: number} | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<{row: number, col: number} | null>(null);
  
  // Resizing state
  const [isResizingCol, setIsResizingCol] = useState<number | null>(null);
  const [isResizingRow, setIsResizingRow] = useState<number | null>(null);
  const [resizeStart, setResizeStart] = useState<{x: number, y: number} | null>(null);
  const [colWidths, setColWidths] = useState<number[]>(Array(26).fill(100));
  const [rowHeights, setRowHeights] = useState<number[]>(Array(50).fill(28));

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

  // Column resize handlers
  const handleColResizeStart = useCallback((e: React.MouseEvent, colIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizingCol(colIndex);
    setResizeStart({ x: e.clientX, y: e.clientY });
  }, []);

  const handleRowResizeStart = useCallback((e: React.MouseEvent, rowIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizingRow(rowIndex);
    setResizeStart({ x: e.clientX, y: e.clientY });
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (isResizingCol !== null && resizeStart) {
      const diff = e.clientX - resizeStart.x;
      const newWidth = Math.max(40, colWidths[isResizingCol] + diff);
      const newWidths = [...colWidths];
      newWidths[isResizingCol] = newWidth;
      setColWidths(newWidths);
      setResizeStart({ x: e.clientX, y: e.clientY });
    }
    
    if (isResizingRow !== null && resizeStart) {
      const diff = e.clientY - resizeStart.y;
      const newHeight = Math.max(20, rowHeights[isResizingRow] + diff);
      const newHeights = [...rowHeights];
      newHeights[isResizingRow] = newHeight;
      setRowHeights(newHeights);
      setResizeStart({ x: e.clientX, y: e.clientY });
    }
  }, [isResizingCol, isResizingRow, resizeStart, colWidths, rowHeights]);

  const handleMouseUp = useCallback(() => {
    if (isResizingCol !== null || isResizingRow !== null) {
      setIsResizingCol(null);
      setIsResizingRow(null);
      setResizeStart(null);
    }
    
    if (isSelecting) {
      setIsSelecting(false);
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
  }, [isResizingCol, isResizingRow, isSelecting, selectionStart, selectionEnd, dispatch]);

  // Add global mouse event listeners for resizing
  useEffect(() => {
    if (isResizingCol !== null || isResizingRow !== null) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = isResizingCol !== null ? 'col-resize' : 'row-resize';
      document.body.style.userSelect = 'none';
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [isResizingCol, isResizingRow, handleMouseMove, handleMouseUp]);

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

  const handleCellMouseDown = useCallback((e: React.MouseEvent, row: number, col: number) => {
    e.preventDefault();
    
    if (e.shiftKey && state.selection.active) {
      setSelectionStart(state.selection.active);
      setSelectionEnd({ row, col });
      setIsSelecting(false);
      
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
      const newRange = { start: { row, col }, end: { row, col } };
      dispatch({
        type: 'ADD_SELECTION_RANGE',
        payload: newRange
      });
    } else {
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

    // Regular navigation keys
    switch (e.key) {
      case 'Enter':
        if (state.editing) {
          dispatch({ type: 'SET_EDITING', payload: null });
        } else {
          handleCellDoubleClick(row, col);
        }
        break;
      case 'Delete':
      case 'Backspace':
        if (!state.editing) {
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
          style={{ 
            width: '100%', 
            border: 'none', 
            outline: 'none', 
            padding: '2px',
            background: 'transparent',
            font: 'inherit'
          }}
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

    // Get display value
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
          color: isActive && !isEditing ? 'white' : (cellData?.format?.color || 'inherit'),
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

  const visibleRows = Math.min(50, state.maxRows);
  const visibleCols = Math.min(26, state.maxCols);

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
        width: 'max-content',
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
              <th 
                key={i} 
                style={{ 
                  background: '#f8f9fa', 
                  border: '1px solid #e0e0e0',
                  padding: '4px 8px',
                  width: colWidths[i],
                  minWidth: colWidths[i],
                  maxWidth: colWidths[i],
                  position: 'sticky',
                  top: 0,
                  zIndex: 1,
                  cursor: 'default',
                  userSelect: 'none'
                }}
              >
                <div style={{ position: 'relative' }}>
                  {columnToLetter(i)}
                  <div
                    style={{
                      position: 'absolute',
                      right: '-3px',
                      top: '-4px',
                      bottom: '-4px',
                      width: '6px',
                      cursor: 'col-resize',
                      background: 'transparent',
                      zIndex: 10
                    }}
                    onMouseDown={(e) => handleColResizeStart(e, i)}
                    title="Resize column"
                  />
                </div>
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
                height: rowHeights[rowIndex],
                position: 'sticky',
                left: 0,
                cursor: 'default'
              }}>
                <div style={{ position: 'relative', height: '100%' }}>
                  {rowIndex + 1}
                  <div
                    style={{
                      position: 'absolute',
                      bottom: '-3px',
                      left: '-4px',
                      right: '-4px',
                      height: '6px',
                      cursor: 'row-resize',
                      background: 'transparent',
                      zIndex: 10
                    }}
                    onMouseDown={(e) => handleRowResizeStart(e, rowIndex)}
                    title="Resize row"
                  />
                </div>
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
                      width: colWidths[colIndex],
                      minWidth: colWidths[colIndex],
                      maxWidth: colWidths[colIndex],
                      height: rowHeights[rowIndex],
                      background: isActive ? '#1a73e8' : isSelected ? '#e3f2fd' : 'white',
                      cursor: 'cell',
                      position: 'relative'
                    }}
                    onMouseDown={(e) => handleCellMouseDown(e, rowIndex, colIndex)}
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