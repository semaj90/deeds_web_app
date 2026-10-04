## 1. WB-COMPACT-01: read-only source census

- [x] 1.1 Regenerate the existing Workboard into a temporary path; verify every `sourceFileHashes` entry against current `tasks.md` bytes and bind the census to the workspace revision and task-population checksum. Evidence: all 94 task-file hashes match; the census records the current HEAD and task-population checksum.
- [x] 1.2 Emit a compact `openspec-artifact-census-v1.json` with current/actionable, waiting, checked-claim, supersession-review-candidate, and report hot/warm/cold-candidate/review-required counts and byte totals; enforce the 10,000,000-byte output limit. Evidence: `docs/reports/openspec-artifact-census-v1.json` is 2,247 bytes and reports 10,454 tasks plus 1,255 report files.
- [x] 1.3 Treat Workboard text/heuristic matches as review candidates only; confirmed superseded count stays zero until an exact successor relation and current revision-bound review evidence exist. Evidence: census records 57 supersession review candidates and zero confirmed superseded tasks.
- [x] 1.4 Count report paths and sizes without reading contents; leave archive candidates at zero until current references, replay need, sensitivity, canonical/source status, and supersession are reviewed. Perform no task-ledger, archive, cache, database, or vector writes. Evidence: 1,255 files / 14,333,696,984 bytes inventoried by filesystem metadata; all remain review-required and archive candidate count is zero; every mutation flag is false.

## 2. WB-COMPACT-02: task-card and lifecycle contracts

- [x] 2.1 Define and compile `TaskCardV1` from a fresh Workboard task snapshot and current evidence-fabric census; verify source-file, block, identity, and workspace revisions; keep authority and mutation permission false. The shared corpus build previously joined 10,455 cards; a fresh same-revision isolated build now joins 10,463 cards across 94 ledgers, 8,337,981 bytes, with exact Workboard identity/revision parity. Evidence: `docs/reports/wb-taskcard-population-parity-v1-20261003.md`. The scratch output stayed under ignored `.tmp`; shared reports were not overwritten.
- [x] 2.2 Define `ReportArtifactManifestV1` and `SupersessionLinkV1` from revision-bound report/task sources; keep report status review-only until lineage, sensitivity, replay, and exact replacement are verified. The current validation receipt is bound to this task's exact block and workspace revision; the rebuilt manifest joins its report output only after fresh checksum readback. Thirty-four focused contracts pass, including canonical receipt-schema identity/span checks; no canonical or archive writes occurred. Strict OpenSpec validation passes. Confirmed superseded and archive-eligible counts remain zero.
  - Existing owners: `build-openspec-report-manifests-v1.mjs` / `openspec-report-manifest-v1.mjs`; `build-openspec-task-cards-v1.mjs` / `openspec-task-card-v1.mjs`; `build-openspec-task-triage-corpus-v1.mjs`; `audit-openspec-evidence-fabric-v1.mjs` receipt-output identity.
  - Exact gap: receipt outputs can associate only to their exact current task source span, revision, and independently fresh-hashed report artifact; unreceipted artifacts remain unassociated and supersession remains review-only.
  - Proof level: WIRED and DRY_RUN_PROVEN for one current receipt/task/report association, same-revision pipeline composition, and receipt checksum/span validation; NOT_PROVEN for supersession confirmation and archive eligibility.
  - Mutation scope: isolated scratch artifacts only; no task checkbox, database, vector, cache, or SeaweedFS mutation. Scratch artifacts were removed after readback.
  - Evidence refs: `docs/reports/openspec-task-triage-pipeline-dryrun-v1-20261003.md`; that report carries the revision-specific receipt URI and checksum without embedding a self-referential `tasks.md` hash here.
  - Blocker: no exact reviewed supersession links exist; report sensitivity/replay dispositions and archive eligibility remain unproven.
  - Next gate: review exact successor evidence for `2.3`; do not suppress historical tasks or archive artifacts without a separate readback gate.
