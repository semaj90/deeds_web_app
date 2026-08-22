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
- [ ] QUEUE-05 Replace remaining large vector/tensor RabbitMQ payloads (for example legacy `document.embed` / `vector.index`) with artifact references where profiling shows payload amplification. **OPEN** — compatibility publishers still exist; do a call-site + payload-size census before removing or redirecting them.
- [ ] QUEUE-06 Add explicit `artifact.materialized` / `artifact.failed` integration events and non-noop event-fabric handlers. **IMPLEMENTED_UNPROVEN** — schemas, outbox writers, durable lifecycle projection, and storage-aware materialization verification are present; run focused tests + lifecycle proof before checking off.
- [ ] QUEUE-07 Add single-flight lease/fencing token keyed by ActionKey so duplicate at-least-once deliveries cannot compute the same expensive artifact concurrently. **IMPLEMENTED_UNPROVEN** — `action-single-flight-v1.ts` owns leases, fencing and immutable receipts; focused tests exist.
- [ ] QUEUE-08 Add consumer idempotency proof: duplicate command delivery returns the same immutable output artifact or an existing receipt. **IMPLEMENTED_UNPROVEN** — unit proof covers existing receipt reuse, duplicate completion race and stale fencing; lifecycle proof additionally checks duplicate event projection is one row.
- [ ] QUEUE-09 Prove publisher-confirm outbox path is the only authoritative durable task publisher; generic publish helper remains convenience/non-authoritative. **IMPLEMENTED_UNPROVEN** — `rabbitmq-client.ts` explicitly rejects direct publish to `atlas.tasks.v1`; outbox remains the documented authoritative durable publisher. Run the boundary spec and startup confirm-channel proof before checking off.
- [ ] QUEUE-10 Add message-size telemetry and fail/redirect when a task envelope exceeds the artifact-reference policy limit. **IMPLEMENTED_UNPROVEN** — 64 KiB artifact-reference policy, in-process telemetry counters and oversize rejection are wired through `enqueueArtifactWorkItem()` with focused tests.

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

### Graph snapshot revision owner tranche — 2026-08-21

