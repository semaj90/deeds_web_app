# Production Hardening To-Do List (2026-11-23)

> **Baseline**: `f07c0410d08` + local V2/P0 contracts (`PFB1`, `ARPC`, `THV1`, `GLY1`, `pg18_arrow_ipc_roundtrip_v1.py`, `step1_ast_obo_nibble_rpc_v1.py`, `snapshot_lifecycle_v1.py`, `vertex-stream/+server.ts`).
> **Local Verified Gates**: 17/17 Python P0/V2/Step-1 tests passing (`1.20s`), 11/11 Vitest GPU/route specs passing, `tsc --noEmit` exit `0`.

---

## Phase 1 — Operator Startup & Containerized Datastores
- [ ] **Start Docker Desktop** and verify all datastores & sidecars:
  ```bash
  npm run services:health
  ```
- [ ] **Upgrade Qdrant `1.19.0` → `1.20`** in Docker Compose for TurboQuant quantized parity.
- [x] **Activate configured `:8095` OAK Daemon OBO Root**: Live `:8095` health reports `SOURCE_CONFIGURED`; its ontology digest matches `.okf/ontologies/atlas-domain-and-language-terms-v1.obo`, and a bounded `/ontology/oaklib/search` returned `PROPOSAL_ONLY` results. The sidecar does not need recreation for OAK. Separate issue: its loaded `miniforge_nlp_sidecar_v2.py` digest differs from the current checkout, so apply local source edits only through the operator-controlled container reload procedure. A live extraction already succeeded but reported stale `LANGEXTRACT_ORNITH` method metadata. No container was restarted in this audit.
- [ ] **Verify `:8090` Gemma 4 & `:6379` Valkey**: Confirm `GET :8090/props` serves `gemma4-legal-iq4xs-direct.gguf` and `:6379` accepts live L2 centroid readback.

---

## Phase 2 — Live PG18 ↔ Arrow IPC & Graph-to-ACE Proofs
- [ ] **Admit one verified `IMPORTS`/`CALLS` edge** at workspace revision `74ac7d8983e` into PostgreSQL and verify ACE `ContextManifest` consumption:
  ```bash
  node scripts/atlas/plan-current-source-graphify-batch-v1.mjs --admitted-snapshot --limit=1 --source-ref=scripts/atlas/train-policy-reranker.py --report=.tmp/atlas/ace-graphify-target-cohort-v1.json
  ```
- [ ] **Build a qualified live PG18 ↔ Arrow IPC Round-Trip**: Do not use the legacy `--live-pg` shortcut; it is disabled because it synthesized source revisions and a fixed score. First obtain a current authorized candidate set with matching source, workspace, representation, and producer metadata from the canonical retrieval owner; then export and rejoin under one `REPEATABLE READ READ ONLY` snapshot. The latest audit found 15 rows/vectors but 0/15 candidates qualified.
- [ ] **Verify PG18 Section 9.5 `bytea` Parity** against `PFB1` / `lsb0` golden vectors (`get_bit(mask, 0/7/8)`, `bit_count`, `sha256`, `crc32c`; ban `encode(..., 'base64')` and `::integer::bytea` big-endian casts on little-endian paths).
- [ ] **Run Daily RTX Orchestrator**:
  ```bash
  node scripts/atlas/run-daily-rtx-hypergraph-index-v1.mjs
  ```

---

## Phase 3 — Browser WebGPU / Three.js / Visualization Separation
- [ ] **Wire Vertex Stream Client**: Call `streamHypergraphVerticesToWorker()` (`sveltekit-frontend/src/lib/gpu/hypergraph-vertex-client.ts`) against `POST /api/atlas/hypergraph/vertex-stream` inside `WebGPUTopologyRenderer.svelte` or `code-intel/topology/+page.svelte`.
- [ ] **Bind `u32` `featureMasks` & `charProgress` Uniforms**: Enforce `assertPixelFilingAlignmentV1()` (256-byte `bytesPerRow`, 16-byte uniform alignment) and drive `charProgress` from live agentic repair steps.
- [ ] **Enforce Semantic vs. Visualization Separation**: Keep `PaletteThemeV1`, `SpriteInstanceV1`, `TextRunV1`, Mode-7 `[a,b,tx,c,d,ty]`, and post-process SSR strictly disposable (never canonical ontology IDs).
- [ ] **Harden WebSocket / Stream Boundaries**: Ensure all client artifact requests use server-allowlisted `artifact_id` (`resolve_artifact_id_v1`), `wss://`, CSP `connect-src`, and bounded `asyncio.Queue` + `TaskGroup` cancellation.

