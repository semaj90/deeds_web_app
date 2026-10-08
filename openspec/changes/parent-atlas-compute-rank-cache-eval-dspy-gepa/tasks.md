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


## OAK-HGR-ALIGN — merged HyperGraphRAG / isolated OaK-Pydantic / executor parity (2026-10-07 audit)

**Status: AUDITED_SOURCE_ONLY / IMPLEMENTATION_AND_LIVE_PROOFS_OPEN.** Do not delete the existing Python, NetworkX, RAPIDS, simdjson, or Neo4j surfaces simply because upstream HyperGraphRAG's Neo4j adapter lacks their execution. Treat upstream `hypergraphrag/kg/neo4j_impl.py` as a storage reference, not identity owner. This repo already has `docs/.okf/architecture/hypergraphrag-external-doc-fabric-v1.md`, `python/atlas_external_doc_hypergraph.py`, a Pydantic BeautifulSoup boundary validator, NetworkX and cuGraph executors, an Oaklib read-only adapter, and a simdjson N-API bridge. No new table or migration is authorized by this audit.

### Audited owner paths (default-branch source census)

- Hypergraph candidate/proposal: `python/atlas_external_doc_hypergraph.py`; candidate is noncanonical and `graph_revision=None` until admitted by the existing owner.
- Ingestion Pydantic boundary: `scripts/atlas/validate-okf-beautifulsoup-pydantic-v1.py` (strict/frozen `BeautifulSoupCaptureV1`, no crawl/store authority). Reuse `python.atlas_external_docs.fetch_beautifulsoup` only after exact owner/span proof.
- NetworkX oracle: `python/atlas_graph_runtime/networkx_executor.py`; cuGraph executor: `python/atlas_graph_runtime/cugraph_executor.py`; GPU PPR already supports explicit candidate ordinals, dangling personalization and numeric checks. Audit observed paths, not production dispatch or executed parity.
- Oaklib dependency and adapter: `python/requirements-oaklib-adapter.txt`, `python/parent_atlas_ontology/oaklib_external_adapter.py`, `docs/architecture/oaklib-external-ontology-adapter-v1.md`. **Oaklib != OaK**; isolated OaK agent runtime must not mint concept IDs or auto-promote relations.
- N-API simdjson: `packages/parent-atlas-retrieval/src/gpu/simdjson-bridge.ts` (SHA256 full-content cache key, fallback); review actual runtime capability/performance and reject malformed JSON before comparing transports.
- OKF: `docs/.okf/schema.yaml` is repo-local code-intelligence registry, not Google's external OKF specification. It links canonical owners and must not become a competing facts schema.
- Existing owner contracts: `OntologyLinkedTupleV1`, `HyperedgeV1`, `ConceptV1/createConceptV1` and `semantic_768` primary logical retrieval lane. Never confuse CUDA execution choice with a new RRF lane.
- **Important repo parity gap**: the locally reported `python/parent_atlas_ontology/grounded_nlp_fact_v1.py` is not present at that path on inspected GitHub main; verify local worktree and branch before importing or marking its tests proven on the shared branch.

### Execute in order; retain all checkboxes OPEN until actual receipts

