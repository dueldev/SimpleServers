# SquidServers Parity Notes

This document tracks public-product research for SquidServers and how SimpleServers maps to those interaction patterns while remaining open source and local-first.

## Research Sources

- SquidServers website: https://squidservers.com
- SquidServers support docs index: https://github.com/SquidServers/gitbook
- SquidServers website metadata/positioning (`No port forwarding required`): https://squidservers.com
- SquidServers download guide: https://github.com/SquidServers/gitbook/blob/main/get-started/download/README.md
- SquidServers platform install guides:
  - https://github.com/SquidServers/gitbook/blob/main/get-started/download/downloading-on-windows.md
  - https://github.com/SquidServers/gitbook/blob/main/get-started/download/downloading-on-mac.md
- SquidServers crossplay tutorial: https://github.com/SquidServers/gitbook/blob/main/tutorials/creating-a-crossplay-server-geysermc-server.md
- SquidServers non-premium tutorial: https://github.com/SquidServers/gitbook/blob/main/tutorials/allow-non-premium-users-to-join.md
- SquidServers Java compatibility troubleshooting: https://github.com/SquidServers/gitbook/blob/main/common-errors/incompatible-java-version.md
- NN/g heuristic (visibility of system status): https://www.nngroup.com/articles/ten-usability-heuristics/
- Material helper text guidance: https://m1.material.io/components/text-fields.html#text-fields-helper-text

## Product Patterns Observed

- Setup is framed as a short guided flow instead of one giant control panel.
- Crossplay and non-premium are exposed as straightforward toggles.
- Error handling is practical and plain-language, with next actions.
- Java/version compatibility is made explicit during setup and troubleshooting.
- Users are kept aware of connection/server state through simple status language.
- Onboarding content prioritizes common recipes (crossplay, non-premium, modded) over raw low-level settings.
- Packaging and install friction is documented up front with platform-specific troubleshooting.

## Implemented in SimpleServers (v0.1.12)

- Fixed bodyless POST handling so stop/start-style actions no longer fail with empty JSON body parsing errors.
- Added stronger visibility of system status:
  - connection state
  - active server status badge
  - explicit tunnel pending/running status
- Added safer lifecycle controls:
  - disabled start/stop/restart when server state makes the action invalid
- Improved first-run clarity:
  - quick three-step action guidance
  - local-first online behavior note
  - clearer empty states for server/content workflows
- Added recipe-driven setup shortcuts:
  - crossplay recipe
  - modded recipe
  - non-premium recipe
- Added runtime troubleshooting panel with contextual guidance and one-click diagnostics refresh.
- Added automatic tunnel-status polling while public endpoint provisioning is pending.

## Parity Backlog

- Add a dedicated first-run wizard with step-level validation and inline examples.
- Add one-click diagnostics bundle export from error banners.
- Add guided network checks for common connection failures.
- Expand version compatibility badges in setup/version picker.
- Add contextual docs links directly next to high-risk toggles.
