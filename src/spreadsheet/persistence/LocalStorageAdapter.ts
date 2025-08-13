import {
  PersistenceAdapter,
  PersistedState,
  SpreadsheetMetadata,
  SaveResult,
  Version,
  SyncStatus,
} from './types';
import { compress, decompress } from '../utils/compressionUtils';

export class LocalStorageAdapter implements PersistenceAdapter {
  private readonly prefix = 'opensheets_';
  private readonly maxStorageSize = 5 * 1024 * 1024; // 5MB limit
  private syncStatus: SyncStatus = {
    connected: true,
    syncing: false,
    pendingChanges: 0,
    mode: 'local',
  };

  constructor(private enableCompression: boolean = true) {}

  async save(id: string, state: PersistedState): Promise<SaveResult> {
    try {
      const key = this.getKey(id);
      const serialized = JSON.stringify(state);
      
      // Check size before saving
      if (serialized.length > this.maxStorageSize) {
        // Try compression
        if (this.enableCompression) {
          const compressed = await compress(serialized);
          if (compressed.length > this.maxStorageSize) {
            throw new Error('Data too large for LocalStorage even after compression');
          }
          localStorage.setItem(key, compressed);
          localStorage.setItem(`${key}_compressed`, 'true');
        } else {
          throw new Error('Data too large for LocalStorage');
        }
      } else {
        localStorage.setItem(key, serialized);
        localStorage.removeItem(`${key}_compressed`);
      }

      // Update metadata
      const metadata = state.metadata;
      metadata.updatedAt = Date.now();
      metadata.revision = (metadata.revision || 0) + 1;
      
      this.saveMetadata(id, metadata);
      
      // Clean old versions if needed
      await this.cleanOldVersions(id);

      this.updateSyncStatus({ syncing: false, lastSync: Date.now() });

      return {
        success: true,
        timestamp: metadata.updatedAt,
        revision: metadata.revision,
      };
    } catch (error) {
      console.error('LocalStorage save failed:', error);
      
      // Handle quota exceeded error
      if (error instanceof DOMException && error.code === 22) {
        // Try to free up space
        await this.freeUpSpace();
        
        // Retry once
        try {
          const key = this.getKey(id);
          const serialized = JSON.stringify(state);
          localStorage.setItem(key, serialized);
          
          return {
            success: true,
            timestamp: Date.now(),
            revision: state.metadata.revision,
          };
        } catch (retryError) {
          return {
            success: false,
            timestamp: Date.now(),
            error: 'Storage quota exceeded',
          };
        }
      }

      return {
        success: false,
        timestamp: Date.now(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async load(id: string): Promise<PersistedState | null> {
    try {
      const key = this.getKey(id);
      const stored = localStorage.getItem(key);
      
      if (!stored) {
        return null;
      }

      // Check if data is compressed
      const isCompressed = localStorage.getItem(`${key}_compressed`) === 'true';
      
      let data: string;
      if (isCompressed && this.enableCompression) {
        data = await decompress(stored);
      } else {
        data = stored;
      }

      return JSON.parse(data);
    } catch (error) {
      console.error('LocalStorage load failed:', error);
      return null;
    }
  }

  async delete(id: string): Promise<void> {
    const key = this.getKey(id);
    
    // Delete main data
    localStorage.removeItem(key);
    localStorage.removeItem(`${key}_compressed`);
    
    // Delete metadata
    localStorage.removeItem(`${key}_metadata`);
    
    // Delete all versions
    const versions = await this.listVersions(id);
    for (const version of versions) {
      localStorage.removeItem(`${key}_version_${version.id}`);
    }
    
    // Delete version list
    localStorage.removeItem(`${key}_versions`);
  }

  async saveVersion(
    id: string,
    state: PersistedState,
    label?: string
  ): Promise<Version> {
    const versionId = `v_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const key = `${this.getKey(id)}_version_${versionId}`;
    
    const version: Version = {
      id: versionId,
      timestamp: Date.now(),
      label,
      author: state.metadata.lastModifiedBy,
      size: JSON.stringify(state).length,
      revision: state.metadata.revision,
    };

    // Save version data
    localStorage.setItem(key, JSON.stringify(state));
    
    // Update version list
    const versionList = await this.listVersions(id);
    versionList.push(version);
    localStorage.setItem(
      `${this.getKey(id)}_versions`,
      JSON.stringify(versionList)
    );

    return version;
  }

  async loadVersion(id: string, versionId: string): Promise<PersistedState | null> {
    try {
      const key = `${this.getKey(id)}_version_${versionId}`;
      const stored = localStorage.getItem(key);
      
      if (!stored) {
        return null;
      }

      return JSON.parse(stored);
    } catch (error) {
      console.error('Failed to load version:', error);
      return null;
    }
  }

  async listVersions(id: string): Promise<Version[]> {
    try {
      const stored = localStorage.getItem(`${this.getKey(id)}_versions`);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  async exists(id: string): Promise<boolean> {
    return localStorage.getItem(this.getKey(id)) !== null;
  }

  async getMetadata(id: string): Promise<SpreadsheetMetadata | null> {
    try {
      const stored = localStorage.getItem(`${this.getKey(id)}_metadata`);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  }

  async updateMetadata(
    id: string,
    metadata: Partial<SpreadsheetMetadata>
  ): Promise<void> {
    const current = await this.getMetadata(id);
    const updated = { ...current, ...metadata, updatedAt: Date.now() };
    this.saveMetadata(id, updated as SpreadsheetMetadata);
  }

  getSyncStatus(): SyncStatus {
    return this.syncStatus;
  }

  // Private helper methods

  private getKey(id: string): string {
    return `${this.prefix}${id}`;
  }

  private saveMetadata(id: string, metadata: SpreadsheetMetadata): void {
    localStorage.setItem(
      `${this.getKey(id)}_metadata`,
      JSON.stringify(metadata)
    );
  }

  private updateSyncStatus(updates: Partial<SyncStatus>): void {
    this.syncStatus = { ...this.syncStatus, ...updates };
    this.onSyncStatusChange?.(this.syncStatus);
  }

  private async cleanOldVersions(id: string, maxVersions: number = 10): Promise<void> {
    const versions = await this.listVersions(id);
    
    if (versions.length > maxVersions) {
      // Sort by timestamp, oldest first
      versions.sort((a, b) => a.timestamp - b.timestamp);
      
      // Remove oldest versions
      const toRemove = versions.slice(0, versions.length - maxVersions);
      
      for (const version of toRemove) {
        localStorage.removeItem(`${this.getKey(id)}_version_${version.id}`);
      }
      
      // Update version list
      const remaining = versions.slice(versions.length - maxVersions);
      localStorage.setItem(
        `${this.getKey(id)}_versions`,
        JSON.stringify(remaining)
      );
    }
  }

  private async freeUpSpace(): Promise<void> {
    // Get all OpenSheets keys
    const keys = Object.keys(localStorage).filter(k => k.startsWith(this.prefix));
    
    // Find and remove old versions
    for (const key of keys) {
      if (key.includes('_version_')) {
        localStorage.removeItem(key);
      }
    }
    
    // Clear old auto-saves
    const autoSaveKeys = keys.filter(k => k.includes('_autosave'));
    for (const key of autoSaveKeys) {
      const data = localStorage.getItem(key);
      if (data) {
        try {
          const parsed = JSON.parse(data);
          // Remove auto-saves older than 7 days
          if (Date.now() - parsed.metadata.updatedAt > 7 * 24 * 60 * 60 * 1000) {
            localStorage.removeItem(key);
          }
        } catch {
          // Invalid data, remove it
          localStorage.removeItem(key);
        }
      }
    }
  }

  onSyncStatusChange?: (status: SyncStatus) => void;
}