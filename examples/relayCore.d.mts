/*
 * Type surface of relayCore.mjs for the TypeScript callers (the Vite dev
 * plugin). Keep in step with the runtime module.
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

export interface RelayBus {
  kind: 'memory' | 'redis';
  init(): Promise<void>;
  close(): Promise<void>;
  publish(channel: string, message: unknown): Promise<void>;
  subscribe(channel: string, handler: (message: any) => void): Promise<void>;
  getSnapshot(sheetId: string): Promise<Map<string, unknown> | null>;
  applyCellUpdates(sheetId: string, updates: CellUpdate[]): Promise<void>;
  presenceJoin(clientId: string, session: string, user: RelayUser): Promise<{ first: boolean; left: RelayUser | null }>;
  presenceLeave(clientId: string, session: string): Promise<{ last: boolean; user: RelayUser | null }>;
  presenceList(): Promise<PresenceEntry[]>;
}

export declare class MemoryBus implements RelayBus {
  kind: 'memory';
  init(): Promise<void>;
  close(): Promise<void>;
  publish(channel: string, message: unknown): Promise<void>;
  subscribe(channel: string, handler: (message: any) => void): Promise<void>;
  getSnapshot(sheetId: string): Promise<Map<string, unknown> | null>;
  applyCellUpdates(sheetId: string, updates: CellUpdate[]): Promise<void>;
  presenceJoin(clientId: string, session: string, user: RelayUser): Promise<{ first: boolean; left: RelayUser | null }>;
  presenceLeave(clientId: string, session: string): Promise<{ last: boolean; user: RelayUser | null }>;
  presenceList(): Promise<PresenceEntry[]>;
}

export interface RedisBusOptions {
  prefix?: string;
  heartbeatMs?: number;
  staleMs?: number;
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
  applyCellUpdates(sheetId: string, updates: CellUpdate[]): Promise<void>;
  presenceJoin(clientId: string, session: string, user: RelayUser): Promise<{ first: boolean; left: RelayUser | null }>;
  presenceLeave(clientId: string, session: string): Promise<{ last: boolean; user: RelayUser | null }>;
  presenceList(): Promise<PresenceEntry[]>;
}

export declare function createBus(env?: NodeJS.ProcessEnv): RelayBus;

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
  put(account: StoredAccount): Promise<void>;
}

export declare class FileAccountBackend implements AccountBackend {
  constructor(dataDir?: string);
  init(): Promise<void>;
  all(): Promise<StoredAccount[]>;
  put(account: StoredAccount): Promise<void>;
}

export declare class RedisAccountBackend implements AccountBackend {
  constructor(client: unknown, key: string);
  init(): Promise<void>;
  all(): Promise<StoredAccount[]>;
  put(account: StoredAccount): Promise<void>;
}

export interface Session {
  token: string;
  user: RelayUser;
}

export declare class AccountStore {
  constructor(backend?: string | AccountBackend);
  init(): Promise<void>;
  register(name: string, password: string): Promise<Session>;
  login(name: string, password: string): Promise<Session>;
  logout(token: string): Promise<void>;
  byToken(token: unknown): Promise<RelayUser | null>;
}

export declare function createAccountStore(bus: RelayBus, dataDir?: string): AccountStore;

export interface Relay {
  handleHttp(req: IncomingMessage, res: ServerResponse): Promise<boolean>;
  handleConnection(ws: WebSocket): void;
  attach(server: UpgradeableServer, options?: { rejectOthers?: boolean }): WebSocketServer;
  close(): Promise<void>;
  instance: string;
}

export declare function createRelay(options: {
  bus: RelayBus;
  accounts: AccountStore;
  log?: Pick<Console, 'error'>;
}): Relay;
