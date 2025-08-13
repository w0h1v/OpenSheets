import React from 'react';
import { useSpreadsheet } from '../SpreadsheetContext';
import { normalizeRect } from '../utils/selectionUtils';
import styles from './SelectionOverlay.module.css';

interface Props {
  rowHeights: number[];
  colWidths: number[];
}

export const SelectionOverlay: React.FC<Props> = ({
  rowHeights,
  colWidths,
}) => {
  const { state } = useSpreadsheet();

  if (!state.selection.ranges.length) {
    return null;
  }

  return (
    <>
      {state.selection.ranges.map((rect, i) => {
        const r = normalizeRect(rect);

        // Calculate position - account for headers (index 0)
        const top = rowHeights
          .slice(0, r.startRow + 1)
          .reduce((a, b) => a + b, 0);
        const left = colWidths
          .slice(0, r.startCol + 1)
          .reduce((a, b) => a + b, 0);
        const height = rowHeights
          .slice(r.startRow + 1, r.endRow + 2)
          .reduce((a, b) => a + b, 0);
        const width = colWidths
          .slice(r.startCol + 1, r.endCol + 2)
          .reduce((a, b) => a + b, 0);

        return (
          <div
            key={i}
            className={styles.selection}
            style={{
              top,
              left,
              height,
              width,
            }}
          />
        );
      })}
    </>
  );
};