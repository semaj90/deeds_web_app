# Tasks: parent-atlas-ace-bitfrost-cache-correctness

## Taxonomy-aware RLM cache handoff — 2026-09-06

- [x] Narrow request-cache handoff proven: `RlmSearchRequest.taxonomyRevision` and
  `ontologyRevision` are included in the existing structured RLM request hash, so
  changing either revision produces a different cache key. Focused adapter coverage
  passes.
- [ ] `CACHE-PREFILL-01/02/03` remain open. The narrow RLM request-key change does not
  prove the full `ContextManifestV2`/prompt-prefix identity or live cache read proof.

## Exact prompt cache follow-up — 2026-09-05

- [x] CACHE-PREFILL-CONFIG-01 closed 2026-09-07: aligned the llama-server request
  option across the context streamer, ACP loop, and Cline route. `cache_reuse` is now
  represented as `cacheReuseMinChunk` and documented as llama.cpp's minimum token chunk
  for KV shifting, not a seconds-based TTL. The option is omitted when `cache_prompt` is
  disabled; fractional and negative thresholds fail closed. Focused cache-policy, ACP,
  and telemetry tests pass 15/15. This closes the request-shape defect only; it does not
  prove exact prefix identity, cache isolation, or live reuse.

- [x] CACHE-CAPABILITY-CONTRACT-01 closed 2026-09-07: added the read-only
  `OrnithCacheCapabilityV1` report contract. Prompt caching, KV-shift reuse, recurrent
  checkpoints, host-RAM cache, idle-slot cache, and slot persistence are separate typed
  states (`PROVEN_TRUE`, `PROVEN_FALSE`, `UNPROVEN`) with observed settings kept apart
  from capability claims. Contract tests pass 3/3; no runtime flags or cache state were
  changed.

- [x] ORNITH-CACHE-METADATA-PROBE-01 closed 2026-09-07: added a fail-closed,
  injected-fetch probe for GET `/health`, GET `/props`, and GET `/v1/models`. The live
  endpoint returned `ornith-1.5-9b` and build revision `b8757-a29e4c0b7`; the report is
  recorded at `docs/reports/ornith-cache-capability-v1.json`. The probe records runtime
  metadata only and leaves all cache behavior capabilities `UNPROVEN`. Fixture and
  compatibility coverage passes 22/22; no runtime flags or cache state were changed.

- [ ] ORNITH-CACHE-01 prove prompt reuse, recurrent checkpoint restore, host-RAM cache,
  idle-slot behavior, and slot persistence with behavioral read-only probes against the
  exact runtime. Do not promote any capability from static settings or metadata alone;
  CACHE-PREFILL-02/03 remain the admission and isolation gates.

- [x] ORNITH-CACHE-BEHAVIOR-CONTRACT-01 closed 2026-09-07: added a checksum-only
  behavioral proof receipt for same-identity reuse, cold/warm output and tool-shape parity,
  and distinct-identity isolation. Verdicts are derived from observed telemetry and never
  from `/props` settings; raw prompts, token sequences, tool arguments, and KV state are
  excluded. Contract tests pass 5/5. This prepares the live probe but does not run it.

- [x] CACHE-PREFLIGHT-KEY-01 closed 2026-09-07: strengthened the active
  `openai-facade.ts` ACE preflight key. It now binds the exact query, selected model,
  system-prompt hash, tool-definition hash, repository revision, backend, case/file
  scope, source/chunk/packet evidence sets, and available manifest identity. Focused
  cache-key and facade tests pass 18/18. This prevents the former `query + pipeline`
  collision class but is still a derived preflight key, not proof of complete
  `ContextManifestV2` prompt identity or live cache isolation.

- [x] CACHE-GENERATION-CONTROLS-01 closed 2026-09-07: the active exact-answer
  packet key now includes a canonical generation-controls signature covering temperature,
  bounded max tokens, top-p, presence/frequency penalties, and tool choice. A changed
  output control therefore cannot reuse an answer generated under a different control
  set. Focused cache-key tests pass 7/7 and the OpenAI facade regression suite passes
  14/14. This remains an additive key-boundary fix; it does not claim complete
  `ContextManifestV2` admission or live cache isolation.

