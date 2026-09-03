import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';

/*
 * Collaboration relay core, published as `opensheets/server`: relay +
 * account auth + a pluggable bus. The demo's standalone server
 * (examples/server.mjs) and Vite dev plugin (examples/collabServer.ts)
 * both mount this, so the protocol has exactly one implementation.
 * Peers: `ws` (always) and `redis` (only with a RedisBus).
 *
 * The bus decouples relay state from the process so several instances can
 * serve one deployment:
 *   - MemoryBus (default): everything in-process; right for dev and for a
 *     single-instance deployment.
 *   - RedisBus (REDIS_URL): pub/sub fan-out plus shared per-cell sheet
 *     snapshots, shared presence and shared accounts, so any instance can
 *     serve any client and a client only ever talks to one instance.
 *
 * Identity model:
 *   - An *account* is a person: id, name, color. Accounts have scrypt-hashed
 *     passwords; sessions are random tokens whose sha256 is stored on the
 *     account (tokens survive restarts, storage never holds a usable token)
 *     and expire after sessionTtlSeconds. Accounts live in a JSON file
 *     (single instance) or a Redis hash.
 *   - A *client* is one browser tab. The server assigns its id and a resume
 *     secret in the roster reply; a tab may resume its own slot on reconnect
 *     by presenting both, and nothing else can take a slot over. The token
 *     decides who a client is; with no valid token the server builds a guest
 *     identity whose id is always prefixed `guest-`, so a guest can never
 *     impersonate an account.
 *   - Echo suppression and socket takeover are per client; join/leave
 *     presence is per account (a person's second tab joins silently and
 *     the "left" toast fires only when their last tab goes).
 *
 * Abuse controls (see DEFAULT_LIMITS): WebSocket upgrades are accepted only
 * from allowed origins, connections and auth requests are rate limited per
 * IP, every socket has a message budget, and messages, sheets, cells and
 * presence entries are capped. Row/column indexes and edit timestamps are
 * validated before anything is stored or relayed.
 *
 * Documents: besides cells, a sheet has document-level fields (merges,
 * protected ranges, filters, frozen panes, row heights, column widths).
 * Each field carries a last-writer stamp {ts, by}; the relay keeps the
 * winning value per field, relays only accepted fields, and returns them
 * with the snapshot. Protected ranges are enforced here: a cell update
 * inside a range owned by someone else is dropped, and a client may only
 * add, change or remove ranges it owns.
 *
 * Wire protocol (client -> server): hello{token?, user?, clientId?,
 * clientSecret?}, sync{sheetId}, cells{sheetId, updates},
 * document{sheetId, fields}, selection{...}, sheets{...}, bye.
 * Server -> client: roster{users, you, clientId, clientSecret},
 * snapshot{sheetId, data, doc}, join{user}, leave{user}, and every relayed
 * message with {user, clientId} attached by the server.
 */

/** Default location of accounts.json: a `data` folder under the process cwd (the demo servers pass their own). */
export const DEFAULT_DATA_DIR = join(process.cwd(), 'data');

export const DEFAULT_LIMITS = Object.freeze({
  /** Largest WebSocket frame accepted. */
  maxFrameBytes: 256 * 1024,
  /** Largest JSON body accepted on /auth/*. */
  maxBodyBytes: 16 * 1024,
  /** Cell updates in one `cells` message. */
  maxUpdatesPerMessage: 2000,
  /** Serialized size of one cell's data. */
  maxCellBytes: 16 * 1024,
  /** Cells stored per sheet snapshot. */
  maxCellsPerSheet: 200_000,
  /** Sheets held by the in-memory bus (Redis snapshots expire instead). */
  maxSheets: 2000,
  /** Snapshot lifetime in Redis, refreshed on every write. */
  snapshotTtlSeconds: 30 * 24 * 3600,
  /** Grid bounds (Excel's). */
  maxRows: 1_048_576,
  maxCols: 16_384,
  /** Sustained and burst message budget per socket. */
  messagesPerSecond: 40,
  messageBurst: 120,
  /** Open sockets per client IP. */
  connectionsPerIp: 25,
  /** Presence entries per bus. */
  maxPresence: 10_000,
  /** /auth/* requests per IP per minute. */
  authRequestsPerMinute: 30,
  /** Failed logins for one name from one IP before a lockout, and its length. */
  loginFailuresBeforeLock: 10,
  loginLockMs: 15 * 60_000,
  /** Registrations per IP per hour. */
  registrationsPerHour: 20,
  /** How long a session token stays valid after it was issued. */
  sessionTtlSeconds: 30 * 24 * 3600,
  /** Edit timestamps further in the future than this are pulled back to now. */
  futureSkewMs: 60_000,
});

const CHANNEL = 'collab';
const RESERVED_TYPES = new Set(['roster', 'snapshot', 'join', 'leave']);
const DOCUMENT_FIELDS = ['merges', 'protectedRanges', 'filters', 'frozenRows', 'frozenCols', 'rowHeights', 'colWidths'];
const SHEET_ID_RE = /^[\w.-]{1,64}$/;
const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

