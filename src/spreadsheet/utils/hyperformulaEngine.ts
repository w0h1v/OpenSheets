import HyperFormula, { 
  CellValue, 
  SimpleCellAddress,
  RawCellContent
} from 'hyperformula';
import { CellData, SparseMatrix, keyOf } from '../types/spreadsheet';

export class FormulaEngine {
  private hf: HyperFormula;
  private sheetId: number = 0;
  private sheetName: string = 'Sheet1';

  constructor(config?: any) {
    this.hf = HyperFormula.buildEmpty({
      licenseKey: 'gpl-v3', // Use appropriate license
      ...config,
    });
    
    // Add a default sheet
    this.hf.addSheet(this.sheetName);
  }

  // Initialize with existing data
  public initializeWithData(data: SparseMatrix<CellData>, maxRows: number, maxCols: number): void {
    // Convert sparse matrix to 2D array for HyperFormula
    const sheetData: RawCellContent[][] = [];
    
    for (let row = 0; row < maxRows; row++) {
      sheetData[row] = [];
      for (let col = 0; col < maxCols; col++) {
        const cellData = data.get(keyOf(row, col));
        if (cellData) {
          if (cellData.formula) {
            sheetData[row][col] = cellData.formula;
          } else if (cellData.value !== undefined && cellData.value !== null) {
            sheetData[row][col] = cellData.value;
          } else {
            sheetData[row][col] = null;
          }
        } else {
          sheetData[row][col] = null;
        }
      }
    }

    // Replace the sheet with new data
    try {
      this.hf.setSheetContent(this.sheetId, sheetData);
    } catch (error) {
      console.error('Failed to initialize HyperFormula with data:', error);
      // If setting content fails, try rebuilding
      this.rebuild(sheetData);
    }
  }

  // Rebuild the engine with new data
  private rebuild(sheetData: RawCellContent[][]): void {
    this.hf = HyperFormula.buildFromArray(sheetData, {
      licenseKey: 'gpl-v3',
    });
    this.sheetId = this.hf.getSheetId(this.sheetName) ?? 0;
  }

  // Set a cell value or formula
  public setCell(row: number, col: number, value: any): void {
    const address: SimpleCellAddress = { sheet: this.sheetId, row, col };
    
    try {
      if (typeof value === 'string' && value.startsWith('=')) {
        // It's a formula
        this.hf.setCellContents(address, value);
      } else {
        // It's a value
        this.hf.setCellContents(address, value);
      }
    } catch (error) {
      console.error(`Failed to set cell ${row}:${col}:`, error);
    }
  }

  // Get the calculated value of a cell
  public getCellValue(row: number, col: number): any {
    const address: SimpleCellAddress = { sheet: this.sheetId, row, col };
    
    try {
      const value = this.hf.getCellValue(address);
      
      // Handle HyperFormula error values
      if (this.isError(value)) {
        return this.formatError(value);
      }
      
      return value;
    } catch (error) {
      console.error(`Failed to get cell value ${row}:${col}:`, error);
      return undefined;
    }
  }

  // Get the formula of a cell (if any)
  public getCellFormula(row: number, col: number): string | undefined {
    const address: SimpleCellAddress = { sheet: this.sheetId, row, col };
    
    try {
      const formula = this.hf.getCellFormula(address);
      return formula || undefined;
    } catch (error) {
      console.error(`Failed to get cell formula ${row}:${col}:`, error);
      return undefined;
    }
  }

  // Evaluate a formula without setting it in a cell
  public evaluateFormula(formula: string): any {
    if (!formula.startsWith('=')) {
      return formula;
    }

    try {
      // Use a temporary cell for evaluation
      const tempAddress: SimpleCellAddress = { 
        sheet: this.sheetId, 
        row: 9999, 
        col: 9999 
      };
      
      this.hf.setCellContents(tempAddress, formula);
      const result = this.hf.getCellValue(tempAddress);
      this.hf.setCellContents(tempAddress, null); // Clear temp cell
      
      if (this.isError(result)) {
        return this.formatError(result);
      }
      
      return result;
    } catch (error) {
      console.error('Failed to evaluate formula:', error);
      return '#ERROR!';
    }
  }

  // Insert rows
  public insertRows(index: number, count: number = 1): void {
    try {
      this.hf.addRows(this.sheetId, [index, count]);
    } catch (error) {
      console.error('Failed to insert rows:', error);
    }
  }

  // Delete rows
  public deleteRows(index: number, count: number = 1): void {
    try {
      this.hf.removeRows(this.sheetId, [index, count]);
    } catch (error) {
      console.error('Failed to delete rows:', error);
    }
  }

  // Insert columns
  public insertColumns(index: number, count: number = 1): void {
    try {
      this.hf.addColumns(this.sheetId, [index, count]);
    } catch (error) {
      console.error('Failed to insert columns:', error);
    }
  }

