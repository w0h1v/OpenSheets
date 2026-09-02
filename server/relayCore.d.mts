/*
 * Type surface of relayCore.mjs for the TypeScript callers (the Vite dev
 * plugin and consumers of `opensheets/server`). Keep in step with the
 * runtime module.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { WebSocket, WebSocketServer } from 'ws';

/** Anything that emits 'upgrade' (http, https or http2 servers). */
export interface UpgradeableServer {
  on(event: string, listener: (...args: any[]) => void): unknown;
}

export interface RelayUser {
  id: string;
  name: string;
  color: string;
  authenticated: boolean;
}

export interface PresenceEntry {
  clientId: string;
  user: RelayUser;
}

export interface CellUpdate {
  row: number;
  col: number;
  data?: { value?: unknown; [key: string]: unknown } | null;
}

export interface EditStamp {
  ts: number;
  by: string;
}

export type DocumentField = 'merges' | 'protectedRanges' | 'filters' | 'frozenRows' | 'frozenCols' | 'rowHeights' | 'colWidths';

/** One shared document field with the stamp that last set it. */
export interface DocumentEntry {
  value: unknown;
  stamp: EditStamp;
}

export type DocumentFields = Partial<Record<DocumentField, DocumentEntry>>;

export interface RelayLimits {
  maxFrameBytes: number;
  maxBodyBytes: number;
  maxUpdatesPerMessage: number;
  maxCellBytes: number;
  maxCellsPerSheet: number;
  maxSheets: number;
  snapshotTtlSeconds: number;
  maxRows: number;
  maxCols: number;
  messagesPerSecond: number;
  messageBurst: number;
  connectionsPerIp: number;
  maxPresence: number;
  authRequestsPerMinute: number;
  loginFailuresBeforeLock: number;
  loginLockMs: number;
  registrationsPerHour: number;
  futureSkewMs: number;
}

export declare const DEFAULT_LIMITS: Readonly<RelayLimits>;

export interface RelayBus {
  kind: 'memory' | 'redis';
  init(): Promise<void>;
  close(): Promise<void>;
  publish(channel: string, message: unknown): Promise<void>;
  subscribe(channel: string, handler: (message: any) => void): Promise<void>;
  getSnapshot(sheetId: string): Promise<Map<string, unknown> | null>;
  /** Stores what fits within the caps and resolves with the updates that were stored. */
  applyCellUpdates(sheetId: string, updates: CellUpdate[]): Promise<CellUpdate[]>;
  getDocument(sheetId: string): Promise<DocumentFields>;
  /** Last-writer-wins per field; resolves with the fields that were stored. */
  applyDocument(sheetId: string, fields: DocumentFields): Promise<DocumentFields>;
  presenceGet(clientId: string): Promise<{ clientId: string; session: string; secretHash: string; user: RelayUser } | null>;
  /** Resolves null when the presence cap is reached. */
  presenceJoin(clientId: string, session: string, user: RelayUser, secretHash: string): Promise<{ first: boolean; left: RelayUser | null } | null>;
  presenceLeave(clientId: string, session: string): Promise<{ last: boolean; user: RelayUser | null }>;
  presenceList(): Promise<PresenceEntry[]>;
}

export declare class MemoryBus implements RelayBus {
  constructor(limits?: RelayLimits);
  kind: 'memory';
  init(): Promise<void>;
  close(): Promise<void>;
  publish(channel: string, message: unknown): Promise<void>;
  subscribe(channel: string, handler: (message: any) => void): Promise<void>;
  getSnapshot(sheetId: string): Promise<Map<string, unknown> | null>;
  applyCellUpdates(sheetId: string, updates: CellUpdate[]): Promise<CellUpdate[]>;
  getDocument(sheetId: string): Promise<DocumentFields>;
  applyDocument(sheetId: string, fields: DocumentFields): Promise<DocumentFields>;
  presenceGet(clientId: string): Promise<{ clientId: string; session: string; secretHash: string; user: RelayUser } | null>;
  presenceJoin(clientId: string, session: string, user: RelayUser, secretHash: string): Promise<{ first: boolean; left: RelayUser | null } | null>;
  presenceLeave(clientId: string, session: string): Promise<{ last: boolean; user: RelayUser | null }>;
  presenceList(): Promise<PresenceEntry[]>;
}

