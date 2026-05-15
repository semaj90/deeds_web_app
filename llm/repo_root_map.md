# repo root map

Workspace-level path map for fast traversal beyond `sveltekit-frontend/`.

## Primary roots

- `sveltekit-frontend/` — main app, routes, UI, server logic, tests, and app scripts
- `scripts/` — repo-wide tooling, audits, and operational scripts
- `services/` — standalone services and sidecars
- `simd-bridge/` — native bridge code and GPU/C++/Rust components
- `drizzle/` — migrations, schema assets, and DB maintenance SQL
- `docker/` — compose and runtime stacks
- `docs/` — architecture and generated docs
- `memory/` — durable notes and knowledge artifacts
- `.github/` — CI and workflow definitions
- `next_steps/` — active plans and task notes

## What to look for first

- Route or UI issue: `sveltekit-frontend/src/routes/`
- Server or datastore logic: `sveltekit-frontend/src/lib/server/`
- Cross-repo tooling: root `scripts/`
- Native/GPU bridge: `simd-bridge/`
- Schema/migration issue: `drizzle/`
- Deployment/runtime issue: `docker/` and `.github/`

## Traversal hints

- Start at the repo root when the bug spans app + infrastructure.
- Start at `sveltekit-frontend/` when the bug is local to UI or SvelteKit routes.
- Use `llm/karpathy_llmwiki.md` for the script-to-debug-flow hop.

## Notes

- Keep this page focused on structure, not prose.
- Update it when new top-level roots appear or a root changes meaning.
