# Focused TODO — pgvector, EmbeddingGemma, Agentic Dense Search

Updated: 2026-10-07
Parent: `MASTER-FEATURE-TODO-2026-05-20.md`
Status: diagnostic plan; no database, cache, model, or service writes performed.

## Purpose and ownership

Align the existing agentic error-fixing retrieval path without creating a second index or embedding owner.

- PostgreSQL/pgvector: canonical semantic rows and exact retrieval baseline, subject to exact source/workspace lineage.
- EmbeddingGemma `semantic_768`: dense query/document representation. Equal dimensions or model name alone do not prove recipe parity.
- Go embedding service: existing `/embed/v2` strict receipt path; Go Retrieval calls this boundary and rejects unqualified fallback.
- FastAPI `:8095`: NLP/extraction/classification sidecar, not the canonical dense embedding owner.
- Qdrant/cuVS: derived retrieval/acceleration challengers; no independent identity or final ranking authority.
- Ornith 1.5 via llama-server `:8090`: synthesis/generation only, not embeddings.
- Agentic error fixing: retrieved items remain proposals until canonical identity, revisions, ContextManifest, validation, and authorized execution are proven.

## What the master TODO scan found

- [x] Added `scripts/atlas/extract-master-open-todos-v1.mjs`; it extracts unchecked Markdown tasks, attaches exact source-file byte spans/checksum, reuses the existing Graphify feature-label taxonomy, and emits deterministic diagnostic JSON to stdout. It does not change checkboxes or write reports.
- [x] Added focused tests for UTF-8 byte coordinates, retrieval/worker/error-fixing labels, and non-authoritative status.
- [x] Scan found 169 unchecked tasks and no literal `[]` placeholders. A broad lexical focus returned 12 candidates (including false positives); a narrower pass retained 5 relevant tasks: 2 dense-retrieval, 2 representation-alignment, and 1 agentic-error-fixing item. The master TODO has no dedicated FastAPI CPU-worker concurrency item.
- [x] Existing `scripts/graphify/feature-labeling.mjs --dry-run` completed but found 0 sourceRefs in its ACE input, so it produced 0 labels. This is only a zero-input control-flow smoke, not proof of the label corpus or `domain-topology.mjs` path.
- [x] Corrected the stale master-TODO model wording: EmbeddingGemma remains the semantic embedding lane; Ornith on `:8090` is the synthesis lane.
- [ ] Review the 12 lexical candidates and retain only evidence-backed items in this sub-ledger; task text and heuristic labels are nominations, not error evidence.

## Agentic error-fixing phases and model ownership

| Phase | Existing owner and status | Model/runtime boundary |
|---|---|---|
| 1 — Extraction | `scripts/atlas/extract-master-open-todos-v1.mjs` extracts unchecked tasks with UTF-8 byte spans/checksums, Graphify taxonomy labels, workstream classification, and deterministic JSON. Its focused tests were previously reported passing; that is fixture proof, not evidence that extracted TODO text is an admitted repair example. | No model call. Extraction output is non-authoritative until source/revision and task evidence are qualified. |
| 2 — Error collection | `scripts/phase78-collect-errors.mts` is the existing `RouteErrorEvent` collection path. Its Postgres write behavior is not exercised by this documentation/provider alignment. | No generative model. Keep event collection and its DB write authorization separate from repair synthesis. |
| 3 — Agentic repair | `scripts/phase79-agentic-repair.mts` resolves the loaded model through the shared llama-server runtime contract and sends chat-completions requests to Ornith 1.5 on `:8090`. The server's `/v1/models` response is authoritative; `LLAMA_SERVER_MODEL` is only a configured preference. This script has no Ollama or Gemini chat-provider path and does not use `LLM_PROVIDER`. Its query-embedding work is a separate EmbeddingGemma executor path; it does not make Ornith an embedding model. | Generation/planning: Ornith via llama-server `:8090` only. Ollama is not a chat fallback. The script contains a direct `apply_patch` file-writing tool, so do not execute its repair loop without separate evidence, validator, and mutation-authorization gates. This alignment did not test live inference. |
| 4 — Dense search | `scripts/codebase-semantic-indexer.mjs` requests EmbeddingGemma through the SvelteKit `/api/embed` path first, then falls back to Ollama's `/api/embeddings` endpoint with the explicit `embeddinggemma:latest` model. | Ollama is permitted here only as an EmbeddingGemma embedding backend (`embeddinggemma:latest`, expected 768-D); it is not a generation/chat provider. The embedding recipe and lineage parity remain independent gates, and this legacy indexer must not be treated as proof of canonical `semantic_768` admission. |

