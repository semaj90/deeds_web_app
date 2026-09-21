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
- [x] CACHE-PREFILL-02 fixture-proven 2026-09-15: the canonical V2 completion-key
  fixture returns a repeatable HIT for identical complete identity and an isolated
  MISS for changed query, manifest, model, chat-template, tool-schema, prompt-template,
  rendered-request, or generation-control identity. Missing each manifest revision is
  rejected. Coverage is deterministic and in-memory; live cache readback remains T3.
  Test: `sveltekit-frontend/tests/cache-keys.spec.ts` (15/15).
- [ ] CACHE-PREFILL-03 after caller ownership is verified, run a separately scoped
  live read proof; cache SET/DEL fixtures need explicit cache-write effect accounting.

### Strict streaming handoff update — 2026-09-15

- Added an explicit `StreamProviderOptions.revisionedExactAnswerCache` seam to
  `sveltekit-frontend/src/lib/server/ai/streaming-cache.ts`. Strict callers now
  bypass the legacy message-only stream cache and delegate exact-answer lookup
  to `runChatCompletion`, which binds the complete V2 identity, rendered request,
  and generation controls. Legacy callers remain compatibility-only.
- This does not close `CACHE-PREFILL-01/02/03`: no production caller has yet
  supplied a proven `ContextManifestV2`, and no live cache readback was claimed.
- Re-ran `audit-ace-route-revision-authority-v1.mjs`: the ACE stream route still
  reports `NO_ROUTE_LOCAL_AUTHORITY`; it has no source/representation/policy
  revision bundle and remains legacy/degraded until an upstream SearchRuntime
  manifest is explicitly handed through.
- Audited `sveltekit-frontend/src/routes/api/v1/chat/completions/+server.ts`:
  it has no trusted server-side manifest producer or revision bundle, so it is
  intentionally left on the compatibility path. Client-supplied revisions are
  not accepted as authority.
- Verified the existing `searchWithAceManifest` contract and its 22-test
  manifest/SearchRuntime suite. The adapter is intentionally pure: its
  `SearchRuntimeQasFeatureSources` inputs must be supplied by a server-owned
  revisioned provider, and it does not query or promote Postgres/Qdrant/Neo4j
  state itself. Creating that provider is the remaining implementation gate.
- **Prompt-build census rechecked 2026-09-15:** the canonical
  `sveltekit-frontend/src/lib/server/ai/openai-facade.ts` computes rendered-request
  and generation-control identity before strict V2 lookup, but a separate root-level
  `src/lib/server/ai/openai-facade.ts` still contains an older query/day cache path.
  The updated read-only caller census found zero repository callers for its
  `processQueryForLLM` symbol, so it is classified `UNREFERENCED_LEGACY_SURFACE`.
  It remains archived compatibility code pending a separate cleanup decision; do not
  delete it or allow it to claim V2 cache authority in this change. Receipt:
  `docs/reports/ace-prompt-cache-caller-audit-v1.json`.
- Follow-up census confirms the daily board feature builders are projections,
  not a safe route provider: they may expose nullable or derived revisions and
  do not return the complete per-candidate QAS projection/context pair required
  for `ContextManifestV2`. They remain unsuitable as cache authority.
- **Provider gap rechecked 2026-09-15:** the existing Postgres exact/AST
  retrievers are lexical/structural lane executors only. They expose packet/source
  observations, but no server-owned bundle containing the admitted ordinal map,
  complete feature projection, graph/policy/playbook revisions, and per-candidate
  QAS context. The pure `SearchRuntimeQasFeatureSources` seam therefore has no
  production implementation to call. Do not use raw retriever rows, daily-board
  projections, client-supplied revisions, or nullable legacy metadata to construct
  a cache-authoritative manifest. The next implementation gate is a read-only
  provider over an already-admitted cohort; until it exists, callers remain
  `LEGACY_OR_UNCERTIFIED` and strict cache admission stays unavailable.
- The existing `createSearchRuntimeAceResolverV1` was rechecked and its focused
  suite passes 4/4. It validates an already-admitted source bundle but does not
  materialize one; the missing server-owned `resolveSources` implementation is
  now the explicit next gate.
- Producer census found only pure builders (`buildRetrievalRouterFeatureRowV1`
  and `produceAceFeatureSnapshotV1`). They require pre-admitted observation,
  ordinal, and revision inputs; they cannot safely be used as a route-local
  fallback. The production handoff therefore remains blocked pending a real
  read-only provider over the admitted cohort.

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

