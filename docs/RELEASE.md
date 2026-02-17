# Release, Signing, and Updates

SimpleServers ships desktop artifacts via Electron Builder and GitHub Actions.

Canonical repository: `https://github.com/dueldev/SimpleServers`
Current stable tag: `v0.5.4`

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

## Recommended Release Procedure

1. Run full local verification:
   - `npm run typecheck`
   - `npm run build`
   - `npm run test:api`
   - `npm run test:e2e`
   - `npm run test:ui:live`
2. Bump version metadata.
3. Commit + push `main`.
4. Create and push tag `vX.Y.Z`.
5. Confirm signed artifacts and updater metadata in GitHub release.
6. Install from artifact and validate update path from prior release.

## Out-Of-Box Smoke Test (Required)

After each tagged release, validate on at least one fresh machine/VM per OS:

1. Install artifact and launch the app.
2. Confirm startup UI appears within `45s`.
3. Verify API health via local endpoint:
   - `GET http://127.0.0.1:4010/health`
4. Verify authenticated endpoint with owner token:
   - `GET /me` with header `x-api-token`.
5. Confirm logs contain boot milestones:
   - `desktop.log` includes `app ready`, `api ready; loading renderer`, `renderer loaded`.
6. Create a server from setup wizard and verify start + dashboard handoff.

Default log paths:

- macOS: `~/Library/Application Support/SimpleServers/desktop.log`
- Windows: `%APPDATA%/SimpleServers/desktop.log`
- Linux: `${XDG_CONFIG_HOME:-~/.config}/SimpleServers/desktop.log`

## Recent Release Notes

- `v0.5.4`
  - Added v2 shell architecture with focused contexts: `Servers`, `Setup Wizard`, `Server Workspace`.
  - Added setup session endpoints (`POST /setup/sessions`, `POST /setup/sessions/:id/launch`) for deterministic wizard launch flow.
  - Added workspace aggregate endpoint (`GET /servers/:id/workspace-summary`) for stable dashboard composition.
  - Added modularized frontend feature layout under `apps/web/src/features/*`.
  - Added API integration coverage for setup session launch and workspace summary contracts.
- `v0.5.3`
  - Added encrypted cloud backup destinations (`S3`, `Backblaze B2 S3`, `Google Drive`) and cloud restore verification telemetry.
  - Added player admin API/UI flows (ops, whitelist, player/IP bans, history).
  - Added Bedrock strategy and hardening-checklist system endpoints.
  - Added modpack plan/import/update/rollback workflow endpoints.
  - Added trust checksum verification + audit export metadata and reliability dashboard endpoint.
  - Added migration import APIs (`/migration/import/manual`, `/migration/import/manifest`, `/migration/imports`).
  - Added server terminal command dispatch endpoint (`POST /servers/:id/command`) and dashboard wiring.
- `v0.5.2`
  - Added beginner capability/status/recovery APIs (`/system/capabilities`, `/servers/:id/simple-status`, `/servers/:id/simple-fix`).
  - Extended quickstart contract (`memoryPreset`, `savePath`, `worldImportPath`).
  - Standardized error envelope and hardened refresh behavior with role-gated data loading.
- `v0.5.1`
  - Fixed duplicate-name quickstart collisions with automatic unique-name resolution.
- `v0.5.0`
  - Introduced focus-oriented onboarding and stronger quick-host diagnostics/recovery flows.