export interface RedisBusOptions {
  prefix?: string;
  heartbeatMs?: number;
  staleMs?: number;
  limits?: RelayLimits;
}

export declare class RedisBus implements RelayBus {
  constructor(url?: string, options?: RedisBusOptions);
  kind: 'redis';
  init(): Promise<void>;
  close(): Promise<void>;
  accountBackend(): AccountBackend;
  publish(channel: string, message: unknown): Promise<void>;
  subscribe(channel: string, handler: (message: any) => void): Promise<void>;
  getSnapshot(sheetId: string): Promise<Map<string, unknown> | null>;
  applyCellUpdates(sheetId: string, updates: CellUpdate[]): Promise<CellUpdate[]>;
  getDocument(sheetId: string): Promise<DocumentFields>;
  applyDocument(sheetId: string, fields: DocumentFields): Promise<DocumentFields>;
  presenceGet(clientId: string): Promise<{ clientId: string; session: string; secretHash: string; user: RelayUser } | null>;
  presenceJoin(clientId: string, session: string, user: RelayUser, secretHash: string): Promise<{ first: boolean; left: RelayUser | null } | null>;
  presenceLeave(clientId: string, session: string): Promise<{ last: boolean; user: RelayUser | null }>;
  presenceList(): Promise<PresenceEntry[]>;
}

export declare function createBus(env?: NodeJS.ProcessEnv, limits?: RelayLimits): RelayBus;

export declare const DEFAULT_DATA_DIR: string;
export declare const ACCOUNT_COLORS: string[];
export declare function colorFor(id: string): string;

export interface StoredAccount {
  id: string;
  name: string;
  color: string;
  salt: string;
  hash: string;
  sessions: string[];
}

export interface AccountBackend {
  init(): Promise<void>;
  all(): Promise<StoredAccount[]>;
  count(): Promise<number>;
  put(account: StoredAccount): Promise<void>;
}

export declare class FileAccountBackend implements AccountBackend {
  constructor(dataDir?: string);
  init(): Promise<void>;
  all(): Promise<StoredAccount[]>;
  count(): Promise<number>;
  put(account: StoredAccount): Promise<void>;
}

export declare class RedisAccountBackend implements AccountBackend {
  constructor(client: unknown, key: string);
  init(): Promise<void>;
  all(): Promise<StoredAccount[]>;
  count(): Promise<number>;
  put(account: StoredAccount): Promise<void>;
}

export interface Session {
  token: string;
  user: RelayUser;
}

export declare class AccountStore {
  constructor(backend?: string | AccountBackend, options?: { maxAccounts?: number });
  init(): Promise<void>;
  register(name: string, password: string): Promise<Session>;
  login(name: string, password: string): Promise<Session>;
  logout(token: string): Promise<void>;
  byToken(token: unknown): Promise<RelayUser | null>;
}

export declare function createAccountStore(bus: RelayBus, dataDir?: string): AccountStore;

export interface AuthorizeContext {
  user: RelayUser;
  action: 'read' | 'write';
  sheetId: string;
}

export interface RelayOptions {
  bus: RelayBus;
  accounts: AccountStore;
  log?: Pick<Console, 'error'>;
  /** 'same-host' (default), an explicit list of origins, or true to accept any. */
  allowedOrigins?: 'same-host' | string[] | true;
  /** Trust cf-connecting-ip / x-forwarded-for for rate limiting. */
  trustProxy?: boolean;
  limits?: Partial<RelayLimits>;
  /** Decide whether a user may read or write a sheet; default allows everything. */
  authorize?: (ctx: AuthorizeContext) => boolean | Promise<boolean>;
}

export interface Relay {
  handleHttp(req: IncomingMessage, res: ServerResponse): Promise<boolean>;
  handleConnection(ws: WebSocket, req: IncomingMessage): void;
  attach(server: UpgradeableServer, options?: { rejectOthers?: boolean }): WebSocketServer;
  close(): Promise<void>;
  instance: string;
  limits: RelayLimits;
}

export declare function createRelay(options: RelayOptions): Relay;
