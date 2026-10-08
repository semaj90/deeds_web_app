# Tasks — Parent Atlas Compute / Rank / Cache / Eval / DSPy-GEPA

## PA-COMPUTE-01 — content-addressed computation receipts

- [x] Add `atlas.computation-cache-descriptor.v1` key contract with stage, producer revision, dependency refs, parameters, revision set, and optional numerical-contract revision.
- [x] Permit cache reuse only for exact-key `PROVEN` receipts.
- [ ] Add artifact persistence adapter: immutable local/Arrow artifact + Valkey/BitFrost hot pointer.
- [ ] Add dependency-DAG invalidation test proving a source-only change does not invalidate unrelated graph/model artifacts.
- [ ] Emit stage receipts from daily Graphify without making cache state canonical truth.

## PA-FE-01 — finalize FeatureRowV1

- [x] Add `EvidenceLocatorV1`; keep `sourceRef`, `filePath`, `sourceUrl`, and domain classification orthogonal.
- [x] Add staged `FeatureRowV1` with revision lineage and scalar-to-Float32 projection.
- [x] Keep one `pagerankAuthority` feature and optional query-specific `pprAffinity`.
- [ ] Bridge the existing live candidate/retrieval row into this staged contract without deleting the existing `packet-feature-matrix.ts` owner.
- [ ] Prove canonical identity round-trip: candidate -> packetKey/canonicalId -> FeatureRowV1 -> exact evidence.

## PA-RANK-01 — PageRank authority -> FeatureRow

- [x] Reuse existing `pickPageRankAuthorityScore()` instead of creating a new authority resolver.
- [x] Require graph revision on FeatureRowV1.
- [ ] Join only promoted/revision-qualified PageRank data into the live candidate assembler.
- [ ] Re-run packet-facing/MCP PageRank distribution sanity: finite, variance > epsilon, distinct scores > 1, lineage present.
- [ ] Add ablation proving PageRank is useful and not duplicate-weighted against another authority alias.

## PA-RANK-02 — cross-encoder -> FeatureRow

- [x] Add deterministic pair-score cache key contract.
- [ ] Adapt existing `scripts/crossencoder-benchmark.py` to consume the final fused candidate set rather than only legacy XGBoost-v2 rows.
- [ ] Normalize/calibrate raw cross-encoder logits before assigning `FeatureRowV1.crossEncoder` (do not treat arbitrary logits as probabilities).
- [ ] Record model revision, tokenizer revision, max length, scoring/calibration revision, latency, and peak VRAM.
- [ ] Compare mxbai/bge candidates only under the same frozen eval corpus and candidate inputs.

## PA-CACHE-01 — cache cross-encoder pair scores

- [x] Key by query hash + candidate content hash + model/tokenizer/scoring revisions + max length.
- [x] Reuse only exact `proven` receipts.
- [ ] Add Valkey/BitFrost adapter with bounded TTL/residency metadata while retaining immutable receipt/artifact lineage.
- [ ] Add hit/miss/invalidated telemetry to daily receipts.

## PA-CACHE-02 — cache graph algorithm artifacts

- [ ] Materialize graph-projection artifact key from canonical graph revision + projection contract revision.
- [ ] Materialize PageRank/PPR/community outputs independently so changing a metric parameter invalidates only that metric.
- [ ] Persist ordinal map + algorithm revision + parameter revision + result hash.
- [ ] Prove NetworkX/Neo4j/cuGraph results may share one logical artifact only after parity gates pass; executor != lane vote.
- [ ] Add warm-load path for Arrow/mmap/VRAM projection without serializing full tensors through JSON.

## PA-EVAL-01 — frozen repair/localization eval corpus

- [x] Add `RepairEvalExampleV1` and receipt-derived `RepairEvalObservationV1`/score contract.
- [ ] Freeze train/validation/test IDs; never optimize GEPA on the held-out test split.
- [ ] Populate initial examples from verified historical repair receipts only.
- [ ] Record failure fingerprint, gold packet/source refs, validation commands, and acceptance criteria.
- [ ] Add retrieval Recall@5/10, MRR/NDCG, localization Recall@1/5, repair success, false-edit rate, latency, and cache-reuse measurements.
- [ ] Human-reviewed corrections may amend labels only as a new dataset revision; never silently edit an old frozen corpus.

## PA-DSPY-01 — RepairProgramV1 signatures/modules

- [x] Add import-safe Python bridge with DSPy `Signature`, `InputField`, `OutputField`, `Module`, and `Predict` construction.
- [x] Split diagnosis from proposal; supply exact `ContextManifest` and constraints explicitly.
- [ ] Add sidecar/RPC wrapper so TypeScript owns evidence acquisition while DSPy receives serialized promoted evidence.
- [ ] Prohibit DSPy program outputs from introducing evidence refs absent from the supplied manifest; validator must reject invented refs.
- [x] `DSPY-OUTPUT-EVIDENCE-GUARD-01` — added a pure Python boundary validator requiring the expected ContextManifest checksum and exact caller-supplied evidence/target allowlists; unknown refs/targets, duplicate IDs, checksum drift, and extra output fields fail closed. It preserves target ranking order and sorts evidence refs deterministically. Four standard-library boundary cases passed; `py_compile` passed. Pytest is not installed in the bundled, system, or WSL Python environments, so the existing pytest module could not be run here. This is only the validator contract: no DSPy runtime/caller or TypeScript admission boundary invokes it yet, so the parent “prohibit outputs” task remains open.
- **Python 3.14 recheck (2026-09-28):** the workstation's `python` is Python 3.14.7; `python -m unittest discover -s python/tests -p "test_dspy_repair_output_guard_unittest.py" -v` passed 4/4. `python -m pytest --version` confirms pytest is unavailable in this interpreter. This reconfirms only the pure Python validator fixtures; no TypeScript caller, DSPy runtime/RPC, ContextManifest admission path, model call, or data write was exercised. The parent output-boundary and RPC tasks remain open.
- [x] Add deterministic structured-output parser/contract at the Parent Atlas boundary: `dspy-repair-output-v1.ts` strictly parses the exact output shape, recomputes the supplied ContextManifestV2 identity checksum, checks target/evidence IDs against that manifest, preserves target order, sorts evidence refs, and rejects duplicate/unknown IDs. Validation: focused Vitest 4/4; targeted TypeScript check passed. This is parser/admission code only; it does not wire the Python DSPy runtime/RPC or authorize edits.

## PA-DSPY-02 — AtlasRepairMetricV1