`AGENT-ERROR-06` remains open: connecting extracted/error evidence to canonical identity and a sealed ContextManifest is not proven by these scripts existing. The complete safe chain remains sourceRef/revision-qualified evidence → bounded proposal → independent validator/readback → explicit mutation authorization. No repair, model call, database write, or embedding request was run for this alignment.

Configuration for the repair script:

```powershell
$env:LLAMA_SERVER_URL = 'http://127.0.0.1:8090/v1'
$env:LLAMA_SERVER_MODEL = 'ornith-1.5-9b' # preference; resolver verifies the model loaded by /v1/models
# Set ROTORQUANT_MODEL_PATH to the GGUF used by the running llama-server runtime contract.
```

Provider rule: Phase 3 chat/generation uses Ornith 1.5 through llama-server `:8090/v1`; Ollama is reserved for EmbeddingGemma embedding calls only. Never select a chat model through `LLM_PROVIDER=ollama|gemini`, and never infer the synthesis model from the embedding model name or dimension.

## Existing implementation evidence

- `services/go-embedding-service/main.go` exposes `/embed/v2`, defaults `EMBED_BATCH_MAX` to 4, and has an explicit batch bound. The service proxies EmbeddingGemma via Ollama and has Redis cache behavior; this is implementation evidence, not current runtime/readback proof.
- `services/go-retrieval-service/main.go` calls the strict `/embed/v2` path. Its focused tests reject unqualified fallback and validate a revision/receipt-bound query embedding fixture.
- `python/langextract_service.py` allows request `max_workers` from 1 to 20 (default 4). `python/miniforge_nlp_sidecar_v2.py` reports one worker; the older `python/miniforge_nlp_sidecar.py` defaults `LANGEXTRACT_MAX_WORKERS` to 1. These are distinct NLP/extraction worker policies and do not establish dense embedding concurrency.
- Drizzle assets include pgvector and lineage migration candidates. This source audit did not inspect the live PostgreSQL catalog or establish current row population/index validity.
- [x] Added `python/requirements-parent-atlas-tests.in` as a test-only pytest pin, separate from the LangExtract shim `python/pyproject.toml` and runtime requirements. An isolated Python 3.14 temp environment ran `python/tests/test_parent_atlas_dspy_repair.py`: **28 passed**. This proves pure contract/metric behavior only; DSPy is absent there, so no model program or GEPA optimizer ran. System Python and the existing WSL environments still do not have pytest/DSPy installed.

## Ordered gates

- [ ] `DENSE-ROLE-01`: map query embedding, document embedding, and projection writers to their actual callers, endpoints, model/input policy, receipt fields, destination, and fallback behavior. Keep Ornith synthesis separate.
- [ ] `DENSE-RECIPE-02`: prove query/document parity for the admitted `semantic_768` recipe from a verifier independent of the producer; record artifact, tokenizer, input selection, pooling, normalization, dimension, and per-call receipt revisions.
- [ ] `DENSE-LINEAGE-03`: read-only bounded PostgreSQL census joining exact sourceRef/sourceRevision/workspaceRevision to eligible packet/chunk rows and `content_embedding_768`; discover actual indexes from the live catalog. No inferred workspace revision, backfill, DDL, or index creation.
- [ ] `DENSE-WORKERS-04`: add and reconcile the missing explicit FastAPI NLP CPU-worker task with Go embedding batch/in-flight concurrency. Prove max concurrent work, queue/batch bounds, cancellation/timeouts, retry/idempotency, CPU-thread limits, and per-job receipts before increasing concurrency.
- [ ] `DENSE-BASELINE-05`: run one frozen, read-only query cohort against the exact pgvector baseline and lexical baseline; record candidate identity/revisions, Recall@K/MRR, latency, and `EXPLAIN` only when live read authorization is available.
- [ ] `AGENT-ERROR-06`: connect retrieval candidates to the existing canonical identity resolver and ContextManifest candidate path as diagnostic proposals; validator/readback and explicit mutation authorization remain required before any repair execution.
- [ ] `DENSE-CHALLENGERS-07`: only after the baseline and identity join pass, compare Qdrant/cuVS candidates on the same frozen cohort; preserve one logical semantic lane and one fusion vote.

