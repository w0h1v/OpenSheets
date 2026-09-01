import React, { useContext, useState } from 'react';
import { SpreadsheetContext } from '../SpreadsheetContextPersisted';
import { SpreadsheetEnhancedContext } from '../SpreadsheetContextEnhanced';
import { keyOf, CellFormat, CellData } from '../types/spreadsheet';
import { normalizeRect } from '../utils/selectionUtils';
import { getFormatOptions, autoDetectFormat } from '../utils/formatUtils';
import styles from './FormattingToolbar.module.css';

export const FormattingToolbar: React.FC = () => {
  const [_showFormatMenu, _setShowFormatMenu] = useState(false);
  const [_showFontMenu, _setShowFontMenu] = useState(false);
  
  // Try persisted context first, fall back to enhanced
  const persistedContext = useContext(SpreadsheetContext);
  const enhancedContext = useContext(SpreadsheetEnhancedContext);
  const context = persistedContext || enhancedContext;
  
  if (!context) {
    return <div>Loading toolbar...</div>;
  }
  
  const { state, dispatch, setCell } = context;
  const active = state.selection.active;
  const formatOptions = getFormatOptions();
  
  const currentCell = active ? state.data.get(keyOf(active.row, active.col)) : null;
  const currentFormat = currentCell?.format || {};
  
  const applyFormat = (format: Partial<CellFormat>) => {
    if (!active) return;

    // Apply to all selected cells if multiple selection (single batched
    // dispatch; ranges are normalized so drag-direction doesn't matter)
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
        value: currentCell?.value || '',
        format: { ...currentFormat, ...format },
      });
    }
  };

  const toggleFormat = (key: keyof CellFormat) => {
    if (!active) return;
    const currentValue = currentFormat[key] as boolean || false;
    applyFormat({ [key]: !currentValue });
  };

  const applyNumberFormat = (formatType: CellFormat['formatType'], numberFormat?: string) => {
    applyFormat({ 
      formatType,
      numberFormat: numberFormat || formatType 
    });
  };

  const applyAutoFormat = () => {
    if (!active || !currentCell?.value) return;
    
    const detected = autoDetectFormat(currentCell.value);
    applyFormat(detected.format);
  };

  return (
    <div className={styles.toolbar}>
      {/* Font Family */}
      <div className={styles.dropdown}>
        <select 
          value={currentFormat.fontFamily || 'Arial'}
          onChange={(e) => applyFormat({ fontFamily: e.target.value })}
          className={styles.fontSelect}
        >
          {formatOptions.fontFamilies.map(font => (
            <option key={font} value={font}>{font}</option>
          ))}
        </select>
      </div>

      {/* Font Size */}
      <div className={styles.dropdown}>
        <select 
          value={currentFormat.fontSize || 11}
          onChange={(e) => applyFormat({ fontSize: parseInt(e.target.value) })}
          className={styles.sizeSelect}
        >
          {formatOptions.fontSizes.map(size => (
            <option key={size} value={size}>{size}</option>
          ))}
        </select>
      </div>

      <div className={styles.separator} />

      {/* Format Type */}
      <div className={styles.dropdown}>
        <select 
          value={currentFormat.formatType || 'automatic'}
          onChange={(e) => applyNumberFormat(e.target.value as CellFormat['formatType'])}
          className={styles.formatSelect}
        >
          {formatOptions.formatTypes.map(type => (
            <option key={type.value} value={type.value}>{type.label}</option>
          ))}
        </select>
      </div>

      {/* Auto-detect Format */}
      <button
        className={styles.formatButton}
        onClick={applyAutoFormat}
        title="Auto-detect format"
      >
        123
      </button>

      <div className={styles.separator} />

      {/* Text Formatting */}
      <button 
        className={`${styles.formatButton} ${currentFormat.bold ? styles.active : ''}`}
        onClick={() => toggleFormat('bold')}
        title="Bold (Ctrl+B)"
      >
        <strong>B</strong>
      </button>
      <button 
        className={`${styles.formatButton} ${currentFormat.italic ? styles.active : ''}`}
        onClick={() => toggleFormat('italic')}
        title="Italic (Ctrl+I)"
      >
        <em>I</em>
      </button>
      <button 
        className={`${styles.formatButton} ${currentFormat.underline ? styles.active : ''}`}
        onClick={() => toggleFormat('underline')}
        title="Underline (Ctrl+U)"
      >
        <u>U</u>
      </button>
      <button 
        className={`${styles.formatButton} ${currentFormat.strikethrough ? styles.active : ''}`}
        onClick={() => toggleFormat('strikethrough')}
        title="Strikethrough"
      >
        <s>S</s>
      </button>

      <div className={styles.separator} />

      {/* Text Alignment */}
      <button
        className={`${styles.alignButton} ${currentFormat.textAlign === 'left' ? styles.active : ''}`}
        onClick={() => applyFormat({ textAlign: 'left' })}
        title="Align Left"
      >
        ⬅
      </button>
      <button
        className={`${styles.alignButton} ${currentFormat.textAlign === 'center' ? styles.active : ''}`}
        onClick={() => applyFormat({ textAlign: 'center' })}
        title="Align Center"
      >
        ↔
      </button>
      <button
        className={`${styles.alignButton} ${currentFormat.textAlign === 'right' ? styles.active : ''}`}
        onClick={() => applyFormat({ textAlign: 'right' })}
        title="Align Right"
      >
        ➡
      </button>

      <div className={styles.separator} />

      {/* Vertical Alignment */}
      <button
        className={`${styles.alignButton} ${currentFormat.verticalAlign === 'top' ? styles.active : ''}`}
        onClick={() => applyFormat({ verticalAlign: 'top' })}
        title="Align Top"
      >
        ⬆
      </button>
      <button
        className={`${styles.alignButton} ${currentFormat.verticalAlign === 'middle' ? styles.active : ''}`}
        onClick={() => applyFormat({ verticalAlign: 'middle' })}
        title="Align Middle"
      >
        ↕
      </button>
      <button
        className={`${styles.alignButton} ${currentFormat.verticalAlign === 'bottom' ? styles.active : ''}`}
        onClick={() => applyFormat({ verticalAlign: 'bottom' })}
        title="Align Bottom"
      >
        ⬇
      </button>

      <div className={styles.separator} />

      {/* Text Wrapping */}
      <button
        className={`${styles.formatButton} ${currentFormat.wrapText ? styles.active : ''}`}
        onClick={() => toggleFormat('wrapText')}
        title="Wrap Text"
      >
        📄
      </button>

      {/* Text Rotation */}
      <select 
        value={currentFormat.textRotation || 0}
        onChange={(e) => applyFormat({ textRotation: parseInt(e.target.value) })}
        className={styles.rotationSelect}
        title="Text Rotation"
      >
        <option value={0}>0°</option>
        <option value={45}>45°</option>
        <option value={90}>90°</option>
        <option value={-45}>-45°</option>
        <option value={-90}>-90°</option>
      </select>

      <div className={styles.separator} />

      {/* Colors */}
      <div className={styles.colorSection}>
        <label className={styles.colorPicker}>
          <span>🎨</span>
          <input
            type="color"
            value={currentFormat.color || '#000000'}
            onChange={(e) => applyFormat({ color: e.target.value })}
            title="Text Color"
          />
        </label>
        <label className={styles.colorPicker}>
          <span>🎯</span>
          <input
            type="color"
            value={currentFormat.backgroundColor || '#ffffff'}
            onChange={(e) => applyFormat({ backgroundColor: e.target.value })}
            title="Background Color"
          />
        </label>
      </div>

      <div className={styles.separator} />

      {/* Borders */}
      <div className={styles.borderSection}>
        <button
          className={styles.formatButton}
          onClick={() => applyFormat({ 
            borders: { 
              top: { style: 'solid', width: 1, color: '#000' },
              right: { style: 'solid', width: 1, color: '#000' },
              bottom: { style: 'solid', width: 1, color: '#000' },
              left: { style: 'solid', width: 1, color: '#000' }
            }
          })}
          title="All Borders"
        >
          ⬜
        </button>
        <button
          className={styles.formatButton}
          onClick={() => applyFormat({ 
            borders: { 
              bottom: { style: 'solid', width: 1, color: '#000' }
            }
          })}
          title="Bottom Border"
        >
          ⬇
        </button>
      </div>

      {/* Number Format Controls */}
      {(currentFormat.formatType === 'number' || currentFormat.formatType === 'currency') && (
        <>
          <div className={styles.separator} />
          <div className={styles.numberControls}>
            <label>
              Decimals:
              <input
                type="number"
                min="0"
                max="10"
                value={currentFormat.decimalPlaces || 2}
                onChange={(e) => applyFormat({ decimalPlaces: parseInt(e.target.value) })}
                className={styles.numberInput}
              />
            </label>
            {currentFormat.formatType === 'currency' && (
              <label>
                Symbol:
                <input
                  type="text"
                  value={currentFormat.currencySymbol || '$'}
                  onChange={(e) => applyFormat({ currencySymbol: e.target.value })}
                  className={styles.currencyInput}
                  maxLength={3}
                />
              </label>
            )}
          </div>
        </>
      )}
    </div>
  );
};