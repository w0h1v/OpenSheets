import React from 'react';
import { useSpreadsheetPersisted } from '../../src/spreadsheet/SpreadsheetContextPersisted';
import { keyOf } from '../../src/spreadsheet/types/spreadsheet';
import styles from '../../src/spreadsheet/components/FormattingToolbar.module.css';

export const FormattingToolbar: React.FC = () => {
  const { state, dispatch } = useSpreadsheetPersisted();
  const active = state.selection.active;
  
  const applyFormat = (format: Partial<any>) => {
    if (!active) return;
    const currentCell = state.data.get(keyOf(active.row, active.col));
    dispatch({
      type: 'SET_CELL',
      payload: {
        row: active.row,
        col: active.col,
        data: {
          ...currentCell,
          format: { ...(currentCell?.format || {}), ...format },
        }
      }
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
      
      <div className={styles.separator} />
      
      <select 
        className={styles.fontSelect}
        onChange={(e) => applyFormat({ fontSize: parseInt(e.target.value) })}
        defaultValue="12"
      >
        <option value="10">10px</option>
        <option value="12">12px</option>
        <option value="14">14px</option>
        <option value="16">16px</option>
        <option value="18">18px</option>
        <option value="24">24px</option>
      </select>
      
      <div className={styles.separator} />
      
      <input
        type="color"
        className={styles.colorPicker}
        onChange={(e) => applyFormat({ color: e.target.value })}
        title="Text Color"
      />
      
      <input
        type="color"
        className={styles.colorPicker}
        onChange={(e) => applyFormat({ background: e.target.value })}
        title="Background Color"
      />
      
      <div className={styles.separator} />
      
      <button 
        className={styles.formatButton}
        onClick={() => applyFormat({ align: 'left' })}
        title="Align Left"
      >
        ⬅
      </button>
      
      <button 
        className={styles.formatButton}
        onClick={() => applyFormat({ align: 'center' })}
        title="Align Center"
      >
        ↔
      </button>
      
      <button 
        className={styles.formatButton}
        onClick={() => applyFormat({ align: 'right' })}
        title="Align Right"
      >
        ➡
      </button>
    </div>
  );
};