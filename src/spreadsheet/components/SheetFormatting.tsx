import React, { useContext, useState } from 'react';
import { SpreadsheetContext } from '../SpreadsheetContextPersisted';
import { useSpreadsheetEnhanced } from '../SpreadsheetContextEnhanced';
import { SheetFormatting } from '../types/spreadsheet';
import styles from './SheetFormatting.module.css';

interface SheetFormattingProps {
  className?: string;
}

export const SheetFormattingPanel: React.FC<SheetFormattingProps> = ({ className }) => {
  const [isVisible, setIsVisible] = useState(false);
  
  // Try persisted context first, fall back to enhanced
  const persistedContext = useContext(SpreadsheetContext);
  const enhancedContext = persistedContext ? null : useSpreadsheetEnhanced();
  const context = persistedContext || enhancedContext;
  
  if (!context) {
    return null;
  }
  
  const { state, dispatch } = context;
  const sheetFormatting = state.sheetFormatting || {};
  
  const updateSheetFormatting = (updates: Partial<SheetFormatting>) => {
    dispatch({
      type: 'UPDATE_SHEET_FORMATTING',
      payload: updates,
    });
  };

  const predefinedThemes = [
    { name: 'Default', colors: { primary: '#1a73e8', background: '#ffffff', text: '#202124' } },
    { name: 'Dark', colors: { primary: '#8ab4f8', background: '#202124', text: '#e8eaed' } },
    { name: 'Blue', colors: { primary: '#1976d2', background: '#e3f2fd', text: '#0d47a1' } },
    { name: 'Green', colors: { primary: '#388e3c', background: '#e8f5e8', text: '#1b5e20' } },
    { name: 'Purple', colors: { primary: '#7b1fa2', background: '#f3e5f5', text: '#4a148c' } },
  ];

  const defaultFonts = [
    'Arial',
    'Helvetica',
    'Times New Roman',
    'Courier New',
    'Verdana',
    'Georgia',
    'Calibri',
    'Roboto',
  ];

  if (!isVisible) {
    return (
      <button
        className={styles.toggleButton}
        onClick={() => setIsVisible(true)}
        title="Sheet Formatting Options"
      >
        🎨 Format Sheet
      </button>
    );
  }

  return (
    <div className={`${styles.panel} ${className || ''}`}>
      <div className={styles.header}>
        <h3>Sheet Formatting</h3>
        <button
          className={styles.closeButton}
          onClick={() => setIsVisible(false)}
          title="Close"
        >
          ✕
        </button>
      </div>

      <div className={styles.content}>
        {/* Theme Selection */}
        <div className={styles.section}>
          <h4>Theme</h4>
          <div className={styles.themeGrid}>
            {predefinedThemes.map((theme) => (
              <button
                key={theme.name}
                className={`${styles.themeButton} ${
                  sheetFormatting.theme === theme.name ? styles.active : ''
                }`}
                onClick={() => updateSheetFormatting({ theme: theme.name })}
                style={{
                  backgroundColor: theme.colors.background,
                  color: theme.colors.text,
                  borderColor: theme.colors.primary,
                }}
              >
                {theme.name}
              </button>
            ))}
          </div>
        </div>

        {/* Gridlines */}
        <div className={styles.section}>
          <h4>Display Options</h4>
          <label className={styles.checkbox}>
            <input
              type="checkbox"
              checked={sheetFormatting.showGridlines !== false}
              onChange={(e) => updateSheetFormatting({ showGridlines: e.target.checked })}
            />
            Show gridlines
          </label>
        </div>

        {/* Freeze Panes */}
        <div className={styles.section}>
          <h4>Freeze Panes</h4>
          <div className={styles.freezeControls}>
            <label>
              Freeze rows:
              <input
                type="number"
                min="0"
                max="10"
                value={sheetFormatting.frozenRows || 0}
                onChange={(e) => updateSheetFormatting({ frozenRows: parseInt(e.target.value) || 0 })}
                className={styles.numberInput}
              />
            </label>
            <label>
              Freeze columns:
              <input
                type="number"
                min="0"
                max="10"
                value={sheetFormatting.frozenCols || 0}
                onChange={(e) => updateSheetFormatting({ frozenCols: parseInt(e.target.value) || 0 })}
                className={styles.numberInput}
              />
            </label>
          </div>
        </div>

        {/* Default Dimensions */}
        <div className={styles.section}>
          <h4>Default Dimensions</h4>
          <div className={styles.dimensionControls}>
            <label>
              Row height:
              <input
                type="number"
                min="20"
                max="100"
                value={sheetFormatting.defaultRowHeight || 28}
                onChange={(e) => updateSheetFormatting({ defaultRowHeight: parseInt(e.target.value) || 28 })}
                className={styles.numberInput}
              />
              px
            </label>
            <label>
              Column width:
              <input
                type="number"
                min="50"
                max="300"
                value={sheetFormatting.defaultColWidth || 100}
                onChange={(e) => updateSheetFormatting({ defaultColWidth: parseInt(e.target.value) || 100 })}
                className={styles.numberInput}
              />
              px
            </label>
          </div>
        </div>

        {/* Default Font */}
        <div className={styles.section}>
          <h4>Default Font</h4>
          <div className={styles.fontControls}>
            <label>
              Font family:
              <select
                value={sheetFormatting.defaultFont?.family || 'Arial'}
                onChange={(e) => updateSheetFormatting({
                  defaultFont: {
                    ...sheetFormatting.defaultFont,
                    family: e.target.value,
                    size: sheetFormatting.defaultFont?.size || 11,
                    color: sheetFormatting.defaultFont?.color || '#000000',
                  }
                })}
                className={styles.fontSelect}
              >
                {defaultFonts.map(font => (
                  <option key={font} value={font}>{font}</option>
                ))}
              </select>
            </label>
            <label>
              Font size:
              <input
                type="number"
                min="8"
                max="72"
                value={sheetFormatting.defaultFont?.size || 11}
                onChange={(e) => updateSheetFormatting({
                  defaultFont: {
                    ...sheetFormatting.defaultFont,
                    family: sheetFormatting.defaultFont?.family || 'Arial',
                    size: parseInt(e.target.value) || 11,
                    color: sheetFormatting.defaultFont?.color || '#000000',
                  }
                })}
                className={styles.numberInput}
              />
              pt
            </label>
            <label>
              Font color:
              <input
                type="color"
                value={sheetFormatting.defaultFont?.color || '#000000'}
                onChange={(e) => updateSheetFormatting({
                  defaultFont: {
                    ...sheetFormatting.defaultFont,
                    family: sheetFormatting.defaultFont?.family || 'Arial',
                    size: sheetFormatting.defaultFont?.size || 11,
                    color: e.target.value,
                  }
                })}
                className={styles.colorInput}
              />
            </label>
          </div>
        </div>

        {/* Quick Actions */}
        <div className={styles.section}>
          <h4>Quick Actions</h4>
          <div className={styles.quickActions}>
            <button
              className={styles.actionButton}
              onClick={() => updateSheetFormatting({
                showGridlines: true,
                frozenRows: 0,
                frozenCols: 0,
                theme: 'Default',
                defaultRowHeight: 28,
                defaultColWidth: 100,
                defaultFont: { family: 'Arial', size: 11, color: '#000000' }
              })}
            >
              Reset to Defaults
            </button>
            <button
              className={styles.actionButton}
              onClick={() => updateSheetFormatting({
                frozenRows: 1,
                frozenCols: 1,
              })}
            >
              Freeze Headers
            </button>
            <button
              className={styles.actionButton}
              onClick={() => updateSheetFormatting({
                showGridlines: false,
                theme: 'Dark',
              })}
            >
              Presentation Mode
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Hook for applying sheet formatting to the table
export const useSheetFormatting = () => {
  const persistedContext = useContext(SpreadsheetContext);
  const enhancedContext = persistedContext ? null : useSpreadsheetEnhanced();
  const context = persistedContext || enhancedContext;

  if (!context) {
    return null;
  }

  const { state } = context;
  const sheetFormatting = state.sheetFormatting || {};

  const getSheetStyle = (): React.CSSProperties => {
    const selectedTheme = predefinedThemes.find(t => t.name === sheetFormatting.theme) || predefinedThemes[0];
    
    return {
      backgroundColor: selectedTheme.colors.background,
      color: selectedTheme.colors.text,
      fontFamily: sheetFormatting.defaultFont?.family || 'Arial',
      fontSize: `${sheetFormatting.defaultFont?.size || 11}px`,
      '--primary-color': selectedTheme.colors.primary,
      '--gridline-display': sheetFormatting.showGridlines !== false ? 'block' : 'none',
    } as React.CSSProperties;
  };

  const getDefaultCellStyle = (): React.CSSProperties => {
    return {
      height: `${sheetFormatting.defaultRowHeight || 28}px`,
      width: `${sheetFormatting.defaultColWidth || 100}px`,
      fontFamily: sheetFormatting.defaultFont?.family || 'Arial',
      fontSize: `${sheetFormatting.defaultFont?.size || 11}px`,
      color: sheetFormatting.defaultFont?.color || '#000000',
    };
  };

  return {
    sheetFormatting,
    getSheetStyle,
    getDefaultCellStyle,
    frozenRows: sheetFormatting.frozenRows || 0,
    frozenCols: sheetFormatting.frozenCols || 0,
  };
};

const predefinedThemes = [
  { name: 'Default', colors: { primary: '#1a73e8', background: '#ffffff', text: '#202124' } },
  { name: 'Dark', colors: { primary: '#8ab4f8', background: '#202124', text: '#e8eaed' } },
  { name: 'Blue', colors: { primary: '#1976d2', background: '#e3f2fd', text: '#0d47a1' } },
  { name: 'Green', colors: { primary: '#388e3c', background: '#e8f5e8', text: '#1b5e20' } },
  { name: 'Purple', colors: { primary: '#7b1fa2', background: '#f3e5f5', text: '#4a148c' } },
];