---

## Phase 4 — Calibration, Human Grading & Offline DSPy / RL
- [ ] **Re-qualify 455 Historical Calibration Rows**: `docs/reports/domain-calibration-gold-v2.jsonl`.
- [ ] **Complete Human Grading of 36 Ranking Groups**: `docs/reports/doc14-golden-label-review-draft-v1.json` to unmask `execution_utility`.
- [ ] **Run Offline DSPy (`MIPROv2` / `GEPA`)**: Train offline with `gepa_frozen_corpus_adapter_v1.py` (`primarySourceRef` group splits + held-out metric); keep live prompt/ontology self-rewriting disabled.
- [ ] **Verify Top-K RRF + Cursor Pagination**: PG18 HNSW + BM25 → `rrf-fusion.ts` → `topk_paginator.py` keyed by `(score, candidate_ordinal)` over `snapshot_checksum`.

---

## Phase 5 — Cross-Language P1/P2 Parity & Transport Polish
- [ ] **Install `lz4` in Python** (`C:\Python313\python.exe -m pip install lz4`) to activate `codec_id=3` (`lz4.frame`) in `duckdb_bytea_rpc_packet_v1.py`.
- [ ] **Run P1 Cross-Language Parity Fixtures**: Verify `PFB1` golden vectors (`mask_hex="2101"`, `nibble_hex="107f03"`, `rotl_w(129, 1, 8)=3`) across Python, TypeScript, C++ `simd_executors.hpp`, and PG18 `bytea`.
- [ ] **Verify GPU Fence & BVH Swap Invariants**: Confirm `GpuResourceLifecycleV1` prevents reuse/free before fence completion, `SnapshotHandleV1` keeps mmap/Arrow buffers alive until `refcount == 0`, and BVH topology changes trigger rebuild rather than refit.
- [ ] **Production Hardening Secret & Restart Gates (`CLAUDE.md`)**: Confirm `TRACE_MCP_OPERATOR_TOKEN`, fake-token refusal, `/slots` idle precheck for `:8090`, and port-scoped PID checks before any service restart.

## Resolver provenance regression found and fixed — 2026-11-23

`find_source_refs` previously treated one packet key as sufficient identity even when rows under that key disagreed on `sourceRevision`. It could also label a packet source-revision-qualified without a `workspaceRevision`. The resolver now reports explicit conflict reasons for multiple packet keys, source revisions, workspace revisions, or content checksums; a path is revision-qualified only when every matching packet row carries both source and workspace revisions. Identical repeated readbacks remain acceptable. The resolver still does not assert canonical authority or admit graph evidence.

Focused verification: `node --test scripts/mcp/atlas-tools-mcp.test.mjs` from `sveltekit-frontend` — 47/47 passed, including contradictory same-key revisions, missing workspace revision, and duplicate-identical readback cases. This is local resolver/test proof only; the live TRACE/ACE source-binding conflicts and missing revisions remain open pending fresh readback and source-index admission.

Changed files: `sveltekit-frontend/scripts/mcp/atlas-tools-mcp.mjs`, `sveltekit-frontend/scripts/mcp/atlas-tools-mcp.test.mjs`.

## Recommendation/ACE injection boundary follow-up — 2026-11-23

Two more local boundary fixes now align with the same fail-closed contract: live ranked retrieval returns `promptPacket: ""` because its cards are unadmitted; and the grounded recommendation formatter emits evidence/patch targets only when the one packet binding has both a non-empty source revision and workspace revision. It now preserves both revisions separately in the response. The MCP focused suite passes 48/48 after these changes. Live search remains diagnostic only: canonical packet readback has `workspaceRevision=0`, and the test/report source refs are absent from the source index. No task is complete from this local proof alone.

## Source-binding cohort classifier correction — 2026-11-23