  // Delete columns
  public deleteColumns(index: number, count: number = 1): void {
    try {
      this.hf.removeColumns(this.sheetId, [index, count]);
    } catch (error) {
      console.error('Failed to delete columns:', error);
    }
  }

  // Copy cells
  public copyCells(
    sourceStart: { row: number; col: number },
    sourceEnd: { row: number; col: number },
    destination: { row: number; col: number }
  ): void {
    try {
      const sourceRange = {
        start: { sheet: this.sheetId, row: sourceStart.row, col: sourceStart.col },
        end: { sheet: this.sheetId, row: sourceEnd.row, col: sourceEnd.col },
      };
      
      const destAddress: SimpleCellAddress = {
        sheet: this.sheetId,
        row: destination.row,
        col: destination.col,
      };
      
      this.hf.copy(sourceRange);
      this.hf.paste(destAddress);
    } catch (error) {
      console.error('Failed to copy cells:', error);
    }
  }

  // Move cells
  public moveCells(
    sourceStart: { row: number; col: number },
    sourceEnd: { row: number; col: number },
    destination: { row: number; col: number }
  ): void {
    try {
      const sourceRange = {
        start: { sheet: this.sheetId, row: sourceStart.row, col: sourceStart.col },
        end: { sheet: this.sheetId, row: sourceEnd.row, col: sourceEnd.col },
      };
      
      const destAddress: SimpleCellAddress = {
        sheet: this.sheetId,
        row: destination.row,
        col: destination.col,
      };
      
      this.hf.cut(sourceRange);
      this.hf.paste(destAddress);
    } catch (error) {
      console.error('Failed to move cells:', error);
    }
  }

  // Clear cells
  public clearCells(
    start: { row: number; col: number },
    end: { row: number; col: number }
  ): void {
    try {
      const range = {
        start: { sheet: this.sheetId, row: start.row, col: start.col },
        end: { sheet: this.sheetId, row: end.row, col: end.col },
      };
      
      // Clear content - using setCellContent with null
      for (let row = range.start.row; row <= range.end.row; row++) {
        for (let col = range.start.col; col <= range.end.col; col++) {
          this.hf.setCellContents({ row, col, sheet: this.sheetId }, null);
        }
      }
    } catch (error) {
      console.error('Failed to clear cells:', error);
    }
  }

  // Get all changed cells after an operation
  public getChangedCells(): Array<{ row: number; col: number; value: any }> {
    // HyperFormula doesn't have getAllCellValues, so return empty for now
    // In a real implementation, you'd track changes manually
    return [];
  }

  // Check if a value is an error
  private isError(value: CellValue): boolean {
    return typeof value === 'object' && value !== null && 'type' in value;
  }

  // Format error values
  private formatError(error: any): string {
    if (error.type) {
      switch (error.type) {
        case 'DIV_BY_ZERO':
          return '#DIV/0!';
        case 'NAME':
          return '#NAME?';
        case 'NUM':
          return '#NUM!';
        case 'REF':
          return '#REF!';
        case 'VALUE':
          return '#VALUE!';
        case 'NA':
          return '#N/A';
        case 'CYCLE':
          return '#CYCLE!';
        default:
          return '#ERROR!';
      }
    }
    return '#ERROR!';
  }

  // Undo last operation - not supported in this HyperFormula version
  public undo(): void {
    // HyperFormula doesn't have built-in undo/redo in this version
    console.warn('Undo not implemented in HyperFormula engine');
  }

  // Redo last undone operation - not supported in this HyperFormula version
  public redo(): void {
    // HyperFormula doesn't have built-in undo/redo in this version
    console.warn('Redo not implemented in HyperFormula engine');
  }

  // Check if can undo - not supported in this HyperFormula version
  public canUndo(): boolean {
    return false;
  }

  // Check if can redo - not supported in this HyperFormula version
  public canRedo(): boolean {
    return false;
  }

  // Get available functions
  public getAvailableFunctions(): string[] {
    return this.hf.getRegisteredFunctionNames();
  }

  // Validate a formula
  public validateFormula(formula: string): { valid: boolean; error?: string } {
    if (!formula.startsWith('=')) {
      return { valid: true };
    }

    try {
      // Try parsing the formula
      const tempAddress: SimpleCellAddress = { 
        sheet: this.sheetId, 
        row: 9998, 
        col: 9998 
      };
      
      this.hf.setCellContents(tempAddress, formula);
      const result = this.hf.getCellValue(tempAddress);
      this.hf.setCellContents(tempAddress, null);
      
      if (this.isError(result)) {
        return { valid: false, error: this.formatError(result) };
      }
      
      return { valid: true };
    } catch (error) {
      return { valid: false, error: String(error) };
    }
  }

  // Destroy the engine (cleanup)
  public destroy(): void {
    this.hf.destroy();
  }
}