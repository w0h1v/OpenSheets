import {
  PersistenceAdapter,
  PersistedState,
  SpreadsheetMetadata,
  SaveResult,
  Version,
  SyncStatus,
  ConflictResolution,
  CellConflict,
} from './types';
import { SpreadsheetCRDT, CRDTOperation } from '../collaboration/crdt';
import { WebSocketCollaborationService } from '../collaboration/websocketService';
import { CellData } from '../types/spreadsheet';

interface ApiConfig {
  baseUrl: string;
  wsUrl: string;
  apiKey?: string;
  userId: string;
  enableRealTimeSync?: boolean;
  conflictStrategy?: 'last-write-wins' | 'manual' | 'merge';
  retryAttempts?: number;
  retryDelay?: number;
}

interface OfflineOperation {
  id: string;
  type: 'save' | 'delete' | 'update';
  timestamp: number;
  data: any;
  retries: number;
}

export class ApiAdapter implements PersistenceAdapter {
  private config: Required<ApiConfig>;
  private wsService?: WebSocketCollaborationService;
  private crdt: SpreadsheetCRDT;
  private offlineQueue: OfflineOperation[] = [];
  private syncStatus: SyncStatus = {
    connected: false,
    syncing: false,
    pendingChanges: 0,
    mode: 'cloud',
  };
  private syncTimer?: NodeJS.Timeout;
  private isOnline: boolean = navigator.onLine;

  constructor(config: ApiConfig) {
    this.config = {
      enableRealTimeSync: true,
      conflictStrategy: 'merge',
      retryAttempts: 3,
      retryDelay: 1000,
      ...config,
    };

    this.crdt = new SpreadsheetCRDT(config.userId);
    
    // Set up real-time sync if enabled
    if (this.config.enableRealTimeSync) {
      this.initializeWebSocket();
    }

    // Monitor online/offline status
    this.setupOfflineHandling();
  }

  private initializeWebSocket(): void {
    this.wsService = new WebSocketCollaborationService(
      this.config.userId,
      `session_${Date.now()}`,
      this.config.wsUrl
    );

    this.wsService.onConnectionChange = (connected) => {
      this.updateSyncStatus({ connected });
      if (connected) {
        this.procesOfflineQueue();
      }
    };

    this.wsService.onCellUpdate = (row, col, data) => {
      // Handle real-time updates from other users
      this.handleRemoteUpdate(row, col, data);
    };

    this.wsService.onError = (error) => {
      console.error('WebSocket error:', error);
      this.updateSyncStatus({ error: error.message });
    };
  }

