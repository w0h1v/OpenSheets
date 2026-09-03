import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createConnection } from 'node:net';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import WebSocket from 'ws';
import { createRelay, createAccountStore, MemoryBus, RedisBus, AccountStore } from './relayCore.mjs';

/*
 * Relay core tests (opensheets/server): run with `npm run test:relay`
 * (node:test, no extra tooling). The Redis suite runs only when a Redis
 * answers on REDIS_URL (default redis://localhost:6379) and is skipped
 * otherwise.
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

const startServer = async ({ bus, accounts, ...options }) => {
  const relay = createRelay({ bus, accounts, log: quiet, ...options });
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
const connect = (port, hello, headers = {}) => new Promise((resolve, reject) => {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/collab`, { headers });
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
  // Resolves once the relay has answered, with the assigned slot attached
  client.roster = client.waitFor((m) => m.type === 'roster').then((roster) => {
    client.slot = { clientId: roster.clientId, clientSecret: roster.clientSecret };
    return roster;
  });
  client.roster.catch(() => {});
  ws.on('open', () => {
    client.send({ type: 'hello', ...hello });
    resolve(client);
  });
  ws.on('unexpected-response', (_req, res) => reject(Object.assign(new Error(`upgrade refused: ${res.statusCode}`), { status: res.statusCode })));
  ws.on('error', (err) => reject(err));
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
    const reg = await store.register('Ada Lovelace', 'secret-123');
    assert.match(reg.user.id, /^user-[0-9a-f]{12}$/);
    assert.equal(reg.user.name, 'Ada Lovelace');
    assert.equal(reg.user.authenticated, true);
    assert.match(reg.user.color, /^#[0-9a-f]{6}$/);
    assert.deepEqual(await store.byToken(reg.token), reg.user);

    await assert.rejects(store.register('ada lovelace', 'another-1'), /already taken/);
    await assert.rejects(store.register('x', 'secret-123'), /2-24/);
    await assert.rejects(store.register('Valid Name', 'short'), /at least 8/);
    await assert.rejects(store.login('Ada Lovelace', 'wrong'), /Invalid name or password/);
    await assert.rejects(store.login('Nobody', 'secret-123'), /Invalid name or password/);

    const login = await store.login('ADA LOVELACE', 'secret-123');
    assert.notEqual(login.token, reg.token);
    assert.equal((await store.byToken(login.token)).id, reg.user.id);

    await store.logout(login.token);
    assert.equal(await store.byToken(login.token), null);
    assert.equal((await store.byToken(reg.token)).id, reg.user.id, 'other sessions survive a logout');
  });

  test('tokens and passwords are stored hashed and survive a restart', async () => {
    const reg = await store.register('Grace', 'hopper-1906');
    const raw = await readFile(join(dir, 'accounts.json'), 'utf8');
    assert.ok(!raw.includes(reg.token), 'raw token must not be on disk');
    assert.ok(!raw.includes('hopper-1906'), 'password must not be on disk');
    const again = new AccountStore(dir);
    await again.init();
    assert.equal((await again.byToken(reg.token)).name, 'Grace');
  });

  test('sessions expire after their TTL', async () => {
    const ttlDir = await mkdtemp(join(tmpdir(), 'opensheets-ttl-'));
    try {
      const short = new AccountStore(ttlDir, { sessionTtlMs: 5 });
      await short.init();
      const reg = await short.register('Time Traveler', 'long-enough');
      assert.equal((await short.byToken(reg.token)).name, 'Time Traveler');
      await new Promise((resolve) => setTimeout(resolve, 10));
      assert.equal(await short.byToken(reg.token), null, 'a token past its TTL is rejected');
      // A fresh login works again; the expired session is not resurrected
      const again = await short.login('Time Traveler', 'long-enough');
      assert.equal((await short.byToken(again.token)).name, 'Time Traveler');
      assert.equal(await short.byToken(reg.token), null);
    } finally {
      await rm(ttlDir, { recursive: true, force: true });
    }
  });

  test('legacy plain-digest sessions do not survive an upgrade', async () => {
    const legacyDir = await mkdtemp(join(tmpdir(), 'opensheets-legacy-'));
    try {
      const legacy = new AccountStore(legacyDir);
      await legacy.init();
      const reg = await legacy.register('Old Salt', 'password-1');
      const account = JSON.parse(await readFile(join(legacyDir, 'accounts.json'), 'utf8'))[0];
      account.sessions = account.sessions.map((s) => s.h); // what older versions wrote
      await writeFile(join(legacyDir, 'accounts.json'), JSON.stringify([account]));
      const upgraded = new AccountStore(legacyDir);
      await upgraded.init();
      assert.equal(await upgraded.byToken(reg.token), null, 'an entry with no issue date is treated as expired');
    } finally {
      await rm(legacyDir, { recursive: true, force: true });
    }
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
    ada = await accounts.register('Ada', 'secret-123');
  });
  after(async () => {
    await srv.close();
    await rm(dir, { recursive: true, force: true });
  });

  test('auth endpoints', async () => {
    const reg = await post(srv.url, '/auth/register', { name: 'Linus', password: 'torvalds-91' });
    assert.equal(reg.status, 200);
    assert.equal(reg.body.user.authenticated, true);
    assert.equal((await post(srv.url, '/auth/register', { name: 'linus', password: 'torvalds-91' })).status, 409);
    assert.equal((await post(srv.url, '/auth/login', { name: 'Linus', password: 'nope-nope' })).status, 401);
    const login = await post(srv.url, '/auth/login', { name: 'Linus', password: 'torvalds-91' });
    assert.equal(login.status, 200);
    const me = await post(srv.url, '/auth/me', { token: login.body.token });
    assert.equal(me.body.user.id, reg.body.user.id);
    assert.equal((await post(srv.url, '/auth/logout', { token: login.body.token })).status, 200);
    assert.equal((await post(srv.url, '/auth/me', { token: login.body.token })).body.user, null);
    assert.equal((await fetch(`${srv.url}/auth/me`)).status, 405);
    const bad = await fetch(`${srv.url}/auth/login`, { method: 'POST', body: '{nope' });
    assert.equal(bad.status, 400);
    assert.deepEqual(await (await fetch(`${srv.url}/healthz`)).json(), { ok: true });
  });

  test('the relay assigns client ids; the token is authoritative; guests cannot impersonate', async () => {
    const a = await connect(srv.port, { clientId: 'tab-a', clientSecret: 'guess', token: ada.token, user: { id: 'user-fake', name: 'Mallory' } });
    const roster = await a.roster;
    assert.equal(roster.you.id, ada.user.id);
    assert.equal(roster.you.name, 'Ada');
    assert.match(roster.clientId, /^c-[0-9a-f]{18}$/, 'a claimed id without a valid secret is replaced');
    assert.match(roster.clientSecret, /^[0-9a-f]{32}$/);

    const g = await connect(srv.port, { user: { id: ada.user.id, name: 'Mallory', color: '#123456' } });
    const gr = await g.roster;
    assert.equal(gr.you.id, `guest-${ada.user.id}`);
    assert.equal(gr.you.authenticated, false);
    assert.equal(gr.you.color, '#123456');
    assert.deepEqual(gr.users.map((u) => u.id), [ada.user.id]);

    const stale = await connect(srv.port, { token: 'not-a-real-token', user: { name: 'Eve' } });
    const sr = await stale.roster;
    assert.match(sr.you.id, /^guest-/);
    await Promise.all([a.close(), g.close(), stale.close()]);
  });

  test('presence is per account; echo and slot resumption are per client', async () => {
    const guest = await connect(srv.port, { user: { id: 'guest-bob', name: 'Bob', color: '#2563eb' } });
    await guest.roster;

    const tab1 = await connect(srv.port, { token: ada.token });
    await tab1.roster;
    const join = await guest.waitFor(isType('join'));
    assert.equal(join.user.id, ada.user.id);
    assert.equal(join.user.name, 'Ada');

    // Second tab of the same account: silent join, roster excludes herself
    const tab2 = await connect(srv.port, { token: ada.token });
    const r2 = await tab2.roster;
    assert.deepEqual(r2.users.map((u) => u.id), ['guest-bob']);
    await guest.silence(isType('join'));

    // Edits relay to everyone but the author's own tab, including her other tab
    tab1.send({ type: 'cells', sheetId: 's1', updates: [{ row: 0, col: 0, data: { value: 'hi' } }] });
    const seenByGuest = await guest.waitFor(isType('cells'));
    assert.equal(seenByGuest.user.id, ada.user.id);
    assert.equal(seenByGuest.clientId, tab1.slot.clientId);
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

    // A refresh resumes its own slot with the secret; the stale socket is superseded
    const tab1b = await connect(srv.port, { ...tab1.slot, token: ada.token });
    const r1b = await tab1b.roster;
    assert.equal(r1b.clientId, tab1.slot.clientId);
    assert.equal(await tab1.waitClosed(), 4000);
    await guest.silence((m) => m.type === 'leave' || m.type === 'join');

    // Someone else cannot take that slot over without the secret
    const thief = await connect(srv.port, { clientId: tab1.slot.clientId, clientSecret: 'wrong', user: { name: 'Thief' } });
    const tr = await thief.roster;
    assert.notEqual(tr.clientId, tab1.slot.clientId);
    assert.equal(tab1b.ws.readyState, WebSocket.OPEN, 'the real tab stays connected');
    await thief.close();

    // Leave fires only when the account's last tab goes
    const adaLeft = (m) => m.type === 'leave' && m.user.id === ada.user.id;
    await tab1b.close();
    await guest.silence(adaLeft);
    await tab2.close();
    await guest.waitFor(adaLeft);
    await guest.close();
  });

  test('snapshots merge per cell and sync is ordered after hello', async () => {
    const writer = await connect(srv.port, { user: { name: 'Writer' } });
    await writer.roster;
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
    const reader = await connect(srv.port, { user: { name: 'Reader' } });
    reader.send({ type: 'sync', sheetId: 'snap' });
    reader.send({ type: 'sync', sheetId: 'empty' });
    const snap = await reader.waitFor((m) => m.type === 'snapshot' && m.sheetId === 'snap');
    assert.deepEqual(snap.data, [['0:0', { value: 'last-wins' }]]);
    const empty = await reader.waitFor((m) => m.type === 'snapshot' && m.sheetId === 'empty');
    assert.equal(empty.data, null);
    await Promise.all([writer.close(), reader.close()]);
  });

  test('document fields converge by stamp and protected ranges are enforced', async () => {
    const owner = await connect(srv.port, { token: ada.token });
    const guest = await connect(srv.port, { user: { id: 'guest-bob', name: 'Bob' } });
    await Promise.all([owner.roster, guest.roster]);
    const stamp = (ts, by) => ({ ts, by });

    // Ada protects A1:B2; the relay records her as owner and relays it
    const range = { id: 'pr-1', range: { startRow: 0, startCol: 0, endRow: 1, endCol: 1 }, owner: 'whatever', description: 'locked' };
    owner.send({ type: 'document', sheetId: 'doc', fields: { protectedRanges: { value: [range], stamp: stamp(100, 'x') } } });
    const relayed = await guest.waitFor(isType('document'));
    assert.equal(relayed.fields.protectedRanges.value[0].owner, ada.user.id);
    assert.equal(relayed.fields.protectedRanges.stamp.by, ada.user.id, 'stamps are attributed by the relay');

    // Bob cannot write inside it, can write outside it
    guest.send({ type: 'cells', sheetId: 'doc', updates: [{ row: 0, col: 0, data: { value: 'nope' } }, { row: 5, col: 5, data: { value: 'ok' } }] });
    const cells = await owner.waitFor(isType('cells'));
    assert.deepEqual(cells.updates.map((u) => u.data.value), ['ok']);

    // Bob cannot remove or reshape Ada's range, but may add his own
    guest.send({ type: 'document', sheetId: 'doc', fields: { protectedRanges: { value: [], stamp: stamp(200, 'x') } } });
    guest.send({ type: 'document', sheetId: 'doc', fields: { protectedRanges: { value: [{ ...range, range: { startRow: 0, startCol: 0, endRow: 0, endCol: 0 } }], stamp: stamp(201, 'x') } } });
    await owner.silence(isType('document'));
    const own = { id: 'pr-2', range: { startRow: 9, startCol: 0, endRow: 9, endCol: 3 }, owner: ada.user.id };
    guest.send({ type: 'document', sheetId: 'doc', fields: { protectedRanges: { value: [{ ...range, owner: ada.user.id }, own], stamp: stamp(202, 'x') } } });
    const added = await owner.waitFor(isType('document'));
    assert.deepEqual(added.fields.protectedRanges.value.map((p) => [p.id, p.owner]), [['pr-1', ada.user.id], ['pr-2', 'guest-bob']]);

    // Older stamps lose, newer win; the snapshot carries the winning fields
    owner.send({ type: 'document', sheetId: 'doc', fields: { merges: { value: [{ startRow: 2, startCol: 2, endRow: 2, endCol: 3 }], stamp: stamp(500, 'x') } } });
    await guest.waitFor(isType('document'));
    guest.send({ type: 'document', sheetId: 'doc', fields: { merges: { value: [], stamp: stamp(400, 'x') } } });
    await owner.silence(isType('document'));
    guest.send({ type: 'document', sheetId: 'doc', fields: { merges: { value: [], stamp: stamp(600, 'x') }, frozenRows: { value: 2, stamp: stamp(1, 'x') }, colWidths: { value: [80, 'wide'], stamp: stamp(1, 'x') } } });
    const won = await owner.waitFor(isType('document'));
    assert.deepEqual(Object.keys(won.fields).sort(), ['frozenRows', 'merges'], 'the malformed field is dropped');
    const late = await connect(srv.port, { user: { name: 'Late' } });
    late.send({ type: 'sync', sheetId: 'doc' });
    const snap = await late.waitFor(isType('snapshot'));
    assert.deepEqual(snap.doc.merges.value, []);
    assert.equal(snap.doc.frozenRows.value, 2);
    assert.equal(snap.doc.protectedRanges.value.length, 2);
    await Promise.all([owner.close(), guest.close(), late.close()]);
  });

  test('malformed and out-of-range updates are dropped, future stamps are clamped', async () => {
    const a = await connect(srv.port, { user: { name: 'A' } });
    const b = await connect(srv.port, { user: { name: 'B' } });
    await Promise.all([a.roster, b.roster]);
    const farFuture = Date.now() + 10 * 24 * 3600 * 1000;
    a.send({
      type: 'cells',
      sheetId: 'bounds',
      updates: [
        { row: -1, col: 0, data: { value: 'negative' } },
        { row: 1e12, col: 0, data: { value: 'huge' } },
        { row: 1.5, col: 0, data: { value: 'fraction' } },
        { row: 0, col: 0, data: 'not an object' },
        { row: 2, col: 2, data: { value: 'ok', editMeta: { ts: farFuture, by: 'a' } } },
      ],
    });
    const relayed = await b.waitFor(isType('cells'));
    assert.equal(relayed.updates.length, 1);
    assert.equal(relayed.updates[0].data.value, 'ok');
    assert.ok(relayed.updates[0].data.editMeta.ts <= Date.now() + 60_000, 'far-future stamp pulled back');

    a.send({ type: 'cells', sheetId: 'not a valid id!', updates: [{ row: 0, col: 0, data: { value: 'x' } }] });
    a.send({ type: 'selection', sheetId: 'bounds', selection: { startRow: -5, startCol: 0, endRow: 0, endCol: 0 } });
    a.send({ type: 'sheets', sheets: [{ id: 'ok-id', name: 'Fine' }, { id: 'bad id', name: 'Dropped' }, { id: 'x', name: 42 }] });
    const sheets = await b.waitFor(isType('sheets'));
    assert.deepEqual(sheets.sheets, [{ id: 'ok-id', name: 'Fine' }]);
    await b.silence((m) => m.type === 'selection' || (m.type === 'cells' && m.sheetId !== 'bounds'));
    await Promise.all([a.close(), b.close()]);
  });
});

describe('relay abuse controls', () => {
  let dir; let accounts;
  before(async () => {
    dir = await mkdtemp(join(tmpdir(), 'opensheets-limits-'));
    accounts = new AccountStore(dir);
    await accounts.init();
  });
  after(() => rm(dir, { recursive: true, force: true }));

  test('WebSocket upgrades from other origins are refused', async () => {
    const srv = await startServer({ bus: new MemoryBus(), accounts });
    try {
      await assert.rejects(connect(srv.port, {}, { Origin: 'https://evil.example' }), (err) => err.status === 403);
      const same = await connect(srv.port, { user: { name: 'Same' } }, { Origin: `http://127.0.0.1:${srv.port}` });
      await same.roster;
      await same.close();
      const strict = await startServer({ bus: new MemoryBus(), accounts, allowedOrigins: ['https://app.example'] });
      try {
        await assert.rejects(connect(strict.port, {}, { Origin: `http://127.0.0.1:${strict.port}` }), (err) => err.status === 403);
        const ok = await connect(strict.port, { user: { name: 'App' } }, { Origin: 'https://app.example' });
        await ok.roster;
        await ok.close();
      } finally {
        await strict.close();
      }
    } finally {
      await srv.close();
    }
  });

  test('a flooding socket is closed and connections per address are capped', async () => {
    const srv = await startServer({ bus: new MemoryBus(), accounts, limits: { messagesPerSecond: 5, messageBurst: 5, connectionsPerIp: 2 } });
    try {
      const flood = await connect(srv.port, { user: { name: 'Flood' } });
      await flood.roster;
      for (let i = 0; i < 20; i++) flood.send({ type: 'selection', sheetId: 's', selection: { startRow: 0, startCol: 0, endRow: 0, endCol: 0 } });
      assert.equal(await flood.waitClosed(), 1008);

      const one = await connect(srv.port, { user: { name: 'One' } });
      const two = await connect(srv.port, { user: { name: 'Two' } });
      await Promise.all([one.roster, two.roster]);
      await assert.rejects(connect(srv.port, { user: { name: 'Three' } }), (err) => err.status === 429);
      await Promise.all([one.close(), two.close()]);
    } finally {
      await srv.close();
    }
  });

  test('update batches, cells per sheet and sheets per bus are capped', async () => {
    const bus = new MemoryBus({ ...(await import('./relayCore.mjs')).DEFAULT_LIMITS, maxCellsPerSheet: 3, maxSheets: 1 });
    const srv = await startServer({ bus, accounts, limits: { maxUpdatesPerMessage: 2 } });
    try {
      const a = await connect(srv.port, { user: { name: 'A' } });
      await a.roster;
      a.send({ type: 'cells', sheetId: 'one', updates: [0, 1, 2, 3].map((i) => ({ row: i, col: 0, data: { value: i } })) });
      a.send({ type: 'cells', sheetId: 'one', updates: [4, 5].map((i) => ({ row: i, col: 0, data: { value: i } })) });
      a.send({ type: 'cells', sheetId: 'two', updates: [{ row: 0, col: 0, data: { value: 'no room' } }] });
      a.send({ type: 'sync', sheetId: 'one' });
      a.send({ type: 'sync', sheetId: 'two' });
      const one = await a.waitFor((m) => m.type === 'snapshot' && m.sheetId === 'one');
      assert.deepEqual(one.data.map(([k]) => k), ['0:0', '1:0', '4:0'], 'two per message, three per sheet');
      const two = await a.waitFor((m) => m.type === 'snapshot' && m.sheetId === 'two');
      assert.equal(two.data, null, 'second sheet refused by the sheet cap');
      await a.close();
    } finally {
      await srv.close();
    }
  });

  test('login attempts and registrations are throttled per address', async () => {
    const srv = await startServer({ bus: new MemoryBus(), accounts, limits: { loginFailuresBeforeLock: 3, registrationsPerHour: 2 } });
    try {
      await accounts.register('Locked', 'correct-horse');
      for (let i = 0; i < 3; i++) assert.equal((await post(srv.url, '/auth/login', { name: 'Locked', password: 'wrong-guess' })).status, 401);
      assert.equal((await post(srv.url, '/auth/login', { name: 'Locked', password: 'correct-horse' })).status, 429, 'locked out even with the right password');
      assert.equal((await post(srv.url, '/auth/register', { name: 'First', password: 'password-1' })).status, 200);
      assert.equal((await post(srv.url, '/auth/register', { name: 'Second', password: 'password-2' })).status, 200);
      assert.equal((await post(srv.url, '/auth/register', { name: 'Third', password: 'password-3' })).status, 429);
    } finally {
      await srv.close();
    }
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
    ada = await accounts.register('Ada', 'secret-123');
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
    const a = await connect(one.port, { token: ada.token });
    await a.roster;

    const b = await connect(two.port, { user: { id: 'guest-bob', name: 'Bob' } });
    const rosterB = await b.roster;
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
    const late = await connect(two.port, { user: { name: 'Late' } });
    late.send({ type: 'sync', sheetId: 'shared' });
    const snap = await late.waitFor(isType('snapshot'));
    assert.deepEqual(new Map(snap.data), new Map([['2:3', { value: 42 }], ['5:5', { value: 'from-b' }]]));
    await late.close();

    assert.notEqual(one.relay.instance, two.relay.instance);
    await a.close();
    await b.waitFor((m) => m.type === 'leave' && m.user.id === ada.user.id);
    await b.close();
  });

  test('accounts are shared across instances', async () => {
    const reg = await post(one.url, '/auth/register', { name: 'Linus', password: 'torvalds-91' });
    assert.equal(reg.status, 200);
    const login = await post(two.url, '/auth/login', { name: 'linus', password: 'torvalds-91' });
    assert.equal(login.status, 200);
    assert.equal(login.body.user.id, reg.body.user.id);
    const me = await post(two.url, '/auth/me', { token: reg.body.token });
    assert.equal(me.body.user.id, reg.body.user.id, 'a session issued by one instance is valid on another');
    const c = await connect(two.port, { token: reg.body.token });
    const roster = await c.roster;
    assert.equal(roster.you.id, reg.body.user.id);
    await c.close();
  });

  test('a crashed instance\'s presence ages out', async () => {
    // Simulate an instance that died without cleaning up: a stale entry
    await busOne.client.hSet(`${prefix}presence`, 'ghost', JSON.stringify({
      clientId: 'ghost', session: 'x', secretHash: 'y', user: { id: 'user-ghost', name: 'Ghost', color: '#000000' }, ts: Date.now() - 10_000,
    }));
    const live = await busTwo.presenceList();
    assert.ok(!live.some((p) => p.clientId === 'ghost'));
    assert.equal(Number(await busOne.client.hExists(`${prefix}presence`, 'ghost')), 0, 'swept');

    // A live client's entry is kept fresh by the heartbeat
    const c = await connect(one.port, { user: { name: 'Beat' } });
    await c.roster;
    await new Promise((resolve) => setTimeout(resolve, 600));
    assert.ok((await busTwo.presenceList()).some((p) => p.clientId === c.slot.clientId));
    await c.close();
  });
});
