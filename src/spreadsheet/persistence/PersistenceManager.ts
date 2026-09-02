import { PersistenceAdapter, PersistedState, SaveResult, SyncStatus, Version } from './types';
import { SpreadsheetState } from '../types/spreadsheet';
import { LocalStorageAdapter } from './LocalStorageAdapter';

export type PersistenceMode = 'local';

interface PersistenceManagerConfig {
  spreadsheetId: string;
  /** Defaults to LocalStorageAdapter; any PersistenceAdapter works. */
  adapter?: PersistenceAdapter;
  /** Grid size restored alongside a loaded document. */
  maxRows?: number;
  maxCols?: number;
  onSyncStatusChange?: (status: SyncStatus) => void;
  onSaveComplete?: (result: SaveResult) => void;
}

const PERSISTED_VERSION = '2.0.0';

/**
 * Serializes spreadsheet state through a PersistenceAdapter and back. One
 * instance per spreadsheet id; the provider decides when to save.
 */
export class PersistenceManager {
  private readonly adapter: PersistenceAdapter;
  private readonly config: PersistenceManagerConfig;
  private inFlight: Promise<SaveResult> | null = null;

  constructor(config: PersistenceManagerConfig) {
    this.config = config;
    this.adapter = config.adapter ?? new LocalStorageAdapter(true);
    this.adapter.onSyncStatusChange = config.onSyncStatusChange;
  }

  private toPersisted(state: SpreadsheetState): PersistedState {
    const now = Date.now();
    return {
      version: PERSISTED_VERSION,
      data: Array.from(state.data.entries()),
      rowHeights: state.rowHeights || [],
      colWidths: state.colWidths || [],
      validation: state.validation ? Array.from(state.validation.entries()) : undefined,
      comments: state.comments ? Array.from(state.comments.entries()) : undefined,
      frozenRows: state.frozenRows,
      frozenCols: state.frozenCols,
      merges: state.merges,
      filters: state.filters,
      protectedRanges: state.protectedRanges,
      docMeta: state.docMeta,
      metadata: {
        id: this.config.spreadsheetId,
        title: this.config.spreadsheetId,
        createdAt: now,
        updatedAt: now,
        revision: 0,
      },
    };
  }

  private fromPersisted(persisted: PersistedState): SpreadsheetState {
    return {
      data: new Map(persisted.data),
      maxRows: this.config.maxRows ?? 1000,
      maxCols: this.config.maxCols ?? 100,
      selection: { ranges: [], active: null },
      editing: null,
      formulaInput: '',
      rowHeights: persisted.rowHeights,
      colWidths: persisted.colWidths,
      validation: persisted.validation ? new Map(persisted.validation) : undefined,
      comments: persisted.comments ? new Map(persisted.comments) : undefined,
      frozenRows: persisted.frozenRows,
      frozenCols: persisted.frozenCols,
      merges: persisted.merges,
      filters: persisted.filters,
      protectedRanges: persisted.protectedRanges,
      docMeta: persisted.docMeta,
    };
  }

  /** Saves are serialized: a save requested while one is in flight runs after it. */
  save(state: SpreadsheetState): Promise<SaveResult> {
    const run = async () => {
      const result = await this.adapter.save(this.config.spreadsheetId, this.toPersisted(state));
      this.config.onSaveComplete?.(result);
      return result;
    };
    const next = (this.inFlight ?? Promise.resolve()).then(run, run);
    this.inFlight = next.finally(() => {
      if (this.inFlight === next) this.inFlight = null;
    });
    return next;
  }

  async load(): Promise<SpreadsheetState | null> {
    const persisted = await this.adapter.load(this.config.spreadsheetId);
    return persisted ? this.fromPersisted(persisted) : null;
  }

  saveVersion(state: SpreadsheetState, label?: string): Promise<Version> {
    return this.adapter.saveVersion(this.config.spreadsheetId, this.toPersisted(state), label);
  }

  async loadVersion(versionId: string): Promise<SpreadsheetState | null> {
    const persisted = await this.adapter.loadVersion(this.config.spreadsheetId, versionId);
    return persisted ? this.fromPersisted(persisted) : null;
  }

  listVersions(): Promise<Version[]> {
    return this.adapter.listVersions(this.config.spreadsheetId);
  }

  delete(): Promise<void> {
    return this.adapter.delete(this.config.spreadsheetId);
  }

  getSyncStatus(): SyncStatus {
    return this.adapter.getSyncStatus();
  }
}
