import React, { useState, useCallback } from 'react';
import styles from './ResizeHandle.module.css';

interface Props {
  type: 'row' | 'column';
  index: number;
  onResize: (index: number, newSize: number) => void;
  initialSize: number;
}

export const ResizeHandle: React.FC<Props> = ({ type, index, onResize, initialSize }) => {
  const [isResizing, setIsResizing] = useState(false);
  const [startPos, setStartPos] = useState(0);
  const [startSize, setStartSize] = useState(initialSize);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsResizing(true);
    setStartPos(type === 'column' ? e.clientX : e.clientY);
    setStartSize(initialSize);
    e.preventDefault();
  }, [type, initialSize]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;
    
    const currentPos = type === 'column' ? e.clientX : e.clientY;
    const diff = currentPos - startPos;
    const newSize = Math.max(20, startSize + diff);
    
    onResize(index, newSize);
  }, [isResizing, type, startPos, startSize, index, onResize]);

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  React.useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isResizing, handleMouseMove, handleMouseUp]);

  return (
    <div
      className={`${styles.handle} ${styles[type]} ${isResizing ? styles.resizing : ''}`}
      onMouseDown={handleMouseDown}
    />
  );
};