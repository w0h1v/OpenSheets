import { useCallback, useEffect, useRef } from 'react';
import { SpreadsheetState, CellData } from '../types/spreadsheet';
import {
  setCollabUsers, pushCollabToast, COLLAB_PALETTE, CollabUser,
} from './presenceStore';
import { setEditAuthor, editStampWins, beginRemoteApply, endRemoteApply } from '../utils/editContext';
import { keyOf } from '../types/spreadsheet';

/*
 * Live collaboration over the dev relay at /collab:
 *  - outgoing: debounced diffs of state.data, plus selection presence
 *  - incoming: remote cell edits applied via dispatch, roster updates
 * The local identity persists in localStorage; the first-hop CRDT in
 * crdt.ts is used to stamp edits with user + timestamp.
 */

interface CollabHooks {
  getState: () => SpreadsheetState;
  dispatch: (action: any) => void;
  sheetId: string;
  enabled?: boolean;
  /** Called for every relayed message from other users (e.g. sheet-list sync). */
  onRemoteMessage?: (msg: any) => void;
}

const NAMES = ['Alice', 'Bob', 'Carol', 'Dave', 'Erin', 'Frank', 'Grace', 'Heidi'];

// sessionStorage (not localStorage) so each browser tab is its own user —
// opening a second tab demos real multi-user collaboration
const loadIdentity = (): { id: string; name: string; color: string } => {
  try {
    const saved = sessionStorage.getItem('opensheets-collab-identity');
    if (saved) return JSON.parse(saved);
  } catch { /* ignore */ }
  const identity = {
    id: `u-${Math.random().toString(36).slice(2, 8)}`,
    name: NAMES[Math.floor(Math.random() * NAMES.length)],
    color: COLLAB_PALETTE[Math.floor(Math.random() * COLLAB_PALETTE.length)],
  };
  try {
    sessionStorage.setItem('opensheets-collab-identity', JSON.stringify(identity));
  } catch { /* ignore */ }
  return identity;
};

