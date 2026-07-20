# Development

## Tooling model

pnpm manages the monorepo and its single `pnpm-lock.yaml`. Node.js runs the feeder, CLI, device
tools, and installed services. esbuild bundles the installable runtime during package preparation.

Workspace dependencies use `workspace:*`. Add dependencies to the package that imports them rather
than relying on packages hoisted at the root.

## Common commands

| Command | Purpose |
|---|---|
| `pnpm install` | Install every workspace package |
| `pnpm dev` | Run feeder and Vite together |
| `pnpm feeder` | Run the feeder on port 4000 |
| `pnpm feeder:dev` | Run the feeder with TSX watch mode |
| `pnpm ui` | Run only Vite on port 5173 |
| `pnpm build` | Build the Chromium 69 production dashboard |
| `pnpm typecheck` | Type-check the dashboard and feeder |
| `pnpm test` | Run CLI regression tests |
| `pnpm preview` | Build and serve production on port 4000 |
| `pnpm lint` | Lint the repository |
| `pnpm check` | Check formatting and lint without modifying files |
| `pnpm check:write` | Apply safe Biome formatting/fixes |

## CLI device commands

| Command | Purpose |
|---|---|
| `pnpm commandthing setup` | Build/install runtime and maintain the ADB reverse tunnel |
| `pnpm commandthing device reload` | Hard-reload the kiosk |
| `pnpm commandthing device screenshot` | Save a device screenshot |
| `pnpm commandthing device open /usage` | Navigate to a route |
| `pnpm commandthing device info` | Print kiosk URL, user agent, and viewport |

## Service lifecycle

The CLI manages the macOS LaunchAgents:

```bash
pnpm commandthing setup --skip-hooks
pnpm commandthing logs
pnpm commandthing uninstall
```

The installer packages the feeder, tunnel, device helper, and legacy dashboard into
`~/.commandthing/runtime/<version>`, so launchd never depends on the checkout path. Agents use the
`com.commandthing.feeder` and `com.commandthing.tunnel` labels. Installation removes labels from
the pre-rename `com.carthing.*` version to prevent port conflicts. Logs are written under
`~/.commandthing/logs`; `pnpm commandthing logs` follows both files.

Advanced device investigations are also CLI-owned:

```bash
pnpm commandthing diagnostics layers
pnpm commandthing diagnostics eval 'location.href'
pnpm commandthing diagnostics crash-watch 20 15 baseline
pnpm commandthing diagnostics crash-monitor 120 60
pnpm commandthing diagnostics parse-dump path/to/dump.dmp
```

## Chromium 69 rules

The device runs a QtWebEngine/Chromium 69-era renderer. The legacy plugin transpiles JavaScript,
but cannot make modern CSS safe.

- Keep Tailwind at version 3.
- Do not use `oklch()` colors.
- Do not use flexbox `gap`; use margins or `space-*`. Grid gap is safe.
- Avoid `:where()` and `:is()`.
- Keep expressions sent through device DevTools ES5-compatible.
- Use the shared Button component instead of raw `<button>` elements.
- Test the production build; Vite development output is not representative.
- Keep all layout usable at 800×480.

The Car Thing wall clock may be years out of date. Anchor relative times to a feeder timestamp such
as `DashboardState.generatedAt` or `UsageSummary.fetchedAt`; never compare server timestamps with
the device's `Date.now()`.

## Validation before committing

```bash
pnpm check
pnpm typecheck
pnpm test
pnpm build
pnpm --filter commandthing pack:check
```

For React changes, also run React Doctor from `apps/dashboard`.

## Adding a workspace package

1. Create the package under `apps/` or `packages/` with a `package.json`.
2. Give internal packages an `@commandthing/*` name.
3. Reference internal dependencies with `workspace:*`.
4. Add root scripts only for common user workflows.
5. Document new ports, config fields, or persistent files.