- [x] **CACHE-RETRIEVAL-IDENTITY-01** closed 2026-09-15 as an audit — reconciled the live ACE top-K cache writer and readers
      before enabling revision-qualified reuse. `features/rag/multi-lane-retrieval.ts` reads
      `aceTopkKey(queryHash)` and the live context assembler writes the same query/model/dimension
      namespace, while `MultiLaneQuery` currently carries no shared
      `workspaceRevision`, `candidateSnapshotRevision`, `ordinalMapChecksum`,
      `representationRevision`, `retrievalPolicyRevision`, or `contextPolicyRevision` envelope.
      The unqualified writer/reader paths are now explicitly classified as legacy/degraded;
      they are not production-authoritative. This closes the inventory question only; caller
      migration and live revision-safe reuse remain open in tasks 02/03.
- [x] **CACHE-RETRIEVAL-IDENTITY-02** closed 2026-09-15 — Added one shared, revision-qualified read/write contract
      using the existing cache-key owner. Prove same identity = HIT and any changed workspace,
      candidate snapshot, ordinal map, representation, retrieval policy, or context policy =
      MISS/STALE_REJECT. Preserve query/model/dimension in the request identity; do not create a
      second cache namespace or treat Redis/Valkey as canonical data. The pure builder, writer,
      reader, admission guard, feature-revision binding, and focused invalidation tests are
      complete. Live caller migration remains `CACHE-RETRIEVAL-IDENTITY-03`.
- [ ] **CACHE-RETRIEVAL-IDENTITY-03** — Update all callers, including the MCP trace route and
      ACE context assembler, to pass the same envelope. Until that handoff exists, retain the
      current cache behavior as legacy/degraded and do not claim revision-safe retrieval reuse.
      Existing multi-lane RRF tests pass 8/8; that proves lane execution and deduplication, not
      cache identity correctness.

### Retrieval-cache admission hardening — 2026-09-15

- Added the pure `admitRevisionedAceTopRetrievalEntry()` guard in
  `sveltekit-frontend/src/lib/server/cache/ace-top-retrieval-cache.ts`. It requires the
  existing `aceTopkRevisionedKeyV1` identity, query hash, top-N, and derived cache key to
  agree; legacy entries without identity are rejected as unavailable rather than treated as
  current hits. Added focused coverage for exact admission, legacy rejection, and changed
  query/revision/top-N/key rejection. This is a read-side contract only: no cache warming,
  Redis writes, or production caller migration was performed.
- `CACHE-RETRIEVAL-IDENTITY-03` remains open; current callers are still legacy/degraded and
  strict V2 production handoff is not proven.
- Added an optional `MultiLaneQuery.retrievalCacheIdentity` seam. When supplied, the ACE lane
  uses the revisioned reader and rejects a query-hash mismatch; callers that omit it retain the
  old key for compatibility. No current route supplies the complete server-admitted bundle yet,
  so this does not close either retrieval-identity task.
- Added `retrievalCacheIdentityFromAceManifestV1()` as a pure bridge from an admitted
  `ContextManifestV2` plus explicitly supplied model/dimension/workspace/context fields. It
  returns `null` for missing required evidence instead of inferring revisions. The shared
  retrieval key now also binds `featureRevision`. Manifest-to-cache production remains
  non-authoritative until a server route supplies and reads back the complete bundle.
- Added the optional identity output to `SearchRuntimeAdapter.searchWithAceManifest()`. It
  derives the identity only when the caller supplies model, dimension, and context-policy
  metadata; otherwise the result contains `retrievalCacheIdentity: null`. SearchRuntime
  remains read-only and `canonicalAuthority=false`; no production route has been promoted.
- Added an optional `retrievalCacheIdentity` input to `assembleACEContext()` and forwarded it
  to the existing multi-lane search call. The handoff is opt-in and query-hash validated by the
  cache lane; callers without an admitted identity remain legacy/degraded. No route was enabled
  automatically and no live cache write occurred.
- **Production caller census rechecked 2026-09-15:** `/api/v1/query` and
  `/api/ace/summarize` forward request-level revision hints into context assembly, but neither
  route receives a server-admitted `ContextManifestV2` or supplies
  `retrievalCacheIdentity`. Those hints are therefore diagnostic inputs, not cache authority.
  `/api/synthesis/generate`, `/api/reconstruction/scene-intent`, the wiki encyclopedia route,
  MCP context calls, and other direct callers remain legacy/degraded because they omit the
  complete admitted identity bundle. No route currently passes `retrievalCacheIdentity` to
  `assembleACEContext()` in production. The next implementation is a read-only server-owned
  admitted-cohort provider plus one route handoff; do not derive identity from client fields,

## Storage and packet-artifact reconciliation — 2026-09-15