- [x] Add normalized 0..1 receipt-derived metric + textual failure feedback.
- [ ] Bridge real test/typecheck/regression/evidence/localization receipts into the metric.
- [x] Decide hard-fail policy: fabricated evidence, permission violations, regression, or unsafe mutation must score 0 regardless of soft features. `atlas_repair_score_v1()` now returns zero for deterministic test/typecheck/regression failures and explicit validator receipt codes `FABRICATED_EVIDENCE`, `PERMISSION_VIOLATION`, and `UNSAFE_MUTATION`; unknown hard-failure codes are rejected. This is metric-policy code, not proof that receipt producers are wired to populate every code.
- [ ] Cache metric results by eval-example revision + program revision + model revision + receipt hash.

## PA-GEPA-01 — baseline -> optimized program comparison

- [x] Add current DSPy GEPA constructor shape with `metric`, `reflection_lm`, `auto='light'`, `log_dir`, `track_stats`, `track_best_outputs`, and fixed `seed`.
- [x] Add baseline/optimized mean comparison helper.
- [ ] Pin DSPy/GEPA versions in a WSL2 Python environment after a dedicated compatibility smoke test; do not add an unverified dependency to the main app environment.
- [ ] Run baseline program on frozen validation set and persist per-example receipts.
- [ ] Run GEPA with resumable `log_dir`; content-address the resulting program/instruction candidate.
- [ ] Promote only if validation improves and all hard gates remain non-regressed.
- [ ] Evaluate promoted candidate exactly once on held-out test set; that result cannot feed the same GEPA optimization run.

## PA-HITL-01 — human review / Kanban projection

- [x] Add `KanbanRecommendationProjectionV1` with evidence, acceptance criteria, validation commands, permission mode, Graphify/feature revisions, and human-decision state.
- [ ] Wire daily Graphify recommendations to proposed/review-required cards only; no auto-patching from unsupervised scores.
- [ ] Reuse existing `TaskPromotionGate` and recommendation policy instead of inventing a second task gate.
- [ ] Record `approve`, `reject`, or `request_changes` as append-only review events and feed verified outcomes back into eval/training datasets.
- [ ] Merge/supersede duplicate recommendations by canonical evidence identity and graph/workspace revision.

## PA-TRAIN-LATER — reranker/QLoRA follow-up (blocked)

- [ ] Mine hard negatives from high semantic/PageRank/PPR/community candidates that were not part of the verified repair.
- [ ] Fine-tune a cross-encoder only after frozen eval data and calibration are proven.
- [ ] Build `TrainingExampleV1` only from verified receipts + human-reviewed labels.
- [ ] Unsloth/QLoRA checkpointing, adapter evaluation, and promotion remain blocked until PA-EVAL-01, PA-DSPY-02, and PA-GEPA-01 pass.

## Validation commands for this branch

```bash
cd sveltekit-frontend
npx vitest run \
  src/lib/server/atlas/ranking/feature-row-v1.test.ts \
  src/lib/server/atlas/cache/cross-encoder-cache-key.test.ts \
  src/lib/server/atlas/evals/repair-eval-contract.test.ts \
  src/lib/server/atlas/cache/computation-cache-key.test.ts \
  src/lib/server/graph/nary-ranking-projection.test.ts \
  src/lib/server/atlas/evals/readiness-score.test.ts

cd ..
python -m pytest \
  python/tests/test_parent_atlas_pagerank_reference.py \
  python/tests/test_parent_atlas_dspy_repair.py -q
```

These commands are proposed validation commands; their success must be recorded from the actual Windows/WSL2 checkout before any task is upgraded to runtime-proven.

## DSPy / GEPA / sub-prompt deep audit — 2026-08-31

The repository already has two separate surfaces and they must not be counted as one
live optimizer:

| Surface | Status | Evidence |
|---|---|---|
| TRACE sub-agent API/orchestrator | **WIRED** | `sveltekit-frontend/src/routes/api/trace/subagents/run/+server.ts`, `sveltekit-frontend/src/lib/server/agents/trace-subagent-orchestrator.ts` |
| DSPy repair signatures/module | **CREATED / BOUNDED** | `python/parent_atlas_dspy_repair.py`, import-safe when DSPy is absent |
| DSPy contract tests | **PROVEN_BOUNDED** | existing Python focused tests; does not prove a live DSPy runtime |
| GEPA constructor contract | **CREATED** | `build_gepa_optimizer_v1()`; no live optimizer execution |
| DSPy/GEPA runtime imports | **NOT_PROVEN / BLOCKED** | current audit records missing runtime dependencies |
| Typed evidence-ref anti-invention validation | **OPEN** | output validator and serialized sidecar boundary are not yet wired |
| Held-out split isolation | **OPEN** | train/validation/test IDs are not frozen in a receipt |
| OaK judge → repair suggestion | **PARTIAL** | judge feedback contract exists; automatic bounded producer is absent |
| Production self-modification | **FORBIDDEN** | no promotion or mutation path is authorized |

The executable audit is `scripts/atlas/audit-dspy-gepa-subprompts-v1.mjs` and its
read-only report is `docs/reports/dspy-gepa-subprompt-audit-v1.json`. It defines the
ordered follow-up gates `SUBPROMPT-REPLAY-01`, `DSPY-SIDECAR-01`, `GEPA-VERSION-01`,
`GEPA-768-INPUT-01` (added 2026-09-27 — proves the `semantic_768` retrieval trace → DSPy/GEPA
training-row conversion, gating the two entries below), `GEPA-HELDOUT-01`, `GEPA-SHADOW-01`,
`OAK-JUDGE-01`, and `PROMOTION-01`.

Do not mark the DSPy or GEPA tasks complete from the existence of signatures, a
constructor, or sub-agent routing. A live promotion requires serialized promoted
evidence, deterministic replay, frozen evaluation splits, hard-gate non-regression,
human review, and an immutable receipt. GEPA remains an offline/shadow worker and
must not write to PostgreSQL, Qdrant, Valkey, Neo4j, Graphify, or canonical identity.

### Ordered follow-up checklist

