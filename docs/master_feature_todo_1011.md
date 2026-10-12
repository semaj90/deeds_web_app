# Master feature to-do — 2026-10-11

> **Status: pipeline NOT finished.** The pieces below work and pass their tests. The pipeline is not complete: the corpus, glossary, and `.okf` schema are not fully indexed, so every retrieval and routing claim here is partial. Nothing in this file says the pipeline is production-ready.

## Pipeline completeness

| Area | Works (tested) | Not complete |
|---|---|---|
| Corpus | Packet and feature counts exist (`atlas_packets`: 61,718 rows) | Not fully indexed. Coverage is unknown until a current census is run. |
| Glossary and OKF tooling corpus | Tooling corpus review: 57 pages reviewed, 717 chunks, artifact readback passes (reported 2026-10-11) | Development publication of 79 pages is not admitted. Four manifest URLs differ from acquired URLs. The reported URL and lineage check is 53/57 exact, with 57/57 manifest-request lineage. |
| `.okf` schema | Schema exists at `docs/.okf/schema.yaml` as a code-intelligence convention | It defines no error-fix record, and its index is not complete. It is not the oracle for repair records. |
| Routing (Viterbi) | Decoder: 12/12 tests. Token-routing pipeline: 7/7 tests, including seeded variance. | Emissions still come from a fixture dictionary. No accuracy claim. |
| Telemetry | Per-tool loader: 5/5 tests, read-only on live data | Not state-conditioned; 27 of 136 rows completed |
| Operator token gate | Gate 10/10, CLI 6/6 | Not wired; no token issued |
| Repair contract | Invariants 7/7; KernelDag chain 5 pass, 2 `todo` | The approval link from an accepted DAG to a repair is not built |
| Recommendation L7 | Extracted and tested 9/9 | Step 2 (approval record) not built |

## Test log (2026-10-11, run for this file)

| Suite | Result |
|---|---|
| Vitest: `src/lib/server/router`, `src/lib/server/mcp`, governed-repair invariants | 9 files, 56 tests passing |
| Node: `kernel-dag-to-repair-chain-v1.test.mjs`, `recommendation-l7-decision-v1.test.mjs` | 16 tests: 14 passing, 0 failing, 2 `todo` (the approval link, which is not built) |

These results show the pieces work in isolation. They do not show the full pipeline works end to end.

**TL;DR.** Several lanes now have real evidence, and most open work is blocked on a decision or a missing runtime, not on code. Built and tested: the Viterbi kernel (offline), the per-tool telemetry loader, the operator-token gate and CLI, the L7 decision extraction, the chain test, and the error-fixing contract checks. Not built or not run: live graph admission, the RL environment, the phase 23 edge model, Kafka, and a PyTorch top-k/k-means path. Nothing below authorises writes, reindexing, or promotion.

Status vocabulary follows `CLAUDE.md`: `CREATED`, `WIRED`, `DRY_RUN_PROVEN`, `APPLY_PROVEN`, `NOT_PROVEN`, plus `BLOCKED` and `DECISION_NEEDED`.

## 1. Phases 17–22 and 23

| Phase | Status | Evidence / source | Next step |
|---|---|---|---|
| 11 | PARTIAL | `docs/parent-atlas-workstation-todo.md`, 2026-09-05 | Re-check against current cohort |
| 12 | BLOCKED_IDENTITY_AUTHORITY | same | Identity authority decision |
| 13 | PARTIAL | same | — |
| 14 | IMPLEMENTED_BOUNDED | same | Bounded only |
| 15 | BLOCKED_CURRENT_COHORT | same | Current source cohort |
| 16 | BLOCKED_CURRENT_GRAPH_BINDING | same; 16-H "CLOSED" in open-lanes file | Later label governs |
| 17 | DOWNSTREAM_OF_SEMANTIC_ADMISSION | 17–21 audit, 67% PARTIAL, 2026-09-09 | Semantic admission first |
| 18 | PARTIAL XGBoost surface | same | `FeatureRowV1`, temporal labels, held-out eval |
| 19 | 443 rows, no status | same | Assign a status |
| 20 | NOT_TRACKED | two openspec mentions only | **DECISION_NEEDED:** define phase 20 |
| 21 | Covered by 17–21 audit | same | — |
| 22 | NOT_TRACKED | none | **DECISION_NEEDED:** define phase 22 |
| 23 | CREATED, edge lane, **model missing** | `sveltekit-frontend/scripts/phase23-edge-status.mjs` reports `MODEL_MISSING: static/models/gemma4-e2b/model.litertlm`; `static/models/gemma4-e2b/` does not exist | Obtain and verify the artifact; see §2 |

