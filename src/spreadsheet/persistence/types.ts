import { CellData } from '../types/spreadsheet';

export interface PersistenceAdapter {
  // Core persistence methods
  save(id: string, state: PersistedState): Promise<SaveResult>;
  load(id: string): Promise<PersistedState | null>;
  delete(id: string): Promise<void>;
  
  // Version history
  saveVersion(id: string, state: PersistedState, label?: string): Promise<Version>;
  loadVersion(id: string, versionId: string): Promise<PersistedState | null>;
  listVersions(id: string): Promise<Version[]>;
  
  // Metadata
  exists(id: string): Promise<boolean>;
  getMetadata(id: string): Promise<SpreadsheetMetadata | null>;
  updateMetadata(id: string, metadata: Partial<SpreadsheetMetadata>): Promise<void>;
  
  // Sync status
  getSyncStatus(): SyncStatus;
  onSyncStatusChange?: (status: SyncStatus) => void;
}

export interface PersistedState {
  version: string;
  data: Array<[string, CellData]>;
  rowHeights: number[];
  colWidths: number[];
  validation?: Array<[string, any]>;
  metadata: SpreadsheetMetadata;
}

export interface SpreadsheetMetadata {
  id: string;
  title: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  lastModifiedBy?: string;
  owner?: string;
  sharedWith?: string[];
  tags?: string[];
  isPublic?: boolean;
  revision: number;
}

export interface SaveResult {
  success: boolean;
  timestamp: number;
  revision?: number;
  error?: string;
  conflictResolution?: ConflictResolution;
}

export interface Version {
  id: string;
  timestamp: number;
  label?: string;
  author?: string;
  size: number;
  revision: number;
}

export interface SyncStatus {
  connected: boolean;
  syncing: boolean;
  lastSync?: number;
  pendingChanges: number;
  error?: string;
  mode: 'local' | 'cloud' | 'hybrid';
}

export interface ConflictResolution {
  type: 'auto-merged' | 'server-wins' | 'client-wins' | 'manual';
  conflicts: CellConflict[];
  resolved: boolean;
}

export interface CellConflict {
  cell: string;
  localValue: CellData;
  serverValue: CellData;
  resolution?: CellData;
}

export interface PersistenceConfig {
  adapter: PersistenceAdapter;
  autoSave: boolean;
  autoSaveInterval: number;
  maxVersions: number;
  conflictStrategy: 'last-write-wins' | 'manual' | 'merge';
  offlineQueue: boolean;
  compression: boolean;
}