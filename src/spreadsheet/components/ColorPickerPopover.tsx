import React, { useEffect, useRef, useState } from 'react';
import styles from './ColorPicker.module.css';

/*
 * Designed swatch panel (replaces the native color input), per the Crisp
 * token language. Palette rows follow the Google Sheets standard sets;
 * recent picks persist to localStorage.
 */

const RECENT_KEY = 'opensheets-recent-colors';

const STANDARD = [
  '#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#efefef', '#f3f3f3', '#ffffff',
];
const THEME = [
  '#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#0000ff', '#9900ff', '#ff00ff',
  '#e6b8af', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#c9daf8', '#cfe2f3', '#d9d2e9', '#ead1dc',
  '#dd7e6b', '#ea9999', '#f9cb9c', '#ffe599', '#b6d7a8', '#a2c4c9', '#a4c2f4', '#9fc5e8', '#b4a7d6', '#d5a6bd',
  '#cc4125', '#e06666', '#f6b26b', '#ffd966', '#93c47d', '#76a5af', '#6d9eeb', '#6fa8dc', '#8e7cc3', '#c27ba0',
  '#a61c00', '#cc0000', '#e69138', '#f1c232', '#6aa84f', '#45818e', '#3c78d8', '#3d85c6', '#674ea7', '#a64d79',
];

const loadRecent = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  } catch {
    return [];
  }
};

export const ColorPickerPopover: React.FC<{
  value?: string;
  onChange: (color: string | undefined) => void;
  allowNone?: boolean;
  label: string;
  children: React.ReactNode;
}> = ({ value, onChange, allowNone, label, children }) => {
  const [open, setOpen] = useState(false);
  const [recent, setRecent] = useState<string[]>(loadRecent);
  const [custom, setCustom] = useState(value || '#000000');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = (color: string | undefined) => {
    onChange(color);
    if (color) {
      const next = [color, ...recent.filter((c) => c !== color)].slice(0, 10);
      setRecent(next);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch { /* storage unavailable */ }
    }
    setOpen(false);
  };

  const row = (colors: string[]) => (
    <div className={styles.swatchRow}>
      {colors.map((c) => (
        <button
          key={c}
          className={`${styles.swatch} ${value === c ? styles.swatchActive : ''}`}
          style={{ background: c }}
          title={c}
          onClick={() => pick(c)}
        />
      ))}
    </div>
  );

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        className={styles.trigger}
        title={label}
        onClick={() => setOpen(!open)}
      >
        {children}
        {value && value !== 'none' && (
          <span className={styles.triggerBar} style={{ background: value }} />
        )}
      </button>
      {open && (
        <div className={styles.panel}>
          {allowNone && (
            <button className={styles.noneButton} onClick={() => pick(undefined)}>
              None
            </button>
          )}
          <div className={styles.sectionTitle}>Standard</div>
          {row(STANDARD.slice(0, 10))}
          <div className={styles.sectionTitle}>Theme</div>
          {THEME.slice(0, 10).length > 0 && row(THEME.slice(0, 10))}
          {row(THEME.slice(10, 20))}
          {row(THEME.slice(20, 30))}
          {row(THEME.slice(30, 40))}
          {row(THEME.slice(40, 50))}
          {recent.length > 0 && (
            <>
              <div className={styles.sectionTitle}>Custom</div>
              {row(recent)}
            </>
          )}
          <div className={styles.customRow}>
            <input
              type="color"
              className={styles.customInput}
              value={/^#[0-9a-fA-F]{6}$/.test(custom) ? custom : '#000000'}
              onChange={(e) => setCustom(e.target.value)}
            />
            <input
              type="text"
              className={styles.customText}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="#rrggbb"
            />
            <button className={styles.customApply} onClick={() => pick(custom.toLowerCase())}>
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
