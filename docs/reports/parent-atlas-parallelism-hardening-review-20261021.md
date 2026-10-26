# Parent Atlas parallelism and hardening review

## Findings

- The 50-query golden-breadth MCP runner at `sveltekit-frontend/scripts/atlas/golden-breadth-retrieval-v1.mjs` is sequential. The per-query loop awaits each lane. The previous reconciled 50-query run is evidence of tool-call coverage, not evidence that parallel execution is safe or faster.
- `.okf/indexes/feature-intelligence.yaml` defines PostgreSQL canonical ownership, logical retrieval lanes, rebuildable projections/executors, and projection receipt fields. It contains no explicit cache/Valkey, model KV, or threading/concurrency policy. Runtime rules remain in `AGENTS.md`, `CLAUDE.md`, and the service owners.
- The existing policy is consistent: bounded independent readers, serial write stages, CPU workers for parsing/JSON, and GPU only for measured numerical kernels with CPU parity and the `:8090` resource gate.

## Changes

- Added a MCP query-batch profile to root `codex.md` and `claude.md`: future query-level concurrency capped at four, each MCP server independently limited to one in-flight request initially, serial output assembly, and no cache warming or raw ACE injection.
- Added `.codex/skills/parent-atlas-production-hardening-audit/SKILL.md`, combining deep owner/caller and production-proof audits with GAN-style `CREATED`/`WIRED`/`PROVEN`/`DONE` evidence discipline.
- Linked the new skill from `.claude/commands/deep-audit.md` without changing its existing gate behavior.
- GPU batch enhancement remains deferred to an explicitly scoped OpenSpec under an existing numerical owner. No benchmark, server stop, store write, or runtime behavior change was made.

## Next proof gate

Implement a query pool only after capturing a fresh serial baseline, then compare serial and bounded runs query-by-query using the same frozen query-set checksum. Keep Svelte `npx` calls serialized; test any higher TRACE/Atlas per-server cap separately. Measure elapsed time, per-lane failures/retries, output checksums, and peak memory. A passing benchmark does not authorize Valkey, Qdrant, PostgreSQL, or ACE writes.
