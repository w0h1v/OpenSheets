import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * Consumer smoke test: packs this repo exactly as `npm publish` would,
 * installs the tarball into a throwaway project, and checks the things a
 * real consumer does — import from Node (ESM and CommonJS), bundle with
 * esbuild including the stylesheet subpaths, and type-check under both the
 * `bundler` and `node16` resolution modes. Run with `npm run test:package`
 * (after `npm run build`). Needs network access for the throwaway install.
 */

const root = fileURLToPath(new URL('..', import.meta.url));
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const dev = pkg.devDependencies;
const pin = (name) => `${name}@${dev[name]}`;

const npm = (args, cwd) => execFileSync('npm', [...args, '--ignore-scripts', '--no-audit', '--no-fund', '--loglevel=error'], {
  cwd, stdio: 'pipe', env: { ...process.env, npm_config_update_notifier: 'false' },
}).toString();
const node = (args, cwd) => execFileSync(process.execPath, args, { cwd, stdio: 'pipe' }).toString();

const dir = await mkdtemp(join(tmpdir(), 'opensheets-smoke-'));
const results = [];
const check = async (name, fn) => {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail });
    console.log(`  ok   ${name}${detail ? ` (${detail})` : ''}`);
  } catch (err) {
    const output = [err.stdout, err.stderr].map((b) => (b ? String(b).trim() : '')).filter(Boolean).join('\n');
    const message = (output || err.message || String(err)).split('\n').slice(0, 8).join('\n');
    results.push({ name, ok: false, detail: message });
    console.log(`  FAIL ${name}\n${message.replace(/^/gm, '       ')}`);
  }
};

try {
  console.log(`smoke: packing ${pkg.name}@${pkg.version}`);
  npm(['pack', '--pack-destination', dir], root);
  const tarball = (await readdir(dir)).find((f) => f.endsWith('.tgz'));
  if (!tarball) throw new Error('npm pack produced no tarball');

  console.log('smoke: installing into a throwaway project');
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'opensheets-consumer', private: true, version: '0.0.0' }));
  // `ws` is the server subpath's peer; xlsx and hyperformula are deliberately left out
  npm(['install', `./${tarball}`, pin('react'), pin('react-dom'), pin('esbuild'), pin('typescript'), pin('@types/react'), pin('@types/node'), pin('ws')], dir);

  await check('Node ESM import', async () => {
    const out = node(['--input-type=module', '-e',
      "import('opensheets').then((m) => { const n = Object.keys(m).length; if (n < 40) throw new Error('only ' + n + ' exports'); console.log(n); })",
    ], dir);
    return `${out.trim()} exports`;
  });

  await check('Node CommonJS require', async () => {
    const out = node(['-e', "const m = require('opensheets'); if (typeof m.SpreadsheetProvider !== 'function') throw new Error('missing provider'); console.log(Object.keys(m).length)"], dir);
    return `${out.trim()} exports`;
  });

  await check('subpath entries resolve from Node', async () => {
    node(['--input-type=module', '-e',
      "await import('opensheets/server'); await import('opensheets/excel').catch((e) => { if (e.code !== 'ERR_MODULE_NOT_FOUND' || !/'xlsx'/.test(e.message)) throw e; }); await import('opensheets/hyperformula').catch((e) => { if (e.code !== 'ERR_MODULE_NOT_FOUND' || !/'hyperformula'/.test(e.message)) throw e; });",
    ], dir);
    return 'server loads with ws; excel and hyperformula only miss their optional peers';
  });

  await check('esbuild bundle with stylesheets', async () => {
    await writeFile(join(dir, 'app.jsx'), `
import React from 'react';
import { SpreadsheetProvider, SpreadsheetGrid, FormulaBar, FormattingToolbar, useSpreadsheet, useCollaboration, exportToCSV } from 'opensheets';
import 'opensheets/styles.css';
import 'opensheets/styles/tokens.css';
export const App = () => React.createElement(SpreadsheetProvider, { spreadsheetId: 'x', persistence: 'local' },
  React.createElement(FormattingToolbar), React.createElement(FormulaBar), React.createElement(SpreadsheetGrid, { sheetId: 'x' }));
export { useSpreadsheet, useCollaboration, exportToCSV };
`);
    node([join(dir, 'node_modules/esbuild/bin/esbuild'), 'app.jsx', '--bundle', '--format=esm', '--outdir=out', '--log-level=error'], dir);
    const js = (await readFile(join(dir, 'out/app.js'))).length;
    const css = (await readFile(join(dir, 'out/app.css'))).length;
    if (css < 1000) throw new Error('stylesheet came out empty');
    return `${(js / 1024).toFixed(0)} kB js, ${(css / 1024).toFixed(0)} kB css`;
  });

  // A CommonJS-mode consumer of the dual entries, and an ESM consumer of the
  // ESM-only server subpath (a Node server file), type-checked under both
  // resolution modes bundlers and Node use
  await writeFile(join(dir, 'consumer.ts'), `
import { SpreadsheetProvider, SpreadsheetGrid, useCollaboration, type CellData, type SpreadsheetState, type Identity } from 'opensheets';
import type { FormulaEngine } from 'opensheets/hyperformula';
import type { exportToExcel } from 'opensheets/excel';
const c: CellData = { value: 1 };
const s: Partial<SpreadsheetState> = { data: new Map() };
const id: Identity = { id: 'guest-x', name: 'x', color: '#000000', authenticated: false };
export { SpreadsheetProvider, SpreadsheetGrid, useCollaboration, c, s, id };
export type { FormulaEngine, exportToExcel };
`);
  await writeFile(join(dir, 'server-consumer.mts'), `
import { createRelay, createBus, createAccountStore, type RelayBus } from 'opensheets/server';
import { keyOf } from 'opensheets';
export const bus: RelayBus = createBus({});
export const relay = createRelay({ bus, accounts: createAccountStore(bus, './data') });
export const key = keyOf(0, 0);
`);
  for (const resolution of ['bundler', 'node16']) {
    await check(`types resolve (moduleResolution: ${resolution})`, async () => {
      node([join(dir, 'node_modules/typescript/bin/tsc'), '--noEmit', '--strict', '--skipLibCheck', '--esModuleInterop', '--jsx', 'react',
        '--target', 'es2020', '--lib', 'es2020,dom', '--types', 'node', '--module', resolution === 'node16' ? 'node16' : 'esnext', '--moduleResolution', resolution,
        'consumer.ts', 'server-consumer.mts'], dir);
      return '';
    });
  }
} finally {
  await rm(dir, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
console.log(`smoke: ${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
