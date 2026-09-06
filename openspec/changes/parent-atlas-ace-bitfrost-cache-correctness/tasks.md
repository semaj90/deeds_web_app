# Tasks: parent-atlas-ace-bitfrost-cache-correctness

## Taxonomy-aware RLM cache handoff — 2026-09-06

- [x] Narrow request-cache handoff proven: `RlmSearchRequest.taxonomyRevision` and
  `ontologyRevision` are included in the existing structured RLM request hash, so
  changing either revision produces a different cache key. Focused adapter coverage
  passes.
- [ ] `CACHE-PREFILL-01/02/03` remain open. The narrow RLM request-key change does not
  prove the full `ContextManifestV2`/prompt-prefix identity or live cache read proof.

## Exact prompt cache follow-up — 2026-09-05

- [ ] CACHE-PREFILL-01 audit the existing Ornith query-synthesis/prompt-build path,
  then bind its exact cache identity to ContextManifestV2.identityChecksum,
  modelRevision, chatTemplateRevision, toolSchemaRevision, promptTemplateRevision.
  Include exact rendered request/prompt and generation parameters where output reuse
  depends on them; a manifest alone does not cover a changed user question.
  Use canonical structured serialization, not ambiguous string concatenation.
- [ ] CACHE-PREFILL-02 fixture-prove identical complete identity -> HIT and changing
  any identity field -> MISS/STALE_REJECT; missing revisions fail cache admission.
  Include altered question, tool schema, rendered bytes, and output-affecting controls.
- [ ] CACHE-PREFILL-03 after caller ownership is verified, run a separately scoped
  live read proof; cache SET/DEL fixtures need explicit cache-write effect accounting.

These tasks extend the open T3 prompt-build audit; they do not close token accounting,
unsorted selection, MCP parallelism, search-router or multi-lane-retrieval findings.
BitFrost remains exact and derived; runtime prefix reuse has a separate research owner.

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

## Re-verification pass (2026-09-05, read-only)

Re-read `sveltekit-frontend/src/lib/server/ace/context-assembler.ts` fresh (confirmed this is a
genuinely standalone `ACEContextAssembler` class, distinct from the unrelated 7,936-line
`src/lib/server/features/ai/ace/context-assembler.ts` facade+implementation pair documented
elsewhere in this repo — different file, same directory-adjacent name, do not conflate).

- **T1 both fixes still live**: `assemble()` still takes optional `workspaceRevision`/
  `sourceRevision` params and folds them into the cache key (lines 88-89, 135-142);
  `getACEContextAssembler()`'s `.duplicate()`'d connection still carries the fix context (see T2
  below — the duplicate-connection *pattern* itself was never the T1 fix, only the missing
  revision-binding and missing TTL were).
- **T2 item 1 (dedicated `.duplicate()` connection) — still open**, confirmed at line 69.
- **T2 item 2 (`total_tokens`/`compression_ratio` measuring the wrong thing) — still open**,
  confirmed at line 101: `totalTokens` is still `packet_key.length/4 + source_ref.length/4`
  summed, not derived from any real content/summary field.
- **T2 item 3 (`candidates.slice(0, 50)` with no visible sort) — now positively confirmed as a
  real, reachable bug, not just "unconfirmed."** Traced the one existing caller
  (`phase110-end-to-end-retrieval-flow.ts:270-279`): it passes `extracted_facts.map(...)` straight
  into `assemble()`, and `extracted_facts` itself (line 213) is only
  `g13_result.results.filter(r => r.validation_proof === 'PASS')` — no `.sort()` call anywhere in
  the file. If a G13 extraction pass ever returns more than 50 passing facts, `slice(0, 50)` drops
  whichever ones happen to land after index 50 in G13's own result order, not the lowest-confidence
  ones. Not fixed here (out of this change's stated scope of re-verification), but no longer
  speculative.
- **T3 remains unexamined** — no evidence any of the 4 listed areas were looked at since this
  change was created.

## Run receipt

See `parent-atlas-agentic-run-receipt-binding/tasks.md` T3 — this change is the first real
`openspecChange` binding target for that new capability once it lands:
`agentLabel: "Find optimizations in MCP/BitFrost/ACE synthesis path"`, `tokensUsed: 752970`,
`durationMs: 77383`, `toolUses: 6`, `filesEdited: []` (fork was read-only; the 2 T1 fixes were
applied by the coordinating session afterward, not by the fork itself).