  private setupOfflineHandling(): void {
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.updateSyncStatus({ connected: true });
      this.procesOfflineQueue();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.updateSyncStatus({ connected: false });
    });
  }

  async save(id: string, state: PersistedState): Promise<SaveResult> {
    this.updateSyncStatus({ syncing: true });

    try {
      // Apply to CRDT for conflict resolution
      state.data.forEach(([key, cellData]) => {
        const [row, col] = key.split(':').map(Number);
        this.crdt.setCell(row, col, cellData);
      });

      if (!this.isOnline) {
        // Queue for later sync
        this.queueOfflineOperation({
          id: `save_${Date.now()}`,
          type: 'save',
          timestamp: Date.now(),
          data: { id, state },
          retries: 0,
        });

        return {
          success: true,
          timestamp: Date.now(),
          error: 'Saved offline, will sync when connection restored',
        };
      }

      // Send to server
      const response = await this.fetchWithRetry(`${this.config.baseUrl}/spreadsheets/${id}`, {
        method: 'PUT',
        headers: this.getHeaders(),
        body: JSON.stringify({
          state,
          operations: this.crdt.getOperationsSince({}),
          vectorClock: this.crdt.getVectorClock(),
        }),
      });

      if (!response.ok) {
        throw new Error(`Save failed: ${response.statusText}`);
      }

      const result = await response.json();

      // Handle conflicts if any
      let conflictResolution: ConflictResolution | undefined;
      if (result.conflicts && result.conflicts.length > 0) {
        conflictResolution = await this.resolveConflicts(result.conflicts, state);
      }

      // Broadcast changes via WebSocket
      if (this.wsService && this.config.enableRealTimeSync) {
        state.data.forEach(([key, cellData]) => {
          const [row, col] = key.split(':').map(Number);
          this.wsService!.updateCell(row, col, cellData);
        });
      }

      this.updateSyncStatus({ 
        syncing: false, 
        lastSync: Date.now(),
        pendingChanges: 0 
      });

      return {
        success: true,
        timestamp: result.timestamp,
        revision: result.revision,
        conflictResolution,
      };
    } catch (error) {
      console.error('API save failed:', error);
      
      // Queue for offline sync
      if (!this.isOnline) {
        this.queueOfflineOperation({
          id: `save_${Date.now()}`,
          type: 'save',
          timestamp: Date.now(),
          data: { id, state },
          retries: 0,
        });
      }

      this.updateSyncStatus({ syncing: false, error: error instanceof Error ? error.message : 'Save failed' });

      return {
        success: false,
        timestamp: Date.now(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async load(id: string): Promise<PersistedState | null> {
    try {
      const response = await this.fetchWithRetry(`${this.config.baseUrl}/spreadsheets/${id}`);
      
      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        throw new Error(`Load failed: ${response.statusText}`);
      }

      const data = await response.json();
      
      // Initialize CRDT with loaded data
      data.state.data.forEach(([key, cellData]: [string, CellData]) => {
        const [row, col] = key.split(':').map(Number);
        this.crdt.setCell(row, col, cellData);
      });

      return data.state;
    } catch (error) {
      console.error('API load failed:', error);
      
      // Try to load from offline cache if available
      const cached = await this.loadFromCache(id);
      if (cached) {
        return cached;
      }

      return null;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      if (!this.isOnline) {
        this.queueOfflineOperation({
          id: `delete_${Date.now()}`,
          type: 'delete',
          timestamp: Date.now(),
          data: { id },
          retries: 0,
        });
        return;
      }

      const response = await this.fetchWithRetry(`${this.config.baseUrl}/spreadsheets/${id}`, {
        method: 'DELETE',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Delete failed: ${response.statusText}`);
      }

      // Clear from cache
      await this.clearCache(id);
    } catch (error) {
      console.error('API delete failed:', error);
      throw error;
    }
  }

  async saveVersion(
    id: string,
    state: PersistedState,
    label?: string
  ): Promise<Version> {
    try {
      const response = await this.fetchWithRetry(`${this.config.baseUrl}/spreadsheets/${id}/versions`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ state, label }),
      });

      if (!response.ok) {
        throw new Error(`Save version failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Save version failed:', error);
      throw error;
    }
  }

  async loadVersion(id: string, versionId: string): Promise<PersistedState | null> {
    try {
      const response = await this.fetchWithRetry(
        `${this.config.baseUrl}/spreadsheets/${id}/versions/${versionId}`
      );

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        throw new Error(`Load version failed: ${response.statusText}`);
      }

      const data = await response.json();
      return data.state;
    } catch (error) {
      console.error('Load version failed:', error);
      return null;
    }
  }

  async listVersions(id: string): Promise<Version[]> {
    try {
      const response = await this.fetchWithRetry(
        `${this.config.baseUrl}/spreadsheets/${id}/versions`
      );

      if (!response.ok) {
        throw new Error(`List versions failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('List versions failed:', error);
      return [];
    }
  }

  async exists(id: string): Promise<boolean> {
    try {
      const response = await this.fetchWithRetry(
        `${this.config.baseUrl}/spreadsheets/${id}/exists`,
        { method: 'HEAD' }
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  async getMetadata(id: string): Promise<SpreadsheetMetadata | null> {
    try {
      const response = await this.fetchWithRetry(
        `${this.config.baseUrl}/spreadsheets/${id}/metadata`
      );

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        throw new Error(`Get metadata failed: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Get metadata failed:', error);
      return null;
    }
  }

  async updateMetadata(
    id: string,
    metadata: Partial<SpreadsheetMetadata>
  ): Promise<void> {
    try {
      const response = await this.fetchWithRetry(
        `${this.config.baseUrl}/spreadsheets/${id}/metadata`,
        {
          method: 'PATCH',
          headers: this.getHeaders(),
          body: JSON.stringify(metadata),
        }
      );

      if (!response.ok) {
        throw new Error(`Update metadata failed: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Update metadata failed:', error);
      
      if (!this.isOnline) {
        this.queueOfflineOperation({
          id: `metadata_${Date.now()}`,
          type: 'update',
          timestamp: Date.now(),
          data: { id, metadata },
          retries: 0,
        });
      }
    }
  }

  getSyncStatus(): SyncStatus {
    return {
      ...this.syncStatus,
      pendingChanges: this.offlineQueue.length,
    };
  }

  // Private helper methods

  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    return headers;
  }

  private async fetchWithRetry(url: string, options?: RequestInit): Promise<Response> {
    let lastError: Error | null = null;

    for (let i = 0; i < this.config.retryAttempts; i++) {
      try {
        const response = await fetch(url, options);
        
        // Don't retry on client errors (4xx)
        if (response.status >= 400 && response.status < 500) {
          return response;
        }

        // Retry on server errors (5xx)
        if (response.status >= 500) {
          throw new Error(`Server error: ${response.status}`);
        }

        return response;
      } catch (error) {
        lastError = error as Error;
        
        // Wait before retrying
        if (i < this.config.retryAttempts - 1) {
          await new Promise(resolve => 
            setTimeout(resolve, this.config.retryDelay * Math.pow(2, i))
          );
        }
      }
    }

    throw lastError || new Error('Request failed');
  }

  private async resolveConflicts(
    conflicts: any[],
    localState: PersistedState
  ): Promise<ConflictResolution> {
    const cellConflicts: CellConflict[] = [];

    for (const conflict of conflicts) {
      const localCell = localState.data.find(([key]) => key === conflict.cell)?.[1];
      
      const cellConflict: CellConflict = {
        cell: conflict.cell,
        localValue: localCell || { value: null },
        serverValue: conflict.serverValue,
      };

      // Apply conflict resolution strategy
      switch (this.config.conflictStrategy) {
        case 'last-write-wins':
          // Use CRDT timestamps to determine winner
          const localOp = this.crdt.getOperationsSince({}).find(
            op => `${op.cell.row}:${op.cell.col}` === conflict.cell
          );
          
          if (localOp && localOp.timestamp > conflict.serverTimestamp) {
            cellConflict.resolution = localCell;
          } else {
            cellConflict.resolution = conflict.serverValue;
          }
          break;

        case 'merge':
          // Attempt to merge values
          cellConflict.resolution = this.mergeValues(localCell, conflict.serverValue);
          break;

        case 'manual':
          // Will require user intervention
          cellConflict.resolution = undefined;
          break;
      }

      cellConflicts.push(cellConflict);
    }

    return {
      type: this.config.conflictStrategy === 'manual' ? 'manual' : 'auto-merged',
      conflicts: cellConflicts,
      resolved: cellConflicts.every(c => c.resolution !== undefined),
    };
  }

  private mergeValues(local?: CellData, server?: CellData): CellData {
    if (!local) return server || { value: null };
    if (!server) return local;

    // Merge formatting
    const format = { ...(server.format || {}), ...(local.format || {}) };
    
    // For formulas, prefer local (user's current work)
    if (local.formula) {
      return { ...local, format };
    }

    // For values, use CRDT or timestamp to decide
    return {
      value: local.value,
      format,
      metadata: { ...server.metadata, ...local.metadata },
    };
  }

  private queueOfflineOperation(operation: OfflineOperation): void {
    this.offlineQueue.push(operation);
    this.updateSyncStatus({ pendingChanges: this.offlineQueue.length });
    
    // Save queue to localStorage for persistence
    localStorage.setItem('opensheets_offline_queue', JSON.stringify(this.offlineQueue));
  }

  private async procesOfflineQueue(): Promise<void> {
    if (this.offlineQueue.length === 0 || !this.isOnline) {
      return;
    }

    const queue = [...this.offlineQueue];
    this.offlineQueue = [];

    for (const operation of queue) {
      try {
        switch (operation.type) {
          case 'save':
            await this.save(operation.data.id, operation.data.state);
            break;
          case 'delete':
            await this.delete(operation.data.id);
            break;
          case 'update':
            await this.updateMetadata(operation.data.id, operation.data.metadata);
            break;
        }
      } catch (error) {
        // Re-queue if failed
        operation.retries++;
        if (operation.retries < this.config.retryAttempts) {
          this.offlineQueue.push(operation);
        }
      }
    }

    // Update queue in localStorage
    if (this.offlineQueue.length > 0) {
      localStorage.setItem('opensheets_offline_queue', JSON.stringify(this.offlineQueue));
    } else {
      localStorage.removeItem('opensheets_offline_queue');
    }

    this.updateSyncStatus({ pendingChanges: this.offlineQueue.length });
  }

  private async loadFromCache(id: string): Promise<PersistedState | null> {
    try {
      const cached = localStorage.getItem(`opensheets_cache_${id}`);
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  }

  private async saveToCache(id: string, state: PersistedState): Promise<void> {
    try {
      localStorage.setItem(`opensheets_cache_${id}`, JSON.stringify(state));
    } catch {
      // Ignore cache errors
    }
  }

  private async clearCache(id: string): Promise<void> {
    localStorage.removeItem(`opensheets_cache_${id}`);
  }

  private updateSyncStatus(updates: Partial<SyncStatus>): void {
    this.syncStatus = { ...this.syncStatus, ...updates };
    this.onSyncStatusChange?.(this.syncStatus);
  }

  private handleRemoteUpdate(row: number, col: number, data: CellData): void {
    // This will be called by WebSocket service
    // You can emit events or update UI here
    console.log(`Remote update: Cell ${row}:${col} updated`, data);
  }

  onSyncStatusChange?: (status: SyncStatus) => void;

  // Cleanup
  disconnect(): void {
    if (this.wsService) {
      this.wsService.disconnect();
    }
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }
  }
}