const scryptAsync = promisify(scrypt);
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const isClear = (data) => !data || data.value === '' || data.value === undefined;
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Deterministic display color per id; mirrors COLLAB_PALETTE on the client
export const ACCOUNT_COLORS = [
  '#e11d48', '#2563eb', '#16a34a', '#d97706', '#7c3aed',
  '#0891b2', '#be185d', '#4d7c0f', '#dc2626', '#0f766e',
];
export const colorFor = (id) =>
  ACCOUNT_COLORS[[...String(id)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % ACCOUNT_COLORS.length];

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

/** Token bucket: `rate` tokens per second up to `burst`. */
class Bucket {
  constructor(rate, burst) {
    this.rate = rate;
    this.burst = burst;
    this.tokens = burst;
    this.at = Date.now();
  }
  take(n = 1) {
    const now = Date.now();
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.at) / 1000) * this.rate);
    this.at = now;
    if (this.tokens < n) return false;
    this.tokens -= n;
    return true;
  }
}

/** Per-key buckets that forget idle keys. */
class BucketTable {
  constructor(rate, burst) {
    this.rate = rate;
    this.burst = burst;
    this.buckets = new Map();
  }
  take(key, n = 1) {
    let b = this.buckets.get(key);
    if (!b) this.buckets.set(key, (b = new Bucket(this.rate, this.burst)));
    return b.take(n);
  }
  sweep() {
    const cutoff = Date.now() - 10 * 60_000;
    for (const [key, b] of this.buckets) if (b.at < cutoff) this.buckets.delete(key);
  }
}

// ---------------------------------------------------------------------------
// Presence bookkeeping shared by both buses. Entries: { clientId, session,
// secretHash, user }. `session` is a per-socket nonce so a stale socket
// closing after a takeover can never remove the live entry; `secretHash`
// is what a reconnecting tab must prove it knows to resume the slot.
// ---------------------------------------------------------------------------

function joinOutcome(entries, clientId, user) {
  const prev = entries.find((e) => e.clientId === clientId) || null;
  const others = entries.filter((e) => e.clientId !== clientId);
  const first = !others.some((e) => e.user.id === user.id) && !(prev && prev.user.id === user.id);
  // Same tab re-identifying as someone else (sign in / out): that counts as
  // the previous identity leaving if this was its only client
  const left = prev && prev.user.id !== user.id && !others.some((e) => e.user.id === prev.user.id)
    ? prev.user
    : null;
  return { first, left };
}

function leaveOutcome(entries, clientId, session) {
  const prev = entries.find((e) => e.clientId === clientId);
  if (!prev || prev.session !== session) return { last: false, user: null };
  const last = !entries.some((e) => e.clientId !== clientId && e.user.id === prev.user.id);
  return { last, user: prev.user };
}

const publicEntry = ({ clientId, user }) => ({ clientId, user });

/** Total order over edit stamps: true when `a` beats `b`. */
const stampWins = (a, b) => !b || a.ts > b.ts || (a.ts === b.ts && a.by > b.by);

// Keeps the fields whose stamp beats what is stored; returns what was kept
function mergeDocument(stored, fields) {
  const accepted = {};
  for (const [field, entry] of Object.entries(fields)) {
    if (stampWins(entry.stamp, stored[field]?.stamp)) accepted[field] = entry;
  }
  return accepted;
}

// Merge a batch of cell updates so a later write to the same cell wins
function mergeUpdates(updates) {
  const merged = new Map(); // key -> cell | null (null = clear)
  for (const u of updates) merged.set(`${u.row}:${u.col}`, isClear(u.data) ? null : u.data);
  return merged;
}

export class MemoryBus {
  constructor(limits = DEFAULT_LIMITS) {
    this.kind = 'memory';
    this.limits = limits;
    this.handlers = new Map(); // channel -> Set<fn>
    this.snapshots = new Map(); // sheetId -> Map<key, cell>
    this.docs = new Map(); // sheetId -> { field: { value, stamp } }
    this.presence = new Map(); // clientId -> entry
  }
  async init() {}
  async close() {}
  async getDocument(sheetId) {
    return { ...(this.docs.get(sheetId) || {}) };
  }
  /** Last-writer-wins per field; resolves with the fields that were stored. */
  async applyDocument(sheetId, fields) {
    let doc = this.docs.get(sheetId);
    if (!doc) {
      if (this.docs.size >= this.limits.maxSheets) return {};
      this.docs.set(sheetId, (doc = {}));
    }
    const accepted = mergeDocument(doc, fields);
    Object.assign(doc, accepted);
    return accepted;
  }
  async publish(channel, message) {
    for (const fn of this.handlers.get(channel) || []) {
      try { fn(message); } catch { /* a listener error must not break delivery */ }
    }
  }
  async subscribe(channel, handler) {
    if (!this.handlers.has(channel)) this.handlers.set(channel, new Set());
    this.handlers.get(channel).add(handler);
  }
  async getSnapshot(sheetId) {
    const snap = this.snapshots.get(sheetId);
    return snap && snap.size ? new Map(snap) : null;
  }
  /** Stores what fits within the caps and returns the updates that were stored. */
  async applyCellUpdates(sheetId, updates) {
    let snap = this.snapshots.get(sheetId);
    if (!snap) {
      if (this.snapshots.size >= this.limits.maxSheets) return [];
      this.snapshots.set(sheetId, (snap = new Map()));
    }
    const accepted = [];
    for (const [key, cell] of mergeUpdates(updates)) {
      if (cell === null) {
        snap.delete(key);
      } else {
        if (!snap.has(key) && snap.size >= this.limits.maxCellsPerSheet) continue;
        snap.set(key, cell);
      }
      accepted.push(key);
    }
    const kept = new Set(accepted);
    return updates.filter((u) => kept.has(`${u.row}:${u.col}`));
  }
  async presenceGet(clientId) {
    return this.presence.get(clientId) || null;
  }
  async presenceJoin(clientId, session, user, secretHash) {
    if (!this.presence.has(clientId) && this.presence.size >= this.limits.maxPresence) return null;
    const outcome = joinOutcome(Array.from(this.presence.values()), clientId, user);
    this.presence.set(clientId, { clientId, session, secretHash, user });
    return outcome;
  }
  async presenceLeave(clientId, session) {
    const outcome = leaveOutcome(Array.from(this.presence.values()), clientId, session);
    if (outcome.user) this.presence.delete(clientId);
    return outcome;
  }
  async presenceList() {
    return Array.from(this.presence.values(), publicEntry);
  }
}

