import React, { useState, useRef, useEffect } from 'react';
import { FilterRule } from '../types/spreadsheet';
import { useClickOutside } from '../hooks/useClickOutside';
import { CloseIcon } from './icons';
import styles from './ColumnFilter.module.css';

interface ColumnFilterProps {
  column: number;
  columnData: { value: any; count: number }[];
  existingFilters: FilterRule[];
  onFilterChange: (filters: FilterRule[]) => void;
  onClose: () => void;
  position: { x: number; y: number };
}

export const ColumnFilter: React.FC<ColumnFilterProps> = ({
  column,
  columnData,
  existingFilters,
  onFilterChange,
  onClose,
  position,
}) => {
  const [activeTab, setActiveTab] = useState<'values' | 'conditions'>('values');
  const [selectedValues, setSelectedValues] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [customRule, setCustomRule] = useState<Partial<FilterRule>>({
    column,
    type: 'text',
    condition: 'contains',
    value: '',
    caseSensitive: false
  });
  
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const existingFilter = existingFilters.find(f => f.column === column);
    if (!existingFilter) {
      const allValues = new Set(columnData.map(item => String(item.value)));
      setSelectedValues(allValues);
    }
  }, [column, existingFilters, columnData]);

  useClickOutside(dropdownRef, onClose);

  const filteredData = columnData.filter(item =>
    String(item.value).toLowerCase().includes(searchText.toLowerCase())
  );

  const handleValueToggle = (value: string) => {
    const newSelected = new Set(selectedValues);
    if (newSelected.has(value)) {
      newSelected.delete(value);
    } else {
      newSelected.add(value);
    }
    setSelectedValues(newSelected);
    setSelectAll(newSelected.size === columnData.length);
  };

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedValues(new Set());
    } else {
      setSelectedValues(new Set(columnData.map(item => String(item.value))));
    }
    setSelectAll(!selectAll);
  };

  const applyValueFilter = () => {
    const newFilters = existingFilters.filter(f => f.column !== column);
    
    if (selectedValues.size < columnData.length) {
      const unselectedValues = columnData
        .filter(item => !selectedValues.has(String(item.value)))
        .map(item => item.value);

      unselectedValues.forEach(value => {
        newFilters.push({
          column,
          type: 'text',
          condition: 'notEquals',
          value,
          caseSensitive: false
        });
      });
    }

    onFilterChange(newFilters);
    onClose();
  };

  const applyCustomFilter = () => {
    if (!customRule.condition || customRule.value === undefined || customRule.value === '') {
      return;
    }

    const newFilters = existingFilters.filter(f => f.column !== column);
    newFilters.push(customRule as FilterRule);
    
    onFilterChange(newFilters);
    onClose();
  };

  const clearFilter = () => {
    const newFilters = existingFilters.filter(f => f.column !== column);
    onFilterChange(newFilters);
    onClose();
  };


  return (
    <div 
      ref={dropdownRef}
      className={styles.filterDropdown}
      style={{
        position: 'fixed',
        // A sentinel x of 999999 means "no anchor point"; right-anchor the
        // panel near the toolbar instead of at literal coordinates
        left: position.x >= 900000 ? undefined : position.x,
        top: position.x >= 900000 ? undefined : position.y,
        right: position.x >= 900000 ? 16 : undefined,
        bottom: position.x >= 900000 ? 56 : undefined,
        zIndex: 1000
      }}
    >
      <div className={styles.header}>
        <h3>Filter Column {column + 1}</h3>
        <button className={styles.closeButton} onClick={onClose} title="Close" aria-label="Close"><CloseIcon /></button>
      </div>

      <div className={styles.tabs}>
        <button 
          className={`${styles.tab} ${activeTab === 'values' ? styles.active : ''}`}
          onClick={() => setActiveTab('values')}
        >
          Values
        </button>
        <button 
          className={`${styles.tab} ${activeTab === 'conditions' ? styles.active : ''}`}
          onClick={() => setActiveTab('conditions')}
        >
          Conditions
        </button>
      </div>

      <div className={styles.content}>
        {activeTab === 'values' && (
          <div className={styles.valuesTab}>
            <div className={styles.searchBox}>
              <input
                type="text"
                placeholder="Search values..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className={styles.searchInput}
              />
            </div>

            <div className={styles.selectAllContainer}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={selectAll}
                  onChange={handleSelectAll}
                />
                Select All ({columnData.length} items)
              </label>
            </div>

            <div className={styles.valuesList}>
              {filteredData.map((item) => {
                const valueStr = String(item.value);
                return (
                  <label key={valueStr} className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={selectedValues.has(valueStr)}
                      onChange={() => handleValueToggle(valueStr)}
                    />
                    <span className={styles.valueText}>
                      {valueStr || '(Blank)'}
                    </span>
                    <span className={styles.valueCount}>({item.count})</span>
                  </label>
                );
              })}
            </div>

            <div className={styles.actions}>
              <button className={styles.applyButton} onClick={applyValueFilter}>
                Apply Filter
              </button>
              <button className={styles.clearButton} onClick={clearFilter}>
                Clear Filter
              </button>
            </div>
          </div>
        )}

        {activeTab === 'conditions' && (
          <div className={styles.conditionsTab}>
            <div className={styles.filterBuilder}>
              <div className={styles.formGroup}>
                <label>Data Type:</label>
                <select 
                  value={customRule.type || 'text'}
                  onChange={(e) => setCustomRule({...customRule, type: e.target.value as FilterRule['type']})}
                  className={styles.select}
                >
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="date">Date</option>
                  <option value="boolean">Boolean</option>
                </select>
              </div>

              <div className={styles.formGroup}>
                <label>Condition:</label>
                <select 
                  value={customRule.condition || 'contains'}
                  onChange={(e) => setCustomRule({...customRule, condition: e.target.value as FilterRule['condition']})}
                  className={styles.select}
                >
                  <option value="equals">Equals</option>
                  <option value="notEquals">Not Equals</option>
                  <option value="contains">Contains</option>
                  <option value="notContains">Not Contains</option>
                  <option value="startsWith">Starts With</option>
                  <option value="endsWith">Ends With</option>
                  <option value="greaterThan">Greater Than</option>
                  <option value="lessThan">Less Than</option>
                  <option value="greaterEqual">Greater or Equal</option>
                  <option value="lessEqual">Less or Equal</option>
                  <option value="between">Between</option>
                  <option value="isEmpty">Is Empty</option>
                  <option value="isNotEmpty">Is Not Empty</option>
                </select>
              </div>

              {!['isEmpty', 'isNotEmpty'].includes(customRule.condition || '') && (
                <div className={styles.formGroup}>
                  <label>Value:</label>
                  <input
                    type={customRule.type === 'number' ? 'number' : 
                          customRule.type === 'date' ? 'date' : 'text'}
                    value={customRule.value || ''}
                    onChange={(e) => setCustomRule({...customRule, value: e.target.value})}
                    className={styles.input}
                    placeholder="Enter filter value..."
                  />
                </div>
              )}

              {customRule.condition === 'between' && (
                <div className={styles.formGroup}>
                  <label>And:</label>
                  <input
                    type={customRule.type === 'number' ? 'number' : 
                          customRule.type === 'date' ? 'date' : 'text'}
                    value={customRule.value2 || ''}
                    onChange={(e) => setCustomRule({...customRule, value2: e.target.value})}
                    className={styles.input}
                    placeholder="Enter second value..."
                  />
                </div>
              )}

              {customRule.type === 'text' && (
                <div className={styles.formGroup}>
                  <label className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={customRule.caseSensitive || false}
                      onChange={(e) => setCustomRule({...customRule, caseSensitive: e.target.checked})}
                    />
                    Case Sensitive
                  </label>
                </div>
              )}
            </div>

            <div className={styles.actions}>
              <button 
                className={styles.applyButton} 
                onClick={applyCustomFilter}
                disabled={!customRule.condition || (
                  !['isEmpty', 'isNotEmpty'].includes(customRule.condition) && 
                  (customRule.value === undefined || customRule.value === '')
                )}
              >
                Apply Condition
              </button>
              <button className={styles.clearButton} onClick={clearFilter}>
                Clear Filter
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};