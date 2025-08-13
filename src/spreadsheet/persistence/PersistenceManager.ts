import {
  PersistenceAdapter,
  PersistedState,
  SpreadsheetMetadata,
  SyncStatus,
  SaveResult,
} from './types';
import { SpreadsheetState } from '../types/spreadsheet';
import { LocalStorageAdapter } from './LocalStorageAdapter';
import { ApiAdapter } from './ApiAdapter';

export type PersistenceMode = 'local' | 'api' | 'hybrid';

interface PersistenceManagerConfig {
  mode: PersistenceMode;
  spreadsheetId: string;
  autoSave?: boolean;
  autoSaveInterval?: number;
  apiConfig?: {
    baseUrl: string;
    wsUrl: string;
    apiKey?: string;
    userId: string;
  };
  onSyncStatusChange?: (status: SyncStatus) => void;
  onSaveComplete?: (result: SaveResult) => void;
  onConflict?: (conflicts: any[]) => void;
}

export class PersistenceManager {
  private adapter: PersistenceAdapter;
  private localAdapter?: LocalStorageAdapter;
  private apiAdapter?: ApiAdapter;
  private config: PersistenceManagerConfig;
  private autoSaveTimer?: NodeJS.Timeout;
  private _lastSaveTimestamp: number = 0;
  private pendingSave: boolean = false;
  private saveQueue: (() => Promise<void>)[] = [];

  constructor(config: PersistenceManagerConfig) {
    this.config = {
      autoSave: true,
      autoSaveInterval: 5000, // 5 seconds default
      ...config,
    };

    // Initialize adapters based on mode
    this.adapter = this.initializeAdapter();

    // Set up auto-save if enabled
    if (this.config.autoSave) {
      this.startAutoSave();
    }

    // Load offline queue if exists
    this.loadOfflineQueue();
  }

  private initializeAdapter(): PersistenceAdapter {
    switch (this.config.mode) {
      case 'local':
        this.localAdapter = new LocalStorageAdapter(true);
        this.localAdapter.onSyncStatusChange = this.config.onSyncStatusChange;
        return this.localAdapter;

      case 'api':
        if (!this.config.apiConfig) {
          throw new Error('API configuration required for API mode');
        }
        this.apiAdapter = new ApiAdapter(this.config.apiConfig);
        this.apiAdapter.onSyncStatusChange = this.config.onSyncStatusChange;
        return this.apiAdapter;

      case 'hybrid':
        // Use both local and API adapters
        this.localAdapter = new LocalStorageAdapter(true);
        if (this.config.apiConfig) {
          this.apiAdapter = new ApiAdapter(this.config.apiConfig);
          this.apiAdapter.onSyncStatusChange = this.config.onSyncStatusChange;
        }
        // Return a hybrid adapter that uses both
        return this.createHybridAdapter();

      default:
        throw new Error(`Unknown persistence mode: ${this.config.mode}`);
    }
  }

  private createHybridAdapter(): PersistenceAdapter {
    // Hybrid adapter saves to both local and API
    const self = this;
    
    return {
      async save(id: string, state: PersistedState): Promise<SaveResult> {
        // Save locally first (fast)
        const localResult = await self.localAdapter!.save(id, state);
        
        // Then save to API (may be slower)
        if (self.apiAdapter) {
          try {
            const apiResult = await self.apiAdapter.save(id, state);
            
            // Return API result if successful, otherwise local
            if (apiResult.success) {
              return apiResult;
            }
          } catch (error) {
            console.warn('API save failed, using local only:', error);
          }
        }
        
        return localResult;
      },

      async load(id: string): Promise<PersistedState | null> {
        // Try to load from API first (most recent)
        if (self.apiAdapter) {
          try {
            const apiData = await self.apiAdapter.load(id);
            if (apiData) {
              // Update local cache
              await self.localAdapter!.save(id, apiData);
              return apiData;
            }
          } catch (error) {
            console.warn('API load failed, using local:', error);
          }
        }
        
        // Fall back to local
        return self.localAdapter!.load(id);
      },

      async delete(id: string): Promise<void> {
        // Delete from both
        await Promise.all([
          self.localAdapter!.delete(id),
          self.apiAdapter?.delete(id),
        ]);
      },

      async saveVersion(id: string, state: PersistedState, label?: string) {
        // Save version to both
        const localVersion = await self.localAdapter!.saveVersion(id, state, label);
        
        if (self.apiAdapter) {
          try {
            return await self.apiAdapter.saveVersion(id, state, label);
          } catch {
            // Fall back to local version
          }
        }
        
        return localVersion;
      },

      async loadVersion(id: string, versionId: string) {
        // Try API first
        if (self.apiAdapter) {
          try {
            const version = await self.apiAdapter.loadVersion(id, versionId);
            if (version) return version;
          } catch {}
        }
        
        return self.localAdapter!.loadVersion(id, versionId);
      },

      async listVersions(id: string) {
        // Combine versions from both sources
        const localVersions = await self.localAdapter!.listVersions(id);
        
        if (self.apiAdapter) {
          try {
            const apiVersions = await self.apiAdapter.listVersions(id);
            // Merge and deduplicate
            const versionMap = new Map();
            [...localVersions, ...apiVersions].forEach(v => {
              versionMap.set(v.id, v);
            });
            return Array.from(versionMap.values()).sort((a, b) => b.timestamp - a.timestamp);
          } catch {}
        }
        
        return localVersions;
      },

      async exists(id: string) {
        const localExists = await self.localAdapter!.exists(id);
        if (localExists) return true;
        
        if (self.apiAdapter) {
          return self.apiAdapter.exists(id);
        }
        
        return false;
      },

      async getMetadata(id: string) {
        // Try API first for most recent metadata
        if (self.apiAdapter) {
          try {
            const metadata = await self.apiAdapter.getMetadata(id);
            if (metadata) return metadata;
          } catch {}
        }
        
        return self.localAdapter!.getMetadata(id);
      },

      async updateMetadata(id: string, metadata: Partial<SpreadsheetMetadata>) {
        // Update both
        await Promise.all([
          self.localAdapter!.updateMetadata(id, metadata),
          self.apiAdapter?.updateMetadata(id, metadata),
        ]);
      },

      getSyncStatus() {
        // Combine status from both adapters
        const localStatus = self.localAdapter!.getSyncStatus();
        const apiStatus = self.apiAdapter?.getSyncStatus();
        
        if (!apiStatus) return localStatus;
        
        return {
          connected: apiStatus.connected,
          syncing: localStatus.syncing || apiStatus.syncing,
          lastSync: Math.max(localStatus.lastSync || 0, apiStatus.lastSync || 0),
          pendingChanges: apiStatus.pendingChanges,
          error: apiStatus.error || localStatus.error,
          mode: 'hybrid' as const,
        };
      },

      onSyncStatusChange: self.config.onSyncStatusChange,
    };
  }

