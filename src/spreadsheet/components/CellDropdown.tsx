import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { ValidationRule } from '../types/spreadsheet';
import { useClickOutside } from '../hooks/useClickOutside';
import styles from './CellDropdown.module.css';

interface CellDropdownProps {
  validation: ValidationRule;
  currentValue: string;
  onSelect: (value: string) => void;
  onClose: () => void;
  position: { x: number; y: number };
  cellWidth: number;
  cellHeight: number;
}

export const CellDropdown: React.FC<CellDropdownProps> = ({
  validation,
  currentValue,
  onSelect,
  onClose,
  position,
  cellWidth,
  cellHeight,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [selectedValues, setSelectedValues] = useState<string[]>(
    currentValue ? currentValue.split(',').map((v) => v.trim()).filter(Boolean) : []
  );
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const options = useMemo(() => {
    if (!validation.list) return [];
    
    let allOptions = [...validation.list];
    
    if (validation.allowCustomValues !== false && currentValue && !allOptions.includes(currentValue)) {
      allOptions.unshift(currentValue);
    }
    
    if (searchTerm && validation.searchable !== false) {
      allOptions = allOptions.filter(option =>
        option.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    return allOptions;
  }, [validation.list, validation.allowCustomValues, validation.searchable, currentValue, searchTerm]);

  const handleSelect = useCallback((value: string) => {
    if (validation.multiSelect) {
      // Comma-separated values; picks accumulate while the dropdown is open
      const newValues = selectedValues.includes(value)
        ? selectedValues.filter(v => v !== value)
        : [...selectedValues, value];
      setSelectedValues(newValues);
      onSelect(newValues.join(', '));
    } else {
      onSelect(value);
      onClose();
    }
  }, [validation.multiSelect, selectedValues, onSelect, onClose]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => Math.min(prev + 1, options.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => Math.max(prev - 1, -1));
          break;
        case 'Enter':
          e.preventDefault();
          if (selectedIndex >= 0 && selectedIndex < options.length) {
            handleSelect(options[selectedIndex]);
          } else if (validation.allowCustomValues !== false && searchTerm) {
            handleSelect(searchTerm);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
        case 'Tab':
          onClose();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedIndex, options, searchTerm, validation.allowCustomValues, handleSelect, onClose]);

  useClickOutside(dropdownRef, onClose);

  useEffect(() => {
    if (validation.searchable !== false && searchInputRef.current) {
      searchInputRef.current.focus();
      if (currentValue) {
        setSearchTerm(currentValue);
        searchInputRef.current.select();
      }
    }
  }, [validation.searchable, currentValue]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setSelectedIndex(-1); // Reset selection when searching
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
    }
  };

  const isSelected = (option: string): boolean => {
    if (validation.multiSelect) {
      const currentValues = currentValue ? currentValue.split(',').map(v => v.trim()) : [];
      return currentValues.includes(option);
    }
    return option === currentValue;
  };

  const dropdownStyle: React.CSSProperties = {
    position: 'absolute',
    left: position.x,
    top: position.y + cellHeight,
    minWidth: cellWidth,
    zIndex: 1000,
  };

  if (typeof window !== 'undefined') {
    const maxHeight = 300;
    const availableSpaceBelow = window.innerHeight - (position.y + cellHeight);
    const availableSpaceAbove = position.y;

    if (availableSpaceBelow < maxHeight && availableSpaceAbove > availableSpaceBelow) {
      dropdownStyle.top = position.y - maxHeight;
    }

    const availableSpaceRight = window.innerWidth - position.x;
    if (availableSpaceRight < cellWidth) {
      dropdownStyle.left = Math.max(0, position.x - (cellWidth - availableSpaceRight));
    }
  }

  const offerCustom = validation.allowCustomValues !== false && searchTerm !== ''
    && !options.some((opt) => opt.toLowerCase() === searchTerm.toLowerCase());

  return (
    <div
      ref={dropdownRef}
      className={styles.dropdown}
      style={dropdownStyle}
    >
      {validation.searchable !== false && (
        <div className={styles.searchContainer}>
          <input
            ref={searchInputRef}
            type="text"
            value={searchTerm}
            onChange={handleSearchChange}
            onKeyDown={handleSearchKeyDown}
            className={styles.searchInput}
            placeholder={`Search ${validation.type === 'list' ? 'options' : 'values'}...`}
          />
        </div>
      )}

      <div className={styles.optionsList}>
        {options.length === 0 ? (
          <div className={styles.noOptions}>
            {searchTerm ? 'No matching options' : 'No options available'}
            {validation.allowCustomValues !== false && searchTerm && (
              <button
                className={styles.customOption}
                onClick={() => handleSelect(searchTerm)}
              >
                Use &quot;{searchTerm}&quot;
              </button>
            )}
          </div>
        ) : (
          options.map((option, index) => (
            <div
              key={option}
              className={`${styles.option} ${
                index === selectedIndex ? styles.highlighted : ''
              } ${isSelected(option) ? styles.selected : ''}`}
              onClick={() => handleSelect(option)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              {validation.multiSelect && (
                <div className={`${styles.checkbox} ${isSelected(option) ? styles.checked : ''}`}>
                  {isSelected(option) && '✓'}
                </div>
              )}
              <span className={styles.optionText}>{option}</span>
            </div>
          ))
        )}

        {offerCustom && <div className={styles.separator} />}
        {offerCustom && (
          <div
            className={`${styles.option} ${styles.customOption} ${
              selectedIndex === options.length ? styles.highlighted : ''
            }`}
            onClick={() => handleSelect(searchTerm)}
            onMouseEnter={() => setSelectedIndex(options.length)}
          >
            <span className={styles.addIcon}>+</span>
            <span className={styles.optionText}>Add &quot;{searchTerm}&quot;</span>
          </div>
        )}
      </div>

      {validation.multiSelect && (
        <div className={styles.footer}>
          <button 
            className={styles.doneButton}
            onClick={onClose}
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
};