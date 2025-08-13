import { 
  normalizeRect, 
  isCellInSelection, 
  singleCellSelection 
} from '../utils/selectionUtils';
import { Selection, SelectionRect } from '../types/spreadsheet';

describe('Selection Utils', () => {
  describe('normalizeRect', () => {
    it('should normalize selection rectangles', () => {
      const rect: SelectionRect = {
        startRow: 5,
        startCol: 5,
        endRow: 1,
        endCol: 1,
      };
      
      const normalized = normalizeRect(rect);
      expect(normalized.startRow).toBe(1);
      expect(normalized.startCol).toBe(1);
      expect(normalized.endRow).toBe(5);
      expect(normalized.endCol).toBe(5);
    });

    it('should leave already normalized rectangles unchanged', () => {
      const rect: SelectionRect = {
        startRow: 1,
        startCol: 1,
        endRow: 5,
        endCol: 5,
      };
      
      const normalized = normalizeRect(rect);
      expect(normalized).toEqual(rect);
    });

    it('should handle single cell selections', () => {
      const rect: SelectionRect = {
        startRow: 3,
        startCol: 3,
        endRow: 3,
        endCol: 3,
      };
      
      const normalized = normalizeRect(rect);
      expect(normalized).toEqual(rect);
    });
  });

  describe('isCellInSelection', () => {
    const selection: Selection = {
      ranges: [
        { startRow: 1, startCol: 1, endRow: 3, endCol: 3 },
        { startRow: 5, startCol: 5, endRow: 7, endCol: 7 },
      ],
      active: { row: 1, col: 1 },
    };

    it('should return true for cells within selection ranges', () => {
      expect(isCellInSelection(2, 2, selection)).toBe(true);
      expect(isCellInSelection(1, 1, selection)).toBe(true);
      expect(isCellInSelection(3, 3, selection)).toBe(true);
      expect(isCellInSelection(6, 6, selection)).toBe(true);
    });

    it('should return false for cells outside selection ranges', () => {
      expect(isCellInSelection(0, 0, selection)).toBe(false);
      expect(isCellInSelection(4, 4, selection)).toBe(false);
      expect(isCellInSelection(8, 8, selection)).toBe(false);
      expect(isCellInSelection(1, 4, selection)).toBe(false);
    });

    it('should handle non-normalized ranges', () => {
      const reversedSelection: Selection = {
        ranges: [
          { startRow: 3, startCol: 3, endRow: 1, endCol: 1 },
        ],
        active: null,
      };
      
      expect(isCellInSelection(2, 2, reversedSelection)).toBe(true);
      expect(isCellInSelection(0, 0, reversedSelection)).toBe(false);
    });

    it('should handle empty selection', () => {
      const emptySelection: Selection = {
        ranges: [],
        active: null,
      };
      
      expect(isCellInSelection(0, 0, emptySelection)).toBe(false);
    });
  });

  describe('singleCellSelection', () => {
    it('should create a single cell selection', () => {
      const selection = singleCellSelection(5, 10);
      
      expect(selection.ranges).toHaveLength(1);
      expect(selection.ranges[0]).toEqual({
        startRow: 5,
        startCol: 10,
        endRow: 5,
        endCol: 10,
      });
      expect(selection.active).toEqual({ row: 5, col: 10 });
    });

    it('should handle zero coordinates', () => {
      const selection = singleCellSelection(0, 0);
      
      expect(selection.ranges[0]).toEqual({
        startRow: 0,
        startCol: 0,
        endRow: 0,
        endCol: 0,
      });
      expect(selection.active).toEqual({ row: 0, col: 0 });
    });
  });
});