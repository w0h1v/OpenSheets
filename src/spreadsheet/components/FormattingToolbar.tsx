import React, { useContext } from 'react';
import { SpreadsheetContext } from '../SpreadsheetContextPersisted';
import { SpreadsheetEnhancedContext } from '../SpreadsheetContextEnhanced';
import { keyOf, CellFormat, CellData } from '../types/spreadsheet';
import { normalizeRect } from '../utils/selectionUtils';
import { getFormatOptions } from '../utils/formatUtils';
import {
  UndoIcon, RedoIcon, BoldIcon, ItalicIcon, UnderlineIcon, StrikethroughIcon,
  TextColorIcon, FillColorIcon, HorizontalAlignIcon, VerticalAlignIcon,
  WrapTextIcon, BordersIcon, FunctionsIcon, FilterIcon, ChevronDownIcon,
} from './icons';
import styles from './FormattingToolbar.module.css';

export const FormattingToolbar: React.FC = () => {
  const persistedContext = useContext(SpreadsheetContext);
  const enhancedContext = useContext(SpreadsheetEnhancedContext);
  const context = persistedContext || enhancedContext;

  if (!context) {
    return <div className={styles.toolbar} />;
  }

  const { state, dispatch, setCell } = context;
  const { undo, redo, canUndo, canRedo } = context as typeof context & {
    undo?: () => void; redo?: () => void; canUndo?: boolean; canRedo?: boolean;
  };
  const active = state.selection.active;
  const formatOptions = getFormatOptions();

  const currentCell = active ? state.data.get(keyOf(active.row, active.col)) : null;
  const currentFormat = currentCell?.format || {};

  // For ranges, active-state reflects the anchor cell (Sheets shows mixed
  // state indicators; v1 uses the anchor)
  const applyFormat = (format: Partial<CellFormat>) => {
    if (!active) return;

    if (state.selection.ranges.length > 0) {
      const updates: Array<{ row: number; col: number; data: Partial<CellData> }> = [];
      state.selection.ranges.forEach(range => {
        const rect = normalizeRect(range);
        for (let row = rect.startRow; row <= rect.endRow; row++) {
          for (let col = rect.startCol; col <= rect.endCol; col++) {
            const cellKey = keyOf(row, col);
            const existingCell = state.data.get(cellKey);
            updates.push({
              row,
              col,
              data: {
                value: existingCell?.value ?? '',
                format: { ...(existingCell?.format || {}), ...format },
              },
            });
          }
        }
      });
      dispatch({ type: 'SET_CELLS', payload: { updates } });
    } else {
      setCell(active.row, active.col, {
        value: currentCell?.value ?? '',
        format: { ...currentFormat, ...format },
      });
    }
  };

  const toggleFormat = (key: 'bold' | 'italic' | 'underline' | 'strikethrough' | 'wrapText') => {
    applyFormat({ [key]: !currentFormat[key] } as Partial<CellFormat>);
  };

  const applyNumberFormat = (formatType: CellFormat['formatType']) => {
    applyFormat({ formatType, numberFormat: formatType } as Partial<CellFormat>);
  };

  // Cycle horizontal alignment left -> center -> right (pickers not yet designed)
  const cycleHorizontalAlign = () => {
    const order: Array<CellFormat['textAlign']> = ['left', 'center', 'right'];
    const next = order[(order.indexOf(currentFormat.textAlign ?? 'left') + 1) % order.length];
    applyFormat({ textAlign: next });
  };

  const cycleVerticalAlign = () => {
    const order: Array<CellFormat['verticalAlign']> = ['top', 'middle', 'bottom'];
    const next = order[(order.indexOf(currentFormat.verticalAlign ?? 'top') + 1) % order.length];
    applyFormat({ verticalAlign: next });
  };

  const decreaseDecimals = () => {
    const decimals = Math.max(0, (currentFormat.decimalPlaces ?? 2) - 1);
    applyFormat({ decimalPlaces: decimals });
  };

  const insertFunction = () => {
    if (!active) return;
    dispatch({ type: 'SET_FORMULA_INPUT', payload: '=' });
    const bar = document.querySelector<HTMLInputElement>('input[placeholder*="Enter value or formula"]');
    bar?.focus();
  };

  const alignTitle = `Horizontal align: ${currentFormat.textAlign ?? 'left'} (click to cycle)`;

  return (
    <div className={styles.toolbar}>
      <button
        className={styles.iconButton}
        onClick={() => undo?.()}
        disabled={!canUndo}
        title="Undo (⌘Z)"
      >
        <UndoIcon />
      </button>
      <button
        className={styles.iconButton}
        onClick={() => redo?.()}
        disabled={!canRedo}
        title="Redo (⌘⇧Z)"
      >
        <RedoIcon />
      </button>

      <div className={styles.divider} />

      <select
        value={currentFormat.fontFamily || 'Arial'}
        onChange={(e) => applyFormat({ fontFamily: e.target.value })}
        className={styles.fontSelect}
        title="Font family"
      >
        {formatOptions.fontFamilies.map(font => (
          <option key={font} value={font}>{font}</option>
        ))}
      </select>

      <select
        value={currentFormat.fontSize || 11}
        onChange={(e) => applyFormat({ fontSize: parseInt(e.target.value, 10) })}
        className={styles.sizeSelect}
        title="Font size"
      >
        {formatOptions.fontSizes.map(size => (
          <option key={size} value={size}>{size}</option>
        ))}
      </select>

      <div className={styles.divider} />

      <button
        className={`${styles.iconButton} ${currentFormat.bold ? styles.active : ''}`}
        onClick={() => toggleFormat('bold')}
        title="Bold (⌘B)"
      >
        <BoldIcon />
      </button>
      <button
        className={`${styles.iconButton} ${currentFormat.italic ? styles.active : ''}`}
        onClick={() => toggleFormat('italic')}
        title="Italic (⌘I)"
      >
        <ItalicIcon />
      </button>
      <button
        className={`${styles.iconButton} ${currentFormat.underline ? styles.active : ''}`}
        onClick={() => toggleFormat('underline')}
        title="Underline (⌘U)"
      >
        <UnderlineIcon />
      </button>
      <button
        className={`${styles.iconButton} ${currentFormat.strikethrough ? styles.active : ''}`}
        onClick={() => toggleFormat('strikethrough')}
        title="Strikethrough"
      >
        <StrikethroughIcon />
      </button>

      <label className={styles.iconButton} title="Text color">
        <TextColorIcon />
        <input
          type="color"
          className={styles.colorInput}
          value={currentFormat.color || '#000000'}
          onChange={(e) => applyFormat({ color: e.target.value })}
        />
      </label>
      <label className={styles.iconButton} title="Fill color">
        <FillColorIcon />
        <input
          type="color"
          className={styles.colorInput}
          value={currentFormat.backgroundColor || '#ffffff'}
          onChange={(e) => applyFormat({ backgroundColor: e.target.value })}
        />
      </label>

      <div className={styles.divider} />

      <button
        className={`${styles.textButton} ${currentFormat.formatType === 'currency' ? styles.active : ''}`}
        onClick={() => applyNumberFormat('currency')}
        title="Currency"
      >
        $
      </button>
      <button
        className={`${styles.textButton} ${currentFormat.formatType === 'percentage' ? styles.active : ''}`}
        onClick={() => applyNumberFormat('percentage')}
        title="Percent"
      >
        %
      </button>
      <button
        className={styles.textButton}
        onClick={decreaseDecimals}
        title="Decrease decimals"
      >
        .0
      </button>
      <div className={styles.formatsWrap} title="More formats">
        <select
          value={currentFormat.formatType || 'automatic'}
          onChange={(e) => applyNumberFormat(e.target.value as CellFormat['formatType'])}
          className={styles.formatsSelect}
        >
          {formatOptions.formatTypes.map(type => (
            <option key={type.value} value={type.value}>{type.label}</option>
          ))}
        </select>
        <span className={styles.formatsLabel}>123 <ChevronDownIcon size={8} /></span>
      </div>

      <div className={styles.divider} />

      <button className={styles.iconButton} onClick={cycleHorizontalAlign} title={alignTitle}>
        <HorizontalAlignIcon />
      </button>
      <button
        className={styles.iconButton}
        onClick={cycleVerticalAlign}
        title={`Vertical align: ${currentFormat.verticalAlign ?? 'top'} (click to cycle)`}
      >
        <VerticalAlignIcon />
      </button>
      <button
        className={`${styles.iconButton} ${currentFormat.wrapText ? styles.active : ''}`}
        onClick={() => toggleFormat('wrapText')}
        title="Wrap text"
      >
        <WrapTextIcon />
      </button>
      <button
        className={styles.iconButton}
        onClick={() => applyFormat({
          borders: {
            top: { style: 'solid', width: 1, color: '#000' },
            right: { style: 'solid', width: 1, color: '#000' },
            bottom: { style: 'solid', width: 1, color: '#000' },
            left: { style: 'solid', width: 1, color: '#000' },
          },
        })}
        title="All borders"
      >
        <BordersIcon />
      </button>

      <div className={styles.divider} />

      <button className={styles.iconButton} onClick={insertFunction} title="Functions">
        <FunctionsIcon />
      </button>
      <button className={styles.iconButton} disabled title="Create a filter (coming soon)">
        <FilterIcon />
      </button>
    </div>
  );
};
