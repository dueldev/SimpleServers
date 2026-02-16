# SimpleServers

SimpleServers is an open-source, local-first Minecraft server hosting and administration platform.

It is designed as a stronger open alternative to closed desktop hosts: fast setup, safer operations, and richer owner tooling.

Latest stable desktop release: `v0.4.0`

- Releases: `https://github.com/charlesshaw3/SimpleServers/releases`
- Current release: `https://github.com/charlesshaw3/SimpleServers/releases/tag/v0.4.0`

## Production Features

- Local control plane with RBAC, audit trail, and persistent state.
- Server provisioning for `Vanilla`, `Paper`, and `Fabric`.
- Setup presets for survival, modded, and minigame deployments.
- Live WebSocket console plus preflight startup diagnostics.
- File editor with config diff preview.
- Backups, pre-restore safety snapshots, retention policies, and prune jobs.
- Alerts for crash, memory, CPU, and disk conditions.
- Managed Java runtime bootstrap for first-run provisioning without local Java setup.
- Hardware-aware quick-start memory sizing and GC-tuned JVM launch flags for better cross-platform efficiency.
- Content manager with Modrinth and CurseForge search/install/update flows.
- Multi-user management with owner token rotation workflows.
- Remote-control mode with hardened non-local access defaults.
- Structured crash bundles for postmortem/debug workflows.
- One-click quick public hosting with no-router-setup flow (plus tunnel providers: `manual`, `playit`, `cloudflared`, `ngrok`).
  - `playit` dependency bootstraps automatically on Linux/Windows and via Homebrew on macOS when available.
- One-click Instant Launch flow: create + provision + start + quick-host in a single action.
- Simplified, progressive dashboard UX with focused views (`Overview`, `Setup`, `Manage`, `Content`, `Advanced`).
- Guided setup preset cards with plain-language recommendations for non-technical hosts.
- Startup Wizard flow for first-run operators (`Create -> Start -> Publish`).
- Command Center workflow with two primary CTAs (`Create Server`, `Go Live`) for non-technical operators.
- Goal-first operation cards (`Start`, `Share`, `Fix`) to reduce dead-end paths.
- Network Health panel with one-click fix actions for dependency/auth/endpoint/retry states.
- Crash Doctor runbook with guided actions (repair core files, rollback config snapshots, safe restart).
- Public-hosting diagnostics with explicit dependency/auth/endpoint checks and retry countdown.
- Simple `server.properties` form editor with per-save rollback snapshots.
- One-click support bundle export for startup/crash troubleshooting.
- Local UX funnel telemetry (`connect -> create -> start -> public-ready`) for product iteration.
- Global `Beginner`/`Advanced` mode switch and a multi-theme system (`Colorful`, `Dark`, `Light`, `System`).
- Multi-server bulk operations for lifecycle, backups, and one-click `Go Live` across selected servers.
- Per-server Performance Advisor with RAM/CPU trend snapshots, tick-lag detection, startup trend hints, and guided recommendations.
- In-app Trust workspace with signed-build status, security transparency controls, and verification link surface.
- Quick Actions command palette (`Ctrl/Cmd + K` or `/`) for goal-first navigation and one-click operations.
- Next Best Action panel in Overview with a single recommended step for non-technical operators.
- File snapshot history + rollback in Advanced editor for all editable text files.
- Enhanced tunnel diagnostics recovery actions (`Restart Tunnel Agent`, `Run Go Live Recovery`) for unresolved Playit states.
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

### Download prebuilt desktop app

From the GitHub release page, install the artifact for your OS:

- Windows: `SimpleServers-Setup-<version>.exe`
- macOS (Apple Silicon): `SimpleServers-<version>-arm64.dmg`
- Linux:
  - `SimpleServers-<version>-x86_64.AppImage`
  - `SimpleServers-<version>-amd64.deb`

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

## Desktop Startup Notes

- On first launch, the desktop app boots an embedded API and then loads the UI.
- A startup screen is shown while services initialize.
- The app writes startup diagnostics to a desktop log for fast triage.
- `v0.4.0` adds Quick Actions command palette UX, Next Best Action guidance, full-file snapshot rollback in Advanced editor, and stronger quick-host recovery actions.
- `v0.3.1` adds multi-server bulk operations, a per-server Performance Advisor, and a new Trust workspace for build/security transparency.
- `v0.2.2` adds a command-center overview (`Create Server`, `Go Live`), goal-first cards, network-health one-click fixes, Crash Doctor runbook automation, global beginner/advanced modes, persistent themes, and API-backed config snapshot rollback.
- `v0.2.1` adds first-run startup wizard UX, public-hosting diagnostics, guided config editing with snapshots, crash-recovery helper actions, support bundle export, and local onboarding funnel telemetry.
- `v0.2.0` finalizes the roadmap milestone for live WebSocket console UX, setup presets, safer restore snapshots, and config diff editing.
- `v0.1.14` adds Playit endpoint syncing, public-address pending behavior, and more guided hosting UX.
- `v0.1.13` adds full multi-server delete management and in-app text-safe file browser/edit endpoints.
- `v0.1.12` hardens API JSON parsing for empty-body action calls, adds guided setup recipes, and adds runtime troubleshooting guidance.
- `v0.1.11` fixes empty-body POST action failures and adds clearer live status/tunnel UX for easier server operations.
- `v0.1.10` adds guided dashboard navigation and progressive disclosure for advanced controls while keeping all server tooling available.
- `v0.1.9` fixed a packaged desktop renderer path issue that could show a blank window on macOS when launched from the DMG install.

Desktop log locations:

- macOS: `~/Library/Application Support/SimpleServers/desktop.log`
- Windows: `%APPDATA%/SimpleServers/desktop.log`
- Linux: `${XDG_CONFIG_HOME:-~/.config}/SimpleServers/desktop.log`

Embedded API log locations:

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
- `docs/ARCHITECTURE.md` architecture and security/runtime model
- `docs/RELEASE.md` release, signing, and update-channel operations
- `docs/ROADMAP.md` implemented roadmap and post-1.0 track
- `docs/UX_RESEARCH.md` UX benchmark inputs and release implementation mapping

## Security Notes

- Non-local API requests are denied unless remote mode is explicitly enabled.
- For remote mode, set strict allowed origins and a strong remote token.
- Rotate owner/user API tokens in shared environments.
- Use `allowCracked`/offline mode only with explicit trust assumptions.

## Legal

- SimpleServers is not affiliated with Mojang or Microsoft.
- Follow Minecraft usage and distribution guidelines.

## License

MIT. See `LICENSE`.
