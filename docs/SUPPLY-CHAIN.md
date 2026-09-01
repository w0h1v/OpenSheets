# Supply-chain policy and release runbook

This document is the reference for how OpenSheets consumes dependencies and
how it is published. It exists because a published npm package is both a
consumer of the ecosystem and a link in other people's chains.

## What we consume

### Rules

| Rule | Where it is enforced |
| --- | --- |
| The lockfile is committed and installs use `npm ci` | `package-lock.json`, CI |
| Development dependencies are pinned to exact versions | `package.json`, `.npmrc` (`save-exact`) |
| Dependency install scripts never run | `.npmrc` (`ignore-scripts=true`), `npm ci --ignore-scripts` in CI |
| New versions wait a week before being proposed | `.github/dependabot.yml` (`cooldown`) |
| Known-vulnerable versions fail CI | `npm audit --audit-level=high` in CI |
| GitHub Actions are pinned to commit SHAs | `.github/workflows/*.yml` |
| Installs on developer machines are screened | Socket CLI wraps `npm` (`socket npm`) |

`ignore-scripts=true` means `npm run <script>` still works, but lifecycle hooks
such as `prepublishOnly` do not fire on their own. The release gate is
therefore invoked explicitly (`npm run release:check`), never relied on as a
hook.

### Runtime dependencies of the published package

The library ships three runtime dependencies. Everything else is either a
peer dependency the consumer already has (React) or an optional peer behind a
subpath entry.

| Package | Why | Licence | Notes |
| --- | --- | --- | --- |
| `@tanstack/react-virtual` | row/column virtualization | MIT | |
| `immer` | immutable state updates | MIT | |
| `react-hotkeys-hook` | keyboard shortcuts | MIT | |

Optional peers (only installed by consumers who use the matching subpath):

| Package | Subpath | Licence | Notes |
| --- | --- | --- | --- |
| `xlsx` (SheetJS) | `opensheets/excel` | Apache-2.0 | The npm registry copy is frozen at 0.18.5 with two open high advisories (ReDoS, prototype pollution). Install the vendor build: `npm install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`. |
| `hyperformula` | `opensheets/hyperformula` | **GPL-3.0-only** (commercial licence available) | Kept out of the core so the MIT package never links GPL code. Opting in is the consumer's licensing decision. |
| `ws` | `opensheets/server` | MIT | |
| `redis` | `opensheets/server` with `REDIS_URL` | MIT | |

### Reviewing a new dependency

Before adding a package, check and record in the pull request:

1. Who maintains it, how long it has existed, and its download history.
2. Advisories: `npm audit`, the GitHub advisory database, and Socket's score
   (`socket npm/<name>@<version>`, once `socket login` has been run).
3. Whether it has install scripts (`npm query ':attr(scripts, [postinstall])'`)
   and whether it needs network access at install time.
4. Its licence, and the licences of what it pulls in.

## What we publish

### How a release happens

1. Bump `version` in `package.json` on `main` and merge.
2. Create a GitHub release whose tag is `v<version>` (for example `v2.1.0`).
3. The `Release` workflow checks the tag matches the version, runs the full
   gate (`npm run release:check`), and publishes with `npm publish --provenance`.
   Provenance links the published tarball to the exact commit and workflow run,
   verifiable on the package's npm page.

Nobody publishes from a laptop once trusted publishing is configured.

### One-time setup on npmjs.com (account owner)

These are settings only the account owner can change. Until they are done,
the release workflow cannot publish.

1. **Enable two-factor authentication** on the npm account, with an
   authenticator app or security key (not SMS).
2. **First publish.** npm only lets a trusted publisher be attached to a
   package that already exists, so the very first `npm publish` is done
   locally, after `npm run release:check` passes, with 2FA prompted.
3. **Package settings → Publishing access:** choose *Require two-factor
   authentication and disallow tokens*, then add a **Trusted publisher**:
   GitHub Actions, organization or user `w0h1v`, repository `OpenSheets`,
   workflow `release.yml`, environment `npm-publish`.
4. After trusted publishing works once, remove any granular access tokens
   that were created along the way.

### One-time setup on GitHub (repository admin)

1. Create the `npm-publish` environment (Settings → Environments) and add
   yourself as a required reviewer, so a release cannot publish without a
   human approving the run.
2. Protect `main`: require the CI workflow to pass and require pull requests
   (or at least signed commits) before merging.
3. Enable Dependabot alerts and security updates, and private vulnerability
   reporting (Settings → Code security).

### If the package is ever compromised

1. `npm deprecate opensheets@<bad version> "compromised, do not use"` and
   publish a fixed version immediately; npm does not allow unpublishing after
   72 hours, so deprecation is the tool.
2. Rotate anything the compromised release could have reached (npm and GitHub
   credentials), and revoke the trusted publisher until the cause is known.
3. Publish a GitHub Security Advisory describing the affected versions.
