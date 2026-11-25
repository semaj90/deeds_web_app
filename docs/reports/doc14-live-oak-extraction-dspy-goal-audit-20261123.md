# DOC-14 live OAK, extraction, and DSPy goal audit — 2026-11-23

## Scope

Live, read-only checks of the existing :8095 NLP sidecar and :8090 model, plus focused local tests and corpus review. No PostgreSQL, Graphify, Qdrant, Valkey, or ACE writes; no training or promotion; no OpenSpec task checkboxes changed.

## Verified live results

- `GET :8095/health`: status `ok`; OAK source `SOURCE_CONFIGURED`, ontology revision `sha256:8e651ef5bd4d0f8c702a7dd751687bf912fdbe470f198ae6e41b5248517cb14c`; running sidecar module hash matches current `miniforge_nlp_sidecar_v2.py`. The health response still labels its default model `ornith-1.5-9b`, so the container has not loaded the current Compose model setting.
- Bounded `POST /ontology/oaklib/search` returned CUDA C++ as `ATLASLANG:cuda_cpp`, proposal-only. Bounded `POST /ontology/oaklib/candidates` returned the existing local `ATLASLANG:cuda_cpp compiles_to ATLASISA:ptx` relation as `PROPOSED`, bound to the pinned OBO and producer hashes. This is ontology lookup evidence, not a canonical Parent Atlas edge.
- A fresh BeautifulSoup capture of NVIDIA’s CUDA platform page had normalized revision `sha256:494ef3b6ef26440375c9861ce7b02c363d9c01856630d8a009490c7a3cceca35` and 12,893 UTF-8 bytes. LangExtract 1.6.0 ran through :8095 against the explicit live model ID `gemma4-legal-iq4xs-direct.gguf`; it emitted six facts, each with exact byte/text alignment. It did not emit the CUDA C++ → PTX relation. No canonical authority or writes were claimed.
- `scripts/atlas/prove-doc14-lm15-live-v1.py` passed against the real :8090 model: DSPy 3.5.0, `engine=lm15`, LiteLLM unused; JSON and JSON Schema capability checks passed. This is a transport/structured-Predict probe with no ACE context and no citation verification.
- The live Atlas context tool returned five search cards, but `proofUsable=false`, admission `UNADMITTED_RETRIEVAL_CANDIDATES`, and revision status `MISSING_SOURCE_REVISION`. Those cards are not eligible for synthesis.
- A fresh PostgreSQL 18 read-only query now finds one canonical NVIDIA page and 12 chunks. The page `content_hash` exactly matches the fresh 12,893-byte normalized capture; the target sentence occurs in canonical chunk `doc:nvidia-cuda-guide:494ef3b6af26403:8` at page bytes `[9290,9358)` and chunk-relative bytes `[1332,1400)`. The complete stored chunk matches the current normalized page slice and its `chunk_checksum` matches the chunk bytes. The canonical page `evidence_revision` (`sha256:5717bf7d...`) and chunk `evidence_revision` (`sha256:2138948c...`) are separate from the normalized content hash (`sha256:494ef3b6...`) carried by the original review packet. Preserve this distinction and bind the prior approval through exact content hash and span equality; do not overwrite the review receipt or silently substitute revisions.
- Added `build-doc14-canonical-source-binding-v1.py` and `doc14_canonical_source_binding_v1.py` to produce that read-only crosswalk. It validates proposal-file checksum against the review receipt, raw and normalized capture digests, page/chunk revisions, exact stored chunk bytes/checksum, reviewed IDs, and page/chunk-relative UTF-8 spans. The resulting `CANONICAL_SOURCE_BINDING_VERIFIED` receipt explicitly keeps admission authorization false and canonical authority false.
- PostgreSQL graph readback remains empty for `atlas_ontology_linked_tuples` and `atlas_ontology_relations`; `atlas_graph_snapshots_v2` has two rows, both `SUPERSEDED`, with no `graph_revision`. The live Graphify context search also remains unadmitted/revision-incomplete. Source publication is now proven; relation admission and graph-to-ACE remain open.
- Fresh continuation recheck: `node scripts/atlas/audit-current-structural-edge-contract-v1.mjs` returns `CONTRACT_INCOMPLETE`, `nodeCount=0`, `edgeCount=0`, and `graphRevision=null`. The live `build_agentic_rag_context` request returned seven code-index cards, but the packet remains `proofUsable=false`, `admissionStatus=UNADMITTED_RETRIEVAL_CANDIDATES`, `revisionStatus=MISSING_SOURCE_REVISION`, with `NON_CANONICAL`, `NO_CANONICAL_PACKET`, and unbound-card warnings. Do not use this response as DSPy context.
- Fresh Graphify lifecycle owner audit: `OWNER_ROLES_IDENTIFIED` and `RECEIPTS_CONSISTENT`, but `eligibleForFreshRun=false`; 19 stale runs, 0 running, 0 current. Blockers are `CURRENT_RUN_NOT_ESTABLISHED` and `REPOSITORY_REVISION_NOT_CURRENT`. This is a read-only audit; do not invoke the lifecycle opener until currentness is established and the bounded write scope is authorized.
- Fresh owner-resolution plan found one completed Graphify execution candidate (`01a1763a-4355-71d7-9b81-2c7a1814a41f`) with a recorded workspace revision, but `safeToApply=false` and no preferred execution is selected. The current 128-source batch plan is `CURRENT_GRAPHIFY_BATCH_PLAN_BLOCKED_REVIEW`: 0 exact matches, 110 revision/content mismatches, 17 ambiguous matches, 1 missing source, and 9 local-byte mismatches; `sourceBytesRevalidated=false`. The next work is resolving the source/workspace revision mismatch and reviewing those candidate bindings, not opening a fresh lifecycle run.
- Goal-resumption verification (2026-11-23): reran the structural-edge, lifecycle-owner, 128-source batch, and canonical source-binding audits. Results are unchanged: graph contract incomplete with 0 nodes/edges and null graph revision; lifecycle has 19 stale / 0 current runs and is ineligible; source-binding remains verified but has 0 admitted graph/ontology rows. No service or datastore was changed.
- The existing DSPy recommender rejects caller-provided `canonicalized=true`, caller-supplied rows, and absent or mismatched server-owned ContextManifest readback before model resolution. Actual RLM remains deliberately fail-closed until that readback can supply authorized chunk bodies and bounded read-only tools.
- Focused continuation checks: 43 tests passed across relation verification, OAK review, DSPy, GEPA, bounded RLM, and canonical source binding; strict OpenSpec validation passed. Overall ledger is still 57/98 (41 open); no task checkbox changed.
- Current data review: `reviewed-task-eval-set-v1.jsonl` has 36 rows, 0 reviewed and 0 relevance labels; the official gold decisions JSON has 30 pending rows; the golden-label draft has 0 rows; GRPO has three unreviewed seed pairs. Do not run GEPA/ranker/RL training from these records.
- Focused test command across relation verification, OAK relation review, strict DSPy/ACE validation, GEPA split/promotion gate, and bounded recommender suites: **40 passed**, 3 dependency deprecation warnings.