export class RedisBus {
  constructor(url = process.env.REDIS_URL || 'redis://localhost:6379', options = {}) {
    this.kind = 'redis';
    this.url = url;
    this.prefix = options.prefix || 'opensheets:';
    this.heartbeatMs = options.heartbeatMs || 10_000;
    this.staleMs = options.staleMs || 30_000;
    this.limits = options.limits || DEFAULT_LIMITS;
    this.handlers = new Map(); // channel -> Set<fn>
    this.local = new Map(); // clientId -> entry owned by this instance
  }

  key(...parts) {
    return this.prefix + parts.join(':');
  }

  async init() {
    let createClient;
    try {
      ({ createClient } = await import('redis'));
    } catch {
      throw new Error("REDIS_URL is set but the 'redis' package is not installed. Run: npm install redis");
    }
    this.client = createClient({ url: this.url });
    this.sub = this.client.duplicate();
    for (const c of [this.client, this.sub]) {
      c.on('error', (err) => console.error('[relay] redis error:', err.message));
    }
    await this.client.connect();
    await this.sub.connect();

    const busPrefix = this.key('bus', '');
    await this.sub.pSubscribe(`${busPrefix}*`, (raw, channel) => {
      let message;
      try { message = JSON.parse(raw); } catch { return; }
      const name = channel.slice(busPrefix.length);
      for (const fn of this.handlers.get(name) || []) {
        try { fn(message); } catch { /* listener error */ }
      }
    });

    // Keep this instance's presence entries fresh; a crashed instance's
    // entries age out and are swept by the next reader
    this.heartbeat = setInterval(() => {
      this.refreshPresence().catch(() => { /* logged by the client */ });
    }, this.heartbeatMs);
    this.heartbeat.unref();
  }

  async close() {
    clearInterval(this.heartbeat);
    if (this.local.size && this.client?.isOpen) {
      await this.client.hDel(this.key('presence'), Array.from(this.local.keys())).catch(() => {});
    }
    this.local.clear();
    await Promise.allSettled([this.sub?.close(), this.client?.close()]);
  }

  /** Account storage shared by every instance on this Redis. */
  accountBackend() {
    return new RedisAccountBackend(this.client, this.key('accounts'));
  }

  async publish(channel, message) {
    await this.client.publish(this.key('bus', channel), JSON.stringify(message));
  }

  async subscribe(channel, handler) {
    if (!this.handlers.has(channel)) this.handlers.set(channel, new Set());
    this.handlers.get(channel).add(handler);
  }

  async getSnapshot(sheetId) {
    const all = await this.client.hGetAll(this.key('snapshot', sheetId));
    const entries = Object.entries(all);
    if (!entries.length) return null;
    const snap = new Map();
    for (const [k, v] of entries) {
      try { snap.set(k, JSON.parse(v)); } catch { /* skip corrupt cell */ }
    }
    return snap;
  }

  // Per-cell HSET/HDEL in one transaction: concurrent instances editing
  // different cells of the same sheet never clobber each other
  async applyCellUpdates(sheetId, updates) {
    const hash = this.key('snapshot', sheetId);
    const merged = mergeUpdates(updates);
    const sets = {};
    const dels = [];
    const size = await this.client.hLen(hash);
    let added = 0;
    for (const [key, cell] of merged) {
      if (cell === null) {
        dels.push(key);
      } else {
        if (size + added >= this.limits.maxCellsPerSheet) {
          merged.delete(key);
          continue;
        }
        sets[key] = JSON.stringify(cell);
        added++;
      }
    }
    if (dels.length || Object.keys(sets).length) {
      const multi = this.client.multi();
      if (Object.keys(sets).length) multi.hSet(hash, sets);
      if (dels.length) multi.hDel(hash, dels);
      multi.expire(hash, this.limits.snapshotTtlSeconds);
      await multi.exec();
    }
    return updates.filter((u) => merged.has(`${u.row}:${u.col}`));
  }

  async getDocument(sheetId) {
    const doc = {};
    for (const [field, raw] of Object.entries(await this.client.hGetAll(this.key('doc', sheetId)))) {
      try { doc[field] = JSON.parse(raw); } catch { /* skip corrupt field */ }
    }
    return doc;
  }

  async applyDocument(sheetId, fields) {
    const hash = this.key('doc', sheetId);
    const accepted = mergeDocument(await this.getDocument(sheetId), fields);
    const entries = Object.entries(accepted);
    if (entries.length) {
      const multi = this.client.multi();
      multi.hSet(hash, Object.fromEntries(entries.map(([f, e]) => [f, JSON.stringify(e)])));
      multi.expire(hash, this.limits.snapshotTtlSeconds);
      await multi.exec();
    }
    return accepted;
  }

