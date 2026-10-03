## 1. Governance rules (apply to every worker, not restated per-assignment)

- [x] 1.1 Never infer canonical ownership from matching filenames, field names, schema names, or
      concepts. Read actual callers/data before accepting an ownership claim.
- [x] 1.2 Distinguish, as separate axes, never collapsed into one status field: `capabilityOwner`,
      `materializer`, `persistenceOwner`/`persistenceBridge`, `liveCandidateProducer`,
      `routerSignal`, `fusionRole`, `SearchRuntime logicalLane`.
- [x] 1.3 A negative proof is a valid terminal state (`CLOSED_NEGATIVE`, `NOT_A_FUSION_LANE`,
      `BLOCKED_STRUCTURALLY_ABSENT`) — do not leave a disproven hypothesis artificially `OPEN`.
- [x] 1.4 Do not promote an implementation merely because its tests pass.
- [x] 1.5 Do not introduce a second owner when a canonical owner already exists
      (`docs/architecture/runtime-ownership-registry.json`).
- [x] 1.6 Do not let executor identities create duplicate logical-lane votes (one vote per
      `LogicalRetrievalLane`, per the already-proven `AFC-LANE-PARITY-01` fixture).
- [x] 1.7 No DB/Qdrant/Valkey/Neo4j writes unless the specific gate explicitly requires an APPLY
      proof with prior operator authorization.
- [x] 1.8 Preserve revision-qualified identity; fail closed when provenance is missing — never
      default a missing `sourceRevision`/`workspaceRevision`/`packetKey` to `unknown`/`latest`.
- [x] 1.9 Never run destructive migrations or cleanup automatically.
- [x] 1.10 Do not install new MCP servers/frameworks/dependencies merely because they exist —
      record a capability-gap justification first (`DEPENDENCY-CAPABILITY-GUARD-01`, root
      `CLAUDE.md`).
- [x] 1.11 `QUERY-RADIX-01` remains prototype-only until its own acceptance gate
      (`AFC-RADIX-ACCEPT-01`) is explicitly closed; no worker promotes it as a side effect.
- [x] 1.12 Treat superseded receipts as historical, not authoritative, once a newer receipt
      explicitly supersedes them (e.g. `afc-helper-owner-verification-v2.json` over `-v1`).
- [x] 1.13 Do not edit another agent's actively-owned files. Check `git status --short` before
      editing; do not stage unrelated dirty files.
- [x] 1.14 Every worker's final report uses this shape, never a bare "done":
      `status / likely_cause / evidence / changed_files / tests / writes_performed /
      canonical_authority_changed / remaining_blockers / safe_next_command / report_path /
      git_commit`.

## 2. Reconciliation of source plan against live `openspec-workboard-v1.json` (2026-09-27)

The externally-drafted plan cited completion counts from an unspecified earlier snapshot. Re-ran
the actual workboard projection before freezing any wave assignment. Most figures matched closely;
these are the discrepancies large enough to flag:

- [x] 2.1 `parent-atlas-openspec-tasks-audit-fabric` — cited as `11/12`; **actually `11/11`, fully
      closed, zero open checkboxes** (verified directly, not just via the workboard projection).
      Remove from the wave plan entirely — nothing to assign.
- [x] 2.2 `parent-atlas-kv-cache-adaptation-research` — cited as `10/88`; **actually `4/27`** — both
      numerator and denominator differ substantially, suggesting the source snapshot was against a
      different/older version of this file, or conflated it with another change. Treat the live
      `4/27` as authoritative.
- [x] 2.3 `parent-atlas-repair-candidate-feature-matrix` — cited as `121/156`; actually `86/108`.
- [x] 2.4 `parent-atlas-candidate-feature-execution-fabric` — cited as `244/342`; actually
      `228/322`.
- [x] 2.5 `parent-atlas-retrieval-lineage-dag-convergence` — cited as `812/1065`; actually
      `799/1052` — close, minor drift, not a snapshot-mismatch magnitude like 2.2-2.4.
