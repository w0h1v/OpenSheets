import React from 'react';
import styles from './Comments.module.css';

/*
 * Per-cell comment indicator (small accent flag in the top-right corner)
 * and hover/tap popover with author, timestamp, text, and resolve/delete.
 */
export const CommentIndicator: React.FC<{
  comment: { author: string; text: string; timestamp: number; resolved?: boolean };
  onResolve: () => void;
  onDelete: () => void;
}> = ({ comment, onResolve, onDelete }) => {
  const date = new Date(comment.timestamp);
  return (
    <span className={styles.popoverWrap}>
      <span
        className={`${styles.flag} ${comment.resolved ? styles.flagResolved : ''}`}
        title={`${comment.author}: ${comment.text}`}
      />
      <span className={styles.popover} contentEditable={false}>
        <span className={styles.header}>
          <strong>{comment.author}</strong>
          <small>{date.toLocaleString()}</small>
        </span>
        <span className={styles.body}>{comment.text}</span>
        <span className={styles.actions}>
          <button onClick={onResolve}>{comment.resolved ? 'Reopen' : 'Resolve'}</button>
          <button onClick={onDelete}>Delete</button>
        </span>
      </span>
    </span>
  );
};