- [ ] 2.3 Compress only reviewed superseded work to one card containing `SUPERSEDED`, successor task, exact reason, last valid revision, archive manifest, and SeaweedFS raw pointer; preserve local sources until archive readback receipts pass.
- [x] 2.4 Default retrieval to `CURRENT`, `WAITING`, and `REVIEW_REQUIRED`; include `SUPERSEDED` or `HISTORICAL` only for explicit history/debug queries. Evidence: `scripts/atlas/retrieve-openspec-task-triage-v1.mjs --limit=1` returned one current-corpus card with `writesPerformed=false`; contract tests prove history exclusion by default, explicit history inclusion, bounded limits, and preserved compiled order. No new ranker is claimed.
- [ ] 2.5 Keep `[x]` as a checked claim, not proof; require revision-bound evidence and independent verification before reporting proven completion.
- [x] 2.6 `WB-TASKCARD-OWNER-01` — reconcile the existing task-card corpus, current/admitted selector, deterministic ranker, and report-vs-Workboard manifest scopes before classifying unmatched rows. `TaskCardV1` is the sole task projection; `selectOpenSpecTaskCardsV1` owns the revision-bound selection result/checksum, and the TaskCard rank interface consumes that exact candidate set without eligibility filtering. Raw Workboard ranking is retained as explicitly legacy compatibility; it has no canonical selection authority. `ReportArtifactManifestV1` remains per artifact; `atlas.workboard-report-manifest.v1` remains the Workboard shard contract. Focused selector/cohort/ranker tests pass. The ranker currently uses neutral stable-identity ordering and reports `NO_REVISION_BOUND_TASKCARD_RANK_FEATURES`; this gate freezes ownership, not ranking quality. Evidence: `docs/reports/wb-taskcard-owner-v1-20261003.md` and `docs/reports/wb-taskcard-population-parity-v1-20261003.md`. Strict OpenSpec validation passes. The old 337/1,742 figures were not valid TaskCard unmatched counts; same-revision Workboard/TaskCard parity is independently recorded.
- [x] `TASKCARD-PARITY-01` — resolved/currently observed, not a new blocker. Earlier cohort: 10,455 matched, 7 board-only tasks added after that card build, 0 card-only; workspace `9b15098c243234751cb57a5977be78aa35840e9a`, task-population revision `sha256:6c20859eb4b01e1e425de46d098dcc277f5ba93035bd131888ffbf77d7c0d885`. Later isolated same-revision build: 10,463 matched, 0 board-only, 0 card-only; workspace `6ff213ca1537927ad59916c2c29b13cde9589dcb`, task-population revision `sha256:233d86704de656247ce6cac7d9e7d0f59cedaeaf4a52700e7e403f596ea10876`. Treat the later run as current parity. The 337/1,742 figures compared Workboard tasks with EvidenceCards, not TaskCards.
- [ ] `EVIDENCE-TASK-JOIN-01` — classify the relation between the 11,024-card EvidenceCard population and the 10,455-card observed TaskCard cohort as 0, 1, or N task matches per EvidenceCard. Bind the run to exact revisions; do not assume 1:1 or create a second card authority. This is a separate join, not a TaskCard parity blocker.

## 3. Incremental OpenSpec runner and optional Graphify signals

