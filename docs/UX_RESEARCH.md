# UX Research Notes (v0.5.7)

This document captures external product research and internal audits that informed the v2 shell rollout and follow-up quality releases.

## Research Targets

### Prism Launcher (instance-first desktop UX)

- https://prismlauncher.org/
- https://prismlauncher.org/wiki/getting-started/
- https://prismlauncher.org/wiki/getting-started/create-instance/

Key takeaways:

- Instance-centric mental model (`create/select/run`) stays obvious.
- Default path is simple; advanced controls are discoverable but not mandatory.
- Operational status is visible without forcing users into deep settings pages.

### Tunnel onboarding references

- https://playit.gg/download
- https://playit.gg/support/setup-minecraft-java-server/
- https://playit.gg/support/setup-common-issues/

Key takeaways:

- Tunnel success depends on authenticated agent state.
- Endpoint assignment can remain pending and must be represented explicitly.
- Recovery should provide concrete next actions, not generic retry copy.

### Server control-plane references

- Pterodactyl docs: https://pterodactyl.io/panel/1.0/getting_started.html
- Crafty Controller: https://craftycontrol.com/

Key takeaways:

- Clear separation between lifecycle, files, backups, and networking improves orientation.
- Batch actions and status visibility reduce operator overhead for multi-server setups.

### UX Heuristics and accessibility references

- Nielsen Norman Group (10 heuristics): https://www.nngroup.com/articles/ten-usability-heuristics/
- WCAG 2.2 quick reference: https://www.w3.org/WAI/WCAG22/quickref/
- PatternFly bulk-selection pattern: https://www.patternfly.org/patterns/bulk-selection/

## Internal Findings Before v0.5.5

- v2 spacing and grouping still felt compressed in high-density screens.
- Player admin actions were split between forms and non-interactive cached-player rows.
- Public hosting legal consent and provider defaults were not explicit enough in first-run flow.

## v0.5.5 Changes Mapped to Findings

### Public hosting defaults and legal clarity

- Added per-server hosting settings with Playit as default provider for new servers.
- Added consent-aware legal notice in setup review and workspace networking settings.
- Added diagnostics auth handoff surfaces (`authRequired`, `authUrl`, `authCode`) with explicit recovery actions.

### Player admin interaction parity

- Added clickable cached players in v2 Players tab and workspace right rail.
- Added profile modal with direct actions:
  - `Op`
  - `Deop`
  - `Whitelist`
  - `Un-whitelist`
  - `Ban`
  - `Unban`
- Added unified mutation endpoint:
  - `POST /servers/:id/player-admin/action`

### Visual density and spacing quality

- Introduced expanded spacing tokens and applied them across v2 shell/workspace/wizard surfaces.
- Increased panel padding, vertical rhythm, and list row spacing to reduce scanning fatigue.
- Preserved legacy shell unchanged as fallback while making v2 the complete primary surface.

## v0.5.6 Follow-on Findings and Changes

### Operational truth in workspace

- Added runtime-derived online-player state to workspace summary contracts.
- Separated online and known player lists to prevent stale known players from being shown as active users.
- Added dedicated v2 workspace polling cadence for fresher operational data.

### Accessibility and keyboard quality

- Added dialog focus management and Escape handling in wizard/profile modal flows.
- Upgraded workspace tabs to WAI-ARIA tab semantics with keyboard navigation support.
- Added v2 skip-link/main landmark behavior for keyboard-first workflows.

### Migration wording cleanup

- Added vendor-neutral canonical import endpoint and copy:
  - `POST /migration/import/platform-manifest`
- Kept legacy aliases for compatibility while shifting user-facing language to platform manifest import.

## v0.5.7 Validation and UX Refinements

### Console interaction quality

- Expanded v2 console composer and improved command-entry affordance.
- Added Enter-to-send behavior for faster command dispatch.
- Added quick command chips and clear action for repetitive operator workflows.

### Small high-impact v2 polish

- Improved console log readability and spacing rhythm.
- Improved cached-player row hover affordance to make profile actions more discoverable.

## Validation

The following were run after implementation:

- `npm run typecheck`
- `npm run build`
- `npm run test:api`
- `npm run test:e2e`
- `npm run test:ui:live`
