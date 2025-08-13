import React from 'react';
import styles from './DropdownArrow.module.css';

interface DropdownArrowProps {
  onClick: (e: React.MouseEvent) => void;
  isOpen?: boolean;
}

export const DropdownArrow: React.FC<DropdownArrowProps> = ({ onClick, isOpen = false }) => {
  return (
    <button
      className={`${styles.arrow} ${isOpen ? styles.open : ''}`}
      onClick={onClick}
      type="button"
      aria-label="Open dropdown"
      tabIndex={-1} // Prevent focus, cell handles keyboard navigation
    >
      <svg
        width="12"
        height="8"
        viewBox="0 0 12 8"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M1 1.5L6 6.5L11 1.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
};