## Prompt subhelpers, sourceRefs, and DSPy/GEPA

This section is a focused dependency view of the existing DSPy/GEPA owner, not a second prompt/runtime contract. Track implementation status in `openspec/changes/parent-atlas-compute-rank-cache-eval-dspy-gepa/tasks.md`.

- [ ] `PROMPT-HELPERS-01`: inventory the existing prompt generator and sub-agent/helper surfaces; classify each as orchestration, evidence acquisition, model proposal, or validation. Keep helpers bounded and explicit (diagnose, locate evidence, propose repair, validate); do not add an autonomous recursive prompt loop or duplicate tool registry.
- [ ] `PROMPT-SOURCE-02`: require each helper input/output to carry only allowlisted `sourceRef` evidence from the sealed `ContextManifest`, plus exact `sourceRevision`, `workspaceRevision`, content checksum, and byte span where applicable. Keep `filePath` as a locator; unresolved or mismatched refs stay unresolved and cannot become model evidence.
- [ ] `PROMPT-BOUNDARY-03`: reuse `EvidenceLocatorV1` and the existing `DspyRepairOutputV1` parser/admission boundary. A helper may propose target/evidence IDs only; reject IDs absent from the manifest, altered manifest checksums, duplicate IDs, ungrounded spans, and extra output fields.
- [ ] `DSPY-ADAPTER-04`: map the typed ContextManifest/evidence receipt into the existing metadata-only `build_semantic_768_gepa_example_v1()` input. Do not send raw embedding vectors, fabricate source/packet identity, or treat retrieval score as a repair outcome.
- [ ] `GEPA-SHADOW-05`: follow the owning `GEPA-VERSION-01`, `GEPA-768-INPUT-01`, `GEPA-HELDOUT-01`, and `GEPA-SHADOW-01` gates before any optimization run. Keep candidates offline/shadow, fixed-seed, checksummed, held-out evaluated, and unable to write stores or promote policy.
- [ ] `PROMPT-REPLAY-06`: extend the existing read-only prompt replay only after bounded sourceRef-backed ContextManifest inputs are available; compare prompt/program revision, selected evidence IDs, manifest checksum, and deterministic output projection. Existing replay scaffolding is not live ACE/DSPy runtime proof.

**Existing owner surfaces to reuse:** `scripts/agent/prompt-generator.mjs`; `sveltekit-frontend/src/lib/server/atlas/contracts/evidence-locator-v1.ts`; `sveltekit-frontend/src/lib/server/atlas/evals/dspy-repair-output-v1.ts`; `python/parent_atlas_dspy_repair.py`; and `scripts/atlas/lib/canonical-source-ref.mjs`. These are different roles: prompt construction, evidence location, output validation, DSPy/GEPA example/program logic, and source-ref normalization. None alone proves a live end-to-end helper path.

**Current proof boundary:** source-level helpers and parser/example validation exist; serialized TypeScript-to-Python dispatch, live ACE-backed replay, pinned DSPy/GEPA runtime, frozen held-out evaluation, and shadow-run receipts remain open in the owning OpenSpec ledger. Do not run report-producing audits, training, service calls, or store writes as part of this TODO update.

## OaK 2026 alignment (Ontology-as-a-Kernel)

OaK is used here in the paper's sense (task-oriented schema + typed reasoning functions + grounded graph), distinct from OAKlib/Ontology Access Kit. Reuse Parent Atlas's existing OaK kernel/operator/function owners; do not create another ontology, graph, tool registry, or judge authority. The paper's judge-driven refinement is a design input, not evidence that this repository has a live OaK↔DSPy loop.