- [x] CACHE-RENDERED-REQUEST-01 closed 2026-09-07: the exact-answer packet key now
  also binds a canonical checksum of the ordered model/messages request after ACE, KV,
  history, and token-budget assembly. This closes the remaining compact-signature gap
  for prompt ordering/content without claiming that the legacy ACE manifest is a
  complete `ContextManifestV2`. Focused cache-key coverage passes 10/10 and the combined
  cache/facade regression passes 24/24.

- [x] CACHE-ADMISSION-CONTRACT-01 closed 2026-09-07: added a pure fail-closed admission
  validator for future exact-answer reuse. It requires a complete `ContextManifestV2`,
  all evidence revisions, model/chat-template/tool-schema/prompt-template revisions,
  the rendered-request checksum, and generation-controls signature. Legacy or incomplete
  ACE manifests are rejected by the contract. This is contract proof only; the current
  facade remains on its legacy path until an authoritative V2 producer is wired.
  Combined cache-key/facade coverage passes 28/28.

- [x] CACHE-V2-CALLER-SEAM-01 closed 2026-09-07: `runChatCompletion` now accepts an
  explicit, optional revisioned exact-answer cache handoff containing the existing
  `ContextManifestV2` plus model, chat-template, tool-schema, and prompt-template
  revisions. The handoff type is exported as `RevisionedExactAnswerCacheOptionsV1`, and
  the complete facade options contract is exported as `RunChatCompletionOptionsV1`, so
  future producers can wire it without duplicating the contract. When supplied, it uses
  the strict V2 completion-key builder; when absent,
  legacy callers retain their existing key path. No route enables this automatically,
  so this is a compatibility seam rather than a claim of live V2 cache promotion.
  The facade seam regression now passes 15/15; combined cache-key/facade coverage
  passes 29/29.

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

