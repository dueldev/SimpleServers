# SimpleServers

SimpleServers is an open-source, local-first Minecraft server hosting and administration platform.

It is designed as a stronger open alternative to closed desktop hosts: fast setup, safer operations, and richer owner tooling.

## Production Features

- Local control plane with RBAC, audit trail, and persistent state.
- Server provisioning for `Vanilla`, `Paper`, and `Fabric`.
- Setup presets for survival, modded, and minigame deployments.
- Live WebSocket console plus preflight startup diagnostics.
- File editor with config diff preview.
- Backups, pre-restore safety snapshots, retention policies, and prune jobs.
- Alerts for crash, memory, CPU, and disk conditions.
- Managed Java runtime bootstrap for first-run provisioning without local Java setup.
- Content manager with Modrinth and CurseForge search/install/update flows.
- Multi-user management with owner token rotation workflows.
- Remote-control mode with hardened non-local access defaults.
- Structured crash bundles for postmortem/debug workflows.
- One-click quick public hosting with no-router-setup flow (plus tunnel providers: `manual`, `playit`, `cloudflared`, `ngrok`).
  - `playit` dependency bootstraps automatically on Linux/Windows and via Homebrew on macOS when available.
- One-click Instant Launch flow: create + provision + start + quick-host in a single action.
- Desktop app packaging with release update channels.

## Ship Status

- API, web dashboard, and desktop app compile and run.
- API integration tests and Playwright e2e tests are included.
- CI runs typecheck/build/tests across Linux, macOS, and Windows.
- Release workflow supports signing/notarization secrets and tag-based publish.

## Stack

- API: `Node.js`, `TypeScript`, `Fastify`, `SQLite`
- Web UI: `React`, `TypeScript`, `Vite`
- Desktop: `Electron`, `electron-builder`, `electron-updater`
- Tests: `Vitest`, `Playwright`

## Getting Started

### Prerequisites

- Node.js `20+`
- Java runtime optional. If missing, SimpleServers auto-downloads a managed Temurin runtime on first server provision.

### Install

```bash
npm install
```

### Run API + web in development

```bash
npm run dev
```

- API: `http://127.0.0.1:4010`
- Web: `http://127.0.0.1:5174`
- First server provision may take longer because server binaries and a managed Java runtime can be downloaded automatically.
- First quick-host run may take longer because tunnel binaries can be auto-provisioned.

### Run desktop in development

```bash
npm run desktop:dev
```

### Build API + web

```bash
npm run build
```

### Build desktop distributables

```bash
npm run desktop:dist
```

Artifacts are written to `release/desktop`.

### Publish desktop release artifacts (tag/release flow)

```bash
npm run desktop:publish
```

## Tests

```bash
npm run test:api
npm run test:e2e
```

## Auth and Defaults

Default owner token on first start:

```txt
simpleservers-dev-admin-token
```

Set secure tokens for non-dev usage:

```bash
export SIMPLESERVERS_ADMIN_TOKEN='replace-this'
export SIMPLESERVERS_REMOTE_TOKEN='replace-this-too'
```

## Configuration

- `SIMPLESERVERS_HOST` default `127.0.0.1`
- `SIMPLESERVERS_PORT` default `4010`
- `SIMPLESERVERS_DATA_DIR` default `./data`
- `SIMPLESERVERS_ADMIN_TOKEN` default `simpleservers-dev-admin-token`
- `SIMPLESERVERS_REMOTE_ENABLED` default `0`
- `SIMPLESERVERS_REMOTE_TOKEN` optional, required for secure remote mode
- `SIMPLESERVERS_REMOTE_ALLOWED_ORIGINS` optional CSV list
- `CURSEFORGE_API_KEY` optional, required for CurseForge operations

## Docs

- `docs/API.md` endpoint reference
- `docs/ARCHITECTURE.md` architecture and security/runtime model
- `docs/RELEASE.md` release, signing, and update-channel operations
- `docs/ROADMAP.md` implemented roadmap and post-1.0 track

## Security Notes

- Non-local API requests are denied unless remote mode is explicitly enabled.
- For remote mode, set strict allowed origins and a strong remote token.
- Rotate owner/user API tokens in shared environments.
- Use `allowCracked`/offline mode only with explicit trust assumptions.

## Legal

- SimpleServers is not affiliated with Mojang, Microsoft, or SquidServers.
- Follow Minecraft usage and distribution guidelines.

## License

MIT. See `LICENSE`.
