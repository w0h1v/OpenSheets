import {
  PersistenceAdapter,
  PersistedState,
  SpreadsheetMetadata,
  SaveResult,
  Version,
  SyncStatus,
} from './types';
import { compress, decompress } from '../utils/compressionUtils';

// Documents larger than this are compressed before they go into storage
const COMPRESS_ABOVE = 64 * 1024;

const isQuotaError = (error: unknown) =>
  error instanceof DOMException && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED');

/**
 * Documents in this browser's localStorage, under `opensheets_<id>`, with
 * named versions kept alongside (the oldest are dropped past maxVersions).
 */
export class LocalStorageAdapter implements PersistenceAdapter {
  private readonly prefix = 'opensheets_';
  private status: SyncStatus = { connected: true, syncing: false, pendingChanges: 0, mode: 'local' };
  onSyncStatusChange?: (status: SyncStatus) => void;

  constructor(private readonly enableCompression = true, private readonly maxVersions = 10) {}

  async save(id: string, state: PersistedState): Promise<SaveResult> {
    const previous = await this.getMetadata(id);
    const metadata: SpreadsheetMetadata = {
      ...state.metadata,
      createdAt: previous?.createdAt ?? state.metadata.createdAt,
      updatedAt: Date.now(),
      revision: (previous?.revision ?? 0) + 1,
    };
    const payload = JSON.stringify({ ...state, metadata });
    try {
      try {
        await this.write(this.key(id), payload);
      } catch (error) {
        if (!isQuotaError(error)) throw error;
        // Make room by dropping this document's versions, then try once more
        await this.dropVersions(id);
        await this.write(this.key(id), payload);
      }
      this.writeMetadata(id, metadata);
      await this.trimVersions(id);
      this.setStatus({ syncing: false, lastSync: metadata.updatedAt });
      return { success: true, timestamp: metadata.updatedAt, revision: metadata.revision };
    } catch (error) {
      const message = isQuotaError(error) ? 'Storage quota exceeded' : error instanceof Error ? error.message : 'Save failed';
      this.setStatus({ syncing: false, error: message });
      return { success: false, timestamp: Date.now(), error: message };
    }
  }

  async load(id: string): Promise<PersistedState | null> {
    const stored = localStorage.getItem(this.key(id));
    if (!stored) return null;
    const compressed = localStorage.getItem(`${this.key(id)}_compressed`) === 'true';
    try {
      return JSON.parse(compressed ? await decompress(stored) : stored);
    } catch {
      return null;
    }
  }

  async delete(id: string): Promise<void> {
    const key = this.key(id);
    for (const version of await this.listVersions(id)) localStorage.removeItem(`${key}_version_${version.id}`);
    for (const suffix of ['', '_compressed', '_metadata', '_versions']) localStorage.removeItem(`${key}${suffix}`);
  }

  async saveVersion(id: string, state: PersistedState, label?: string): Promise<Version> {
    const serialized = JSON.stringify(state);
    const version: Version = {
      id: `v_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
      timestamp: Date.now(),
      label,
      author: state.metadata.lastModifiedBy,
      size: serialized.length,
      revision: state.metadata.revision,
    };
    localStorage.setItem(`${this.key(id)}_version_${version.id}`, serialized);
    const versions = await this.listVersions(id);
    versions.push(version);
    localStorage.setItem(`${this.key(id)}_versions`, JSON.stringify(versions));
    return version;
  }

  async loadVersion(id: string, versionId: string): Promise<PersistedState | null> {
    const stored = localStorage.getItem(`${this.key(id)}_version_${versionId}`);
    if (!stored) return null;
    try {
      return JSON.parse(stored);
    } catch {
      return null;
    }
  }

  async listVersions(id: string): Promise<Version[]> {
    try {
      const stored = localStorage.getItem(`${this.key(id)}_versions`);
      const parsed = stored ? JSON.parse(stored) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  async exists(id: string): Promise<boolean> {
    return localStorage.getItem(this.key(id)) !== null;
  }

  async getMetadata(id: string): Promise<SpreadsheetMetadata | null> {
    try {
      const stored = localStorage.getItem(`${this.key(id)}_metadata`);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  }

  async updateMetadata(id: string, metadata: Partial<SpreadsheetMetadata>): Promise<void> {
    const current = await this.getMetadata(id);
    this.writeMetadata(id, { ...current, ...metadata, updatedAt: Date.now() } as SpreadsheetMetadata);
  }

  getSyncStatus(): SyncStatus {
    return this.status;
  }

  private key(id: string): string {
    return `${this.prefix}${id}`;
  }

  private async write(key: string, payload: string): Promise<void> {
    if (this.enableCompression && payload.length > COMPRESS_ABOVE) {
      localStorage.setItem(key, await compress(payload));
      localStorage.setItem(`${key}_compressed`, 'true');
    } else {
      localStorage.setItem(key, payload);
      localStorage.removeItem(`${key}_compressed`);
    }
  }

  private writeMetadata(id: string, metadata: SpreadsheetMetadata): void {
    localStorage.setItem(`${this.key(id)}_metadata`, JSON.stringify(metadata));
  }

  private setStatus(updates: Partial<SyncStatus>): void {
    this.status = { ...this.status, ...updates };
    this.onSyncStatusChange?.(this.status);
  }

  private async trimVersions(id: string): Promise<void> {
    const versions = (await this.listVersions(id)).sort((a, b) => a.timestamp - b.timestamp);
    if (versions.length <= this.maxVersions) return;
    const excess = versions.splice(0, versions.length - this.maxVersions);
    for (const version of excess) localStorage.removeItem(`${this.key(id)}_version_${version.id}`);
    localStorage.setItem(`${this.key(id)}_versions`, JSON.stringify(versions));
  }

  private async dropVersions(id: string): Promise<void> {
    for (const version of await this.listVersions(id)) localStorage.removeItem(`${this.key(id)}_version_${version.id}`);
    localStorage.removeItem(`${this.key(id)}_versions`);
  }
}
