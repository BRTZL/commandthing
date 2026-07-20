# Development

## Tooling model

pnpm manages the monorepo and its single `pnpm-lock.yaml`. Bun remains the runtime for the feeder,
device tools, and scripts that use Bun APIs.

Workspace dependencies use `workspace:*`. Add dependencies to the package that imports them rather
than relying on packages hoisted at the root.

## Common commands

| Command | Purpose |
|---|---|
| `pnpm install` | Install every workspace package |
| `pnpm dev` | Run feeder and Vite together |
| `pnpm feeder` | Run the feeder on port 4000 |
| `pnpm feeder:dev` | Run the feeder with Bun watch mode |
| `pnpm ui` | Run only Vite on port 5173 |
| `pnpm build` | Build the Chromium 69 production dashboard |
| `pnpm typecheck` | Type-check the dashboard and feeder |
| `pnpm test` | Run CLI regression tests |
| `pnpm preview` | Build and serve production on port 4000 |
| `pnpm lint` | Lint the repository |
| `pnpm check` | Check formatting and lint without modifying files |
| `pnpm check:write` | Apply safe Biome formatting/fixes |

## Device commands

| Command | Purpose |
|---|---|
| `pnpm device:connect` | Maintain the ADB reverse tunnel |
| `pnpm deploy` | Build and hard-reload the device kiosk |
| `pnpm device:reload` | Reload without rebuilding |
| `pnpm device:shot` | Save a device screenshot |
| `pnpm device:open -- /usage` | Navigate to a route |
| `pnpm device:info` | Print kiosk URL, user agent, and viewport |

Pass script arguments after `--` so pnpm does not consume them.

## launchd development installation

The source checkout includes macOS LaunchAgent helpers:

```bash
pnpm daemon:install
pnpm daemon:logs
pnpm daemon:uninstall
```

The installer generates machine-specific paths at runtime; none are committed. Agents use the
`com.commandthing.feeder` and `com.commandthing.tunnel` labels. Installation removes labels from
the pre-rename `com.carthing.*` version to prevent port conflicts.

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
5. Document new ports, environment variables, or persistent files.
