# Roadmap

## Status

Current stable milestone: `v0.4.0` (validated by local typecheck/tests/build).

## Implemented in v0.4.0

- Added `Next Best Action` guidance panel in Overview for non-technical operators.
- Added global `Quick Actions` command palette (`Ctrl/Cmd + K` or `/`) for direct goal-first actions.
- Added full-file snapshot history + rollback controls in Advanced editor (not just `server.properties` form).
- Added stronger quick-host recovery fixes in diagnostics (`restart_tunnel`, `go_live_recovery`).
- Added multi-user onboarding and owner-only token rotation workflows.
- Added optional remote-control mode with hardened non-local defaults.
- Added startup preflight diagnostics for plugin/mod conflicts and required files.
- Added structured crash report bundles for issue filing.

## Implemented in v0.3.1

- Added multi-server bulk actions (`start`, `stop`, `restart`, `backup`, `go-live`) with per-server result reporting.
- Added per-server Performance Advisor with RAM/CPU trends, startup trend analysis, tick-lag parsing, and actionable hints.
- Added in-app Trust workspace and `/system/trust` API for signing/provenance visibility and security transparency controls.
- Added runtime persistence for advisor data (`server_performance_samples`, `server_startup_events`, `server_tick_lag_events`) with retention pruning.

## Implemented in v0.2.2

- Reworked Overview into a command center with two primary actions (`Create Server`, `Go Live`).
- Added goal-first operation cards (`Start`, `Share`, `Fix`) to reduce tool-hunting for non-technical users.
- Added full per-server Network Health panel with dependency/auth/endpoint/retry states and one-click fix actions.
- Added Crash Doctor guided runbook with auto-actions (repair core files, rollback latest config snapshot, safe restart).
- Added API-backed editor snapshot history + rollback endpoints for reliable config recovery.
- Added global `Beginner`/`Advanced` mode switch and persistent theme system (`Colorful`, `Dark`, `Light`, `System`).
- Hardened Playit endpoint resolution matching to reduce “never resolves” tunnel states.

## Implemented in v0.2.1

- Added first-run Startup Wizard (`Create -> Start -> Publish`) with one-click actions for non-technical users.
- Added public-hosting diagnostics (`/public-hosting/diagnostics`) with dependency/auth/endpoint/retry visibility.
- Added guided `server.properties` form editing with per-save rollback snapshots.
- Added crash-recovery helper actions (repair core startup files, retry start, export support bundle).
- Added local UX telemetry endpoints and dashboard funnel reporting for onboarding conversion tracking.

## Implemented in v0.2.0

- Live WebSocket console in dashboard.
- Server setup presets (`custom`, `survival`, `modded`, `minigame`).
- Safer restore workflow with automatic pre-restore snapshot.
- Config diff viewer for server file edits.
- Added WebSocket stream status + reconnect behavior for more reliable live-console UX.
- Added preset cards and plain-language guided setup copy for less technical operators.
- Added restore UX confirmations and surfaced `preRestoreBackupId` safety checkpoint in UI notices.
- Added integration/e2e validation coverage for presets, restore safety snapshots, and editor diff previews.

## Implemented in v0.3.0

- Modrinth and CurseForge package browser/install/update tracking.
- Backup retention policies with scheduled pruning jobs.
- CPU, memory, and disk alerting.
- Java runtime channels and runtime update signals.

## Implemented in v1.0.0

- Desktop release pipeline with signing/notarization secret support.
- Auto-update channels for packaged desktop releases.
- Expanded tunnel provider support (`manual`, `playit`, `cloudflared`, `ngrok`).
- Policy engine for risky setup guardrails.
- CI matrix across macOS, Windows, and Linux.

## Implemented in v0.1.10

- Reworked dashboard information architecture into focused, task-first views.
- Added progressive disclosure via Power mode for advanced operator tooling.
- Added persistent active-server context and quick actions across views.

## Implemented in v0.1.11

- Fixed bodyless POST action handling to prevent empty JSON body request failures.
- Added stronger lifecycle/tunnel status visibility and guardrails in the dashboard UX.
- Added baseline setup-flow mapping notes to guide onboarding UX improvements.

## Implemented in v0.1.12

- Hardened API JSON parsing to accept empty-body JSON lifecycle action calls safely.
- Added explicit stop-action validation for missing servers.
- Added recipe-driven setup shortcuts for crossplay, modded, and non-premium flows.
- Added tunnel pending auto-refresh and contextual troubleshooting guidance in Manage.
- Expanded onboarding and install guidance for common first-run hosting flows.

## Implemented in v0.1.13

- Added full server deletion workflow (API + dashboard) including runtime/tunnel shutdown and optional file/backup cleanup.
- Added text-safe server file browser API (`editor/files`, `editor/file`, diff endpoint) for faster in-app editing.
- Reworked advanced editor UX with searchable file index, unsaved-change handling, and one-click save/revert.
- Improved setup and server library workflows to make multi-server creation, switching, and deletion easier.
- Refreshed dashboard visual system with stronger hierarchy and improved readability across desktop/mobile.

## Implemented in v0.1.14

- Added Playit endpoint sync logic that refreshes tunnel public host/port from Playit API metadata.
- Added clearer quick-host pending vs ready behavior so unresolved Playit placeholders are no longer shown as final addresses.
- Improved overview/setup UX with server search, hosting journey guidance, and stronger visual feedback.
- Hardened Playit sync behavior to avoid expensive binary install attempts during simple status polling.

## Next Track (Post-1.0)

- Provider-level dependency graph resolution for mod/plugin compatibility.
- Optional remote multi-factor auth for internet-exposed control planes.
- Deeper server performance profiling (tick time, chunk loading, plugin timings).
- Backup encryption-at-rest and external object storage targets.
