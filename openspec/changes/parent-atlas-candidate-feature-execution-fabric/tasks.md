# Tasks — Parent Atlas Candidate Feature Execution Fabric

## P0 — identity and revision closure

- [x] CAND-01 Define `CanonicalCandidateV1` with CandidateOrdinal + canonicalId + packetKey + treeNodeId + symbolVersionId + revision axes. (`sveltekit-frontend/src/lib/server/atlas/features/canonical-candidate-v1.ts`, `CanonicalCandidateV1Schema` — identity-only fields, `candidateOrdinal` lives on the separate `CandidateOrdinalMapEntryV1` extension, never on the bare identity type. 10/10 vitest pass.)
- [x] CAND-02 Add deterministic ordinal-map materializer and rerun determinism fixture twice. (`buildCandidateOrdinalMapV1()` sorts by a stable identity key — not input order — before assigning ordinals; test proves shuffled input order yields identical `snapshotRevisionHash` and identical ordinal assignment across two runs; rejects duplicate canonical identity within one set.)
- [x] CAND-03 Prove Qdrant point id, cuGraph gpuNodeId and CandidateOrdinal cannot substitute for canonicalId. (`resolveCandidateOrdinal()` requires the exact map an ordinal was assigned under — same ordinal in two differently-revisioned maps resolves to different identities, proven directly; `canonicalId` is schema/test-asserted to never equal a bare integer or the stringified ordinal, the historical Qdrant/GPU-node-id substitution failure mode this gate targets.)
- [x] REV-01 Materialize `RevisionDependencyGraphV1` for source → AST → graph/semantic → candidate → feature → rerank artifacts. (`sveltekit-frontend/src/lib/server/atlas/features/revision-dependency-graph-v1.ts` — fixed DAG topology reusing `ComputationStageV1`'s existing stage vocabulary from CACHE-01 rather than inventing a second one; `findStaleDownstream()` proves only true descendants of a changed stage are marked stale, siblings are not; `isRevisionSetConsistent()` rejects a claimed revision that doesn't match the live graph. 9/9 vitest pass.)
- [x] CACHE-01 Define `ComputationArtifactV1` and content-addressed cache key contract. (**Already existed, unmarked** — `sveltekit-frontend/src/lib/server/atlas/cache/computation-cache-key.ts` fully implements this: `ComputationCacheDescriptorV1`/`ComputationArtifactReceiptV1`, canonicalized-JSON sha256 cache key, and `canReuseComputation()` which only trusts a `status: 'proven'` receipt for the exact derived key — matching this change's DRY-reuse intent. 3/3 existing tests pass. Zero live callers yet (schema+determinism proven, not yet wired to a producer) — wiring a real consumer is separate follow-on work, not required by this gate's wording.)

