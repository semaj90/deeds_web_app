## 1. Triage — establish ground truth before touching anything

- [x] 1.1 **ANSWERED, 2026-08-23.** `git log -5 --oneline -- .../qdrant-semantic-projection.ts` (plus a full `git show`) identifies the exact origin: commit `cdae3e454b` "feat(atlas): align semantic 768 retrieval lane" (2026-08-22 23:34:32, subject line only — zero commit-message body, no justification recorded). Its diff flips `ATLAS_CANONICAL_SEMANTIC_REPRESENTATION`/`ATLAS_CANONICAL_SEMANTIC_DIMENSION` from `'semantic_512'`/`512` to `'semantic_768'`/`768`, `QDRANT_SEMANTIC_COLLECTION` from `'codebase_chunks_512'` to `'codebase_chunks_768_v2'`, and touches 13 files across the retrieval/embedding stack in the same commit (`qdrant-recall.adapter.ts`, `retrieval-executor-policy.ts`, `embeddinggemma-task-runtime-v1.ts`, `qdrant-semantic-indexes.ts`, `qdrant-semantic-projection.test.ts`, `qdrant-semantic-scorer.ts`, `semantic-512.ts`, `embedding-contract-768.ts`, `embedding-contract.ts`, `ollama-embed.ts`, `grpc/embedding-client.ts`, `retrieval/embedding-service.ts`). A later commit, `a2e4dab329` (2026-08-23 02:33:10, ~3 hours after), builds directly on top of this flip (updates `canonical-chunk-contract.ts`'s enum to match) but did NOT originate it — `cdae3e454b` is the actual origin commit. **This flip is still live in the current codebase** — verified directly: `sveltekit-frontend/src/lib/server/atlas/retrieval/qdrant-semantic-projection.ts:8` currently reads `export const ATLAS_CANONICAL_SEMANTIC_REPRESENTATION = 'semantic_768' as const;`, and `canonical-chunk-contract.ts`'s `CanonicalRepresentationNameSchema` enum no longer contains `'semantic_512'` at all.
- [x] 1.2 **ANSWERED.** Fully committed, not working-tree-only — both `cdae3e454b` and `a2e4dab329` are real commits in `main`'s history, confirmed via `git cat-file -t` and `git log`. Not something to "hand back" as uncommitted work; this is a committed, live architectural decision that needs an explicit reconciliation call, not a revert-vs-keep judgment call on uncommitted diffs.
- [x] 1.3 **ANSWERED, with full chronology — this is a genuinely serious finding, not just doc drift.**
  - `openspec/changes/parent-atlas-semantic-768-canonical-contract/proposal.md` — **dated 2026-08-03** (`git log` on its only commit, `e5efcb712f`). Its own status line reads `**Status**: PROPOSED — documentation-only, no code changes yet.` It never mentions `semantic_512` anywhere in the file — it was written before the 512-canonicalization decision existed, arguing against an even-earlier 384-dim framing, not against 512.
  - **A third, related-but-distinct stale document found 2026-08-23**: `openspec/changes/parent-atlas-768-dim-migration/SPEC.md`, dated **2026-08-11** — an unfinished "classify every 384-hardcoded file as bug-vs-legitimate" inventory, explicitly `INVENTORY ONLY — not yet triaged, not yet executed`, triggered by an even earlier root `CLAUDE.md` policy (2026-07-27) that predates both the 512-freeze (Aug 19) and the 768-proposal (Aug 3 — wait, Aug 3 predates Jul 27's stated trigger date is inconsistent with the doc's own Aug 11 date citing a Jul 27 trigger, which is fine — Jul 27 < Aug 3 < Aug 11 < Aug 19 < Aug 22, a real chronological sequence of at least 4 distinct positions on this question across less than a month). This file's classification work was never executed — flagged with a stop-work note pointing back to this reconciliation record rather than adding a fourth stale conclusion.
  - **This is not two documents in conflict, it is at least three, each written from what its own author believed was current policy at the time, none of which reconciled with the one before it**: Jul 27 CLAUDE.md policy (768 canonical) → Aug 3 proposal (reaffirms 768, corrects a 384 framing) → Aug 11 inventory (768 canonical, unexecuted) → Aug 19 operator-corrected freeze (512 canonical, supersedes all three above) → Aug 22 code commit (reverts to 768, cites none of the above). The pattern is a policy that keeps getting re-decided by whoever is working the area that session, without checking what the last session decided.
  - `openspec/changes/parent-atlas-semantic-512-canonicalization/` — has 5+ commits including `Freeze semantic_512 canonicalization proof sequence`, `Freeze reconciled semantic512 training lineage`, spanning after Aug 3. Root `CLAUDE.md`'s own embedding-dimensions-policy section explicitly calls this the frozen, **operator-corrected** decision (dated 2026-08-19 in that doc's own text): *"the persisted EmbeddingGemma corpus that actually exists is 512-dimensional; a production/canonical 768-dimensional Qdrant corpus was not created. Do not promote an assumed 768 store merely because EmbeddingGemma's native output is 768."* This session's own `MEMORY.md` independently states the same frozen constant.
  - **Conclusion: `cdae3e454b` (2026-08-22 23:34) took a stale, never-formally-accepted, pre-freeze proposal from 2026-08-03 and implemented it directly in live code, silently reversing an operator-frozen decision from 2026-08-19 — with no commit-message acknowledgment that a reversal was happening, no update to either OpenSpec doc's status (the 768 proposal is still marked "PROPOSED" today; the 512 doc is still marked frozen/authoritative in CLAUDE.md today), and no reconciling OpenSpec change opened for the decision.** This is exactly the "two independently-numbered/competing canonical decisions coexisting under the same name, sharing no relationship" pattern this repo's own `CLAUDE.md` "Duplication Prevention" section warns about — except here it's not dead code, it's the **live, current canonical-representation contract**, actively diverging from the repo's own documented policy right now.
  - **Not resolved by this task**: whether 768 SHOULD become canonical (there may be good reasons — EmbeddingGemma's native dimension is 768, and MRL-prefixing to 512 does lose information) is a real, legitimate architecture question. But it needs to be decided *as* a decision — reconciling the 512-freeze's own stated reasoning (an actual persisted 512-dim corpus already exists; a 768 corpus reportedly did not, per the 512 doc's own framing) — not silently overwritten by resurrecting an old unaccepted proposal. **Flagging as the single highest-priority unresolved item found in this entire review session.** Do not let a future session "fix" `qdrant-semantic-projection.ts` in either direction without first getting an explicit operator ruling on which corpus (512 or 768) is actually populated and query-able in the live Qdrant/Postgres stores today — this task's own section 2 below already anticipated exactly this need.
  - **Ground-truth evidence gathered 2026-08-23, live, to inform that operator ruling (not a decision, just the data)**:
    - **Postgres** (`codebase_chunk_index.content_embedding`, this repo's own documented canonical-truth column): `vector_dims()` = **768**, 52,380 populated rows, **populated 2026-07-04 through 2026-07-16** — a full month before the Aug 19 freeze to `semantic_512`.
    - **Qdrant `codebase_chunks_512`**: exists, `green`, 53,379 points, real non-dummy 512-dim vectors sampled directly (not all-same-value), payload explicitly carries `projected_from_768d` — confirming this collection is a **derived MRL projection**, not an independent primary source, exactly as the 512-freeze doc itself describes its own contract (native 768 → MRL prefix [0:512] → L2 renorm).
    - **Qdrant `codebase_chunks_768_v2`**: exists, `green`, 52,380 points (exact match to Postgres's populated-row count — a clean 1:1 mirror), real non-dummy 768-dim vectors, sampled payload `indexed_at: 2026-07-29T17:04:58Z` — **also predates the Aug 19 freeze by three weeks.**
    - **Qdrant `codebase_chunks_768`** (older, non-`_v2` generation, already flagged as a separate finding in section 5 below): 105,762 points — roughly double either of the above.
    - **What this means, stated carefully — this is evidence, not a ruling**: the 512-freeze doc's own stated premise ("a production/canonical 768-dimensional Qdrant corpus was not created") does not match what is directly observable in the live stores today, and — per the `codebase_chunks_768_v2` and Postgres population timestamps above — did not match at the time the Aug 19 freeze was written either. Either the freeze decision was made without visibility into `codebase_chunks_768_v2`'s existence, or there is a reason it didn't count as "production/canonical" at the time (e.g. considered staging-only, unindexed, or incomplete then) that isn't recorded in the freeze doc itself and that this review has no visibility into. **This does not settle whether 512 or 768 should be canonical** — Postgres being natively 768-dim doesn't by itself make 768 correct if there was a deliberate, informed reason to standardize on the smaller MRL-projected lane (index size, query latency, a downstream consumer contract, etc.) — but it does mean the freeze decision's own stated factual premise needs re-checking against current reality before anyone treats it as still self-evidently correct.

## 2. Fix the functional break (finding #2) — only after 1.1-1.3

- [x] 2.1/2.2 **RESOLVED, 2026-08-23 — operator ruling obtained.** Presented with the full ground-truth
  evidence in section 1 above, the operator confirmed **`semantic_768` is canonical** — i.e. task
  2.2's branch, not 2.1's. Live code (`qdrant-semantic-projection.ts`'s `ATLAS_CANONICAL_SEMANTIC_REPRESENTATION
  = 'semantic_768'`) already matches this and does NOT need reverting. Root `CLAUDE.md`'s
  embedding-dimensions policy has been rewritten to state this as final, dated, resolved policy
  (no longer "STALE relative to..."), with the added truncation rule task 2.2 anticipated would be
  needed: 512d/384d derived lanes remain legitimate but must be produced from an already-indexed,
  already-validated 768d source, never speculatively. Verified `semantic-512.ts`'s
  `projectEmbeddingGemmaToSemantic512()` already structurally enforces the "already have a real
  768 vector" half of that rule (it takes `native768: Float32Array` as a required input — it
  cannot be called without one), and the file already self-documents as "reference-only... must
  not inherit the active semantic_768 authority constants." The "already indexed AND validated"
  half (not just computed) is a backfill-pipeline-level concern, not verified this pass — flagged
  as a lighter follow-up, not blocking. Both competing OpenSpec docs updated to reflect this:
  `parent-atlas-semantic-768-canonical-contract/proposal.md` now `ACCEPTED`;
  `parent-atlas-semantic-512-canonicalization/tasks.md` now marked `SUPERSEDED` (kept as historical
  record, not deleted); `parent-atlas-768-dim-migration/SPEC.md` unblocked to proceed against its
  original (now-confirmed-correct) premise.
- [ ] 2.3 Still open: add or confirm an integration test that actually calls `/api/admin/atlas/synthesize`'s semantic512 branch end-to-end, so this class of always-throws regression is caught by CI next time, not by a code-review pass discovering it after the fact. Not done this pass — the dimension-choice question was the blocker for this task section; this sub-item is independent follow-up work.

## 3. Fix the spec/test break (finding #3)

- [x] 3.1 **RESOLVED, verified 2026-09-01.** Already fixed by an intervening change (unclear which
  session/commit): `api-contract-observation-v1.ts` now exports BOTH `buildApiContractObservationV1`
  (line 140) and `compileApiContractObservationV1` (line 207) — the spec's original dual import is
  valid again, not a broken reference to a removed function. Ran the spec directly: 5/5 pass.

## 4. Investigate, don't assume (finding #4 — AST byte offsets)

- [x] 4.1 **RESOLVED — verified against the installed native binding, 2026-08-31.** The runtime reports `startIndex=19` for a declaration preceded by `café` and `é`; the UTF-8 prefix is 21 bytes, matching the provider's `Buffer.byteLength(source.slice(0, startIndex), 'utf8')` conversion. This installed binding therefore exposes JavaScript string/code-unit indices at the provider boundary; the reviewer's claim that the live value is already a UTF-8 byte offset does not match the observed runtime.
- [x] 4.2 **PROVEN — existing Unicode regression passed, 2026-08-31.** `node-tree-sitter-ast-provider.spec.ts` passed 6/6, including CRLF plus accented text before a declaration and a UTF-8 byte-slice readback assertion. No provider change was made because double-conversion was not confirmed.

The separate embedding-runtime convergence issue remains open: `retrieval/embedding-service.ts` still exposes legacy Ollama/`dense_384` compatibility surfaces. It must be classified before changing callers; this AST finding does not authorize a retrieval migration.

## 5. Reconcile the Qdrant collection rename (findings #5, #6)

- [x] 5.1 **ANSWERED — verified live, 2026-08-23, via direct Qdrant `/collections` calls (no MCP wrapper needed for this read).** `codebase_chunks_768_v2` is **not** backfilled to parity: `codebase_chunks_768` has **105,762** points (status `green`, fully indexed); `codebase_chunks_768_v2` has **52,380** points (also `green`/fully indexed, but under half the size). The two collections are confirmed NOT interchangeable today.
  - **Worse than "not yet backfilled" — the payload schemas are structurally different, not just row-count-different.** `codebase_chunks_768`'s payload carries `graphAuthorityScore`, `communityId`/`community_id`/`community_conf`, `pagerank`, `cluster_key`, `tags`, `bm25_text`, `lane_ids` — the exact fields the Karpathy authority blend (`0.4·PageRank + 0.3·attention + 0.3·authority`, documented in root `CLAUDE.md`) and ACE tag-boost logic depend on. `codebase_chunks_768_v2`'s payload is a leaner, versioned-identity schema (`postgres_id`, `representation_id`, `embedding_model`, `model_revision`, `model_revision_state`, `projection_revision`, `indexed_at`) with **none of the graph/authority/community/tag fields present at all**. `_v2` is not a strict superset or even a compatible replacement of `_768` as currently populated — switching callers to it today would silently drop PageRank/authority/tag-based ranking signals, not just serve fewer results.
  - **Confirmed genuinely split in code, not just theoretical**: `src/lib/server/embedding/embedding-contract-768.ts:23` declares `export const CANONICAL_QDRANT_COLLECTION = 'codebase_chunks_768_v2'` — i.e. the contract layer already declares `_v2` canonical — and `embedding-contract.ts` + `src/lib/server/acp/packet-assembler.ts:103,262` (the ACP layer) follow that and default to `_v2`. But `src/lib/server/search/turbovec-search.ts` (8 separate hardcoded occurrences) and `src/mcp/trace-mcp-server.ts` (2 occurrences, including the code path behind the `atlas.packet_search` MCP tool verified live and working in this same review session) still hardcode the OLD `codebase_chunks_768`. **Net effect**: the ACP/packet-assembler lane and the TurboVec/TRACE-MCP lane are reading from two different, non-overlapping-in-content Qdrant collections right now, with the "canonical" one being the smaller, less-enriched one.
- [x] 5.2 **RESOLVED — this question was already answered by a separate, more thorough investigation
  recorded in root `CLAUDE.md`, verified live 2026-09-01.** `src/lib/server/atlas/qdrant-collection-contracts.ts`
  explicitly documents both collections as intentionally separate, not stale duplication:
  `codebase_chunks_768` is the "older source contract" (multi-vector: content/error/signature +
  sparse bm42, carries the graph/authority/community/tag payload fields this file's 5.1 finding
  noted); `codebase_chunks_768_v2` is the "EMB3A target contract" (dense-only `content` vector,
  revision-filterable, leaner identity-only payload) — an **in-progress migration target**
  referenced by 43 live files, not a finished replacement. Root `CLAUDE.md`'s explicit hard rule:
  "Do not merge or delete either without the person driving the EMB3A migration." **This closes the
  finding as already-governed, not as fixed-by-code** — no constant-propagation or collection
  consolidation was performed in this task, and none should be, until that migration owner acts.
  `turbovec-search.ts`/`trace-mcp-server.ts`/`packet-assembler.ts`'s independent hardcoded literals
  remain as-is; re-open only if the EMB3A migration reaches a state where propagating one constant
  becomes safe.

## 6. Resolve the dual-embedder duplication (finding #7)

- [x] 6.1 **RESOLVED, verified live 2026-09-01.** No contradictory docstrings remain.
  `semantic-512.ts` now self-identifies unambiguously as **BACKEND** (a derived MRL projection
  utility): its own constants are named `LEGACY_SEMANTIC_REPRESENTATION`/`LEGACY_SEMANTIC_DIMENSION`/
  `LEGACY_PROJECTION_METHOD`, and its header comment states "reference-only MRL adapter and must
  not inherit the active semantic_768 authority constants." `semantic-768.ts` is unambiguously
  **CANONICAL_OWNER**: it imports `ATLAS_CANONICAL_SEMANTIC_DIMENSION`/
  `ATLAS_CANONICAL_SEMANTIC_REPRESENTATION` directly from `qdrant-semantic-projection.ts` (the
  single source of truth) rather than declaring its own constants. This matches the 2.1/2.2
  operator ruling above (768 canonical, 512 a legitimate derived lane) — no further code change
  needed; this was a documentation/naming classification, and it's already correct.

## 7. Low-priority cleanup (finding #8)

- [x] 7.1 **FIXED, 2026-09-01.** `fastJsonParse()` now does a single `Buffer.from(input, 'utf8')`
  encode, reused for the cache-key hash (`fnv1aKey()` now takes a `Buffer`, not a `string`, forcing
  callers to pass the shared encode rather than silently re-encoding). The OOM-guard byte-length
  check still uses `Buffer.byteLength()` first (does not materialize bytes, cheap to call before
  deciding whether to proceed at all) — the actual buffer allocation only happens once, after that
  guard passes. Pure perf, no behavior change; only call site updated consistently.
