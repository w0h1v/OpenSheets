import React, { useContext } from 'react';
import { SpreadsheetContext } from '../SpreadsheetContextPersisted';
import { useSpreadsheetEnhanced } from '../SpreadsheetContextEnhanced';
import { keyOf } from '../types/spreadsheet';
import styles from './FormattingToolbar.module.css';

export const FormattingToolbar: React.FC = () => {
  // Try persisted context first, fall back to enhanced
  const persistedContext = useContext(SpreadsheetContext);
  const enhancedContext = persistedContext ? null : useSpreadsheetEnhanced();
  const context = persistedContext || enhancedContext;
  
  if (!context) {
    return <div>Loading toolbar...</div>;
  }
  
  const { state, setCell } = context;
  const active = state.selection.active;
  
  const applyFormat = (format: Partial<any>) => {
    if (!active) return;
    const currentCell = state.data.get(keyOf(active.row, active.col));
    setCell(active.row, active.col, {
      format: { ...(currentCell?.format || {}), ...format },
    });
  };

  const toggleFormat = (key: 'bold' | 'italic' | 'underline' | 'strikethrough') => {
    if (!active) return;
    const currentCell = state.data.get(keyOf(active.row, active.col));
    const currentValue = currentCell?.format?.[key] || false;
    applyFormat({ [key]: !currentValue });
  };

  return (
    <div className={styles.toolbar}>
      <button 
        className={styles.formatButton}
        onClick={() => toggleFormat('bold')}
        title="Bold"
      >
        <strong>B</strong>
      </button>
      <button 
        className={styles.formatButton}
        onClick={() => toggleFormat('italic')}
        title="Italic"
      >
        <em>I</em>
      </button>
      <button 
        className={styles.formatButton}
        onClick={() => toggleFormat('underline')}
        title="Underline"
      >
        <u>U</u>
      </button>
      <button 
        className={styles.formatButton}
        onClick={() => toggleFormat('strikethrough')}
        title="Strikethrough"
      >
        <s>S</s>
      </button>
      
      <div className={styles.separator} />
      
      <button
        className={styles.alignButton}
        onClick={() => applyFormat({ textAlign: 'left' })}
        title="Align Left"
      >
        ⬅
      </button>
      <button
        className={styles.alignButton}
        onClick={() => applyFormat({ textAlign: 'center' })}
        title="Align Center"
      >
        ↔
      </button>
      <button
        className={styles.alignButton}
        onClick={() => applyFormat({ textAlign: 'right' })}
        title="Align Right"
      >
        ➡
      </button>
      
      <div className={styles.separator} />
      
      <label className={styles.colorPicker}>
        <span>BG</span>
        <input
          type="color"
          onChange={(e) => applyFormat({ backgroundColor: e.target.value })}
          title="Background Color"
        />
      </label>
      <label className={styles.colorPicker}>
        <span>Text</span>
        <input
          type="color"
          onChange={(e) => applyFormat({ color: e.target.value })}
          title="Text Color"
        />
      </label>
    </div>
  );
};