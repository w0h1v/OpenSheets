import React from 'react';
import styles from './ContextMenu.module.css';

interface Props {
  x: number;
  y: number;
  onClose: () => void;
  actions: { label: string; onClick: () => void }[];
}

export const ContextMenu: React.FC<Props> = ({ x, y, onClose, actions }) => {
  return (
    <div 
      className={styles.menu} 
      style={{ top: y, left: x }} 
      onMouseLeave={onClose}
    >
      {actions.map((a, i) => (
        <button
          key={i}
          className={styles.item}
          onClick={() => {
            a.onClick();
            onClose();
          }}
        >
          {a.label}
        </button>
      ))}
    </div>
  );
};