  // Convert SpreadsheetState to PersistedState
  private stateToPersistedState(state: SpreadsheetState): PersistedState {
    const metadata: SpreadsheetMetadata = {
      id: this.config.spreadsheetId,
      title: `Spreadsheet ${this.config.spreadsheetId}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      revision: 0,
    };

    return {
      version: '2.0.0',
      data: Array.from(state.data.entries()),
      rowHeights: state.rowHeights || [],
      colWidths: state.colWidths || [],
      validation: state.validation ? Array.from(state.validation.entries()) : undefined,
      metadata,
    };
  }

  // Public methods

  async save(state: SpreadsheetState): Promise<SaveResult> {
    // Debounce rapid saves
    if (this.pendingSave) {
      return new Promise((resolve) => {
        this.saveQueue.push(async () => {
          const result = await this.performSave(state);
          resolve(result);
        });
      });
    }

    return this.performSave(state);
  }

  private async performSave(state: SpreadsheetState): Promise<SaveResult> {
    this.pendingSave = true;
    const persistedState = this.stateToPersistedState(state);
    
    try {
      const result = await this.adapter.save(this.config.spreadsheetId, persistedState);
      
      this._lastSaveTimestamp = Date.now();
      this.config.onSaveComplete?.(result);
      
      // Process any queued saves
      while (this.saveQueue.length > 0) {
        const nextSave = this.saveQueue.shift();
        await nextSave?.();
      }
      
      return result;
    } finally {
      this.pendingSave = false;
    }
  }

  async load(): Promise<SpreadsheetState | null> {
    const persisted = await this.adapter.load(this.config.spreadsheetId);
    
    if (!persisted) {
      return null;
    }

    // Convert PersistedState back to SpreadsheetState
    return {
      data: new Map(persisted.data),
      maxRows: 1000,
      maxCols: 100,
      selection: { ranges: [], active: null },
      editing: null,
      formulaInput: '',
      rowHeights: persisted.rowHeights,
      colWidths: persisted.colWidths,
      validation: persisted.validation ? new Map(persisted.validation) : undefined,
    };
  }

  async saveVersion(state: SpreadsheetState, label?: string) {
    const persistedState = this.stateToPersistedState(state);
    return this.adapter.saveVersion(this.config.spreadsheetId, persistedState, label);
  }

  async loadVersion(versionId: string): Promise<SpreadsheetState | null> {
    const persisted = await this.adapter.loadVersion(this.config.spreadsheetId, versionId);
    
    if (!persisted) {
      return null;
    }

    return {
      data: new Map(persisted.data),
      maxRows: 1000,
      maxCols: 100,
      selection: { ranges: [], active: null },
      editing: null,
      formulaInput: '',
      rowHeights: persisted.rowHeights,
      colWidths: persisted.colWidths,
      validation: persisted.validation ? new Map(persisted.validation) : undefined,
    };
  }

  async listVersions() {
    return this.adapter.listVersions(this.config.spreadsheetId);
  }

  async delete() {
    this.stopAutoSave();
    return this.adapter.delete(this.config.spreadsheetId);
  }

  getSyncStatus(): SyncStatus {
    return this.adapter.getSyncStatus();
  }

  // Auto-save functionality

  private startAutoSave() {
    if (!this.config.autoSave) return;

    this.autoSaveTimer = setInterval(() => {
      // Auto-save will be triggered by the context
      // This just ensures the timer is running
    }, this.config.autoSaveInterval);
  }

  stopAutoSave() {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = undefined;
    }
  }

  private loadOfflineQueue() {
    // Load any pending offline operations
    const queueData = localStorage.getItem('opensheets_offline_queue');
    if (queueData) {
      try {
        const queue = JSON.parse(queueData);
        // Process queue will be handled by the adapter
        console.log(`Loaded ${queue.length} offline operations`);
      } catch (error) {
        console.error('Failed to load offline queue:', error);
      }
    }
  }

  // Cleanup
  destroy() {
    this.stopAutoSave();
    
    if (this.apiAdapter && 'disconnect' in this.apiAdapter) {
      (this.apiAdapter as any).disconnect();
    }
  }
}