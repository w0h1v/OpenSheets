import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createConnection } from 'node:net';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import WebSocket from 'ws';
import { createRelay, createAccountStore, MemoryBus, RedisBus, AccountStore } from './relayCore.mjs';

/*
 * Relay core tests: run with `npm run test:relay` (node:test, no extra
 * tooling). The Redis suite runs only when a Redis answers on REDIS_URL
 * (default redis://localhost:6379) and is skipped otherwise.
 */

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const quiet = { error() {} };

const redisReachable = () => new Promise((resolve) => {
  const { hostname, port } = new URL(REDIS_URL);
  const socket = createConnection({ host: hostname, port: Number(port || 6379) });
  const done = (ok) => { socket.destroy(); resolve(ok); };
  socket.setTimeout(500, () => done(false));
  socket.once('connect', () => done(true));
  socket.once('error', () => done(false));
});

const startServer = async ({ bus, accounts }) => {
  const relay = createRelay({ bus, accounts, log: quiet });
  const server = createServer((req, res) => {
    relay.handleHttp(req, res).then((handled) => {
      if (!handled) { res.writeHead(404); res.end(); }
    });
  });
  relay.attach(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  return {
    relay,
    port,
    url: `http://127.0.0.1:${port}`,
    close: async () => {
      await relay.close();
      await new Promise((resolve) => server.close(resolve));
    },
  };
};

const post = async (url, path, body) => {
  const res = await fetch(url + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};

// A test client: connects, says hello, and lets tests await specific messages
const connect = (port, hello) => new Promise((resolve, reject) => {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/collab`);
  const inbox = [];
  const waiters = [];
  let closeCode = null;
  ws.on('message', (raw) => {
    const msg = JSON.parse(String(raw));
    const idx = waiters.findIndex((w) => w.pred(msg));
    if (idx !== -1) waiters.splice(idx, 1)[0].resolve(msg);
    else inbox.push(msg);
  });
  ws.on('close', (code) => { closeCode = code; });
  const client = {
    ws,
    inbox,
    get closeCode() { return closeCode; },
    send: (msg) => ws.send(JSON.stringify(msg)),
    waitFor: (pred, ms = 3000) => new Promise((res, rej) => {
      const idx = inbox.findIndex(pred);
      if (idx !== -1) return res(inbox.splice(idx, 1)[0]);
      const timer = setTimeout(() => {
        waiters.splice(waiters.indexOf(waiter), 1);
        rej(new Error(`timed out waiting for a message; inbox: ${JSON.stringify(inbox.map((m) => m.type))}`));
      }, ms);
      const waiter = { pred, resolve: (m) => { clearTimeout(timer); res(m); } };
      waiters.push(waiter);
    }),
    // Assert that nothing matching arrives for a while
    silence: (pred, ms = 250) => new Promise((res, rej) => {
      setTimeout(() => {
        const hit = inbox.find(pred);
        hit ? rej(new Error(`unexpected message ${JSON.stringify(hit)}`)) : res();
      }, ms);
    }),
    waitClosed: (ms = 3000) => new Promise((res, rej) => {
      if (closeCode !== null) return res(closeCode);
      const timer = setTimeout(() => rej(new Error('socket did not close')), ms);
      ws.once('close', (code) => { clearTimeout(timer); res(code); });
    }),
    close: () => new Promise((res) => {
      if (ws.readyState === WebSocket.CLOSED) return res();
      ws.once('close', () => res());
      ws.close();
    }),
  };
  ws.on('open', () => {
    client.send({ type: 'hello', ...hello });
    resolve(client);
  });
  ws.on('error', reject);
});

const isType = (type) => (m) => m.type === type;

describe('accounts', () => {
  let dir; let store;
  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'opensheets-accounts-'));
    store = new AccountStore(dir);
    await store.init();
  });
  after(() => rm(dir, { recursive: true, force: true }));

  test('register, login, sessions and logout', async () => {
    const reg = await store.register('Ada Lovelace', 'secret123');
    assert.match(reg.user.id, /^user-[0-9a-f]{12}$/);
    assert.equal(reg.user.name, 'Ada Lovelace');
    assert.equal(reg.user.authenticated, true);
    assert.match(reg.user.color, /^#[0-9a-f]{6}$/);
    assert.deepEqual(await store.byToken(reg.token), reg.user);

    await assert.rejects(store.register('ada lovelace', 'another1'), /already taken/);
    await assert.rejects(store.register('x', 'secret123'), /2-24/);
    await assert.rejects(store.register('Valid Name', 'short'), /at least 6/);
    await assert.rejects(store.login('Ada Lovelace', 'wrong'), /Invalid name or password/);
    await assert.rejects(store.login('Nobody', 'secret123'), /Invalid name or password/);

    const login = await store.login('ADA LOVELACE', 'secret123');
    assert.notEqual(login.token, reg.token);
    assert.equal((await store.byToken(login.token)).id, reg.user.id);

    await store.logout(login.token);
    assert.equal(await store.byToken(login.token), null);
    assert.equal((await store.byToken(reg.token)).id, reg.user.id, 'other sessions survive a logout');
  });

  test('tokens are stored hashed and survive a restart', async () => {
    const reg = await store.register('Grace', 'hopper1');
    const raw = await readFile(join(dir, 'accounts.json'), 'utf8');
    assert.ok(!raw.includes(reg.token), 'raw token must not be on disk');
    assert.ok(!raw.includes('hopper1'), 'password must not be on disk');
    const again = new AccountStore(dir);
    await again.init();
    assert.equal((await again.byToken(reg.token)).name, 'Grace');
  });
});

describe('relay (memory bus)', () => {
  let dir; let srv; let accounts; let ada;
  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'opensheets-relay-'));
    accounts = new AccountStore(dir);
    await accounts.init();
    const bus = new MemoryBus();
    await bus.init();
    srv = await startServer({ bus, accounts });
    ada = await accounts.register('Ada', 'secret123');
  });
  after(async () => {
    await srv.close();
    await rm(dir, { recursive: true, force: true });
  });

  test('auth endpoints', async () => {
    const reg = await post(srv.url, '/auth/register', { name: 'Linus', password: 'torvalds' });
    assert.equal(reg.status, 200);
    assert.equal(reg.body.user.authenticated, true);
    assert.equal((await post(srv.url, '/auth/register', { name: 'linus', password: 'torvalds' })).status, 409);
    assert.equal((await post(srv.url, '/auth/login', { name: 'Linus', password: 'nope' })).status, 401);
    const login = await post(srv.url, '/auth/login', { name: 'Linus', password: 'torvalds' });
    assert.equal(login.status, 200);
    const me = await post(srv.url, '/auth/me', { token: login.body.token });
    assert.equal(me.body.user.id, reg.body.user.id);
    assert.equal((await post(srv.url, '/auth/logout', { token: login.body.token })).status, 200);
    assert.equal((await post(srv.url, '/auth/me', { token: login.body.token })).body.user, null);
    assert.equal((await fetch(`${srv.url}/auth/me`)).status, 405);
    const bad = await fetch(`${srv.url}/auth/login`, { method: 'POST', body: '{nope' });
    assert.equal(bad.status, 400);
    const health = await (await fetch(`${srv.url}/healthz`)).json();
    assert.equal(health.ok, true);
    assert.equal(health.bus, 'memory');
  });

  test('token is authoritative; guests are prefixed and cannot impersonate', async () => {
    const a = await connect(srv.port, { clientId: 'tab-a', token: ada.token, user: { id: 'user-fake', name: 'Mallory' } });
    const roster = await a.waitFor(isType('roster'));
    assert.equal(roster.you.id, ada.user.id);
    assert.equal(roster.you.name, 'Ada');
    assert.equal(roster.clientId, 'tab-a');

    const g = await connect(srv.port, { clientId: 'tab-g', user: { id: ada.user.id, name: 'Mallory', color: '#123456' } });
    const gr = await g.waitFor(isType('roster'));
    assert.equal(gr.you.id, `guest-${ada.user.id}`);
    assert.equal(gr.you.authenticated, false);
    assert.equal(gr.you.color, '#123456');
    assert.deepEqual(gr.users.map((u) => u.id), [ada.user.id]);

    const stale = await connect(srv.port, { clientId: 'tab-s', token: 'not-a-real-token', user: { name: 'Eve' } });
    const sr = await stale.waitFor(isType('roster'));
    assert.match(sr.you.id, /^guest-/);
    await Promise.all([a.close(), g.close(), stale.close()]);
  });

  test('presence is per account, echo and takeover are per client', async () => {
    const guest = await connect(srv.port, { clientId: 'tab-guest', user: { id: 'guest-bob', name: 'Bob', color: '#2563eb' } });
    await guest.waitFor(isType('roster'));

    const tab1 = await connect(srv.port, { clientId: 'ada-1', token: ada.token });
    await tab1.waitFor(isType('roster'));
    const join = await guest.waitFor(isType('join'));
    assert.equal(join.user.id, ada.user.id);
    assert.equal(join.user.name, 'Ada');

    // Second tab of the same account: silent join, roster excludes herself
    const tab2 = await connect(srv.port, { clientId: 'ada-2', token: ada.token });
    const r2 = await tab2.waitFor(isType('roster'));
    assert.deepEqual(r2.users.map((u) => u.id), ['guest-bob']);
    await guest.silence(isType('join'));

    // Edits relay to everyone but the author's own tab, including her other tab
    tab1.send({ type: 'cells', sheetId: 's1', updates: [{ row: 0, col: 0, data: { value: 'hi' } }] });
    const seenByGuest = await guest.waitFor(isType('cells'));
    assert.equal(seenByGuest.user.id, ada.user.id);
    assert.equal(seenByGuest.clientId, 'ada-1');
    const seenByTab2 = await tab2.waitFor(isType('cells'));
    assert.equal(seenByTab2.updates[0].data.value, 'hi');
    await tab1.silence(isType('cells'));

    // Server-only types can't be forged, and tokens never leak into relays
    tab1.send({ type: 'join', user: { id: 'x', name: 'Forged' } });
    tab1.send({ type: 'selection', sheetId: 's1', selection: { startRow: 1, startCol: 1, endRow: 1, endCol: 1 }, token: 'leak' });
    const sel = await guest.waitFor(isType('selection'));
    assert.equal(sel.token, undefined);
    assert.equal(sel.user.name, 'Ada');
    await guest.silence(isType('join'));

    // A refresh reconnects with the same clientId before the old socket closes
    const tab1b = await connect(srv.port, { clientId: 'ada-1', token: ada.token });
    await tab1b.waitFor(isType('roster'));
    assert.equal(await tab1.waitClosed(), 4000);
    await guest.silence((m) => m.type === 'leave' || m.type === 'join');

    // Leave fires only when the account's last tab goes
    await tab1b.close();
    await guest.silence(isType('leave'));
    await tab2.close();
    const leave = await guest.waitFor(isType('leave'));
    assert.equal(leave.user.id, ada.user.id);
    await guest.close();
  });

  test('snapshots merge per cell and sync is ordered after hello', async () => {
    const writer = await connect(srv.port, { clientId: 'w', user: { name: 'Writer' } });
    await writer.waitFor(isType('roster'));
    writer.send({
      type: 'cells',
      sheetId: 'snap',
      updates: [
        { row: 0, col: 0, data: { value: 'first' } },
        { row: 0, col: 1, data: { value: 'keep' } },
        { row: 0, col: 0, data: { value: 'last-wins' } },
      ],
    });
    writer.send({ type: 'cells', sheetId: 'snap', updates: [{ row: 0, col: 1, data: { value: '' } }] });
    writer.send({ type: 'sync', sheetId: 'snap' });
    const own = await writer.waitFor(isType('snapshot'));
    assert.deepEqual(own.data, [['0:0', { value: 'last-wins' }]]);

    // hello and sync arrive back-to-back; the sync must not be dropped
    const reader = await connect(srv.port, { clientId: 'r', user: { name: 'Reader' } });
    reader.send({ type: 'sync', sheetId: 'snap' });
    reader.send({ type: 'sync', sheetId: 'empty' });
    const snap = await reader.waitFor((m) => m.type === 'snapshot' && m.sheetId === 'snap');
    assert.deepEqual(snap.data, [['0:0', { value: 'last-wins' }]]);
    const empty = await reader.waitFor((m) => m.type === 'snapshot' && m.sheetId === 'empty');
    assert.equal(empty.data, null);
    await Promise.all([writer.close(), reader.close()]);
  });
});

const hasRedis = await redisReachable();

describe('relay (redis bus, two instances)', { skip: hasRedis ? false : `no Redis at ${REDIS_URL}` }, () => {
  const prefix = `opensheets-test-${randomBytes(4).toString('hex')}:`;
  let dir; let accounts; let one; let two; let busOne; let busTwo; let ada;

  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'opensheets-redis-'));
    busOne = new RedisBus(REDIS_URL, { prefix, heartbeatMs: 100, staleMs: 400 });
    busTwo = new RedisBus(REDIS_URL, { prefix, heartbeatMs: 100, staleMs: 400 });
    await busOne.init();
    await busTwo.init();
    // Each instance has its own store object; the data is shared in Redis
    accounts = createAccountStore(busOne, dir);
    await accounts.init();
    ada = await accounts.register('Ada', 'secret123');
    one = await startServer({ bus: busOne, accounts });
    two = await startServer({ bus: busTwo, accounts: createAccountStore(busTwo, dir) });
  });

  after(async () => {
    await one.close();
    await two.close();
    const keys = await busOne.client.keys(`${prefix}*`);
    if (keys.length) await busOne.client.del(keys);
    await busOne.close();
    await busTwo.close();
    await rm(dir, { recursive: true, force: true });
  });

  test('presence, fan-out and snapshots are shared across instances', async () => {
    const a = await connect(one.port, { clientId: 'a', token: ada.token });
    await a.waitFor(isType('roster'));

    const b = await connect(two.port, { clientId: 'b', user: { id: 'guest-bob', name: 'Bob' } });
    const rosterB = await b.waitFor(isType('roster'));
    assert.deepEqual(rosterB.users.map((u) => u.id), [ada.user.id], 'roster spans instances');
    const joinSeenByA = await a.waitFor(isType('join'));
    assert.equal(joinSeenByA.user.id, 'guest-bob');

    a.send({ type: 'cells', sheetId: 'shared', updates: [{ row: 2, col: 3, data: { value: 42 } }] });
    const cells = await b.waitFor(isType('cells'));
    assert.equal(cells.user.id, ada.user.id);
    assert.equal(cells.updates[0].data.value, 42);
    await a.silence(isType('cells'));

    // Both instances write different cells of one sheet without clobbering
    b.send({ type: 'cells', sheetId: 'shared', updates: [{ row: 5, col: 5, data: { value: 'from-b' } }] });
    await a.waitFor(isType('cells'));
    const late = await connect(two.port, { clientId: 'late', user: { name: 'Late' } });
    late.send({ type: 'sync', sheetId: 'shared' });
    const snap = await late.waitFor(isType('snapshot'));
    assert.deepEqual(new Map(snap.data), new Map([['2:3', { value: 42 }], ['5:5', { value: 'from-b' }]]));
    await late.close();

    // The health endpoint reports each instance separately
    const h1 = await (await fetch(`${one.url}/healthz`)).json();
    const h2 = await (await fetch(`${two.url}/healthz`)).json();
    assert.equal(h1.bus, 'redis');
    assert.notEqual(h1.instance, h2.instance);

    await a.close();
    await b.waitFor((m) => m.type === 'leave' && m.user.id === ada.user.id);
    await b.close();
  });

  test('accounts are shared across instances', async () => {
    const reg = await post(one.url, '/auth/register', { name: 'Linus', password: 'torvalds' });
    assert.equal(reg.status, 200);
    const login = await post(two.url, '/auth/login', { name: 'linus', password: 'torvalds' });
    assert.equal(login.status, 200);
    assert.equal(login.body.user.id, reg.body.user.id);
    const me = await post(two.url, '/auth/me', { token: reg.body.token });
    assert.equal(me.body.user.id, reg.body.user.id, 'a session issued by one instance is valid on another');
    const c = await connect(two.port, { clientId: 'linus-tab', token: reg.body.token });
    const roster = await c.waitFor(isType('roster'));
    assert.equal(roster.you.id, reg.body.user.id);
    await c.close();
  });

  test('a crashed instance\'s presence ages out', async () => {
    // Simulate an instance that died without cleaning up: a stale entry
    await busOne.client.hSet(`${prefix}presence`, 'ghost', JSON.stringify({
      clientId: 'ghost', session: 'x', user: { id: 'user-ghost', name: 'Ghost', color: '#000000' }, ts: Date.now() - 10_000,
    }));
    const live = await busTwo.presenceList();
    assert.ok(!live.some((p) => p.clientId === 'ghost'));
    assert.equal(Number(await busOne.client.hExists(`${prefix}presence`, 'ghost')), 0, 'swept');

    // A live client's entry is kept fresh by the heartbeat
    const c = await connect(one.port, { clientId: 'beat', user: { name: 'Beat' } });
    await c.waitFor(isType('roster'));
    await new Promise((resolve) => setTimeout(resolve, 600));
    assert.ok((await busTwo.presenceList()).some((p) => p.clientId === 'beat'));
    await c.close();
  });
});
