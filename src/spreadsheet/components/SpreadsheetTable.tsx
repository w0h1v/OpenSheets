import React, { useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { columnToLetter } from '../utils/columnUtils';
import { useSpreadsheet } from '../SpreadsheetContext';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useClipboard } from '../hooks/useClipboard';
import { SelectionOverlay } from './SelectionOverlay';
import { CellRenderer } from './CellRenderer';
import { ContextMenu } from './ContextMenu';
import styles from './SpreadsheetTable.module.css';

export const SpreadsheetTable: React.FC = () => {
  const { state, setState } = useSpreadsheet();
  const parentRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<{x:number,y:number,actions:any[]} | null>(null);
  
  useKeyboardShortcuts();
  useClipboard();

  const rowVirtualizer = useVirtualizer({
    count: state.maxRows + 1,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => (index === 0 ? 28 : 28),
    overscan: 5,
  });

  const colVirtualizer = useVirtualizer({
    horizontal: true,
    count: state.maxCols + 1,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => (index === 0 ? 48 : 100),
    overscan: 3,
  });

  const handleMouseDown = (row: number, col: number) => {
    setState((prev) => ({
      ...prev,
      selection: {
        ranges: [{ startRow: row, startCol: col, endRow: row, endCol: col }],
        active: { row, col },
      },
    }));
  };

  const handleContextMenu = (e: React.MouseEvent, row: number, col: number) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      actions: [
        { label: 'Cut', onClick: () => console.log('Cut') },
        { label: 'Copy', onClick: () => console.log('Copy') },
        { label: 'Paste', onClick: () => console.log('Paste') },
        { label: 'Insert Row', onClick: () => console.log('Insert Row') },
        { label: 'Delete Row', onClick: () => console.log('Delete Row') },
      ],
    });
  };

  return (
    <div ref={parentRef} className={styles.container}>
      <div
        style={{
          width: colVirtualizer.getTotalSize(),
          height: rowVirtualizer.getTotalSize(),
          position: 'relative',
        }}
      >
        <SelectionOverlay
          rowHeights={rowVirtualizer.getVirtualItems().map((v) => v.size)}
          colWidths={colVirtualizer.getVirtualItems().map((v) => v.size)}
        />
        {rowVirtualizer.getVirtualItems().map((row) => (
          <React.Fragment key={row.key}>
            {colVirtualizer.getVirtualItems().map((col) => {
              const isHeaderRow = row.index === 0;
              const isHeaderCol = col.index === 0;

              return (
                <div
                  key={`${row.index}-${col.index}`}
                  className={`${styles.cell} ${
                    isHeaderRow || isHeaderCol ? styles.header : ''
                  }`}
                  style={{
                    position: 'absolute',
                    top: row.start,
                    left: col.start,
                    width: col.size,
                    height: row.size,
                  }}
                  onMouseDown={() =>
                    !isHeaderRow && !isHeaderCol && handleMouseDown(row.index - 1, col.index - 1)
                  }
                  onContextMenu={(e) =>
                    !isHeaderRow && !isHeaderCol && handleContextMenu(e, row.index - 1, col.index - 1)
                  }
                >
                  {isHeaderRow && isHeaderCol
                    ? ''
                    : isHeaderRow
                    ? columnToLetter(col.index - 1)
                    : isHeaderCol
                    ? row.index
                    : <CellRenderer row={row.index - 1} col={col.index - 1} />}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          actions={contextMenu.actions}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
};