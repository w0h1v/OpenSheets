import React from 'react';
import styles from './ContextMenu.module.css';

interface Props {
  x: number;
  y: number;
  onClose: () => void;
  actions: { label: string; onClick?: () => void; separator?: boolean; shortcut?: string }[];
}

export const ContextMenu: React.FC<Props> = ({ x, y, onClose, actions }) => {
  return (
    <div 
      className={styles.menu} 
      style={{ top: y, left: x }} 
      onMouseLeave={onClose}
    >
      {actions.map((a, i) =>
        a.separator || a.label === '---' ? (
          <div key={i} className={styles.separator} role="separator" />
        ) : (
          <button
            key={i}
            className={styles.item}
            onClick={() => {
              a.onClick?.();
              onClose();
            }}
          >
            <span className={styles.itemLabel}>{a.label}</span>
            {a.shortcut && <span className={styles.shortcut}>{a.shortcut}</span>}
          </button>
        )
      )}
    </div>
  );
};