Authoritative board `docs/reports/parent-atlas-workstation-openspec-workboard-v2.json` is dated 2026-09-25 and blocked by `WORKSPACE_REVISION_SOURCE_MISMATCH`. Regenerate it before quoting counts.

## 2. Phase 23 sub-lanes (asked for explicitly)

| Lane | Status | Evidence | Missing |
|---|---|---|---|
| Edge model eval (Gemma 4 E2B, LiteRT-LM) | MODEL_MISSING | status script; crosswalk doc (planning only, 2026-10-08) | Verified `.litertlm` artifact with checksum, licence, upstream revision. Do not claim browser model tested. |
| Eval gym | CREATED | `src/lib/ai/edge/phase23-eval-gym.ts` and spec | Run against a real artifact; fixtures are not proof |
| Artifact integrity and cache identity | CREATED | `phase23-artifact-integrity.ts`, `phase23-cache-identity.ts` and specs | Exercise on a real artifact |
| Agent repair (edge) | CREATED | `phase23-agent-repair.ts` | Not exercised |
| REAP / quantization | EXPERIMENTAL | `docs/experiments/phase23-reap-cerebras-quantization.md` | Tensor counts must be read from the GGUF, not the doc |
| Tensor map audit | CREATED | `scripts/experiments/phase23_tensor_map_audit.py` | Run against a real GGUF |
| **PyTorch** | Partial | ROUTE-04/05 open in prefill-routing `tasks.md` | MLP on non-toy revision-qualified data |
| **RL gym (routing environment)** | NOT_PROVEN, no environment | `phase23-eval-gym` is an eval harness, not an RL environment; `gymnasium` not installed | Define the environment and reward first. Install only after a capability gap is proven. |
| **Unsupervised learning** | Partial | k-means runs through cuVS under WSL; SOM and autoencoder scripts exist | PyTorch top-k/k-means path is stuck; see §4 |
| **Kafka** | PROPOSAL_ONLY | `openspec/changes/parent-atlas-kafka-projection-initiative/proposal.md` (`PA-KAFKA-001`) | Event schema and outbox contract. Not a prerequisite for anything in this file. |
| **Tensor analysis** | Partial | tensor-residency change; phase 23 tensor map audit | Evidence against a real artifact |

## 2b. Phase 24 (Ornith + REAP + IS quant + Titans)

| Item | Status | Evidence | Gap |
|---|---|---|---|
| Ornith runtime (synthesis, `:8090`) | CREATED: weights and vision projector on disk | `models/ornith-1_5-9b-ad-q5_k-q4_k/`, `models/mmproj-Ornith-1.5-9B-BF16.gguf`; `CLAUDE.md` runtime status | Verify the served model live before any claim |
| REAP (expert pruning / quantization) | EXPERIMENTAL | `docs/experiments/phase23-reap-cerebras-quantization.md` (filed under phase 23); `docs/reports/parent-atlas-gemma4-kernels-litert-reap-memory-eval-20261009.md` | Tensor counts must be read from the GGUF; no REAP run is recorded |
| IS quant (importance-sampling quantization) | NOT_FOUND | No file, task, or doc matches `isquant` or importance-sampling quantization | **DECISION_NEEDED:** define the method before scoping it |
| Titans 2.0 (memory) | RESEARCH_ONLY | `NEURAL_MEMORY_LAB_V1` (small PyTorch Titans/HOPE sidecar); `KV-RESIDENCY-01`; "Titans blocks inside Ornith = research only" | Build the sidecar lab first; no Ornith integration |
| Phase 24 DPO | EVAL_ONLY | `openspec/changes/parent-atlas-tensor-residency-integration/tasks.md` lines 898 and 953 | No training run recorded |

Phase 24 has no directory or status script. Its definition is only partly written, so treat this table as a starting list, not a tracked phase.

Gemma 4 on the client is LiteRT (phase 23 edge lane), not Ornith. Ornith is the server synthesis model. Keep the two lanes separate in every claim.

## 2c. GPU graph lane (from the 2026-10-11 discussion)

