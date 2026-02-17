# Roadmap

## Status

Current stable milestone: `v0.5.8` (validated by typecheck, build, API integration tests, web e2e, and UI live smoke).

## Implemented in v0.5.8

- Upgraded the v2 `Servers` page into an operations hub:
  - Added summary strip (`total`, `running`, `stopped`, `crashed`) for at-a-glance status.
  - Added row actions (`Workspace`, `Start`, `Stop`, `Restart`, `Open Folder` desktop-only, `Delete`).
  - Added multi-select bulk operations (`Start`, `Stop`, `Restart`, `Backup`, `Go Live`, `Delete`) with sticky action bar.
  - Replaced untyped destructive prompts in v2 with typed hard-delete confirmations for single and bulk delete.
- Added dedicated v2 `Plugins` workspace tab:
  - Modrinth-first plugin discovery/search with featured filter chips.
  - Multi-select one-click install via new batch install API.
  - Installed plugins panel with update/remove actions.
- Added additive API capabilities for v2 workflows:
  - `POST /servers/:id/packages/install-batch`
  - `POST /servers/bulk-action` now supports `delete`
- Added desktop-only folder opening for server roots via Electron IPC (`simpleservers:open-path`) and v2 UI integration.
- Extended v2 spacing/hierarchy polish in server rows, bulk controls, plugin cards, and tab content rhythm.

## Implemented in v0.5.7

- Completed post-release verification pass focused on operational confidence:
  - Playit quick-hosting flows remain green in API integration and web smoke paths.
  - Player-admin profile actions remain green in API and web e2e flows.
- Improved v2 `Console` tab command UX:
  - Larger command composer layout with clearer command affordance.
  - Explicit Enter-to-send interaction for faster command dispatch.
  - Added quick command chips (`list`, `say`, `save-all`, `stop`) and clear action.
- Added small v2 interaction polish:
  - Improved console log readability and command panel spacing.
  - Improved player-row hover clarity in workspace lists.

## Implemented in v0.5.6

- Added real-time online-player truth in workspace contracts:
  - `GET /servers/:id/player-admin` now includes additive `onlinePlayers` and `capacity`.
  - `GET /servers/:id/workspace-summary` now includes additive `players.onlineList` and `players.knownList`.
  - `players.online` and `players.capacity` now derive from runtime log/config state instead of fixed placeholders.
- Added deterministic runtime player-state parsing from `logs/latest.log` for join/leave/disconnect tracking.
- Added capacity resolver from `server.properties` `max-players` with fallback to `20`.
- Added v2 accessibility upgrades:
  - shared accessible dialog focus/escape handling for setup wizard and player profile modal.
  - ARIA-compliant workspace tab semantics with keyboard Arrow/Home/End navigation.
  - v2 skip-link + main landmark targeting, stronger focus-ring/target-size consistency.
- Added canonical migration route:
  - `POST /migration/import/platform-manifest`
  - kept compatibility aliases while shifting v2/legacy user-facing copy to vendor-neutral “Platform Manifest” wording.

## Implemented in v0.5.5

- Defaulted public hosting to Playit for new servers (`autoEnable=1`, `defaultProvider=playit`) with persisted per-server hosting settings.
- Added lifecycle auto-connect for preferred tunnel provider during create/quickstart/start/restart flows.
- Added Playit consent persistence and legal notice surfaces for v2 setup review and workspace networking settings.
- Added diagnostics auth handoff fields (`authRequired`, `authUrl`, `authCode`, `authObservedAt`) and `open_playit_auth` fix path.
- Added profile-aware player admin state and unified player action endpoint:
  - `POST /servers/:id/player-admin/action`
- Added clickable cached player profiles in v2 Players tab and right rail with working modal actions:
  - `op`, `deop`, `whitelist`, `un-whitelist`, `ban`, `unban`
- Increased v2 spacing tokens/padding and reduced crowded layout density in shell, workspace, and wizard surfaces.

## Implemented in v0.5.4

- Shipped v2 information architecture:
  - `Servers` list context
  - `Setup Wizard` context
  - `Server Workspace` tabbed context
- Modularized frontend shell into feature components under `apps/web/src/features/*`.
- Added setup-session API pair for deterministic wizard launch:
  - `POST /setup/sessions`
  - `POST /setup/sessions/:id/launch`
- Added `GET /servers/:id/workspace-summary` for aggregated workspace state.
- Added integration tests for setup sessions and workspace summary.

## Implemented in v0.5.3

- Added encrypted cloud backup destinations with provider support for `S3`, `Backblaze B2 (S3 API)`, and `Google Drive`.
- Added cloud backup artifact restore verification telemetry.
- Added first-class player admin services/UI routes (ops, whitelist, player bans, IP bans, known players, timeline history).
- Added Bedrock strategy endpoint (`/system/bedrock-strategy`).
- Added quick-local hardening guide endpoint (`/system/hardening-checklist`).
- Added modpack workflow endpoints for planning/import/update/rollback.
- Expanded trust API with checksum verification and audit export metadata.
- Added reliability dashboard endpoint (`/system/reliability`).
- Added migration tooling (`/migration/import/manual`, `/migration/import/manifest`, `/migration/imports`).
- Added server terminal command endpoint (`POST /servers/:id/command`).

## Implemented in v0.5.2

- Added beginner-mode capability/status/recovery APIs:
  - `GET /system/capabilities`
  - `GET /servers/:id/simple-status`
  - `POST /servers/:id/simple-fix`
- Extended quickstart payload with `memoryPreset`, `savePath`, and `worldImportPath`.
- Added structured API error envelope and hardened role-aware refresh behavior.

## Implemented in v0.5.1

- Fixed quickstart duplicate-name failures via unique-name auto-resolution.
- Added live UI smoke validation (`npm run test:ui:live`).

## Implemented in v0.5.0

- Added focus-first dashboard behavior and stronger quick-host recovery paths.
- Added Playit secret setup endpoint (`POST /tunnels/:id/playit/secret`).
- Hardened tunnel endpoint matching and diagnostics recovery flows.

## Next Track

- Deeper performance profiling (tick time, chunk loading, plugin timings).
- Optional remote multi-factor auth for internet-exposed control planes.
- Backup encryption-at-rest plus more external object storage adapters.