- **DOCKER-DISK-PRESSURE-01 remains open and mutation-blocking:** read-only host census found
  `C:\Users\james\AppData\Local\Docker\wsl\disk\docker_data.vhdx` at approximately 186.23
  GiB while the C: volume had approximately 0.25 GiB free. Docker Desktop was in a stopping/
  unhealthy state and the engine API returned HTTP 500. No prune, deletion, compaction, WSL
  shutdown, container restart, or datastore operation was performed. Do not run indexing,
  embedding, cache warming, or fanout until disk headroom and the Docker engine are healthy.
- **PACKET-ARTIFACT-LOCATION-01 audit result:** repository `.tmp` is approximately 12.68 GiB;
  `.opencode` is approximately 0.05 GiB. The largest `.tmp` artifacts include a 768 MiB
  map-reduce NDJSON, a 538 MiB SQL backup, a 374 MiB parser JSON artifact, and multiple ~295 MiB
  ONNX sidecars. This indicates historical/intermediate artifacts, not `.opencode` prompt
  injection, are the immediate workspace storage risk. Preserve them until their archive,
  retention class, and checksum ownership are classified.
- **ACE-PACKET-FANOUT-01 remains open:** existing `ace-packet-assembly.mjs` can update
  `atlas_packets.metadata` and emit a `.tmp` NDJSON audit, while the revision-qualified ACE
  cache key/admission contract exists. A canonical JSONL/NDJSON packet index has not yet been
  proven end-to-end from validated packet envelope to Postgres readback to revision-addressed
  BitFrost/Redis projection. JSONL remains evidence/input; it is not a second canonical store.
- **ANALYTICAL-ADAPTER-BOUNDARY-01 remains open:** DuckDB/pandas/map-reduce/msgpack may inspect
  bounded immutable exports, and CouchDB may be considered only as a disposable compatibility
  adapter. None may own packet identity, revisions, fanout status, or promotion. PostgreSQL
  remains canonical; AIO and bitmap scans are planner behavior, not an application abstraction.
- **JSONB-INDEX-DRIFT-01 remains open:** reconcile live `information_schema`/`pg_indexes` with
  Drizzle declarations and migrations before any fanout migration. Keep JSONB containment/index
  intent separate from B-tree scalar/index intent and FTS/vector ownership. No DDL or schema
  apply is authorized by this audit.
- **Next read-only gate:** produce a bounded packet-artifact manifest containing path, bytes,
  checksum, schema/parser revision, workspace/source/candidate revisions, canonical packet IDs,
  retention class, and intended Postgres/BitFrost/Qdrant projection. Require duplicate identity
  and mixed-revision rejection before any importer or cache warmer is enabled.
- **NES-CHROM97-INDEX-ADMISSION-01 remains open:** `memory/packets/nes-chrom-packets.jsonl`
  contains 45 valid JSONL records (approximately 24 KiB), but it is only a small legacy/sample
  corpus; the ignored `neschrom97/` directory is approximately 10 MiB. Existing code has packet
  identity, ACE assembly, Redis/BitFrost cache-key,
  DuckDB, and FTS/BM25 adapter surfaces, but this is not evidence of an indexed NES/CHROM97
  corpus. The existing retrieval test also records synthetic NES hash formats that do not match
  the canonical query-hash function. Do not import or warm these packets until a bounded manifest
  proves schema validity, canonical packet identity, summary payload checksum, source/revision
  status, and deterministic duplicate rejection.
- **Required fanout order:** validated JSONL/NDJSON packet envelope → canonical Postgres packet/
  summary projection and FTS materialization → readback checksum → revision-addressed
  Redis/BitFrost ACE cache projection → optional Qdrant/Neo4j/cuVS projections. DuckDB/pandas and
  MsgPack are bounded analytical/transport adapters only; they must not bypass the Postgres
  canonical write/readback boundary. `ace:packet:latest` and legacy unqualified cache entries
  remain degraded compatibility inputs, never current authority.
- **CROSS-LAYER-ACE-ALIGNMENT-01 remains open:** QLoRA/domain classification, MCP/Viterbi failure
  evidence, NLP/lexical search, Tree-sitter/AST and semantic mappings, multi-hop topology,
  ACE prompt assembly, BitFrost residency, GPU tiles, and shader caches are distinct derived
  lanes. They may contribute revision-qualified evidence to `CandidateFeatureSnapshotV1` and
  `ContextManifestV2`, but none may mint packet identity, CandidateOrdinal, source revision,
  cache identity, or mutation authorization. QLoRA remains a revisioned model artifact requiring
  its own checksum and held-out receipt; it is not a domain-label authority.
