# Architecture

SimpleServers is a local-first control plane split into API, web UI, and desktop shell workspaces.

## Components

1. API service (`apps/api`)

- Fastify control plane with token auth and role checks.
- SQLite persistence for operational state.
- Minecraft process supervision, console streaming, and crash capture.
- Scheduling, alerting, backups, content/package orchestration, and tunnel adapters.

2. Web dashboard (`apps/web`)

- React operator console.
- Provisioning, fleet lifecycle operations, package management, and observability views.
- Owner workflows for users, token rotation, remote policy, and retention controls.

3. Desktop shell (`apps/desktop`)

- Electron wrapper that embeds API and web assets in one local app.
- Starts API in app-local user data path.
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
- `server_packages`: installed mods/plugins/modpacks/resourcepacks.
- `crash_reports`: structured crash bundle references.
- `ux_telemetry_events`: local dashboard funnel telemetry for UX conversion analysis.
- `editor_file_snapshots`: API-backed rollback history for in-app config editing.
- `server_performance_samples`: periodic CPU/RAM samples captured for running servers.
- `server_startup_events`: startup duration + outcome history per server.
- `server_tick_lag_events`: parsed tick-lag incidents from runtime logs.

## Runtime Flows

1. Provisioning

- UI submits server blueprint (optionally via preset).
- Policy engine evaluates risky settings.
- API resolves version/jar/runtime requirements and writes server bootstrap files.

2. Lifecycle

- Runtime service launches Java process with configured memory limits.
- Console lines stream into in-memory hub and websocket clients.
- Exit events update state, create alerts, and persist crash bundles.

3. Startup safety

- Preflight checks run before start.
- Missing core files and plugin/mod conflicts can block startup.
- Warning-level issues emit alerts without hard block.
- Repair helpers can restore missing core startup files (`server.jar`, `eula.txt`, `server.properties`) while server is stopped.
- Safe restart flow (`/servers/:id/safe-restart`) enforces stop -> preflight -> start to reduce recovery mistakes.

4. Backups and restore

- Backups are tar.gz snapshots of server state.
- Restore always creates a pre-restore snapshot first.
- Retention worker prunes by max-count and max-age policy.

5. Content operations

- Search/list versions against Modrinth or CurseForge.
- Compatibility resolution by server type, version, and loader hints.
- Install/update/uninstall mapped to managed paths and tracked in DB.

6. Remote access hardening

- Non-local requests are denied by default.
- Remote mode must be explicitly enabled.
- Allowed origins and remote token checks gate non-local browser/API flows.

7. Operator support bundles

- Support bundles are generated on demand from API (`/servers/:id/support-bundle`).
- Bundle payload includes server metadata, preflight state, recent logs, tunnel state, and crash report references.
- Intended for quick escalation/triage without shell access to local data directories.

8. Goal-first hosting flow

- `Go Live` API (`/servers/:id/go-live`) combines lifecycle start + quick-host activation for one-click publishing.
- Tunnel diagnostics expose fix metadata (`fixes`) for one-click recovery actions in the dashboard.
- Crash Doctor UI runbook chains core-file repair, config snapshot rollback, and safe restart actions.

9. Fleet operations

- Bulk server actions (`/servers/bulk-action`) execute lifecycle/backup/publish operations across selected servers.
- Results are returned per server so UI can show partial success without hiding failures.

10. Performance advisor + trust transparency

- Alert monitor samples CPU/RAM on a fixed interval and stores rolling window data.
- Runtime parser captures tick-lag events from console output and startup timings from launch flow.
- Advisor endpoint (`/servers/:id/performance/advisor`) computes trends + recommendation hints for non-expert operators.
- Trust endpoint (`/system/trust`) reports build provenance, signature state, verification links, and active security controls.

11. Non-technical UX acceleration

- Overview includes a `Next Best Action` state machine so first-time operators always get one clear next step.
- Global command palette (`Ctrl/Cmd+K`) exposes goal-first actions across setup, lifecycle, recovery, and trust workflows.
- Advanced file editor now surfaces per-file snapshot history + rollback to reduce config-edit regression risk.
- Tunnel diagnostics include one-click recovery actions (`restart_tunnel`, `go_live_recovery`) for unresolved endpoint states.

12. Playit reliability hardening

- Quick-host diagnostics support a direct Playit secret setup endpoint (`/tunnels/:id/playit/secret`) for no-shell onboarding.
- Playit secret material is stored in local app data (`data/secrets/playit`) and referenced by tunnel config path.
- Tunnel sync now persists remote Playit tunnel identity metadata (ID/internal ID/name) to reduce ambiguous endpoint matching across multi-tunnel accounts.

## Provider Integrations

- Mojang metadata for Vanilla version resolution.
- Paper API for Paper builds.
- Fabric meta API for Fabric installer/server bootstrap.
- Modrinth API for package search/version/install/update.
- CurseForge API for package search/version/install/update (API key required).

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
