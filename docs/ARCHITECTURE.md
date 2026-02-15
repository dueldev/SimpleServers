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
