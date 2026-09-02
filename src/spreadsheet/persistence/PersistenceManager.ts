import { PersistenceAdapter, PersistedState, SaveResult, SyncStatus, Version } from './types';
import { SpreadsheetState } from '../types/spreadsheet';
import { LocalStorageAdapter } from './LocalStorageAdapter';

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

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const numberArray = (v: unknown, max: number): number[] | undefined =>
  Array.isArray(v) && v.length <= max && v.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0) ? v : undefined;
const rectInside = (r: unknown, maxRows: number, maxCols: number) =>
  isRecord(r) && [r.startRow, r.endRow].every((n) => Number.isInteger(n) && (n as number) >= 0 && (n as number) < maxRows)
  && [r.startCol, r.endCol].every((n) => Number.isInteger(n) && (n as number) >= 0 && (n as number) < maxCols);
const entriesInside = <T>(v: unknown, maxRows: number, maxCols: number, cell: (x: unknown) => boolean): Array<[string, T]> =>
  (Array.isArray(v) ? v : []).filter((e): e is [string, T] => {
    if (!Array.isArray(e) || e.length !== 2 || typeof e[0] !== 'string') return false;
    const [row, col] = e[0].split(':').map(Number);
    return Number.isInteger(row) && Number.isInteger(col) && row >= 0 && col >= 0 && row < maxRows && col < maxCols && cell(e[1]);
  });

/**
 * Storage is not trusted: anything with access to the origin could have
 * written it. Only well-formed entries inside the grid survive loading.
 */
function sanitizePersisted(raw: PersistedState, maxRows: number, maxCols: number): PersistedState {
  const rects = (v: unknown) => (Array.isArray(v) ? v.filter((r) => rectInside(r, maxRows, maxCols)) : undefined);
  const smallInt = (v: unknown) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 1000 ? (v as number) : undefined);
  return {
    ...raw,
    data: entriesInside(raw.data, maxRows, maxCols, isRecord),
    rowHeights: numberArray(raw.rowHeights, maxRows) ?? [],
    colWidths: numberArray(raw.colWidths, maxCols) ?? [],
    validation: raw.validation ? entriesInside(raw.validation, maxRows, maxCols, isRecord) : undefined,
    comments: raw.comments ? entriesInside(raw.comments, maxRows, maxCols, isRecord) : undefined,
    frozenRows: smallInt(raw.frozenRows),
    frozenCols: smallInt(raw.frozenCols),
    merges: rects(raw.merges),
    filters: Array.isArray(raw.filters) ? raw.filters.filter(isRecord) : undefined,
    protectedRanges: Array.isArray(raw.protectedRanges)
      ? raw.protectedRanges.filter((p) => isRecord(p) && typeof p.id === 'string' && typeof p.owner === 'string' && rectInside(p.range, maxRows, maxCols))
      : undefined,
    docMeta: isRecord(raw.docMeta) ? raw.docMeta : undefined,
  };
}

/**
 * Serializes spreadsheet state through a PersistenceAdapter and back. One
 * instance per spreadsheet id; the provider decides when to save.
 */
export class PersistenceManager {
  private readonly adapter: PersistenceAdapter;
  private readonly config: PersistenceManagerConfig;
  private inFlight: Promise<unknown> | null = null;

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

  private fromPersisted(raw: PersistedState): SpreadsheetState {
    const persisted = sanitizePersisted(raw, this.config.maxRows ?? 1000, this.config.maxCols ?? 100);
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
    // The queue only needs to know when this save settled. Swallowing the
    // outcome here keeps a rejected save from also surfacing as an unhandled
    // rejection; the caller still receives it through the returned promise.
    this.inFlight = next.then(() => undefined, () => undefined);
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
