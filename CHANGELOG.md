# Changelog

## Unreleased

The first release prepared for npm. Compared with the code that was in this
repository before:

- One provider (`SpreadsheetProvider`, with `persistence` set to none,
  local or an adapter), one grid (`SpreadsheetGrid`), one hook
  (`useSpreadsheet`). Nothing runs at import time; the package renders on a
  server.
- A parser-based formula engine with 37 functions, cycle detection and
  resource limits. Formula text is never executed as code.
- Collaboration: a relay that ships as `opensheets/server`, accounts with
  sign-in, per-person presence across tabs, shared document fields with
  last-writer stamps, protected ranges enforced on the server, origin checks,
  rate limits and size caps, and Redis for running several instances.
- No native browser dialogs: comments, version labels, sheet names and
  confirmations go through an in-app dialog (`ConfirmDialog`, `PromptDialog`,
  `useDialogs`).
- ESM and CommonJS builds with one stylesheet and TypeScript types; optional
  Excel and HyperFormula entries with their own peer dependencies; one
  runtime dependency.
- Committed lockfile, pinned dependencies, no install scripts, SHA-pinned
  CI, releases from GitHub with npm provenance.
- Removed: an unused API/CRDT persistence stack, three orphaned demo apps,
  forensics presets that had leaked into the filters, and documentation that
  described features which did not exist.