**Note (this session): resolved a real ordinal-registry duplication risk before building REV-01/CACHE-01.** An untracked staging bundle at repo-root `parent-atlas-gpu-context-tranche/` (own `README.md`, own `openspec/gpu-context-compiler-tasks.md` with GPU-CTX-01..08 gates) proposes dropping an `OrdinalRegistryV1` contract into `sveltekit-frontend/src/lib/server/atlas/tensors/` that overlaps almost exactly with this change's `CanonicalCandidateV1`/`CandidateOrdinalMapV1` (CAND-01/02/03, above). Compared both: the staged bundle's `OrdinalRegistryV1` trusts caller-supplied ordinals and only validates 0..N-1 density (weaker than CAND-02's "deterministic regardless of fetch order" requirement, which `buildCandidateOrdinalMapV1()` satisfies by sorting on content before assigning ordinals) — but its field name `ordinalMapRevision` directly matches what the *already-live* `tensor-artifact-contract.ts` expects in three real manifest types, whereas this change's `snapshotRevisionHash` didn't. Resolution: kept `canonical-candidate-v1.ts` as the canonical owner (better-specified, already tested/checked in) and added `ordinalMapRevisionFor()` as the bridge so it satisfies the existing downstream naming contract. **Did not copy the staged bundle's `ordinal-registry.ts` into the tree** — it would have created a second, competing ordinal-map definition per this repo's own duplication-prevention rule. The staged bundle's other 3 files (`context-feature-batch.ts`, `feature-heads.ts`, `context-token-allocation.ts`, tracked under GPU-CTX-02..06) were not reviewed this pass and remain unevaluated — if that GPU-CTX tranche is still wanted, its ordinal dependency should be repointed at `canonical-candidate-v1.ts` rather than at its own bundled `ordinal-registry.ts`.

## P0 — queue / artifact transport

- [x] QUEUE-00 Audit existing transport ownership: Postgres transactional outbox → RabbitMQ task/event exchanges; Redis list is UI/SSE progress only.
- [x] QUEUE-01 Add `ArtifactAddressV1` for MMAP/Arrow IPC/Postgres/Qdrant/Valkey/GPU-resident immutable artifacts.
- [x] QUEUE-02 Add `ActionWorkItemV1` so queue payloads carry artifact refs, revision-set hash, ordinal selection, budget and executor class instead of dense tensors.
- [x] QUEUE-03 Route artifact work through `enqueueTask()` transactional outbox via `enqueueArtifactWorkItem()`.
- [x] QUEUE-04 Fix event-fabric projection worker type ownership imports (`integration-events.ts` owns code-evidence; `event-fabric.ts` owns the control-loop event types).
- [ ] QUEUE-05 Replace remaining large vector/tensor RabbitMQ payloads (for example `document.embed → vector.index`) with artifact references where profiling shows payload amplification.
- [x] QUEUE-06 Add explicit `artifact.materialized` / `artifact.failed` integration events and non-noop event-fabric handlers. (Added both event types + payload schemas to `event-fabric.ts`'s discriminated union; new `artifact-materialization-event-processing.ts` gives them real handlers — `verifyArtifactMaterialization()` does a genuine `fs.stat` existence check for MMAP/ARROW_IPC locators and honestly reports `EXISTENCE_NOT_CHECKED_FOR_STORAGE` rather than fabricating VERIFIED for Postgres/Qdrant/Valkey/GPU_RESIDENT, which need a live store client this pass didn't add; `recordArtifactFailure()` rejects a malformed failure report instead of no-op-ing past it. Wired into `code-evidence-projection-worker.ts`'s dispatch switch + default handlers, and into the existing analytics projection (`event-fabric-analytics-projection.ts` + 2 new `AnalyticsEventTypeSchema` entries) following the exact pattern the other 6 event types already use. 17/17 tests pass across event-fabric.spec.ts, event-fabric-analytics-projection.spec.ts, event-fabric-dispatch.spec.ts, and the new artifact-materialization-event-processing.spec.ts. Typecheck clean.)
- [x] QUEUE-07 Add single-flight lease/fencing token keyed by ActionKey so duplicate at-least-once deliveries cannot compute the same expensive artifact concurrently. (`sveltekit-frontend/src/lib/server/queue/action-lease-v1.ts` — `requestActionLease()` keyed by the `actionKey` already required on `ActionWorkItemV1`; a concurrent duplicate gets `ALREADY_RUNNING`, not a second execution slot; `complete()`/`fail()` require the exact `fencingToken` the lease was acquired with, so a stale/superseded writer cannot mutate a lease another worker now owns. Store-agnostic contract (`ActionLeaseStoreV1`) with a real, usable `InMemoryActionLeaseStoreV1` — a Postgres/Redis-backed store is separate wiring work, same precedent as CACHE-01.)
- [x] QUEUE-08 Add consumer idempotency proof: duplicate command delivery returns the same immutable output artifact or an existing receipt. (Same file — a redelivery after `complete()` returns `ALREADY_COMPLETED` with the identical `resultArtifactRef` every time, proven across two separate redeliveries in the same test, not just a single cache hit; a `FAILED` lease is immediately reclaimable without waiting for TTL, and an expired `RUNNING` lease is reclaimable after its TTL. 7/7 vitest pass, typecheck clean.)
- [ ] QUEUE-09 Prove publisher-confirm outbox path is the only authoritative durable task publisher; generic publish helper remains convenience/non-authoritative. **NOT PROVEN — real violation found, not fixed (2026-08-21).** `src/lib/server/queue/dispatch-inline.ts`'s own docstring self-describes as "the normal production path" ("When RabbitMQ is available: publishes to queue (normal production path)"), and it calls the generic `rabbitmq-client.ts` publish helpers (`publishDocumentEmbed`/`publishVectorIndex`/`publishCacheInvalidation`/`publishAnalyticsEvent`) directly — bypassing `outbox.ts`'s transactional `enqueueTask()`/publisher-confirm relay entirely. This is not dead/theoretical code: confirmed live callers in 16 real files including `routes/api/evidence/upload/+server.ts`, `routes/(app)/evidence/+page.server.ts`, `routes/api/cases/+server.ts`, `routes/api/chat/+server.ts`, `routes/api/synthesis/generate/+server.ts`. So there are currently **two competing durable-dispatch paths** in production, not one authoritative path with a non-authoritative convenience fallback as this gate assumes. Recording this rather than silently marking it passed or attempting a fix — migrating these 16 callers onto the transactional outbox is a real, cross-cutting production dispatch change (evidence upload, chat, case creation, synthesis) that needs its own reviewed change, not a side-effect of this audit pass.
- [x] QUEUE-10 Add message-size telemetry and fail/redirect when a task envelope exceeds the artifact-reference policy limit. (`sveltekit-frontend/src/lib/server/queue/artifact-envelope-size-policy-v1.ts` — 32 KiB limit; `assertArtifactWorkItemEnvelopeSize()` wired into `enqueueArtifactWorkItem()` in `artifact-work-dispatch-v1.ts`, emits `artifact.envelope.telemetry` via the existing analytics sink for both the passing AND failing case — the rejection itself is visible in telemetry, not just successes — then throws with a message pointing the caller at replacing the inline payload with an `ArtifactAddressV1` reference rather than raising the limit. 4/4 vitest pass (mocked `analytics-sink`), typecheck clean, no regression in the existing `artifact-work-item-v1.spec.ts`.)

## P1 — candidate feature fabric

- [x] FEAT-00 Add `CandidateFeatureRowV1` schema with nullable learned features and availability flags.
- [ ] FEAT-01 Add `CandidateFeatureSnapshotV1` materializer with one row per CandidateOrdinal.
- [ ] FEAT-02 Join semantic/lexical/AST/graph/domain/execution/memory features by ordinal and fail on revision mismatch.
- [ ] FEAT-03 Add CPU reference materializer and GPU gather/scatter/sort/compact challenger.
- [ ] FEAT-04 Require CPU↔GPU ordinal and feature parity receipt.

## P1 — manifold4 / SOM derived projection

- [x] MAN4-01 Add `Manifold4OrientationV1` unit-quaternion schema.
- [x] MAN4-02 Canonicalize antipodal q/-q representations deterministically.
- [x] MAN4-03 Add antipodal-aware similarity and angular-distance helpers.
- [x] MAN4-04 Add tests for unit norm and q/-q equivalence.
- [ ] MAN4-05 Wire existing SOM/manifold producer through this schema and record producer/feature revisions.
- [ ] MAN4-06 Add Qdrant payload migration/validation for manifold4 fields without changing `semantic_768` vector ownership.
- [ ] MAN4-07 Add retrieval ablation: semantic-only vs semantic+SOM vs semantic+manifold4.

## P1 — Qdrant fanout

- [ ] FANOUT-01 Normalize all semantic results to CandidateOrdinal before feature fanout. **BLOCKED (2026-08-21), not attempted — traced the exact live violation and the exact reason CAND-01/02/03 (above) can't be wired in directly this pass.** Live violation: `src/routes/api/admin/atlas/synthesize/+server.ts` assigns `candidateOrdinal` via plain JS array position — `graph.nodes.map((node, candidateOrdinal) => ...)` — then re-assigns it a SECOND time by array position after sorting/slicing (`executionCandidates = candidates.slice(...).map((candidate, ordinal) => ({...candidate, candidateOrdinal: ordinal}))`). The ordinal is not content-derived and changes across pipeline stages — the exact anti-pattern this gate exists to close, and exactly what CAND-02's `buildCandidateOrdinalMapV1()` was built to prevent. Blocker: `buildCandidateOrdinalMapV1()` requires `workspaceRevision`/`sourceRevision` per candidate (CAND-01's identity contract), but the real node type here, `GraphViewNodeV1` (`graph-runtime-contracts.ts`), only carries `id`/`type`/`label`/`packetKey`/`sourceRef`/`hop`/`properties` — no revision fields at all. Wiring CAND-01/02 in here would require either (a) fabricating revision values, which this repo's own rules forbid, or (b) threading real `workspaceRevision`/`sourceRevision` through the graph traversal layer from Postgres — a larger, cross-cutting plumbing change to the graph-traversal/synthesis path, not a "normalize the fanout" fix. Left for a follow-on change once that plumbing decision is made.

  **Also found, not fixed: a real 3-way `CandidateFeatureRowV1` naming collision.** Three independently-defined types share the exact name: `graph-runtime-contracts.ts` (the array-index-ordinal one above, live in `synthesize/+server.ts`), `features/candidate-feature-row-v1.ts` (FEAT-00, this change's OpenSpec-canonical retrieval-ranking schema with real revision lineage), and `neural-routing/contracts.ts` (`{toolId, eligible, values, evidenceRefs}` — a genuinely different domain, query→tool-routing feature rows, not retrieval candidates at all). The first two are a real duplication risk (same domain, same name, different shape, one live and weaker than the other); the third is a naming collision only (different domain) but still risks confusing future greps/imports. Not renamed this pass — renaming a type imported across the codebase is a bigger, higher-risk change than this bounded session should make unreviewed.
- [ ] FANOUT-02 Enforce one logical semantic-lane vote across Qdrant/cuVS/CAGRA executors.
- [ ] FANOUT-03 Add OKF soft-domain filter plan with indexed payload fields and broad-search fallback when confidence is low.
- [ ] FANOUT-04 Cache query-hash + semantic-snapshot-revision + filter-hash + K + executor-revision result artifacts.

## P2 — CrossEncoder

- [ ] CE-01 Define deterministic `RerankDocumentV1` from exact path/symbol/kind/signature/source text.
- [ ] CE-02 Implement backend-neutral `CrossEncoderRerankerV1` preserving CandidateOrdinal.
- [ ] CE-03 Python/PyTorch reference backend first; do not begin with LibTorch/TensorRT.
- [ ] CE-04 Benchmark Qwen3-Reranker-0.6B, mxbai-rerank-base-v2 and BGE-reranker-v2-m3 on frozen Atlas queries.
- [ ] CE-05 Store raw score, rank and optional calibrated score; never fabricate 0.5 when unavailable.
- [ ] CE-06 Add cache key including query, RerankDocument hash, model/tokenizer/instruction/truncation revisions.
- [ ] CE-07 Add VRAM-budget skip receipt and deterministic feature-ranker fallback.

## P2 — exact promotion and reasoning

- [ ] PROMOTE-01 Resolve top candidates to exact source span + AST node/path + graph evidence + revisions.
- [ ] PROMOTE-02 Fail promotion for unresolved/degraded canonical identity.
- [ ] CONTEXT-01 Adopt `ContextManifestV1` as sole DSPy evidence input boundary.
- [ ] DSPY-01 Add typed classify/evidence/DAG/outcome modules.
- [ ] GEPA-01 Define validator-derived `AtlasProgramMetricV1` before optimizing prompts/programs.

## P3 — neural retrieval adaptation

- [ ] ENC-01 Freeze `AtlasRetrievalExampleV1` query/positive/hard-negative schema.
- [ ] ENC-02 Train cheap OKF domain head over frozen canonical EmbeddingGemma vectors first.
- [ ] ENC-03 Use structural hard negatives: wrong revision/tree node/symbol/owner/path despite high semantic similarity.
- [ ] ENC-04 Distill CrossEncoder teacher ordering into an EmbeddingGemma PEFT challenger.
- [ ] ENC-05 Store challenger under a NEW representation/model revision and separate Qdrant collection.
- [ ] ENC-06 Do not replace canonical `semantic_768` until Recall/MRR/nDCG + exact-promotion + repair-success gates pass.

## P4 — verified learning loop

- [ ] ENV-01 Replayable `AgentTaskEnvV1` with deterministic state/action/validator receipts.
- [ ] TRAIN-01 Gold corpus accepts only validator-proven outcomes; OKF/LLM labels remain weak/teacher labels.
- [ ] TRAIN-02 Add dataset revision, model revision, RNG seed and evaluation receipt.
- [ ] TRAIN-03 Only after this authorize GEPA/GRPO/QLoRA experiments.

## Immediate validation commands

```bash
cd sveltekit-frontend
npx vitest run \
  src/lib/server/atlas/features/manifold4-orientation-v1.spec.ts \
  src/lib/server/queue/artifact-work-item-v1.spec.ts \
  src/lib/server/queue/event-fabric-dispatch.spec.ts
```

Then run the targeted TypeScript check for queue + candidate-fabric contracts before wiring artifact materializers.