- **NES/CHROM97 packet summary contract:** each admitted record must preserve canonical packet
  identity, source reference, nullable workspace/source revisions, parser/schema revision,
  summary checksum, domain/topic/entity observations, lexical/AST/semantic evidence references,
  and projection intent. Centroids, topology coordinates, Redis/Valkey keys, GPU tiles, shader
  objects, KV state, and Qdrant IDs remain rebuildable projections. No raw model reasoning or
  GPU state may enter JSONL, JSONB, Redis, ACE, or Postgres.
- **BM25/FTS planner recheck 2026-09-15:** `npm run atlas:bm25:index:plan` completed read-only and
  emitted `sveltekit-frontend/docs/reports/graphify-bm25-index-plan.json`. It found completed
  Graphify candidates, but every candidate's next action remains `CREATE_INDEX_RUN_ULID_THEN_CLAIM_LEASE`;
  no index run was created, no lease was claimed, and no canonical packet or ACE fanout occurred.
  This is planner availability, not proof that the NES/CHROM97 packet corpus is current or
  revision-qualified. Do not promote the planner candidate without resolving the admitted
  execution owner and packet/source/chunk digest bridge.
- **GRAPHIFY-EXECUTION-OWNER-RECHECK 2026-09-15:** the read-only owner planner returned
  `DUPLICATE_EQUIVALENT_EXECUTIONS` with `candidateCount=2`, `distinctEvidenceSignatures=1`,
  and candidate IDs `0dba1c0d-2cf7-4f35-a61b-c77956f60d3d` and
  `74d50c86-8194-45ea-8c3d-61aab737ef83`. `preferredExecutionId=null`, `safeToApply=false`,
  and `writesPerformed=false`. This proves equivalence but does not authorize selecting either
  execution. Packet indexing, ACE warming, and downstream fanout remain blocked until the
  existing lifecycle mechanism records one canonical owner and the other as duplicate/superseded
  evidence without deleting history. Receipt: `docs/reports/current-graphify-execution-owner-resolution-v1.json`.
- **Explicit packet bridge recheck 2026-09-15:** ran
  `plan-current-packet-digest-bridge-v1.mjs` against workspace revision
  `sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc` and the validated,
  not-yet-applied execution `74d50c86-8194-45ea-8c3d-61aab737ef83`. The bounded 128-row result is
  `PACKET_DIGEST_BRIDGE_BLOCKED`: `0` canonical content-digest matches, `70` missing packets,
  `58` packets missing content digests, and `0` comparable digest mismatches. The bridge remains
  read-only with `writesPerformed=false`; no packet import, ACE warming, or projection fanout is
  authorized. Receipt: `docs/reports/current-packet-digest-bridge-v1.json`.
- **PACKET-WRITER-OWNER-RECHECK 2026-09-15:** the existing packet writers are not current
  admission owners. `scripts/atlas/upsert-whole-codebase-atlas-packets.mjs` derives packet identity
  from `source_ref` and writes `metadata` without requiring the admitted workspace revision,
  canonical source revision, or whole-source digest. `scripts/atlas/sync-parent-atlas-packets-to-postgres.mjs`
  maps `packet_id`/`source_path` into `atlas_packets` and performs legacy upserts with default
  packet labels. Neither writer can close the current packet digest bridge or safely feed ACE.
  Keep both compatibility/historical surfaces quarantined from current promotion; no writer was
  invoked in this audit.
  stale projections, or nullable legacy rows.
- **Current gate:** `CACHE-RETRIEVAL-IDENTITY-03` remains open with
  `PRODUCTION_SERVER_MANIFEST_PROVIDER = MISSING`, `STRICT_ROUTE_HANDOFF = NOT_PROVEN`, and
  `LIVE_CACHE_READBACK = NOT_RUN`. The optional seams and fixture tests are complete, but they
  do not authorize promotion or imply live cache reuse.
- **Provider reuse audit rechecked 2026-09-15:** existing Atlas scripts can audit individual
  source/binding, packet/chunk, and semantic rows, but none returns the complete
  `SearchRuntimeAceResolverSourcesV1` contract. In particular, the qualified-candidate audit
  still uses historical `graphify_files` aggregation and the current packet/chunk audit is a
  diagnostic join requiring explicit execution/workspace inputs. Neither is safe to expose as
  a route provider. The implementation must compose one read-only provider from an explicitly
  admitted execution cohort, validate the full ordinal/feature row set, and return `null` on
  missing or mixed lineage.
- **Current lineage readback 2026-09-15:** the explicit execution
  `74d50c86-8194-45ea-8c3d-61aab737ef83` against workspace
  `sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc` has 24,456 exact
  source bindings, but zero packet/chunk exact matches. The audit also confirms the hash-grain
  boundary: Graphify has whole-source digests while `codebase_chunk_index` has per-chunk hashes.
  The read-only path timed out on its secondary coverage statement and emitted
  `NOT_RUN_STATEMENT_TIMEOUT`; no cache or database mutation occurred. This keeps the provider
  and strict route handoff blocked until packet/chunk identity reconciliation closes.
