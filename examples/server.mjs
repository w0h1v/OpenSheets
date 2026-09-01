import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';

/*
 * Standalone OpenSheets server: serves the built demo (examples/dist) and
 * the /collab WebSocket relay on one port. This is the deployment-shaped
 * counterpart of the dev-only vite plugin — run:
 *
 *   npm run build:examples && npm run serve
 *
 * Collaboration semantics are identical to the dev relay: every message is
 * forwarded to the other connected clients with the authenticated user
 * attached; join/leave presence is broadcast; nothing is persisted server-
 * side (each client persists its own sheet locally).
 */

const PORT = Number(process.env.PORT || 8080);
const DIST = join(fileURLToPath(new URL('.', import.meta.url)), 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);
    let path = decodeURIComponent(url.pathname);
    if (path === '/') path = '/index.html';

    // Resolve inside dist only (no traversal)
    const file = normalize(join(DIST, path));
    if (!file.startsWith(DIST)) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    let body;
    try {
      body = await readFile(file);
    } catch {
      // SPA fallback to index.html for unknown routes
      body = await readFile(join(DIST, 'index.html'));
    }
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch (err) {
    res.writeHead(500).end('Internal server error');
  }
});

const wss = new WebSocketServer({ noServer: true });
const clients = new Map();

const broadcast = (msg, except) => {
  const payload = JSON.stringify(msg);
  for (const client of clients.keys()) {
    if (client !== except && client.readyState === WebSocket.OPEN) client.send(payload);
  }
};

wss.on('connection', (ws) => {
  let user = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }

    if (msg.type === 'hello') {
      // Same user reconnecting (e.g. a refresh) replaces the old socket
      for (const [client, u] of clients) {
        if (u.id === msg.user.id && client !== ws && client.readyState === WebSocket.OPEN) {
          client.close();
          clients.delete(client);
        }
      }
      user = { id: msg.user.id, name: msg.user.name, color: msg.user.color };
      clients.set(ws, user);
      ws.send(JSON.stringify({
        type: 'roster',
        users: Array.from(clients.values()).filter((u) => u.id !== user.id),
      }));
      broadcast({ type: 'join', user }, ws);
      return;
    }

    if (!user) return;

    if (msg.type === 'bye') {
      broadcast({ type: 'leave', user });
      clients.delete(ws);
      return;
    }

    broadcast({ ...msg, user });
  });

  ws.on('close', () => {
    if (user) {
      broadcast({ type: 'leave', user });
      clients.delete(ws);
    }
  });
});

server.on('upgrade', (req, socket, head) => {
  if (!req.url || !req.url.startsWith('/collab')) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

server.listen(PORT, () => {
  console.log(`OpenSheets server: http://localhost:${PORT} (collab relay at /collab)`);
});
