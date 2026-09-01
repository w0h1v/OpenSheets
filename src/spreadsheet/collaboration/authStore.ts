import { COLLAB_PALETTE } from './presenceStore';

/*
 * Who am I, for collaboration. A module-level store (like presenceStore) so
 * the header, the collaboration hook and dialogs share one answer:
 *
 *  - Signed in: the account from the relay's /auth endpoints. The session
 *    (token + user) lives in localStorage, so it is one identity per
 *    *person* — shared by every tab of this browser and restored on reload.
 *    Signing in or out in one tab applies to all tabs via the storage event.
 *  - Guest: a per-tab identity in sessionStorage (opening a second tab
 *    still demos multi-user collaboration with zero setup).
 *
 * The relay is authoritative: on connect it answers with the identity it
 * derived from the token, and adoptServerIdentity() reconciles — a rejected
 * token drops the local session, a normalized guest is kept as normalized.
 */

export interface Identity {
  id: string;
  name: string;
  color: string;
  authenticated: boolean;
}

export interface AuthSession {
  token: string;
  user: Identity;
}

const SESSION_KEY = 'opensheets-auth';
const GUEST_KEY = 'opensheets-collab-identity';
const CLIENT_KEY = 'opensheets-collab-client';

const GUEST_NAMES = ['Alice', 'Bob', 'Carol', 'Dave', 'Erin', 'Frank', 'Grace', 'Heidi'];

const randomId = () => Math.random().toString(36).slice(2, 10);

const readSession = (): AuthSession | null => {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.token === 'string' && parsed.user && typeof parsed.user.id === 'string') {
      return { token: parsed.token, user: { ...parsed.user, authenticated: true } };
    }
  } catch { /* storage unavailable or corrupt */ }
  return null;
};

const writeSession = (next: AuthSession | null) => {
  try {
    if (next) localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    else localStorage.removeItem(SESSION_KEY);
  } catch { /* ignore */ }
};

const readGuest = (): Identity => {
  try {
    const saved = sessionStorage.getItem(GUEST_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Pre-account builds stored `u-…` ids; the relay only honours `guest-…`
      if (parsed && typeof parsed.id === 'string' && parsed.id.startsWith('guest-')) {
        return { id: parsed.id, name: parsed.name, color: parsed.color, authenticated: false };
      }
    }
  } catch { /* ignore */ }
  const guest: Identity = {
    id: `guest-${randomId()}`,
    name: GUEST_NAMES[Math.floor(Math.random() * GUEST_NAMES.length)],
    color: COLLAB_PALETTE[Math.floor(Math.random() * COLLAB_PALETTE.length)],
    authenticated: false,
  };
  writeGuest(guest);
  return guest;
};

const writeGuest = (guest: Identity) => {
  try { sessionStorage.setItem(GUEST_KEY, JSON.stringify(guest)); } catch { /* ignore */ }
};

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

let session: AuthSession | null = readSession();
let guest: Identity = readGuest();
let identity: Identity = session ? session.user : guest;

const sameIdentity = (a: Identity, b: Identity) =>
  a.id === b.id && a.name === b.name && a.color === b.color && a.authenticated === b.authenticated;

// Recompute the effective identity; notify only on a real change so the
// collaboration socket is not torn down for nothing
const refresh = () => {
  const next = session ? session.user : guest;
  if (sameIdentity(next, identity)) return;
  identity = next;
  emit();
};

const setSession = (next: AuthSession | null) => {
  session = next;
  writeSession(next);
  refresh();
};

/** The identity to collaborate as: the signed-in account, else this tab's guest. */
export function getIdentity(): Identity {
  return identity;
}

export function getAuthToken(): string | null {
  return session ? session.token : null;
}

export function subscribeAuth(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** One id per browser tab; lets several tabs of one account coexist on the relay. */
export function getClientId(): string {
  try {
    const saved = sessionStorage.getItem(CLIENT_KEY);
    if (saved) return saved;
    const fresh = `c-${randomId()}`;
    sessionStorage.setItem(CLIENT_KEY, fresh);
    return fresh;
  } catch {
    return `c-${randomId()}`;
  }
}

const call = async (path: string, body: unknown): Promise<any> => {
  const res = await fetch(`/auth/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
};

export async function register(name: string, password: string): Promise<Identity> {
  const next = await call('register', { name, password });
  setSession({ token: next.token, user: { ...next.user, authenticated: true } });
  return identity;
}

export async function login(name: string, password: string): Promise<Identity> {
  const next = await call('login', { name, password });
  setSession({ token: next.token, user: { ...next.user, authenticated: true } });
  return identity;
}

export async function logout(): Promise<void> {
  const token = session ? session.token : null;
  setSession(null);
  if (token) await call('logout', { token }).catch(() => { /* server unreachable: local sign-out stands */ });
}

/** Reconcile with the identity the relay derived from our hello. */
export function adoptServerIdentity(you: Identity) {
  if (session && !you.authenticated) {
    // Our token was rejected (revoked, or the accounts file was reset)
    setSession(null);
    return;
  }
  if (!session && !you.authenticated) {
    if (!sameIdentity(you, guest)) {
      guest = you;
      writeGuest(guest);
      refresh();
    }
    return;
  }
  if (session && you.authenticated && !sameIdentity(you, session.user)) {
    setSession({ token: session.token, user: you });
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === SESSION_KEY || e.key === null) {
      session = readSession();
      refresh();
    }
  });
}