- **Packet/chunk reconciliation rerun 2026-09-15:** the existing read-only owner preflight was
  honored for execution `74d50c86-8194-45ea-8c3d-61aab737ef83`. It found 24,456 bound sources,
  16,554 packet-reference matches, 0 canonical packet-digest matches, 3,230 legacy SHA-256
  matches, 627 lineage-reference matches, 7,902 missing packet rows, and 13,324 packet digest
  mismatches. The report classifies this as `PACKET_DIGEST_BRIDGE_MISSING` and advances the
  prerequisite to `PACKET-CHUNK-IDENTITY-OWNER-DECISION-01`; `writesPerformed=false`.
- **Packet digest bridge plan rerun 2026-09-15:** a bounded 25-row read-only sample produced
  0 canonical content-digest matches, 17 missing packets, and 8 packet content-digest
  mismatches. Candidate checksum:
  `sha256:337107db617ff3544330a165f20577e7955dd634010c2983897d61cbff7a8276`.
  Status remains `PACKET_DIGEST_BRIDGE_BLOCKED`; no legacy or synthetic match was promoted.
- **Digest-owner census rechecked 2026-09-15:** `atlas_packets.content_hash` has no live
  production writer; the only identified producer is the non-live Phase 17 demo/e2e path.
  `codebase_chunk_index.content_hash` is produced per chunk by the full-repo indexer, while
  `atlas_source_refs.content_hash` is per-symbol/per-source-ref and may use a non-content
  fallback. These hashes cannot serve as interchangeable packet identity. The missing
  implementation is a canonical packet digest producer/readback bound to the admitted source
  cohort, not another cache adapter.

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

## Cache replay evidence update — 2026-09-15

- [x] Added runtime-environment setup to the isolated lane test configuration.
      `loadRuntimeEnv({ mode: 'development' })` now runs before import-time LLM
      contracts, so tests see the configured local model path without weakening
      the production guard.
- [x] Disposable ACE context-cache replay passed: cold `MISS`, same-identity
      `HIT`, changed ordinal checksum `MISS`, and cleanup attempted. Receipt:
      `docs/reports/ace-context-cache-replay-v1.json`. Focused cache/prefill
      tests pass 13/13; canonical writes remain false.
- [x] `CACHE-PREFILL-02` full identity matrix completed 2026-09-15. The earlier
      disposable replay covered one changed field; the dedicated fixture now covers
      the complete invalidation matrix. `CACHE-PREFILL-03` remains open for live
      readback and explicit cache-write effect accounting.

## Live cache and caller recheck — 2026-09-15

- [x] Disposable live ACE context-cache replay rechecked against Valkey: cold `MISS`,
      same-identity `HIT`, changed identity `MISS`, and cleanup attempted. The receipt
      records `cacheWritePerformed=true`, `canonicalWritesPerformed=false`, and
      `canonicalAuthority=false`; this proves disposable cache behavior only.
- [x] Re-ran the read-only ACE caller census: `36` callers classified as `21`
      `LEGACY_QUERY_CACHE`, `13` `STRICT_V2_WIRED`, `2` diagnostic-only, and `0` dead.
      The census reports `writesPerformed=false`.
- [ ] `CACHE-PREFILL-03` and `CACHE-RETRIEVAL-IDENTITY-03` remain open. No production
      route currently supplies a server-admitted `ContextManifestV2` plus complete
      `RetrievalCacheIdentityV1`; client revisions and legacy cache entries remain
      degraded/unqualified until the current source→packet→chunk authority provider
      is proven.
- [ ] The exact-duplicate Graphify owner plan remains `DUPLICATE_EQUIVALENT_EXECUTIONS`
      with two candidates and one evidence signature, but `safeToApply=false` and
      `canonicalAuthority=false`. No execution history was changed.
- [ ] Rechecked the packet writer boundary: `5` writer surfaces were found, with `1`
      revision-bound contract, `2` legacy SHA-only paths, and `2` unqualified or
      schema-drift-blocked paths. The live revision contract is only `PARTIAL_PROVEN`;
      no canonical packet digest write or current source→packet→chunk promotion is
      authorized until the exact source-byte bridge and writer readback pass.

## Current lineage recheck — 2026-09-15

- [x] Re-read the selected execution source-binding plan: `24,456` root members,
      `24,456` existing workspace bindings, `0` missing source references, and `0`
      candidate bindings. The source-binding layer is complete for this admitted
      root cohort and performed no writes.
