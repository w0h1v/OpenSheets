import React, { useState, useRef } from 'react';
import { FilterRule, SparseMatrix, CellData } from '../types/spreadsheet';
import { getColumnUniqueValues } from '../utils/filterUtils';
import { ColumnFilter } from './ColumnFilter';
import styles from './FilterButton.module.css';

interface FilterButtonProps {
  column: number;
  data: SparseMatrix<CellData>;
  maxRows: number;
  existingFilters: FilterRule[];
  onFilterChange: (filters: FilterRule[]) => void;
  hasActiveFilter?: boolean;
}

export const FilterButton: React.FC<FilterButtonProps> = ({
  column,
  data,
  maxRows,
  existingFilters,
  onFilterChange,
  hasActiveFilter = false,
}) => {
  const [showFilter, setShowFilter] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ x: 0, y: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleFilterClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    
    if (!showFilter && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        x: rect.left,
        y: rect.bottom + 4
      });
    }
    
    setShowFilter(!showFilter);
  };

  const handleFilterChange = (filters: FilterRule[]) => {
    onFilterChange(filters);
    setShowFilter(false);
  };

  const columnData = getColumnUniqueValues(data, column, maxRows);

  return (
    <>
      <button
        ref={buttonRef}
        className={`${styles.filterButton} ${hasActiveFilter ? styles.active : ''}`}
        onClick={handleFilterClick}
        title={`Filter column ${column + 1}`}
        aria-expanded={showFilter}
        aria-haspopup="true"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" className={styles.filterIcon}>
          <path
            d="M1 2h10l-4 4v4l-2-1V6L1 2z"
            fill="currentColor"
          />
        </svg>
        {hasActiveFilter && <div className={styles.activeIndicator} />}
      </button>

      {showFilter && (
        <ColumnFilter
          column={column}
          columnData={columnData}
          existingFilters={existingFilters}
          onFilterChange={handleFilterChange}
          onClose={() => setShowFilter(false)}
          position={dropdownPosition}
        />
      )}
    </>
  );
};