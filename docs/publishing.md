# Publishing and releases

This checklist keeps releases reproducible and prevents a package from shipping without its runtime
assets.

## Release readiness

- Confirm the MIT license and security policy still match the intended release.
- Replace personal Git commit email history if desired.
- Confirm the `commandthing` npm and project names remain available.
- Confirm the bundled feeder, tunnel, device controller, diagnostics, and dashboard are present in
  the tarball.
- Confirm the generated default binds the feeder to `127.0.0.1`.
- Test setup on a clean macOS account and at least one second Car Thing.
- Confirm CI passes on Node.js 22 and 24, including the packed-CLI smoke test.

## Validate the CLI tarball

```bash
pnpm --filter commandthing pack:check
```

The package `files` allowlist should include `bin/`, `src/`, `templates/`, `runtime/`, `README.md`,
and npm-required metadata. The runtime must include `feeder.js`, `tunnel.js`, `device.js`,
`diagnostics.js`, and the legacy dashboard build.

## Versioning

The repository currently has one public package, `commandthing`. Keep its version independent from
private workspace packages until more packages need publishing. Add Changesets only when multiple
public packages require coordinated releases.

## Publish

Publishing changes external state and must be done explicitly after reviewing the tarball:

```bash
pnpm --filter commandthing publish --access public --provenance
```

## GitHub release

Use npm trusted publishing with required two-factor authentication. Tag the same version, summarize
user-visible changes, include supported host/device requirements, and link migration steps. Run a
GitHub secret scan and review the packed tarball immediately before changing repository visibility.
