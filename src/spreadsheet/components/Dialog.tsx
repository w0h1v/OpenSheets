import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './Dialog.module.css';

/*
 * In-app replacements for window.alert, confirm and prompt. Nothing in
 * OpenSheets opens a native browser dialog: those block the page, ignore
 * the theme, and sit outside the document's focus order.
 *
 * The dialog renders through a portal but stops keyboard and clipboard
 * events from bubbling, so typing into it never reaches the grid's
 * handlers further up the React tree.
 */

export interface DialogProps {
  open: boolean;
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  /** Pass null for a single-button dialog. */
  cancelLabel?: string | null;
  /** Colours the confirm button for an action that removes something. */
  destructive?: boolean;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** Form controls rendered between the message and the buttons. */
  children?: React.ReactNode;
}

const FOCUSABLE = 'input, textarea, select, button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

export const Dialog: React.FC<DialogProps> = ({
  open,
  title,
  message,
  confirmLabel = 'OK',
  cancelLabel = 'Cancel',
  destructive = false,
  confirmDisabled = false,
  onConfirm,
  onCancel,
  children,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const messageId = useId();

  // Focus the first field (or the confirm button) on open; hand focus back on close
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>('input, textarea, select') ?? panel?.querySelector<HTMLElement>('[data-confirm]');
    first?.focus();
    if (first instanceof HTMLInputElement) first.select();
    return () => {
      previous?.focus?.();
    };
  }, [open]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    } else if (e.key === 'Enter' && !(e.target instanceof HTMLTextAreaElement) && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault();
      if (!confirmDisabled) onConfirm();
    } else if (e.key === 'Tab' && panelRef.current) {
      // Keep Tab inside the dialog
      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }, [confirmDisabled, onConfirm, onCancel]);

  const stop = useCallback((e: React.SyntheticEvent) => e.stopPropagation(), []);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={styles.backdrop}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={message ? messageId : undefined}
        onKeyDown={onKeyDown}
        onKeyUp={stop}
        onCopy={stop}
        onCut={stop}
        onPaste={stop}
      >
        <h2 id={titleId} className={styles.title}>{title}</h2>
        {message && <p id={messageId} className={styles.message}>{message}</p>}
        {children && <div className={styles.body}>{children}</div>}
        <div className={styles.actions}>
          {cancelLabel !== null && (
            <button type="button" className={styles.cancel} onClick={onCancel}>
              {cancelLabel}
            </button>
          )}
          <button
            type="button"
            data-confirm
            className={destructive ? `${styles.confirm} ${styles.destructive}` : styles.confirm}
            onClick={onConfirm}
            disabled={confirmDisabled}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export type ConfirmDialogProps = Omit<DialogProps, 'children' | 'confirmDisabled'>;

/** Yes/no question with no form controls. */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = (props) => <Dialog {...props} />;

export interface PromptDialogProps {
  open: boolean;
  title: string;
  message?: React.ReactNode;
  label: string;
  placeholder?: string;
  defaultValue?: string;
  multiline?: boolean;
  submitLabel?: string;
  cancelLabel?: string;
  /** Let an empty value through; by default the submit button waits for text. */
  allowEmpty?: boolean;
  /** Receives the trimmed value. */
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

/** One text field, submitted with Enter (Ctrl/Cmd+Enter when multiline). */
export const PromptDialog: React.FC<PromptDialogProps> = ({
  open,
  title,
  message,
  label,
  placeholder,
  defaultValue = '',
  multiline = false,
  submitLabel = 'OK',
  cancelLabel = 'Cancel',
  allowEmpty = false,
  onSubmit,
  onCancel,
}) => {
  const [value, setValue] = useState(defaultValue);
  const fieldId = useId();

  useEffect(() => {
    if (open) setValue(defaultValue);
  }, [open, defaultValue]);

  const trimmed = value.trim();
  const canSubmit = allowEmpty || trimmed !== '';
  const submit = () => {
    if (canSubmit) onSubmit(trimmed);
  };

  return (
    <Dialog
      open={open}
      title={title}
      message={message}
      confirmLabel={submitLabel}
      cancelLabel={cancelLabel}
      confirmDisabled={!canSubmit}
      onConfirm={submit}
      onCancel={onCancel}
    >
      <label className={styles.label} htmlFor={fieldId}>{label}</label>
      {multiline ? (
        <textarea
          id={fieldId}
          className={styles.field}
          rows={3}
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
        />
      ) : (
        <input
          id={fieldId}
          className={styles.field}
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(e) => setValue(e.target.value)}
        />
      )}
    </Dialog>
  );
};

export interface ConfirmOptions {
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

export interface AlertOptions {
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
}

export type PromptOptions = Omit<PromptDialogProps, 'open' | 'onSubmit' | 'onCancel'>;

type Pending =
  | { kind: 'confirm'; options: Omit<ConfirmOptions, 'cancelLabel'> & { cancelLabel?: string | null }; resolve: (ok: boolean) => void }
  | { kind: 'prompt'; options: PromptOptions; resolve: (value: string | null) => void };

/**
 * Promise-based confirm, alert and prompt for event handlers. Render the
 * returned `dialogs` node somewhere in the component:
 *
 *   const { confirm, dialogs } = useDialogs();
 *   const remove = async () => {
 *     if (await confirm({ title: 'Delete sheet?', destructive: true })) ...
 *   };
 *   return <>{dialogs}<button onClick={remove}>Delete</button></>;
 *
 * Only one dialog shows at a time; a new request cancels the one before it.
 */
export function useDialogs() {
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);

  const open = useCallback((next: Pending) => {
    const previous = pendingRef.current;
    if (previous?.kind === 'confirm') previous.resolve(false);
    else if (previous?.kind === 'prompt') previous.resolve(null);
    pendingRef.current = next;
    setPending(next);
  }, []);

  const settle = useCallback((value: boolean | string | null) => {
    const current = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    if (current?.kind === 'confirm') current.resolve(value === true);
    else if (current?.kind === 'prompt') current.resolve(typeof value === 'string' ? value : null);
  }, []);

  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>((resolve) => open({ kind: 'confirm', options, resolve })),
    [open]
  );
  const alert = useCallback(
    (options: AlertOptions) =>
      new Promise<void>((resolve) => open({ kind: 'confirm', options: { ...options, cancelLabel: null }, resolve: () => resolve() })),
    [open]
  );
  const prompt = useCallback(
    (options: PromptOptions) => new Promise<string | null>((resolve) => open({ kind: 'prompt', options, resolve })),
    [open]
  );

  let dialogs: React.ReactNode = null;
  if (pending?.kind === 'confirm') {
    dialogs = <Dialog open {...pending.options} onConfirm={() => settle(true)} onCancel={() => settle(false)} />;
  } else if (pending?.kind === 'prompt') {
    dialogs = <PromptDialog open {...pending.options} onSubmit={(value) => settle(value)} onCancel={() => settle(null)} />;
  }

  return { confirm, alert, prompt, dialogs };
}
