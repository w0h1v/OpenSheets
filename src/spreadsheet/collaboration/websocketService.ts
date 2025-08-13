import { SpreadsheetCRDT, CRDTOperation, VectorClock } from './crdt';
import { CellData } from '../types/spreadsheet';

export interface CollaborationMessage {
  type: 'operation' | 'sync' | 'presence' | 'cursor' | 'selection';
  userId: string;
  sessionId: string;
  data: any;
  timestamp: number;
}

export interface UserPresence {
  userId: string;
  name: string;
  color: string;
  cursor?: { row: number; col: number };
  selection?: { startRow: number; startCol: number; endRow: number; endCol: number };
  lastSeen: number;
}

export class WebSocketCollaborationService {
  private ws: WebSocket | null = null;
  private crdt: SpreadsheetCRDT;
  private userId: string;
  private sessionId: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private presenceMap: Map<string, UserPresence> = new Map();
  
  // Callbacks
  public onCellUpdate?: (row: number, col: number, data: CellData) => void;
  public onPresenceUpdate?: (presence: Map<string, UserPresence>) => void;
  public onConnectionChange?: (connected: boolean) => void;
  public onError?: (error: Error) => void;

  constructor(
    userId: string,
    sessionId: string,
    websocketUrl: string
  ) {
    this.userId = userId;
    this.sessionId = sessionId;
    this.crdt = new SpreadsheetCRDT(userId);
    this.connect(websocketUrl);
  }

  private connect(url: string): void {
    try {
      this.ws = new WebSocket(url);
      
      this.ws.onopen = () => {
        console.log('WebSocket connected');
        this.reconnectAttempts = 0;
        this.onConnectionChange?.(true);
        this.startHeartbeat();
        this.requestSync();
      };

      this.ws.onmessage = (event) => {
        try {
          const message: CollaborationMessage = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.onError?.(new Error('WebSocket connection error'));
      };

      this.ws.onclose = () => {
        console.log('WebSocket disconnected');
        this.onConnectionChange?.(false);
        this.stopHeartbeat();
        this.attemptReconnect(url);
      };
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      this.onError?.(error as Error);
    }
  }

  private attemptReconnect(url: string): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      this.onError?.(new Error('Failed to reconnect to server'));
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    setTimeout(() => {
      this.connect(url);
    }, delay);
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.send({
        type: 'presence',
        userId: this.userId,
        sessionId: this.sessionId,
        data: {
          timestamp: Date.now(),
        },
        timestamp: Date.now(),
      });
    }, 30000); // Send heartbeat every 30 seconds
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private handleMessage(message: CollaborationMessage): void {
    switch (message.type) {
      case 'operation':
        this.handleOperation(message.data as CRDTOperation);
        break;
      case 'sync':
        this.handleSync(message.data);
        break;
      case 'presence':
        this.handlePresence(message);
        break;
      case 'cursor':
        this.handleCursor(message);
        break;
      case 'selection':
        this.handleSelection(message);
        break;
    }
  }

  private handleOperation(operation: CRDTOperation): void {
    // Don't apply our own operations again
    if (operation.userId === this.userId) {
      return;
    }

    // Apply the operation to our CRDT
    this.crdt.applyOperation(operation);

    // Notify the application
    const cellData = this.crdt.getCell(operation.cell.row, operation.cell.col);
    if (cellData !== undefined) {
      this.onCellUpdate?.(operation.cell.row, operation.cell.col, cellData);
    }
  }

  private handleSync(data: { operations: CRDTOperation[]; vectorClock: VectorClock }): void {
    // Apply all operations we don't have
    data.operations.forEach(operation => {
      this.crdt.applyOperation(operation);
    });

    // Update all cells in the UI
    const allCells = this.crdt.getAllCells();
    allCells.forEach((cellData, key) => {
      const [row, col] = key.split(':').map(Number);
      this.onCellUpdate?.(row, col, cellData);
    });
  }

  private handlePresence(message: CollaborationMessage): void {
    const presence: UserPresence = {
      userId: message.userId,
      name: message.data.name || `User ${message.userId.slice(0, 6)}`,
      color: message.data.color || this.generateUserColor(message.userId),
      cursor: message.data.cursor,
      selection: message.data.selection,
      lastSeen: Date.now(),
    };

    this.presenceMap.set(message.userId, presence);
    this.cleanupStalePresence();
    this.onPresenceUpdate?.(new Map(this.presenceMap));
  }

  private handleCursor(message: CollaborationMessage): void {
    const presence = this.presenceMap.get(message.userId);
    if (presence) {
      presence.cursor = message.data.cursor;
      presence.lastSeen = Date.now();
      this.onPresenceUpdate?.(new Map(this.presenceMap));
    }
  }

  private handleSelection(message: CollaborationMessage): void {
    const presence = this.presenceMap.get(message.userId);
    if (presence) {
      presence.selection = message.data.selection;
      presence.lastSeen = Date.now();
      this.onPresenceUpdate?.(new Map(this.presenceMap));
    }
  }

  private cleanupStalePresence(): void {
    const now = Date.now();
    const staleThreshold = 60000; // 1 minute

    const toDelete: string[] = [];
    this.presenceMap.forEach((presence, userId) => {
      if (now - presence.lastSeen > staleThreshold) {
        toDelete.push(userId);
      }
    });

    toDelete.forEach(userId => this.presenceMap.delete(userId));
  }

  private generateUserColor(userId: string): string {
    // Generate a consistent color for each user
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
      '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
      '#BB8FCE', '#85C1E2', '#F8B739', '#52B788',
    ];
    
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
      hash = ((hash << 5) - hash) + userId.charCodeAt(i);
      hash = hash & hash;
    }
    
    return colors[Math.abs(hash) % colors.length];
  }

  private send(message: CollaborationMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  private requestSync(): void {
    this.send({
      type: 'sync',
      userId: this.userId,
      sessionId: this.sessionId,
      data: {
        vectorClock: this.crdt.getVectorClock(),
      },
      timestamp: Date.now(),
    });
  }

  // Public methods for the application to use

  public updateCell(row: number, col: number, data: CellData): void {
    const operation = this.crdt.setCell(row, col, data);
    
    this.send({
      type: 'operation',
      userId: this.userId,
      sessionId: this.sessionId,
      data: operation,
      timestamp: Date.now(),
    });
  }

  public deleteCell(row: number, col: number): void {
    const operation = this.crdt.deleteCell(row, col);
    
    this.send({
      type: 'operation',
      userId: this.userId,
      sessionId: this.sessionId,
      data: operation,
      timestamp: Date.now(),
    });
  }

  public updateCursor(row: number, col: number): void {
    this.send({
      type: 'cursor',
      userId: this.userId,
      sessionId: this.sessionId,
      data: {
        cursor: { row, col },
      },
      timestamp: Date.now(),
    });
  }

  public updateSelection(
    startRow: number,
    startCol: number,
    endRow: number,
    endCol: number
  ): void {
    this.send({
      type: 'selection',
      userId: this.userId,
      sessionId: this.sessionId,
      data: {
        selection: { startRow, startCol, endRow, endCol },
      },
      timestamp: Date.now(),
    });
  }

  public disconnect(): void {
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  public isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  public getPresence(): Map<string, UserPresence> {
    return new Map(this.presenceMap);
  }

  public getCRDT(): SpreadsheetCRDT {
    return this.crdt;
  }
}