/*
 * Where the collaboration client talks to. By default the relay and the
 * account endpoints are expected on the page's own origin (`/collab` and
 * `/auth/*`), which is how the demo servers mount them. An app that hosts
 * the relay elsewhere calls configureCollaboration() once at startup.
 */

export interface CollaborationConfig {
  /** WebSocket URL of the relay, e.g. wss://relay.example.com/collab. */
  relayUrl?: string;
  /** Base URL of the account endpoints, e.g. https://relay.example.com/auth. */
  authUrl?: string;
}

let config: CollaborationConfig = {};

export function configureCollaboration(next: CollaborationConfig) {
  config = { ...config, ...next };
}

export function relayUrl(): string {
  if (config.relayUrl) return config.relayUrl;
  if (typeof window === 'undefined') return '';
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${window.location.host}/collab`;
}

export function authUrl(path: string): string {
  const base = (config.authUrl ?? '/auth').replace(/\/$/, '');
  return `${base}/${path}`;
}
