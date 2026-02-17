# Release, Signing, and Updates

SimpleServers ships desktop artifacts via Electron Builder and GitHub Actions.

Canonical repository: `https://github.com/dueldev/SimpleServers`

## Workflows

- CI: `.github/workflows/ci.yml`
  - matrix on `ubuntu-latest`, `macos-latest`, `windows-latest`
  - typecheck, build, API integration tests, UI e2e tests, UI live smoke
- Desktop release: `.github/workflows/release-desktop.yml`
  - matrix packaging on macOS/Windows/Linux
  - tag `v*` pushes run publish-enabled packaging
  - tag releases validate required signing/notarization secrets before packaging
  - manual dispatch builds distributables without forced publish

## Local Packaging

Build local distributables:

```bash
npm run desktop:dist
```

Build + publish metadata/artifacts (for release channels):

```bash
npm run desktop:publish
```

Output directory:

- `release/desktop`

Expected desktop artifacts per release:

- Windows: `SimpleServers-Setup-<version>.exe`
- macOS: `SimpleServers-<version>-arm64.dmg`, `SimpleServers-<version>-arm64-mac.zip`
- Linux: `SimpleServers-<version>-x86_64.AppImage`, `SimpleServers-<version>-amd64.deb`
- Updater metadata: `latest.yml`, `latest-mac.yml`, `latest-linux.yml`

## Signing and Notarization Secrets

Set in repository secrets for production signed releases:

- `CSC_LINK`
- `CSC_KEY_PASSWORD`

Required for macOS signed tag releases:

- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`

## Auto-Update Channels

Desktop updates are wired via `electron-updater`.

Requirements for updater availability:

1. Tag releases as `vX.Y.Z`.
2. Ensure `GH_TOKEN` is available in release workflow.
3. Publish artifacts/metadata from the release workflow.

Packaged apps will periodically check for updates and prompt for restart when a new version is downloaded.

## Recommended Release Procedure

1. Run full local verification (`npm run typecheck`, `npm run build`, `npm run test`, `npm run test:ui:live`).
2. Bump version metadata.
3. Push tag `vX.Y.Z`.
4. Confirm signed artifacts and updater metadata were uploaded.
5. Install from artifact and validate update path from previous release.

## Out-Of-Box Smoke Test (Required)

After each tagged release, validate on at least one fresh machine/VM per OS:

1. Install artifact and launch the app.
2. Confirm startup UI appears within `45s`.
3. Verify API health via local endpoint:
   - `GET http://127.0.0.1:4010/health`
4. Verify authenticated endpoint with owner token:
   - `GET /me` with header `x-api-token`.
5. Confirm logs exist and contain boot milestones:
   - `desktop.log` includes `app ready`, `api ready; loading renderer`, `renderer loaded`.
6. Create a server from Instant Launch and verify it starts.

Default log paths:

- macOS: `~/Library/Application Support/SimpleServers/desktop.log`
- Windows: `%APPDATA%/SimpleServers/desktop.log`
- Linux: `${XDG_CONFIG_HOME:-~/.config}/SimpleServers/desktop.log`

## Recent Release Notes

- `v0.5.2`
  - Shipped app-first beginner UX default (`Home`, `Create`, `Share`, `Fix`) with advanced tooling moved behind explicit `Advanced Controls`.
  - Added beginner API capability/status/recovery endpoints (`/system/capabilities`, `/servers/:id/simple-status`, `/servers/:id/simple-fix`).
  - Extended quickstart inputs for wizard-first onboarding (`memoryPreset`, `savePath`, `worldImportPath`).
  - Standardized API error envelope fields (`code`, `message`, optional `details`) with backward-compatible `error` message support.
  - Hardened UI refresh behavior using `Promise.allSettled` + role-gated privileged fetches to prevent viewer-mode hard failures.
  - Re-validated release gates with `typecheck`, `build`, `test:api`, `test:e2e`, and `test:ui:live`.
- `v0.5.1`
  - Fixed repeat Instant Launch failures caused by duplicate default server names (`UNIQUE constraint failed: servers.name`) by auto-resolving quickstart names.
  - Added explicit duplicate-name conflict handling for manual server creation with a user-facing `409` response.
  - Added a live usability smoke workflow (`npm run test:ui:live`) that validates desktop and mobile view switching against real API/web services.
- `v0.5.0`
  - Reworked dashboard flow with Focus-vs-Full layout mode to reduce first-run clutter and improve navigation clarity.
  - Added Playit secret setup API (`POST /tunnels/:id/playit/secret`) and UI wiring for no-shell tunnel authentication.
  - Added diagnostics quick-fix `set_playit_secret` and strengthened guided recovery for unresolved endpoint states.
  - Improved Playit endpoint resolution reliability by persisting remote tunnel identity metadata for better multi-tunnel matching.
  - Completed a full market-driven UX/functionality pass informed by Prism Launcher, SquidServers, playit.gg, and other control-plane references.
  - Re-validated with `typecheck`, API integration tests, e2e tests, web build, and desktop build.
- `v0.4.1`
  - Completed a full hardening pass across API/web/desktop release flows before tagging.
  - Made command-palette actions connection-aware to prevent invalid action execution while disconnected.
  - Hardened advanced editor snapshot UX for edge cases where file inventories become empty or file loads fail.
  - Expanded quick-host diagnostics validation to assert both `restart_tunnel` and `go_live_recovery` fix paths.
  - Re-ran full verification suite including desktop build (`typecheck`, `test:api`, `test:e2e`, `build`, `desktop:build`).