- [x] Re-ran the packet/chunk identity reconciliation: `0` canonical packet digest
      matches, `7,902` missing packet rows, `13,324` digest mismatches, and `627`
      packet/lineage matches. Status remains `PACKET_DIGEST_BRIDGE_MISSING`.
- [x] Re-ran the bounded graph ordinal roundtrip: `23` graph nodes bound, `0` unbound,
      status `GRAPH_CANDIDATE_ORDINAL_ROUNDTRIP_PROVEN_BOUNDED`.
- [ ] Current graph promotion remains blocked: the graph readiness audit reports `16`
      observations but `0` revision-qualified edges, status
      `CURRENT_GRAPH_ARTIFACT_BLOCKED_ON_STALE_PROJECTION`.

## Strict stream-cache isolation — 2026-09-15

- [x] Strict callers of `streamFromProviderAndCache()` now bypass both legacy
      message-only cache reads and writes. Revision-qualified completions remain
      owned by `runChatCompletion()` and its exact-answer cache, preventing an
      unqualified stream-cache alias from surviving a source/model identity change.
      Focused cache/action coverage passed `17/17` tests.
- [ ] `CACHE-PREFILL-03` and `CACHE-RETRIEVAL-IDENTITY-03` remain open: no
      server-admitted production manifest handoff or live canonical cache readback
      has been proven.

## Indexing and strict-stream recheck — 2026-09-15

- [x] Hardened `audit-atlas-indexing-surfaces.mjs` with per-run temporary report
      replacement so Windows report races cannot invalidate an otherwise read-only
      audit. The refreshed receipt confirms PostgreSQL 18.4, `vector 0.8.3`, GIN/
      FTS/trigram indexes, and HNSW lanes are present; `codebase_chunk_index` has
      `179,324` rows, with `55,169` populated on the active `semantic_768` halfvec
      lane and `124,868` on the separate 768 vector column.
- [x] Strict streaming callers now bypass legacy message-only cache reads and
      writes; focused cache/action coverage passed `17/17`. This prevents an
      unqualified alias but does not promote any production caller.
- [ ] Live ACE admission remains unproven: current reconciliation still reports
      no `ACE:packet_latest`, no populated SOM/ACE cluster index, and no BitFrost
      telemetry. Qdrant `codebase_chunks_768` is a rebuildable 768-dimensional
      projection, not proof of current PostgreSQL-to-ACE lineage.

## Current authority and packet/chunk gate recheck — 2026-09-15

- [x] Re-ran the Graphify owner planner: `DUPLICATE_EQUIVALENT_EXECUTIONS`, two
      candidates, one evidence signature, preferred execution
      ordering is now explicitly absent; candidate IDs are report-sorted only.
      The planner no longer selects by completion time or UUID. No history was
      changed and `safeToApply=false`.
- [x] Ran the bounded packet digest bridge for `128` members. It found `0`
      canonical content-digest matches, `70` missing packets, and `58` digest
      mismatches; no writes occurred.
- [x] Re-ran the explicit workspace→packet→chunk join. It found `24,456` exact
      Graphify sources but `0` packet content matches and `0` exact packet/chunk
      sources. The current join remains `CURRENT_PACKET_CHUNK_JOIN_MISSING`.
- [ ] Do not admit ACE, semantic, Qdrant, or GPU projections until one Graphify
      execution is lifecycle-authorized and the canonical packet digest producer
      yields exact source-byte readback.

## Packet digest classification hardening — 2026-09-15

- [x] Corrected the read-only packet bridge planner so a packet row with a
      missing `atlas_packets.content_hash` is classified as
      `PACKET_CONTENT_DIGEST_MISSING`, not falsely reported as a digest mismatch.
      Digest disagreement remains separately classified as
      `PACKET_CONTENT_DIGEST_MISMATCH`; neither state is promotion-eligible.
- [ ] The post-change live rerun could not complete because PostgreSQL at
      `127.0.0.1:5434` reset the connection and then refused it. No database or
      projection write occurred; rerun the same planner after PostgreSQL health
      is restored.
- [x] Hardened the packet bridge failure path: database connection/query errors
      now emit an atomic `POSTGRES_UNAVAILABLE` receipt with the explicit error,
      zero sampled rows, `safeToApply=false`, and `writesPerformed=false` instead
      of terminating without a current report.
- [x] Extracted packet-digest classification into a pure helper and added Node
      coverage for missing canonical digests versus true mismatches. The helper
      test passes `2/2`; no I/O or persistence is performed by the test.
