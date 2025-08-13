import { CellData } from '../types/spreadsheet';

// CRDT (Conflict-free Replicated Data Type) implementation for collaborative editing
// Using a Last-Write-Wins Element Set (LWW-Element-Set) for simplicity

export interface CRDTOperation {
  id: string;
  timestamp: number;
  userId: string;
  type: 'set' | 'delete';
  cell: { row: number; col: number };
  data?: CellData;
  vectorClock: VectorClock;
}

export interface VectorClock {
  [userId: string]: number;
}

export class SpreadsheetCRDT {
  private operations: Map<string, CRDTOperation> = new Map();
  private vectorClock: VectorClock = {};
  private userId: string;
  private data: Map<string, { value: CellData; timestamp: number; userId: string }> = new Map();

  constructor(userId: string) {
    this.userId = userId;
    this.vectorClock[userId] = 0;
  }

  // Generate a unique operation ID
  private generateOperationId(): string {
    return `${this.userId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Increment vector clock for this user
  private incrementClock(): VectorClock {
    this.vectorClock[this.userId] = (this.vectorClock[this.userId] || 0) + 1;
    return { ...this.vectorClock };
  }

  // Check if operation a happens before operation b
  private happensBefore(a: VectorClock, b: VectorClock): boolean {
    let allLessOrEqual = true;
    let atLeastOneLess = false;

    for (const userId in a) {
      if ((a[userId] || 0) > (b[userId] || 0)) {
        allLessOrEqual = false;
        break;
      }
      if ((a[userId] || 0) < (b[userId] || 0)) {
        atLeastOneLess = true;
      }
    }

    return allLessOrEqual && atLeastOneLess;
  }

  // Check if two operations are concurrent
  private areConcurrent(a: VectorClock, b: VectorClock): boolean {
    return !this.happensBefore(a, b) && !this.happensBefore(b, a);
  }

  // Set a cell value
  setCell(row: number, col: number, data: CellData): CRDTOperation {
    const operation: CRDTOperation = {
      id: this.generateOperationId(),
      timestamp: Date.now(),
      userId: this.userId,
      type: 'set',
      cell: { row, col },
      data,
      vectorClock: this.incrementClock(),
    };

    this.applyOperation(operation);
    return operation;
  }

  // Delete a cell
  deleteCell(row: number, col: number): CRDTOperation {
    const operation: CRDTOperation = {
      id: this.generateOperationId(),
      timestamp: Date.now(),
      userId: this.userId,
      type: 'delete',
      cell: { row, col },
      vectorClock: this.incrementClock(),
    };

    this.applyOperation(operation);
    return operation;
  }

  // Apply an operation (local or remote)
  applyOperation(operation: CRDTOperation): void {
    const key = `${operation.cell.row}:${operation.cell.col}`;
    
    // Store the operation
    this.operations.set(operation.id, operation);
    
    // Update vector clock
    for (const userId in operation.vectorClock) {
      this.vectorClock[userId] = Math.max(
        this.vectorClock[userId] || 0,
        operation.vectorClock[userId]
      );
    }

    // Apply the operation to data
    const existing = this.data.get(key);
    
    if (!existing || this.shouldApply(operation, existing)) {
      if (operation.type === 'set' && operation.data) {
        this.data.set(key, {
          value: operation.data,
          timestamp: operation.timestamp,
          userId: operation.userId,
        });
      } else if (operation.type === 'delete') {
        this.data.delete(key);
      }
    }
  }

  // Determine if an operation should be applied based on LWW and vector clocks
  private shouldApply(
    operation: CRDTOperation,
    existing: { timestamp: number; userId: string }
  ): boolean {
    // If timestamps are different, use Last-Write-Wins
    if (operation.timestamp !== existing.timestamp) {
      return operation.timestamp > existing.timestamp;
    }
    
    // If timestamps are the same, use userId as tiebreaker for deterministic ordering
    return operation.userId > existing.userId;
  }

  // Merge with another CRDT instance
  merge(other: SpreadsheetCRDT): void {
    // Apply all operations from the other CRDT
    other.operations.forEach(operation => {
      if (!this.operations.has(operation.id)) {
        this.applyOperation(operation);
      }
    });
  }

  // Get the current state of a cell
  getCell(row: number, col: number): CellData | undefined {
    const key = `${row}:${col}`;
    return this.data.get(key)?.value;
  }

  // Get all cells
  getAllCells(): Map<string, CellData> {
    const result = new Map<string, CellData>();
    this.data.forEach((value, key) => {
      result.set(key, value.value);
    });
    return result;
  }

  // Get operations since a given vector clock (for syncing)
  getOperationsSince(clock: VectorClock): CRDTOperation[] {
    const operations: CRDTOperation[] = [];
    
    this.operations.forEach(operation => {
      // Check if this operation happened after the given clock
      let isNewer = false;
      for (const userId in operation.vectorClock) {
        if ((operation.vectorClock[userId] || 0) > (clock[userId] || 0)) {
          isNewer = true;
          break;
        }
      }
      
      if (isNewer) {
        operations.push(operation);
      }
    });
    
    // Sort by timestamp for consistent ordering
    return operations.sort((a, b) => a.timestamp - b.timestamp);
  }

  // Get current vector clock
  getVectorClock(): VectorClock {
    return { ...this.vectorClock };
  }

  // Garbage collection: remove old operations
  garbageCollect(olderThan: number): void {
    const cutoff = Date.now() - olderThan;
    const toDelete: string[] = [];
    
    this.operations.forEach((operation, id) => {
      if (operation.timestamp < cutoff) {
        toDelete.push(id);
      }
    });
    
    toDelete.forEach(id => this.operations.delete(id));
  }
}

// Operational Transformation alternative (simpler for text but can be adapted)
export class OperationalTransform {
  private operations: any[] = [];
  private version: number = 0;

  // Transform operation a against operation b
  transform(a: any, b: any): [any, any] {
    // This is a simplified version - real OT is more complex
    // For cell-based spreadsheets, conflicts are simpler than text
    
    if (a.cell.row === b.cell.row && a.cell.col === b.cell.col) {
      // Same cell - last write wins based on timestamp
      if (a.timestamp > b.timestamp) {
        return [a, null];
      } else {
        return [null, b];
      }
    }
    
    // Different cells - no conflict
    return [a, b];
  }

  applyOperation(operation: any): void {
    this.operations.push(operation);
    this.version++;
  }

  getVersion(): number {
    return this.version;
  }
}