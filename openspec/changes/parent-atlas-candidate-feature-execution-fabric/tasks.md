# Tasks — Parent Atlas Candidate Feature Execution Fabric

## P0 — identity and revision closure

- [ ] CAND-01 Define `CanonicalCandidateV1` with CandidateOrdinal + canonicalId + packetKey + treeNodeId + symbolVersionId + revision axes.
- [ ] CAND-02 Add deterministic ordinal-map materializer and rerun determinism fixture twice.
- [ ] CAND-03 Prove Qdrant point id, cuGraph gpuNodeId and CandidateOrdinal cannot substitute for canonicalId.
- [ ] REV-01 Materialize `RevisionDependencyGraphV1` for source → AST → graph/semantic → candidate → feature → rerank artifacts.
- [ ] CACHE-01 Define `ComputationArtifactV1` and content-addressed cache key contract.

## P0 — queue / artifact transport

- [x] QUEUE-00 Audit existing transport ownership: Postgres transactional outbox → RabbitMQ task/event exchanges; Redis list is UI/SSE progress only.
- [x] QUEUE-01 Add `ArtifactAddressV1` for MMAP/Arrow IPC/Postgres/Qdrant/Valkey/GPU-resident immutable artifacts.
- [x] QUEUE-02 Add `ActionWorkItemV1` so queue payloads carry artifact refs, revision-set hash, ordinal selection, budget and executor class instead of dense tensors.
- [x] QUEUE-03 Route artifact work through `enqueueTask()` transactional outbox via `enqueueArtifactWorkItem()`.
- [x] QUEUE-04 Fix event-fabric projection worker type ownership imports (`integration-events.ts` owns code-evidence; `event-fabric.ts` owns the control-loop event types).
- [ ] QUEUE-05 Replace remaining large vector/tensor RabbitMQ payloads (for example legacy `document.embed` / `vector.index`) with artifact references where profiling shows payload amplification. **IMPLEMENTED_UNPROVEN** — census identifies the amplified `EvidenceProcessWorker → document.embed` full-text hop and `DocumentEmbedWorker → vector.index` embedding-array hop. `legacy-amplified-payload-artifact-v1.ts` materializes/hydrates both through the existing `workflow_artifacts` Postgres owner, preserving old raw-message compatibility. Apply the bounded `scripts/atlas/patch-queue05-amplified-producers.mts` codemod locally, rerun the census, typecheck, and smoke the evidence→embed→Qdrant chain before checking off.
- [ ] QUEUE-06 Add explicit `artifact.materialized` / `artifact.failed` integration events and non-noop event-fabric handlers. **IMPLEMENTED_UNPROVEN** — schemas, outbox writers, durable lifecycle projection, and storage-aware materialization verification are present; run focused tests + lifecycle proof before checking off.
- [ ] QUEUE-07 Add single-flight lease/fencing token keyed by ActionKey so duplicate at-least-once deliveries cannot compute the same expensive artifact concurrently. **IMPLEMENTED_UNPROVEN** — `action-single-flight-v1.ts` owns leases, fencing and immutable receipts; focused tests exist.
- [ ] QUEUE-08 Add consumer idempotency proof: duplicate command delivery returns the same immutable output artifact or an existing receipt. **IMPLEMENTED_UNPROVEN** — unit proof covers existing receipt reuse, duplicate completion race and stale fencing; lifecycle proof additionally checks duplicate event projection is one row.
- [ ] QUEUE-09 Prove publisher-confirm outbox path is the only authoritative durable task publisher; generic publish helper remains convenience/non-authoritative. **IMPLEMENTED_UNPROVEN** — `rabbitmq-client.ts` explicitly rejects direct publish to `atlas.tasks.v1`; outbox remains the documented authoritative durable publisher. Run the boundary spec and startup confirm-channel proof before checking off.
- [ ] QUEUE-10 Add message-size telemetry and fail/redirect when a task envelope exceeds the artifact-reference policy limit. **IMPLEMENTED_UNPROVEN** — 64 KiB artifact-reference policy, in-process telemetry counters and oversize rejection are wired through `enqueueArtifactWorkItem()` with focused tests.

### QUEUE-05 amplified-payload migration gates

The two identified producer edges must prove:

- full processed evidence text is materialized before `document.embed` RabbitMQ delivery
- generated embedding arrays are materialized before `vector.index` RabbitMQ delivery
- queue envelopes carry `ArtifactAddressV1`, not the full text/vector body
- `DocumentEmbedWorker` and `VectorIndexWorker` hydrate both artifact references and legacy raw messages during the compatibility window
- Postgres `workflow_artifacts` remains the artifact owner; RabbitMQ remains delivery only
- Qdrant write semantics are unchanged after hydration
- payload census shows no unclassified amplified producer edge for these two routes

### QUEUE-07 materialization verification gates

File-backed `MMAP` / `ARROW_IPC` materialization must prove:

- `ACTION_KEY_PRESENT`
- `PRODUCER_REVISION_PRESENT`
- `REVISION_SET_HASH_PRESENT`
- `ARTIFACT_EXISTS`
- `ARTIFACT_IS_FILE`
- `BYTE_LENGTH_MATCH` when a byte length is declared
- `CHECKSUM_MATCH` using streamed SHA-256 over materialized bytes
- `STORAGE_VERIFIER_AVAILABLE`

`POSTGRES`, `QDRANT`, `VALKEY`, and `GPU_RESIDENT` addresses fail closed as `NOT_PROVEN` until a storage-specific verifier is implemented. Queue events remain observations about materialization; they never become artifact ownership or canonical artifact storage.

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

- [ ] FANOUT-01 Normalize all semantic results to CandidateOrdinal before feature fanout.
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
npx tsx scripts/atlas/audit-queue-large-payloads.mts
npx tsx scripts/atlas/patch-queue05-amplified-producers.mts
npx tsx scripts/atlas/audit-queue-large-payloads.mts

npx vitest run \
  src/lib/server/queue/artifact-work-item-v1.spec.ts \
  src/lib/server/queue/action-single-flight-v1.spec.ts \
  src/lib/server/queue/message-size-policy-v1.spec.ts \
  src/lib/server/queue/rabbitmq-client.spec.ts \
  src/lib/server/queue/artifact-materialization-verification.spec.ts \
  src/lib/server/queue/artifact-event-processing.spec.ts \
  src/lib/server/queue/event-fabric-dispatch.spec.ts

npx tsx scripts/atlas/prove-queue-artifact-lifecycle.mts
```

Acceptance target:

```text
QUEUE-05 amplified producer edges: artifact references only
legacy raw-message hydration: PASS
Qdrant hydrated write behavior: unchanged
focused queue tests: PASS
materialized file checksum/size gates: PROVEN
duplicate event projection: 1 row
corrupt equal-length artifact: REJECTED / CHECKSUM_MISMATCH
artifact.failed durable readback: 1 row
QUEUE_ARTIFACT_LIFECYCLE_PROVEN
```

Only after those proofs should QUEUE-05 through QUEUE-10 be checked off. Do not claim payload-remediation or artifact lifecycle proof from schema work alone.
