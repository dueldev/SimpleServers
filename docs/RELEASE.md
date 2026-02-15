# Release, Signing, and Updates

SimpleServers ships desktop artifacts via Electron Builder and GitHub Actions.

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
