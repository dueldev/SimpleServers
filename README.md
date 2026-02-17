# SimpleServers

SimpleServers is an open-source, local-first Minecraft server hosting and administration platform.

Latest stable desktop release: `v0.5.8`

- Releases: `https://github.com/dueldev/SimpleServers/releases`
- Current release: `https://github.com/dueldev/SimpleServers/releases/tag/v0.5.8`

## Production Highlights

- Desktop-first v2 IA with three explicit contexts:
  - `Servers` list/search/create
  - `Setup Wizard` (5-step guided flow)
  - `Server Workspace` tabbed operations (`Dashboard`, `Console`, `Players`, `Plugins`, `Backups`, `Scheduler`, `Settings`)
- v2 Servers operations hub with row + bulk actions (`Start`, `Stop`, `Restart`, `Backup`, `Go Live`, `Delete`) and typed hard-delete confirmation.
- Desktop-only `Open Folder` actions in v2 via Electron IPC bridge.
- Backward-compatible legacy workspace fallback behind v2 shell flag.
- Setup session contract for deterministic wizard launches:
  - `POST /setup/sessions`
  - `POST /setup/sessions/:id/launch`
- Aggregated workspace model for cleaner UI composition:
  - `GET /servers/:id/workspace-summary`
- Provisioning for `Vanilla`, `Paper`, and `Fabric` with guided presets.
- Managed Java bootstrap and hardware-aware memory sizing.
- Live WebSocket console, preflight diagnostics, safe-restart, and support bundle export.
- Quick hosting defaults to `playit` on create/start/restart with consent-aware legal notice and diagnostics.
- Optional providers remain available (`manual`, `cloudflared`, `ngrok`) via v2 networking settings.
- Backups with pre-restore safety snapshot, retention policy, cloud destinations, and verified cloud restore.
- Content manager with Modrinth/CurseForge install/update plus modpack plan/import/rollback.
- Workspace `Plugins` tab with Modrinth-first search and one-click multi-select batch install.
- Player admin flows (ops/whitelist/player+IP bans/history) plus clickable cached player profiles with modal actions.
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

- `v0.5.8`
  - Added a stronger v2 Servers operations hub with summary cards, row actions, sticky bulk actions, and typed hard-delete confirmations.
  - Added a dedicated v2 `Plugins` workspace tab with Modrinth-first discovery, plugin compatibility flags, multi-select install, and installed-plugin update/remove controls.
  - Added desktop-only `Open Folder` actions for servers through a secure Electron `openPath` bridge.
  - Added additive API support for batch plugin installs (`POST /servers/:id/packages/install-batch`) and bulk delete in `POST /servers/bulk-action`.
- `v0.5.7`
  - Verified Playit-first quick hosting flow and player-admin action paths through API integration + web e2e + live UI smoke gates.
  - Improved v2 workspace console UX with a larger command composer, Enter-to-send behavior, quick command chips, and clearer send/clear actions.
  - Added small v2 interaction polish for player rows and console readability to reduce friction in day-to-day operations.
- `v0.5.6`
  - Added runtime-derived online-player truth and capacity in v2 workspace/player contracts.
  - Added v2 accessibility pass for dialog focus behavior, ARIA tabs, and skip-link/main landmark navigation.
  - Added vendor-neutral migration naming with canonical `POST /migration/import/platform-manifest`.
- `v0.5.5`
  - Defaulted public hosting to Playit for new servers with persisted provider settings and lifecycle auto-connect.
  - Added Playit legal consent surfaces in setup review and workspace networking settings.
  - Added v2 player profile modal actions from cached players (`op`, `deop`, `whitelist`, `un-whitelist`, `ban`, `unban`).
  - Increased v2 shell spacing/density tokens and panel rhythm to reduce crowded layouts.
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