## State of the requested path

| Gate | State | Evidence / remaining condition |
|---|---|---|
| Exact source relation proposal | Present | NVIDIA sentence and review-bound proposal exist; fresh capture hash agrees. Preserve exact approved proposal checksum. |
| OAK concept/relation suggestions | Live | :8095 returns pinned proposal-only concepts and the local ontology relation. |
| Semantic review | Approved for review workflow | Existing human receipt is explicitly not source admission or graph-admission authority. |
| Canonical source admission | Proven for page/chunks | One page/12 chunks read back; page hash, exact chunk bytes, chunk checksum, and exact relation evidence span match. Bind content hash separately from page/chunk evidence revisions. |
| Graph admission | Open | Both ontology relation/tuple tables have 0 rows; two graph snapshots are `SUPERSEDED` with null graph revisions. |
| ACE grounded recommendation | Open | Current live search cards fail proof eligibility; require an admitted source, exact evidence, current manifest and independent readback. |
| DSPy Predict | Partly proven | Real local model and structured outputs work; no verified ACE context was consumed. |
| Actual DSPy RLM | Not needed/proven | Existing RLM binding remains fail-closed until verified readback tools exist. Use Predict for the first path; add RLM only if multi-document evaluation shows a gain. |
| GEPA/ranker training | Prepared, blocked on labels | Split and promotion gates exist; no reviewed corpus or held-out metrics. |
| DPO/PPO/GRPO | Experimental only | Current seed pairs are not reviewed preference/reward data. |

## Continuation conditions

1. Operator-controlled :8095 recreation may load `LANGEXTRACT_MODEL_ID` from the current local Compose/environment values. The explicit model override already worked; do not treat the health response’s stale default model label as proof the default route is aligned.
2. Build an immutable source-binding receipt from the existing approval, admitted page/chunk readback, exact content hash, page/chunk evidence revisions, and byte-span parity. Then admit the reviewed relation only through the existing graph owner when a current graph revision and required authorization are available.
3. Re-run retrieval and require exact admitted edge/source revisions and byte-span readback before calling the bounded DSPy Predict adapter. The available live context tool currently fails this gate.
4. Obtain reviewer labels for the 36 query groups (or the 30 official decisions, with a versioned mapping) before GEPA or supervised ranking. Keep preference/trajectory labels separate.

## Required closeout fields

- **likely_cause**: The supporting components are present and now live, but canonical source/graph admission and reviewed relevance labels are missing; live retrieval therefore cannot provide ACE-eligible evidence.
- **evidence**: Current :8095 `/health` and OAK search/candidate responses; fresh NVIDIA capture and exact-byte LangExtract output; real DSPy capability receipt; current structural graph audit; Graphify lifecycle owner and execution-resolution audits; 128-source currentness plan; live context result; 36/30/0/3 label counts; 43 passing focused tests; strict OpenSpec validation.
- **patch_targets**: `python/atlas_graph_runtime/doc14_canonical_source_binding_v1.py`, `python/tests/test_doc14_canonical_source_binding_v1.py`, `scripts/atlas/build-doc14-canonical-source-binding-v1.py`; evidence in this report and the generated JSON receipt.
- **safe_next_command**: `node scripts/atlas/audit-current-structural-edge-contract-v1.mjs`
- **smoke_command**: `$env:PYTHONPATH='python'; C:\Python313\python.exe -m pytest python/tests/test_relation_proposal_verifier_v1.py python/tests/test_doc14_relation_oak_review_v1.py python/tests/test_dspy_predict_ace_recommender_v1.py python/tests/test_gepa_frozen_corpus_adapter_v1.py python/tests/test_doc14_bounded_rlm_recommender_v1.py python/tests/test_doc14_canonical_source_binding_v1.py -q`
- **report_path**: `docs/reports/doc14-live-oak-extraction-dspy-goal-audit-20261123.md`