- [ ] 3.1 Stream task ledgers and emit task-block identity, exact source span/checksum, checkbox claim, declared links, and snapshot revision; reject inputs that change during read.
- [ ] 3.2 Add replay fixtures for stable identities on unchanged inputs and invalidation after task text, source checksum, span, or workspace revision changes.
- [ ] 3.3 Resolve only explicit successor/supersedes edges; leave similarity-only pairs visible as review candidates and prove there is no automatic suppression or ledger mutation.
- [ ] 3.4 Join claims to current evidence-fabric/workstation receipts and expose missing, stale, contradictory, blocked, verified, and human-review states.
- [ ] 3.5 Treat Graphify changed-file/symbol/domain output as optional change signals mapped to declared task read/write sets. The existing OpenSpec evidence-fabric runner owns incremental refresh; Graphify is neither scheduler nor task-state owner and never rewrites task authority.
- [x] 3.6 `EVF-05B_DIRTY_SET` — implemented in the existing runner and proven by `--incremental --dry-run`: canonicalized embedding-input hash, revision-only changes do not dirty semantic content, versioned baseline, added/modified/removed/unchanged counts, and no baseline write. A clean smoke observed 0 dirty / 11,024 unchanged with `writesPerformed=false`; full-run defaults remain unchanged. Evidence: `docs/reports/openspec-pipeline-parallel-lanes-v1-20261003.md` and `scripts/atlas/run-openspec-evidence-fabric-v1.test.mjs`. No apply/persist gate is authorized.

## 4. Bounded evidence and semantic retrieval

- [ ] 4.1 Chunk evidence by task with exact refs/checksums, byte/token caps, and backpressure; prove bounded memory on a large fixture.
- [ ] 4.2 Embed only compact TaskCards after the task/evidence join, model receipt readback, and task-universe ordinal binding pass; use a task-specific representation and re-embed dirty cards only. The historical 11,024 EvidenceCard × 5 plan was 55,120 representations; it is not authorization to embed or persist.
  - Existing boundary: `executeEmbeddingInputV1` owns input-recipe application and vector validation; `embedding-provider-executor-v1.ts` owns transport execution. Treat these as distinct stages, not competing semantic owners. `/api/embed` remains the existing request/execution route.
  - Exact gap: TaskCard embedding/indexing, corpus-recipe qualification, incremental dirty-card re-embedding, and migration of remaining direct callers remain unproven. The shared batch executor now prepares task inputs before its gRPC/QUIC/llama-server/Ollama/ONNX tiers, partitions cache keys by formatted input, validates each 768-vector and batch cardinality, and returns per-input recipes. Bounded paths also include `/api/embed`, six SvelteKit query routes, TRACE MCP, `trace.kag_search`, the MCP tool-manifest packet builder, and the retrieval orchestrator query path. Existing callers default explicitly to `unprompted_legacy`; this does not establish corpus parity or authorize TaskCard persistence. Other direct embedding callers remain outside this bounded adapter set.
  - Proof level: WIRED for the shared batch executor and enumerated paths; focused execution/API/wiring tests pass (15/15), and esbuild transpilation passes for the changed TS modules. Full TypeScript check reaches an existing error at `src/lib/server/db/schema/analysis-pass-results.ts:278` (`executionStatus` inferred as `string`, not the declared union). No TaskCard vectors or indexes were written.
  - Mutation scope: code/tests/report only; no tasks.md status mutation, Postgres/Qdrant/Valkey/SeaweedFS writes, or embedding persistence.
  - Evidence refs: `docs/reports/embedding-caller-convergence-adapter-v1-20261003.md`; `docs/reports/embedding-caller-convergence-manifest-caller-v1-20261003.md`; `scripts/atlas/lib/embedding-api-client-v1.mjs`; `sveltekit-frontend/src/lib/server/embedding/embedding-execution-adapter-v1.ts`; focused adapter and `/api/embed` route tests.
  - Blocker: live caller convergence, corpus/query recipe parity, and task-specific persistence remain unproven. Use the latest frozen census receipt; only `LIVE_DIRECT_CALLER` and true `LIVE_WRAPPER` bypasses count, not facade-only `/api/embed` callers.
  - Next gate: `EMBED-OWNER-FREEZE-01`, then caller migration/parity proof before enabling any persisted TaskCard embedding.
