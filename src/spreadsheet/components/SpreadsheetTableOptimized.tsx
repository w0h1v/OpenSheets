import React, { useRef, useState, useCallback, useMemo, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { columnToLetter } from '../utils/columnUtils';
import { useSpreadsheetEnhanced } from '../SpreadsheetContextEnhanced';
import { useMultiSelection } from '../hooks/useMultiSelection';
import { SelectionOverlay } from './SelectionOverlay';
import { CellRendererOptimized } from './CellRendererOptimized';
import { ContextMenu } from './ContextMenu';
import { ResizeHandle } from './ResizeHandle';
import { DataValidation } from './DataValidation';
import { downloadCSV, importFromCSVFile } from '../utils/csvUtils';
import styles from './SpreadsheetTable.module.css';

export const SpreadsheetTableOptimized: React.FC = () => {
  const { state, dispatch } = useSpreadsheetEnhanced();
  const parentRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [contextMenu, setContextMenu] = useState<{x:number,y:number,row:number,col:number} | null>(null);
  const [validationDialog, setValidationDialog] = useState<{row:number,col:number} | null>(null);
  
  const {
    startSelection,
    updateSelection,
    endSelection,
  } = useMultiSelection(state, dispatch);

  // Optimized virtualizers with dynamic sizing
  const rowVirtualizer = useVirtualizer({
    count: state.maxRows + 1,
    getScrollElement: () => parentRef.current,
    estimateSize: useCallback((index) => {
      if (index === 0) return 28; // Header
      return state.rowHeights?.[index - 1] || 28;
    }, [state.rowHeights]),
    overscan: 5,
  });

  const colVirtualizer = useVirtualizer({
    horizontal: true,
    count: state.maxCols + 1,
    getScrollElement: () => parentRef.current,
    estimateSize: useCallback((index) => {
      if (index === 0) return 48; // Row numbers
      return state.colWidths?.[index - 1] || 100;
    }, [state.colWidths]),
    overscan: 3,
  });

  // Memoized handlers with useCallback
  const handleMouseDown = useCallback((row: number, col: number, e: React.MouseEvent) => {
    if (e.shiftKey) {
      // Extend selection
      updateSelection(row, col);
    } else if (e.ctrlKey || e.metaKey) {
      // Add to selection
      startSelection(row, col, true);
    } else {
      // Start new selection
      startSelection(row, col, false);
    }
  }, [startSelection, updateSelection]);

  const handleMouseEnter = useCallback((row: number, col: number) => {
    updateSelection(row, col);
  }, [updateSelection]);

  const handleMouseUp = useCallback(() => {
    endSelection();
  }, [endSelection]);

  const handleContextMenu = useCallback((e: React.MouseEvent, row: number, col: number) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, row, col });
  }, []);

  const handleRowResize = useCallback((index: number, newHeight: number) => {
    dispatch({ type: 'SET_ROW_HEIGHT', payload: { row: index, height: newHeight } });
  }, [dispatch]);

  const handleColResize = useCallback((index: number, newWidth: number) => {
    dispatch({ type: 'SET_COLUMN_WIDTH', payload: { col: index, width: newWidth } });
  }, [dispatch]);

  // Context menu actions
  const contextMenuActions = useMemo(() => {
    if (!contextMenu) return [];
    
    return [
      { 
        label: 'Cut', 
        onClick: () => {
          // Implement cut
          document.execCommand('cut');
        } 
      },
      { 
        label: 'Copy', 
        onClick: () => {
          document.execCommand('copy');
        } 
      },
      { 
        label: 'Paste', 
        onClick: () => {
          document.execCommand('paste');
        } 
      },
      { label: '---' }, // Separator
      { 
        label: 'Insert Row Above', 
        onClick: () => {
          dispatch({ type: 'INSERT_ROW', payload: { index: contextMenu.row } });
        } 
      },
      { 
        label: 'Insert Row Below', 
        onClick: () => {
          dispatch({ type: 'INSERT_ROW', payload: { index: contextMenu.row + 1 } });
        } 
      },
      { 
        label: 'Delete Row', 
        onClick: () => {
          dispatch({ type: 'DELETE_ROW', payload: { index: contextMenu.row } });
        } 
      },
      { label: '---' },
      { 
        label: 'Insert Column Left', 
        onClick: () => {
          dispatch({ type: 'INSERT_COLUMN', payload: { index: contextMenu.col } });
        } 
      },
      { 
        label: 'Insert Column Right', 
        onClick: () => {
          dispatch({ type: 'INSERT_COLUMN', payload: { index: contextMenu.col + 1 } });
        } 
      },
      { 
        label: 'Delete Column', 
        onClick: () => {
          dispatch({ type: 'DELETE_COLUMN', payload: { index: contextMenu.col } });
        } 
      },
      { label: '---' },
      { 
        label: 'Clear Contents', 
        onClick: () => {
          if (state.selection.ranges.length > 0) {
            dispatch({ type: 'CLEAR_RANGE', payload: { range: state.selection.ranges[0] } });
          }
        } 
      },
      { 
        label: 'Fill Down', 
        onClick: () => {
          if (state.selection.ranges.length > 0) {
            dispatch({ 
              type: 'FILL_RANGE', 
              payload: { 
                range: state.selection.ranges[0], 
                direction: 'down', 
                type: 'copy' 
              } 
            });
          }
        } 
      },
      { 
        label: 'Fill Series', 
        onClick: () => {
          if (state.selection.ranges.length > 0) {
            dispatch({ 
              type: 'FILL_RANGE', 
              payload: { 
                range: state.selection.ranges[0], 
                direction: 'down', 
                type: 'series' 
              } 
            });
          }
        } 
      },
      { label: '---' },
      { 
        label: 'Sort Ascending', 
        onClick: () => {
          if (state.selection.ranges.length > 0) {
            dispatch({ 
              type: 'SORT_RANGE', 
              payload: { 
                range: state.selection.ranges[0], 
                column: contextMenu.col, 
                ascending: true 
              } 
            });
          }
        } 
      },
      { 
        label: 'Sort Descending', 
        onClick: () => {
          if (state.selection.ranges.length > 0) {
            dispatch({ 
              type: 'SORT_RANGE', 
              payload: { 
                range: state.selection.ranges[0], 
                column: contextMenu.col, 
                ascending: false 
              } 
            });
          }
        } 
      },
      { label: '---' },
      { 
        label: 'Data Validation...', 
        onClick: () => {
          setValidationDialog({ row: contextMenu.row, col: contextMenu.col });
        } 
      },
      { label: '---' },
      { 
        label: 'Export to CSV', 
        onClick: () => {
          downloadCSV(state.data, state.maxRows, state.maxCols);
        } 
      },
      { 
        label: 'Import from CSV', 
        onClick: () => {
          fileInputRef.current?.click();
        } 
      },
    ].map(item => item.label === '---' ? { label: item.label, onClick: () => {} } : item);
  }, [contextMenu, state.selection.ranges, state.data, state.maxRows, state.maxCols, dispatch]);

  // Handle file import
  const handleFileImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const { data } = await importFromCSVFile(file);
      // Clear existing data and load new data
      dispatch({ type: 'BATCH', payload: [
        { type: 'CLEAR_RANGE', payload: { 
          range: { startRow: 0, startCol: 0, endRow: state.maxRows, endCol: state.maxCols } 
        }},
        { type: 'SET_CELLS', payload: { 
          updates: Array.from(data.entries()).map(([key, cellData]) => {
            const [row, col] = key.split(':').map(Number);
            return { row, col, data: cellData };
          })
        }}
      ]});
    } catch (error) {
      console.error('Failed to import CSV:', error);
      alert('Failed to import CSV file');
    }

    // Clear file input
    e.target.value = '';
  }, [dispatch, state.maxRows, state.maxCols]);

  // Focus management for accessibility
  useEffect(() => {
    const handleFocus = (e: FocusEvent) => {
      // Implement focus trap when editing
      if (state.editing && !parentRef.current?.contains(e.target as Node)) {
        e.preventDefault();
        const activeCell = parentRef.current?.querySelector(`[aria-current="true"]`) as HTMLElement;
        activeCell?.focus();
      }
    };

    document.addEventListener('focusin', handleFocus);
    return () => document.removeEventListener('focusin', handleFocus);
  }, [state.editing]);

  // Announce cell navigation for screen readers
  useEffect(() => {
    if (state.selection.active) {
      const { row, col } = state.selection.active;
      const cellValue = state.data.get(`${row}:${col}`)?.value || 'empty';
      const announcement = `Cell ${columnToLetter(col)}${row + 1}, ${cellValue}`;
      
      // Create live region for announcements
      const liveRegion = document.getElementById('spreadsheet-live-region') || 
        (() => {
          const region = document.createElement('div');
          region.id = 'spreadsheet-live-region';
          region.setAttribute('aria-live', 'polite');
          region.setAttribute('aria-atomic', 'true');
          region.style.position = 'absolute';
          region.style.left = '-10000px';
          document.body.appendChild(region);
          return region;
        })();
      
      liveRegion.textContent = announcement;
    }
  }, [state.selection.active, state.data]);

  return (
    <>
      <div 
        ref={parentRef} 
        className={styles.container}
        onMouseUp={handleMouseUp}
        role="grid"
        aria-label="Spreadsheet"
        aria-rowcount={state.maxRows}
        aria-colcount={state.maxCols}
      >
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
            <div
              key={row.key}
              role="row"
              aria-rowindex={row.index + 1}
              style={{
                position: 'absolute',
                top: row.start,
                height: row.size,
                width: '100%',
              }}
            >
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
                      left: col.start,
                      width: col.size,
                      height: '100%',
                    }}
                    onMouseDown={(e) =>
                      !isHeaderRow && !isHeaderCol && handleMouseDown(row.index - 1, col.index - 1, e)
                    }
                    onMouseEnter={() =>
                      !isHeaderRow && !isHeaderCol && handleMouseEnter(row.index - 1, col.index - 1)
                    }
                    onContextMenu={(e) =>
                      !isHeaderRow && !isHeaderCol && handleContextMenu(e, row.index - 1, col.index - 1)
                    }
                    role={isHeaderRow || isHeaderCol ? 'columnheader' : 'gridcell'}
                    aria-colindex={col.index + 1}
                  >
                    {isHeaderRow && isHeaderCol ? (
                      ''
                    ) : isHeaderRow ? (
                      <>
                        {columnToLetter(col.index - 1)}
                        {col.index > 0 && (
                          <ResizeHandle
                            type="column"
                            index={col.index - 1}
                            onResize={handleColResize}
                            initialSize={col.size}
                          />
                        )}
                      </>
                    ) : isHeaderCol ? (
                      <>
                        {row.index}
                        {row.index > 0 && (
                          <ResizeHandle
                            type="row"
                            index={row.index - 1}
                            onResize={handleRowResize}
                            initialSize={row.size}
                          />
                        )}
                      </>
                    ) : (
                      <CellRendererOptimized row={row.index - 1} col={col.index - 1} />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          actions={contextMenuActions}
          onClose={() => setContextMenu(null)}
        />
      )}

      {validationDialog && (
        <DataValidation
          row={validationDialog.row}
          col={validationDialog.col}
          onClose={() => setValidationDialog(null)}
        />
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        style={{ display: 'none' }}
        onChange={handleFileImport}
      />
    </>
  );
};