| Step | Status | Gate |
|---|---|---|
| CSR representation of the admitted graph | NOT_STARTED | Blocked: `graphify_edges` has zero admitted rows |
| CPU oracle (NetworkX custom PageRank) on a frozen snapshot | BLOCKED | Same as above |
| PyTorch sparse power iteration matched to the oracle | NOT_STARTED | After the CSR step and oracle parity |
| SIMT kernel | NOT_STARTED | After PyTorch parity (ladder: no level skipped) |
| cuTile kernel | NOT_STARTED | Last. Linked lists on GPU are rejected: pointer chasing is a poor fit. |

## 2d. Encoding, labels, and icon lane (review note, 2026-10-11)

Rules (binding for this lane):

- Exact original UTF-8 bytes are the only input to source-byte digests, spans, and source admission.
- Normalized text (NFC or NFD) is for matching, classification, or display only. Any persisted normalized text must record its normalization form and producer revision.
- Pixels, hexadecimal, and bitplanes are encodings, not legal meaning. A classifier's output is derived evidence, never authority.
- Icon ID is the stable semantic reference. Texture coordinates, palette, and GPU storage may change independently.

| Component | Priority | Found by name | Status |
|---|---|---|---|
| SymbolDatasetV1 | P0 | No | NOT_FOUND by name; check existing dataset owners first |
| SymbolLabelTaxonomyV1 | P0 | No | NOT_FOUND by name |
| EncodingRegistryV1 | P0 | No | NOT_FOUND by name. Normalization form is not recorded in code under that name. |
| DatasetSplitManifestV1 | P0 | No | NOT_FOUND by name |
| LicenseManifestV1 | P0 | No | NOT_FOUND by name |
| FastAPI classifier sidecar | P1 | Sidecars exist (`:8095` NLP, `:8097` embedding) | Audit before adding a fourth |
| PyTorch baseline classifier | P1 | No | Train on frozen features before QLoRA |
| Glyph raster and atlas compiler | P1 | No | NOT_FOUND by name |
| MCP classification adapter | P1 | No | NOT_FOUND by name |
| Offline evaluation harness | P1 | Partial (eval gyms, classifier eval scripts) | Audit first |
| QLoRA experiment | P2 | No | Blocked on the classifier baseline |
| Procedural icon generator | P2 | No | Human-approved canonical icons only |
| GPU/WebGPU texture cache | P2 | No | After the atlas compiler |

### Owner audit (2026-10-11, read-only)

| P0 item | Existing owner found | What it covers | Gap |
|---|---|---|---|
| SymbolDatasetV1 | `sveltekit-frontend/src/lib/server/atlas/classification/query-router-dataset-v2.ts` | Query-level rows with `datasetRevision`, `tensorRevision`, `labelRevision` | Query rows, not source symbols. No symbol-level provenance. |
| SymbolLabelTaxonomyV1 | Two owners, **disagreeing**: `atlas/domain-taxonomy.ts` (`CANONICAL_DOMAINS`: auth, ui, retrieval, network, database, cache, agent, graph, ml) and the `domainLabel` enum in `query-router-dataset-v2.ts` (code, database, retrieval, graph, api, security, documentation, workflow, testing, unknown) | Two domain label sets | **Duplicate label owner.** Reconcile before adding a third. Neither has a stable class-ID registry or negative examples. |
| DatasetSplitManifestV1 | Same query-router file: deterministic 80/10/10 split from `sha256(queryId)` | Query-level split | Split is keyed by query ID, so same-source and near-duplicate leakage is not prevented |
| EncodingRegistryV1 | None | — | Normalization form is not recorded in code |
| LicenseManifestV1 | None for our data, models, or icons | Third-party vendored licences only (`claude-mem`, `llama-cpp-turboquant-gemma4`, `.python311`) | Needs a manifest for our own assets |

Other dataset scripts (`export-classifier-dataset.mjs`, `neural-routing/dataset-export.ts`, `build-human-agent-feedback-dataset-v1.mjs`) have no split or leakage handling.

Priority from this audit: reconcile the two label taxonomies first. Splitting by source rather than query ID comes next. The encoding registry and licence manifest are new work.

Not yet answered from the review's question list: which ACE packets combine, whether mmap synthesis tiles exist, and the cuTile, LOD, texture-swap, trilinear, and quaternion paths. Each needs an owner audit before a claim.

## 2e. Repair pipeline and stale-chunk review (mid-turn review, 2026-10-11)

Source: an external review pasted into this session. Figures below are as reported by the review and are **not verified here**. Verify each against the live receipts before relying on it.

Core finding: two chunk bodies match an older Git revision, but live lineage marks them as current. File-level digest identity does not prove chunk identity. The chunk lineage join is inconsistent, and the writer responsible is not identified.

