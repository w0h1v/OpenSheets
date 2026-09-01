import { randomBytes, pbkdf2, timingSafeEqual, createHash } from 'node:crypto';
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
 *   - An *account* is a person: id, name, color. Accounts have pbkdf2-hashed
 *     passwords; sessions are random tokens whose sha256 is stored on the
 *     account (tokens survive restarts, storage never holds a usable token).
 *     Accounts live in a JSON file (single instance) or a Redis hash.
 *   - A *client* is one browser tab: it sends a per-tab clientId in `hello`
 *     along with its session token. The server derives the identity from
 *     the token (the client's own claim is ignored) or, with no valid token,
 *     builds a guest identity whose id is always prefixed `guest-` so a
 *     guest can never impersonate an account.
 *   - Echo suppression and socket takeover are per client; join/leave
 *     presence is per account (a person's second tab joins silently and
 *     the "left" toast fires only when their last tab goes).
 *
 * Wire protocol (client -> server): hello{clientId, token?, user?},
 * sync{sheetId}, cells{sheetId, updates}, selection{...}, sheets{...}, bye.
 * Server -> client: roster{users, you, clientId}, snapshot{sheetId, data},
 * join{user}, leave{user}, and every relayed message with {user, clientId}
 * attached by the server.
 */

/** Default location of accounts.json: a `data` folder under the process cwd (the demo servers pass their own). */
export const DEFAULT_DATA_DIR = join(process.cwd(), 'data');

const PBKDF2_ITERATIONS = 60_000;
const CHANNEL = 'collab';
const MAX_BODY_BYTES = 64 * 1024;
const RESERVED_TYPES = new Set(['roster', 'snapshot', 'join', 'leave']);

const pbkdf2Async = promisify(pbkdf2);
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const isClear = (data) => !data || data.value === '' || data.value === undefined;

// Deterministic display color per id; mirrors COLLAB_PALETTE on the client
export const ACCOUNT_COLORS = [
  '#e11d48', '#2563eb', '#16a34a', '#d97706', '#7c3aed',
  '#0891b2', '#be185d', '#4d7c0f', '#dc2626', '#0f766e',
];
export const colorFor = (id) =>
  ACCOUNT_COLORS[[...String(id)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % ACCOUNT_COLORS.length];

// ---------------------------------------------------------------------------
// Presence bookkeeping shared by both buses. Entries: { clientId, session,
// user }. `session` is a per-socket nonce so a stale socket closing after a
// takeover (refresh, or the same tab landing on another instance) can never
// remove the live entry.
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

// Merge a batch of cell updates so a later write to the same cell wins
function mergeUpdates(updates) {
  const merged = new Map(); // key -> cell | null (null = clear)
  for (const u of updates) {
    if (!u || !Number.isInteger(u.row) || !Number.isInteger(u.col)) continue;
    merged.set(`${u.row}:${u.col}`, isClear(u.data) ? null : u.data);
  }
  return merged;
}

export class MemoryBus {
  constructor() {
    this.kind = 'memory';
    this.handlers = new Map(); // channel -> Set<fn>
    this.snapshots = new Map(); // sheetId -> Map<key, cell>
    this.presence = new Map(); // clientId -> { clientId, session, user }
  }
  async init() {}
  async close() {}
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
  async applyCellUpdates(sheetId, updates) {
    let snap = this.snapshots.get(sheetId);
    if (!snap) this.snapshots.set(sheetId, (snap = new Map()));
    for (const [key, cell] of mergeUpdates(updates)) {
      if (cell === null) snap.delete(key);
      else snap.set(key, cell);
    }
  }
  async presenceJoin(clientId, session, user) {
    const outcome = joinOutcome(Array.from(this.presence.values()), clientId, user);
    this.presence.set(clientId, { clientId, session, user });
    return outcome;
  }
  async presenceLeave(clientId, session) {
    const outcome = leaveOutcome(Array.from(this.presence.values()), clientId, session);
    if (outcome.user) this.presence.delete(clientId);
    return outcome;
  }
  async presenceList() {
    return Array.from(this.presence.values(), ({ clientId, user }) => ({ clientId, user }));
  }
}

export class RedisBus {
  constructor(url = process.env.REDIS_URL || 'redis://localhost:6379', options = {}) {
    this.kind = 'redis';
    this.url = url;
    this.prefix = options.prefix || 'opensheets:';
    this.heartbeatMs = options.heartbeatMs || 10_000;
    this.staleMs = options.staleMs || 30_000;
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
    const sets = {};
    const dels = [];
    for (const [key, cell] of mergeUpdates(updates)) {
      if (cell === null) dels.push(key);
      else sets[key] = JSON.stringify(cell);
    }
    if (!dels.length && !Object.keys(sets).length) return;
    const hash = this.key('snapshot', sheetId);
    const multi = this.client.multi();
    if (Object.keys(sets).length) multi.hSet(hash, sets);
    if (dels.length) multi.hDel(hash, dels);
    await multi.exec();
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
      else live.push({ clientId, session: entry.session, user: entry.user });
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

  async presenceJoin(clientId, session, user) {
    const outcome = joinOutcome(await this.readPresence(), clientId, user);
    await this.writePresence({ clientId, session, user });
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
    return (await this.readPresence()).map(({ clientId, user }) => ({ clientId, user }));
  }
}

/** Picks the bus from the environment: REDIS_URL => RedisBus, else MemoryBus. */
export function createBus(env = process.env) {
  return env.REDIS_URL ? new RedisBus(env.REDIS_URL) : new MemoryBus();
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

const hashPassword = async (password, salt) =>
  (await pbkdf2Async(password, salt, PBKDF2_ITERATIONS, 32, 'sha256')).toString('hex');

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
    this.accounts = new Map(); // id -> { id, name, color, salt, hash, sessions: [sha256(token)] }
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
  async put(account) {
    await this.client.hSet(this.key, account.id, JSON.stringify(account));
  }
}

export class AccountStore {
  /** @param backend a data directory (file backend) or an account backend */
  constructor(backend = DEFAULT_DATA_DIR) {
    this.backend = typeof backend === 'string' ? new FileAccountBackend(backend) : backend;
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
    if (String(password || '').length < 6) throw new AuthError('Password must be at least 6 characters');
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
      ? await verifyPassword(String(password || ''), account.salt, account.hash)
      : (await hashPassword(String(password || ''), 'no-such-account'), false);
    if (!ok) throw new AuthError('Invalid name or password', 401);
    return this.issueSession(account);
  }

  async issueSession(account) {
    const token = randomBytes(24).toString('hex');
    account.sessions.push(sha256(token));
    if (account.sessions.length > 10) account.sessions = account.sessions.slice(-10);
    await this.backend.put(account);
    return { token, user: this.publicUser(account) };
  }

  async logout(token) {
    if (typeof token !== 'string' || !token) return;
    const digest = sha256(token);
    const account = (await this.backend.all()).find((a) => a.sessions.includes(digest));
    if (!account) return;
    account.sessions = account.sessions.filter((s) => s !== digest);
    await this.backend.put(account);
  }

  publicUser(account) {
    return { id: account.id, name: account.name, color: account.color, authenticated: true };
  }

  async byToken(token) {
    if (typeof token !== 'string' || !token) return null;
    const digest = sha256(token);
    const account = (await this.backend.all()).find((a) => a.sessions.includes(digest));
    return account ? this.publicUser(account) : null;
  }
}

/** Accounts follow the bus: shared in Redis when the relay is, else a local file. */
export function createAccountStore(bus, dataDir = DEFAULT_DATA_DIR) {
  return new AccountStore(bus.kind === 'redis' ? bus.accountBackend() : dataDir);
}

// ---------------------------------------------------------------------------
// Relay
// ---------------------------------------------------------------------------

const readJson = (req) => new Promise((resolve, reject) => {
  let size = 0;
  const chunks = [];
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
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
      resolve(body && typeof body === 'object' ? body : {});
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
  (typeof value === 'string' ? value.replace(/[^\w-]/g, '').slice(0, 40) : '') || null;

export function createRelay({ bus, accounts, log = console }) {
  const instance = randomBytes(4).toString('hex');
  const clients = new Map(); // ws -> { clientId, session, user, left }
  let wss = null;

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

  const handleHttp = async (req, res) => {
    const url = new URL(req.url || '/', 'http://relay');
    if (url.pathname !== '/healthz' && !url.pathname.startsWith('/auth/')) return false;

    const json = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(body));
    };

    if (url.pathname === '/healthz') {
      json(200, { ok: true, instance, bus: bus.kind, clients: clients.size });
      return true;
    }
    if (req.method !== 'POST') {
      json(405, { error: 'Method not allowed' });
      return true;
    }
    try {
      const body = await readJson(req);
      switch (url.pathname) {
        case '/auth/register': json(200, await accounts.register(body.name, body.password)); break;
        case '/auth/login': json(200, await accounts.login(body.name, body.password)); break;
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

  const handleConnection = (ws) => {
    let me = null;

    const leave = async () => {
      if (!me || me.left) return;
      me.left = true;
      clients.delete(ws);
      const { last, user } = await bus.presenceLeave(me.clientId, me.session);
      if (last && user) await publish({ type: 'leave' }, { user, clientId: me.clientId });
    };

    const handle = async (raw) => {
      let msg;
      try { msg = JSON.parse(String(raw)); } catch { return; }
      if (!msg || typeof msg.type !== 'string') return;

      if (msg.type === 'hello') {
        if (me) return; // one identity per socket
        // The token is authoritative; the client's own claim only shapes a guest
        const user = (await accounts.byToken(msg.token)) || guestFrom(msg.user);
        const clientId = sanitizeClientId(msg.clientId) || `c-${randomBytes(6).toString('hex')}`;
        const session = randomBytes(6).toString('hex');
        // A refresh can reconnect before the old socket closes: supersede it
        for (const [other, c] of clients) {
          if (c.clientId === clientId && other !== ws) {
            c.left = true;
            clients.delete(other);
            other.close(4000, 'superseded');
          }
        }
        me = { clientId, session, user, left: false };
        clients.set(ws, me);
        const { first, left } = await bus.presenceJoin(clientId, session, user);
        send(ws, { type: 'roster', users: await roster(user.id), you: user, clientId });
        if (left) await publish({ type: 'leave' }, { user: left, clientId });
        if (first) await publish({ type: 'join' }, me);
        return;
      }

      if (!me || me.left) return;

      if (msg.type === 'bye') {
        await leave();
        return;
      }

      if (msg.type === 'sync') {
        if (typeof msg.sheetId !== 'string') return;
        const snap = await bus.getSnapshot(msg.sheetId);
        send(ws, { type: 'snapshot', sheetId: msg.sheetId, data: snap ? Array.from(snap.entries()) : null });
        return;
      }

      if (RESERVED_TYPES.has(msg.type)) return; // server-only types can't be forged

      if (msg.type === 'cells') {
        if (typeof msg.sheetId !== 'string' || !Array.isArray(msg.updates)) return;
        await bus.applyCellUpdates(msg.sheetId, msg.updates);
      }

      const { token: _token, ...rest } = msg;
      await publish(rest, me);
    };

    // Messages from one socket are handled strictly in order (hello, then
    // sync, ...) even though handling awaits the bus
    let queue = Promise.resolve();
    ws.on('message', (raw) => {
      queue = queue.then(() => handle(raw)).catch((err) => log.error('[relay] message failed:', err));
    });
    ws.on('close', () => {
      queue = queue.then(leave).catch((err) => log.error('[relay] leave failed:', err));
    });
  };

  /**
   * Mount the WebSocket endpoint at /collab on an HTTP server. With
   * `rejectOthers` (default) any other upgrade is refused; the Vite plugin
   * passes false so HMR's own upgrade keeps working.
   */
  const attach = (httpServer, { rejectOthers = true } = {}) => {
    wss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 * 1024 });
    httpServer.on('upgrade', (req, socket, head) => {
      const path = (req.url || '').split('?')[0];
      if (path !== '/collab') {
        if (rejectOthers) socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
    });
    wss.on('connection', handleConnection);
    return wss;
  };

  const close = async () => {
    const open = Array.from(clients.keys());
    for (const ws of open) ws.close(1001, 'server shutting down');
    // Closing sockets drains presence via their close handlers; give the
    // bus writes a tick to land before the caller closes the bus
    await new Promise((resolve) => setTimeout(resolve, 50));
    wss?.close();
  };

  return { handleHttp, handleConnection, attach, close, instance };
}