- [ ] OAK-HGR-00 — reconcile merged main/worktree with prior HGR task ledger: verify merge SHA, branch lineage, and existing paths; preserve newer local work; deduplicate only after owner/path census. Do **not** delete upstream adapter or any existing executor without proven no-callers and replacement parity.
- [ ] OAK-HGR-01 — `CURRENT_PACKET_CHUNK_IDENTITY_RECONCILIATION` blocker: investigate missing canonical packet/chunk linkage across a full frozen cohort, preserving exact source_ref/source_revision/workspace_revision/content digest. The operator-reported 52/52 revision/content matches, 24/52 packet identity matches and 5/52 proven packet/chunk lineage are bounded observations, **not** full-cohort proof. Legacy packet content_hash is diagnostic, never substitute identity. Read-only until coverage/owner resolved.
- [ ] OAK-HGR-02 — reconcile the strict frozen `grounded_nlp_fact_v1.py` dataclass between local workstation and tracked GitHub; compare TS checksum canonicalization and required fields to proposal bridge and `OntologyLinkedTupleV1`. Reject missing roles, unknown fields, malformed byte spans, mismatched revisions and `canonical_authority=true`.
- [ ] OAK-HGR-03 — create an **isolated optional Pydantic v2 mirror for grounded facts** in the OaK/ontology worker environment. `ConfigDict(extra="forbid", frozen=True, strict=True)`, exact enum/value/span constraints, explicit to/from dataclass bridge, versioned schema parity and canonical JSON checksum parity; no Pydantic dependency added to default runtime. Distinguish the already-present BeautifulSoupCaptureV1 validator from the not-yet-proven grounded-fact mirror. Pin Pydantic and Oaklib independently.
- [ ] OAK-HGR-04 — BeautifulSoup raw HTTP bytes -> normalized UTF-8/document snapshot -> source spans -> grounded fact bridge; carry normalization/parser revisions and prove exact evidence slice against snapshot. HTML raw-byte offsets and normalized UTF-8 byte offsets must be distinct coordinate systems. Test changed HTML, multibyte text, unsafe URLs/SSRF, encoding, duplicate fragments and rejected authority.
- [ ] OAK-HGR-05 — adapter from validated grounded fact to `HypergraphFactProposalV1` to reviewed `OntologyLinkedTupleV1` / `HyperedgeV1` via **existing** promotion owner. Preserve n-ary role incidence and provenance; verify round-trip source/role identity and unresolved/ambiguous OaK resolution. No graph revision invented and no tuple persistence without schema/readback gate.
- [ ] OAK-HGR-06 — frozen node/edge/ordinal graph snapshot + NetworkX reference PageRank, reversed-edge CheiRank, PPR, BFS/SSSP/SCC/topological sort where graph preconditions hold. Include isolates, sink nodes, weighted/directed edges, deterministic tie order, tolerances and numerical convergence. Separate ordinary graph walks from hypergraph incidence expansion.
- [ ] OAK-HGR-07 — cuGraph PPR/PageRank/CheiRank adapter parity over same frozen ordinals; explicit kernel/version, input/output digests, missing-vertex and convergence checks. Compare CPU and GPU score delta, top-K overlap, edge reversal, latency, peak VRAM and transfer time. Fail-open to CPU **execution** but fail-closed on provenance/admission.
- [ ] OAK-HGR-08 — verify cuVS exact/CAGRA challengers remain executor choices within single semantic_768 lane; no extra fusion vote, no auto-admission of graph features, no retrieval identity inferred from a GPU row ordinal.
- [ ] OAK-HGR-09 — benchmark existing simdjson N-API bridge vs stdlib/V8 JSON and Python JSON/Pydantic on identical immutable metadata payloads (UTF-8, duplicate keys, invalid UTF-8, malicious size, cache-key collision attempts). Record checksums and readback. SIMD parsing is CPU; SIMT is GPU; neither is grounding.
- [ ] OAK-HGR-10 — compare existing cuGraph sparse primitives/SpMV-SpMM and cuBLASLt GEMM baselines before PyTorch/cuTile custom SIMT kernels. Ampere RTX 3060 Ti support, precision, correctness, launch overhead, VRAM budget, CUDA/WSL environment and GPU unavailable fallback are mandatory benchmark fields. Do not push Neo4j I/O or HTML parsing through GEMM.
- [ ] OAK-HGR-11 — isolated OaK MCP sidecar proof: versioned read-only request/response, exact admitted evidence IDs, ontology revision, ContextManifest checksum, explicit timeouts/resource caps and subprocess/venv pinning. `oaklib` proposals stay untrusted inputs; OaK tool calls cannot grant graph or packet authority.
- [ ] OAK-HGR-12 — tokenization and ACE/BitFrost: classify n-gram/Engram IDs as hints, bind packet/representation/graph revisions to selected evidence and verify prompt tokenization with actual tokenizer revision. Token offsets != UTF-8 byte evidence spans.
- [ ] OAK-HGR-13 — run focused offline fixture suites, strict OpenSpec validation, native backend capability checks and read-only MCP E2E; save deterministic positive/negative receipts with fail-closed cases. No live store writes, model promotion, deletion or status checkbox updates without explicit results.

**Local smoke recommendations, to run after worktree synchronization:** `npm run atlas:nlp:grounded-fact:python-roundtrip`; `python -m unittest python.test_grounded_nlp_fact_v1 -v`; `python python/parent_atlas_ontology/oaklib_external_adapter_check.py`; `python scripts/atlas/prove-oaklib-external-adapter-v1.py`; `npx openspec validate parent-atlas-compute-rank-cache-eval-dspy-gepa --strict`. First two commands require the locally reported grounded-fact files, not present at the audited GitHub paths. Check GPU dependencies explicitly before any RAPIDS run. TOC/registry regeneration must use the existing generators rather than manual generated-file edits.
