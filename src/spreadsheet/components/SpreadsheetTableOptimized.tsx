import React, { useRef, useState, useCallback, useMemo, useEffect, useSyncExternalStore } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { columnToLetter } from '../utils/columnUtils';
import { useSpreadsheetEnhanced } from '../SpreadsheetContextEnhanced';
import { useMultiSelection } from '../hooks/useMultiSelection';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useClipboard } from '../hooks/useClipboard';
import { CellRendererOptimized } from './CellRendererOptimized';
import { ContextMenu } from './ContextMenu';
import { ResizeHandle } from './ResizeHandle';
import { DataValidation } from './DataValidation';
import { downloadCSV, importFromCSVFile } from '../utils/csvUtils';
import { applyFilters } from '../utils/filterUtils';
import {
  getFormulaHighlights, subscribeFormulaHighlights,
} from '../utils/formulaHighlightStore';
import { getCollabUsers, subscribeCollab } from '../collaboration/presenceStore';
import { FilterIcon } from './icons';
import styles from './SpreadsheetTable.module.css';

export const SpreadsheetTableOptimized: React.FC<{ sheetId?: string }> = ({ sheetId = 'default' }) => {
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

  useKeyboardShortcuts();
  useClipboard();

  // Rows hidden by active filters collapse to zero height; effective row
  // heights feed the virtualizer and all overlay math so they stay in sync
  const hiddenRows = useMemo(
    () => (state.filters?.length ? applyFilters(state.data, state.filters, state.maxRows, state.maxCols) : new Set<number>()),
    [state.filters, state.data, state.maxRows, state.maxCols]
  );

  const effectiveRowHeights = useMemo(() => {
    if (!hiddenRows.size) return state.rowHeights;
    return (state.rowHeights || []).map((h, i) => (hiddenRows.has(i) ? 0 : h));
  }, [state.rowHeights, hiddenRows]);

  const rowHeightAt = useCallback(
    (index: number) => (hiddenRows.has(index) ? 0 : state.rowHeights?.[index] || 22),
    [state.rowHeights, hiddenRows]
  );

  // Virtualizers cover the body only; the header row and row-number gutter
  // render in separate pinned layers so they stay visible while scrolling
  const rowVirtualizer = useVirtualizer({
    count: state.maxRows,
    getScrollElement: () => parentRef.current,
    estimateSize: rowHeightAt,
    overscan: 5,
  });

  const colVirtualizer = useVirtualizer({
    horizontal: true,
    count: state.maxCols,
    getScrollElement: () => parentRef.current,
    estimateSize: useCallback((index) => {
      return state.colWidths?.[index] || 96;
    }, [state.colWidths]),
    overscan: 3,
  });

  // The virtualizer caches estimated sizes; clear the cache when the size
  // arrays change (e.g. restored from persistence) so cells, headers and
  // the selection overlay stay in sync
  useEffect(() => {
    rowVirtualizer.measure();
  }, [state.rowHeights, hiddenRows, rowVirtualizer]);
  useEffect(() => {
    colVirtualizer.measure();
  }, [state.colWidths, colVirtualizer]);

  // Pinned-layer geometry
  const HEADER_H = 22;
  const GUTTER_W = 40;
  const [scrollOffset, setScrollOffset] = useState({ top: 0, left: 0 });
  const handleScroll = useCallback(() => {
    const el = parentRef.current;
    if (el) setScrollOffset({ top: el.scrollTop, left: el.scrollLeft });
  }, []);

  const sumUpTo = (sizes: number[] | undefined, n: number, fallback: number) => {
    let total = 0;
    for (let i = 0; i < n; i++) total += sizes?.[i] || fallback;
    return total;
  };

  // Formula range highlights (published by the formula bar while editing)
  const formulaHighlights = useSyncExternalStore(subscribeFormulaHighlights, getFormulaHighlights);
  // Remote collaborator selections (published by the collab layer)
  const collabUsers = useSyncExternalStore(subscribeCollab, getCollabUsers);

  // Geometry of the first selection range, for the overlay + fill handle
  const selectionBox = useMemo(() => {
    if (!state.selection.ranges.length) return null;
    const r = state.selection.ranges[0];
    const top = HEADER_H + sumUpTo(effectiveRowHeights, Math.min(r.startRow, r.endRow), 22);
    const height = sumUpTo(effectiveRowHeights, Math.max(r.startRow, r.endRow) + 1, 22)
      - sumUpTo(effectiveRowHeights, Math.min(r.startRow, r.endRow), 22);
    const left = GUTTER_W + sumUpTo(state.colWidths, Math.min(r.startCol, r.endCol), 96);
    const width = sumUpTo(state.colWidths, Math.max(r.startCol, r.endCol) + 1, 96)
      - sumUpTo(state.colWidths, Math.min(r.startCol, r.endCol), 96);
    return { top, left, height, width };
  }, [state.selection.ranges, effectiveRowHeights, state.colWidths]);

  // Fill handle drag state
  const [fillDrag, setFillDrag] = useState<{ endRow: number; endCol: number } | null>(null);

  const dispatchFill = useCallback(() => {
    if (!fillDrag || !state.selection.ranges.length) {
      setFillDrag(null);
      return;
    }
    const sel = state.selection.ranges[0];
    const anchor = state.selection.active ?? { row: sel.startRow, col: sel.startCol };
    const dRow = fillDrag.endRow - anchor.row;
    const dCol = fillDrag.endCol - anchor.col;
    if (dRow === 0 && dCol === 0) {
      setFillDrag(null);
      return;
    }
    const direction: 'down' | 'up' | 'right' | 'left' =
      Math.abs(dRow) >= Math.abs(dCol) ? (dRow > 0 ? 'down' : 'up') : (dCol > 0 ? 'right' : 'left');

    const startRow = Math.min(sel.startRow, sel.endRow, fillDrag.endRow);
    const endRow = Math.max(sel.startRow, sel.endRow, fillDrag.endRow);
    const startCol = Math.min(sel.startCol, sel.endCol, fillDrag.endCol);
    const endCol = Math.max(sel.startCol, sel.endCol, fillDrag.endCol);

    const sourceCell = state.data.get(`${anchor.row}:${anchor.col}`);
    const fillType: 'copy' | 'series' =
      sourceCell && typeof sourceCell.value === 'number' && !sourceCell.formula ? 'series' : 'copy';

    dispatch({
      type: 'FILL_RANGE',
      payload: {
        range: { startRow, startCol, endRow, endCol },
        direction,
        type: fillType,
      },
    });
    setFillDrag(null);
  }, [fillDrag, state.selection, state.data, dispatch]);

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
        shortcut: '⌘X',
        onClick: () => {
          document.execCommand('cut');
        }
      },
      {
        label: 'Copy',
        shortcut: '⌘C',
        onClick: () => {
          document.execCommand('copy');
        }
      },
      {
        label: 'Paste',
        shortcut: '⌘V',
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
        label: 'Insert comment…',
        onClick: () => {
          const text = prompt('Comment:');
          if (!text) return;
          dispatch({
            type: 'SET_COMMENT',
            payload: {
              key: `${contextMenu.row}:${contextMenu.col}`,
              comment: { author: 'You', text, timestamp: Date.now() },
            },
          });
        }
      },
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

  const colTotal = colVirtualizer.getTotalSize();
  const rowTotal = rowVirtualizer.getTotalSize();

  const selectionCoversCol = (col: number) =>
    state.selection.ranges.some(
      (r) => col >= Math.min(r.startCol, r.endCol) && col <= Math.max(r.startCol, r.endCol)
    );

  const selectionCoversRow = (row: number) =>
    state.selection.ranges.some(
      (r) => row >= Math.min(r.startRow, r.endRow) && row <= Math.max(r.startRow, r.endRow)
    );

  // Union of selection and in-progress fill drag, for the preview rectangle
  const fillBox = useMemo(() => {
    if (!fillDrag || !state.selection.ranges.length) return null;
    const sel = state.selection.ranges[0];
    const startRow = Math.min(sel.startRow, sel.endRow, fillDrag.endRow);
    const endRow = Math.max(sel.startRow, sel.endRow, fillDrag.endRow);
    const startCol = Math.min(sel.startCol, sel.endCol, fillDrag.endCol);
    const endCol = Math.max(sel.startCol, sel.endCol, fillDrag.endCol);
    const top = HEADER_H + sumUpTo(effectiveRowHeights, startRow, 22);
    const height = sumUpTo(effectiveRowHeights, endRow + 1, 22) - sumUpTo(effectiveRowHeights, startRow, 22);
    const left = GUTTER_W + sumUpTo(state.colWidths, startCol, 96);
    const width = sumUpTo(state.colWidths, endCol + 1, 96) - sumUpTo(state.colWidths, startCol, 96);
    return { top, left, height, width };
  }, [fillDrag, state.selection.ranges, effectiveRowHeights, state.colWidths]);

  return (
    <div
      style={{ position: 'relative', height: '100%', minWidth: 0 }}
      onMouseUp={() => {
        if (fillDrag) dispatchFill();
        handleMouseUp();
      }}
    >
      <div
        ref={parentRef}
        className={styles.container}
        onScroll={handleScroll}
        role="grid"
        aria-label="Spreadsheet"
        aria-rowcount={state.maxRows}
        aria-colcount={state.maxCols}
      >
        <div
          style={{
            width: GUTTER_W + colTotal,
            height: HEADER_H + rowTotal,
            position: 'relative',
          }}
        >
          {/* Selection rectangle */}
          {selectionBox && (
            <div
              style={{
                position: 'absolute',
                top: selectionBox.top,
                left: selectionBox.left,
                width: selectionBox.width,
                height: selectionBox.height,
                border: '1px solid var(--accent)',
                backgroundColor: 'var(--grid-range-fill)',
                pointerEvents: 'none',
                boxSizing: 'border-box',
              }}
            />
          )}

          {/* Fill-handle drag preview */}
          {fillBox && (
            <div
              style={{
                position: 'absolute',
                top: fillBox.top,
                left: fillBox.left,
                width: fillBox.width,
                height: fillBox.height,
                border: '1px dashed var(--accent)',
                pointerEvents: 'none',
                boxSizing: 'border-box',
              }}
            />
          )}

          {/* Formula range highlights */}
          {formulaHighlights.map((h, i) => {
            const top = HEADER_H + sumUpTo(effectiveRowHeights, h.startRow, 22);
            const height = sumUpTo(effectiveRowHeights, h.endRow + 1, 22) - sumUpTo(effectiveRowHeights, h.startRow, 22);
            const left = GUTTER_W + sumUpTo(state.colWidths, h.startCol, 96);
            const width = sumUpTo(state.colWidths, h.endCol + 1, 96) - sumUpTo(state.colWidths, h.startCol, 96);
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  top,
                  left,
                  width,
                  height,
                  border: `2px solid ${h.color}`,
                  backgroundColor: `${h.color}1a`,
                  pointerEvents: 'none',
                  boxSizing: 'border-box',
                  zIndex: 1,
                }}
              />
            );
          })}

          {/* Remote collaborator selections */}
          {collabUsers.map((u) => {
            const r = u.selection;
            if (!r || r.sheetId !== sheetId) return null;
            const top = HEADER_H + sumUpTo(effectiveRowHeights, r.startRow, 22);
            const height = sumUpTo(effectiveRowHeights, r.endRow + 1, 22) - sumUpTo(effectiveRowHeights, r.startRow, 22);
            const left = GUTTER_W + sumUpTo(state.colWidths, r.startCol, 96);
            const width = sumUpTo(state.colWidths, r.endCol + 1, 96) - sumUpTo(state.colWidths, r.startCol, 96);
            return (
              <div key={u.id}>
                <div
                  style={{
                    position: 'absolute',
                    top,
                    left,
                    width,
                    height,
                    border: `2px solid ${u.color}`,
                    backgroundColor: `${u.color}14`,
                    pointerEvents: 'none',
                    boxSizing: 'border-box',
                    zIndex: 1,
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    top: top - 16 < 0 ? top + 2 : top - 16,
                    left,
                    background: u.color,
                    color: '#fff',
                    fontSize: 10,
                    padding: '1px 6px',
                    borderRadius: '4px 4px 4px 0',
                    pointerEvents: 'none',
                    zIndex: 2,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {u.name}
                </div>
              </div>
            );
          })}

          {/* Body rows (filter-hidden rows are skipped entirely) */}
          {rowVirtualizer.getVirtualItems().filter((row) => rowHeightAt(row.index) > 0).map((row) => (
            <div
              key={row.key}
              role="row"
              aria-rowindex={row.index + 1}
              style={{
                position: 'absolute',
                top: HEADER_H + row.start,
                left: GUTTER_W,
                height: row.size,
                width: colTotal,
              }}
            >
              {colVirtualizer.getVirtualItems().map((col) => (
                <div
                  key={`${row.index}-${col.index}`}
                  className={styles.cell}
                  style={{
                    position: 'absolute',
                    left: col.start,
                    width: col.size,
                    height: '100%',
                  }}
                  onMouseDown={(e) => handleMouseDown(row.index, col.index, e)}
                  onClick={(e) => handleMouseDown(row.index, col.index, e)}
                  onMouseEnter={() => {
                    if (fillDrag) {
                      setFillDrag({ endRow: row.index, endCol: col.index });
                    } else {
                      handleMouseEnter(row.index, col.index);
                    }
                  }}
                  onContextMenu={(e) => handleContextMenu(e, row.index, col.index)}
                  role="presentation"
                  aria-colindex={col.index + 1}
                >
                  <CellRendererOptimized row={row.index} col={col.index} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Pinned header row (stays visible on vertical+horizontal scroll) */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: HEADER_H,
          overflow: 'hidden',
          zIndex: 3,
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            width: GUTTER_W + colTotal,
            height: HEADER_H,
            position: 'relative',
            transform: `translateX(-${scrollOffset.left}px)`,
          }}
        >
          {colVirtualizer.getVirtualItems().map((col) => (
            <div
              key={col.index}
              className={`${styles.cell} ${styles.header} ${
                selectionCoversCol(col.index) ? styles.headerTint : ''
              }`}
              style={{
                position: 'absolute',
                left: GUTTER_W + col.start,
                width: col.size,
                height: '100%',
                pointerEvents: 'auto',
              }}
              role="columnheader"
              aria-colindex={col.index + 1}
            >
              {columnToLetter(col.index)}
              {state.filters?.some((f) => f.column === col.index) && (
                <span style={{ marginLeft: 3, color: 'var(--accent)', display: 'inline-flex' }} title="Filtered">
                  <FilterIcon size={10} />
                </span>
              )}
              <ResizeHandle type="column" index={col.index} onResize={handleColResize} initialSize={col.size} />
            </div>
          ))}
        </div>
      </div>

      {/* Pinned row-number gutter (stays visible on horizontal scroll) */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          bottom: 0,
          width: GUTTER_W,
          overflow: 'hidden',
          zIndex: 2,
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            width: GUTTER_W,
            position: 'relative',
            transform: `translateY(-${scrollOffset.top}px)`,
          }}
        >
          <div style={{ height: HEADER_H }} />
          {rowVirtualizer.getVirtualItems().filter((row) => rowHeightAt(row.index) > 0).map((row) => (
            <div
              key={row.index}
              className={`${styles.cell} ${styles.header} ${
                selectionCoversRow(row.index) ? styles.headerTint : ''
              }`}
              style={{
                position: 'absolute',
                top: HEADER_H + row.start,
                left: 0,
                width: '100%',
                height: row.size,
                pointerEvents: 'auto',
              }}
              role="rowheader"
              aria-rowindex={row.index + 1}
            >
              {row.index + 1}
              <ResizeHandle type="row" index={row.index} onResize={handleRowResize} initialSize={row.size} />
            </div>
          ))}
        </div>
      </div>

      {/* Corner box where the pinned header and gutter meet */}
      <div
        className={`${styles.cell} ${styles.header}`}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: GUTTER_W,
          height: HEADER_H,
          zIndex: 4,
        }}
      />

      {/* Fill handle on the selection corner */}
      {selectionBox && (
        <div
          style={{
            position: 'absolute',
            top: selectionBox.top + selectionBox.height - 3,
            left: selectionBox.left + selectionBox.width - 3,
            width: 6,
            height: 6,
            backgroundColor: 'var(--accent)',
            border: '1px solid var(--cellbg)',
            cursor: 'crosshair',
            zIndex: 5,
          }}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const sel = state.selection.ranges[0];
            const anchor = state.selection.active ?? { row: sel.startRow, col: sel.startCol };
            setFillDrag({ endRow: anchor.row, endCol: anchor.col });
          }}
          title="Drag to fill"
        />
      )}

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
    </div>
  );
};