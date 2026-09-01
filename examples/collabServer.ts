import { Plugin } from 'vite';
import { WebSocketServer, WebSocket } from 'ws';

/*
 * Dev-only collaboration relay. Attaches a WebSocket endpoint at /collab on
 * the Vite dev server and forwards every message to the other clients in
 * the room, plus join/leave presence broadcasts. No persistence — it exists
 * so `npm run dev` gives real multi-tab collaboration with zero setup.
 */
export function collabServer(): Plugin {
  return {
    name: 'opensheets-collab-server',
    configureServer(server) {
      const wss = new WebSocketServer({ noServer: true });
      const clients = new Map<WebSocket, { id: string; name: string; color: string }>();
      // Server-side sheet snapshots: merged from relayed cell ops so a
      // joining client with empty local state can catch up
      const snapshots = new Map<string, Map<string, any>>();

      server.httpServer?.on('upgrade', (req, socket, head) => {
        if (!req.url || !req.url.startsWith('/collab')) return;
        wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
      });

      const send = (ws: WebSocket, msg: unknown) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
      };

      const broadcast = (msg: unknown, except?: WebSocket) => {
        const payload = JSON.stringify(msg);
        for (const client of clients.keys()) {
          if (client !== except && client.readyState === WebSocket.OPEN) client.send(payload);
        }
      };

      wss.on('connection', (ws) => {
        let user: { id: string; name: string; color: string } | null = null;

        ws.on('message', (raw) => {
          let msg: any;
          try {
            msg = JSON.parse(String(raw));
          } catch {
            return;
          }

          if (msg.type === 'hello') {
            user = { id: msg.user.id, name: msg.user.name, color: msg.user.color };
            clients.set(ws, user);
            // Current roster to the newcomer; join toast to everyone else
            send(ws, {
              type: 'roster',
              users: Array.from(clients.values()).filter((u) => u.id !== user!.id),
            });
            broadcast({ type: 'join', user }, ws);
            return;
          }

          if (!user) return;

          if (msg.type === 'sync') {
            const snap = snapshots.get(msg.sheetId);
            send(ws, {
              type: 'snapshot',
              sheetId: msg.sheetId,
              data: snap ? Array.from(snap.entries()) : null,
            });
            return;
          }

          if (msg.type === 'cells') {
            const snap = snapshots.get(msg.sheetId) || new Map();
            for (const u of msg.updates || []) {
              const key = `${u.row}:${u.col}`;
              if (u.data && (u.data.value === '' || u.data.value === undefined)) {
                snap.delete(key);
              } else {
                snap.set(key, u.data);
              }
            }
            snapshots.set(msg.sheetId, snap);
          }

          if (msg.type === 'bye') {
            broadcast({ type: 'leave', user });
            clients.delete(ws);
            return;
          }

          // Everything else (cell edits, selections, ...) relays as-is with
          // the authenticated user attached
          broadcast({ ...msg, user });
        });

        ws.on('close', () => {
          if (user) {
            broadcast({ type: 'leave', user });
            clients.delete(ws);
          }
        });
      });
    },
  };
}
