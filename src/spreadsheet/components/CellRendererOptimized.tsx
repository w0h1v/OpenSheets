import React, { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import { useSpreadsheet } from '../SpreadsheetContext';
import { evaluateFormula } from '../utils/formulaUtils';
import { isCellInSelection } from '../utils/selectionUtils';
import { formatCellValue } from '../utils/formatUtils';
import { evaluateConditionalFormat, combineConditionalFormats } from '../utils/conditionalFormattingUtils';
import { CellDropdown } from './CellDropdown';
import { DropdownArrow } from './DropdownArrow';
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
  const [showDropdown, setShowDropdown] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ x: 0, y: 0 });
  const [cellDimensions, setCellDimensions] = useState({ width: 100, height: 24 });
  const inputRef = useRef<HTMLInputElement>(null);
  const cellRef = useRef<HTMLDivElement>(null);

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
    
    let value: any;
    if (cellData.formula && cellData.formula.startsWith('=')) {
      value = evaluateFormula(cellData.formula, getCell);
    } else {
      value = cellData.value;
    }
    
    // Apply formatting to the value
    return formatCellValue(value, cellData.format);
  }, [cellData, getCell]);

  const cellStyle = useMemo(() => {
    let baseFormat = cellData?.format || {};
    
    // Apply conditional formatting if present
    if (cellData?.format?.conditionalFormat && cellData.value !== undefined && cellData.value !== '') {
      const shouldApplyConditional = evaluateConditionalFormat(
        cellData.value,
        cellData.format.conditionalFormat,
        row,
        col,
        state.data,
        getCell
      );
      
      if (shouldApplyConditional) {
        baseFormat = combineConditionalFormats(baseFormat, [cellData.format.conditionalFormat.format]);
      }
    }
    
    const format = baseFormat;
    const style: React.CSSProperties = {
      // Font styling
      fontFamily: format.fontFamily,
      fontSize: format.fontSize ? `${format.fontSize}px` : undefined,
      fontWeight: format.bold ? 'bold' : undefined,
      fontStyle: format.italic ? 'italic' : undefined,
      textDecoration: `${format.underline ? 'underline ' : ''}${format.strikethrough ? 'line-through' : ''}`.trim() || undefined,
      
      // Colors
      backgroundColor: format.backgroundColor,
      color: format.color,
      
      // Alignment
      textAlign: format.textAlign,
      verticalAlign: format.verticalAlign,
      justifyContent: format.textAlign === 'center' ? 'center' : format.textAlign === 'right' ? 'flex-end' : 'flex-start',
      alignItems: format.verticalAlign === 'middle' ? 'center' : format.verticalAlign === 'bottom' ? 'flex-end' : 'flex-start',
      
      // Text wrapping and rotation
      whiteSpace: format.wrapText ? 'normal' : 'nowrap',
      transform: format.textRotation ? `rotate(${format.textRotation}deg)` : undefined,
      
      // Borders
      borderTop: format.borders?.top ? `${format.borders.top.width || 1}px ${format.borders.top.style || 'solid'} ${format.borders.top.color || '#000'}` : undefined,
      borderRight: format.borders?.right ? `${format.borders.right.width || 1}px ${format.borders.right.style || 'solid'} ${format.borders.right.color || '#000'}` : undefined,
      borderBottom: format.borders?.bottom ? `${format.borders.bottom.width || 1}px ${format.borders.bottom.style || 'solid'} ${format.borders.bottom.color || '#000'}` : undefined,
      borderLeft: format.borders?.left ? `${format.borders.left.width || 1}px ${format.borders.left.style || 'solid'} ${format.borders.left.color || '#000'}` : undefined,
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

  // Get validation rule for this cell
  const validation = useMemo(() => {
    return state.validation?.get(`${row}:${col}`) || null;
  }, [state.validation, row, col]);

  // Check if cell has dropdown (list validation)
  const hasDropdown = useMemo(() => {
    return validation?.type === 'list' && validation.list && validation.list.length > 0;
  }, [validation]);

  // Validate cell data if validation rules exist
  const validationError = useMemo(() => {
    if (!validation || !cellData?.value) return null;

    const value = cellData.value;
    switch (validation.type) {
      case 'number':
        if (typeof value !== 'number') return 'Value must be a number';
        if (validation.min !== undefined && typeof validation.min === 'number' && value < validation.min) 
          return `Value must be >= ${validation.min}`;
        if (validation.max !== undefined && typeof validation.max === 'number' && value > validation.max) 
          return `Value must be <= ${validation.max}`;
        break;
      case 'list':
        if (validation.list && validation.allowCustomValues !== true && !validation.list.includes(String(value))) {
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
  }, [validation, cellData?.value]);

  // Handle dropdown arrow click
  const handleDropdownClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!cellRef.current || !hasDropdown) return;

    const rect = cellRef.current.getBoundingClientRect();
    setDropdownPosition({ x: rect.left, y: rect.top });
    setCellDimensions({ width: rect.width, height: rect.height });
    setShowDropdown(true);
  }, [hasDropdown]);

  // Handle dropdown selection
  const handleDropdownSelect = useCallback((value: string) => {
    setCell(row, col, { value });
    setShowDropdown(false);
  }, [setCell, row, col]);

  // Handle dropdown close
  const handleDropdownClose = useCallback(() => {
    setShowDropdown(false);
  }, []);

  // Handle cell click - show dropdown if has validation
  const handleCellClick = useCallback((e: React.MouseEvent) => {
    if (hasDropdown && !isEditing && !state.readOnly) {
      handleDropdownClick(e);
    }
  }, [hasDropdown, isEditing, state.readOnly, handleDropdownClick]);

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
    <>
      <div 
        ref={cellRef}
        className={`${styles.cell} ${hasDropdown ? styles.cellWithDropdown : ''} ${validationError ? styles.error : ''}`}
        onDoubleClick={handleDoubleClick}
        onClick={handleCellClick}
        style={cellStyle}
        role="gridcell"
        aria-label={`Cell ${col}${row + 1}: ${displayValue}`}
        aria-selected={isSelected}
        aria-current={isActive ? 'true' : undefined}
        tabIndex={isActive ? 0 : -1}
        title={validationError || undefined}
        aria-haspopup={hasDropdown ? 'listbox' : undefined}
        aria-expanded={hasDropdown ? showDropdown : undefined}
      >
        {displayValue}
        {hasDropdown && validation?.showDropdownArrow !== false && (
          <DropdownArrow 
            onClick={handleDropdownClick}
            isOpen={showDropdown}
          />
        )}
      </div>
      
      {showDropdown && hasDropdown && validation && (
        <CellDropdown
          validation={validation}
          currentValue={String(cellData?.value || '')}
          onSelect={handleDropdownSelect}
          onClose={handleDropdownClose}
          position={dropdownPosition}
          cellWidth={cellDimensions.width}
          cellHeight={cellDimensions.height}
        />
      )}
    </>
  );
}, (prevProps, nextProps) => {
  // Custom comparison for memo
  return prevProps.row === nextProps.row && prevProps.col === nextProps.col;
});

CellRendererOptimized.displayName = 'CellRendererOptimized';