- [x] Re-ran the full packet/chunk reconciliation after the classification fix:
      `24,456` binding sources, `0` canonical packet digest matches, `16,454`
      packet rows with missing canonical digest, `20` true digest mismatches,
      `3,230` legacy-only matches, and `627` packet/lineage matches. This makes
      the missing canonical digest producer the primary P0; no writes occurred.

## PostgreSQL index and Drizzle mirror status — 2026-09-15

- [x] `npm run schema:migrations:check` passes (`drizzle-kit check`). This proves
      the Drizzle migration journal is internally consistent; it does not prove
      that the live database and TypeScript schema are identical.
- [ ] Live Drizzle mirror is not fully reconciled. The read-only contract audit
      checked `8` tables: `3` static/live aligned, `1` live table missing, and
      `10` remaining static/live blocker classifications. Current blockers include
      `feature_registry` missing live, index drift on `kanban_tasks` and
      `nes_chrom_packets`, and column drift on `task_semantic_packets`,
      `atlas_packets`, `parent_atlas_documents`, and `route_runtime_packets`.
- [x] PostgreSQL indexing surfaces are present in the live audit: PostgreSQL
      `18.4`, `vector 0.8.3`, GIN/FTS/trigram indexes, and HNSW indexes are
      observed. This is index presence, not proof of current ACE admission or
      source→packet→chunk authority.
- [ ] No migration or schema apply is authorized from this receipt. Resolve the
      migration-owner classifications first, then use an explicit additive
      migration and rerun the live mirror audit.
- [x] SvelteKit 2/Parent Atlas Studio exposes `npm run dev:gpu` through
      `scripts/startup/dev-gpu-runtime.mjs`. The command starts the GPU-aware
      development runtime and Vite; it does not run migrations, reconcile Drizzle,
      populate ACE, or prove Qdrant/Graphify lineage. It was not started during
      this audit.

## Fresh live indexing and ACE reconciliation — 2026-09-15

- [x] The direct PostgreSQL indexing audit reached PostgreSQL `18.4` with
      `vector 0.8.3`, `pg_trgm`, and `pg_search`. Current counts are
      `atlas_packets=61,718`, `atlas_packet_features=61,718`, and
      `codebase_chunk_index=189,957`. GIN/FTS/trigram and HNSW definitions are
      present on the packet/chunk search surfaces.
- [ ] Canonical `semantic_768` remains partial: the active halfvec column has
      `55,169/189,957` populated rows. Other 768-dimensional columns and Qdrant
      points are separate projections and cannot fill this admission gap.
- [x] Qdrant `codebase_chunks_768` is reachable and currently reports
      `243,888` 768-dimensional vectors. This proves projection availability,
      not PostgreSQL equivalence, current source lineage, or ACE admission.
- [ ] Live ACE admission remains absent in the reconciliation probe:
      `ACE:packet_latest` has no packet, the SOM/ACE cluster index is empty, and
      BitFrost telemetry is absent. `AceTopRetrievalCacheEntry.identity` remains
      optional for legacy compatibility; production admission must require
      `RetrievalCacheIdentityV1`.
- [ ] The live reconciliation probe also reports missing package aliases and
      unavailable optional services (embed `:8081`, Neo4j browser, and several
      legacy script aliases). These are not evidence that PostgreSQL indexes are
      missing, but they prevent claiming a complete `dev:gpu` runtime proof.

## Current Graphify authority recheck — 2026-09-15

- [x] Re-ran the read-only execution-owner planner. It still finds exactly two
      qualifying terminal executions (`0dba1c0d-2cf7-4f35-a61b-c77956f60d3d` and
      `74d50c86-8194-45ea-8c3d-61aab737ef83`) with one shared immutable evidence
      signature.
- [ ] Canonical execution ownership remains unresolved. The planner correctly
      leaves `preferredExecutionId=null` and refuses timestamp/UUID selection;
      `safeToApply=false` and `writesPerformed=false` remain required.
- [ ] Because no lifecycle-authorized execution owner exists, the packet digest
      bridge, semantic admission, ACE production cache admission, and Qdrant
      equivalence gates remain downstream-blocked. The next required action is
      an explicit owner decision or an existing lifecycle classification, not a
      new index or cache writer.

## Explicit packet-digest bridge recheck — 2026-09-15

- [x] Re-ran the bridge against the admitted workspace revision
      `sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc`
      and execution `74d50c86-8194-45ea-8c3d-61aab737ef83` in bounded read-only
      mode. The sample contained `500` source memberships.
- [ ] The bridge remains blocked: `0` canonical content-digest matches,
      `428` packets with missing canonical content digests, `71` missing packet
      references, `1` legacy-digest-only row, and `0` true digest mismatches in
      this sample. `writesPerformed=false` and no promotion was authorized.
