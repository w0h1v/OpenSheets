import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { SpreadsheetState, CellData, DOCUMENT_FIELDS, DocumentField, EditStamp } from '../types/spreadsheet';
import {
  setCollabUsers, pushCollabToast, CollabUser,
} from './presenceStore';
import {
  getIdentity, subscribeAuth, getAuthToken, getClientSlot, setClientSlot, adoptServerIdentity, Identity,
} from './authStore';
import { relayUrl } from './config';
import { setEditAuthor, editStampWins, beginRemoteApply, endRemoteApply } from '../utils/editContext';
import { keyOf } from '../types/spreadsheet';

/*
 * Live collaboration over the relay (see config.ts for where it lives):
 *  - outgoing: debounced diffs of state.data, document fields (merges,
 *    protected ranges, filters, freezes, sizes) whose stamp is ours, and
 *    selection presence
 *  - incoming: remote cell edits and document fields applied via dispatch
 *    when their stamp wins, roster updates
 * Identity comes from authStore (the signed-in account, else a per-tab
 * guest); the relay confirms it in the roster reply and is authoritative.
 * The relay assigns each tab a client id so several tabs of one account
 * coexist: echo suppression is per tab, presence is per person. The first-hop CRDT
 * in crdt.ts stamps edits with user + timestamp.
 */

interface CollabHooks {
  getState: () => SpreadsheetState;
  dispatch: (action: any) => void;
  sheetId: string;
  enabled?: boolean;
  /** Called for every relayed message from other clients (e.g. sheet-list sync). */
  onRemoteMessage?: (msg: any) => void;
}

export function useCollaboration({ getState, dispatch, sheetId, enabled = true, onRemoteMessage }: CollabHooks) {
  const wsRef = useRef<WebSocket | null>(null);
  const identity: Identity = useSyncExternalStore(subscribeAuth, getIdentity);
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

  // Reconnects whenever the identity changes (sign in / out, in any tab)
  useEffect(() => {
    if (!enabled) return;
    let clientId = getClientSlot()?.clientId ?? null;
    let selfId = identity.id;

    const remoteUsers = new Map<string, CollabUser>();
    const publishUsers = () => setCollabUsers(Array.from(remoteUsers.values()));

    // Document fields already reconciled with the relay, by stamp
    const syncedDoc = new Map<DocumentField, string>();
    const stampKey = (stamp: EditStamp) => `${stamp.ts}|${stamp.by}`;
    type RemoteFields = Partial<Record<DocumentField, { value: unknown; stamp: EditStamp }>>;
    const applyRemoteDocument = (fields: RemoteFields | undefined) => {
      if (!fields) return;
      const local = getStateRef.current().docMeta ?? {};
      const winning: RemoteFields = {};
      for (const field of DOCUMENT_FIELDS) {
        const entry = fields[field];
        if (!entry || typeof entry.stamp?.ts !== 'number' || typeof entry.stamp?.by !== 'string') continue;
        if (editStampWins(entry.stamp, local[field])) {
          winning[field] = entry;
          syncedDoc.set(field, stampKey(entry.stamp));
        }
      }
      if (!Object.keys(winning).length) return;
      beginRemoteApply();
      dispatchRef.current({ type: 'APPLY_REMOTE_DOCUMENT', payload: { fields: winning } });
      endRemoteApply();
    };
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
        ws = new WebSocket(relayUrl());
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
        setEditAuthor(selfId);
        // The token decides who we are; the user claim only shapes a guest
        const slot = getClientSlot();
        socket.send(JSON.stringify({ type: 'hello', ...(slot || {}), token: getAuthToken(), user: identity }));
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

        if (msg.type === 'roster') {
          if (typeof msg.clientId === 'string' && typeof msg.clientSecret === 'string') {
            clientId = msg.clientId;
            setClientSlot({ clientId: msg.clientId, clientSecret: msg.clientSecret });
          }
          if (msg.you) {
            // The relay's answer is authoritative (it may have rejected our
            // token or normalized a guest id); our edits are stamped with it
            selfId = msg.you.id;
            setEditAuthor(selfId);
            adoptServerIdentity(msg.you);
          }
          remoteUsers.clear();
          (msg.users as Array<{ id: string; name: string; color: string }>).forEach((u) => {
            if (u.id !== selfId) remoteUsers.set(u.id, { ...u, sheetId: undefined });
          });
          publishUsers();
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
          applyRemoteDocument(msg.doc);
          return;
        }
        if (msg.type === 'snapshot' && msg.sheetId === sheetId) {
          applyRemoteDocument(msg.doc);
          return;
        }

        if (msg.type === 'join') {
          if (msg.user.id === selfId) return;
          remoteUsers.set(msg.user.id, { ...msg.user });
          publishUsers();
          pushCollabToast(`${msg.user.name} joined`, msg.user.color);
          return;
        }

        if (msg.type === 'leave') {
          if (msg.user.id === selfId) return;
          remoteUsers.delete(msg.user.id);
          publishUsers();
          pushCollabToast(`${msg.user.name} left`, msg.user.color);
          return;
        }

        if (clientId && msg.clientId === clientId) return; // own echo (the relay already skips us)
        // Another tab of our own account is a peer for edits but not for presence
        const ownAccount = msg.user?.id === selfId;

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
          if (!ownAccount) {
            const existing = remoteUsers.get(msg.user.id);
            remoteUsers.set(msg.user.id, { ...msg.user, ...existing, editing: false, sheetId: msg.sheetId });
            publishUsers();
          }
          // Don't echo their edits back
          setTimeout(syncSnapshot, 0);
          return;
        }

        if (msg.type === 'document' && msg.sheetId === sheetId) {
          applyRemoteDocument(msg.fields);
          return;
        }

        if (msg.type === 'selection' && !ownAccount) {
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
    };

    // Poll local state for diffs (simple and robust vs intercepting dispatch)
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

      // Document fields we stamped ourselves go out as they change; fields
      // stamped by others were applied from the relay and are already there
      const docMeta = getStateRef.current().docMeta;
      if (docMeta) {
        const outgoing: Record<string, { value: unknown; stamp: EditStamp }> = {};
        for (const field of DOCUMENT_FIELDS) {
          const stamp = docMeta[field];
          if (!stamp || syncedDoc.get(field) === stampKey(stamp)) continue;
          syncedDoc.set(field, stampKey(stamp));
          if (stamp.by === selfId) outgoing[field] = { value: getStateRef.current()[field] ?? null, stamp };
        }
        if (Object.keys(outgoing).length) sock.send(JSON.stringify({ type: 'document', sheetId, fields: outgoing }));
      }

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
      if (diffTimerRef.current !== null) {
        window.clearTimeout(diffTimerRef.current);
        diffTimerRef.current = null;
      }
      window.removeEventListener('beforeunload', onBeforeUnload);
      const live = wsRef.current;
      if (live && live.readyState === WebSocket.OPEN) live.send(JSON.stringify({ type: 'bye' }));
      live?.close();
      wsRef.current = null;
      setCollabUsers([]);
    };
  }, [enabled, sheetId, identity]);

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

  return { identity, connected: !!wsRef.current, send };
}
