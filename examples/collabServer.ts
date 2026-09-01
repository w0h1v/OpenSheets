import type { Plugin } from 'vite';
import { fileURLToPath } from 'node:url';

/*
 * Dev-only collaboration relay. Mounts the shared relay core (server/relayCore.mjs)
 * on the Vite dev server: the /collab WebSocket endpoint plus the /auth/*
 * account endpoints, in-memory bus, accounts persisted to examples/data so
 * a sign-in made in dev also works against the standalone server. It exists
 * so `npm run dev` gives real multi-user collaboration with zero setup.
 */
type RelayModule = typeof import('../server/relayCore.mjs');

export function collabServer(): Plugin {
  return {
    name: 'opensheets-collab-server',
    async configureServer(server) {
      // Non-literal specifier so Vite's config bundler leaves the runtime
      // module on disk instead of inlining a second copy of it
      const core: RelayModule = await import(/* @vite-ignore */ new URL('../server/relayCore.mjs', import.meta.url).href);
      const bus = new core.MemoryBus();
      await bus.init();
      const accounts = core.createAccountStore(bus, fileURLToPath(new URL('./data', import.meta.url)));
      await accounts.init();
      const relay = core.createRelay({ bus, accounts });

      server.middlewares.use((req, res, next) => {
        relay.handleHttp(req, res).then((handled) => {
          if (!handled) next();
        }, next);
      });

      // Vite's HMR shares the same HTTP server, so other upgrades pass through
      if (server.httpServer) {
        relay.attach(server.httpServer, { rejectOthers: false });
        server.httpServer.once('close', () => {
          relay.close().then(() => bus.close()).catch(() => { /* shutting down */ });
        });
      }
    },
  };
}
