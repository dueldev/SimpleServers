# UX Research Notes (v0.5.0)

This document captures external product research + internal audit that shaped the `v0.5.0` release.

## Research Targets

### Prism Launcher (instance-first desktop UX)
- https://prismlauncher.org/
- https://prismlauncher.org/wiki/getting-started/
- https://prismlauncher.org/wiki/getting-started/create-instance/
- https://prismlauncher.org/news/release-9.2/

Key takeaways:
- Instance-centric mental model (`create/select/run`) stays obvious.
- Default path is simple; advanced controls are discoverable but not mandatory.
- Operational status is visible without forcing users into deep settings pages.

### SquidServers (goal-first hosting UX)
- https://squidservers.com/
- https://squidservers.com/updates
- https://docs.squidservers.com/website/custom-domain/

Key takeaways:
- Strong focus on fast path actions (create/deploy/share).
- Public address and connection workflow are surfaced clearly.
- Product communication emphasizes reduction of setup friction.

### playit.gg (tunnel onboarding + runtime expectations)
- https://playit.gg/download
- https://playit.gg/support/setup-minecraft-java-server/
- https://playit.gg/support/setup-common-issues/

Key takeaways:
- Tunnel success depends on authenticated agent state.
- “Endpoint pending” is a normal transitional state and must be communicated clearly.
- Setup should expose concrete recovery steps, not generic retry messaging.

### Other server control planes
- Pterodactyl docs: https://pterodactyl.io/panel/1.0/getting_started.html
- Crafty Controller: https://craftycontrol.com/

Key takeaways:
- Clear separation between lifecycle, files, backups, and networking improves orientation.
- Batch actions and status visibility reduce operator overhead for multi-server setups.

### UX Heuristics and accessibility references
- Nielsen Norman Group (10 heuristics): https://www.nngroup.com/articles/ten-usability-heuristics/
- WCAG 2.2 quick reference: https://www.w3.org/WAI/WCAG22/quickref/
- PatternFly bulk-selection pattern: https://www.patternfly.org/patterns/bulk-selection/

## Internal Findings Before v0.5.0

- Playit quick-host often stayed unresolved for users without an already-configured local agent secret.
- Dashboard had power, but presented too much at once for first-time operators.
- Recovery actions existed, but authentication setup for tunnel sync still required external shell knowledge.
- File rollback confidence was stronger than before, but reliability edge cases still existed when file state changed rapidly.

## v0.5.0 Changes Mapped to Findings

### Reliability and functionality
- Added Playit secret setup endpoint: `POST /tunnels/:id/playit/secret`.
- Stored Playit secret in local app data (`data/secrets/playit`) and referenced via tunnel config path.
- Hardened Playit tunnel matching by persisting remote identity metadata (tunnel ID/internal ID/name).
- Added/expanded diagnostics recovery actions for:
  - `restart_tunnel`
  - `set_playit_secret`
  - `go_live_recovery`

### UX and decluttering
- Added Focus vs Full dashboard layout control (Focus default) to reduce first-run cognitive load.
- Kept primary flow visible (`Create`, `Go Live`, `Fix`) while moving heavy telemetry/queue surfaces behind Full layout.
- Preserved advanced depth while reducing noise for non-technical users.
- Kept quick actions and guided recovery paths available from central surfaces.

### Hardening details
- Command palette actions are connection-aware to avoid disconnected-state failures.
- Editor snapshot state now clears safely on file inventory/load edge conditions.

## Validation

The following were run after implementation:

- `npm run typecheck`
- `npm run test:api`
- `npm run test:e2e`
- `npm run build`
- `npm run desktop:build`
