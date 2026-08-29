# Tasks: parent-atlas-ace-bitfrost-cache-correctness

## Context

A background fork investigated the ACE → BitFrost → MCP path for verifiable optimizations this
session (read `context-assembler.ts` full, `ace-top-retrieval-cache.ts` full, spot-checked
`topo-candidate-cache.ts`). It surfaced 5 findings; 2 were fixed immediately (below), 3 remain
open. MCP tool-call parallelism, `search-router.ts`, `multi-lane-retrieval.ts`, and the
query-synthesis/prompt-build stage feeding Ornith were **not reached** — explicitly unexamined,
not confirmed clean.

## T1 — Fixed this session

- [x] `context-assembler.ts` (`sveltekit-frontend/src/lib/server/ace/context-assembler.ts`):
      `assemble()`'s cache key hashed only `queryText + embedding[0:10]`, no revision binding —
      `validateCachedPacket()`'s staleness check existed but was dead code since nothing ever set
      `workspace_revision` on an assembled packet. Fixed: `assemble()` now takes optional
      `workspaceRevision`/`sourceRevision` params, folds them into `cache_key` when supplied, and
      stamps them onto the packet. Backward-compatible (optional params); the one existing caller
      (`phase110-end-to-end-retrieval-flow.ts`) doesn't currently pass a revision, so this closes
      the structural gap without forcing a caller change yet.
- [x] `ace-top-retrieval-cache.ts`
      (`sveltekit-frontend/src/lib/server/cache/ace-top-retrieval-cache.ts`):
      `setAceTopRetrievalPointer()` used plain `redis.set()` — no TTL, unbounded growth. Fixed to
      `redis.setex(..., 300, ...)`, matching the sibling `topo-candidate-cache.ts` TTL pattern.
      `buildAceTopRetrievalCacheKey()` also gained an optional `workspaceRevision` param.
      **Note**: this module currently has zero callers anywhere in the app — the bug was real but
      dormant. Don't wire up callers as part of this change without being asked.

## T2 — Open, not started (from the fork's report)

- [ ] `context-assembler.ts:67-71` — `getACEContextAssembler()` singleton opens its own
      `.duplicate()`d Redis connection instead of reusing `getValkeyClient()`. Low severity, one
      extra persistent connection, not per-request.
- [ ] `context-assembler.ts:97` — `total_tokens`/`compression_ratio` computed from
      `packet_key.length`/`source_ref.length`, not any real content field (the `ACEPacket`
      candidate shape doesn't carry summary text at all). Every compression ratio this class
      reports is measuring the wrong thing.
- [ ] `context-assembler.ts:108` — `candidates.slice(0, 50)` with no visible sort call in this
      file. Not confirmed as a live bug (callers not traced) — check whether callers guarantee
      score-sorted input before `assemble()`; if not, this silently drops higher-scoring
      candidates past index 50.

## T3 — Unexamined (budget-limited, not clean)

- [ ] MCP tool-call parallelism (serial vs. parallel invocation patterns)
- [ ] `search-router.ts`
- [ ] `multi-lane-retrieval.ts`
- [ ] Query-synthesis / prompt-build stage feeding Ornith

## Run receipt

See `parent-atlas-agentic-run-receipt-binding/tasks.md` T3 — this change is the first real
`openspecChange` binding target for that new capability once it lands:
`agentLabel: "Find optimizations in MCP/BitFrost/ACE synthesis path"`, `tokensUsed: 752970`,
`durationMs: 77383`, `toolUses: 6`, `filesEdited: []` (fork was read-only; the 2 T1 fixes were
applied by the coordinating session afterward, not by the fork itself).
