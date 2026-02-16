# UX Research Notes (v0.4.0)

This release included external UX benchmarking plus codebase audit to reduce friction for non-technical operators.

## External references

- SquidServers update notes (flow and product direction):
  - https://squidservers.com/updates
  - https://squidservers.com/updates/v056
  - https://squidservers.com/updates/v055
- Nielsen Norman Group, 10 usability heuristics (visibility of status, recognition over recall, error recovery):
  - https://www.nngroup.com/articles/ten-usability-heuristics/
- W3C WCAG 2.2 (focus visibility + control contrast expectations):
  - https://www.w3.org/WAI/WCAG22/quickref/#focus-visible
  - https://www.w3.org/WAI/WCAG22/quickref/#non-text-contrast
- PatternFly bulk-selection guidance (clear selection model for batch actions):
  - https://www.patternfly.org/patterns/bulk-selection/

## Codebase findings

- The app already had strong tooling depth, but high-cognitive-load flows still required view-hopping.
- File rollback confidence existed for `server.properties`, but not surfaced clearly for all editable files.
- Tunnel diagnostics were strong, but endpoint recovery still required too many manual steps for beginners.
- Navigation relied on tab switching; fast command access was missing.

## Implemented in v0.4.0 based on research

- Added `Next Best Action` panel to keep one clear recommendation visible at all times.
- Added global `Quick Actions` command palette (`Ctrl/Cmd + K` / `/`) for recognition-first navigation and actions.
- Added per-file snapshot history and rollback controls in Advanced editor for safer edits.
- Added diagnostics quick-fixes for `restart_tunnel` and `go_live_recovery` to reduce unresolved quick-host loops.
- Updated visual emphasis for key flows (create, start, publish, recover) while preserving existing advanced tooling.

## Validation

- Typecheck, API integration tests, Playwright e2e, and build were run after implementation.