- [x] 2.6 All other cited changes matched the live workboard within normal single-session drift
      (a handful of tasks either direction) — not separately itemized here; see the full reconciled
      table in section 3.

## 3. Wave assignments (reconciled counts, `completed/total`, live 2026-09-27)

### Wave 1 — near-closure (implementation allowed after each worker's own read-only census)

- [ ] 3.1 **Worker A — Agentic/Ornith closure.** Owns: `parent-atlas-agentic-repair-fabric` (37/38),
      `parent-atlas-agentic-completion` (10/11), `parent-atlas-analysis-pass-ornith-adapter`
      (24/25). Do not: alter AFC routing, touch QUERY-RADIX, change SearchRuntime fusion, run
      broad Graphify, install another agent framework. Ornith topology: llama-server/Ornith 1.5
      owner is `:8090`; NLP/LangExtract sidecar is `:8095` and consumes that backend — a healthy
      sidecar `/health` does not prove a successful `/analyze` execution.
- [ ] 3.2 **Worker B — Adaptive DAG / OpenSpec audit closure.** Owns:
      `parent-atlas-adaptive-dag-fabric` (11/13), `deep-audit-code-gates-aug22` (16/28).
      (`parent-atlas-openspec-tasks-audit-fabric` removed per 2.1 — already closed.) Do not create
      a universal DAG owner merely because several implementations use topological sorting — keep
      workboard/execution/KAG/citation/graph-topology DAGs separate unless API compatibility and
      existing callers are proven first.
- [ ] 3.3 **Worker C — Ontology/OKF near closure.** Owns (near-closure first, do not grind the
      third item until the first two are closed or terminally classified):
      `parent-atlas-ontology-oaklib-fanout-bitmap` (33/36), `parent-atlas-okf-knowledge-layers`
      (36/41), then `parent-atlas-ontology-kernel` (218/308) critical-path mapping only. Canonical
      boundaries: runtime classifier = `domain-taxonomy.ts`; persisted domain identity =
      `atlas_domain_ontology.group_id`; OAK concept identity = `atlas_ontology_concepts`;
      `taxonomy_nodes`/`taxonomy_edges` are read-model surfaces, not source identity;
      `domain_taxonomy_v1` is an unpopulated adapter candidate, not authorized canonical authority.
      Do not populate it, rewrite `atlas_packets.domain_class` history, or mint ontology IDs from
      classifier output.
- [ ] 3.4 **Worker D — GPU recommendation/runtime closure.** Owns:
      `parent-atlas-gpu-prellm-recommendation-v1` (35/37), `parent-atlas-gpu-runtime-abi-alignment`
      (17/22), then classify (do not grind) `local-llm-offload-ownership` (43/62). Hard boundary:
      executor identity (CUDA/cuVS/cuGraph/TensorRT/cuTile) is never canonical representation
      identity; no GPU component owns packet/source/symbol identity; do not upgrade
      `UNIT_PROVEN_NOT_LIVE` to live without actual runtime evidence.

### Wave 2 — load-bearing convergence (start read-only; implement only non-colliding gates)

- [ ] 3.5 **Worker E — Retrieval convergence.** Owns:
      `parent-atlas-retrieval-executor-compatibility-convergence` (39/48),
      `parent-atlas-retrieval-fusion-reachability` (119/144),
      `parent-atlas-retrieval-lineage-dag-convergence` (799/1052, corrected per 2.5),
      `parent-atlas-qdrant-structural-payload-enrichment` (16/23). First deliverable:
      `docs/reports/retrieval-convergence-current-blockers-v1.json` enumerating every unchecked
      gate's dependency on lineage/source-authority/lane-normalization/live-executor-proof/payload-
      enrichment/shared-SearchRuntime-edit. Never synthesize `packet_key`/`symbol_version_id`/
      `workspace_revision`/`source_revision`/`representation_revision` — derive only from proven
      canonical lineage.
