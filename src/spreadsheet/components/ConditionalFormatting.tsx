import React, { useState } from 'react';
import { useSpreadsheet } from '../SpreadsheetContext';
import { ConditionalFormat, SelectionRect, CellData, keyOf } from '../types/spreadsheet';
import { columnToLetter } from '../utils/columnUtils';
import { CloseIcon } from './icons';
import styles from './ConditionalFormatting.module.css';

const rangeToA1 = (r: SelectionRect) =>
  `${columnToLetter(r.startCol)}${r.startRow + 1}:${columnToLetter(r.endCol)}${r.endRow + 1}`;

interface ConditionalFormattingProps {
  isVisible: boolean;
  onClose: () => void;
  selectedRange?: SelectionRect;
}

export const ConditionalFormattingPanel: React.FC<ConditionalFormattingProps> = ({
  isVisible,
  onClose,
  selectedRange,
}) => {
  const [activeTab, setActiveTab] = useState<'rules' | 'templates'>('rules');
  const [currentRule, setCurrentRule] = useState<ConditionalFormat>({
    type: 'cellValue',
    condition: 'greaterThan',
    value1: '',
    format: {
      backgroundColor: '#ff9999',
      color: '#000000',
    }
  });

  const { state, dispatch } = useSpreadsheet();

  const targetRange = (range?: SelectionRect): SelectionRect => range || selectedRange || {
    startRow: 0,
    startCol: 0,
    endRow: Math.min(state.maxRows - 1, 100),
    endCol: Math.min(state.maxCols - 1, 10),
  };

  const applyConditionalFormat = (rule: ConditionalFormat, range?: SelectionRect) => {
    const target = targetRange(range);
    const updates: Array<{ row: number; col: number; data: Partial<CellData> }> = [];
    for (let row = target.startRow; row <= target.endRow; row++) {
      for (let col = target.startCol; col <= target.endCol; col++) {
        const existing = state.data.get(keyOf(row, col));
        updates.push({ row, col, data: { value: existing?.value ?? '', format: { ...existing?.format, conditionalFormat: rule } } });
      }
    }
    dispatch({ type: 'SET_CELLS', payload: { updates } });
    onClose();
  };

  // Templates are formula rules over the range they are applied to; `value`
  // stands for the cell being tested (see conditionalFormattingUtils)
  const rangeText = rangeToA1(targetRange());
  const predefinedRules: Array<{ name: string; description: string; rule: ConditionalFormat }> = [
    {
      name: 'Duplicates',
      description: 'Values that appear more than once in the range',
      rule: { type: 'formula', condition: 'equal', value1: `COUNTIF(${rangeText}, value) > 1`, format: { backgroundColor: '#ff9999', color: '#000000' } },
    },
    {
      name: 'Above average',
      description: 'Values greater than the average of the range',
      rule: { type: 'formula', condition: 'equal', value1: `value > AVERAGE(${rangeText})`, format: { backgroundColor: '#99ff99', color: '#000000' } },
    },
    {
      name: 'Below average',
      description: 'Values less than the average of the range',
      rule: { type: 'formula', condition: 'equal', value1: `value < AVERAGE(${rangeText})`, format: { backgroundColor: '#ffcccc', color: '#000000' } },
    },
    {
      name: 'Empty cells',
      description: 'Cells with nothing in them',
      rule: { type: 'formula', condition: 'equal', value1: 'value = ""', format: { backgroundColor: '#fff3cd', color: '#000000' } },
    },
  ];

  if (!isVisible) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <div className={styles.header}>
          <h3>Conditional Formatting</h3>
          <button className={styles.closeButton} onClick={onClose} title="Close" aria-label="Close"><CloseIcon /></button>
        </div>

        <div className={styles.tabs}>
          <button 
            className={`${styles.tab} ${activeTab === 'rules' ? styles.active : ''}`}
            onClick={() => setActiveTab('rules')}
          >
            Custom Rules
          </button>
          <button 
            className={`${styles.tab} ${activeTab === 'templates' ? styles.active : ''}`}
            onClick={() => setActiveTab('templates')}
          >
            Templates
          </button>
        </div>

        <div className={styles.content}>
          {activeTab === 'rules' && (
            <div className={styles.rulesTab}>
              <div className={styles.ruleBuilder}>
                <div className={styles.formGroup}>
                  <label>Rule Type:</label>
                  <select 
                    value={currentRule.type}
                    onChange={(e) => setCurrentRule({
                      ...currentRule, 
                      type: e.target.value as ConditionalFormat['type']
                    })}
                    className={styles.select}
                  >
                    <option value="cellValue">Cell Value</option>
                    <option value="textContains">Text Contains</option>
                    <option value="dateOccurring">Date Occurring</option>
                    <option value="formula">Custom Formula</option>
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label>Condition:</label>
                  <select 
                    value={currentRule.condition}
                    onChange={(e) => setCurrentRule({
                      ...currentRule, 
                      condition: e.target.value as ConditionalFormat['condition']
                    })}
                    className={styles.select}
                  >
                    <option value="greaterThan">Greater Than</option>
                    <option value="lessThan">Less Than</option>
                    <option value="between">Between</option>
                    <option value="equal">Equal To</option>
                    <option value="notEqual">Not Equal To</option>
                    <option value="contains">Contains</option>
                    <option value="startsWith">Starts With</option>
                    <option value="endsWith">Ends With</option>
                  </select>
                </div>

                <div className={styles.formGroup}>
                  <label>Value:</label>
                  <input
                    type="text"
                    value={currentRule.value1 || ''}
                    onChange={(e) => setCurrentRule({...currentRule, value1: e.target.value})}
                    className={styles.input}
                    placeholder="Enter value or formula..."
                  />
                </div>

                {currentRule.condition === 'between' && (
                  <div className={styles.formGroup}>
                    <label>And:</label>
                    <input
                      type="text"
                      value={currentRule.value2 || ''}
                      onChange={(e) => setCurrentRule({...currentRule, value2: e.target.value})}
                      className={styles.input}
                      placeholder="Enter second value..."
                    />
                  </div>
                )}

                <div className={styles.formatSection}>
                  <h4>Format Options</h4>
                  <div className={styles.formatGrid}>
                    <div className={styles.formGroup}>
                      <label>Background:</label>
                      <input
                        type="color"
                        value={currentRule.format.backgroundColor || '#ffffff'}
                        onChange={(e) => setCurrentRule({
                          ...currentRule,
                          format: { ...currentRule.format, backgroundColor: e.target.value }
                        })}
                        className={styles.colorInput}
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <label>Text Color:</label>
                      <input
                        type="color"
                        value={currentRule.format.color || '#000000'}
                        onChange={(e) => setCurrentRule({
                          ...currentRule,
                          format: { ...currentRule.format, color: e.target.value }
                        })}
                        className={styles.colorInput}
                      />
                    </div>
                  </div>

                  <div className={styles.styleOptions}>
                    <label className={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        checked={currentRule.format.bold || false}
                        onChange={(e) => setCurrentRule({
                          ...currentRule,
                          format: { ...currentRule.format, bold: e.target.checked }
                        })}
                      />
                      Bold
                    </label>
                    <label className={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        checked={currentRule.format.italic || false}
                        onChange={(e) => setCurrentRule({
                          ...currentRule,
                          format: { ...currentRule.format, italic: e.target.checked }
                        })}
                      />
                      Italic
                    </label>
                    <label className={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        checked={currentRule.format.underline || false}
                        onChange={(e) => setCurrentRule({
                          ...currentRule,
                          format: { ...currentRule.format, underline: e.target.checked }
                        })}
                      />
                      Underline
                    </label>
                  </div>
                </div>

                <div className={styles.preview}>
                  <label>Preview:</label>
                  <div 
                    className={styles.previewCell}
                    style={{
                      backgroundColor: currentRule.format.backgroundColor,
                      color: currentRule.format.color,
                      fontWeight: currentRule.format.bold ? 'bold' : 'normal',
                      fontStyle: currentRule.format.italic ? 'italic' : 'normal',
                      textDecoration: currentRule.format.underline ? 'underline' : 'none',
                    }}
                  >
                    Sample Text
                  </div>
                </div>

                <button 
                  className={styles.applyButton}
                  onClick={() => applyConditionalFormat(currentRule)}
                >
                  Apply Rule
                </button>
              </div>
            </div>
          )}

          {activeTab === 'templates' && (
            <div className={styles.templatesTab}>
              <p className={styles.description}>
                Quick formatting templates for common data analysis scenarios:
              </p>
              
              <div className={styles.templatesList}>
                {predefinedRules.map((template, index) => (
                  <div key={index} className={styles.templateCard}>
                    <div className={styles.templateHeader}>
                      <h4>{template.name}</h4>
                      <div 
                        className={styles.templatePreview}
                        style={{
                          backgroundColor: template.rule.format.backgroundColor,
                          color: template.rule.format.color
                        }}
                      />
                    </div>
                    <p className={styles.templateDescription}>{template.description}</p>
                    <button 
                      className={styles.templateButton}
                      onClick={() => applyConditionalFormat(template.rule)}
                    >
                      Apply Template
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