- [ ] `OAK-DSPY-BIND-07`: bind the repair helper's inputs to the existing frozen task/domain schema and registered typed reasoning functions. Allow only declared function IDs and argument schemas; any proposed schema/function expansion is a review artifact until independently admitted.
- [ ] `OAK-RECEIPT-JUDGE-08`: connect independent execution/validator receipts (including `LearningOutcomeV1` and repair-episode verification) to the existing OaK judge-feedback contract. Separate evidence-grounding, localization, tool/function selection, test/typecheck, regression, and cost feedback; judge prose cannot override deterministic hard gates.
- [ ] `GEPA-COMPONENT-EVAL-09`: evaluate the existing `diagnose` and `propose` DSPy components separately on one frozen train/validation corpus before considering tool-description optimization. Keep stable tool/function names and schema revisions; compare baseline and candidate with the existing receipt-derived metric and hard-fail rate.
- [ ] `OAK-KERNEL-FREEZE-10`: freeze the ontology/schema, function/operator catalog, prompt/program, evidence policy, judge, and evaluation revisions together in a candidate receipt before shadow inference. A GEPA candidate may suggest changes; it cannot mutate the admitted OaK kernel, taxonomy, canonical evidence, or routing policy.

**OaK-informed improvement hypothesis:** make each repair helper a typed kernel operation over a bounded, revision-qualified ContextManifest rather than a free-form sub-agent prompt. Use independent validator/receipt outcomes to identify whether failures come from missing concepts/relations, a missing or miscomposed function, bad evidence selection, or prompt instructions. Then let GEPA propose only the relevant prompt/program component update and evaluate it against the frozen rubric. Success means held-out improvement with zero fabricated-evidence, permission, or regression hard-gate violations—not a judge score increase alone. The method is inspired by OaK's task-conditioned schema/function construction and judge-feedback refinement; Parent Atlas's canonical owners and admission gates remain authoritative.

## Deferred two-hop NLP → DSPy/OaK parameter proposal

This is a script-level integration TODO, not a new always-on service or a live parameter updater. Orchestration and parameter admission remain with existing TypeScript/Atlas owners; `llm_output` is untrusted proposal data until schema, evidence, policy, and validator checks pass.

- [ ] `PREFILL-NLP-8095-01`: add a bounded script that sends exact, revision-bound source text/evidence to existing `:8095` routes for AST/NLP/LangExtract observations. Preserve `sourceRef`, source/workspace revisions, extractor revision, and exact spans; reject ungrounded extractions. No raw retrieval results go straight to Ornith.
- [ ] `DSPY-OAK-PARAMETER-PROPOSAL-02`: only after gate 01, make a second typed request to a separately provisioned `atlas-dspy-cpu` worker. Give it the validated evidence packet, an allowlisted parameter schema, and existing OaK function IDs; it may request bounded RLM/next-action proposals and return structured `llm_output` for Ornith `:8090` synthesis. Resolve/validate proposed parameters through the existing Atlas parameter resolver and validator; no arbitrary URL concatenation, direct OaK/DB/cache writes, live policy mutation, or self-authorized loop.
- [ ] `DSPY-GEPA-OFFLINE-03`: keep GEPA optimization separate from the two online calls. Run only against frozen train/validation examples with a pinned DSPy runtime; held-out evaluation and explicit policy admission are prerequisites to using any optimized prompt/program.
- [ ] `LANGEXTRACT-SPAN-04`: reuse the existing LangExtract path and its grounding adapter; prove returned character intervals map to exact UTF-8 byte spans before observations enter the evidence packet.

**Existing LangExtract locations:** `python/miniforge_nlp_sidecar_v2.py` exposes `/extract` and `/extract/documentation-facts` on the 8095 sidecar; `python/langextract_service.py` is the separate LangExtract FastAPI service with `/extract` and `/extract/file`, configured for llama-server; `python/atlas_langextract_runtime.py` resolves the package runtime; `python/atlas_structural_provenance.py` normalizes and checks extraction alignment; `python/requirements-langextract.txt` pins the standalone service dependency. These are existing surfaces, not proof that the proposed two-hop script is wired or live.

