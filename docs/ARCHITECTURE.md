# Architecture

SimpleServers is a local-first control plane split into API, web UI, and desktop shell workspaces.

## Components

1. API service (`apps/api`)

- Fastify control plane with token auth and RBAC role checks.
- SQLite persistence for operational state.
- Minecraft process supervision, console streaming, and crash capture.
- Scheduling, alerting, backups, content/package orchestration, and tunnel adapters.

2. Web dashboard (`apps/web`)

- React operator console with v2 shell IA:
  - `Servers`
  - `Setup Wizard`
  - `Server Workspace`
- Workspace tabs: `Dashboard`, `Console`, `Players`, `Plugins`, `Backups`, `Scheduler`, `Settings`.
- v2 `Servers` context is the operations hub for row-level and bulk lifecycle actions, including typed-confirmation hard delete.
- Legacy workspace remains available behind a feature flag fallback.

3. Desktop shell (`apps/desktop`)

- Electron wrapper that embeds API and web assets in one local app.
- Starts API in app-local user data path.
- Exposes desktop-only IPC helpers (for example `openPath`) used by v2 to open local server folders safely.
- Uses `electron-updater` for release-channel update checks in packaged builds.

## Data Model

- `users`: RBAC identities and API tokens.
- `servers`: server metadata and runtime state.
- `audit_logs`: immutable action trail.
- `tasks`: cron-driven automation records.
- `alerts`: open/resolved operational alerts.
- `backups`: backup artifact metadata and restore markers.
- `backup_policies`: retention rules and prune schedules.
- `tunnels`: network exposure definitions and adapter state.
- `server_public_hosting_settings`: per-server tunnel defaults (`auto_enable`, `default_provider`) and consent metadata.
- `user_legal_consents`: provider legal acceptance records by user/version/timestamp.
- `server_packages`: installed mods/plugins/modpacks/resourcepacks.
- `crash_reports`: structured crash bundle references.
- `ux_telemetry_events`: local dashboard funnel telemetry.
- `editor_file_snapshots`: rollback history for in-app config editing.
- `server_performance_samples`: periodic CPU/RAM samples for running servers.
- `server_startup_events`: startup duration + outcome history.
- `server_tick_lag_events`: parsed tick-lag incidents from runtime logs.

## Runtime Flows

1. Provisioning

- UI submits server blueprint (direct create, quickstart, or setup session launch).
- Policy engine evaluates risky settings.
- API resolves version/jar/runtime requirements and writes bootstrap files.

2. Setup session launch

- `POST /setup/sessions` stores a short-lived wizard session payload.
- `POST /setup/sessions/:id/launch` consumes the session once and executes quickstart pipeline.
- Launch returns server, startup, quick-host, and warning state for deterministic handoff.

3. Lifecycle

- Runtime service launches Java process with configured memory limits.
- Console lines stream into in-memory hub and websocket clients.
- Exit events update state, create alerts, and persist crash bundles.
- When public hosting auto-enable is active, preferred tunnel provider is auto-ensured on create/start/restart flows.

4. Startup safety

- Preflight checks run before start.
- Missing core files and plugin/mod conflicts can block startup.
- Warning-level issues emit alerts without hard block.
- Repair helpers can restore missing startup files while server is stopped.

5. Workspace aggregation

- `GET /servers/:id/workspace-summary` provides a normalized view model for v2 shell:
  - server identity/status/visibility
  - addresses
  - player list/counts:
    - online truth derived from runtime join/leave/disconnect events parsed from `logs/latest.log`
    - capacity derived from `server.properties` (`max-players`, fallback `20`)
    - additive compatibility fields for `onlineList` and `knownList`
  - key metrics and startup trend samples
  - tunnel summary state
  - provider defaults and consent metadata
  - preflight state
  - primary action model

6. v2 accessibility behavior

- Setup wizard and player profile modals use shared dialog focus management:
  - focus trap
  - Escape-to-close
  - focus restoration on close
- Workspace tabs implement WAI-ARIA tab semantics (`tablist`/`tab`/`tabpanel`) with Arrow/Home/End keyboard navigation.
- v2 shell includes skip-link and main landmark targeting for keyboard-first navigation.
- Workspace console composer supports Enter-to-send for reduced operator friction during live command workflows.

7. Public hosting consent and diagnostics

- Playit is the default provider for new server quick hosting settings.
- Enabling Playit quick hosting requires current consent version acceptance.
- Diagnostics expose auth handoff hints (`authUrl`, `authCode`) and legal links for provider terms/privacy.

8. Backups and restore

- Backups are tar.gz snapshots of server state.
- Restore always creates a pre-restore safety snapshot first.
- Retention worker prunes by max-count and max-age policy.

9. Content operations

- Search/list versions against Modrinth or CurseForge.
- Compatibility resolution by server type, version, and loader hints.
- Install/update/uninstall mapped to managed paths and tracked in DB.
- Batch plugin install endpoint executes sequentially and returns per-item success/failure for deterministic UI feedback.

10. Remote access hardening

- Non-local requests are denied by default.
- Remote mode must be explicitly enabled.
- Allowed origins and remote token checks gate non-local browser/API flows.

## Security Controls

- `x-api-token` auth + RBAC role hierarchy.
- Optional `x-remote-token` gate for non-local access.
- Editable file allowlist for config writes.
- Audit logging for mutating operations.
- Desktop renderer sandboxing (`contextIsolation=true`, `nodeIntegration=false`).

## Current Constraints

- Token-based auth only (no OIDC/password auth yet).
- Tunnel process adapters rely on local binary availability.
- CurseForge metadata classification is less precise than Modrinth for some project types.