- [x] `context-assembler.ts:67-71` — `getACEContextAssembler()` singleton opens its own
      `.duplicate()`d Redis connection instead of reusing `getValkeyClient()`. Low severity, one
      extra persistent connection, not per-request. **Closed 2026-09-07** — the constructor now
      reuses the shared `getValkeyClient()` singleton whenever no explicit `redisHost`/`redisPort`/
      `redisPassword` override is supplied (both live callers, `getACEContextAssembler()` and
      `phase110-end-to-end-retrieval-flow.ts`'s direct `new ACEContextAssembler()`, always
      construct with zero args, so this is the live path now). A `.duplicate()`d connection is
      still opened when an override IS explicitly given, preserving that capability for any future
      caller. This required one more fix beyond the naive "just reuse the singleton" swap: `close()`
      previously always called `this.redis.quit()`, which would have killed the shared app-wide
      Redis client out from under every other consumer the moment any one
      `ACEContextAssembler.close()` ran. Added a private `ownsRedisConnection` flag set only when a
      real override is used, and `close()` now calls `.quit()` only when this instance actually
      owns its connection. 3 new tests in `context-assembler.spec.ts` (9/9 total pass): reuse
      identity check (`assembler.redis === getValkeyClient()`), override creates a distinct
      connection, and a spy-based proof that `close()` does not call `.quit()` on the shared
      client when no override was given. No live Redis/Postgres connection made by any test
      (`lazyConnect: true` on the shared client; `pg.Pool` doesn't connect until first query).
- [x] `context-assembler.ts:97` — **Closed 2026-09-07.** The assembler now requires caller-provided
      evidence `content` for each candidate and computes the original-token estimate from its UTF-8
      byte length, rather than from `packet_key`/`source_ref` identifiers. The live Phase 110 caller
      passes `fact_text`; `estimateContentTokensV1` has focused coverage. It remains an estimate
      because this class deliberately does not own a model tokenizer.
- [x] `context-assembler.ts:108` — `candidates.slice(0, 50)` with no visible sort call in this
      file. **Closed 2026-09-07** — confirmed as a live, reachable bug (see the
      "Re-verification pass" section below) and fixed with a new exported pure helper
      `selectTopCandidatesV1()`; see that section for the full writeup and test evidence
      (`context-assembler.spec.ts`, 6/6 pass).

## T3 — Unexamined (budget-limited, not clean)

- [x] MCP tool-call parallelism (serial vs. parallel invocation patterns) —
      **closed 2026-09-07**. Found a real, live, reachable instance:
      `sveltekit-frontend/src/lib/server/ai/acp-rpc-loop.ts`'s `apcRpcLoopTurn()` executed a
      model's batch of tool calls in a serial `for...of` loop (one `await` at a time), even
      though nothing about the OpenAI tool-calling contract requires that — confirmed via web
      search: results correlate back to requests by `tool_call_id`, not by array or completion
      order, and the API "doesn't prescribe an execution order" (Promise.all/asyncio.gather is
      the documented standard pattern). Confirmed reachable: `runAcpRpcLoop` is imported and
      awaited by the live route `src/routes/api/acp/rpc/+server.ts`. **Fixed**: extracted a new
      exported `executeToolCallsInParallel(toolCalls, executor)` helper — runs the batch via
      `Promise.all` (safe here because each mapped task already has its own try/catch and never
      rejects the outer promise), and because `Promise.all` resolves in input-array order
      regardless of which call actually finishes first, the returned `tool_call_id`-tagged
      results still land in the exact same order the old serial loop produced, so no caller-
      visible ordering change. `apcRpcLoopTurn()` now calls this helper instead of its own inline
      loop. New `acp-rpc-loop.spec.ts` (4/4 pass): proves elapsed time for 3 concurrent 40ms
      calls stays under 100ms (would be >=120ms serial); proves results stay in original
      `tool_calls` order even when a "slow" call is listed first and a "fast" one finishes first
      (recorded actual completion order separately to prove real concurrency happened, not just
      asserted it); proves one failing call only affects its own `tool_call_id`, not its
      siblings; proves every result carries `role: 'tool'` and the correct id. No live
      llama-server/MCP connection touched by any test (injectable `executor` callback).
- [x] `search-router.ts` — **resolved 2026-09-07:**
      `sveltekit-frontend/src/lib/server/ace/search-router.ts` is dead code, not just
      "unexamined." Its own docstring claimed "Used by Stage A0 in context-assembler.ts for ACE
      retrieval" — false: grepped both statically (`from '...search-router'`) and dynamically
      (`import('...search-router'`) across all of `src/`, and the only match anywhere in the repo
      is a dynamic `import()` from a standalone test script,
      `scripts/atlas/test-p4-summary-indexing.mjs:277` — not from `context-assembler.ts` or any
      other production path. Checked whether Stage A0 has an unmet need this file could fill:
      it does not — `context-assembler.ts` already has a live, adaptive routing owner,
      `QueryRouter4x4` (`src/lib/server/routing/query-router-4x4.js`, persisted to Redis per-user,
      Hebbian-adapted after each retrieval). Wiring `search-router.ts` in would create a second,
      competing routing owner for the same job — exactly the pattern this repo's own Duplication
      Prevention rule exists to prevent. **Decision: do not wire it in; fixed the docstring**
      instead so it no longer claims a false integration (it now explains it's unwired, names the
      real live owner, and points back here). Left the file itself in place, not archived —
      archiving is a separate, larger action (manifest entry, SHA-256, move) not undertaken this
      pass. The exported functions themselves (`mergeSearchResults`, `normalizeScores`,
      `blendScores`, `searchWithFallback`, `executeSearch`) were skimmed and looked internally
      reasonable (no `localeCompare` tie-breaks, no unsorted-truncation pattern) — that finding
      stands, it just doesn't matter for liveness.
- [x] `multi-lane-retrieval.ts` — **corrected 2026-09-07**: the file at this literal path,
      `sveltekit-frontend/src/lib/server/ace/multi-lane-retrieval.ts`, is now just a 1-line
      `export * from '$lib/server/features/rag/multi-lane-retrieval.js'` barrel, not a 896-line
      implementation (that line count is stale, from `docs/documents-atlas-index.md`'s
      last-indexed snapshot). The real, live implementation is
      `sveltekit-frontend/src/lib/server/features/rag/multi-lane-retrieval.ts` (937 lines) —
      confirmed live via a dynamic `import()` in `src/mcp/trace-mcp-server.ts:4683`
      (`multiLaneSearch`), plus static imports from `features/rag/index.ts`,
      `wiki/wiki-card-writer.ts`, `wiki/wiki-gap-analyzer.ts`, and 4 test files.
      **Audit complete, one real bug found and fixed, no others confirmed.** A background
      read-only pass checked the file for the same bug classes already found/fixed in
      `context-assembler.ts` this session (unsorted top-K truncation, `localeCompare` tie-break
      non-determinism, RRF/blend math errors, connection ownership leaks, stale cache-key
      revision binding). Real finding: `runSymbolLane()` (line ~227) returned hits in the caller's
      symbol-array order, not sorted by `score` — but `mergeAndRank()`'s own comment explicitly
      documents and depends on the invariant that "lane hits are already in best-first order"
      (it derives an RRF rank contribution from array *position*, not from `score`). Since this
      lane's score genuinely varies per symbol (`0.5 + directFanIn/100`, capped at `0.95`), a
      low-authority symbol queried first could get a better RRF rank than a much more
      authoritative one queried later — the same "assumed sorted, wasn't" defect class as the
      `context-assembler.ts` truncation bug, manifesting as a rank artifact instead of a dropped
      candidate. **Fixed**: added `hits.sort((a, b) => b.score - a.score)` before return, matching
      the pattern already used correctly by the topology/wiki/cartridge lanes in the same file.
      Exported `runSymbolLane` and `mergeAndRank` (previously module-private) so both are directly
      unit-testable without Redis/Postgres/Qdrant. New
      `tests/multi-lane-symbol-lane-ordering.spec.ts` (registered in `vitest.config.ts`, 2/2 pass):
      proves a low-fan-in symbol placed first in query text does not outrank a high-fan-in symbol
      placed later, using a minimal stub Redis (`{ get: async (key) => ... }`, no live connection).
      **Checked and ruled out as non-issues** (traced upstream sources, not just read locally):
      `runGraphLane` has the same missing-sort shape but every hit in that lane carries an
      identical hardcoded `score: 0.7`, so array order is inert there (no ranking signal to lose).
      `runAceCacheLane` reads a Redis cache (`aceTopkKey`) with no local sort either, but its sole
      writer — `features/ai/ace/context-assembler.ts:6094`, a *different* file from the one audited
      here, do not conflate — sorts its source array (`kbChunks`, itself built via a `.sort()` at
      `fetchKBChunks`'s own line 5672) before writing, so the cached payload already arrives
      pre-sorted; no bug. Sibling regression suites (`multi-lane-rrf-and-rerank.spec.ts`,
      `multi-lane-spine.spec.ts`, 8/8 tests) re-run clean after this change — no other lane's
      behavior changed.
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
- **T2 item 2 (`total_tokens`/`compression_ratio` measuring the wrong thing) — closed 2026-09-07**.
  The assembler now receives evidence content and derives its token estimate from UTF-8 bytes;
  see the task entry above. The class still reports an estimate rather than model-tokenizer
  counts because tokenizer ownership remains outside this assembler.
- **T2 item 3 (`candidates.slice(0, 50)` with no visible sort) — now positively confirmed as a
  real, reachable bug, not just "unconfirmed."** Traced the one existing caller
  (`phase110-end-to-end-retrieval-flow.ts:270-279`): it passes `extracted_facts.map(...)` straight
  into `assemble()`, and `extracted_facts` itself (line 213) is only
  `g13_result.results.filter(r => r.validation_proof === 'PASS')` — no `.sort()` call anywhere in
  the file. If a G13 extraction pass ever returns more than 50 passing facts, `slice(0, 50)` drops
  whichever ones happen to land after index 50 in G13's own result order, not the lowest-confidence
  ones. **Fixed 2026-09-07**: extracted a pure `selectTopCandidatesV1(candidates, limit)` helper
  (exported from `context-assembler.ts`, sorts by `final_score` descending — a stable sort, so
  tied scores keep their input order — then truncates) and swapped the bare `.slice(0, 50)` call
  for it. This also fixes a second, previously-unnoted consequence of the same root cause: the
  session-cursor block a few lines below (`setACECursor(...)`) reads `packet.candidates[0]` as
  "the best candidate" for `last_score`/`packet_key` — that assumption was silently false before
  this fix whenever caller order wasn't already score-sorted, and is now actually true. New
  `context-assembler.spec.ts` (6/6 pass) unit-tests the pure function directly, including the
  literal reproduction of the bug scenario (highest scores placed past index 50 in input order,
  proven to survive truncation) and a stable-sort/no-mutation/edge-case check. No live
  Postgres/Redis touched — the class's constructor connections are never exercised by this test.
- **T3 remains unexamined** — no evidence any of the 4 listed areas were looked at since this
  change was created.

## Run receipt

See `parent-atlas-agentic-run-receipt-binding/tasks.md` T3 — this change is the first real
`openspecChange` binding target for that new capability once it lands:
`agentLabel: "Find optimizations in MCP/BitFrost/ACE synthesis path"`, `tokensUsed: 752970`,
`durationMs: 77383`, `toolUses: 6`, `filesEdited: []` (fork was read-only; the 2 T1 fixes were
applied by the coordinating session afterward, not by the fork itself).

## Retrieval cache identity follow-up — 2026-09-07

- [ ] **CACHE-RETRIEVAL-IDENTITY-01** — Reconcile the live ACE top-K cache writer and readers
      before enabling revision-qualified reuse. `features/rag/multi-lane-retrieval.ts` reads
      `aceTopkKey(queryHash)` and the live context assembler writes the same query/model/dimension
      namespace, while `MultiLaneQuery` currently carries no shared
      `workspaceRevision`, `candidateSnapshotRevision`, `ordinalMapChecksum`,
      `representationRevision`, `retrievalPolicyRevision`, or `contextPolicyRevision` envelope.
      Do not make the unqualified key production-authoritative by assumption.
- [ ] **CACHE-RETRIEVAL-IDENTITY-02** — Add one shared, revision-qualified read/write contract
      using the existing cache-key owner. Prove same identity = HIT and any changed workspace,
      candidate snapshot, ordinal map, representation, retrieval policy, or context policy =
      MISS/STALE_REJECT. Preserve query/model/dimension in the request identity; do not create a
      second cache namespace or treat Redis/Valkey as canonical data.
- [ ] **CACHE-RETRIEVAL-IDENTITY-03** — Update all callers, including the MCP trace route and
      ACE context assembler, to pass the same envelope. Until that handoff exists, retain the
      current cache behavior as legacy/degraded and do not claim revision-safe retrieval reuse.
      Existing multi-lane RRF tests pass 8/8; that proves lane execution and deduplication, not
      cache identity correctness.

- [x] **CACHE-RETRIEVAL-IDENTITY-CONTRACT-01** — Added the pure
      `aceTopkRevisionedKeyV1(RetrievalCacheIdentityV1)` builder under the existing ACE cache-key
      owner. Focused tests prove deterministic keys and invalidation when workspace, candidate
      snapshot, ordinal map, representation, retrieval policy, context policy, or graph revision
      changes. This is contract-only: no production writer/reader was switched and no cache or
      datastore state was changed.

## Qdrant named-vector retrieval correction — 2026-09-07

- [x] **QDRANT-NAMED-VECTOR-01** — Corrected `QdrantManager.hybridSearch` so its dense path
      resolves the collection's configured primary vector instead of assuming the global
      `content` name. `summary_lenses_768` therefore searches its canonical `summary` vector;
      ordinary content collections retain `content`, and callers may provide an explicit
      override when a collection has a deliberate alternate dense space.
- [x] **QDRANT-NAMED-VECTOR-02** — Extended the shared vector contract with the existing 768-dim
      `summary` and `synthesis` named spaces so validation and request construction agree with
      `VECTOR_CONFIG.COLLECTION_VECTORS`. No new collection, index, fusion owner, or projection
      was added.
- [x] **QDRANT-NAMED-VECTOR-03** — Added a hermetic manager test proving a summary-lens request
      reaches Qdrant with `using: "summary"` and a 768-dim query. Focused retrieval coverage is
      9/9 across the named-vector, spine, retrieval, and RRF suites. The previous live
      `Wrong input: Not existing vector name: content` failure no longer occurs in that path.
- [x] **QDRANT-NAMED-VECTOR-04** — Bounded live read-only readback confirmed
      `summary_lenses_768` exposes exactly `{summary: {size: 768, distance: "Cosine"}}`, with no
      sparse vector configuration and zero points/indexed vectors. This matches the repository
      registry and remains separate from cache-identity promotion. No Qdrant point, collection,
      index, or projection write was performed; a deployed `synthesis` collection was not
      present in this readback and remains unclaimed.
