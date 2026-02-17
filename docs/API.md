# API Overview

Base URL: `http://127.0.0.1:4010`

## Auth headers

- `x-api-token`: required for protected endpoints.
- `x-remote-token`: required for non-local access when remote-control mode is enabled with token enforcement.

## Error envelope (additive, non-breaking)

Error responses include:

- `code: string`
- `message: string`
- `details?: Record<string, unknown>`
- `error: string` (legacy compatibility field)

## Core

- `GET /health`
- `GET /meta`
- `GET /roles`
- `GET /me`

## Setup, Policy, and System

- `GET /setup/catalog`
- `GET /setup/presets`
- `POST /policy/server-create-preview`
- `GET /system/java`
- `GET /system/java/channels`
- `GET /system/status`
- `GET /system/hardware`
- `GET /system/trust`
- `GET /system/capabilities`

`GET /setup/presets` returns the guided setup profiles:
- `custom`
- `survival`
- `modded`
- `minigame`

## Users (`owner`)

- `GET /users`
- `POST /users`
- `POST /users/:id/rotate-token`

## Servers

- `GET /servers`
- `POST /servers` (`admin`)
- `POST /servers/quickstart` (`admin`, one-call create + optional start + optional quick-host enable)
- `POST /servers/bulk-action` (`admin`, actions: `start`, `stop`, `restart`, `backup`, `goLive`)
- `DELETE /servers/:id?deleteFiles=<bool>&deleteBackups=<bool>` (`admin`, defaults `true/true`)
- `POST /servers/:id/start` (`moderator`)
- `POST /servers/:id/stop` (`moderator`)
- `POST /servers/:id/restart` (`moderator`)
- `POST /servers/:id/safe-restart` (`admin`, stop -> preflight -> start)
- `POST /servers/:id/simple-fix` (`admin`, one-click beginner recovery with deterministic status payload)
- `POST /servers/:id/go-live` (`admin`, one-call start + quick-host tunnel activation)
- `POST /servers/:id/command` (`moderator`)
- `GET /servers/:id/logs`
- `GET /servers/:id/preflight`
- `GET /servers/:id/simple-status` (aggregated beginner status/checklist/primary action)
- `GET /servers/:id/performance/advisor?hours=<1-336>`
- `POST /servers/:id/preflight/repair-core` (`admin`, requires stopped server)
- `GET /servers/:id/support-bundle`
- `GET /servers/:id/log-stream` (websocket; auth via `Sec-WebSocket-Protocol: ss-token.<base64url-token>` or query `token`)

`POST /servers/quickstart` defaults:
- preset `survival`
- type `paper` (or `fabric` for `modded` preset)
- latest stable Minecraft version for selected type
- port `25565`
- `startServer=true`
- `publicHosting=true`

`POST /servers/quickstart` optional beginner-wizard inputs:

- `memoryPreset`: `small` | `recommended` | `large`
- `savePath`: parent directory where server folder should be created
- `worldImportPath`: local world folder to import into the new server

`POST /servers/bulk-action` response includes per-server status results, plus aggregate `total/succeeded/failed`.

`GET /servers/:id/performance/advisor` returns:
- sampled CPU/RAM aggregates for the selected window
- startup duration trend (`improving`, `stable`, `regressing`, `insufficient_data`)
- parsed tick-lag events from runtime logs
- prioritized advisor hints (`ok`, `warning`, `critical`)

## File Editing

- `GET /servers/:id/editor/files` (indexed editable text files)
- `GET /servers/:id/editor/file?path=<relativePath>`
- `PUT /servers/:id/editor/file` (`admin`)
- `GET /servers/:id/editor/file/snapshots?path=<relativePath>&limit=<1-100>`
- `POST /servers/:id/editor/file/rollback` (`admin`, restore latest or specific snapshot)
- `POST /servers/:id/editor/file/diff`

Legacy file-specific routes are still supported:

- `GET /servers/:id/files/:fileName`
- `PUT /servers/:id/files/:fileName` (`admin`)
- `POST /servers/:id/files/:fileName/diff`

Allowed files:

- `server.properties`
- `ops.json`
- `whitelist.json`
- `banned-ips.json`
- `banned-players.json`

`editor/file/snapshots` and `editor/file/rollback` work for any indexed editable text file returned by `editor/files`.

## Backups

- `GET /servers/:id/backups`
- `POST /servers/:id/backups` (`moderator`)
- `POST /servers/:id/backups/:backupId/restore` (`admin`, requires stopped server)
- `GET /servers/:id/backup-policy`
- `PUT /servers/:id/backup-policy` (`admin`)
- `POST /servers/:id/backup-policy/prune-now` (`admin`)

Restore notes:

- `POST /servers/:id/backups/:backupId/restore` always creates a pre-restore safety snapshot first.
- Restore response includes `restore.preRestoreBackupId` so UI flows can surface rollback checkpoints.

## Quick Public Hosting

- `POST /servers/:id/public-hosting/quick-enable` (`admin`)
- `GET /servers/:id/public-hosting/status`
- `GET /servers/:id/public-hosting/diagnostics`

Notes:

- Playit-backed tunnels now synchronize assigned public host/port from Playit run data.
- `publicAddress` remains `null` while Playit is still assigning an endpoint (`pending`/`starting` states).
- diagnostics include command availability, auth status, endpoint assignment state, retry timing metadata, and `fixes` action metadata for one-click UI recovery.
- diagnostics `fixes` can include:
  - `start_server`
  - `start_tunnel`
  - `restart_tunnel`
  - `set_playit_secret`
  - `copy_playit_auth_steps`
  - `refresh_diagnostics`
  - `go_live_recovery`

## Tasks

- `GET /tasks`
- `POST /tasks` (`admin`)
- `POST /tasks/:id/enable` (`admin`)
- `POST /tasks/:id/disable` (`admin`)
- `DELETE /tasks/:id` (`admin`)

## Alerts

- `GET /alerts`
- `POST /alerts/:id/resolve` (`moderator`)

## Audit (`admin`)

- `GET /audit`

## UX Telemetry

- `POST /telemetry/events`
- `GET /telemetry/funnel?hours=<1-720>` (`admin`)

## Tunnels

- `GET /tunnels`
- `POST /tunnels` (`admin`)
- `POST /tunnels/:id/start` (`moderator`)
- `POST /tunnels/:id/stop` (`moderator`)
- `POST /tunnels/:id/playit/secret` (`admin`, stores secret in local app data for Playit endpoint sync)

Providers:

- `manual`
- `playit`
- `cloudflared`
- `ngrok`

## Content Providers (Modrinth / CurseForge)

- `GET /content/search?provider=<modrinth|curseforge>&q=<query>&serverId=<id>&kind=<optional>`
- `GET /content/:provider/projects/:projectId/versions?serverId=<id>&limit=<optional>`

## Server Packages

- `GET /servers/:id/packages`
- `GET /servers/:id/packages/updates`
- `POST /servers/:id/packages/install` (`admin`)
- `POST /servers/:id/packages/:packageId/update` (`admin`)
- `DELETE /servers/:id/packages/:packageId` (`admin`)

## Crash Reports

- `GET /servers/:id/crash-reports`
- `GET /crash-reports/:id` (`admin`)

## Remote Control (`owner`)

- `GET /remote/status`
- `PUT /remote/config`

Remote-control notes:

- Non-local requests are blocked unless remote mode is enabled.
- Allowed origins are enforced for browser-originated remote requests.
- Remote token validation is enforced when `requireToken=true`.
