import React, { useState, useRef, useEffect, useCallback, useMemo, memo, useSyncExternalStore } from 'react';
import { useSpreadsheetBase } from '../SpreadsheetContext';
import { DEFAULT_COL_WIDTH, type CellValue } from '../types/spreadsheet';
import { evaluateFormula } from '../utils/formulaUtils';
import { isCellInSelection } from '../utils/selectionUtils';
import { formatCellValue } from '../utils/formatUtils';
import { evaluateConditionalFormat, combineConditionalFormats } from '../utils/conditionalFormattingUtils';
import { CellDropdown } from './CellDropdown';
import { columnToLetter } from '../utils/columnUtils';
import { subscribeRegistryVersion, getRegistryVersion } from '../utils/sheetRegistry';
import { CommentIndicator } from './CommentIndicator';
import { DropdownArrow } from './DropdownArrow';
import styles from './CellRenderer.module.css';

interface Props {
  row: number;
  col: number;
}

// Memoized cell renderer for performance
// What the in-cell editor shows for a stored value
const editableText = (value: CellValue | undefined): string =>
  value === null || value === undefined ? '' : value instanceof Date ? value.toISOString().slice(0, 10) : String(value);

export const CellRenderer: React.FC<Props> = memo(({ row, col }) => {
  const { state, setState, getCell, setCell } = useSpreadsheetBase();
  const cellData = getCell(row, col);
  // Cross-sheet formulas re-evaluate when any source sheet's data changes
  const registryVersion = useSyncExternalStore(subscribeRegistryVersion, getRegistryVersion);
  const crossSheetVersion = cellData?.formula?.includes('!') ? registryVersion : null;
  const isEditing =
    state.editing && state.editing.row === row && state.editing.col === col;
  const isSelected = isCellInSelection(row, col, state.selection);
  const isActive = state.selection.active?.row === row && state.selection.active?.col === col;

  const [tempValue, setTempValue] = useState<string>(
    cellData?.formula ?? editableText(cellData?.value)
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
      setTempValue(state.formulaInput || cellData?.formula || editableText(cellData?.value));
    }
  }, [isEditing, state.formulaInput, cellData]);

  const handleDoubleClick = useCallback(() => {
    if (!state.readOnly) {
      setState((prev) => ({
        ...prev,
        editing: { row, col },
        formulaInput: cellData?.formula ?? editableText(cellData?.value),
      }));
      setTempValue(cellData?.formula ?? editableText(cellData?.value));
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
    if (!cellData) return { value: undefined, text: '', isNumeric: false };
    
    let value: any;
    if (cellData.formula && cellData.formula.startsWith('=')) {
      value = evaluateFormula(cellData.formula, getCell);
    } else {
      value = cellData.value;
    }
    
    // Apply formatting to the value
    const text = formatCellValue(value, cellData.format);
    return { value, text, isNumeric: typeof value === 'number' };
    // crossSheetVersion is not read here; it changes when another sheet's
    // data does, which is what makes =Sheet1!A1-style formulas re-evaluate
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cellData, getCell, crossSheetVersion]);

  // Numbers too wide for the column render as #### instead of spilling
  const showsHashes = useMemo(() => {
    if (!displayValue.isNumeric || !displayValue.text) return false;
    const colWidth = state.colWidths?.[col] || DEFAULT_COL_WIDTH;
    // tabular-nums at 12px: ~7.2px per digit is a safe estimate
    const fits = displayValue.text.length * 7.2 <= colWidth - 12;
    return !fits;
  }, [displayValue.isNumeric, displayValue.text, state.colWidths, col]);

  // Merged cells: covered cells render nothing; the origin spans the region
  const coveringMerge = useMemo(() => {
    const merges = state.merges;
    if (!merges || !merges.length) return null;
    return merges.find(
      (m) => row >= m.startRow && row <= m.endRow && col >= m.startCol && col <= m.endCol
    ) || null;
  }, [state.merges, row, col]);

  const cellStyle = useMemo(() => {
    let baseFormat = cellData?.format || {};
    
    // Conditional rules see the computed value, so formula cells qualify too
    const shown = displayValue.value;
    if (cellData?.format?.conditionalFormat && shown !== undefined && shown !== null && shown !== '') {
      const shouldApplyConditional = evaluateConditionalFormat(
        shown,
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
      
      // Colors (numbers render in near-black, like Sheets/Excel)
      backgroundColor: format.backgroundColor,
      color: format.color ?? (displayValue.isNumeric ? 'var(--os-grid-number-ink)' : undefined),

      // Alignment (numbers right-align by default, like Sheets/Excel)
      textAlign: format.textAlign ?? (displayValue.isNumeric ? 'right' : undefined),
      verticalAlign: format.verticalAlign,
      justifyContent: (format.textAlign ?? (displayValue.isNumeric ? 'right' : undefined)) === 'center' ? 'center'
        : (format.textAlign ?? (displayValue.isNumeric ? 'right' : undefined)) === 'right' ? 'flex-end' : 'flex-start',
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

    // Merged origin: expand the cell box across the region
    if (coveringMerge && coveringMerge.startRow === row && coveringMerge.startCol === col) {
      let spanW = 0;
      for (let c = coveringMerge.startCol; c <= coveringMerge.endCol; c++) {
        spanW += state.colWidths?.[c] || DEFAULT_COL_WIDTH;
      }
      let spanH = 0;
      for (let r = coveringMerge.startRow; r <= coveringMerge.endRow; r++) {
        spanH += state.rowHeights?.[r] || 22;
      }
      style.width = spanW;
      style.height = spanH;
      style.flex = 'none';
      style.boxSizing = 'border-box';
      style.zIndex = 1;
    }

    // Long text overflows into an empty right neighbor instead of clipping
    // (numbers never spill — they become #### via showsHashes)
    const hasContent = displayValue.text !== '' && !showsHashes;
    const rightNeighborEmpty = !getCell(row, col + 1)?.value && !getCell(row, col + 1)?.formula;
    if (hasContent && rightNeighborEmpty && !format.wrapText) {
      style.overflow = 'visible';
      style.zIndex = 1;
    }

    if (isSelected && !isActive) {
      style.backgroundColor = format.backgroundColor || 'rgba(26, 115, 232, 0.05)';
    }
    if (isActive) {
      style.outline = '2px solid var(--os-accent)';
      style.outlineOffset = '-2px';
      style.zIndex = 2;
    }

    return style;
  }, [cellData?.format, isSelected, isActive, displayValue.value, displayValue.isNumeric, displayValue.text, showsHashes, getCell, row, col, coveringMerge, state.data, state.colWidths, state.rowHeights]);

  // Get validation rule for this cell
  const validation = useMemo(() => {
    return state.validation?.get(`${row}:${col}`) || null;
  }, [state.validation, row, col]);

  // Per-cell comment indicator
  const cellComment = state.comments?.get(`${row}:${col}`);
  const addReply = (text: string) => {
    if (!cellComment) return;
    setState((prev) => {
      const comments = new Map(prev.comments || []);
      const existing = comments.get(`${row}:${col}`);
      if (!existing) return prev;
      comments.set(`${row}:${col}`, {
        ...existing,
        replies: [...(existing.replies || []), { author: 'You', text, timestamp: Date.now() }],
      });
      return { ...prev, comments };
    });
  };
  const setCellComment = (patch: { resolved?: boolean } | null) => {
    if (!cellComment && patch === null) return;
    if (!cellComment) return;
    if (patch === null) {
      setState((prev) => {
        const comments = new Map(prev.comments || []);
        comments.delete(`${row}:${col}`);
        return { ...prev, comments };
      });
    } else if (patch.resolved !== undefined) {
      setState((prev) => {
        const comments = new Map(prev.comments || []);
        comments.set(`${row}:${col}`, { ...cellComment, resolved: patch.resolved });
        return { ...prev, comments };
      });
    }
  };

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
        aria-label={`Cell ${columnToLetter(col)}${row + 1} editor`}
        aria-invalid={!!validationError}
        aria-errormessage={validationError || undefined}
      />
    );
  }

  // Covered by a merge and not the origin: render nothing
  if (coveringMerge && (coveringMerge.startRow !== row || coveringMerge.startCol !== col)) {
    return null;
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
        aria-label={`Cell ${columnToLetter(col)}${row + 1}: ${displayValue.text || 'empty'}`}
        aria-selected={isSelected}
        aria-current={isActive ? 'true' : undefined}
        tabIndex={isActive ? 0 : -1}
        title={validationError || undefined}
        aria-haspopup={hasDropdown ? 'listbox' : undefined}
        aria-expanded={hasDropdown ? showDropdown : undefined}
      >
        {showsHashes ? '#'.repeat(Math.max(1, Math.floor(((state.colWidths?.[col] || DEFAULT_COL_WIDTH) - 12) / 7.2))) : displayValue.text}
        {cellComment && (
          <CommentIndicator
            comment={cellComment}
            onReply={addReply}
            onResolve={() => setCellComment({ resolved: !cellComment.resolved })}
            onDelete={() => setCellComment(null)}
          />
        )}
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

CellRenderer.displayName = 'CellRenderer';