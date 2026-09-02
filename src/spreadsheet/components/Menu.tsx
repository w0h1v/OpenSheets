import React, { useRef, useState, useCallback } from 'react';
import { useClickOutside } from '../hooks/useClickOutside';
import styles from './Menu.module.css';

export interface MenuEntry {
  label: string;
  shortcut?: string;
  onClick?: () => void;
  disabled?: boolean;
  separator?: boolean;
  checked?: boolean;
}

/*
 * Dropdown menu styled per the "Crisp" context-menu spec. Renders a trigger
 * (usually a menu-bar label) and opens a positioned panel; any outside
 * mousedown or Escape closes it.
 */
export const DropdownMenu: React.FC<{
  label: React.ReactNode;
  title?: string;
  entries: MenuEntry[];
  align?: 'left' | 'right';
}> = ({ label, title, entries, align = 'left' }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);
  useClickOutside(rootRef, close, open);

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        className={`${styles.trigger} ${open ? styles.triggerOpen : ''}`}
        onClick={() => setOpen(!open)}
        title={title}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {label}
      </button>
      {open && (
        <div className={`${styles.panel} ${align === 'right' ? styles.panelRight : ''}`} role="menu">
          {entries.map((entry, i) =>
            entry.separator ? (
              <div key={i} className={styles.separator} role="separator" />
            ) : (
              <button
                key={i}
                className={styles.item}
                disabled={entry.disabled}
                onClick={() => {
                  setOpen(false);
                  entry.onClick?.();
                }}
              >
                <span className={styles.check}>{entry.checked ? '✓' : ''}</span>
                <span className={styles.itemLabel}>{entry.label}</span>
                {entry.shortcut && <span className={styles.shortcut}>{entry.shortcut}</span>}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
};
