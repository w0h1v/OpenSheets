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

- The collaboration relay (`opensheets/server`) hashes passwords (scrypt)
  and session tokens, expires sessions after 30 days, checks the Origin of
  WebSocket upgrades, rate-limits
  connections, messages and account endpoints, caps sheet and message sizes,
  and enforces protected-range ownership on the server. It has no document
  access control beyond that: every connected client can read and write
  every sheet on the relay unless you supply an `authorize` hook. Treat a
  public deployment as a shared playground, or put your own authorization
  in front of it.
- Excel support (`opensheets/excel`) depends on the optional `xlsx` peer
  dependency. Install it from the SheetJS CDN build; the copy on the npm
  registry is frozen at 0.18.5 and has open advisories.

## How this package is protected

The dependency and release policy lives in [docs/SUPPLY-CHAIN.md](docs/SUPPLY-CHAIN.md):
committed lockfile, exact-pinned development dependencies, no dependency
install scripts, SHA-pinned GitHub Actions, and releases published only
from CI with npm provenance.