- [ ] 4.3 Evaluate TurboVec only as an in-memory challenger over the small current TaskCard/evidence-summary hot corpus, not the raw report archive; preserve one existing final ranking/fusion owner.
- [ ] 4.4 Establish reviewed relevance/supersession labels and report recall@K, precision@K, nDCG@K, false-supersession rate, coverage, and freshness.
- [ ] 4.5 `EMBED-OWNER-FREEZE-01` — remain open until one writer freezes the census implementation, transport-owner allowlist, dormant-code policy, and baseline together. Current working counts are diagnostic/latest-observed only because the script and baseline are modified, another session is writing the files, and guard semantics changed during the run: 78 direct, 9 wrappers, 10 non-callers, 18 dormant, 6 transport owners, 4 diagnostics, 81 tolerated baseline entries. Do not commit or rebaseline until the single-writer revision is settled. Guard success prevents new unclassified bypasses; it does not migrate existing callers.

## 5. Advisory ranking and bounded summaries

- [ ] 5.1 Preserve the current deterministic dependency/readiness ranker as incumbent and run every challenger against the same checksum-bound cohort and feature schema.
- [ ] 5.2 Extend the existing challenger tournament to record rank deltas, baseline/challenger revisions, coverage, evaluation metrics, missing inputs, and `selected=false`; reject mismatched cohorts.
- [ ] 5.3 Build bounded task/evidence cards for the top-K candidates with blockers, exact source spans, proof gaps, and excluded-candidate reasons; never send the full backlog to a model by default.
- [ ] 5.4 Add optional LangExtract/DAG extraction and Ornith `ornith-1.5-9b` summaries through the existing resolver; validate every material claim against exact current references and fail closed on model/sidecar failure.

## 6. WB-ARCHIVE-01: gated archive planning

- [ ] 6.1 Determine archive eligibility from size plus current references, replay requirement, sensitivity, canonical/source status, and reviewed supersession; size alone never makes an archive candidate.
- [ ] 6.2 Emit a SeaweedFS copy plan with source checksum/size, retention reason, and object key; preserve every local source and perform no archive writes.
- [ ] 6.3 Reuse and prove the authorized SeaweedFS copy/readback/receipt owner before proposing a separately authorized execution gate.
- [ ] 6.4 Enforce the strict 10,000,000-byte report gate; keep large raw outputs outside Git and require independent checksum/size readback before any later archival receipt.

## 7. WB-SEMANTIC-01, WB-FEATURE-01, WB-TOURNAMENT-01

- [ ] 7.1 Index compact current TaskCards and current evidence summaries only after ANALYSIS-MODEL-RECEIPT-01, ANALYSIS-EVIDENCECARD-OWNER-01, and ANALYSIS-ORDINAL-MAP-01 pass; keep Postgres canonical data unchanged and Qdrant as a rebuildable projection.
- [ ] 7.2 Build revisioned task features from task/evidence/NLP/ontology/dependency/hypergraph/domain/staleness signals using the ANALYSIS-* gates below; every feature column records `producerId`, `producerRevision`, `inputUniverseChecksum`, and `featureSchemaRevision`; update only dirty cards and affected feature rows.
- [ ] 7.3 Compare deterministic, semantic, Graphify, and low-rank challengers on the same frozen cohort; bind each run to `candidateUniverseChecksum`, `selectorRevision`, `featureSchemaRevision`, `truthSetRevision`, and `rankerRevision`; keep results advisory with `selected=false`.
- [ ] 7.4 After the compact corpus is stable, evaluate cuML KMeans using the existing WSL `atlas-rapids-cu13` owner and `sveltekit-frontend/scripts/atlas/kmeans-chunk-cluster.py`; centroids remain routing hints. Do not add a PyTorch KMeans implementation.
- [ ] 7.5 Limit TurboVec to a small current in-memory challenger corpus. Benchmark simdjson only on metadata JSON/JSONL, never vectors or Arrow tensors.

## 8. WB-CACHE-01: deferred hot routing