Rules:

- Do not rebuild the index.
- Do not let an agent edit files from stale chunks.
- Historical chunks are labelled historical, never silently rewritten.
- Dense search keeps its current behaviour until a shadow comparison proves otherwise.

| Gate | Priority | Required proof | Status |
|---|---|---|---|
| HISTORICAL CHUNK 01 | P0 | Read-only receipt: current and historical Git revisions, SHA-256 of each chunk body, declared digest scope, mismatches, affected symbols and ordinals | PARTIAL. Containment receipt written (`scripts/atlas/historical-chunk-receipt-v1.mjs`, `.tmp/atlas/historical-chunk-receipt-v1.json`): of 2,000 stored chunks, 1,682 appear in their current line window, 317 do not, 1 source is missing. Containment is not revision attribution. Git-history attribution for the 317 is NOT_STARTED. A first version used line equality and was wrong: chunks start mid-line. |
| DIGEST SCOPE 01 | P0 | Hash algorithm, source-byte scope and normalization declared per chunk digest | NOT_STARTED |
| SOURCE JOIN 01 | P0 | Current source symbol version, span and ordinal map verified against bytes | NOT_STARTED |
| DAG AST LIVE 01 | P0 | One real diagnostic request: AST observation, source bytes, symbol version, candidate ordinal and patch target all tied to one revision | NOT_STARTED. Reuse existing AST and SearchRuntime owners. |
| SYMBOL TOC LIVE 01 | P0 | Production symbol-to-ordinal join with zero ambiguous admitted spans | NOT_STARTED |
| BATCH IMPACT 01 | P1 | Incremental impact analysis per file, revision-qualified | NOT_STARTED. Extend the existing digest-bridge owner. |
| RANK SUPERSEDED 01 | P1 | Revision-filtered ranking; one RRF vote per logical lane; historical candidates excluded from current repair | NOT_STARTED |
| PATCH PROPOSAL 01 | P1 | Proposal with preimage hash, exact span or AST match, `mutationAllowed:false` | NOT_STARTED |
| PATCH VALIDATE 01 | P1 | Scratch-worktree application, focused tests, rollback | NOT_STARTED |
| PREFILL CACHE 01 | P2 | Measured tokenizer counts and prefill latency. A shorter summary does not prove KV reuse. | NOT_STARTED |

Standing rules from the review:

- A ranking score must never bypass a failed source-revision or span check.
- A detected file extension does not authorise AST rewriting. Language status is separate: DETECTED, PARSED, EXTRACTED, SYMBOL_JOINED, REWRITE_CAPABLE, VALIDATED.
- Packet hash, chunk hash, source file hash, and authority receipt are distinct and must not be treated as interchangeable.
- Token IDs come from the model tokenizer, never from symbol hashes or candidate ordinals.

Test status: `label-taxonomy-reconciliation.spec.ts` passes 8 tests and has 3 `todo` items. The 3 todos are the reconciliation and source-level split tests.

## 2f. Neo4j, HyperGraphRAG, NetworkX, RTX alignment check (2026-10-11, read-only)

| Item | Finding | Status |
|---|---|---|
| Neo4j service | Container `legal-ai-neo4j` healthy. Authenticates with the `NEO4J_PASSWORD` in `.env` (exit 0). The earlier auth failure was my probe, which ran without that variable set. | WORKING |
| Neo4j content | Topology is populated: `AtlasContextNode` 165,190; `SourceRef` 125,625; `CodebaseFile` 69,009; `Packet` 59,692; `TreeNode` 58,365; `ParentAtlasFeature` 39,485; `Function` 27,763; `Concept` 19,698; `Feature` 13,290; `Community` 2,512; `Tool` 801 | Populated topology mirror |
| HyperGraph in Neo4j | **0 hyper-labelled nodes.** The session hyperedge store (`server/features/ai/ai/hypergraph-store.ts`) writes hyperedge nodes, but none exist, so that path is unused or was never run | NOT_EVIDENCED |
| HyperGraphRAG retrieval | `server/atlas/retrieval/hypergraph-retrieval-v1.ts` is a Zod contract. It doesn't call Neo4j. | CONTRACT_ONLY |
| NetworkX (OpenSpec) | 33 task files mention NetworkX: 50 open lines, 39 closed. Fixture-level CPU parity exists; live parity needs an admitted graph snapshot (zero admitted `graphify_edges`). | PARTIAL, fixture-only |
| RTX | GeForce RTX 3060 Ti, 8192 MiB, driver 580.88. 38 open RTX/TensorRT task lines. CUDA 13.0 with LibTorch cu130 is the proven path; TensorRT-RTX is not proven. | HARDWARE_PRESENT; integration open |

