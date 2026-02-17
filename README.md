# SimpleServers

SimpleServers is an open-source, local-first Minecraft server hosting and administration platform.

Latest stable desktop release: `v0.5.4`

- Releases: `https://github.com/dueldev/SimpleServers/releases`
- Current release: `https://github.com/dueldev/SimpleServers/releases/tag/v0.5.4`

## Production Highlights

- Desktop-first v2 IA with three explicit contexts:
  - `Servers` list/search/create
  - `Setup Wizard` (5-step guided flow)
  - `Server Workspace` tabbed operations (`Dashboard`, `Console`, `Players`, `Backups`, `Scheduler`, `Settings`)
- Backward-compatible legacy workspace fallback behind v2 shell flag.
- Setup session contract for deterministic wizard launches:
  - `POST /setup/sessions`
  - `POST /setup/sessions/:id/launch`
- Aggregated workspace model for cleaner UI composition:
  - `GET /servers/:id/workspace-summary`
- Provisioning for `Vanilla`, `Paper`, and `Fabric` with guided presets.
- Managed Java bootstrap and hardware-aware memory sizing.
- Live WebSocket console, preflight diagnostics, safe-restart, and support bundle export.
- One-click quick hosting (`playit`, `manual`, `cloudflared`, `ngrok`) with diagnostics and guided recovery actions.
- Backups with pre-restore safety snapshot, retention policy, cloud destinations, and verified cloud restore.
- Content manager with Modrinth/CurseForge install/update plus modpack plan/import/rollback.
- Player admin flows (ops/whitelist/player+IP bans/history).
- Reliability and trust surfaces (performance advisor, reliability dashboard, trust report, checksum verification, audit export).
- Local-first security model with RBAC tokens, audit trail, and optional hardened remote-control mode.

## Ship Status

- API, web dashboard, and desktop app compile and run.
- API integration tests and Playwright e2e tests are included.
- CI runs typecheck/build/tests across Linux, macOS, and Windows.
- Release workflow supports signing/notarization secrets and tag-based publish.

## Stack

- API: `Node.js`, `TypeScript`, `Fastify`, `SQLite`
- Web: `React`, `TypeScript`, `Vite`
- Desktop: `Electron`, `electron-builder`, `electron-updater`
- Tests: `Vitest`, `Playwright`

## Getting Started

### Prerequisites

- Node.js `20+`
- Java runtime optional (managed runtime can be provisioned automatically)

### Install

```bash
npm install
```

### Run API + web

```bash
npm run dev
```

- API: `http://127.0.0.1:4010`
- Web: `http://127.0.0.1:5174`

### Run desktop

```bash
npm run desktop:dev
```

### Build

```bash
npm run build
npm run desktop:dist
```

Desktop artifacts are written to `release/desktop`.

## Test Commands

```bash
npm run typecheck
npm run test:api
npm run test:e2e
npm run test:ui:live
```

## Recent Release Notes

- `v0.5.4`
  - Added v2 shell architecture (`Servers -> Setup Wizard -> Workspace`) with modular frontend feature layout.
  - Added setup session APIs and single-use launch handoff.
  - Added workspace summary API for aggregated dashboard/workspace composition.
  - Added post-launch wizard progress/success handoff states.
  - Added integration coverage for setup sessions and workspace summary.
- `v0.5.3`
  - Added encrypted cloud backup destinations and restore verification telemetry.
  - Added first-class player administration and modpack lifecycle tooling.
  - Added trust checksum verification, audit export, and reliability/hardening dashboards.

## Auth Defaults

Default owner token on first start:

```txt
simpleservers-dev-admin-token
```

Set secure tokens for non-dev usage:

```bash
export SIMPLESERVERS_ADMIN_TOKEN='replace-this'
export SIMPLESERVERS_REMOTE_TOKEN='replace-this-too'
```

## Log Paths

Desktop logs:

- macOS: `~/Library/Application Support/SimpleServers/desktop.log`
- Windows: `%APPDATA%/SimpleServers/desktop.log`
- Linux: `${XDG_CONFIG_HOME:-~/.config}/SimpleServers/desktop.log`

Embedded API logs:

- macOS: `~/Library/Application Support/SimpleServers/api.log`
- Windows: `%APPDATA%/SimpleServers/api.log`
- Linux: `${XDG_CONFIG_HOME:-~/.config}/SimpleServers/api.log`

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
- `docs/ARCHITECTURE.md` architecture and runtime/security model
- `docs/RELEASE.md` release, signing, and update-channel operations
- `docs/ROADMAP.md` delivered roadmap and next track
- `docs/UX_RESEARCH.md` UX benchmark inputs and implementation mapping

## Legal

- SimpleServers is not affiliated with Mojang or Microsoft.
- Follow Minecraft usage and distribution guidelines.

## License

MIT. See `LICENSE`.
