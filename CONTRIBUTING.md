# Contributing to OpenSheets

Thanks for helping. This is a small project, so the process is short.

## Setup

```bash
git clone https://github.com/w0h1v/OpenSheets.git
cd OpenSheets
npm ci          # exact versions from package-lock.json; install scripts are disabled by .npmrc
npm run dev     # demo app with the collaboration relay at http://localhost:8000
```

## Before you open a pull request

Run the same gate CI runs:

```bash
npm run release:check
```

That is: type-check, lint, unit tests, relay tests, the library build, and a
smoke test that installs the packed tarball into a throwaway project. The
relay tests exercise Redis when one answers on `localhost:6379` and skip that
part otherwise.

## Dependencies

Adding or upgrading a dependency is a security decision, so:

- `npm install <pkg>` records an exact version (`save-exact` is set) and the
  lockfile change is part of your pull request.
- Prefer packages with no install scripts; the tree currently needs none and
  `.npmrc` disables them.
- Say in the pull request why the package is needed and what you checked
  (maintainer, download history, advisories). Dependabot proposes routine
  updates with a one-week cooldown; please do not bump versions by hand in
  the same week they were published.
- Runtime dependencies of the library itself are kept to a minimum. Anything
  optional (Excel, HyperFormula, the relay) lives behind a subpath entry and
  an optional peer dependency instead.

More detail: [docs/SUPPLY-CHAIN.md](docs/SUPPLY-CHAIN.md).

## Reporting security issues

See [SECURITY.md](SECURITY.md). Please do not file public issues for
vulnerabilities.