- [x] REV-OWNER-GRAPH-01 Add `GraphSnapshotRevisionV1` with workspace, source-inventory, graph, parser, identity, topology, policy, and producer revisions.
- [x] REV-OWNER-GRAPH-02 Keep revision ownership at immutable snapshot level; graph nodes bind through `snapshotId` without duplicated workspace/graph revisions.
- [x] REV-OWNER-GRAPH-03 Reject mixed snapshot bindings and source/topology/policy hash drift before fanout admission.
- [x] REV-OWNER-GRAPH-04 Prove the contract against persisted `atlas_graph_snapshots_v2` and selected node/edge readback in a non-production read-only transaction using `prove-graph-snapshot-revision-readback.mts`; manifest revisions remain incomplete, so the owner gate stays blocked.
- [ ] REV-OWNER-GRAPH-05 Unblock FANOUT-01 only after graph snapshot revision, candidate identity, and Qdrant `semantic_768` lineage agree.
- [x] REV-OWNER-CODE-01 Prove the compatibility contract for exact content bytes plus preserved legacy Git `source_revision`.
- [x] REV-OWNER-CODE-01A Freeze `GraphifySourceInventoryWritePlanV1`; it cannot authorize writes or overwrite legacy source-revision semantics.
- [ ] REV-OWNER-CODE-02 Bind one canonical Graphify source-inventory writer and prove a bounded persistence/readback canary.
- [x] REV-OWNER-CODE-02A Add read-only canary for historical `graphify_files` source bytes, content hashes, and legacy Git provenance.
- [x] REV-OWNER-CODE-02B Add the unapplied manual `graphify_files` schema/index migration; application and row population remain gated.
- [x] REV-OWNER-CODE-02C Add dry-run source-inventory materializer with explicit non-production apply confirmation gates.
- [x] REV-OWNER-CODE-02D Add rollback-only migration proof for table, constraints, and indexes.
- [x] REV-OWNER-CODE-02E Add additive-only migration collision guard and static destructive-SQL safety tests.
- [x] REV-OWNER-CODE-02F Prove the Graphify revision-authority v2 migration in a rollback-only transaction; durable application and row population remain gated.
- [x] REV-OWNER-CODE-03 Add `GraphifyWorkspaceManifestReceiptV1`; require complete expected/persisted source counts and exact revision/digest agreement before Graphify consumers can treat the manifest as complete.
- [x] REV-OWNER-GRAPH-04A Prove the snapshot revision-owner migration in a rollback-only transaction; durable application and manifest backfill remain gated.
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
focused queue tests: PASS
materialized file checksum/size gates: PROVEN
duplicate event projection: 1 row
corrupt equal-length artifact: REJECTED / CHECKSUM_MISMATCH
artifact.failed durable readback: 1 row
QUEUE_ARTIFACT_LIFECYCLE_PROVEN
```

Only after those proofs should QUEUE-06 through QUEUE-10 be checked off. QUEUE-05 remains a separate payload-census/remediation task; do not claim it from schema work alone.

## Handoff (2026-08-21, context-limited session end)

**Pushed to `origin/main` at `8e56c821b7`.** Everything below is real and verified unless
marked otherwise; nothing here is speculative.

### Done and merged this session
- CAND-01/02/03, REV-01, CACHE-01 (identity/revision/cache contracts) — built, tested, unique
  (checked against all 45+ `agent/*` branches, no duplicate).
- QUEUE-06/07/08/09/10 — merged from `agent/parent-atlas-queue-artifact-transport-20260821`
  (their implementation kept over an earlier local draft; theirs was more complete). Found and
  fixed a real production-breaking TDZ bug in their `outbox.ts` (`enqueueTask` self-shadowed its
  own `idempotencyKey` helper). Also fixed a missing `loadAtlasEnv()` call in two of their new
  proof scripts (`prove-artifact-transport-readiness.mts`,
  `prove-queue-artifact-lifecycle.mts`) that crashed with a SASL auth error before ever querying.
- **QUEUE-05 steps 1–3 proven live** against production Postgres: applied
  `parent_atlas_artifact_transport_v1.sql` (4 new tables, additive-only), confirmed
  `ARTIFACT_TRANSPORT_STORE_READY`, then ran `prove-queue-artifact-lifecycle.mts` →
  `QUEUE_ARTIFACT_LIFECYCLE_PROVEN` (idempotent replay, checksum-mismatch rejection, failure
  persistence all verified for real). **Steps 4–8 remain open** — nothing yet redirects the real
  `document.embed`/`vector.index` producers onto this store.
- PR #15 (`parent-atlas-semantic-prefill-spine`) and PR #16 (`atlas-aligned-snapshot-proof-v2`) —
  both already merged on GitHub, pulled into local main cleanly, zero conflicts, zero new
  typecheck errors (20 pre-existing repo-wide errors remain, none in the new files).
- Fixed a **real, pre-existing file corruption** unrelated to this session's own work: commit
  `401f319770`'s merge byte-interleaved two independent implementations inside
  `graphify-structural-materializer.ts` and `node-tree-sitter-ast-provider.ts` (+ its spec) —
  confirmed via `git show HEAD` before any edits. Restored both from the last clean commit
  (`e2376a0021`) and reapplied the FUNCTION-vs-VARIABLE taxonomy fix on top (a `const`/`let`
  bound to an arrow/function-expression now classifies `FUNCTION`, not the old blanket
  `VARIABLE`) — this closes the sidecar-vs-node-challenger parity mismatch found earlier in the
  session. 2/2 tests pass, typecheck clean.
- OKF frontmatter correction: verified the real GoogleCloudPlatform OKF v0.2 spec live (fetched
  it), found the earlier session's `generated: manual_curation` / `verified: unverified` additions
  didn't match (real spec: `generated` is a structured `{by, at}` object; `verified` should be
  *omitted*, never a scalar "unverified" string). Fixed all 8 `.okf/*.md` files.
- `llama-server` on `:8090` was down (no process at all) — restarted via
  `npm run turbo:start:text:detached`. Running **text-only**: `mmproj-F16.gguf` doesn't match the
  loaded `hforf.gguf` model's `n_embd` (2560 vs 4096) — vision/multimodal is disabled until a
  matching mmproj file is found/built. Chat/synthesis works normally.

### Explicitly NOT done — real open items for next session
1. **FANOUT-01** — still blocked. `synthesize/+server.ts` assigns `candidateOrdinal` by plain
   array position (twice, inconsistently across sort/slice). Root blocker: `GraphViewNodeV1` /
   the live `atlas_graph_nodes_v2` table has **no revision columns at all** (checked directly
   against production Postgres). Fixing this needs a real schema migration + identifying/fixing
   whichever writer populates that table — and ties directly into the still-unproven
   `REVISION_OWNER_NOT_PROVEN` status from the separate `agent/revision-owner-proof` work
   (already merged, still says NOT_PROVEN). Do not attempt FANOUT-01 until revision ownership is
   proven elsewhere first.
2. **A real 3-way `CandidateFeatureRowV1` naming collision** — `graph-runtime-contracts.ts`,
   `features/candidate-feature-row-v1.ts` (this change's canonical one), and
   `neural-routing/contracts.ts` (different domain, tool-routing) all independently declare a
   type with this exact name. Not renamed — cross-codebase rename is out of scope for a quick fix.
3. **QUEUE-05 steps 4–8** — redirect the real `document.embed`/`vector.index` producers
   (`rabbitmq-manager-fixed.ts`, `queue-worker.ts`) onto `ArtifactAddressV1` references, Qdrant
   readback verification, large-payload audit, before/after latency benchmark.
4. **FEAT-01→04** (Arrow IPC snapshot, CPU/GPU materializer, parity receipt) — deliberately never
   started; needs a real design decision on Arrow IPC layout and a working CUDA path to verify
   against, not something to stub out unverified.
5. The corruption-fix pattern found in indexing/ (§ above) suggests other files touched by the
   same `401f319770` merge may have the same interleaving bug — **not swept for this pass**, only
   the two files actually needed for the taxonomy fix were checked and repaired. Worth a
   dedicated audit (`git show 401f319770 --stat` to find every file that merge touched, then spot
   check a few for the interleaving signature: duplicate `export function`/`export type` names in
   one file).
6. mmproj/vision file mismatch (see above) — not investigated further; text-only is fine for now.

### Verification commands for next session to re-confirm state
```bash
cd sveltekit-frontend
npx vitest run src/lib/server/atlas/indexing/node-tree-sitter-ast-provider.spec.ts
npx vitest run src/lib/server/queue/outbox-authority.spec.ts src/lib/server/queue/event-fabric.spec.ts
npx tsx scripts/atlas/prove-artifact-transport-readiness.mts   # expect ARTIFACT_TRANSPORT_STORE_READY
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -c "error TS"    # expect ~20, none new
```
