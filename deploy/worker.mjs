import { Container, getContainer } from '@cloudflare/containers';
import { connect } from 'cloudflare:sockets';

/*
 * opensheets.dev on Cloudflare.
 *
 *   opensheets.dev, www.opensheets.dev  -> the landing page (static assets)
 *   demo.opensheets.dev                 -> the demo container: built demo app,
 *                                          /collab WebSocket relay, /auth/*
 *
 * The container keeps relay state in Upstash Redis (REDIS_URL secret), so a
 * restart keeps accounts and sheets. A daily cron flushes that database:
 * the demo is a shared playground, not a place to keep work.
 */

const DEMO_HOST = 'demo.opensheets.dev';

// The landing page is fully static: one stylesheet, no inline styles or
// scripts, no external origins (site.js is served but unused by the pages)
const SECURITY_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

const withSecurityHeaders = (response) => {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
  return new Response(response.body, { status: response.status, headers });
};

export class DemoContainer extends Container {
  defaultPort = 8080;
  sleepAfter = '3h';

  constructor(ctx, env) {
    super(ctx, env);
    this.envVars = {
      REDIS_URL: env.REDIS_URL ?? '',
      ALLOWED_ORIGINS: `https://${DEMO_HOST}`,
      TRUST_PROXY: '1',
    };
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === DEMO_HOST) {
      return getContainer(env.DEMO, 'demo').fetch(request);
    }
    if (url.hostname === 'www.opensheets.dev') {
      return Response.redirect(`https://opensheets.dev${url.pathname}${url.search}`, 301);
    }
    return withSecurityHeaders(await env.ASSETS.fetch(request));
  },

  async scheduled(_event, env) {
    if (env.REDIS_URL) await flushRedis(env.REDIS_URL);
  },
};

// Sends AUTH and FLUSHDB over RESP; a few lines beat pulling in a client
async function flushRedis(redisUrl) {
  const url = new URL(redisUrl);
  const socket = connect({ hostname: url.hostname, port: Number(url.port || 6379) }, {
    secureTransport: url.protocol === 'rediss:' ? 'on' : 'off',
    allowHalfOpen: false,
  });
  const writer = socket.writable.getWriter();
  const reader = socket.readable.getReader();
  const encode = (args) => `*${args.length}\r\n${args.map((a) => `$${new TextEncoder().encode(a).length}\r\n${a}\r\n`).join('')}`;
  const commands = [];
  if (url.password) commands.push(url.username ? ['AUTH', decodeURIComponent(url.username), decodeURIComponent(url.password)] : ['AUTH', decodeURIComponent(url.password)]);
  commands.push(['FLUSHDB']);
  await writer.write(new TextEncoder().encode(commands.map(encode).join('')));
  let replies = 0;
  let buffer = '';
  while (replies < commands.length) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += new TextDecoder().decode(value);
    replies = buffer.split('\r\n').filter((line) => line.startsWith('+') || line.startsWith('-')).length;
    if (buffer.includes('\r\n-')) throw new Error(`redis: ${buffer.trim()}`);
  }
  await writer.close();
  socket.close();
}
