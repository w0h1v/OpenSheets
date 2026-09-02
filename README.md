# OpenSheets

A spreadsheet component for React: a virtualized grid with in-cell and
formula-bar editing, a formula engine, formatting, filters, merged cells,
frozen panes, CSV and XLSX files, local persistence with version history, and
real-time collaboration through a relay that ships in the same package.

Live demo: [demo.opensheets.dev](https://demo.opensheets.dev) (a shared
playground; anyone can edit, and it resets every night).
Landing page: [opensheets.dev](https://opensheets.dev).

The package is not on npm yet. Releases will be published from GitHub
releases with npm provenance; see [Development](#development).

## Scope

OpenSheets is a lightweight, embeddable grid for applications that need
spreadsheet behaviour inside a React page: one runtime dependency, a
formula engine that never executes text as code, and collaboration that
runs on a relay you host. It is not a Google Sheets replacement. The
built-in formula library covers the common functions (the HyperFormula
entry gives you the full set), charts are basic, there are no pivot tables,
and the interface is mouse and keyboard first. If you need the heavyweight
option, look at Handsontable, AG Grid or Univer. The
[issues](https://github.com/w0h1v/OpenSheets/issues) list what is planned.

## Install

```bash
npm install opensheets
```

React 18 is a peer dependency. Import the two stylesheets once, anywhere in
your app: the component styles and the design tokens (light and dark theme).

```ts
import 'opensheets/styles.css';
import 'opensheets/styles/tokens.css';
```

The package ships ESM and CommonJS builds with TypeScript types. It works with
bundlers (Vite, webpack, esbuild) and can be imported from Node for server
rendering and tests; nothing runs at import time.

## Use it

```tsx
import { SpreadsheetProvider, SpreadsheetGrid, FormulaBar, FormattingToolbar } from 'opensheets';

export function Sheet() {
  return (
    <SpreadsheetProvider spreadsheetId="quarterly" persistence="local">
      <FormattingToolbar />
      <FormulaBar />
      <SpreadsheetGrid />
    </SpreadsheetProvider>
  );
}
```

`SpreadsheetProvider` owns the document: its cells, history and persistence.
Everything inside it, including your own components, reads the document
through `useSpreadsheet()`:

```tsx
import { useSpreadsheet, keyOf } from 'opensheets';

function TotalOfA1() {
  const { state, dispatch, undo, canUndo, save, dirty } = useSpreadsheet();
  const a1 = state.data.get(keyOf(0, 0));
  return (
    <div>
      <span>A1 is {String(a1?.value ?? '')}</span>
      <button onClick={() => dispatch({ type: 'SET_CELL', payload: { row: 0, col: 0, data: { value: 42 } } })}>Set A1</button>
      <button onClick={undo} disabled={!canUndo}>Undo</button>
      <button onClick={save} disabled={!dirty}>Save</button>
    </div>
  );
}
```

Provider props: `spreadsheetId`, `persistence` (`'none'` by default, `'local'`,
or a `PersistenceAdapter`), `autoSave` and `autoSaveInterval`, `initialData`
(a `Map` keyed by `keyOf(row, col)`), `maxRows`, `maxCols`, `readOnly`, and
the callbacks `onCellChange`, `onSelectionChange`, `onSyncStatusChange`,
`onSaveComplete`, `onLoadComplete`. The grid takes `sheetId` (for cross-sheet
formulas and collaboration), `className` and `style`.

Other components: `FormulaBar`, `FormattingToolbar`, `FindReplaceBar`,
`ChartPanel`, `ConditionalFormattingPanel`, `DataValidation`, `DropdownMenu`,
`ConfirmDialog` and `PromptDialog` (with `useDialogs` for a promise-based
confirm, alert and prompt), and the icon set. Nothing opens a native browser
dialog. The demo in `examples/App.tsx` shows all of them wired into
a Sheets-style application with menus, sheet tabs, version history and
sharing.

## What it does

- **Grid**: row and column virtualization, frozen rows and columns, merged
  cells, column and row resizing, insert and delete rows and columns with
  formula references updated to match.
- **Editing**: in-cell and formula-bar editing, keyboard navigation and
  multi-range selection, copy and paste, a fill handle for copying and
  series, sorting, and undo/redo that tracks document changes rather than
  every click.
- **Formulas**: a built-in evaluator (below); results recalculate live,
  including across sheets.
- **Formatting**: fonts, bold, italic, underline, strikethrough, text and
  fill colours, alignment, wrapping, borders; number formats such as
  currency, percent and dates; conditional formatting rules and templates.
- **Data**: per-column filters and sorting, data validation with dropdowns,
  comments with replies, charts (bar, line and pie, rendered as SVG), and
  find and replace.
- **Files**: CSV import and export; XLSX through `opensheets/excel`.
- **Persistence**: nothing, `localStorage` with version history, or your own
  adapter.
- **Collaboration**: live editing with presence, accounts and protected
  ranges over a relay you can run in one process or scale out with Redis.
- **Theming and accessibility**: CSS custom properties with light and dark
  themes; ARIA grid semantics and full keyboard operation.

## Formulas

Formulas start with `=` and support numbers, strings (`"text"`, with `""` for
a quote), `TRUE`/`FALSE`, cell references with optional `$` anchors, ranges
(`A1:B3`), references into other sheets (`Sheet2!A1`, `'Q1 Data'!A1:B2`), the
operators `+ - * / ^ % &` and `= <> < > <= >=`, and these functions:

`SUM`, `AVERAGE`, `COUNT`, `COUNTA`, `MIN`, `MAX`, `IF`, `IFERROR`, `AND`,
`OR`, `NOT`, `CONCAT`, `CONCATENATE`, `LEN`, `UPPER`, `LOWER`, `TRIM`, `LEFT`,
`RIGHT`, `MID`, `ROUND`, `ROUNDUP`, `ROUNDDOWN`, `INT`, `ABS`, `MOD`, `POWER`,
`SQRT`, `PI`, `SUMIF`, `COUNTIF`, `AVERAGEIF`, `ISBLANK`, `ISNUMBER`,
`ISTEXT`, `TODAY`, `NOW`.

Errors follow spreadsheet conventions (`#DIV/0!`, `#VALUE!`, `#NAME?`,
`#REF!`, `#CYCLE!`, `#N/A`, `#NUM!`, `#ERROR!`) and propagate through
operators and functions. Formula text is parsed and interpreted; it is never
executed as code. Cycles are detected, and a formula can read at most 250,000
cells.

`FORMULA_FUNCTIONS` exports the list above with signatures, so an app can
show it in its own help.

## Persistence

`persistence="local"` stores each document in `localStorage` under its
`spreadsheetId`, with named versions (`saveVersion`, `listVersions`,
`loadVersion` on the context). Pass an object instead to store documents
anywhere: implement `PersistenceAdapter` (`save`, `load`, `delete`,
`saveVersion`, `loadVersion`, `listVersions`, `exists`, `getMetadata`,
`updateMetadata`, `getSyncStatus`). `LocalStorageAdapter` is the reference
implementation. Loaded documents are validated before they are applied.

## Collaboration

### Client

The hook connects the provider's state to a relay and keeps every client
convergent: cell edits carry a last-writer stamp, document fields (merges,
protected ranges, filters, frozen panes, sizes) carry one each, and the
higher stamp wins. This is last-writer-wins per cell, not a CRDT: when two
people type into the same cell at the same moment, the later edit is the one
everyone ends up with, and text is not merged character by character. It
reconnects with backoff and queues what it could not send while offline.

```tsx
import { useRef } from 'react';
import { useCollaboration, useSpreadsheet } from 'opensheets';

function CollabLayer({ sheetId }: { sheetId: string }) {
  const { state, dispatch } = useSpreadsheet();
  const stateRef = useRef(state);
  stateRef.current = state;
  useCollaboration({ sheetId, getState: () => stateRef.current, dispatch });
  return null;
}
```

Who is connected comes from `subscribeCollab` and `getCollabUsers`; the
current identity from `getIdentity`, with `login`, `register` and `logout`
for accounts. By default the client expects the relay on the page's own
origin at `/collab` and `/auth/*`; `configureCollaboration({ relayUrl,
authUrl })` points it elsewhere.

An identity is either an account (one per person, shared by every tab of a
browser, restored on reload) or a per-tab guest. The relay decides which:
the session token is authoritative, and guests can never take an account's
id.

### Server

The relay is `opensheets/server` (peer dependencies: `ws`, plus `redis` to
run more than one instance). `examples/server.mjs` is a complete server that
also serves the built demo:

```js
import { createServer } from 'node:http';
import { createRelay, createBus, createAccountStore } from 'opensheets/server';

const bus = createBus();               // in memory, or Redis when REDIS_URL is set
await bus.init();
const accounts = createAccountStore(bus, './data');
await accounts.init();
const relay = createRelay({ bus, accounts });

const server = createServer(async (req, res) => {
  if (await relay.handleHttp(req, res)) return;   // /auth/*, /healthz
  // serve your app
});
relay.attach(server);                  // WebSocket endpoint at /collab
server.listen(8080);
```

What the relay does: accepts WebSocket upgrades only from allowed origins
(the page's own host by default), rate-limits connections, messages and the
account endpoints, caps message, sheet and document sizes, validates every
field it stores, assigns client ids that only the same tab can resume,
hashes passwords with scrypt and session tokens with SHA-256, and enforces
protected ranges: a write inside a range owned by someone else is dropped,
and only the owner can change or remove a range. With `REDIS_URL` set,
snapshots, presence and accounts live in Redis and any instance can serve
any client. What it does not do: decide who may open which sheet. Every
connected client can read and write every sheet unless you pass an
`authorize({ user, action, sheetId })` hook.

Demo server environment: `PORT`, `REDIS_URL`, `OPENSHEETS_DATA_DIR` (where
`accounts.json` lives without Redis), `ALLOWED_ORIGINS` (comma-separated),
`TRUST_PROXY=1` behind a proxy so limits apply to the real client address.

## Optional entries

| Entry | What it adds | Install |
| --- | --- | --- |
| `opensheets/excel` | `importFromExcel`, `exportToExcel`, `getWorksheetNames` | the `xlsx` peer. Use the SheetJS build, `npm install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`; the npm registry copy is frozen at 0.18.5 with open advisories. |
| `opensheets/hyperformula` | `FormulaEngine`, a HyperFormula-backed engine with its 390-plus functions | the `hyperformula` peer. HyperFormula is GPL-3.0-only with a commercial licence available; the grid never loads it, so opting in is your licensing decision. |
| `opensheets/server` | the relay, described above | `ws`, and `redis` for several instances |

## Theming

Every colour and shadow is a CSS custom property prefixed `--os-` (for example
`--os-accent`, `--os-bg`, `--os-border`), defined in
`opensheets/styles/tokens.css` for light and, under `html[data-theme="dark"]`,
dark. Override them in your own stylesheet, or replace the file. The
`useTheme` hook toggles the attribute and remembers the choice.

## Development

```bash
git clone https://github.com/w0h1v/OpenSheets.git
cd OpenSheets
npm ci             # exact versions from the lockfile; install scripts are disabled
npm run dev        # the demo with a collaboration relay at http://localhost:8000
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Demo app with hot reload and the relay mounted on the dev server |
| `npm test` | Unit and component tests (Jest, Testing Library) |
| `npm run test:relay` | Relay tests, including two instances on one Redis when one is running locally |
| `npm run test:package` | Packs the library and uses it from a throwaway project: Node import, bundling, types |
| `npm run typecheck`, `npm run typecheck:examples`, `npm run lint` | Static checks |
| `npm run build` | The package into `dist/` |
| `npm run build:examples`, `npm run serve` | Production build of the demo and the standalone server |
| `npm run release:check` | Everything CI runs, in order |

CI runs the same gate on every push. Releases are published only from a
GitHub release whose tag matches `package.json`, with npm provenance; the
policy for dependencies and releases is in
[docs/SUPPLY-CHAIN.md](docs/SUPPLY-CHAIN.md). The deployment of the live demo
and landing page is in [deploy/](deploy/README.md). To report a
vulnerability, see [SECURITY.md](SECURITY.md).

Layout: `src/spreadsheet/` holds the library (`components`, `hooks`,
`formula`, `collaboration`, `persistence`, `reducers`, `types`, `utils`),
`server/` the relay, `examples/` the demo, `site/` the landing page,
`deploy/` the Cloudflare deployment, `scripts/` the build and the package
smoke test.

## Licence

MIT. See [LICENSE](LICENSE).
