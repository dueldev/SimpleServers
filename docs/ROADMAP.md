# Roadmap

## Status

All roadmap milestones through `v1.0.0` are implemented in this repository and validated by local build/tests.

## Implemented in v0.2.0

- Live WebSocket console in dashboard.
- Server setup presets (`custom`, `survival`, `modded`, `minigame`).
- Safer restore workflow with automatic pre-restore snapshot.
- Config diff viewer for server file edits.

## Implemented in v0.3.0

- Modrinth and CurseForge package browser/install/update tracking.
- Backup retention policies with scheduled pruning jobs.
- CPU, memory, and disk alerting.
- Java runtime channels and runtime update signals.

## Implemented in v0.4.0

- Multi-user onboarding and owner-only token rotation workflows.
- Optional remote-control mode with hardened non-local defaults.
- Startup preflight diagnostics for plugin/mod conflicts and required files.
- Structured crash report bundles for issue filing.

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
- Added research-backed SquidServers parity notes and implementation mapping.

## Implemented in v0.1.12

- Hardened API JSON parsing to accept empty-body JSON lifecycle action calls safely.
- Added explicit stop-action validation for missing servers.
- Added recipe-driven setup shortcuts for crossplay, modded, and non-premium flows.
- Added tunnel pending auto-refresh and contextual troubleshooting guidance in Manage.
- Expanded SquidServers parity research coverage for onboarding/install and common-flow support.

## Next Track (Post-1.0)

- Provider-level dependency graph resolution for mod/plugin compatibility.
- Optional remote multi-factor auth for internet-exposed control planes.
- Deeper server performance profiling (tick time, chunk loading, plugin timings).
- Backup encryption-at-rest and external object storage targets.