The bounded read-only classifier had counted all historical workspace bindings together, overstating ambiguity. It now scopes ambiguity to rows under the requested admitted workspace revision, then verifies source revision and content digest. Five focused tests pass. Re-running the first 20 current Graphify source-plan records against the admitted workspace revision produced 19 exact row matches, 1 `WORKSPACE_IDENTITY_ONLY`, 0 ambiguous rows. The cohort remains blocked because `current-source-graphify-batch-plan-v1.json` carries workspace revision `sha256:1c7fed613ecccb4cd1bb92640e23da841354141d089f4d4749ff59b6a2c5ca78`, while the admitted frame is `sha256:c63620c45fca8a3f2b3f17a45876925b7c978d4330bff273821de0d51d29a55c`. Row matches do not override that revision mismatch or prove current local-byte reconciliation. No canonical writes or task completion were performed.

## Admitted-snapshot Graphify comparison — 2026-11-23

Ran the existing read-only Graphify batch planner against the admitted workspace snapshot for a bounded 20-source cohort. All 20 local files matched the admitted snapshot source revision, content digest, and byte length, but all 20 were absent from Graphify (`currentGraphifyExact=0`, `missingGraphifySource=20`). A targeted retrieval owner check found the opposite stale case: Graphify had one exact row for the admitted snapshot identity, but the current local file bytes differed (`localSourceBytesMismatch=1`). This confirms the missing step is a fresh operator-admitted workspace snapshot plus Graphify refresh/reconciliation; neither historical Graphify identity nor the older admitted frame can safely stand in for the current checkout. Reports: `.tmp/atlas/current-admitted-source-graphify-plan-20-20261123.json` and `.tmp/atlas/current-admitted-orchestrator-graphify-plan-20261123.json`. No writes to canonical stores occurred.

## Live candidate identity assessment — 2026-11-23

The live `buildLiveAtlasContext` card mapper now assesses canonical packet identity across packet key, source revision, workspace revision, and content checksum. Same-key rows with contradictory revisions report `IDENTITY_CONFLICT`; missing packet keys are explicit; and source/workspace revision completeness is reported independently. The new regression covers a same-key, two-source-revision response. The complete MCP test suite now passes 49/49. This remains local behavior proof: the connected MCP process has not been reloaded, and live retrieval still lacks a current admitted graph/source cohort.

## Fresh NLP, model, and agent-route check — 2026-11-23

Read-only live checks: `:8095/health` reports `status=ok`, official LangExtract 1.6.0, spaCy, Tree-sitter, ast-grep, classifier support, and OAK `SOURCE_CONFIGURED` at ontology digest `sha256:8e651ef5bd4d0f8c702a7dd751687bf912fdbe470f198ae6e41b5248517cb14c`. The live container has FastAPI 0.141.1, Pydantic 2.13.5, spaCy 3.8.16, OAKLib 0.7.4, scikit-learn 1.7.2, and joblib 1.5.2. Its host-mounted classifier is `models/domain-classifier/checkpoint.joblib` (101,160 bytes); the code and model files were not deleted. The sidecar advertises `/extract`, `/extract/documentation-facts`, `/ast/chunk`, OAK lookup/search/traverse, domain classification, and PFB1 routes. It does not have PyTorch, cuGraph, cuVS, or CuPy; RAPIDS remains an external WSL2 lane.

`GET :8090/props` reports the active `gemma4-legal-iq4xs-direct.gguf`, with `speculative.type=none`. llama.cpp documents `draft-mtp` as speculative decoding using the model's MTP heads; this is a generation-speed option, not LangExtract, retrieval, or DAG functionality. Do not enable it unless the active GGUF/server build supports those heads and a measured, operator-approved runtime change is made. LangExtract already has an explicit OpenAI-compatible provider configuration in the sidecar source and the live package import is verified; exact extraction behavior still needs a live grounded request receipt.

The agentic recommendation/repair endpoint remains incomplete. In the default runtime, a request first needs the operator-pinned workspace revision, matching admission receipt, and live readback; after that authority gate passes, it refuses with `VERIFIED_CONTEXT_PROVIDERS_NOT_CONFIGURED`. `VERIFIED_CONTEXT_PACKET_HYDRATOR_NOT_CONFIGURED` is a separate later handoff reachable only after an admitted verified-context service result. The separate current-source/Graphify audits still find no current graph snapshot and no admitted structural edge cohort. Thus live :8095 capability and helper preservation do not yet constitute an admitted DAG/RAG/ACE path. No container lifecycle action, database write, graph admission, cache write, or OpenSpec checkbox change occurred in this check.

