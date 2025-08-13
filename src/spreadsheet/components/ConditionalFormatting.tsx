import React, { useState, useContext } from 'react';
import { SpreadsheetContext } from '../SpreadsheetContextPersisted';
import { useSpreadsheetEnhanced } from '../SpreadsheetContextEnhanced';
import { ConditionalFormat, SelectionRect } from '../types/spreadsheet';
import styles from './ConditionalFormatting.module.css';

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
  const [activeTab, setActiveTab] = useState<'rules' | 'templates' | 'dfir'>('rules');
  const [currentRule, setCurrentRule] = useState<ConditionalFormat>({
    type: 'cellValue',
    condition: 'greaterThan',
    value1: '',
    format: {
      backgroundColor: '#ff9999',
      color: '#000000',
    }
  });

  // Try persisted context first, fall back to enhanced
  const persistedContext = useContext(SpreadsheetContext);
  const enhancedContext = persistedContext ? null : useSpreadsheetEnhanced();
  const context = persistedContext || enhancedContext;

  if (!context || !isVisible) {
    return null;
  }

  const { state, setCell } = context;

  const applyConditionalFormat = (rule: ConditionalFormat, range?: SelectionRect) => {
    const targetRange = range || selectedRange || {
      startRow: 0,
      startCol: 0,
      endRow: Math.min(state.maxRows - 1, 100),
      endCol: Math.min(state.maxCols - 1, 10)
    };

    for (let row = targetRange.startRow; row <= targetRange.endRow; row++) {
      for (let col = targetRange.startCol; col <= targetRange.endCol; col++) {
        const cellKey = `${row}:${col}`;
        const existingCell = state.data.get(cellKey);
        
        setCell(row, col, {
          value: existingCell?.value || '',
          format: {
            ...existingCell?.format,
            conditionalFormat: rule
          }
        });
      }
    }
    
    onClose();
  };

  const predefinedRules = [
    {
      name: 'Highlight Duplicates',
      description: 'Highlight duplicate values in red',
      rule: {
        type: 'formula' as const,
        condition: 'equal' as const,
        value1: 'COUNTIF(range, value) > 1',
        format: { backgroundColor: '#ff9999', color: '#000000' }
      }
    },
    {
      name: 'Top 10 Values',
      description: 'Highlight top 10 highest values',
      rule: {
        type: 'cellValue' as const,
        condition: 'greaterThan' as const,
        value1: 'PERCENTILE(range, 0.9)',
        format: { backgroundColor: '#99ff99', color: '#000000' }
      }
    },
    {
      name: 'Bottom 10 Values',  
      description: 'Highlight bottom 10 lowest values',
      rule: {
        type: 'cellValue' as const,
        condition: 'lessThan' as const,
        value1: 'PERCENTILE(range, 0.1)',
        format: { backgroundColor: '#ffcccc', color: '#000000' }
      }
    },
    {
      name: 'Above Average',
      description: 'Highlight values above average',
      rule: {
        type: 'cellValue' as const,
        condition: 'greaterThan' as const,
        value1: 'AVERAGE(range)',
        format: { backgroundColor: '#cce5ff', color: '#000000' }
      }
    }
  ];

  const dfirRules = [
    {
      name: 'Critical Severity',
      description: 'Red background for critical/high severity items',
      rule: {
        type: 'textContains' as const,
        condition: 'contains' as const,
        value1: 'critical,high,severe',
        format: { backgroundColor: '#ff4444', color: '#ffffff', bold: true }
      }
    },
    {
      name: 'Malicious IOCs',
      description: 'Highlight known malicious indicators',
      rule: {
        type: 'textContains' as const,
        condition: 'contains' as const,
        value1: 'malware,trojan,backdoor,suspicious',
        format: { backgroundColor: '#ff6b6b', color: '#ffffff', bold: true }
      }
    },
    {
      name: 'Recent Timestamps',
      description: 'Highlight activity in last 24 hours',
      rule: {
        type: 'dateOccurring' as const,
        condition: 'greaterThan' as const,
        value1: 'TODAY()-1',
        format: { backgroundColor: '#4ecdc4', color: '#000000' }
      }
    },
    {
      name: 'External IPs',
      description: 'Highlight external IP addresses',
      rule: {
        type: 'formula' as const,
        condition: 'equal' as const,
        value1: 'NOT(OR(LEFT(A1,3)="10.",LEFT(A1,4)="172.",LEFT(A1,4)="192.",LEFT(A1,4)="127."))',
        format: { backgroundColor: '#fff3cd', color: '#856404' }
      }
    },
    {
      name: 'Suspicious File Extensions',
      description: 'Highlight potentially dangerous file types',
      rule: {
        type: 'textContains' as const,
        condition: 'endsWith' as const,
        value1: '.exe,.scr,.bat,.cmd,.pif,.com,.vbs,.js',
        format: { backgroundColor: '#f8d7da', color: '#721c24' }
      }
    },
    {
      name: 'Hash Values',
      description: 'Highlight cells containing hash values (MD5/SHA)',
      rule: {
        type: 'formula' as const,
        condition: 'equal' as const,
        value1: 'OR(LEN(A1)=32,LEN(A1)=40,LEN(A1)=64)',
        format: { backgroundColor: '#d1ecf1', color: '#0c5460', fontFamily: 'monospace' }
      }
    },
    {
      name: 'Empty Evidence Fields',
      description: 'Highlight missing critical evidence',
      rule: {
        type: 'cellValue' as const,
        condition: 'equal' as const,
        value1: '',
        format: { backgroundColor: '#f5c6cb', color: '#721c24', strikethrough: true }
      }
    }
  ];

  if (!isVisible) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <div className={styles.header}>
          <h3>Conditional Formatting</h3>
          <button className={styles.closeButton} onClick={onClose}>✕</button>
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
          <button 
            className={`${styles.tab} ${activeTab === 'dfir' ? styles.active : ''}`}
            onClick={() => setActiveTab('dfir')}
          >
            DFIR Rules
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

          {activeTab === 'dfir' && (
            <div className={styles.dfirTab}>
              <p className={styles.description}>
                Specialized conditional formatting rules for Digital Forensics and Incident Response:
              </p>
              
              <div className={styles.dfirRulesList}>
                {dfirRules.map((rule, index) => (
                  <div key={index} className={styles.dfirRuleCard}>
                    <div className={styles.dfirRuleHeader}>
                      <h4>{rule.name}</h4>
                      <div 
                        className={styles.dfirRulePreview}
                        style={{
                          backgroundColor: rule.rule.format.backgroundColor,
                          color: rule.rule.format.color,
                          fontWeight: rule.rule.format.bold ? 'bold' : 'normal',
                          fontFamily: rule.rule.format.fontFamily
                        }}
                      >
                        Sample
                      </div>
                    </div>
                    <p className={styles.dfirRuleDescription}>{rule.description}</p>
                    <button 
                      className={styles.dfirRuleButton}
                      onClick={() => applyConditionalFormat(rule.rule)}
                    >
                      Apply DFIR Rule
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

// Component to trigger the conditional formatting panel
export const ConditionalFormattingButton: React.FC = () => {
  const [showPanel, setShowPanel] = useState(false);

  return (
    <>
      <button
        className={styles.triggerButton}
        onClick={() => setShowPanel(true)}
        title="Conditional Formatting"
      >
        🎨 Conditional Formatting
      </button>

      <ConditionalFormattingPanel
        isVisible={showPanel}
        onClose={() => setShowPanel(false)}
      />
    </>
  );
};