- [ ] 8.1 Define exact-revision Valkey keys and centroid cards for current TaskCards only; invalidate affected hints after dirty-card and centroid-membership updates.
- [ ] 8.2 Prove stale rejection, unavailable fallback, and deterministic retrieval parity without activating cache writes.
- [ ] 8.3 Keep Valkey as hot pointers/routing; Postgres/Qdrant as warm canonical/projection stores; SeaweedFS as cold immutable blobs; `.okf` as schemas, manifests, compact receipts, pointers, and corpus revisions.

## 9. Optional extraction and service boundaries

- [ ] 9.1 Refresh only after a verified daily Graphify receipt; retries are idempotent and unchanged inputs are skipped.
- [ ] 9.2 Keep deterministic baseline usable with optional services offline and report each unavailable/stale producer honestly.
- [ ] 9.3 Use LangExtract/Ornith only for grounded proposals and bounded summaries; claims require exact current source/evidence references.

## 10. Acceptance and promotion gates

- [ ] 10.1 Test checksum drift, stale reports, ambiguous supersession, checked-without-proof, bounded streaming, cache stale rejection, model failure, and archive readback failure.
- [ ] 10.2 Produce a compact replayable report with exact revisions/checksums, write flags, and selected count; require zero canonical writes and zero automatic selections.
- [ ] 10.3 Review dispositions before separately authorizing any cache, SeaweedFS, GPU, or scheduler-selection execution.
- [ ] 10.4 Run focused tests and strict OpenSpec validation; verify all report artifacts are below 10,000,000 bytes.

## 11. Existing OpenSpec analysis pipeline gate closure

These subtasks close admission gaps on the read-only pipeline and existing owners above; they do not create a second analysis system. All derived facts/cards/edges remain `canonicalAuthority:false`. Keep status `NOT_PROVEN` until the stated readback/evaluation passes. No model-driven task-state changes or unapproved durable writes.

- [ ] 11.1 `ANALYSIS-MODEL-RECEIPT-01` — remains `ARTIFACT_PROVEN / RUNTIME_BINDING_PARTIAL`, not wholly unproven. Existing artifact evidence proves the local GGUF path/checksum and 768-dimensional executor parity; tokenizer and input-policy revisions are recorded separately. The runtime-loaded check matches the loaded path/name, not an independently measured loaded-artifact checksum, and does not prove current executor availability or bind tokenizer/input policy per call. Keep semantic persistence eligibility closed pending the child verification gate, including pooling readback. Historical plan: 11,024 EvidenceCards × 5 = 55,120 representations, not 55,610.
  - **Child sub-gate `MODEL-RECEIPT-READBACK-01`:** a verifier separate from the producer independently reads the receipt and validates `modelId`, artifact checksum, `dimension=768`, pooling, tokenizer/model revision, producer revision, and active runtime/provider binding; it also checks per-call `tokenizerRevision` and `inputPolicyRevision`. This is a verification gate under the existing model owner, not a parallel model authority.
  - Evidence: `docs/reports/emb-prov-01-embedding-provenance-receipt.json`. Do not rerun its shared-output producer as the independent verifier.