Sources: `python/miniforge_nlp_sidecar_v2.py`, `docker/miniforge-nlp-sidecar/docker-compose.yml`, `sveltekit-frontend/src/routes/api/atlas/mastra-agent/+server.ts`, `sveltekit-frontend/src/lib/server/atlas/execution/verified-context-runtime-v1.ts`; official [LangExtract provider guidance](https://github.com/google/langextract/blob/main/skills/langextract-usage/SKILL.md) and [llama.cpp speculative decoding](https://github.com/ggml-org/llama.cpp/blob/master/docs/speculative.md).

## Verified-context provider diagnostic correction — 2026-11-23

The fail-closed runtime had described nested SearchRuntime steps as injectable providers and omitted required `VerifiedContextServicePortsV1` bindings. Its refusal receipt now lists the exact missing service ports (`authorizeWorkspaceScope`, `resolveQueryRepresentation`, `retrieveTopKInput`, `resolveFeatureSnapshot`, `tokenizer`, `promptTemplateRevision`, `instructionRevision`), the exact `SearchRuntimeTopKCallerInputV1` members (`ordinalMap`, `columnar`, `snapshot`, `sourceFetchPort`, `graphifyLifecycle`), and the distinct post-service `immutableContextPacketHydrator` gap. This changes diagnostics only: the runtime still refuses, and no production provider is fabricated. Focused Vitest passes 3/3; OpenSpec strict validation passes. The evidence confirms that no production composition for these service ports exists in the checkout; current graph/source admission remains a prerequisite to building and exercising the real composition.

## Live source reader path-boundary hardening — 2026-11-23

`LiveSourceFetchPortV1` now resolves both configured repository roots and target files to canonical filesystem paths and uses `path.relative` containment checks before reading. This closes the symlink-escape case that lexical `startsWith(root)` checks do not cover. The reader remains read-only; exact bytes still need to match the candidate's admitted source revision in `resolveTopKEvidenceV1`, and it does not establish workspace or graph authority. Focused source-fetch tests pass 6/6, and SearchRuntime top-K plus verified-context runtime tests pass 6/6.

## Verified-context application boundary review — 2026-11-23

PostgreSQL 18 remains the canonical owner for `source_ref` and evidence identity. The desktop contextual-chat assistant and Parent Atlas evidence retrieval are separate flows; assistant authentication does not itself establish Parent Atlas workspace/source authorization.

- **Authentication exists, workspace authorization is not bound:** `/api/atlas/mastra-agent` requires `locals.user` and passes the authenticated user ID to the service. `ActorWorkspaceGrantProvider` and `verifyActorWorkspaceAccessV1` exist, and a PostgreSQL `WorktreeLeaseGrantProvider` is implemented, but no production composition binds that provider to the verified-context service. The worktree lease provider scopes `ownerAgent` to `taskId`; it is not evidence that the application has a general user-to-workspace membership provider.
- **Trusted revision is a separate check:** `resolveTrustedWorkspaceAuthorityV1` requires an operator revision pin, a matching admission receipt, and live workspace readback. It supplies a trusted workspace revision; it does not authorize an actor, repository, or source reference.
- **SearchRuntime exists, the verified-context candidate producer is not wired:** `createAtlasSearchAdapter` can execute the existing SearchRuntime and produce QAS/ACE projections when callers provide revision-qualified sources. `createSearchRuntimeAceProductionSourceAdapterV1` is only an injected adapter boundary. No production caller provides `resolveCanonicalSources`, nor is there a bound `retrieveTopKInput` producer supplying a qualified ordinal map, feature snapshot/columns, source fetch port, and Graphify lifecycle to the verified-context service.
- **Current route remains intentionally fail-closed:** `hooks.server.ts` installs the default `verifiedContextRuntimeV1`, whose `execute` refuses with `VERIFIED_CONTEXT_PROVIDERS_NOT_CONFIGURED`; the route does not synthesize scope or candidate data. If an admitted service result is later produced, the route still has a separate `VERIFIED_CONTEXT_PACKET_HYDRATOR_NOT_CONFIGURED` handoff.

Review result: the source-reader path-boundary fix is verified as noted above, but it proves only safe filesystem containment plus exact-byte verification at its caller. The next implementation must bind a real, authoritative actor-to-workspace/source grant owner and a live, revision-qualified SearchRuntime candidate producer; it must then bind feature-snapshot readback and immutable packet hydration. Until those owners and current admitted source/graph evidence exist, the application must continue refusing ACE context. No user grants, database rows, graph records, cache packets, or OpenSpec task statuses were changed in this review.

### Authorization-domain cross-check

The checkout does have `getAuthorizedCase` for legal case workspaces (case owner or assigned attorney), and `workspaces.createdBy` is a separate case/workspace schema. Those owners authorize the AI/legal case-context product; they do not map an authenticated user to a Parent Atlas repository workspace revision or permitted code `source_ref` set. The PostgreSQL `WorktreeLeaseGrantProvider` authorizes an agent lease by `ownerAgent` and task ID, which also is not a general desktop-user repository grant. Desktop file access is not an application grant. No production repository-workspace membership provider was found in the reviewed callers. Do not wire either case access or task-lease access into the Parent Atlas evidence path as a substitute.

The existing `SearchRuntime` can return retrieval packets, but the verified-context production source adapter has no caller. Its required canonical-source owner must produce the request-scoped candidate/ordinal map, feature rows and snapshot, and revision-bound evidence; the generic adapter does not create those authorities from packet hits. Current-source and Graphify admission remain separate prerequisites. No implementation change to runtime behavior is justified until the repository-workspace authorization and candidate owners are supplied by their actual authority.

The identity schema also contains `atlas_graphify_scope_repository_map_v1`, which maps a Graphify membership repository scope to a canonical repository ID using an evidence reference and digest. It is repository identity/scope mapping, not an actor ACL: there are no actor/user or grant/revocation fields in this table. Do not treat it as the missing user-to-repository authorization provider.

## EmbeddingGemma 2 read-only retrieval sanity — 2026-11-23

Hardened `scripts/atlas/eval-eg2-known-item-v1.mts` to cap the query count at 1,000, execute all PostgreSQL reads in one `REPEATABLE READ READ ONLY` transaction, and allow a custom report only under `.tmp/` (preserving existing dated reports). The 10-query run over the existing 1,000-row EG2 challenger subset completed and recorded model revision `unsloth/embeddinggemma-2-GGUF:embeddinggemma-2-Q8_0.gguf@sha256:6f1bd4ac6c5df7444f9cca7ca36cafe6cfa34cd6f49fefb1e0b4be8143aed8bc`. Self-retrieval recall was EG2 30/50/70% at @1/@5/@10 versus canonical EmbeddingGemma 50/50/80%. This run's receipt is `.tmp/review/eg2-known-item-eval-v1.json`; the pre-existing dated report was left unchanged.

This evaluator uses source lines as known-item queries and is explicitly `SELF_RETRIEVAL_SANITY_NOT_RELEVANCE`; it does not measure reviewed Recall@K, MRR, NDCG, latency percentiles, Qdrant, or Turbo8. It therefore does not justify an EG2 cutover, Qdrant consolidation, or quantization change. PostgreSQL `semantic_768` remains canonical and unchanged.

Proof state for this phase: **CREATED** the separate EG2 lane and evaluator; **WIRED** the live `embeddinggemma2:q8_0` query embedding to the PostgreSQL challenger table/HNSW path; **PROVEN** a 10-query known-item smoke plus 3/3 focused challenger-contract tests; **DONE** is not established because reviewed relevance labels, current source-lineage qualification for the full cohort, latency/quality comparison, and a Qdrant EG2/Turbo8 shadow parity run are still missing. The existing Qdrant Turbo benchmark's collection lifecycle was not run because it mutates Qdrant; no store or canonical vector was changed.

### Current admission refresh and report isolation — 2026-11-23

Added `--output=<repo-relative-path>` to the current workspace-frame and structural-edge audits. Both reject paths outside the checkout; a `../outside-report.json` probe was refused by each with `REPORT_PATH_OUTSIDE_REPOSITORY`. This run wrote only `.tmp/review/current-workspace-frame-admission-v1.json` and `.tmp/review/current-structural-edge-contract-v1.json`, preserving the modified default reports. `git diff --check` passed for both script edits.

Fresh workspace-frame result: admitted revision `sha256:c63620c45fca8a3f2b3f17a45876925b7c978d4330bff273821de0d51d29a55c`; 52 cohort rows, 0 current-workspace matches, 52 mismatches; the underlying cohort lineage receipt is dated 2026-10-23 and does not match the admitted revision. Status is `EXECUTION_AUTHORITY_UNAVAILABLE`, next gate `CURRENT_SOURCE_AUTHORITY_RECONCILIATION_REQUIRED`, `promotionEligible=false`, and no writes were performed. The structural-edge audit reports `CONTRACT_INCOMPLETE`, 0 nodes, 0 edges, and `graphRevision=null`. This confirms the application wiring cannot be end-to-end proven against a current admitted graph cohort yet.

## Backup/legacy inventory safety correction — 2026-11-23

The earlier `docs/reports/backup-superseded-inventory-v1.json` labels 39 files `SAFE_ARCHIVE_CANDIDATE` based on a limited filename-stem search. That evidence is insufficient for archival and the label must not be acted on. The revised inventory script now searches tracked text in one pass, records candidate hashes and sizes, and uses only `TEXT_REFERENCES_FOUND_RETAIN_PENDING_REVIEW`, `NO_TRACKED_TEXT_REFERENCE_FOUND_REVIEW_REQUIRED`, or an explicit missing/search-failed review status. It never reports an item as safe to archive or delete.

The run wrote only `.tmp/review/backup-superseded-inventory-v2.json`: 46 candidates audited; 45 had tracked-text references; one (`python/tests/test_batch_staleness_superseded_check_v1.py`) had no tracked-text reference; all 46 remain unresolved review items. This is still not a dependency proof: imports through aliases, dynamic loading, Docker mounts, model registries, generated manifests, OpenSpec evidence, external callers, and rollback dependencies require separate checks. No source, model, index, or service data was archived or deleted.

Follow-up on the sole no-filename-reference item found that it is a `test_*.py` test module and imports `atlas_graph_runtime.batch_staleness_superseded_check_v1`; the production helper is present and used by that test. Therefore the empty filename-stem result is a limitation of the heuristic, not a retirement signal. Keep both files pending any future separately reviewed retirement case.

## Documentation retrieval version-filter wiring — 2026-11-23

The older `docs/reports/sessions/MASTER-FEATURE-TODO-2026-05-20.md` is a dated execution snapshot, despite its opening description calling it the active canonical checklist. Preserve its historical checkboxes and claims; use the current OpenSpec ledger and `docs/operator/atlas-production-roadmap.md` for present work. The latter explicitly supersedes the older Phase 3–9 ordering and keeps PostgreSQL canonical, with Qdrant/Neo4j/Valkey in projection, traversal, and cache roles.

Implemented a code-only DOC retrieval improvement in `python/atlas_okf_docs_pipeline.py`: Qdrant payload indexes now include `provider`, `product`, `product_version`, and `architecture`; versioned `DocCoordinateV1` values are projected to those top-level payload keys; the existing Qdrant query builder applies exact product/version/architecture filters to both prefetch and final rescore; and the smoke-query API/CLI can carry those filters. The new `--query-only --smoke-query ...` path embeds one bounded query and contacts Qdrant read-only without crawling, creating indexes, or upserting points, even when the manifest has no recrawl delta. A version or architecture filter without a product is rejected. The Qdrant collection was not changed, the query-only path was not run, no test suite was run, and no OpenSpec task was marked complete. The implementation is therefore **CREATED**, not yet **PROVEN** or **DONE**; focused tests and a read-only query against a disposable or explicitly authorized collection remain necessary before any live projection claim.

## PostgreSQL semantic_768 cohort revision audit — 2026-11-23

Corrected the semantic cohort qualifier so it recognizes a PostgreSQL `embedding_version` that already contains the full `semantic_768:<model>:<revision>` identity instead of prepending the model twice. Added a regression test asserting that this model-revision comparison succeeds while absent `encoder_id` still fails producer qualification. `node --test scripts/atlas/lib/semantic-768-cohort-qualification-v1.test.mjs` passed 7/7; scoped `git diff --check` passed.

Fresh `node scripts/atlas/audit-lineage-semantic-768-cohort-v1.mjs` remained `SEMANTIC_768_COHORT_BLOCKED`: 15/15 exact chunk rows, chunk source hashes, vectors, and packet source lineage matched; 15 vector digests were computed from PostgreSQL float32 bytes; 0/15 candidates matched a current workspace source binding; producer metadata, source/workspace revisions, and row representation revisions were absent/mismatched; 0/15 qualified. In the receipt, all three sampled `expectedModelRevision` values exactly matched `observedModelRevision`, confirming the comparator correction reached live readback. The remaining failure is canonical row/binding provenance, not model-prefix comparison or an `embedding_digest` database column. The database transaction was read-only; no index, vector, graph, cache, service, or task state was changed. DOC-14/15 and the 41 remaining OpenSpec tasks stay open.

## Domain-classifier live inference check — 2026-11-23 (superseded by 2026-11-24 follow-up)

A one-item synthetic POST to live `:8095/classify` with `runModelChallenger=true` returned `trainedClassifier.status=UNAVAILABLE` and `backend=unavailable`, with warning `failed to compute cluster features (embedding service unreachable or empty text)`. The response explicitly said `canonicalAuthority=false`, `promotionAuthorized=false`, and `writesPerformed=false`. Since this failure occurs before NB/LR prediction, it is not evidence of a bad classifier score or a reviewed label. `:8095/health` reports `classification_helper=true`, `torch=false`; read-only `GET /api/tags` from both Windows and the sidecar confirmed that Ollama is reachable and has `embeddinggemma:latest` (digest `82f094e4c0e19bc4208c692996d4f1ecf14e82a8dee579ee1d2ca1175260058e`). The mounted sklearn/joblib checkpoint has a consumer in `_classify_domain_pass`; this path is not PyTorch.

The historical consumer posted to Ollama's legacy `/api/embeddings` endpoint. The current checkout routes through `OllamaEmbedAdapterV1` to `/api/embed` using the explicit `legacy-embeddinggemma-768` profile so the checkpoint's dimension/prefix recipe is named. No PyTorch classifier training, model/index writes, service lifecycle operation, canonical data write, or label write occurred in that check.

## Domain-classifier live route follow-up — 2026-11-24

The serving process reports module hashes matching the mounted checkout (`miniforge_nlp_sidecar_v2.py`: `sha256:86456802af82c71442bd303f886a92988d8f2a317e1a29cf905878dbc69b07e6`; `miniforge_nlp_sidecar.py`: `sha256:c2404c34e9334646e69c1707dd4ed7e1a2d2d66955cc1c5fbe8684c801423a53`). A valid live POST to `:8095/classify` with `runModelChallenger=true` returned `SHADOW_ONLY`, backend `sklearn-lr`, checkpoint revision `domain-classifier-nblr-v1-1788454983`, `canonicalAuthority=false`, `promotionAuthorized=false`, and `writesPerformed=false`. NB and LR both predicted `ui` for synthetic auth/database code; LR probability was `0.5485384886535657`. A fresh `docker exec` process calling `miniforge_nlp_sidecar.classify()` returned the same feature values and prediction. An adversarial request omitting required `sourceRef` returned HTTP 422. This supersedes the prior live `UNAVAILABLE` result and proves current HTTP execution for this one synthetic request only. It does not establish classifier quality or authorization for routing. `joblib` still emits `InconsistentVersionWarning` because the checkpoint was saved under scikit-learn 1.7.0 and is loaded under 1.7.2; retain shadow-only status pending artifact/runtime reconciliation and held-out, source-grouped evaluation. No Docker lifecycle operation, datastore write, model update, or label write occurred.

The valid probe ran through `C:\Python313\python.exe` against `http://127.0.0.1:8095/classify` with a synthetic source reference and `sourceRevision=probe-rev-1`; the missing-`sourceRef` probe returned `422` / `Field required`. Exact request/response outputs are available in this conversation's tool record. No local classifier tests were run in this follow-up.
