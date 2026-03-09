bits-ui wrapper initial PR plan

Date: 2025-10-01

Files added in this PR:
- Button.svelte — thin wrapper that prefers runtime override, then bits-ui Button, then native fallback.
- DialogRoot.svelte — thin wrapper for Dialog root that binds `open` and provides fallback markup.
- DialogTrigger.svelte — thin wrapper for dialog trigger.
- DialogContent.svelte — thin wrapper for dialog content.
- bits-overrides.ts — runtime override registry (getBitsOverrides, registerOverride).
- index.ts — barrel export for wrapper primitives.
- README.md — usage and override instructions.

Next steps (small PRs):
1) Add unit tests for Button wrapper (props pass-through, click behavior, override path).
2) Replace imports in one low-risk component (e.g., one page using Button) to use wrapper and run CI.
3) Add visual snapshots for a critical page (case details) and confirm no regressions.
4) Expand wrapper set (Dropdown, Menu) and repeat.

Rollback plan: revert PRs if visual regressions or runtime errors occur. Keep wrappers in tree until final removal.