**Required order:** exact evidence/sourceRefs → 8095 grounded observations → typed OaK/parameter lookup → isolated DSPy proposal → Ornith synthesis → deterministic parameter/repair validation. RLM continuation is budgeted by the existing DAG; GEPA is offline only. `atlas-dspy-cpu`, the 8095 call, the DSPy RPC, and this composed path are not yet live-proven.

## Repair-path convergence gates

This section coordinates existing owners; implementation completion belongs in `openspec/changes/parent-atlas-compute-rank-cache-eval-dspy-gepa/tasks.md` and the relevant OaK, FastAPI, ACE, and compute OpenSpecs. The workstation TODO is not a second authority ledger.

- [x] `GPU-ENV-OWNER-READBACK-00`: read-only WSL readback confirms `/home/james/miniforge3/envs/atlas-rapids-cu13` is Python 3.14.6 with PyTorch `2.13.0+cu130` and CUDA `13.0`; it remains the GPU/compute lane for PyTorch, cuVS/cuGraph/RAPIDS, KMeans/centroids, tensor projections, and batch features. This does not prove free GPU capacity or authorize a GPU run.
- [ ] `DSPY-RUNTIME-01`: pin an isolated, normal-GIL CPython DSPy/GEPA environment and prove imports. Prefer a dedicated worker environment; do not install into Miniforge `base` or the shared `:8095` NLP environment. Co-location with `atlas-rapids-cu13` is only an evaluated alternative: dry-run resolution, inspect package changes, use a disposable clone, then prove `pip check` and Torch/cuVS/cuGraph imports. Keep 3.14t as an isolated benchmark only.
- [ ] `DSPY-LM-01`: prove a bounded DSPy request/response against the exact model advertised by Ornith llama-server `:8090/v1/models` and `/v1/chat/completions`; record model/runtime revision, timeout, and output checksum. This proves generation compatibility only, not retrieval or repair admission.
- [ ] `DSPY-OAK-01`: bridge existing DSPy `diagnose`/`propose` predictors to an allowlisted function in the real, checksum-sealed OaK catalog through a strict serialized request. DSPy may select function IDs and typed arguments; Atlas owns evidence acquisition, identity, and permissions. No direct store access from the worker.
- [ ] `DSPY-MANIFEST-01`: admit predictor inputs only from the exact sealed `ContextManifest`; reject raw retrieval hits, unknown evidence IDs, and manifest checksum drift.
- [ ] `DSPY-RECEIPT-01`: emit a per-invocation receipt binding program revision, model/runtime revision, ContextManifest/evidence revisions, request/output checksums, and execution status.
- [ ] `REPAIR-PROGRAM-V2-03`: extend the current two-predictor program only after the handoff exists: classify failure → choose typed evidence functions → retrieve grounded evidence → select target → propose repair strategy → predict validators. Every stage consumes the same qualified ContextManifest and emits proposal data, not authority.
- [ ] `OAK-JUDGE-PRODUCER-04`: implement the bounded judge producer under the existing OaK feedback owner. Derive feedback from independent execution and validator receipts; judge prose cannot override hard gates. The existing `OakJudgeFeedbackV1` contract alone is not a producer.
- [ ] `GEPA-CORPUS-01`: freeze sourceRef-backed train/validation/held-out repair example IDs and checksums; reject examples missing exact identity, source/workspace revisions, grounded evidence, qualified retrieval, or known validators. Never optimize on held-out examples.
- [ ] `GEPA-SHADOW-01`: run a bounded offline/shadow optimizer to emit a checksummed candidate program revision without promotion. GEPA may optimize function choice/order, evidence classes, bounded retrieval/stop policy, instructions, tool descriptions, examples, and repair-plan formatting; hard safety/evidence failures score zero. It must not optimize identity/revisions, embedding recipe, permissions, validator truth, or ownership.
- [ ] `PARAMETER-CANDIDATE-06`: represent fetched/synthesized parameter changes as revisioned candidates; validate through the existing parameter resolver, allowlist, and deterministic DAG validator, then require explicit policy admission. Production queries and RLM loops must not mutate the active parameter policy directly.
- [ ] `FASTAPI-QUEUE-RECEIPT-07`: separate NLP/error-classification work from EmbeddingGemma embedding work. Bound each queue, batch size, worker count, CPU threads, timeout/cancellation, retry/idempotency, and overload behavior. Receipts include operation, queue, worker ID, input revision, model revision, start time, duration, status, and output checksum. Do not infer multi-core throughput from a worker count or `max_workers` setting.
- [ ] `LUT-01`: prove each stable `uint64` CandidateOrdinal resolves to exactly one canonical identity through existing identity/ordinal owners and matching frozen revisions. Ordinals are execution addresses, never identity.
- [ ] `CFM-ROW-CROSSWALK-01`: the existing matrix owner has a pure feature-cell producer that joins observation rows by admitted ordinal, verifies identity/revisions, and emits deterministic row-major cells with explicit coordinates. Focused matrix spec passed 12/12, including shuffled input, duplicate/revision/cell-coordinate rejection, and JSON serialize/readback. Fixed the project-wide matrix revision type error; matrix plus graph suites pass 26/26 and full `npx tsc --noEmit --pretty false` passes. No live feature-observation producer/caller or independent persisted-artifact readback is proven; do not add a registry. See `openspec/changes/parent-atlas-candidate-feature-execution-fabric/tasks.md`.
- [ ] `S-GRAPH-SEARCH-ALIGNMENT-01`: the existing SGraph search plan preserves the legacy single seed and accepts a unique multi-seed set, sorted deterministically; receipts bind normalized seeds, unique `allowedEdgeKinds`, and bounded `maxPathCost`, distinguishing cost cutoff from unreachability. Focused suite passed 14/14. Live admitted-graph execution, production caller/readback, and any admitted live graph remain unproven; keep graph-derived features unavailable until the structural-edge gate passes. See `openspec/changes/parent-atlas-pass-fabric/tasks.md`.
- [ ] `CFM-OBSERVATION-SOURCE-01`: existing retrieval profiles provide exact chunk/source/workspace lineage, but not a query semantic score, bound domain confidence, or graph-revision-qualified PageRank/community. The adjacent 25-column matrix is a different vocabulary and assigns rows from retrieval order; do not convert it into the fixed 11-feature artifact by name similarity. A strict exact identity join and feature-specific provenance are still required.
- [ ] `CFM-SCHEMA-ID-01`: removed an incompatible schema-ID collision: the 18-feature tool-routing payload now identifies as `atlas.tool-routing-feature-matrix.v1`; the 11-feature packet matrix retains `atlas.candidate-feature-matrix.v1`. Regression coverage is added but unrun; compatibility with persisted historical tool-routing payloads is not verified.
- [ ] `TVEC-01`: index only admitted `semantic_768` vectors under the proven ordinal/LUT checksum using the existing TurboVec CPU challenger. Do not claim TurboVec enforces SQL/domain/ACL filters internally unless its API proves that.
- [ ] `TVEC-02`: exact-rerank bounded TurboVec results against the canonical retrieval oracle and record recall/ranking metrics, candidate and ordinal-map checksums, and representation revision. No production ranking change.
- [ ] `CENTROID-01`: bind any KMeans/centroid artifact to the same frozen CandidateOrdinal checksum and representation revision; keep cluster IDs as derived features, not identities. Use existing cuVS/Python compute owners, CPU oracle/parity, and explicit GPU resource gate; do not co-run GPU work with Ornith `:8090` on the constrained GPU.
- [ ] `SIMDJSON-ALIGNMENT-01`: use simdjson only for bounded JSONL/NDJSON parsing into typed records; parsing/transport must not create identity or revisions. Keep free-threaded Python experimental until all native extensions are verified.
- [ ] `PREFILL-01`: compose qualified classifier, retrieval, allowed OaK, and available centroid features through existing owners into one revision-bound ContextManifest. Unavailable features remain null with explicit reasons, not fabricated zeroes.
- [ ] `LEARN-01`: convert an independent failed-validator/execution receipt into the existing `LearningOutcomeV1` owner with evidence and revision bindings; model/judge prose alone is not outcome evidence.
- [ ] `LEARN-02`: prove production requests cannot mutate GEPA/program revisions or training state online; only offline candidate creation and explicit admission may change the active program.
- [ ] `ACE-BITFROST-PACKET-10`: feed only validated evidence into existing ACE packet/ContextManifest owners. BitFrost/Valkey may cache revision/checksum-addressed packet descriptors, parameter plans, or residency metadata with explicit expiry/invalidation; it must not store hidden reasoning, KV tensors, or become canonical packet storage.
- [ ] `PRIME-RLM-MOVE-LUT-11`: reuse PrimeAgent/RLM working-state, bounded execution DAG, capability/action registry, and existing OaK function catalog. A “move” is a typed, budgeted operation proposal, not a free-form tool call. LUT/title/bucket/ordinal codes remain revisioned routing addresses, not identity; “XP” is derived from validated outcome receipts, not a self-awarded model score. No parallel registry/table.
- [ ] `END-TO-END-REPAIR-PROOF-12`: replay one read-only, sourceRef-backed fixture through canonical LUT → qualified retrieval/OaK → CandidateFeatureMatrix/ContextManifest → DSPy → Ornith → independent validator → LearningOutcome receipt. Record checksums and revisions at each handoff; no source mutation or store writes. This integrates the gates above but does not replace their individual proof.