  async readPresence() {
    const all = await this.client.hGetAll(this.key('presence'));
    const now = Date.now();
    const live = [];
    const stale = [];
    for (const [clientId, raw] of Object.entries(all)) {
      let entry;
      try { entry = JSON.parse(raw); } catch { stale.push(clientId); continue; }
      if (now - (entry.ts || 0) > this.staleMs) stale.push(clientId);
      else live.push({ clientId, session: entry.session, secretHash: entry.secretHash, user: entry.user });
    }
    if (stale.length) await this.client.hDel(this.key('presence'), stale).catch(() => {});
    return live;
  }

  async writePresence(entry) {
    this.local.set(entry.clientId, entry);
    await this.client.hSet(this.key('presence'), entry.clientId, JSON.stringify({ ...entry, ts: Date.now() }));
  }

  async refreshPresence() {
    if (!this.local.size || !this.client?.isOpen) return;
    const now = Date.now();
    const fields = {};
    for (const entry of this.local.values()) fields[entry.clientId] = JSON.stringify({ ...entry, ts: now });
    await this.client.hSet(this.key('presence'), fields);
  }

  async presenceGet(clientId) {
    return (await this.readPresence()).find((e) => e.clientId === clientId) || null;
  }

  async presenceJoin(clientId, session, user, secretHash) {
    const entries = await this.readPresence();
    if (!entries.some((e) => e.clientId === clientId) && entries.length >= this.limits.maxPresence) return null;
    const outcome = joinOutcome(entries, clientId, user);
    await this.writePresence({ clientId, session, secretHash, user });
    return outcome;
  }

  async presenceLeave(clientId, session) {
    const outcome = leaveOutcome(await this.readPresence(), clientId, session);
    if (outcome.user) {
      this.local.delete(clientId);
      await this.client.hDel(this.key('presence'), clientId);
    }
    return outcome;
  }

  async presenceList() {
    return (await this.readPresence()).map(publicEntry);
  }
}

