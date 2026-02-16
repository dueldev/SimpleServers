# Release, Signing, and Updates

SimpleServers ships desktop artifacts via Electron Builder and GitHub Actions.

Canonical repository: `https://github.com/dueldev/SimpleServers`

## Workflows

- CI: `.github/workflows/ci.yml`
  - matrix on `ubuntu-latest`, `macos-latest`, `windows-latest`
  - typecheck, build, API integration tests, UI e2e tests
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

1. Run full local verification (`npm run typecheck`, `npm run build`, `npm run test`).
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

- `v0.1.12`
  - Hardened API JSON parsing so empty-body JSON lifecycle actions are accepted safely instead of failing before route handlers.
  - Added server existence validation on stop actions.
  - Added guided setup recipes for crossplay/modded/non-premium workflows.
  - Added auto-refresh of tunnel status while pending and a dedicated troubleshooting panel in the Manage workspace.
  - Expanded SquidServers parity mapping with onboarding/install and common-flow research.
- `v0.1.11`
  - Fixed dashboard POST behavior for bodyless actions (for example `Stop`) by omitting `content-type: application/json` when no request body is sent.
  - Added clearer status visibility and action guardrails (connection state, server status badges, disabled invalid lifecycle actions).
  - Added explicit quick-host tunnel pending/running feedback and stronger empty-state guidance.
  - Added SquidServers parity research notes in `docs/SQUID_PARITY.md`.
- `v0.1.10`
  - Reworked web dashboard IA into focused views (`Overview`, `Setup`, `Manage`, `Content`, `Advanced`).
  - Added progressive disclosure with a Power mode toggle so first-time users are not overloaded by advanced controls.
  - Added persistent active-server context and quick actions to reduce navigation friction.
  - Updated e2e flow coverage for the new navigation model.
- `v0.1.9`
  - Fixed packaged desktop renderer asset path resolution by using a relative web build base (`./`), preventing blank windows on macOS DMG installs.