**Target architecture (existing owners only):** Parent Atlas identity/ordinal owners → PostgreSQL exact + TurboVec/cuVS challenger projections → candidate set → graph/OaK functions → CandidateFeatureMatrix → ContextManifest → isolated DSPy program → Ornith `:8090` → RepairProposal → independent validators → `LearningOutcomeV1` → offline GEPA candidate → explicit program-revision admission. No second registry, retrieval owner, NLP service, or canonical store.

**Gate status:** all newly named gates above remain open/`NOT_PROVEN` unless a gate has an explicit evidence receipt; prior fixture/unit tests do not prove live DSPy, Ornith, OaK, TurboVec, centroid, or end-to-end execution.

## HyperRAG structural-edge gate

- [ ] `STRUCTURAL-EDGE-ARTIFACT-RECOVERY-01`: status remains `BLOCKED / NOT_MEASURABLE`, not `EMPTY`. The claimed 419-edge artifact/receipt pair is not verified. Existing nearby artifacts are not substitutes: the 1,334-edge artifact is non-production, lacks candidate snapshot/ordinal bindings, and is bound to a different workspace than the zero-edge current plan; the 440-nomination cohort proves source spans/nodes only; the 453-edge single-source replay lacks workspace revision and has zero edge writes. Endpoint and incidence rates remain undefined until one exact-snapshot, revision-receipted edge cohort is recovered or explicitly authorized.
- Owner ledger: `openspec/changes/parent-atlas-compiler-semantic-graph-resolution/tasks.md`. Do not refresh Graphify, alter `graphify_edges`, backfill endpoints, or build incidence to manufacture a cohort.

