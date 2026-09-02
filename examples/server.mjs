import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRelay, createBus, createAccountStore } from '../server/relayCore.mjs';

/*
 * Standalone OpenSheets server: serves the built demo (examples/dist), the
 * account endpoints (/auth/*) and the /collab WebSocket relay on one port.
 * This is the deployment-shaped counterpart of the dev-only Vite plugin;
 * both mount the same relay core, so behaviour is identical. Run:
 *
 *   npm run build:examples && npm run serve
 *
 * Environment:
 *   PORT                 listen port (default 8080)
 *   REDIS_URL            when set, relay state (fan-out, snapshots, presence)
 *                        lives in Redis so several instances can share one
 *                        deployment behind a load balancer; unset = single
 *                        instance, in-memory
 *   OPENSHEETS_DATA_DIR  where accounts.json lives (default examples/data);
 *                        with REDIS_URL accounts live in Redis instead
 *   ALLOWED_ORIGINS      comma-separated origins allowed to open the WebSocket
 *                        (default: only the origin the page was served from)
 *   TRUST_PROXY          set to 1 behind a reverse proxy or Cloudflare so rate
 *                        limits apply to the real client address
 */

const PORT = Number(process.env.PORT || 8080);
const HERE = fileURLToPath(new URL('.', import.meta.url));
const DIST = join(HERE, 'dist');
const DATA_DIR = process.env.OPENSHEETS_DATA_DIR || join(HERE, 'data');

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

const bus = createBus();
if (bus.kind === 'redis') console.log(`OpenSheets relay: connecting to Redis at ${process.env.REDIS_URL}`);
await bus.init();
const accounts = createAccountStore(bus, DATA_DIR);
await accounts.init();
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
  : 'same-host';
const relay = createRelay({ bus, accounts, allowedOrigins, trustProxy: process.env.TRUST_PROXY === '1' });

const server = createServer(async (req, res) => {
  try {
    if (await relay.handleHttp(req, res)) return;

    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    let path = decodeURIComponent(url.pathname);
    if (path === '/') path = '/index.html';

    // Resolve inside dist only (no traversal, and no sibling dirs sharing the prefix)
    let file = normalize(join(DIST, path));
    if (file !== DIST && !file.startsWith(DIST + sep)) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    let body;
    try {
      body = await readFile(file);
    } catch {
      // SPA fallback to index.html for unknown routes
      file = join(DIST, 'index.html');
      try {
        body = await readFile(file);
      } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Demo not built yet. Run: npm run build:examples');
        return;
      }
    }
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(500).end('Internal server error');
  }
});

relay.attach(server);

server.listen(PORT, () => {
  console.log(
    `OpenSheets server: http://localhost:${PORT} (collab relay at /collab, bus: ${bus.kind}, instance ${relay.instance})`
  );
});

// Drain presence so collaborators see this instance's users leave, then
// release the bus (Redis connections) before exiting
const shutdown = async (signal) => {
  console.log(`\n${signal}: shutting down`);
  const forceExit = setTimeout(() => process.exit(0), 2000);
  forceExit.unref();
  await relay.close();
  await bus.close();
  server.close(() => process.exit(0));
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