Readiness: Neo4j and the RTX card are available. Neither HyperGraph retrieval nor a live NetworkX-to-GPU path is proven, so no integration is ready for claims.

## 3. Routing, token, and approval chain

| Item | Status | Next step |
|---|---|---|
| Viterbi decoder (`viterbi-decoder-v1.ts`) | CREATED, 12/12 tests, no caller | Stays unwired until the 160-trace checkpoint |
| Telemetry loader (per tool) | WIRED to real data, 5/5 tests | Not state-conditioned; `trace_id` null on all live rows |
| Completed outcomes | 27 of 136 rows | 109 pending rows are historical (pre-August); do not weight them |
| Token register | Documented, 11 kinds | TOK-ROUTE-01: decide the token kind that drives emissions. Recommended: keyword token. |
| TOK-ROUTE-02/03 | Interim variance test, 7/7 | Real emissions after TOK-ROUTE-01 |
| Operator token gate | CREATED, 10/10 tests, not wired | **DECISION_NEEDED:** approve wiring `requireToken` to the gate |
| Operator token CLI | CREATED, 6/6 tests | Operator issues the first token out of band |
| Ops gate probe | FINDING: any non-empty token passes today | Wire the gate or disable write tools for models |
| L7 decision | Extracted, 9/9 tests | Step 2: route `ask_permission` to an approval record |
| **Step 2 approval owner** | DECISION_NEEDED | Choose `workflow_approvals` (recommended) or a file-based proposal |
| KernelDag chain | 5 pass, 2 `todo` | Approval link: an accepted DAG cannot reach a repair without a matching approval |
| Autoresearch fabric | Schemas only (`ExperimentHypothesisV1`, `HardwareProfileV1`); gates 03–18 proposal-only | Not a KernelDag loop; not wired |

## 4. Search, index, and consistency

| Item | Status | Next step |
|---|---|---|
| Worktree and Git state | Dirty: 118 tracked, 140 untracked (2026-10-11) | Use `git worktree add` for experiments |
| PostgreSQL 18.4 | `io_method=worker`, `effective_io_concurrency=16`, `work_mem=4MB` | Read-only planner check on real retrieval queries |
| Index census | `atlas_packets` 92 indexes (964 MB), all valid; 13 duplicate column groups | Review for removal. **DECISION_NEEDED** (archive, do not delete) |
| REINDEX / dense rebuild / full reindex | **Not authorised** | Only after a change-impact plan and shadow comparison |
| Change-impact contract (`CodebaseChangeImpactV1`) | Proposed | Extend the existing digest-bridge owner; do not create a new producer |
| Search shadow comparison | Not started | Freeze the query set; compare identity, recall, MRR, latency |
| Qdrant warning in search runtime | Diagnostic only | Must not authorise promotion from an unverified lane |

## 5. Infrastructure and runtime

| Item | Status | Next step |
|---|---|---|
| TRACE MCP `:8788` | Up: 188 tools; one read-only call verified | Log live receipts as they happen |
| Atlas DAG graph projection | UNRESOLVED | Restore the projection before graph claims |
| Disk on C: | ~12 GB free after scratch cleanup | Docker prune (~13.5 GB build cache, ~21.7 GB unused images), cache clean, VHDX compaction. **Needs approval.** Do not prune volumes. |
| TOC check drift | `--check` fails on concurrent input changes | DOC-GOV-TOC-CHECK-01 (see document-governance `tasks.md`) |
| Phase 23 edge model | Missing | Obtain and verify the artifact before any run |

## 6. Decisions needed (in priority order)

1. Approve wiring `requireToken` to the operator-token gate, or disable write tools for models until it is wired.
2. Choose the step 2 approval owner: `workflow_approvals` or a file proposal.
3. Choose the token kind that drives router emissions (TOK-ROUTE-01).
4. Define phases 20 and 22, and assign statuses to phase 19's 443 rows.
5. Approve Docker prune and cache clean for disk recovery.
6. Approve workspace-revision v2 design (skipped-source, extension-set, excluded-prefix digests). v1 stays unchanged.
7. Decide whether to run the planner check next (read-only).

## 7. Not authorised by this document

No REINDEX, index drop, Docker volume prune, token issuance, approval write, model download, promotion, or live tool write. Each needs an explicit decision above.