## Do not do in this tranche

- No EmbeddingGemma batch/index write, Qdrant upsert, cache warming, service restart, GPU run, Graphify refresh, migration, or schema/index change.
- No replacement of EmbeddingGemma with Ornith; no pseudo-vector or mean-pool output promoted as canonical semantic_768.
- No task completion based solely on an extracted TODO, source presence, model name, dimension, or fixture test.
- Keep DSPy orchestration, `:8095` NLP/OaK, CPU parsing/retrieval, and `atlas-rapids-cu13` GPU math as distinct process/environment roles; parameter/prompt candidates remain frozen during each request.

## Commands

- Diagnostic extraction: `node scripts/atlas/extract-master-open-todos-v1.mjs`
- Focused extraction: `node scripts/atlas/extract-master-open-todos-v1.mjs --focus='pgvector|embeddinggemma|FastAPI|worker|agentic.*error|error.*fix'`
- Test-only dependency install (isolated environment): `& "$env:TEMP\atlas-repair-example-venv\Scripts\python.exe" -m pip install -r python/requirements-parent-atlas-tests.in`
- Python contract tests (isolated environment): `& "$env:TEMP\atlas-repair-example-venv\Scripts\python.exe" -m pytest -q python/tests/test_parent_atlas_dspy_repair.py`
- Smoke test: `node --test scripts/atlas/extract-master-open-todos-v1.test.mjs`
