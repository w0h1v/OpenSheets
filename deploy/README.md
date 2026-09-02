# Deploying opensheets.dev

One Cloudflare Worker serves the landing page (`../site`) as static assets
and proxies `demo.opensheets.dev` to a container built from `../Dockerfile`,
which runs `examples/server.mjs`: the built demo app plus the collaboration
relay. Relay state lives in an Upstash Redis database so the container can
restart without losing accounts or sheets. A daily cron flushes that
database; the demo is a shared playground.

## One-time setup

1. An Upstash Redis database; its `rediss://` URL becomes the `REDIS_URL`
   secret: `npx wrangler secret put REDIS_URL`.
2. The Cloudflare API token in the environment as `CLOUDFLARE_API_TOKEN`
   (Workers, Containers and DNS for the zone), and Docker running locally
   to build the image.
3. `npm ci --ignore-scripts` in this directory.

The custom domains in `wrangler.jsonc` create their own DNS records and
certificates on first deploy.

## Each release

```bash
cd deploy
npm run deploy
```

`wrangler deploy` builds the image from the repository root, pushes it, and
updates the Worker and its assets. The first request after a deploy starts a
fresh container, which takes a few seconds.

## Checking

- `curl https://demo.opensheets.dev/healthz` returns `{"ok":true}`.
- `npm run logs` tails the Worker.
