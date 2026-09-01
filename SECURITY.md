# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub's
[private vulnerability reporting](https://github.com/w0h1v/OpenSheets/security/advisories/new)
for this repository. Do not open a public issue for security problems.

You will get an acknowledgement within a few days. Fixes ship as a patch
release with a GitHub Security Advisory once a fix is available.

## Supported versions

Only the latest published minor release receives security fixes.

## Scope notes

- The collaboration relay (`opensheets/server`) is a demo-grade server: it
  hashes passwords and session tokens, but it has no rate limiting and its
  permission checks are cooperative (enforced by the client). Do not expose
  it to the public internet without putting your own authentication and
  rate limiting in front of it.
- Excel support (`opensheets/excel`) depends on the optional `xlsx` peer
  dependency. Install it from the SheetJS CDN build; the copy on the npm
  registry is frozen at 0.18.5 and has open advisories.

## How this package is protected

The dependency and release policy lives in [docs/SUPPLY-CHAIN.md](docs/SUPPLY-CHAIN.md):
committed lockfile, exact-pinned development dependencies, no dependency
install scripts, SHA-pinned GitHub Actions, and releases published only
from CI with npm provenance.
