import React, { useState } from 'react';
import styles from './Comments.module.css';

export interface CommentEntry {
  author: string;
  text: string;
  timestamp: number;
}

/*
 * Per-cell comment thread: accent flag on the cell, hover popover with the
 * root comment, replies, an add-reply input, and resolve/delete.
 */
export const CommentIndicator: React.FC<{
  comment: CommentEntry & { resolved?: boolean; replies?: CommentEntry[] };
  onReply: (text: string) => void;
  onResolve: () => void;
  onDelete: () => void;
}> = ({ comment, onReply, onResolve, onDelete }) => {
  const [draft, setDraft] = useState('');
  const fmt = (t: number) => new Date(t).toLocaleString();

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    onReply(text);
    setDraft('');
  };

  return (
    <span className={styles.popoverWrap}>
      <span
        className={`${styles.flag} ${comment.resolved ? styles.flagResolved : ''}`}
        title={`${comment.author}: ${comment.text}${comment.replies?.length ? ` (+${comment.replies.length} replies)` : ''}`}
      />
      <span className={styles.popover} contentEditable={false}>
        <span className={styles.header}>
          <strong>{comment.author}</strong>
          <small>{fmt(comment.timestamp)}</small>
        </span>
        <span className={styles.body}>{comment.text}</span>

        {comment.replies?.map((r, i) => (
          <span key={i} className={styles.reply}>
            <span className={styles.header}>
              <strong>{r.author}</strong>
              <small>{fmt(r.timestamp)}</small>
            </span>
            <span className={styles.body}>{r.text}</span>
          </span>
        ))}

        <span className={styles.replyRow}>
          <input
            className={styles.replyInput}
            placeholder="Reply…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
            }}
          />
          <button className={styles.replySend} onClick={submit} title="Send reply">↩</button>
        </span>

        <span className={styles.actions}>
          <button onClick={onResolve}>{comment.resolved ? 'Reopen' : 'Resolve'}</button>
          <button onClick={onDelete}>Delete</button>
        </span>
      </span>
    </span>
  );
};