- [ ] SUBPROMPT-CENSUS-01 — classify existing prompt/sub-agent surfaces by orchestration, evidence acquisition, and model proposal.
- [ ] SUBPROMPT-CONTRACT-01 — add a serialized request/response boundary carrying ContextManifest checksum and allowed evidence IDs.
- [x] SUBPROMPT-REPLAY-01 — add read-only prompt replay mode comparing stable prompt-selection projections and checksums; live ACE-backed replay remains required for runtime proof.
- [ ] DSPY-SIDECAR-01 — connect the TypeScript evidence owner to an isolated DSPy worker; no store access from the worker.
- [ ] GEPA-VERSION-01 — prove pinned DSPy/GEPA imports in an isolated WSL2/container environment.
- [ ] GEPA-768-INPUT-01 — prove a revision-qualified `semantic_768` retrieval trace converts into
      this change's existing DSPy/GEPA training/eval schema without: (a) raw vector duplication —
      identity is frozen as `source_ref + source_revision + content_hash + representation_revision`,
      never a bare row count, so the same evidence item populated in both `content_embedding` and
      `content_embedding_768` (see `parent-atlas-semantic-768-canonical-contract`'s
      `SEMANTIC-768-OWNER-RECHECK-2026-09-27`) is never counted as two independent training
      examples; (b) missing `packetKey` — every row must round-trip candidate → `packetKey`/
      `canonicalId` → evidence, not synthesize one; (c) inferred revisions — no `unknown`/`latest`
      substitution for `sourceRevision`/`workspaceRevision`; (d) changing `semantic_768` ownership —
      this gate consumes the existing representation as a fixed feature source, it does not touch
      or resolve `AMBIGUOUS_SEMANTIC_768_OWNER`. A conforming row is shaped roughly as
      `{queryChecksum, sourceRevision, packetKey, semanticRepresentation: {kind: "semantic_768",
      representationRevision, modelRevision, vectorChecksum}, routing: {logicalLane, executor},
      outcome: {recallAt10, mrr, validationPassed, latencyMs}}` — never the raw 768-dim vector
      itself, only its checksum (GEPA optimizes routing/program behavior around the representation,
      it does not optimize the representation). This gate is data/schema work and can be attempted
      read-only, without a live DSPy/GEPA runtime — it does not depend on `DSPY-SIDECAR-01`/
      `GEPA-VERSION-01` passing first, but `GEPA-HELDOUT-01`/`GEPA-SHADOW-01` below depend on it.
- [ ] GEPA-HELDOUT-01 — freeze train/validation/test IDs and enforce held-out isolation.
- [ ] GEPA-SHADOW-01 — run a bounded validation-only GEPA experiment with fixed seed, resumable log, and candidate checksum.
- [ ] OAK-JUDGE-01 — map real bounded execution receipts to judge feedback and repair suggestions without auto-promotion.
- [ ] PROMOTION-01 — require human review, held-out non-regression, and an immutable promotion receipt before any candidate is promoted.

### Agentic repair evidence admission — 2026-10-07

- [x] `REPAIR-EXAMPLE-EVIDENCE-01` — add a fail-closed metadata-only `atlas.agentic-repair-example.v1` admission helper. It rejects empty `sourceRefs`, unresolved or mismatched identity/revisions, missing source bytes, content-checksum mismatch, out-of-range or fabricated UTF-8 byte spans, unqualified retrieval candidates, unknown validators, duplicate IDs, and any `mutationAllowed=true`. The helper requires source bytes, qualified candidate IDs, and known validator IDs from existing owners; it does not claim to resolve or produce them. Focused test module: 28 passed in an isolated Python 3.14 environment. No live retrieval, source acquisition, model call, or durable write.
- [ ] `REPAIR-EXAMPLE-CALLER-01` — wire the helper only after the TypeScript/ACE evidence owner can serialize exact `EvidenceLocatorV1` values, independently qualified retrieval candidate IDs, and validator IDs into an isolated worker request. Keep DSPy/GEPA without store access; no evidence-free fallback.
- [ ] `OAK-REPAIR-FUNCTION-MAP-01` — reconcile the proposed repair operations against the existing checksum-sealed symbol-repair catalog and operator library before adding functions. Existing composed coverage is partial: failed-typecheck evidence includes lexical/semantic retrieval and context building; impacted callers cover symbol neighborhood. Recent changes, test dependents, failure classification, deterministic repair-target ranking, validator receipt summarization, and bounded retry diagnosis have no proven composed OaK function/caller in the inspected catalog. Extend the existing catalog/operator owner only; do not create a second registry or imply the current functions are live.
- [ ] `OAK-REPAIR-RUNTIME-01` — prove one read-only request-local OaK composition consumes the admitted example, calls only typed operations, preserves canonical packet/source/workspace revisions, and emits a checksummed context/receipt. Keep graph construction request-local and bounded; no full graph rebuild, promotion, or mutation.

### Agent plan-to-execution loop guard audit — 2026-10-07

- [ ] `AGENT-FSM-01` — partial implementation in the existing `agent-execution-spine-v1.ts`: a pure `PLAN → PLAN_VALIDATED` acceptance receipt binds request/execution identity, plan revision/checksum, consumed/planning/allowed-next action IDs, and a receipt checksum; a guard rejects planning/consumed or unlisted actions. Focused unit proof is pending. This is not cross-turn enforcement: no persisted receipt lookup or live workflow/recommendation caller consumes the guard, so the repeated-call trace remains possible until an existing event/receipt owner integrates it. Do not add a parallel FSM or claim runtime loop prevention.

### OaK runtime spine — 2026-10-07

- **Audit correction (2026-10-07):** the current working tree now contains `packages/parent-atlas/src/core/oak-task-profile-v1.ts` (`buildOakCodeRepairTypeMismatchProfileV1`) and `oak-find-failure-context-v1.ts` (`findOakFailureContextV1`), with fixture specs. `git status` shows all four files untracked, so they are worktree-only—not yet tracked/revisioned implementation. Focused specs pass 7/7. The function validates supplied TaskCard/EvidenceCard/fact/projection objects and emits a checksummed non-authoritative receipt; its only discovered callers are fixture specs. No app/runtime caller or live admitted evidence was found. Thus the prior “no source definition” status is stale for this worktree, while the production proof gate remains open. TaskCard↔EvidenceCard cardinality remains diagnostic, not admission evidence.
- **Matrix caller boundary:** `RetrievalCandidateFeatureMatrixV1` and its 25-column builder are present and focused tests pass; however, `adaptProfilesToCandidateFeatureMatrixV1()` is only directly referenced by its spec. The separate SearchRuntime `searchWithQas` / `searchWithAceManifest` methods are opt-in; searched production sources call the adapter's ordinary `search()` method, not those opt-in methods. The 11-feature snapshot producer and matrix readback are contract/fixture evidence, not a demonstrated application producer-to-caller path. Keep `CFM-PRODUCER-01` open.

### Three proof waves — sequencing correction (2026-10-07)

