# Publishing and releases

CommandThing is not published to npm yet. This checklist keeps documentation honest and prevents a
package from shipping without its runtime assets.

## Before the first public release

- Choose and add an open-source license.
- Replace personal Git commit email history if desired.
- Confirm the `commandthing` npm and project names remain available.
- Confirm the bundled feeder, tunnel, device controller, and dashboard are present in the tarball.
- Add authentication or retain a prominent network warning for the feeder.
- Test setup on a clean macOS account and at least one second Car Thing.
- Add CI for pnpm install, checks, dashboard build, CLI tests, and package contents.

## Validate the CLI tarball

```bash
pnpm --filter commandthing pack:check
```

The package `files` allowlist should include `bin/`, `src/`, `templates/`, `runtime/`, `README.md`,
and npm-required metadata. The runtime must include `feeder.js`, `tunnel.js`, `device.js`, and the
legacy dashboard build.

## Versioning

The repository currently has one public package, `commandthing`. Keep its version independent from
private workspace packages until more packages need publishing. Add Changesets only when multiple
public packages require coordinated releases.

## Publish

Publishing changes external state and must be done explicitly after reviewing the tarball:

```bash
pnpm --filter commandthing publish --access public
```

After publishing, update the root README and CLI guide to make this the primary setup command:

```bash
npx commandthing@latest setup
```

Do not advertise that command before a real npm release exists.

## GitHub release

Tag the same version, summarize user-visible changes, include supported host/device requirements,
and link migration steps. Keep the repository private until the public-readiness and secret audits
are complete.