- [ ] This confirms the immediate missing producer is canonical whole-source
      packet digest materialization/readback, not PostgreSQL index creation. The
      duplicate execution owner decision must precede any packet or ACE write.

## ACE production-caller recheck — 2026-09-15

- [x] Ran the existing read-only ACE prompt-cache caller audit. It found `2`
      production callers and `0` strict `RetrievalCacheIdentityV1` handoffs;
      both callers remain legacy or uncertified.
- [ ] Production ACE cache admission remains blocked. The cache entry type and
      revision-aware implementation exist, but no live caller currently proves
      the complete server-owned manifest, source cohort, and checksum handoff.
      Audit receipt reports `CACHE_PREFILL_CALLER_HANDOFF_BLOCKED` and
      `writesPerformed=false`.
- [x] The caller audit identifies the exact remaining surfaces:
      `sveltekit-frontend/src/lib/server/ai/streaming-cache.ts:108` and
      `sveltekit-frontend/src/routes/api/v1/chat/completions/+server.ts:34`.
      Neither emits the complete `ContextManifestV2.identityChecksum`, model,
      template, tool-schema, rendered-request, generation-control, and query
      identity bundle required for strict production admission.

## Legacy ACE fusion guard — 2026-09-15

- [x] Updated `sveltekit-frontend/src/lib/server/features/rag/multi-lane-retrieval.ts`
      so unqualified legacy ACE cache hits are marked `degraded=true` and are
      excluded from RRF/fusion. They remain observable for compatibility, but
      cannot become a current retrieval vote without `RetrievalCacheIdentityV1`.
- [x] Focused ACE cache tests pass `4/4`; OpenSpec strict validation and targeted
      diff checks pass.
- [ ] The frontend-wide TypeScript check remains red on unrelated existing
      dependency/schema/type errors. This guard introduced no reported error in
      its changed file, but full build health is not yet proven.
- [x] Added regression coverage in
      `sveltekit-frontend/src/lib/server/features/rag/multi-lane-retrieval.spec.ts`:
      degraded legacy ACE hits are excluded from fusion, while non-degraded
      revision-qualified ACE hits remain eligible. The focused suite passes
      `2/2` tests.

## Indexing audit availability recheck — 2026-09-15

- [ ] The latest indexing audit could not establish live PostgreSQL or Qdrant
      query availability: it recorded `POSTGRES_UNAVAILABLE` and
      `QDRANT_UNAVAILABLE`. Direct TCP probes to PostgreSQL `:5434` and Qdrant
      `:6333` passed, so this is a query/health-probe availability issue rather
      than proof that the services are stopped.
- [ ] Until the read-only queries succeed again, current table counts, index
      state, and projection parity must be treated as unavailable rather than
      copied from the previous receipt. No migration, cache, or projection write
      was performed.

## Direct store availability recheck — 2026-09-15

- [ ] Direct Qdrant read of `codebase_chunks_768` timed out after `10` seconds.
- [ ] Direct PostgreSQL read through `docker exec` failed because Docker
      Desktop's Linux engine returned an API/engine error. TCP reachability alone
      is therefore insufficient to claim database query availability.
- [ ] Current indexed counts and PostgreSQL-to-Qdrant parity remain unverified
      until the underlying services answer read-only queries. No service restart,
      migration, cache population, or projection write was attempted.
- [ ] `docker info` confirms the `desktop-linux` Docker context is failing its
      server request with API `500`; the Docker CLI is installed, but the engine
      is not serving container metadata. This must be repaired before rerunning
      the live PostgreSQL/Qdrant evidence audit.
- [ ] A subsequent read-only status poll reports Docker Desktop `Status=starting`
      with session `9241213b-434c-4270-a8e4-ee656c56374f`; the engine is not yet
      terminally failed, but live store verification must wait for `running`.

## Run Receipts
- wf-mcp-bitfrost-ace-optimization-fork-20260905/MCP_BITFROST_ACE_OPTIMIZATION_FORK#1: MCP/BitFrost/ACE synthesis optimization fork (state=succeeded)
- [ ] CANONICAL-IDENTITY-V1 POINTER (2026-09-21): canonical object identity (symbol/file/chunk discriminants, mandatory workspaceRevision + sourceRevision, no 'unknown'/latest-row inference, representation/execution/transport ids and CandidateOrdinal are NOT canonical identity) is owned by `CANONICAL-IDENTITY-V1-SPEC-01` in `openspec/changes/parent-atlas-retrieval-lineage-dag-convergence/tasks.md`. This change SHALL reference that contract and not define its own identity rules; it may add representation-, execution-, feature-, cache-, transport- or projection-specific identities only. Pointer only; no scope change here. Spec status: SPEC_DRAFT (not signed off).