- **Wave 1 — evidence trust:** close `EMBED-RUNTIME-01` with an independently bound runtime receipt; prove `CFM-PRODUCER-01`, `CFM-READBACK-01`, and `CFM-CALLER-01` through the existing matrix owner, without creating another matrix authority. Keep semantic-derived features unavailable until the exact model/tokenizer/recipe/runtime binding passes. Structural-edge and HyperRAG gates remain independently blocked.
- **Wave 2 — executable OaK:** the profile and `find_failure_context` files/specs currently exist only as untracked worktree files. Review and retain them under source control before treating them as durable. Do not claim a live OaK path until an admitted task/evidence input exists, the sourceRef-backed facts and ontology projection are joined at exact revisions, and a real caller emits an independently verifiable function receipt. Build the request-local graph projection and FSM receipts without promoting them to canonical graph authority; unavailable graph relations must return `UNAVAILABLE`.
- **Wave 3 — learning:** emit deterministic `LearningOutcomeV1` from execution and validator receipts; freeze train/validation/held-out IDs; only then run GEPA in shadow mode on a revisioned OaK policy. The optimizer cannot change identity, evidence, permissions, FSM transitions, or validator truth. DSPy remains optional and downstream of the OaK function API.
- This sequencing supersedes the earlier `OAK-PROFILE-01` / `OAK-FUNC-01A` status text below that says their source definitions were not found: definitions are present in the current worktree and have a main-repo fixture runner, but remain untracked and have no demonstrated production/request-scoped application caller or live admitted evidence. The gates remain open for those reasons.