- `v0.4.0`
  - Added a new `Next Best Action` panel in Overview so non-technical users always have one recommended next step.
  - Added global Quick Actions command palette (`Ctrl/Cmd + K` / `/`) for fast navigation and one-click operations.
  - Added full-file snapshot history + rollback controls in Advanced editor for safer config editing across all editable files.
  - Added stronger quick-host diagnostics recovery fixes (`restart_tunnel`, `go_live_recovery`) for unresolved Playit tunnel states.
  - Refined visual hierarchy and interaction flow to reduce dead-end navigation during setup/start/publish journeys.
- `v0.3.1`
  - Added multi-server bulk actions (`start`, `stop`, `restart`, `backup`, `goLive`) with per-server success/failure summaries.
  - Added per-server Performance Advisor endpoint/UI with RAM/CPU snapshots, startup trend analysis, and tick-lag detection hints.
  - Added `/system/trust` and a new Trust dashboard view for build signature/provenance visibility plus active security control transparency.
  - Added persisted performance/startup/tick-lag telemetry tables with rolling retention pruning.
- `v0.2.2`
  - Added a command-center overview with two primary actions (`Create Server`, `Go Live`) and goal-first cards (`Start`, `Share`, `Fix`).
  - Added Network Health panel + diagnostics fix metadata so dependency/auth/endpoint/retry issues now have one-click recovery actions.
  - Added Crash Doctor runbook with automated recovery path: repair core files, rollback latest config snapshot, and safe restart.
  - Added API-backed config snapshot history (`editor/file/snapshots`) and rollback endpoint (`editor/file/rollback`).
  - Added global Beginner/Advanced mode switch, persistent theme system, and accessibility improvements (focus paths / keyboard-friendly controls).
  - Improved Playit endpoint matching logic to avoid unresolved tunnel states when run data omits explicit local-port fields.
- `v0.2.1`
  - Added a first-run Startup Wizard and simpler action flow for non-technical operators.
  - Added public-hosting diagnostics endpoint + UI (`dependency`, `auth`, `endpoint`, `retry`) to reduce unresolved tunnel guesswork.
  - Added guided `server.properties` form editing and per-save rollback snapshots in the Manage workspace.
  - Added crash-recovery helper actions, including one-click core-file repair and support-bundle export.
  - Added local UX telemetry events/funnel metrics for onboarding conversion analysis.
- `v0.2.0`
  - Finalized roadmap scope for `v0.2.0` with validated live WebSocket console, setup presets, safer restore snapshots, and config diff editing.
  - Added log stream state/reconnect UX so console streaming remains reliable during transient socket drops.
  - Improved guided setup for non-technical operators with preset cards and clearer one-click flow language.
  - Surfaced restore safety snapshot IDs in UI notices and added explicit restore confirmation guardrails.
  - Expanded API/e2e test coverage for presets, restore safety snapshots, and editor diff previews.
- `v0.1.14`
  - Added Playit tunnel endpoint synchronization so dashboard/public-hosting status can resolve real assigned public addresses.
  - Added safer quick-hosting state behavior so unresolved placeholders remain pending instead of presenting as final endpoints.
  - Improved dashboard UX with server search/filter, hosting journey guidance, and stronger visual interactions.
  - Optimized Playit status refresh logic to avoid heavyweight binary installation attempts during status polling.
- `v0.1.13`
  - Added API and UI support for deleting servers, including runtime/tunnel shutdown and cleanup of local server files/backups.
  - Added new in-app file-browser endpoints for editable text configs and wired them into the Advanced workspace editor.
  - Improved server-file editing UX with searchable file index, unsaved-change protection, and save/revert controls.
  - Expanded setup UX with a server library panel for easier multi-server management.
  - Updated dashboard visual design for stronger hierarchy and clearer control states.
- `v0.1.12`
  - Hardened API JSON parsing so empty-body JSON lifecycle actions are accepted safely instead of failing before route handlers.
  - Added server existence validation on stop actions.
  - Added guided setup recipes for crossplay/modded/non-premium workflows.
  - Added auto-refresh of tunnel status while pending and a dedicated troubleshooting panel in the Manage workspace.
  - Expanded onboarding/install guidance coverage for common hosting flows.
- `v0.1.11`
  - Fixed dashboard POST behavior for bodyless actions (for example `Stop`) by omitting `content-type: application/json` when no request body is sent.
  - Added clearer status visibility and action guardrails (connection state, server status badges, disabled invalid lifecycle actions).
  - Added explicit quick-host tunnel pending/running feedback and stronger empty-state guidance.
  - Added setup-flow reference notes for future onboarding UX improvements.
- `v0.1.10`
  - Reworked web dashboard IA into focused views (`Overview`, `Setup`, `Manage`, `Content`, `Advanced`).
  - Added progressive disclosure with a Power mode toggle so first-time users are not overloaded by advanced controls.
  - Added persistent active-server context and quick actions to reduce navigation friction.
  - Updated e2e flow coverage for the new navigation model.
- `v0.1.9`
  - Fixed packaged desktop renderer asset path resolution by using a relative web build base (`./`), preventing blank windows on macOS DMG installs.