- [ ] 11.2 `ANALYSIS-EVIDENCECARD-OWNER-01` — reconcile the generated OpenSpec EvidenceCard corpus owner; do not present `CandidateEvidenceCardV1/V2` as the OpenSpec ownership question. The latest audit identifies `atlas.openspec-evidence-card.v1` as the generated corpus and `atlas.evidence-card.v1` as a legacy/drifted contract, while the currently persisted portfolio census still emits the latter. Keep this open until a current revision-bound producer/readback proves the generated schema, producer, identity/revision fields, and checksum. `TaskCardV1` remains a derived projection; add no second card authority.
- [ ] 11.3 `ANALYSIS-ORDINAL-MAP-01` — blocked on owner contract compatibility. The existing `CandidateOrdinalMapV1` is packet/tree-node/symbol-version identity-bound; coercing TaskCard `stableKey` values into it would misstate identity, and its rows do not bind task-block revisions. Do not reuse code-chunk ordinals or create a parallel allocator. Next gate: add a discriminated OpenSpec task-universe variant to the existing ordinal-map owner, preserving packet consumers, then prove deterministic ordering, per-row task revision, universe/source revisions, checksum, and independent bounded readback. Evidence: `docs/reports/analysis-openspec-ordinal-owner-census-v1-20261003.md`.
- [ ] 11.4 `ANALYSIS-NLP-GROUNDING-01` — reuse the existing `:8095` NLP sidecar and its extraction owners to emit domain, concept, entity, action, artifact, capability/tool, and dependency-phrase facts. Every fact must carry an exact source span, source/task revision, and extractor revision; model/extractor output stays non-authoritative.
- [ ] 11.5 `ANALYSIS-ONTOLOGY-TUPLE-01` — reuse the existing five tuple tables and ontology tuple owner; map grounded NLP facts into those relations and freeze the owning table for `DOMAIN`, `CONCEPT`, `ENTITY`, `ARTIFACT`, and `CAPABILITY`. Prove no sixth tuple store or duplicate relation authority; persistence remains behind the existing write gate.
- [ ] 11.6 `ANALYSIS-DEPENDENCY-CANDIDATE-01` — convert grounded phrases (`after`, `requires`, `blocked by`, `depends on`) into revision-bound candidate task edges. Exact declared task IDs may rank as stronger evidence; text-only edges remain review proposals. Prove candidates cannot change task status, suppress retrieval, or enter graph ranking as confirmed dependencies without review.
- [ ] 11.7 `ANALYSIS-HYPERGRAPH-01` — derive revision-bound hyperedges for domain, concept, artifact, symbol, capability, requirement, and change from the admitted EvidenceCard/ontology/task facts. Emit pairwise CSR/COO algorithm projections with source revision, graph revision, ordinal-map checksum, and checksums; keep the hypergraph derived, not a second canonical datastore.
- [ ] 11.8 `HYPERRAG-INCIDENCE-OWNER-01` — identify an existing or admitted writer for packet-keyed, revision-qualified incidence before `MULTIHOP-FILL-01`. The latest owner audit reports 62,802 `atlas_hyperedges` rows sourced from taxonomy edges, with `packet_key IS NULL` and zero resolving to `atlas_packets`; these are taxonomy edges, not packet incidence. Refreshing/stamping them cannot create packet incidence. Require a current incidence cohort joined by canonical packet identity and exact source/workspace/graph revisions. Do not rewrite taxonomy rows into incidence rows.

Dependency order is a DAG, not a chain:
```
TASKCARD-PARITY-01 ─► EVIDENCE-TASK-JOIN-01 ─► 11.3 ─► CandidateFeatureMatrix
11.1 ─► MODEL-RECEIPT-READBACK-01 ─► semantic persistence eligibility
EMBED-OWNER-FREEZE-01 ─► live caller convergence
HYPERRAG-INCIDENCE-OWNER-01 ─► current packet incidence cohort ─► MULTIHOP-FILL-01 ─► graph-derived ranking
11.2 (EvidenceCard schema/owner proof) ─► 11.4 NLP ─► 11.5 ontology ─┬─► 11.7 hypergraph
                                                11.4 ─► 11.6 dependency ─┘
```
The model receipt does not block NLP extraction; NLP does not wait on semantic indexing. 11.7 needs 11.3 + 11.5 + 11.6. Semantic indexing and the 55,120-vector batch remain gated on 11.1–11.3. Graph features/ranking remain gated on reviewed dependency edges and 11.7 readback.

## Stop rules

1. Do not run `graphify:daily` solely because `codebase-graph.json` is stale.
2. Do not convert or refresh taxonomy hyperedges as if they were packet incidence.
3. Do not revive 337 / 1,742 as a TaskCard parity blocker.
4. Do not commit or rebaseline the embedding census until single-writer ownership is settled.