- [ ] `OAK-PROFILE-01` — add a deterministic, checksum-sealed `CODE / REPAIR / TYPE_MISMATCH` task-profile builder under the existing Parent Atlas core owner. **Status correction (2026-10-07):** `packages/parent-atlas/src/core/oak-task-profile-v1.ts` and its fixture spec now exist in the worktree and are untracked. The builder is deterministic and checksum-sealed; current evidence is fixture-only, with no demonstrated production profile resolver or live admitted input. Keep this gate open until the source is retained/tracked and a real request-scoped caller binds the profile to qualified task/evidence revisions. `python/atlas_oak_kernel.py` remains a separate fail-closed OWL profile-check operation.
- [ ] `EMBED-RUNTIME-01` — independently bind the running embedding service to its executable/source digest, GGUF, tokenizer, preprocessing/pooling/normalization recipe, and exact `semantic_768` representation revision; artifact checksum by itself is insufficient. **Read-only verifier result (2026-10-07): `NOT_PROVEN`; GGUF independently hashes to the recorded checksum and 621,867,360 bytes, but `modelId`, pooling, producer revision, per-call revision receipts, and active runtime-to-artifact binding are absent. Ollama `/api/ps` observed zero loaded matching models; strict llama-server `:8081/v1/models` fetch failed. A fresh GET found `:8097/health` returning only `status`, `model_loaded`, `device`, and `timestamp`, while the checked-in handler returns build/model/artifact/dimension/provider/runtime fields. Docker confirms `legal-ai-go-embedding` is configured with `OLLAMA_URL=http://host.docker.internal:11434` and `EMBED_MODEL=embeddinggemma:latest`; host Ollama `/api/ps` reports no resident model despite the legacy health response saying `model_loaded=true`. The container was created 2026-07-29 with image ID `sha256:431ddc0acb6fb8252b003fb5147272f2fee9dad6b81735a1cf485dc3d98617fd2`; its read-only executable hash is `c9bce0027de4a2a0b198902cd1ed8be6b02cfe361d530e7cbddbfb818bb4d519`. The local daemon cannot inspect that image ID, and the live endpoint does not expose the checked-in build revision; source-to-runtime binding is therefore unproven. Do not infer a successful embedding runtime from generic health. Go source tests pass (`go test ./...`), proving only the checked-in handler logic. No service restart, embedding request, cache/store write, or runtime change was made.**
- **GET-only embedding runtime recheck (2026-10-07T23:24Z):** `:8097/health` reports `healthy`, `model_loaded=true`, `device=cpu`; `/stats` instead claims `embeddinggemma:latest`, 768 dimensions, `gpu_available=true`, and `device=ollama-gpu`. Ollama `/api/ps` reports no resident models. `/api/tags` reports two `embeddinggemma:latest` artifacts with different digests/byte sizes. `:8081/v1/models` actively refuses connections. `:8090/v1/models` reports `ornith-1.5-9b`, confirming the separate synthesis endpoint only. These GETs made no inference request and prove neither the running `:8097` binary/model binding nor a live `semantic_768` call receipt; `EMBED-RUNTIME-01` remains `NOT_PROVEN`. No restart, cache/store write, or service change occurred. The related workspace revision is historical after adding this ledger entry.
- **Source-side readiness hardening (2026-10-07):** Go `/ready` now uses GET-only `/api/tags` + `/api/ps`, requires one exact model tag, one resident model with the same SHA-256 digest, and 768 dimensions; it no longer POSTs an embedding during Docker health checks. Runtime readback rejects duplicate tags, missing/invalid artifact digests, and resident digest mismatch. Focused tests prove ready/unready cases and zero POSTs; `go test ./...` passes. This is source/fixture evidence only: the currently running July image still returns 404 for `/ready`, so no redeploy/restart was performed and `EMBED-RUNTIME-01` remains `NOT_PROVEN`.
- [ ] `CFM-PRODUCER-01` — prove live, revision-qualified input through the existing canonical retrieval matrix owner; do not create a second canonical matrix. **Ownership correction (2026-10-07):** the current app-side canonical feature matrix is `RetrievalCandidateFeatureMatrixV1` with `[C,25]` rows in `sveltekit-frontend/src/lib/server/retrieval/retrieval-candidate-feature-matrix-v1.ts`. Its existing flow is `ChunkRetrievalProfileV1` → `toCandidateProjectionInputV1()` → `adaptProfilesToCandidateFeatureMatrixV1()` → `buildCandidateFeatureMatrix()`. The distinct 11-feature snapshot/artifact contract under `atlas-pipeline-stage-contracts-v1.ts` has a fixture producer and an opt-in `SearchRuntime.searchWithAceManifest()` method, but no demonstrated application caller; it is not established as a second canonical owner or proven as a subset/crosswalk of `[C,25]`. The repair matrix remains a non-authoritative tournament/evaluation overlay. Next proof: identify one already-admitted candidate, bind its exact ordinal and source/workspace revisions, pass it through the existing `[C,25]` path, then prove an independent artifact checksum/readback and a real diagnostic caller. Keep unavailable semantic/graph values masked with explicit reasons. No live matrix, database, or ranking proof is claimed.
- [ ] `OAK-FUNC-01A` — prove a read-only `oak.find_failure_context` operation over admitted evidence, returning revision-qualified evidence and a receipt; otherwise return `UNAVAILABLE`. **Status correction (2026-10-07):** the source now contains `OakTaskProfileV1` and pure `findOakFailureContextV1()` contracts; `createOakFailureContextDagAdapterV1()` invokes that function through the existing read-only kernel-bound DAG registry. The focused fixture suite passes, and `npm run atlas:oak:failure-context:fixture` in the main repo returned an `AVAILABLE` function receipt and deterministic DAG receipt with `canonicalAuthority=false` and `writesPerformed=false`. This remains fixture-only integration over synthetic caller-supplied objects—not a live app caller, source/evidence acquisition, or proof that any current EvidenceCard is admitted. The TaskCard↔EvidenceCard cardinality join remains diagnostic only; keep this gate open pending a real revision-qualified evidence producer and request-scoped caller.
- [ ] `NLP-GROUNDING-01` — map the existing TaskCard/evidence-card join and prove its admission semantics before building a grounded-facts producer. Reuse the existing NLP observation lineage, grounded NLP fact, and ontology-linked-tuple projection contracts; require exact task/source/workspace revisions and byte-grounded evidence, and keep outputs non-authoritative until independently admitted. Then implement the profile/function slice on that evidence path. Do not add a parallel matrix, canonical graph, or registry; do not connect GEPA or mutate Graphify/embedding stores as part of this gate.
- **Source-revision join correction (2026-10-07):** `EvidenceCardV1.sourceRevision` is now the SHA-256 of the complete `tasks.md` byte content from the census source manifest; `TaskCard.sourceRevision` already uses the workboard's verified full-file hash. The task-block hash remains separately used as `taskRevision`/receipt binding and is not substituted for the source-file revision. The TaskCard↔EvidenceCard join now rejects missing or mismatched full-file revisions; TaskCard construction requires an exact source-revision match; and `proofUsable` cannot be asserted by callers for a non-`PROVEN` card. Focused fixture tests pass. This fixes the revision comparison contract only: the join remains diagnostic, does not establish evidence admission, and does not produce source-grounded NLP facts or a request-scoped OaK caller. `NLP-GROUNDING-01` and `OAK-FUNC-01A` remain open.
- **TaskEvidenceAdmissionV1 boundary (2026-10-07):** a read-only classifier now separates a unique TaskCard↔EvidenceCard reference join from task-claim proof usability. It requires a valid EvidenceCard checksum, exact task/canonical identity, separate task-block and full-file revisions, matching workspace revision, a `PROVEN`/`proofUsable` card, and current receipt bindings with source checks. Its scope is explicitly `TASK_CLAIM_PROOF_ONLY`; it emits no canonical authority or writes and does not establish a code-file byte span. The root `.tmp` audit caller includes this projection only for unique join rows. This remains a diagnostic projection, not a database admission or authorization.
- **NLP grounding field contract:** `GroundedNlpFactV1` already requires `factId`, `taskRef`, `canonicalTaskRef`, `taskRevision`, `evidenceCardChecksum`, exact `sourceRef` + `sourceRevision` + `workspaceRevision`, `extractorRevision`/kind, feature kind/name, proposed label, exact `surfaceText`, nullable measured confidence, byte start/end plus span SHA-256, and `evidenceKey`; it is hard-coded non-authoritative with ontology promotion disabled. Grounding must hash the exact source bytes and verify the span bytes equal the extracted text. The task-ledger file revision on TaskCard/EvidenceCard is not a substitute for the code/document `sourceRevision` in this fact.
- **Existing storage/schema inventory (no DDL authorized):** `evidence_receipts` owns execution receipts; `task_evidence` owns receipt-to-task predicate links; `openspec_evidence_chunks` is the existing 768-D evidence chunk table; and `atlas_ontology_linked_tuples` is the existing tuple persistence owner. The manual migration `sveltekit-frontend/drizzle/manual/20260920b_atlas_ontology_schema_alters.sql` already adds nullable `source_revision` and `workspace_revision` plus a partial `(source_ref, source_revision)` index to the tuple table. Current projection preserves source/workspace revision and byte span; `evidence_refs` carries the evidence key/task refs; `provenance.inputDigest` carries the fact ID. However, `taskRevision` and `evidenceCardChecksum` from `GroundedNlpFactV1` are not currently copied into the persisted tuple/provenance. No dedicated persisted `GroundedNlpFactV1` table was found in inspected owners; do not create one unless later query/readback requirements prove the existing tuple JSONB cannot preserve the needed lineage.
- **NLP-SCHEMA-01 (OPEN):** use a read-only PostgreSQL catalog check (`to_regclass`, `information_schema.columns`, `pg_indexes`) to verify that the manual migrations are actually applied and that Drizzle/SQL/runtime shapes agree for `evidence_receipts`, `task_evidence`, `openspec_evidence_chunks`, and `atlas_ontology_linked_tuples`. Separate contract fields from physical columns: do not add `task_revision`/`evidence_card_checksum` columns merely because the fact contract carries them; first prove whether existing task/receipt keys plus `evidence_refs`/`provenance` suffice and are queryable. Only propose an additive migration after the read-only comparison and a concrete query/readback requirement. No live schema was inspected and no migration, index, insert, or upsert was run in this slice.
- **NLP-TUPLE-LINEAGE-01 (OPEN):** before any tuple upsert, preserve `factId`, `taskRef`, `canonicalTaskRef`, `taskRevision`, `evidenceCardChecksum`, `sourceRef`, exact `sourceRevision`, `workspaceRevision`, extractor revision, and byte-span checksum through `OntologyLinkedTupleV1` and its persisted readback. Prefer extending the existing `provenance` JSONB contract over new columns if exact lookup/readback requirements are met. If a queryable physical field/index is required, first use `NLP-SCHEMA-01` to verify deployed schema and prepare a separately reviewed additive migration; do not write or backfill during this gate.
- **NLP-GROUNDING-02 (OPEN):** after `NLP-SCHEMA-01`, acquire one already-qualified source byte buffer and receipt-bound task/card binding; run the existing `groundNlpFeatureV1` and `projectGroundedNlpFactToOntologyTupleV1` owners with exact byte-span verification; emit fixture/root receipts and independent readback. Keep generated tuples `GATED`, canonical authority false, and writes disabled. Only then decide whether a storage migration is necessary.
- **NLP-GROUND-OWNER-01 (OPEN):** identify the existing `:8095` grounded-NLP producer, caller, and deployed producer revision. Reuse that owner; do not add a second extraction service or fact authority. A source contract or fixture alone does not prove the sidecar produced the fact.
- **NLP-GROUND-REVISION-01 / SPAN-01 (OPEN):** prove each fact's `sourceRevision` hashes the exact bytes addressed by its `sourceRef`; independently reopen fixture bytes and check `bytes[startByte:endByte]` against `surfaceText` and the recorded span digest. Reject absent, stale, out-of-range, or mismatching spans. Never copy the TaskCard/EvidenceCard `tasks.md` revision onto a code/document fact.
- **NLP-GROUND-ADMISSION-01 / TASK-CLAIM-PROOF-01 (OPEN):** keep fact production separate from admission. A fact remains a proposal until source/workspace revisions, extractor revision, exact span, evidence refs, and workspace compatibility are independently verified. TaskCard↔EvidenceCard is only a reference join; task-claim proof requires its own receipt-to-predicate binding. Neither confidence nor the diagnostic join may set `admitted`/`proofUsable`.
- **ONTOLOGY-TUPLE-OWNER-01 / FIELD-MAP-01 (OPEN):** census the existing tuple writer/readers, then map subject, predicate/relation, object/role participants, sourceRef, source/workspace revisions, extractor revision, evidence refs, fact checksum, projection revision, and non-authority state to direct tuple fields or lossless `provenance`/`evidenceRefs` fields. Mark each `STORED`, `LOSSLESS_DERIVATION_PROVEN`, or `MISSING`; include independent readback/query requirements.
- **ONTOLOGY-TUPLE-MIGRATION-DECISION-01 (OPEN):** record `NO_MIGRATION_REQUIRED` only after the field map and readback prove lossless preservation in the existing tuple owner. Otherwise propose the smallest additive migration with a concrete query/readback need. Do not apply DDL, create another table, or write/upsert tuples in this audit tranche.
- **ONTOLOGY-TUPLE-PROJECTION-01 / NEGATIVE-01 (OPEN):** keep `GroundedNlpFactV1 → OntologyLinkedTupleV1` pure and non-authoritative; preserve the input fact checksum and every lineage binding through projection. Reject missing revisions/evidence, failed span readback, incompatible workspace, unknown extractor revision, unresolved evidence refs, and relations outside the admitted vocabulary.
- **ONTOLOGY-TUPLE-READBACK-01 / RUNTIME-01 (OPEN):** prove bounded fixture serialization and independent reopen/checksum recomputation first; separately prove one request-scoped read-only caller over an admitted fact. Fixture proof is not persistence or production reachability; no durable write is needed for the runtime gate.
- **Python / parser / graph alignment (design constraint):** keep the `:8095` transport dependency-light. `python/atlas_grounded_nlp_fact_v1.py` is a stdlib-only frozen dataclass mirror; strict Pydantic validation is owned under `python/oak_agent/`. The Pydantic-free default interpreter import check passed. This does not prove the deployed `:8095` caller consumes the dataclass. Do not encode n-ary facts as linked lists or positional tuples; preserve explicit participant roles. `pysimdjson` is an optional bounded JSONL/NDJSON parser, not a validator or identity owner. NetworkX may build request-local graphs only from admitted tuple projections. KMeans/domain clusters and Top-K remain derived context-selection signals, never substitutes for exact `sourceRef` evidence.
- **PYTHON-GROUND-FACT-01 (CROSS-RUNTIME FIXTURE PARITY PROVEN):** the TS extraction producer, stdlib frozen dataclass, and OaK Pydantic mirror round-trip identical fields and canonical JSON; input/dataclass/Pydantic checksums match at `sha256:0977972f5711c4344aa4625d53a5b2ec74895eb147305cc76c8ddcc5e63479df`. Independent receipt readback is `.tmp/atlas/grounded-nlp-dataclass-pydantic-parity-v1.json`, checksum `sha256:0f71ed1f8798ed20b8efe83a807931a575ed82f64105db5a913a4538d1c3fd4c`. Service binding and fact admission remain separate open gates.
- **V1 semantic-shape boundary (OPEN):** the existing TypeScript `GroundedNlpFactV1` is an extraction assertion (`featureKind`, `featureName`, `proposedLabel`, exact span); it does not have the proposed semantic `factKind/subject/predicate/object` envelope or nested `provenance` object. The new Pydantic model intentionally mirrors the existing V1 instead of silently redefining it. Resolve this as an additive/versioned ontology-fact contract and update the TypeScript owner before claiming semantic n-ary fact parity; do not overload the current V1 or add a second authority.
- **OKF-PYDANTIC-ALIGN-01 (OPEN):** `.okf/schema.yaml`'s `SymbolKnowledgeCard` is a documentation-card projection, not the same schema as `GroundedNlpFactV1`. Compare shared envelope vocabulary and non-authority constraints explicitly; do not require byte-for-byte JSON Schema equality or derive runtime identity/admission from `.okf`. Add a distinct card model only if an actual consumer requires it.
- **OAK-PROFILE-FACTS-01 / OAK-FAILURE-CONTEXT-LIVE-01 / READBACK-01 / OAK-REQUEST-CALLER-01 (OPEN):** profiles and `oak.find_failure_context` consume only admitted, revision-qualified facts/projections. Replace synthetic fixture inputs only after admission exists; emit and independently verify the existing DAG/capability receipt with input/fact/output checksums and `canonicalAuthority=false`, `writesPerformed=false`. Add one SvelteKit Atlas shadow caller using the same path; do not connect GEPA or enable model consumption before these gates pass.
- **PY-NLP-DATACLASS-01 (FIXTURE PROVEN; SERVICE BINDING OPEN):** the stdlib-only frozen mirror at `python/atlas_grounded_nlp_fact_v1.py` rejects unknown/missing fields, invalid revisions/spans, invalid confidence, and authority escalation. Runtime/deployment evidence that `:8095` consumes it is still missing.
- **PY-NLP-PYDANTIC-01 (PARTIAL):** strict OaK request/result and grounded-fact Pydantic contracts are under `python/oak_agent/`; pinned requirements are in `python/requirements-oak-agent.txt`. Focused checks used the existing `.venv`; do not install dependencies into `:8095` or treat `.venv` as the isolated OaK runtime. Provision or select one dedicated OaK-agent environment from the pinned requirements before runtime integration; do not create multiple competing environments. DSPy, GEPA, LangChain, and Deep Agents remain unproven/uninstalled in inspected environments.
- **PY-NLP-PYDANTIC-ALIGN-01 (FIXTURE PROVEN):** `scripts/atlas/prove-grounded-nlp-fact-python-roundtrip-v1.mjs` proves TypeScript → frozen dataclass → strict Pydantic → JSON readback with identical canonical checksums and non-authority flags. Cross-runtime fact checksum: `sha256:0977972f5711c4344aa4625d53a5b2ec74895eb147305cc76c8ddcc5e63479df`; independently reopened receipt checksum: `sha256:0f71ed1f8798ed20b8efe83a807931a575ed82f64105db5a913a4538d1c3fd4c`. This does not prove `:8095` runtime binding, fact admission, or agent orchestration.
- **OKF-NLP-ALIGN-01 (OPEN):** compare shared `.okf` vocabulary and non-authority rules with the Python and TypeScript transport contracts; `.okf` remains documentation/projection, not runtime identity or admission authority.
- **LC-OAK-TOOL-01 (OPEN):** expose only allowlisted OaK functions through strict LangChain tool arguments that accept admitted fact IDs/checksums and bounded revisions—not raw SQL, paths, or arbitrary graph queries.
- **DEEPAGENT-OAK-01 (OPEN):** validate structured agent results against the strict isolated Pydantic result model; framework orchestration cannot grant Atlas admission or mutation authority.
- **NETWORKX-OAK-01 (OPEN):** construct request-local NetworkX projections only from Atlas-admitted, revision-qualified tuple/fact inputs; bind deterministic ordinals and checksums, and keep Neo4j a projection/reference adapter rather than hypergraph authority.
- **OAK-AGENT-CONTRACTS-01 (FIXTURE_PROVEN 4/4):** isolated request/result Pydantic contracts live under `python/oak_agent/`; they accept only bounded fact IDs/checksums, reject unbounded/raw fields, and freeze authority/write flags. The existing root `.venv` is reused; no new environment or `:8095` dependency was added.
- **OAK-AGENT-ENV-01 (OPEN):** `python/requirements-oak-agent.txt` pins Pydantic and `oaklib`, but the current test `.venv` is not evidence of a dedicated OaK-agent runtime. Select/provision one isolated environment from that file and prove its interpreter imports the pinned contracts; do not install into `:8095` or add LangChain/Deep Agents/DSPy/GEPA until a concrete caller requires them. HyperGraphRAG is an existing repository capability and is not a Python dependency to install into this environment.
- **OAK-HYPERGRAPH-NEO4J-BOUNDARY-01 (OPEN):** HyperGraphRAG contracts/retrieval are present in the merged root/package work; keep Neo4j as a graph projection/reference adapter. Do not delete Neo4j or package files from name similarity. Remove code only after a caller/owner census proves it is a dead duplicate and the owning ledger records that evidence.
- **OAK-AGENT-RECEIPT-01 (FIXTURE_PROVEN):** `npm run atlas:oak:contracts:proof` emits `.tmp/atlas/oak-agent-structured-contracts-proof-v1.json` with source/input/output checksums, evidence refs, workflow-stage coordinates, and explicit null packet/ContextManifest/ACE fields; it reopens the serialized receipt and verifies its checksum. This fixture receipt is not a ContextManifest, ACE packet, admitted fact bundle, or runtime caller proof.
- **SELF-PROMPTING-BOUNDARY-01 (OPEN):** add bounded next-action proposals only through the existing PrimeAgent execution spine and allowlisted OaK capabilities. Model output may recommend a legal move; deterministic policy/FSM authorizes it. Persist validator/learning receipts, but never mutate production prompts or policies in-request; optimization remains offline and revisioned. Audit note: `agent-execution-spine-v1.spec.ts` passes 12/12; the legacy `scripts/phase79-agentic-repair.mts` defaults to Ornith but consumes mocked error data and exposes direct path-based `apply_patch` writes without the PrimeAgent capability/authorization seam. Do not use it as a production self-prompt loop or execute it until that seam is added. Prompt generation/cache is not policy learning; no DSPy/GEPA optimizer is installed or proven.
- **NLP-ADMISSION-01 (OPEN):** prove that successful dataclass/Pydantic validation does not admit a fact; admission still requires exact source/workspace revisions, evidence/span readback, and the existing Atlas receipt owner.
- [ ] `FSM-01` — extend the existing execution-spine owner with explicit transition receipts only if an owner audit finds no equivalent; do not add a parallel FSM.

