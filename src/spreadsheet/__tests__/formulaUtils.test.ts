import { 
  parseCellRef, 
  cellRefToString, 
  isAbsoluteRef,
  cellsInRange,
  evaluateFormula,
  updateFormulaReferences
} from '../utils/formulaUtils';

describe('Formula Utils', () => {
  describe('parseCellRef', () => {
    it('should parse simple cell references', () => {
      expect(parseCellRef('A1')).toEqual([0, 0]);
      expect(parseCellRef('B2')).toEqual([1, 1]);
      expect(parseCellRef('Z10')).toEqual([9, 25]);
      expect(parseCellRef('AA1')).toEqual([0, 26]);
    });

    it('should parse absolute cell references', () => {
      expect(parseCellRef('$A$1')).toEqual([0, 0]);
      expect(parseCellRef('$B2')).toEqual([1, 1]);
      expect(parseCellRef('C$3')).toEqual([2, 2]);
    });

    it('should throw on invalid references', () => {
      expect(() => parseCellRef('123')).toThrow();
      expect(() => parseCellRef('ABC')).toThrow();
      expect(() => parseCellRef('')).toThrow();
    });
  });

  describe('cellRefToString', () => {
    it('should convert coordinates to cell reference', () => {
      expect(cellRefToString(0, 0)).toBe('A1');
      expect(cellRefToString(1, 1)).toBe('B2');
      expect(cellRefToString(9, 25)).toBe('Z10');
      expect(cellRefToString(0, 26)).toBe('AA1');
    });

    it('should handle absolute references', () => {
      expect(cellRefToString(0, 0, true, true)).toBe('$A$1');
      expect(cellRefToString(1, 1, false, true)).toBe('$B2');
      expect(cellRefToString(2, 2, true, false)).toBe('C$3');
    });
  });

  describe('isAbsoluteRef', () => {
    it('should detect absolute references', () => {
      expect(isAbsoluteRef('$A$1')).toEqual({ row: true, col: true });
      expect(isAbsoluteRef('$A1')).toEqual({ row: false, col: true });
      expect(isAbsoluteRef('A$1')).toEqual({ row: true, col: false });
      expect(isAbsoluteRef('A1')).toEqual({ row: false, col: false });
    });
  });

  describe('cellsInRange', () => {
    it('should return all cells in a range', () => {
      const cells = cellsInRange('A1', 'B2');
      expect(cells).toHaveLength(4);
      expect(cells).toContainEqual([0, 0]);
      expect(cells).toContainEqual([0, 1]);
      expect(cells).toContainEqual([1, 0]);
      expect(cells).toContainEqual([1, 1]);
    });

    it('should handle reverse ranges', () => {
      const cells = cellsInRange('B2', 'A1');
      expect(cells).toHaveLength(4);
      expect(cells).toContainEqual([0, 0]);
      expect(cells).toContainEqual([1, 1]);
    });

    it('should handle single cell ranges', () => {
      const cells = cellsInRange('A1', 'A1');
      expect(cells).toHaveLength(1);
      expect(cells[0]).toEqual([0, 0]);
    });
  });

  describe('evaluateFormula', () => {
    const mockGetCellValue = (row: number, col: number) => {
      const values: { [key: string]: any } = {
        '0:0': 10,  // A1
        '1:0': 20,  // A2
        '2:0': 30,  // A3
        '0:1': 5,   // B1
        '1:1': 15,  // B2
        '2:1': 25,  // B3
      };
      return values[`${row}:${col}`];
    };

    it('should evaluate SUM function', () => {
      expect(evaluateFormula('=SUM(A1:A3)', mockGetCellValue)).toBe(60);
      expect(evaluateFormula('=SUM(A1,B1)', mockGetCellValue)).toBe(15);
      expect(evaluateFormula('=SUM(A1:B2)', mockGetCellValue)).toBe(50);
    });

    it('should evaluate AVERAGE function', () => {
      expect(evaluateFormula('=AVERAGE(A1:A3)', mockGetCellValue)).toBe(20);
      expect(evaluateFormula('=AVERAGE(A1,B1)', mockGetCellValue)).toBe(7.5);
    });

    it('should evaluate COUNT function', () => {
      expect(evaluateFormula('=COUNT(A1:A3)', mockGetCellValue)).toBe(3);
      expect(evaluateFormula('=COUNT(A1:B3)', mockGetCellValue)).toBe(6);
    });

    it('should evaluate MIN and MAX functions', () => {
      expect(evaluateFormula('=MIN(A1:B3)', mockGetCellValue)).toBe(5);
      expect(evaluateFormula('=MAX(A1:B3)', mockGetCellValue)).toBe(30);
    });

    it('should evaluate simple arithmetic', () => {
      expect(evaluateFormula('=2+2', mockGetCellValue)).toBe(4);
      expect(evaluateFormula('=10*5', mockGetCellValue)).toBe(50);
      expect(evaluateFormula('=100/4', mockGetCellValue)).toBe(25);
    });

    it('should handle cell references in arithmetic', () => {
      expect(evaluateFormula('=A1+B1', mockGetCellValue)).toBe(15);
      expect(evaluateFormula('=A2*2', mockGetCellValue)).toBe(40);
    });

    it('should return #ERROR for invalid formulas', () => {
      expect(evaluateFormula('=INVALID()', mockGetCellValue)).toBe('#ERROR');
      expect(evaluateFormula('=1/0', mockGetCellValue)).toBe('#ERROR');
    });

    it('should return non-formula values as-is', () => {
      expect(evaluateFormula('Hello', mockGetCellValue)).toBe('Hello');
      expect(evaluateFormula('123', mockGetCellValue)).toBe('123');
    });
  });

  describe('updateFormulaReferences', () => {
    it('should update references when inserting rows', () => {
      expect(updateFormulaReferences('=A1+A2', 'insertRow', 1, 1))
        .toBe('=A1+A3');
      expect(updateFormulaReferences('=SUM(A1:A5)', 'insertRow', 2, 2))
        .toBe('=SUM(A1:A7)');
    });

    it('should update references when deleting rows', () => {
      expect(updateFormulaReferences('=A3+A4', 'deleteRow', 1, 1))
        .toBe('=A2+A3');
      expect(updateFormulaReferences('=A2', 'deleteRow', 2, 1))
        .toBe('=A2');
    });

    it('should update references when inserting columns', () => {
      expect(updateFormulaReferences('=A1+B1', 'insertColumn', 1, 1))
        .toBe('=A1+C1');
      expect(updateFormulaReferences('=SUM(A1:C1)', 'insertColumn', 1, 1))
        .toBe('=SUM(A1:D1)');
    });

    it('should update references when deleting columns', () => {
      expect(updateFormulaReferences('=C1+D1', 'deleteColumn', 1, 1))
        .toBe('=B1+C1');
      expect(updateFormulaReferences('=B1', 'deleteColumn', 1, 1))
        .toBe('=#REF!');
    });

    it('should not update absolute references', () => {
      expect(updateFormulaReferences('=$A$1+A2', 'insertRow', 0, 1))
        .toBe('=$A$1+A3');
      expect(updateFormulaReferences('=$A$1+$A2', 'insertRow', 0, 1))
        .toBe('=$A$1+$A2');
    });

    it('should return #REF! for deleted cell references', () => {
      expect(updateFormulaReferences('=A2', 'deleteRow', 2, 1))
        .toBe('=#REF!');
      expect(updateFormulaReferences('=B1', 'deleteColumn', 1, 1))
        .toBe('=#REF!');
    });
  });
});