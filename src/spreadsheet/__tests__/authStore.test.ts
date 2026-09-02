import { COLLAB_PALETTE } from '../collaboration/presenceStore';
import type { Identity } from '../collaboration/authStore';

type AuthStore = typeof import('../collaboration/authStore');

// Map-backed replacements for the bare jest mocks in setupTests
const memoryStorage = (): Storage => {
  const store = new Map<string, string>();
  return {
    get length() { return store.size; },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
  } as Storage;
};

const account = (over: Partial<Identity> = {}): Identity =>
  ({ id: 'u1', name: 'Ann', color: '#111111', authenticated: true, ...over });

describe('authStore', () => {
  let auth: AuthStore;
  let local: Storage;
  let session: Storage;
  let fetchMock: jest.Mock;

  const jsonResponse = (body: unknown, ok = true, status = 200) =>
    ({ ok, status, json: async () => body });

  const loadStore = async () => {
    auth = await import('../collaboration/authStore');
    return auth;
  };

  beforeEach(async () => {
    jest.resetModules();
    local = memoryStorage();
    session = memoryStorage();
    Object.defineProperty(window, 'localStorage', { configurable: true, value: local });
    Object.defineProperty(window, 'sessionStorage', { configurable: true, value: session });
    fetchMock = jest.fn();
    (window as unknown as { fetch: unknown }).fetch = fetchMock;
    jest.spyOn(Math, 'random').mockReturnValue(0);
    await loadStore();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    delete (window as unknown as { fetch?: unknown }).fetch;
  });

  describe('guest identity', () => {
    it('mints a guest on first use and persists it for the tab', () => {
      const identity = auth.getIdentity();
      expect(identity.authenticated).toBe(false);
      expect(identity.id).toMatch(/^guest-/);
      expect(identity.color).toBe(COLLAB_PALETTE[0]);
      expect(JSON.parse(session.getItem('opensheets-collab-identity') as string)).toEqual(identity);
      expect(auth.getIdentity()).toBe(identity);
      expect(auth.getAuthToken()).toBeNull();
    });

    it("restores the tab's guest from sessionStorage", async () => {
      const saved = { id: 'guest-abc', name: 'Bob', color: '#222222', authenticated: false };
      session.setItem('opensheets-collab-identity', JSON.stringify(saved));
      jest.resetModules();
      await loadStore();
      expect(auth.getIdentity()).toEqual(saved);
    });

    it('replaces a corrupt or foreign guest entry', async () => {
      session.setItem('opensheets-collab-identity', JSON.stringify({ id: 'not-a-guest' }));
      jest.resetModules();
      await loadStore();
      expect(auth.getIdentity().id).toMatch(/^guest-/);
    });
  });

  describe('sessions', () => {
    it('restores a signed-in account from localStorage', async () => {
      local.setItem('opensheets-auth', JSON.stringify({ token: 't1', user: account() }));
      jest.resetModules();
      await loadStore();
      expect(auth.getIdentity()).toEqual(account());
      expect(auth.getAuthToken()).toBe('t1');
    });

    it('ignores a malformed stored session and stays a guest', async () => {
      local.setItem('opensheets-auth', '{oops');
      jest.resetModules();
      await loadStore();
      expect(auth.getIdentity().authenticated).toBe(false);

      local.setItem('opensheets-auth', JSON.stringify({ token: 1, user: null }));
      jest.resetModules();
      await loadStore();
      expect(auth.getIdentity().authenticated).toBe(false);
    });

    it('adopts a session written by another tab on the storage event', () => {
      const listener = jest.fn();
      auth.getIdentity();
      auth.subscribeAuth(listener);

      local.setItem('opensheets-auth', JSON.stringify({ token: 't1', user: account() }));
      window.dispatchEvent(new StorageEvent('storage', { key: 'opensheets-auth' }));

      expect(auth.getIdentity()).toEqual(account());
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('ignores storage events for unrelated keys', () => {
      auth.getIdentity();
      local.setItem('opensheets-auth', JSON.stringify({ token: 't1', user: account() }));
      window.dispatchEvent(new StorageEvent('storage', { key: 'something-else' }));
      expect(auth.getIdentity().authenticated).toBe(false);
    });
  });

  describe('register, login and logout', () => {
    it('register stores the returned session and becomes the identity', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ token: 't1', user: { id: 'u1', name: 'Ann', color: '#111111' } }));

      const identity = await auth.register('Ann', 'pw');

      expect(fetchMock).toHaveBeenCalledWith('/auth/register', expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Ann', password: 'pw' }),
      }));
      expect(identity).toEqual(account());
      expect(auth.getIdentity()).toEqual(account());
      expect(auth.getAuthToken()).toBe('t1');
      expect(JSON.parse(local.getItem('opensheets-auth') as string)).toEqual({ token: 't1', user: account() });
    });

    it('login works the same way against the login endpoint', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ token: 't2', user: { id: 'u1', name: 'Ann', color: '#111111' } }));
      await auth.login('Ann', 'pw');
      expect(fetchMock.mock.calls[0][0]).toBe('/auth/login');
      expect(auth.getAuthToken()).toBe('t2');
    });

    it('surfaces the server error message and leaves the identity alone', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ error: 'name taken' }, false, 409));
      await expect(auth.login('Ann', 'pw')).rejects.toThrow('name taken');
      expect(auth.getIdentity().authenticated).toBe(false);
      expect(local.getItem('opensheets-auth')).toBeNull();
    });

    it('falls back to the status code when the error body is unreadable', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => { throw new Error('not json'); } });
      await expect(auth.login('Ann', 'pw')).rejects.toThrow('Request failed (500)');
    });

    it('logout clears the session, tells the server, and survives an unreachable one', async () => {
      fetchMock.mockResolvedValue(jsonResponse({ token: 't1', user: { id: 'u1', name: 'Ann', color: '#111111' } }));
      await auth.login('Ann', 'pw');
      fetchMock.mockRejectedValue(new Error('offline'));

      await auth.logout();

      expect(fetchMock).toHaveBeenLastCalledWith('/auth/logout', expect.objectContaining({ body: JSON.stringify({ token: 't1' }) }));
      expect(local.getItem('opensheets-auth')).toBeNull();
      expect(auth.getAuthToken()).toBeNull();
      expect(auth.getIdentity().authenticated).toBe(false);
    });

    it('logout without a session does not call the server', async () => {
      await auth.logout();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('subscribeAuth', () => {
    it('notifies only on a real identity change and stops after unsubscribe', async () => {
      const listener = jest.fn();
      auth.getIdentity();
      const unsubscribe = auth.subscribeAuth(listener);

      auth.adoptServerIdentity(auth.getIdentity());
      expect(listener).not.toHaveBeenCalled();

      fetchMock.mockResolvedValue(jsonResponse({ token: 't1', user: { id: 'u1', name: 'Ann', color: '#111111' } }));
      await auth.login('Ann', 'pw');
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
      await auth.logout();
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('adoptServerIdentity', () => {
    const signIn = async () => {
      fetchMock.mockResolvedValue(jsonResponse({ token: 't1', user: { id: 'u1', name: 'Ann', color: '#111111' } }));
      await auth.login('Ann', 'pw');
    };

    it('drops the session when the relay answers with a guest (our token was rejected)', async () => {
      await signIn();
      auth.adoptServerIdentity({ id: 'guest-x', name: 'Guest', color: '#333333', authenticated: false });
      expect(auth.getAuthToken()).toBeNull();
      expect(local.getItem('opensheets-auth')).toBeNull();
      expect(auth.getIdentity().authenticated).toBe(false);
    });

    it('adopts a guest identity the relay normalized, and persists it for the tab', () => {
      auth.getIdentity();
      const listener = jest.fn();
      auth.subscribeAuth(listener);
      const normalized = { id: 'guest-server', name: 'Carol', color: '#444444', authenticated: false };

      auth.adoptServerIdentity(normalized);

      expect(auth.getIdentity()).toEqual(normalized);
      expect(JSON.parse(session.getItem('opensheets-collab-identity') as string)).toEqual(normalized);
      expect(listener).toHaveBeenCalledTimes(1);

      auth.adoptServerIdentity({ ...normalized });
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("takes the relay's account details while keeping our token", async () => {
      await signIn();
      auth.adoptServerIdentity(account({ name: 'Ann Renamed', color: '#555555' }));
      expect(auth.getIdentity()).toEqual(account({ name: 'Ann Renamed', color: '#555555' }));
      expect(auth.getAuthToken()).toBe('t1');
    });

    it('leaves an unchanged account alone', async () => {
      await signIn();
      const listener = jest.fn();
      auth.subscribeAuth(listener);
      auth.adoptServerIdentity(account());
      expect(listener).not.toHaveBeenCalled();
      expect(auth.getAuthToken()).toBe('t1');
    });
  });

  describe('client slot', () => {
    it('is empty until the relay assigns one, then round-trips per tab', () => {
      expect(auth.getClientSlot()).toBeNull();
      auth.setClientSlot({ clientId: 'c1', clientSecret: 's1' });
      expect(auth.getClientSlot()).toEqual({ clientId: 'c1', clientSecret: 's1' });
      expect(JSON.parse(session.getItem('opensheets-collab-client') as string)).toEqual({ clientId: 'c1', clientSecret: 's1' });
    });

    it('ignores a corrupt or incomplete slot', () => {
      session.setItem('opensheets-collab-client', '{oops');
      expect(auth.getClientSlot()).toBeNull();
      session.setItem('opensheets-collab-client', JSON.stringify({ clientId: 'c1' }));
      expect(auth.getClientSlot()).toBeNull();
    });
  });

  describe('storage failures', () => {
    it('still yields an identity when storage throws', async () => {
      const throwing = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => {}, clear: () => {}, key: () => null, length: 0 } as unknown as Storage;
      Object.defineProperty(window, 'localStorage', { configurable: true, value: throwing });
      Object.defineProperty(window, 'sessionStorage', { configurable: true, value: throwing });
      jest.resetModules();
      await loadStore();

      expect(auth.getIdentity().id).toMatch(/^guest-/);
      expect(auth.getClientSlot()).toBeNull();
      expect(() => auth.setClientSlot({ clientId: 'c', clientSecret: 's' })).not.toThrow();
    });
  });
});