### JEPA / GEPA-768 INPUT LINEAGE AUDIT — 2026-09-27 (read-only)

- The saved Packet-JEPA training export contains 2,979 pair rows and 197 evaluation rows; every row in both files has `input_dim=64`. The exporter chooses `content_embedding_384`/`embedding` only when its parsed vector has at least 128 elements, otherwise it falls back to `latent_64`, then keeps the dominant dimension. `content_embedding_384` is the legacy 384-dim column dropped from `codebase_chunk_index` on 2026-08-30 (archived per CLAUDE.md's Embedding Dimensions Policy, zero data loss verified at drop time) — the exporter's column choice predates that drop and is not a currently reachable source. The canonical/derived lane set today is `semantic_768` (embeddinggemma, canonical primary) plus derived `MRL-512`, `MRL-256`, `MRL-128` truncations and the separately-trained `latent_256`/`latent_128`/`latent_64` autoencoder projections (see CLAUDE.md, same section, for population counts per lane). The observed export therefore trained on 64-D vectors via a since-retired column path, not semantic_768 or any of its current derived lanes.
- The saved training report labels its cosine baseline `embedding384_cosine` while reporting `input_dim=64` — the label refers to the exporter's now-dropped `content_embedding_384` fallback logic above, not a live 384-dim retrieval lane (384 remains retired repo-wide, per CLAUDE.md; do not reintroduce it). Treat its JEPA/PCA metrics as historical and dimension/source-ambiguous; they are not evidence for a 768-D (or 512/256/128-MRL, or latent-256/128/64) comparison. No JEPA training or artifact regeneration was run in this audit.
- The saved pair/eval rows carry packet keys and vectors, but lack the `source_ref + source_revision + content_hash + representation_revision` identity tuple and immutable model/representation checksums required by `GEPA-768-INPUT-01`. The current Python bridge exposes `RepairMetricObservationV1` for scoring, but no typed semantic-retrieval-trace adapter was found.
- Code-only progress: `build_semantic_768_gepa_example_v1()` in `python/parent_atlas_dspy_repair.py` validates the stated metadata-only example shape, rejects missing/placeholder revisions, non-768 representations, lane/executor conflation, and unknown/raw-vector fields, and emits a deterministic checksum over the source/revision/content/representation identity tuple. Focused tests cover admission and fail-closed cases; this is not a live trace or canonical admission proof.
- Result: `GEPA-768-INPUT-01` remains OPEN. A real admitted trace, explicit duplicate-row handling in the future loader, and semantic-768 ownership reconciliation remain required before marking the gate complete. `DSPY-SIDECAR-01`, `GEPA-VERSION-01`, and held-out/shadow gates remain separate.
- No database, Qdrant, Valkey, model, or training-artifact writes were performed. The existing export files were read only.

### JEPA / REPRESENTATION-ROSTER-768-01 — forward contract update (2026-09-27)

- Canonical comparison reference: `semantic_768` / EmbeddingGemma, 768 dimensions.
- Native MRL challengers: `semantic_mrl_512`, `semantic_mrl_256`, `semantic_mrl_128`; each is a prefix of the same 768-D source followed by L2 renormalization. These are derived views, not separately encoded model outputs.
- Learned autoencoder challengers: `latent_256`, `latent_128`, `latent_64`. Keep these distinct from MRL even where dimensions match; identify the checkpoint/revision and whether a result came from a learned persisted vector or a derived virtual view.
- `python/compare_semantic_representation_recall.py` now includes the 768-D reference in a version-2 benchmark receipt and writes to a new v2 path by default. This remains read-only evaluation code; it was not run in this change.
- `scripts/atlas/train-packet-jepa.py` now requires every input vector to be finite, flat, and exactly 768-D, rejects mixed/legacy dimensions instead of dropping non-dominant rows, and labels the cosine baseline `semantic_768_cosine`. New JEPA outputs use a separate `semantic-768-v2` namespace. A dimension check is explicitly not encoder provenance; a qualified representation receipt is still required.
- Historical boundary: the existing 2,979 training / 197 evaluation rows and the old report remain unchanged. They are 64-D and their `embedding384_cosine` label is dimension/source-ambiguous; they are not relabeled or used as 768-D evidence.
- OPEN: repair the exporter to source revision-qualified canonical `semantic_768` vectors (not legacy `atlas_packets.content_embedding_384` / `embedding` / `latent_64` fallbacks), bind packet/source/content/representation identity, freeze a held-out cohort, and only then run the new JEPA and multi-representation evaluations. No database reads, model calls, training, or artifact generation were performed for this contract update.
- Follow-up validation (2026-09-27; local/read-only): added `scripts/atlas/test_train_packet_jepa.py` with seven regression cases. The configured workspace Python suite passes 7/7: finite flat 768-D accepted; nested, non-finite, and 64/128/256/384/512-D inputs rejected; eval vectors use the same gate; identical duplicate packet vectors collapse; conflicting duplicate vectors fail closed instead of last-row-wins. The existing default `--dry-run` also fails closed on the first historical 64-D row (`packet:004719ec513f`). No training, model invocation, or artifact writes occurred. This confirms input mechanics only; it does not qualify the old export or encoder provenance.
- Exporter owner recheck/action (2026-09-27; source-only): `scripts/atlas/export-packet-jepa-training-pairs.mjs` was still reading `atlas_packets.content_embedding_384`, `embedding`, and `latent_64`, selecting the dominant dimension, and emitting rows without source/content/representation receipts. It is now explicitly historical-only: default execution fails before database access, explicit archaeology opt-in writes to separate `legacy-unqualified-v1` artifact names, and the report marks `canonicalAuthority=false`. No 384-D data was relabeled. The forward exporter remains open and must consume a sealed, revision-qualified semantic materialization with packet/source/content/representation identity; that materialization is not available yet.
- Script-label consistency follow-up (2026-09-27): corrected existing workstation/smoke/snapshot scripts that described 384-D or 512-D as the canonical EmbeddingGemma lane. Logical canonical comparison reference is `semantic_768`; native MRL challengers are `semantic_mrl_512/256/128`; learned autoencoder challengers are `latent_256/128/64`. The JEPA trainer remains strict 768-D with duplicate packet-vector equality checks. This does not resolve the physical embedding-writer split: `content_embedding` remains the current comparison input candidate, not proof of admitted encoder provenance; `content_embedding_768` was not substituted by assumption. No inference, training, datastore writes, or artifact regeneration performed.
- [x] `JEPA-MRL-SMOKE-01` (2026-09-27; code + local fixtures): updated `scripts/atlas/smoke-test-embedding-truncation.mjs` to remove the live 384/128/top-8 comparison path and model-price claims. The canonical reference is `semantic_768` (EmbeddingGemma); the only MRL views are named `semantic_mrl_512`, `semantic_mrl_256`, and `semantic_mrl_128`, prefix-truncated and L2-renormalized. Cosine diagnostics zero-pad a derived view to 768 dimensions before comparison, so omitted coordinates are not silently ignored; no score threshold is presented as retrieval quality. Storage output is explicitly raw `halfvec` payload bytes only, excluding row/index/metadata overhead. `--gates-only` runs deterministic local checks without contacting :8081. Regression suite: 5/5; offline gates: 4/4; `node --check` passed; canonical TypeScript embedding contract suite 11/11. Live service, training, datastore writes, and artifact generation were not run. The existing TypeScript embedding contract remains the representation owner; this smoke is diagnostic and does not establish encoder provenance or promotion.
- [x] `REPRESENTATION-LABEL-CLEANUP-01` (2026-09-27; source-only): corrected the Phase 16 alignment report and shared vector registry to name `semantic_768` / EmbeddingGemma as the sole canonical dense reference, list native MRL 512/256/128 and learned latent 256/128/64 as distinct noncanonical representations, and classify 384-D as retired. Added registry tests proving the width/name/derivation split, including that equal-width MRL and latent representations do not collapse. Marked the old population-runner dense stage retired and fail-closed rather than redirecting it into a write-capable 768-D backfill; updated its latent-stage prerequisites. Relabeled PCA 768→384 as `pca_384_experimental` with `canonical_authority=false` and removed the false native-384 EmbeddingGemma comparison. Retired the synthetic 384-D Redis prewarm before any connection/write and downgraded the lineage script's old 384-D cache observations to non-admitted historical evidence. No model calls, training, database reads/writes, projection writes, or report regeneration performed.
