# Contributing

CommandThing uses Node.js 22 or newer and pnpm. Install dependencies and run the full local check:

```bash
corepack enable
pnpm install
pnpm check
pnpm typecheck
pnpm test
pnpm build
pnpm --filter commandthing pack:check
```

Keep user-facing operations in the `commandthing` CLI. Root package scripts are for development,
testing, and packaging only; do not add a top-level `scripts/` directory or require Bun.

Hardware-facing changes must remain compatible with the Car Thing's Chromium 69 renderer and be
tested at 800×480. Service lifecycle changes should preserve an existing installation when setup or
health validation fails.

See [Development](docs/development.md), [Architecture](docs/architecture.md), and
[Publishing](docs/publishing.md) for the detailed workflows.