- [ ] 3.6 **Worker F — Semantic/representation/residency convergence.** Owns:
      `parent-atlas-semantic-768-canonical-contract` (45/70 — this session already ran one bounded
      recheck, `SEMANTIC-768-OWNER-RECHECK-2026-09-27`; read it before re-deriving),
      `parent-atlas-tensor-residency-integration` (97/151),
      `parent-atlas-prefill-routing-residency-convergence` (125/152),
      `parent-atlas-pca-svd-representation-baseline` (7/18). Keep separate: embedding producer
      capability (proven, `EMB-PROV-01`) vs. canonical representation contract vs. representation
      lineage vs. semantic retrieval executor vs. SearchRuntime fusion adapter vs. residency/cache
      representation — proof of one never certifies another. `SEM-MATERIALIZE-01` stays blocked on
      `PERSISTENCE-DECISION-01` (preferred default if still open: `FILES_ONLY_SEALED_ARTIFACT`).
- [ ] 3.7 **Worker G — Candidate feature/ranking fabric.** Owns:
      `parent-atlas-candidate-feature-execution-fabric` (228/322, corrected per 2.4),
      `parent-atlas-best-fit-score-fabric` (404/678),
      `parent-atlas-repair-candidate-feature-matrix` (86/108, corrected per 2.3),
      `parent-atlas-xgboost-cuda-runtime-proof` (12/30). Find the smallest remaining vertical slice
      from revision-qualified candidate → `CandidateOrdinalMap` → `CandidateFeatureSnapshot` →
      `CandidateFeatureMatrix` → ranking → receipt. GPU is executor, not feature authority; ranking
      output never promotes source/packet identity. First deliverable is a blocker matrix, not
      code; then at most one bounded vertical slice whose prerequisites are all `PROVEN`.
- [ ] 3.8 **Worker I — NLP/query classification/observation routing.** Owns:
      `parent-atlas-nlp-sidecar-feature-compiler` (88/148),
      `parent-atlas-query-routing-classifier` (41/98),
      `parent-atlas-observation-routing-fabric` (16/26),
      `parent-atlas-policy-routing-integration` (25/40),
      `parent-atlas-pass-fabric` (15/56),
      `parent-atlas-native-acceleration-cabi` (14/63),
      `parent-atlas-onnx-webgpu-embedding-promotion` (4/17). (Merged the source plan's separate
      routing/sidecar/pass/native-ABI/ONNX assignment into this one worker per its own note that
      these share enough surface to need one reconciler, not two.) Keep `QueryClassificationV1` →
      `TaxonomyScopeV1` → `KeywordRecognitionV1` → `QueryExpansionBundleV1` → `HelperEligibilityV1`
      → `RetrievalPlanV1` distinct — never collapse `routerSignal`/helper/executor/fusion-lane. A
      reachable `/health` never proves a working `/analyze`. Native ABI/CUDA code never owns
      canonical data identity; ONNX/WebGPU embedding stays a challenger until representation/
      normalization/dimensional parity plus revision identity are proven.
- [ ] 3.9 **Worker J — Graph substrate/convergence.** Owns:
      `parent-atlas-graph-analysis-contract` (62/84), `parent-atlas-graph-validation-fabric`
      (61/94), `parent-atlas-graph-retrieval-proof` (160/285), then close near-finished first:
      `parent-atlas-graph-runtime-python-consolidation` (14/18),
      `parent-atlas-graph-runtime-enhancement` (3/8),
      `parent-atlas-graphify-recovery-proof-ladder` (4/9). Do not run `graphify:daily` merely
      because the graph is stale — confirm the chosen gate actually needs freshness first.
      Canonical graph-analysis owner: `src/lib/server/graph/graph-analysis-runner.ts`. Graph
      algorithm capability never owns graph identity; `graph-ppr` stays a ranking feature outside
      SearchRuntime fusion, per this session's already-closed `AFC-GRAPH-LANE-01`.

### Wave 3 — cross-plane orchestration (start read-only; bounded scope per assignment)