export function useCollaboration({ getState, dispatch, sheetId, enabled = true, onRemoteMessage }: CollabHooks) {
  const wsRef = useRef<WebSocket | null>(null);
  const identityRef = useRef(loadIdentity());
  const lastSyncedRef = useRef<string>('');
  const pendingRef = useRef<unknown[]>([]);
  const diffTimerRef = useRef<number | null>(null);
  // Keep callbacks in refs so the socket effect never tears down because a
  // caller passed fresh inline arrows
  const getStateRef = useRef(getState);
  const dispatchRef = useRef(dispatch);
  const onRemoteMessageRef = useRef(onRemoteMessage);
  getStateRef.current = getState;
  dispatchRef.current = dispatch;
  onRemoteMessageRef.current = onRemoteMessage;

  useEffect(() => {
    if (!enabled) return;
    const identity = identityRef.current;
    const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';

const remoteUsers = new Map<string, CollabUser>();
    const publishUsers = () => setCollabUsers(Array.from(remoteUsers.values()));
    const syncSnapshot = () => {
      lastSyncedRef.current = JSON.stringify(getStateRef.current().data, (_k, v) =>
        v instanceof Map ? Array.from(v.entries()) : v
      );
    };

    // One-shot messages queued while offline survive reloads via storage
    const QUEUE_KEY = 'opensheets_collab_queue';
    const loadQueue = (): unknown[] => {
      try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { return []; }
    };
    const saveQueue = (q: unknown[]) => {
      try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-100))); } catch { /* quota */ }
    };

    let disposed = false;
    let reconnectAttempt = 0;
    let reconnectTimer: number | null = null;
    let ws: WebSocket;

    const connect = () => {
      if (disposed) return;
      try {
        ws = new WebSocket(`${proto}://${window.location.host}/collab`);
      } catch {
        scheduleReconnect();
        return;
      }
      wireSocket(ws);
    };

    const scheduleReconnect = () => {
      if (disposed || reconnectAttempt >= 12) return;
      const delay = Math.min(15000, 1000 * Math.pow(2, reconnectAttempt));
      reconnectAttempt++;
      reconnectTimer = window.setTimeout(connect, delay);
    };

    const wireSocket = (socket: WebSocket) => {
      wsRef.current = socket;

      socket.onopen = () => {
        reconnectAttempt = 0;
        setEditAuthor(identity.id);
        socket.send(JSON.stringify({ type: 'hello', user: identity }));
        // Ask the server for a snapshot; applied only if we have no local data
        socket.send(JSON.stringify({ type: 'sync', sheetId }));
        syncSnapshot();
        // Flush anything buffered while connecting/offline (connect-race
        // broadcasts and messages queued across a disconnect)
        const queued = [...pendingRef.current, ...loadQueue()];
        pendingRef.current = [];
        saveQueue([]);
        queued.forEach((m) => socket.send(JSON.stringify(m)));
      };

      socket.onmessage = (event) => {
      let msg: any;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      if (msg.type === 'snapshot' && msg.sheetId === sheetId && Array.isArray(msg.data)) {
        // A fresh client (no local data and nothing loaded) catches up from
        // the server; clients with data keep theirs (LWW stamps reconcile)
        const local = getStateRef.current().data;
        if (local.size === 0 && msg.data.length > 0) {
          const updates = (msg.data as Array<[string, CellData]>).map(([key, cell]) => {
            const [row, col] = key.split(':').map(Number);
            return { row, col, data: cell };
          });
          beginRemoteApply();
          dispatchRef.current({ type: 'SET_CELLS', payload: { updates } });
          endRemoteApply();
          setTimeout(syncSnapshot, 0);
        }
        return;
      }

      if (msg.type === 'roster') {
        (msg.users as Array<{ id: string; name: string; color: string }>).forEach((u) => {
          remoteUsers.set(u.id, { ...u, sheetId: undefined });
        });
        publishUsers();
        return;
      }

      if (msg.type === 'join') {
        remoteUsers.set(msg.user.id, { ...msg.user });
        publishUsers();
        pushCollabToast(`${msg.user.name} joined`, msg.user.color);
        return;
      }

      if (msg.type === 'leave') {
        remoteUsers.delete(msg.user.id);
        publishUsers();
        pushCollabToast(`${msg.user.name} left`, msg.user.color);
        return;
      }

      if (msg.user?.id === identity.id) return; // own echo

      try {
        onRemoteMessageRef.current?.(msg);
      } catch { /* listener errors must not break the socket */ }

      if (msg.type === 'cells' && msg.sheetId === sheetId) {
        const incoming: Array<{ row: number; col: number; data: Partial<CellData> }> = msg.updates;
        if (Array.isArray(incoming) && incoming.length) {
          // Convergent LWW: drop writes that lose to our local edit stamp
          const current = getStateRef.current().data;
          const updates = incoming.filter((u) => {
            const local = current.get(keyOf(u.row, u.col));
            return editStampWins(u.data.editMeta, local?.editMeta);
          });
          if (updates.length) {
            beginRemoteApply();
          dispatchRef.current({ type: 'SET_CELLS', payload: { updates } });
          endRemoteApply();
          }
        }
        const existing = remoteUsers.get(msg.user.id);
        remoteUsers.set(msg.user.id, { ...msg.user, ...existing, editing: false, sheetId: msg.sheetId });
        publishUsers();
        // Don't echo their edits back
        setTimeout(syncSnapshot, 0);
        return;
      }

      if (msg.type === 'selection') {
        remoteUsers.set(msg.user.id, {
          ...msg.user,
          sheetId: msg.sheetId,
          selection: msg.sheetId === sheetId ? msg.selection : undefined,
        });
        publishUsers();
      }
    };

      socket.onclose = () => {
        if (!disposed) scheduleReconnect();
      };
      socket.onerror = () => {
        /* onclose follows */
      };
    window.addEventListener('beforeunload', onBeforeUnload);

    // Poll local state for diffs (simple and robust vs intercepting dispatch)

    };

    const DIFF_DELAY = 150;
    const interval = window.setInterval(() => {
      const sock = wsRef.current;
      if (!sock || sock.readyState !== WebSocket.OPEN) return;
      const current = getStateRef.current().data;
      const prev = lastSyncedRef.current;
      const prevMap = new Map<string, CellData>();
      try {
        (JSON.parse(prev) as Array<[string, CellData]>).forEach(([k, v]) => prevMap.set(k, v));
      } catch { /* first run */ }

      const updates: Array<{ row: number; col: number; data: Partial<CellData> }> = [];
      current.forEach((cell, key) => {
        const before = JSON.stringify(prevMap.get(key));
        const after = JSON.stringify(cell);
        if (before !== after) {
          const [row, col] = key.split(':').map(Number);
          updates.push({ row, col, data: cell });
        }
      });
      prevMap.forEach((_, key) => {
        if (!current.has(key)) {
          const [row, col] = key.split(':').map(Number);
          updates.push({ row, col, data: { value: '' } });
        }
      });

      if (updates.length && diffTimerRef.current === null) {
        diffTimerRef.current = window.setTimeout(() => {
          diffTimerRef.current = null;
          const live = wsRef.current;
          // Only mark the snapshot as synced when the send really went out;
          // otherwise offline edits stay in the diff and re-send on reconnect
          if (live && live.readyState === WebSocket.OPEN) {
            live.send(JSON.stringify({ type: 'cells', sheetId, updates }));
            syncSnapshot();
          }
        }, DIFF_DELAY) as unknown as number;
      }
    }, 300);

    const onBeforeUnload = () => {
      const live = wsRef.current;
      if (live && live.readyState === WebSocket.OPEN) live.send(JSON.stringify({ type: 'bye' }));
    };
    window.addEventListener('beforeunload', onBeforeUnload);

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      window.clearInterval(interval);
      if (diffTimerRef.current !== null) window.clearTimeout(diffTimerRef.current);
      window.removeEventListener('beforeunload', onBeforeUnload);
      wsRef.current?.close();
      setCollabUsers([]);
    };
  }, [enabled, sheetId]);

  // Broadcast selection presence whenever it changes (fires on render of
  // the hosting component, which re-renders on every state change)
  const selection = getStateRef.current().selection;
  const sel = selection.ranges[0];
  const lastSelRef = useRef('');
  useEffect(() => {
    if (!sel) return;
    const sig = JSON.stringify(sel);
    if (sig === lastSelRef.current) return;
    lastSelRef.current = sig;
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'selection',
        sheetId,
        selection: {
          sheetId,
          startRow: Math.min(sel.startRow, sel.endRow),
          startCol: Math.min(sel.startCol, sel.endCol),
          endRow: Math.max(sel.startRow, sel.endRow),
          endCol: Math.max(sel.startCol, sel.endCol),
        },
      }));
    }
  }, [sel, sheetId]);

  const send = useCallback((msg: unknown) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
      return;
    }
    if (ws && ws.readyState === WebSocket.CONNECTING) {
      // Reconnecting: buffer in memory, flushed on open
      if (pendingRef.current.length < 100) pendingRef.current.push(msg);
      return;
    }
    // Offline: persist one-shot messages so they survive reloads; cell
    // edits don't need this — the diff poller re-detects and re-sends them
    if ((msg as { type?: string })?.type === 'sheets') {
      try {
        const q = JSON.parse(localStorage.getItem('opensheets_collab_queue') || '[]');
        q.push(msg);
        localStorage.setItem('opensheets_collab_queue', JSON.stringify(q.slice(-100)));
      } catch { /* quota */ }
    }
  }, []);

  return { identity: identityRef.current, connected: !!wsRef.current, send };
}