/** Picks the bus from the environment: REDIS_URL => RedisBus, else MemoryBus. */
export function createBus(env = process.env, limits = DEFAULT_LIMITS) {
  return env.REDIS_URL ? new RedisBus(env.REDIS_URL, { limits }) : new MemoryBus(limits);
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

const hashPassword = async (password, salt) =>
  (await scryptAsync(password, salt, 32, SCRYPT)).toString('hex');

const verifyPassword = async (password, salt, expected) => {
  const actual = Buffer.from(await hashPassword(password, salt), 'hex');
  const want = Buffer.from(expected, 'hex');
  return actual.length === want.length && timingSafeEqual(actual, want);
};

class AuthError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const NAME_RE = /^[\p{L}\p{N} _.-]{2,24}$/u;

/** Accounts in a JSON file: right for dev and a single instance. */
export class FileAccountBackend {
  constructor(dataDir = DEFAULT_DATA_DIR) {
    this.file = join(dataDir, 'accounts.json');
    this.accounts = new Map(); // id -> { id, name, color, salt, hash, sessions: [{ h, at }] }
    this.writing = Promise.resolve();
  }

  async init() {
    await mkdir(dirname(this.file), { recursive: true });
    try {
      const raw = JSON.parse(await readFile(this.file, 'utf8'));
      for (const a of raw) this.accounts.set(a.id, a);
    } catch { /* first run */ }
  }

  async all() {
    return Array.from(this.accounts.values());
  }

  async count() {
    return this.accounts.size;
  }

  // Serialized atomic writes: temp file + rename so a crash mid-write never
  // leaves a truncated accounts file
  put(account) {
    this.accounts.set(account.id, account);
    this.writing = this.writing.then(async () => {
      const tmp = `${this.file}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(Array.from(this.accounts.values()), null, 2));
      await rename(tmp, this.file);
    }).catch((err) => console.error('[relay] failed to persist accounts:', err.message));
    return this.writing;
  }
}

/** Accounts in a Redis hash, shared by every instance of a deployment. */
export class RedisAccountBackend {
  constructor(client, key) {
    this.client = client;
    this.key = key;
  }
  async init() {}
  async all() {
    const out = [];
    for (const raw of Object.values(await this.client.hGetAll(this.key))) {
      try { out.push(JSON.parse(raw)); } catch { /* skip corrupt account */ }
    }
    return out;
  }
  async count() {
    return this.client.hLen(this.key);
  }
  async put(account) {
    await this.client.hSet(this.key, account.id, JSON.stringify(account));
  }
}

export class AccountStore {
  /** @param backend a data directory (file backend) or an account backend */
  constructor(backend = DEFAULT_DATA_DIR, { maxAccounts = 100_000, sessionTtlMs = DEFAULT_LIMITS.sessionTtlSeconds * 1000 } = {}) {
    this.backend = typeof backend === 'string' ? new FileAccountBackend(backend) : backend;
    this.maxAccounts = maxAccounts;
    this.sessionTtlMs = sessionTtlMs;
  }

  /**
   * Live sessions of an account: { h: sha256(token), at: issued }. Accounts
   * written by older versions hold plain digests, which normalize to an
   * expired entry — upgrading invalidates old tokens rather than trusting
   * an unknown issue date.
   */
  liveSessions(account) {
    const now = Date.now();
    const out = [];
    for (const s of account.sessions || []) {
      const entry = typeof s === 'string' ? { h: s, at: 0 } : s;
      if (entry && typeof entry.h === 'string' && Number.isFinite(entry.at) && now - entry.at <= this.sessionTtlMs) {
        out.push(entry);
      }
    }
    return out;
  }

  async init() {
    await this.backend.init();
  }

  async findByName(name) {
    const wanted = String(name || '').trim().toLowerCase();
    return (await this.backend.all()).find((a) => a.name.toLowerCase() === wanted) || null;
  }

  async register(name, password) {
    name = String(name || '').trim();
    if (!NAME_RE.test(name)) throw new AuthError('Name must be 2-24 letters, digits, spaces, _ . or -');
    if (String(password || '').length < 8) throw new AuthError('Password must be at least 8 characters');
    if (String(password).length > 256) throw new AuthError('Password is too long');
    if ((await this.backend.count()) >= this.maxAccounts) throw new AuthError('Registration is closed', 503);
    if (await this.findByName(name)) throw new AuthError('That name is already taken', 409);
    const salt = randomBytes(16).toString('hex');
    const account = {
      id: `user-${randomBytes(6).toString('hex')}`,
      name,
      color: colorFor(name),
      salt,
      hash: await hashPassword(password, salt),
      sessions: [],
    };
    return this.issueSession(account);
  }

  async login(name, password) {
    const account = await this.findByName(name);
    // Verify against a dummy hash when the name is unknown so the timing
    // doesn't reveal which names exist
    const ok = account
      ? await verifyPassword(String(password || '').slice(0, 256), account.salt, account.hash)
      : (await hashPassword(String(password || '').slice(0, 256), 'no-such-account'), false);
    if (!ok) throw new AuthError('Invalid name or password', 401);
    return this.issueSession(account);
  }

  async issueSession(account) {
    const token = randomBytes(24).toString('hex');
    const sessions = this.liveSessions(account);
    sessions.push({ h: sha256(token), at: Date.now() });
    account.sessions = sessions.slice(-10);
    await this.backend.put(account);
    return { token, user: this.publicUser(account) };
  }

  async logout(token) {
    if (typeof token !== 'string' || !token) return;
    const digest = sha256(token);
    const account = (await this.backend.all()).find((a) =>
      (a.sessions || []).some((s) => (typeof s === 'string' ? s : s?.h) === digest));
    if (!account) return;
    account.sessions = this.liveSessions(account).filter((s) => s.h !== digest);
    await this.backend.put(account);
  }

  publicUser(account) {
    return { id: account.id, name: account.name, color: account.color, authenticated: true };
  }

  async byToken(token) {
    if (typeof token !== 'string' || !token || token.length > 128) return null;
    const digest = sha256(token);
    for (const account of await this.backend.all()) {
      if (this.liveSessions(account).some((s) => s.h === digest)) return this.publicUser(account);
    }
    return null;
  }
}

/** Accounts follow the bus: shared in Redis when the relay is, else a local file. */
export function createAccountStore(bus, dataDir = DEFAULT_DATA_DIR) {
  return new AccountStore(bus.kind === 'redis' ? bus.accountBackend() : dataDir);
}

// ---------------------------------------------------------------------------
// Relay
// ---------------------------------------------------------------------------

const readJson = (req, maxBytes) => new Promise((resolve, reject) => {
  let size = 0;
  const chunks = [];
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > maxBytes) {
      reject(new AuthError('Request body too large', 413));
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on('end', () => {
    try {
      const text = Buffer.concat(chunks).toString('utf8');
      const body = text ? JSON.parse(text) : {};
      resolve(isObject(body) ? body : {});
    } catch {
      reject(new AuthError('Invalid JSON body'));
    }
  });
  req.on('error', reject);
});

const guestFrom = (claim) => {
  const rawId = typeof claim?.id === 'string' ? claim.id.replace(/[^\w-]/g, '').slice(0, 40) : '';
  const id = rawId.startsWith('guest-') && rawId.length > 6 ? rawId : `guest-${rawId || randomBytes(4).toString('hex')}`;
  const name = typeof claim?.name === 'string' && claim.name.trim() ? claim.name.trim().slice(0, 24) : 'Guest';
  const color = typeof claim?.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(claim.color) ? claim.color : colorFor(id);
  return { id, name, color, authenticated: false };
};

const sanitizeClientId = (value) =>
  (typeof value === 'string' && /^c-[0-9a-f]{18}$/.test(value)) ? value : null;

/** Client address, honouring proxy headers only when told to. */
const clientIp = (req, trustProxy) => {
  if (trustProxy) {
    const cf = req.headers['cf-connecting-ip'];
    if (typeof cf === 'string' && cf) return cf;
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff) return xff.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
};

/**
 * Origin policy for WebSocket upgrades: 'same-host' (default) accepts an
 * Origin whose host matches the request's Host header, an array accepts
 * exactly those origins, `true` accepts anything. Requests without an
 * Origin header (non-browser clients) are accepted: cross-site WebSocket
 * hijacking needs a browser, and browsers always send it.
 */
const originAllowed = (req, policy) => {
  const origin = req.headers.origin;
  if (policy === true || !origin) return true;
  let host;
  try { host = new URL(origin).host; } catch { return false; }
  if (Array.isArray(policy)) return policy.includes(origin);
  return host === req.headers.host;
};

export function createRelay({
  bus,
  accounts,
  log = console,
  allowedOrigins = 'same-host',
  trustProxy = false,
  limits: overrides = {},
  authorize = null,
}) {
  const limits = { ...DEFAULT_LIMITS, ...overrides };
  const instance = randomBytes(4).toString('hex');
  const clients = new Map(); // ws -> { clientId, session, user, left, ip }
  const perIp = new Map(); // ip -> open socket count
  const authBuckets = new BucketTable(limits.authRequestsPerMinute / 60, limits.authRequestsPerMinute);
  const registerBuckets = new BucketTable(limits.registrationsPerHour / 3600, limits.registrationsPerHour);
  const loginFailures = new Map(); // `${ip}|${name}` -> { count, lockedUntil }
  let wss = null;

  const sweeper = setInterval(() => {
    authBuckets.sweep();
    registerBuckets.sweep();
    const now = Date.now();
    for (const [key, f] of loginFailures) if (f.lockedUntil < now && now - f.at > limits.loginLockMs) loginFailures.delete(key);
  }, 5 * 60_000);
  sweeper.unref();

  const send = (ws, msg) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };

  // Single delivery path: every relayed message goes through the bus and
  // comes back here on every instance (this one included); the author's
  // own socket is skipped by clientId so nothing is ever echoed
  bus.subscribe(CHANNEL, (msg) => {
    for (const [ws, c] of clients) {
      if (c.clientId !== msg.clientId) send(ws, msg);
    }
  });

  const publish = (msg, me) => bus.publish(CHANNEL, { ...msg, user: me.user, clientId: me.clientId });

  const roster = async (exceptUserId) => {
    const byUser = new Map();
    for (const { user } of await bus.presenceList()) {
      if (user.id !== exceptUserId && !byUser.has(user.id)) byUser.set(user.id, user);
    }
    return Array.from(byUser.values());
  };

  const allowed = async (user, action, sheetId) => {
    if (!authorize) return true;
    try { return Boolean(await authorize({ user, action, sheetId })); } catch { return false; }
  };

  const validSheetId = (id) => typeof id === 'string' && SHEET_ID_RE.test(id);

  // Keeps only well-formed updates inside the grid, with plausible stamps
  const sanitizeUpdates = (updates) => {
    const now = Date.now();
    const out = [];
    for (const u of updates.slice(0, limits.maxUpdatesPerMessage)) {
      if (!isObject(u) || !Number.isInteger(u.row) || !Number.isInteger(u.col)) continue;
      if (u.row < 0 || u.col < 0 || u.row >= limits.maxRows || u.col >= limits.maxCols) continue;
      if (u.data !== undefined && u.data !== null && !isObject(u.data)) continue;
      let data = u.data;
      if (isObject(data)) {
        if (JSON.stringify(data).length > limits.maxCellBytes) continue;
        if (isObject(data.editMeta) && typeof data.editMeta.ts === 'number' && data.editMeta.ts > now + limits.futureSkewMs) {
          data = { ...data, editMeta: { ...data.editMeta, ts: now } };
        }
      }
      out.push({ row: u.row, col: u.col, data });
    }
    return out;
  };

  const isRect = (r) =>
    isObject(r) && [r.startRow, r.endRow].every((v) => Number.isInteger(v) && v >= 0 && v < limits.maxRows)
    && [r.startCol, r.endCol].every((v) => Number.isInteger(v) && v >= 0 && v < limits.maxCols);
  const rect = (r) => ({ startRow: r.startRow, startCol: r.startCol, endRow: r.endRow, endCol: r.endCol });
  const sameRect = (a, b) => a.startRow === b.startRow && a.startCol === b.startCol && a.endRow === b.endRow && a.endCol === b.endCol;
  const inRect = (row, col, r) => row >= r.startRow && row <= r.endRow && col >= r.startCol && col <= r.endCol;

  // Validates one document field's value; returns undefined to drop the field
  const sanitizeFieldValue = (field, value) => {
    if (value === null || value === undefined) return null;
    switch (field) {
      case 'merges':
        return Array.isArray(value) && value.length <= 5000 && value.every(isRect) ? value.map(rect) : undefined;
      case 'protectedRanges':
        if (!Array.isArray(value) || value.length > 1000) return undefined;
        if (!value.every((p) => isObject(p) && typeof p.id === 'string' && /^[\w-]{1,64}$/.test(p.id) && isRect(p.range) && typeof p.owner === 'string')) return undefined;
        return value.map((p) => ({
          id: p.id,
          range: rect(p.range),
          owner: p.owner.slice(0, 64),
          ...(typeof p.description === 'string' && p.description ? { description: p.description.slice(0, 200) } : {}),
        }));
      case 'filters':
        return Array.isArray(value) && value.length <= 200 && value.every((f) => isObject(f) && JSON.stringify(f).length <= 4096) ? value : undefined;
      case 'frozenRows':
      case 'frozenCols':
        return Number.isInteger(value) && value >= 0 && value <= 1000 ? value : undefined;
      case 'rowHeights':
      case 'colWidths': {
        const cap = field === 'rowHeights' ? limits.maxRows : limits.maxCols;
        return Array.isArray(value) && value.length <= Math.min(cap, 100_000)
          && value.every((n) => typeof n === 'number' && n >= 4 && n <= 4000) ? value : undefined;
      }
      default:
        return undefined;
    }
  };

  // A client may add, change or remove only the protected ranges it owns
  const respectsOwnership = (incoming, stored, userId) => {
    const before = new Map(stored.map((p) => [p.id, p]));
    for (const p of incoming) {
      const prev = before.get(p.id);
      if (prev && prev.owner !== userId) {
        if (prev.owner !== p.owner || !sameRect(prev.range, p.range)) return false;
      } else {
        p.owner = userId;
      }
    }
    const after = new Set(incoming.map((p) => p.id));
    return stored.every((p) => p.owner === userId || after.has(p.id));
  };

  const sanitizeDocument = async (sheetId, fields, user) => {
    if (!isObject(fields)) return {};
    const now = Date.now();
    const out = {};
    let stored = null;
    for (const field of DOCUMENT_FIELDS) {
      const entry = fields[field];
      if (!isObject(entry) || !isObject(entry.stamp) || typeof entry.stamp.ts !== 'number') continue;
      const value = sanitizeFieldValue(field, entry.value);
      if (value === undefined) continue;
      if (field === 'protectedRanges') {
        stored = stored || await bus.getDocument(sheetId);
        if (!respectsOwnership(value ?? [], stored.protectedRanges?.value || [], user.id)) continue;
      }
      out[field] = { value, stamp: { ts: Math.min(entry.stamp.ts, now + limits.futureSkewMs), by: user.id } };
    }
    return out;
  };

  // Drops cell updates that land inside someone else's protected range
  const enforceProtection = async (sheetId, updates, userId) => {
    const ranges = (await bus.getDocument(sheetId)).protectedRanges?.value;
    if (!ranges || !ranges.length) return updates;
    return updates.filter((u) => !ranges.some((p) => p.owner !== userId && inRect(u.row, u.col, p.range)));
  };

  const sanitizeSelection = (sel) => {
    if (!isObject(sel)) return null;
    const n = (v) => Number.isInteger(v) && v >= 0 && v < limits.maxRows;
    const c = (v) => Number.isInteger(v) && v >= 0 && v < limits.maxCols;
    if (!n(sel.startRow) || !n(sel.endRow) || !c(sel.startCol) || !c(sel.endCol)) return null;
    return { sheetId: sel.sheetId, startRow: sel.startRow, startCol: sel.startCol, endRow: sel.endRow, endCol: sel.endCol };
  };

  const handleHttp = async (req, res) => {
    const url = new URL(req.url || '/', 'http://relay');
    if (url.pathname !== '/healthz' && !url.pathname.startsWith('/auth/')) return false;

    const json = (status, body) => {
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(JSON.stringify(body));
    };

    if (url.pathname === '/healthz') {
      json(200, { ok: true });
      return true;
    }
    if (req.method !== 'POST') {
      json(405, { error: 'Method not allowed' });
      return true;
    }
    const ip = clientIp(req, trustProxy);
    if (!authBuckets.take(ip)) {
      json(429, { error: 'Too many requests, try again shortly' });
      return true;
    }
    try {
      const body = await readJson(req, limits.maxBodyBytes);
      switch (url.pathname) {
        case '/auth/register': {
          if (!registerBuckets.take(ip)) throw new AuthError('Too many new accounts from this address, try again later', 429);
          json(200, await accounts.register(body.name, body.password));
          break;
        }
        case '/auth/login': {
          const key = `${ip}|${String(body.name || '').trim().toLowerCase()}`;
          const failures = loginFailures.get(key);
          if (failures && failures.lockedUntil > Date.now()) throw new AuthError('Too many failed attempts, try again later', 429);
          try {
            json(200, await accounts.login(body.name, body.password));
            loginFailures.delete(key);
          } catch (err) {
            if (err.status === 401) {
              const next = { count: (failures?.count || 0) + 1, at: Date.now(), lockedUntil: 0 };
              if (next.count >= limits.loginFailuresBeforeLock) next.lockedUntil = Date.now() + limits.loginLockMs;
              loginFailures.set(key, next);
            }
            throw err;
          }
          break;
        }
        case '/auth/me': json(200, { user: await accounts.byToken(body.token) }); break;
        case '/auth/logout': await accounts.logout(body.token); json(200, { ok: true }); break;
        default: json(404, { error: 'Not found' });
      }
    } catch (err) {
      json(err.status || 500, { error: err.status ? err.message : 'Internal server error' });
      if (!err.status) log.error('[relay] auth handler failed:', err);
    }
    return true;
  };

  const handleConnection = (ws, req) => {
    const ip = clientIp(req, trustProxy);
    const budget = new Bucket(limits.messagesPerSecond, limits.messageBurst);
    let me = null;

    const leave = async () => {
      if (!me || me.left) return;
      me.left = true;
      clients.delete(ws);
      const { last, user } = await bus.presenceLeave(me.clientId, me.session);
      if (last && user) await publish({ type: 'leave' }, { user, clientId: me.clientId });
    };

    const handle = async (raw) => {
      if (!budget.take()) {
        ws.close(1008, 'message rate exceeded');
        return;
      }
      let msg;
      try { msg = JSON.parse(String(raw)); } catch { return; }
      if (!isObject(msg) || typeof msg.type !== 'string') return;

      if (msg.type === 'hello') {
        if (me) return; // one identity per socket
        // The token is authoritative; the client's own claim only shapes a guest
        const user = (await accounts.byToken(msg.token)) || guestFrom(msg.user);
        // A tab resumes its own slot only by proving it holds the secret
        let clientId = null;
        let clientSecret = typeof msg.clientSecret === 'string' ? msg.clientSecret.slice(0, 64) : '';
        const claimed = sanitizeClientId(msg.clientId);
        if (claimed && clientSecret) {
          const entry = await bus.presenceGet(claimed);
          if (entry && entry.secretHash === sha256(clientSecret)) clientId = claimed;
        }
        if (!clientId) {
          clientId = `c-${randomBytes(9).toString('hex')}`;
          clientSecret = randomBytes(16).toString('hex');
        }
        const session = randomBytes(6).toString('hex');
        // A resumed tab supersedes its own stale socket on this instance
        for (const [other, c] of clients) {
          if (c.clientId === clientId && other !== ws) {
            c.left = true;
            clients.delete(other);
            other.close(4000, 'superseded');
          }
        }
        const outcome = await bus.presenceJoin(clientId, session, user, sha256(clientSecret));
        if (!outcome) {
          ws.close(1013, 'relay is full');
          return;
        }
        me = { clientId, session, user, left: false, ip };
        clients.set(ws, me);
        send(ws, { type: 'roster', users: await roster(user.id), you: user, clientId, clientSecret });
        if (outcome.left) await publish({ type: 'leave' }, { user: outcome.left, clientId });
        if (outcome.first) await publish({ type: 'join' }, me);
        return;
      }

      if (!me || me.left) return;

      if (msg.type === 'bye') {
        await leave();
        return;
      }

      if (msg.type === 'sync') {
        if (!validSheetId(msg.sheetId) || !(await allowed(me.user, 'read', msg.sheetId))) return;
        const snap = await bus.getSnapshot(msg.sheetId);
        const doc = await bus.getDocument(msg.sheetId);
        send(ws, { type: 'snapshot', sheetId: msg.sheetId, data: snap ? Array.from(snap.entries()) : null, doc });
        return;
      }

      if (RESERVED_TYPES.has(msg.type)) return; // server-only types can't be forged

      let outgoing = msg;
      if (msg.type === 'cells') {
        if (!validSheetId(msg.sheetId) || !Array.isArray(msg.updates)) return;
        if (!(await allowed(me.user, 'write', msg.sheetId))) return;
        const permitted = await enforceProtection(msg.sheetId, sanitizeUpdates(msg.updates), me.user.id);
        const updates = await bus.applyCellUpdates(msg.sheetId, permitted);
        if (!updates.length) return;
        outgoing = { type: 'cells', sheetId: msg.sheetId, updates };
      } else if (msg.type === 'document') {
        if (!validSheetId(msg.sheetId)) return;
        if (!(await allowed(me.user, 'write', msg.sheetId))) return;
        const fields = await bus.applyDocument(msg.sheetId, await sanitizeDocument(msg.sheetId, msg.fields, me.user));
        if (!Object.keys(fields).length) return;
        outgoing = { type: 'document', sheetId: msg.sheetId, fields };
      } else if (msg.type === 'selection') {
        if (!validSheetId(msg.sheetId)) return;
        const selection = sanitizeSelection(msg.selection);
        if (!selection) return;
        outgoing = { type: 'selection', sheetId: msg.sheetId, selection };
      } else if (msg.type === 'sheets') {
        if (!Array.isArray(msg.sheets) || msg.sheets.length > 200) return;
        const sheets = msg.sheets
          .filter((s) => isObject(s) && validSheetId(s.id) && typeof s.name === 'string')
          .map((s) => ({ id: s.id, name: s.name.slice(0, 64) }));
        outgoing = { type: 'sheets', sheets };
      } else {
        outgoing = { ...msg };
        delete outgoing.token;
      }
      await publish(outgoing, me);
    };

    // Messages from one socket are handled strictly in order (hello, then
    // sync, ...) even though handling awaits the bus
    let queue = Promise.resolve();
    ws.on('message', (raw) => {
      queue = queue.then(() => handle(raw)).catch((err) => log.error('[relay] message failed:', err));
    });
    ws.on('close', () => {
      perIp.set(ip, Math.max(0, (perIp.get(ip) || 1) - 1));
      if (!perIp.get(ip)) perIp.delete(ip);
      queue = queue.then(leave).catch((err) => log.error('[relay] leave failed:', err));
    });
  };

  /**
   * Mount the WebSocket endpoint at /collab on an HTTP server. With
   * `rejectOthers` (default) any other upgrade is refused; the Vite plugin
   * passes false so HMR's own upgrade keeps working.
   */
  const attach = (httpServer, { rejectOthers = true } = {}) => {
    wss = new WebSocketServer({ noServer: true, maxPayload: limits.maxFrameBytes });
    httpServer.on('upgrade', (req, socket, head) => {
      const path = (req.url || '').split('?')[0];
      if (path !== '/collab') {
        if (rejectOthers) socket.destroy();
        return;
      }
      if (!originAllowed(req, allowedOrigins)) {
        socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }
      const ip = clientIp(req, trustProxy);
      if ((perIp.get(ip) || 0) >= limits.connectionsPerIp) {
        socket.write('HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }
      perIp.set(ip, (perIp.get(ip) || 0) + 1);
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
    });
    wss.on('connection', handleConnection);
    return wss;
  };

  const close = async () => {
    clearInterval(sweeper);
    const open = Array.from(clients.keys());
    for (const ws of open) ws.close(1001, 'server shutting down');
    // Closing sockets drains presence via their close handlers; give the
    // bus writes a tick to land before the caller closes the bus
    await new Promise((resolve) => setTimeout(resolve, 50));
    wss?.close();
  };

  return { handleHttp, handleConnection, attach, close, instance, limits };
}