- [ ] 3.10 **Worker H — ACE/BitFrost/RLM convergence.** Owns:
      `parent-atlas-ace-rlm-bitfrost-integration` (698/909, corrected per §2 drift),
      `parent-atlas-ace-bitfrost-cache-correctness` (56/89),
      `parent-atlas-memory-architecture-freeze` (19/31). Do not attempt the entire remainder — find
      only the gates load-bearing for cache identity, residency eligibility, immutable packet
      identity, prefill identity, readback verification, invalidation, revision mismatch, cold/warm
      promotion. Keep MODEL memory (KV/attention/SSM state) and CONTROL memory (ACE/Engram/
      residency) distinct; BitFrost is never canonical packet authority. Select at most 3
      implementation gates after the audit.
- [ ] 3.11 **Worker K — Ingestion/lineage critical path.** Owns:
      `parent-atlas-gate2-chunk-lineage-convergence` (3/20),
      `parent-atlas-code-ingestion-pipeline` (26/35),
      `parent-atlas-canonical-directory-ingestion-fabric` (21/66),
      `manual-migration-reconciliation` (84/110),
      `parent-atlas-error-embedding-768-migration` (12/25). Treat lineage as higher priority than
      completion percentage. Start with a read-only writer/reader census of `sourceRevision`,
      `workspaceRevision`, `packetKey`, `symbolVersionId`, `treeNodeId`, `representationRevision`;
      classify every missing edge as `ABSENT`/`NULLABLE_LEGACY`/`WRITER_MISSING`/`READER_MISSING`/
      `REVISION_UNQUALIFIED`/`PROVEN`. Do not repair data before the canonical writer is
      established.
- [ ] 3.12 **Worker L — Workboard/agent orchestration convergence.** Owns:
      `parent-atlas-workboard-feature-utility-fabric` (28/70),
      `parent-atlas-agentic-file-compiler` (24/34 as of this session's own last commits — **read the
      newest `tasks.md` and `afc-helper-owner-verification-v2.json` directly; do not treat any
      historical v1/v2/v3 receipt as current authority**),
      `parent-atlas-agentic-repair-bundle-integration` (26/84). Do not rerun `AFC-HELPER-01`, do not
      promote `QUERY-RADIX-01`, do not install ast-grep MCP. Start read-only because AFC has had
      concurrent edits from another session this same week. First output:
      `docs/reports/workboard-afc-integration-boundary-v1.json`; do not wire runtime until reviewed.
      `parent-atlas-opencode-replay-proof` (2/19) is explicitly **excluded from this worker and from
      every wave** — stays read-only-only until the workboard/AFC orchestration boundary stabilizes
      (baking today's still-changing ownership assumptions into replay fixtures would be premature).

### Explicitly not independently assignable yet (per source plan's own caution)

- [x] 3.13 `parent-atlas-governed-compute-fabric` (2/158, ~1%), `parent-atlas-gpu-graph-vector-substrate`
      (2/27, ~7%), `parent-atlas-kv-cache-adaptation-research` (4/27, corrected per 2.2),
      `parent-atlas-opencode-replay-proof` (2/19) are broad/early enough that an independent worker
      could create parallel owners before the underlying convergence work settles. None of these get
      a wave assignment in this plan.

## 4. Launch gate (explicit, separate from this document)

- [ ] 4.1 **Do not launch any worker from this plan without a separate, explicit operator
      instruction naming which wave or which specific workers to launch.** Writing and validating
      this tasks.md does not itself authorize spawning any subagent.
- [ ] 4.2 When a launch is authorized, give each worker its own worktree/branch (e.g.
      `codex/retrieval-convergence`, `claude/semantic-residency`) — do not let concurrent workers
      commit to the same branch, per this session's own two prior concurrent-write collisions on
      `parent-atlas-agentic-file-compiler`.
- [ ] 4.3 The supervisor/operator merges only after each worker's receipts/tests show no
      shared-owner collision, per section 1.13 and the Wave 2/3 "start read-only" requirements.
