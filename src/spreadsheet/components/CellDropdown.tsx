import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ValidationRule } from '../types/spreadsheet';
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
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Get dropdown options from validation rule
  const options = useMemo(() => {
    if (!validation.list) return [];
    
    let allOptions = [...validation.list];
    
    // Add current value if it's not in the list and custom values are allowed
    if (validation.allowCustomValues !== false && currentValue && !allOptions.includes(currentValue)) {
      allOptions.unshift(currentValue);
    }
    
    // Filter options based on search term
    if (searchTerm && validation.searchable !== false) {
      allOptions = allOptions.filter(option =>
        option.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    return allOptions;
  }, [validation.list, validation.allowCustomValues, validation.searchable, currentValue, searchTerm]);

  // Handle keyboard navigation
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
  }, [selectedIndex, options, searchTerm, validation.allowCustomValues, onClose]);

  // Handle clicks outside dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  // Focus search input on mount
  useEffect(() => {
    if (validation.searchable !== false && searchInputRef.current) {
      searchInputRef.current.focus();
      // Pre-populate with current value for editing
      if (currentValue) {
        setSearchTerm(currentValue);
        searchInputRef.current.select();
      }
    }
  }, [validation.searchable, currentValue]);

  const handleSelect = (value: string) => {
    if (validation.multiSelect) {
      // Handle multi-select (comma-separated values)
      const currentValues = currentValue ? currentValue.split(',').map(v => v.trim()) : [];
      if (currentValues.includes(value)) {
        // Remove if already selected
        const newValues = currentValues.filter(v => v !== value);
        onSelect(newValues.join(', '));
      } else {
        // Add to selection
        onSelect([...currentValues, value].join(', '));
      }
    } else {
      onSelect(value);
      onClose();
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setSelectedIndex(-1); // Reset selection when searching
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    // Prevent default behavior for arrow keys to let parent handler manage navigation
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

  // Adjust position if dropdown would go off screen
  if (typeof window !== 'undefined') {
    const maxHeight = 300;
    const availableSpaceBelow = window.innerHeight - (position.y + cellHeight);
    const availableSpaceAbove = position.y;

    if (availableSpaceBelow < maxHeight && availableSpaceAbove > availableSpaceBelow) {
      // Show above cell
      dropdownStyle.top = position.y - maxHeight;
    }

    // Adjust horizontal position if needed
    const availableSpaceRight = window.innerWidth - position.x;
    if (availableSpaceRight < cellWidth) {
      dropdownStyle.left = Math.max(0, position.x - (cellWidth - availableSpaceRight));
    }
  }

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
                Use "{searchTerm}"
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

        {/* Show "Add custom value" option if allowed and search term doesn't match any option */}
        {validation.allowCustomValues !== false && 
         searchTerm && 
         !options.some(opt => opt.toLowerCase() === searchTerm.toLowerCase()) && (
          <div className={styles.separator} />
        )}
        {validation.allowCustomValues !== false && 
         searchTerm && 
         !options.some(opt => opt.toLowerCase() === searchTerm.toLowerCase()) && (
          <div
            className={`${styles.option} ${styles.customOption} ${
              selectedIndex === options.length ? styles.highlighted : ''
            }`}
            onClick={() => handleSelect(searchTerm)}
            onMouseEnter={() => setSelectedIndex(options.length)}
          >
            <span className={styles.addIcon}>+</span>
            <span className={styles.optionText}>Add "{searchTerm}"</span>
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