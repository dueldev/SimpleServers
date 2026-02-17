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
- `POST /setup/sessions` (`admin`)
- `POST /setup/sessions/:id/launch` (`admin`, single-use setup launch)
- `POST /policy/server-create-preview`
- `GET /system/java`
- `GET /system/java/channels`
- `GET /system/status`
- `GET /system/hardware`
- `GET /system/trust`
- `POST /system/trust/verify-checksum` (`admin`)
- `GET /system/reliability?hours=<1-720>&serverId=<optional>`
- `GET /system/bedrock-strategy`
- `GET /system/hardening-checklist`
- `GET /system/capabilities`

`GET /setup/presets` returns guided setup profiles:

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
- `POST /servers/bulk-action` (`admin`, actions: `start`, `stop`, `restart`, `backup`, `goLive`, `delete`)
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
- `GET /servers/:id/simple-status`
- `GET /servers/:id/workspace-summary` (aggregated workspace state for v2 shell)
- `GET /servers/:id/performance/advisor?hours=<1-336>`
- `POST /servers/:id/preflight/repair-core` (`admin`, requires stopped server)
- `GET /servers/:id/support-bundle`
- `GET /servers/:id/log-stream` (websocket; auth via `Sec-WebSocket-Protocol: ss-token.<base64url-token>` or query `token`)

`GET /servers/:id/workspace-summary` includes:

- server identity/status/visibility
- local + invite address
- player list counts and capacity
  - compatibility fields: `players.list`, `players.online`, `players.known`, `players.capacity`
  - additive fields: `players.onlineList`, `players.knownList`
- metrics (CPU peak, RAM peak, uptime, alerts, crashes, startup trend)
- tunnel summary state
- preflight status
- primary action model (`start_server | go_live | copy_invite`)

`POST /servers/quickstart` defaults:

- preset `survival`
- type `paper` (or `fabric` for `modded` preset)
- latest stable Minecraft version for selected type
- port `25565`
- `startServer=true`
- `publicHosting=true`
- `publicHosting` provider defaults to `playit` unless overridden in server hosting settings

Optional quickstart inputs:

- `memoryPreset`: `small` | `recommended` | `large`
- `savePath`: parent directory where server folder should be created
- `worldImportPath`: local world folder to import into the new server

## File Editing

- `GET /servers/:id/editor/files`
- `GET /servers/:id/editor/file?path=<relativePath>`
- `PUT /servers/:id/editor/file` (`admin`)
- `GET /servers/:id/editor/file/snapshots?path=<relativePath>&limit=<1-100>`
- `POST /servers/:id/editor/file/rollback` (`admin`, restore latest or specific snapshot)
- `POST /servers/:id/editor/file/diff`

Legacy file-specific routes are still supported:

- `GET /servers/:id/files/:fileName`
- `PUT /servers/:id/files/:fileName` (`admin`)
- `POST /servers/:id/files/:fileName/diff`

## Backups

- `GET /servers/:id/backups`
- `POST /servers/:id/backups` (`moderator`)
- `POST /servers/:id/backups/:backupId/restore` (`admin`, requires stopped server)
- `GET /servers/:id/cloud-backup-destinations`
- `POST /servers/:id/cloud-backup-destinations` (`admin`)
- `PUT /servers/:id/cloud-backup-destinations/:destinationId` (`admin`)
- `DELETE /servers/:id/cloud-backup-destinations/:destinationId` (`admin`)
- `GET /servers/:id/cloud-backups`
- `POST /servers/:id/backups/:backupId/upload-cloud` (`moderator`)
- `POST /servers/:id/cloud-backups/:artifactId/restore` (`admin`, requires stopped server)
- `GET /servers/:id/backup-policy`
- `PUT /servers/:id/backup-policy` (`admin`)
- `POST /servers/:id/backup-policy/prune-now` (`admin`)

## Player Administration

- `GET /servers/:id/player-admin?limit=<1-400>`
- `POST /servers/:id/player-admin/action` (`moderator`; action: `op | deop | whitelist | unwhitelist | ban | unban`)
- `POST /servers/:id/players/op` (`moderator`)
- `POST /servers/:id/players/op/remove` (`moderator`)
- `POST /servers/:id/players/whitelist` (`moderator`)
- `POST /servers/:id/players/whitelist/remove` (`moderator`)
- `POST /servers/:id/players/ban` (`moderator`)
- `POST /servers/:id/players/unban` (`moderator`)
- `POST /servers/:id/players/ban-ip` (`moderator`)
- `POST /servers/:id/players/unban-ip` (`moderator`)

`GET /servers/:id/player-admin` includes:

- `profiles[]` with `isOp`, `isWhitelisted`, `isBanned`, `lastSeenAt`, `lastActionAt`
- additive fields: `onlinePlayers[]`, `capacity`
- backward-compatible lists (`ops`, `whitelist`, `bannedPlayers`, `bannedIps`, `history`, `knownPlayers`)

## Quick Public Hosting

- `POST /servers/:id/public-hosting/quick-enable` (`admin`)
- `GET /servers/:id/public-hosting/status`
- `GET /servers/:id/public-hosting/settings`
- `PUT /servers/:id/public-hosting/settings` (`admin`)
- `GET /servers/:id/public-hosting/diagnostics`
- `POST /tunnels/:id/playit/secret` (`admin`)

Behavior notes:

- New servers default to `autoEnable=true` and `defaultProvider=playit`.
- Start/restart/go-live flows auto-ensure preferred provider tunnel when auto-enable is set.
- Playit quick-host enable requires consent for current consent version.
- Diagnostics payload includes auth handoff hints for Playit:
  - `authRequired`, `authUrl`, `authCode`, `authObservedAt`
- Diagnostics also include `legal` links for Playit terms/privacy and consent version.

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
- `GET /audit/export?format=<json|csv>&limit=<1-5000>`

## UX Telemetry

- `POST /telemetry/events`
- `GET /telemetry/funnel?hours=<1-720>` (`admin`)

## Tunnels

- `GET /tunnels`
- `POST /tunnels` (`admin`)
- `POST /tunnels/:id/start` (`moderator`)
- `POST /tunnels/:id/stop` (`moderator`)

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
- `POST /servers/:id/packages/install-batch` (`admin`, sequential non-fail-fast batch install with partial-success summary)
- `POST /servers/:id/packages/:packageId/update` (`admin`)
- `DELETE /servers/:id/packages/:packageId` (`admin`)

Batch install request shape:

- `items[]`: `{ provider?: "modrinth" | "curseforge", projectId: string, kind: "plugin", requestedVersionId?: string }`

Batch install response shape:

- `summary`: `{ total, succeeded, failed }`
- `results[]`: `{ projectId, provider, ok, install?, error? }`

## Modpack Workflows

- `POST /servers/:id/modpack/plan` (`admin`)
- `POST /servers/:id/modpack/import` (`admin`)
- `POST /servers/:id/modpack/:packageId/update` (`admin`)
- `GET /servers/:id/modpack/rollbacks`
- `POST /servers/:id/modpack/rollback` (`admin`, requires stopped server)

## Migration Imports (`admin`)

- `GET /migration/imports`
- `POST /migration/import/manual`
- `POST /migration/import/platform-manifest` (canonical platform-manifest import route)
- `POST /migration/import/manifest` (compatibility alias)

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
