# Parent Atlas NLP and retrieval cleanup review — 2026-11-23

## Scope and safety

Read-only review of the current checkout, mounted `:8095` service, local model endpoints, model artifacts, and retrieval ownership. No files or data were deleted, no service was recreated, and no model or graph state was promoted. The checkout already contains unrelated working changes; preserve them.

## Findings

### NLP sidecar and extraction

- `miniforge-nlp-sidecar` is running healthy on `:8095`. Its repository and Python modules are mounted read-only, including `python/atlas_graph_runtime`; the model directory is also mounted read-only.
- The sidecar has FastAPI, Pydantic, OAKLib, and LangExtract available. Its `miniforge_nlp_sidecar_oak.py` imports the v2 routes. The service is not a GPU/RAPIDS executor; do not conflate it with `:8098`.
- `models/domain-classifier/checkpoint.joblib` is the sidecar's scikit-learn classifier artifact. It is not a `.pt` or `.safetensors` model. Existing classifier callers remain in the Python helper path.
- Compose previously defaulted `LANGEXTRACT_MODEL` and `LANGEXTRACT_MODEL_ID` to `ornith-1.5-9b`, while live `:8090/v1/models` reports `gemma4-legal-iq4xs-direct.gguf`. I aligned the local Compose and `.env`/`.env.local` values with that live ID, and changed Compose interpolation to fail if the model ID is unset. This updates configuration only: the running container has not been recreated, and no LangExtract generation request was run. LangExtract can target an OpenAI-compatible endpoint with explicit provider/model configuration; verify a bounded extraction receipt after the operator applies the configuration.
- The available Ollama tags were embedding models and Docling, not a verified generative CPU small language model. Current Gemma 4 inference is through `:8090`; no evidence shows MTP active for it. llama.cpp exposes MTP as an optional speculative-decoding mode, but support for this exact GGUF/build must be proven before enabling it.

### Checkpoints and deletion safety

- Both `atlas-gemma-rank-v1` and `atlas-gemma-rank-v1-donor-b` manifests say `UNTRAINED_STANDALONE_INITIALIZATION`, `trainingPerformed=false`, `checkpointMutated=false`, `canonicalAuthority=false`. Treat them as initialization artifacts, not trained or promoted rankers.
- `policy-reranker.pt`, nested semantic autoencoder, packet-JEPA, and SAM2 checkpoints all have code or script references in the current checkout. These are distinct consumers and purposes; none is safe to delete based on this inventory.
- No deletion in the inspected `models`, Python graph runtime, or sidecar paths appears in the current worktree diff. This is not a historical repository audit.
- Retirement rule: first prove no runtime import, test, model registry, Docker mount, script, OpenSpec evidence, or rollback depends on an artifact. Mark superseded and archive before any later deletion.

### Retrieval and GraphRAG

- The repository contract keeps PostgreSQL canonical, Qdrant as a rebuildable vector projection, Neo4j/topology as a derived graph projection, and SearchRuntime as the single cross-lane normalization/fusion owner. Keep those boundaries; do not add another graph database, RRF owner, or canonical tuple store.
- The Qdrant/Neo4j GraphRAG example is a useful pattern for joining vector-hit chunk IDs to graph entities. It does not validate Atlas provenance by itself: Atlas still needs exact source revisions, admitted typed edges, bounded expansion, and PostgreSQL rejoin before ACE.
- Use HNSW/halfvec or binary quantization only for measured vector-search/index tradeoffs. They are not ontology edges or evidence. Keep exact PostgreSQL scoring as an oracle for bounded parity checks.
- Keep Ontology/OBO/SSSOM output at proposal/review boundaries. A candidate tuple needs pinned ontology identity, reviewed mapping, exact source span, graph revision, admission readback, and ACE proof before it is authoritative.

## Action list

1. Have the operator recreate only the NLP sidecar to load the corrected LangExtract model ID and existing OBO mount. No service was recreated in this review.
2. Run one bounded LangExtract extraction against `:8090`, checking the actual model ID, structured output, exact source spans, and proposal-only status.
3. Keep the classifier and referenced checkpoints. Requalify classifier labels and evaluate on a frozen, provenance-checked split before using scores for routing.
4. Close one admitted, revision-bound relation through PostgreSQL/Graphify readback and ACE before scaling multi-hop GraphRAG.
5. Benchmark EmbeddingGemma 2/MRL as an isolated projection against the existing canonical embedding lane; re-embed with the new model rather than transforming incompatible model spaces. Use held-out recall/NDCG, latency, and storage measurements.
6. Defer MTP, CPU generative SLM selection, new graph/index layers, and artifact deletion until a specific measured gap justifies them.

## Evidence pointers

- `docker/miniforge-nlp-sidecar/docker-compose.yml` (sidecar OAK mount and LangExtract model defaults)
- `python/miniforge_nlp_sidecar_v2.py` (OAK source and LangExtract route configuration)
- `python/atlas_nlp_classification_helper_v1.py` and `models/domain-classifier/`
- `models/atlas-gemma-rank-v1/standalone-init-bf16/atlas-rank-manifest.json`
- `models/atlas-gemma-rank-v1-donor-b/standalone-init-bf16/atlas-rank-manifest.json`
- Existing `policy-reranker.pt`, autoencoder, packet-JEPA, and SAM2 call sites found by repository search

## Closeout

- **likely_cause**: The apparent missing NLP stack is mostly present; the concrete issue is a stale LangExtract model ID plus unproven extraction/retrieval handoffs, while referenced checkpoints are not safe cleanup targets.
- **evidence**: Live `:8095` mounts and package inventory; live `:8090/v1/models`; Compose `LANGEXTRACT_MODEL*` defaults; both rank manifests; active checkpoint call sites; existing SearchRuntime RRF implementation and repository ownership rules.
- **patch_targets**: `docker/miniforge-nlp-sidecar/docker-compose.yml`, `.env`, `.env.local`, this report.
- **safe_next_command**: `docker compose --env-file .env -f docker/miniforge-nlp-sidecar/docker-compose.yml config --quiet` (validated successfully; parses config without starting or recreating services).
- **smoke_command**: After operator applies/recreates the configured service, run the existing bounded LangExtract route and verify its receipt reports the exact live model ID and proposal-only source spans.
- **report_path**: `docs/reports/parent-atlas-nlp-retrieval-cleanup-review-2026-11-23.md`

## Fresh live verification — 2026-11-23

- `GET :8095/health` returns `status=ok`, `model=gemma4-legal-iq4xs-direct.gguf`, LangExtract 1.6.0, OAK source `SOURCE_CONFIGURED`, pinned ontology revision `sha256:8e651ef5bd4d0f8c702a7dd751687bf912fdbe470f198ae6e41b5248517cb14c`, and the current sidecar module digest. The `/ontology/oaklib/candidates` read-only call for `ATLASLANG:cuda_cpp` returned proposal-only concepts and the existing `compiles_to` relation to `ATLASISA:ptx`; `canonicalAuthority=false`, `writesPerformed=false`.
- The live container has FastAPI 0.141.1, Pydantic 2.13.5, OAKLib 0.7.4, LangExtract 1.6.0, scikit-learn 1.7.2 and joblib 1.5.2. PyTorch is absent. The classifier checkpoint and source modules are host bind mounts marked read-only. This confirms that the NLP helpers and FastAPI sidecar are present; it does not prove every helper is on a production caller path.
- `/v1/models` on `:8090` reports `gemma4-legal-iq4xs-direct.gguf`. LangExtract supports OpenAI-compatible endpoints with explicit provider/model/base URL settings; a prior live extraction produced exact spans but did not extract this CUDA→PTX relation. MTP is llama.cpp speculative decoding, not a CPU SLM or a LangExtract feature; no evidence shows MTP active or supported by this exact GGUF/build.
- Exact source/chunk evidence and the semantic review are recorded in the existing source-binding and reviewer receipts. Source page/chunks are present in PostgreSQL, but no current revision-qualified Graphify snapshot exists and ontology tuple/relation counts remain zero. The review decision is only `APPROVED_FOR_REVIEW_WORKFLOW`; it does not authorize canonical admission. ACE remains ineligible without graph admission and independent context readback.
- `create_bounded_dspy_rlm_v1` is intentionally fail-closed: its tool binder raises `RLM_VERIFIED_ACE_READBACK_TOOL_BINDING_NOT_IMPLEMENTED`. The structured DSPy Predict capability was proven without ACE context, so it is not yet an end-to-end recommendation. GEPA preparation helpers exist, but the required reviewed examples/held-out evaluation are not ready.
- No modules, checkpoints, indexes, or service data were deleted or modified by this verification. The safe cleanup conclusion remains: keep referenced helpers/artifacts; retire nothing until caller, mount, test, registry, and rollback dependencies are disproven.

## Recheck after runtime configuration — 2026-11-23

- `miniforge-nlp-sidecar` is currently running healthy with port `8095` published. Its health response reports `SOURCE_CONFIGURED`, the pinned ontology digest above, and current mounted source-module digests. The container mounts `/workspace`, `/app/python`, and `/models/domain-classifier` read-only. No recreation is currently needed to make OAK available.
- The live service health payload reports FastAPI/Pydantic/OAK/LangExtract, spaCy, Tree-sitter, AST-grep, and the classification helper. A direct `docker exec python -c` import of project modules without adding `/app/python` to `PYTHONPATH` returned no module spec; this is a path-only probe and does not contradict the running application’s health/module digests. The health endpoint is the live application proof.
- `checkpoint.joblib` remains the mounted scikit-learn domain classifier. The Windows host contains other `.pt` and `.safetensors` artifacts with code references; this review found no reason to delete or replace them.
- Official LangExtract docs describe explicit provider configuration for OpenAI-compatible endpoints (`provider="openai"` with `base_url`). This makes Gemma 4 through llama-server a supported integration shape, but a current bounded extraction receipt is still needed to prove the actual request, structured output, exact spans, and proposal-only status.
- llama.cpp documents speculative decoding and draft-model modes. MTP is a llama.cpp decoding mode; it is not CPU inference or a substitute for a CPU NLP/SLM lane. The active model’s compatibility and speedup are unverified, so MTP stays an optional benchmark. The existing CPU spaCy/Tree-sitter/OAK passes plus Gemma 4 are enough to pursue the first vertical slice; add a CPU generative SLM only if measured latency or GPU contention demonstrates the need.
- The Qdrant/Neo4j GraphRAG example links vector results to graph records by a shared ID and expands graph context. Atlas still needs admitted revision-matched edges, strict traversal limits, PostgreSQL rejoin, and the canonical ACE manifest validator; the library example does not supply those guarantees.
- The earlier action to recreate the sidecar is superseded by this live check. Do not recreate it solely for OAK configuration. The remaining blockers are evidence/review/admission and consumer wiring.

## Live extraction probe — 2026-11-23

- `POST http://127.0.0.1:8095/extract/documentation-facts` completed against the running sidecar and the `gemma4-legal-iq4xs-direct.gguf` model served at `:8090`. Input was the single NVIDIA CUDA Programming Guide sentence about NVRTC compiling CUDA C++ device code to PTX. LangExtract returned one fact with exact 0..133 character and UTF-8 byte spans, `MATCH_EXACT`, and `canonicalAuthority=false`. The route reported producer revision `parent-atlas-nlp-sidecar:analysis-v1|ast-grep=0.45.3|tree-sitter=0.25.2|tree-sitter-language-pack=0.9.0|chunker=4.0.0`, input SHA-256 `73ca8e4650413d3e44c979e138ea70195f52bc8121fe2e7bf87e27468eba1e01`, and output SHA-256 `2c33e9105c2a3f47558d0580da664360e2a7bf5af304b4ec26c18104af6d3022`.
- This proves the live extraction/provider route and span alignment, not canonical source capture, relation review/admission, Graphify projection, DAG retrieval, or ACE consumption. The submitted `sourceRevision` was the excerpt hash for this probe; production must use the canonical captured page/chunk revision and independent byte readback.
- The returned live fact labeled `extractionMethod` as `LANGEXTRACT_ORNITH` from the default in `DocumentationFactV1`, even though `modelId` was Gemma 4. The source contract now defaults to `LANGEXTRACT_OPENAI_COMPATIBLE`; the running container has not reloaded this source edit, so its response remains stale until the normal operator-controlled service reload. Do not treat the earlier live receipt's extraction-method field as clean model lineage.
- Read-only `GET :8090/props` reports `speculative.type=none`. MTP is not currently active. llama.cpp documents `draft-mtp` as optional speculative decoding using model MTP heads; this is separate from a CPU SLM and does not establish compatibility or speedup for this Gemma 4 GGUF.
- A refreshed read-only PG18 binding confirms page `f6049944-3904-4c87-a353-3393ffb08d59`, chunk `doc:nvidia-cuda-guide-doc14:494ef3b6ef264403:8`, the exact source quote at page bytes 9290..9358, and separate page content, page evidence, and chunk evidence revisions. The optional `--live-langextract` pass now sends that pinned chunk/window to the existing `:8095` route and verifies returned spans against the canonical bytes before rebasing them to page offsets. The current Gemma 4 run returned zero facts for the narrow sentence window and one unrelated exact-span fact for the full chunk; a full-page pass returned six exact-span facts but did not cover the reviewed NVRTC quote. This is a measured extraction-recall gap, not a source-integrity failure. All probe receipts remain `canonicalAuthority=false`, `writesPerformed=false`; PG18 still reports zero tuple rows, relation rows, and graph revisions.
- `find_source_refs` on the connected MCP returned `NO_PACKET` for the NVIDIA URL and a null graph revision. This is a separate unresolved packet/graph projection lookup; it does not override the direct read-only PostgreSQL page/chunk readback above.
- The source-level `extractionMethod` default is now `LANGEXTRACT_OPENAI_COMPATIBLE`, and its focused Python test passes. The already-running `:8095` process still returns its pre-edit `LANGEXTRACT_ORNITH` default until the operator-controlled reload; do not claim the live runtime metadata is fixed yet.

## Latest runtime and asset recheck — 2026-11-23

- **Sidecar is present:** Docker reports `miniforge-nlp-sidecar` up and healthy, publishing `8095`. `/workspace`, `/app/python`, and `/models/domain-classifier` are read-only host bind mounts. The live package versions are FastAPI 0.141.1, Pydantic 2.13.5, OAKLib 0.7.4, LangExtract 1.6.0, scikit-learn 1.7.2, and joblib 1.5.2. Live capabilities include spaCy/POS, LangExtract, Tree-sitter, AST-grep, NetworkX, and classification helper; Torch, cuGraph, cuVS, and CuPy are absent.
- **OAK is configured and answering:** live OAK digest `sha256:8e651ef5bd4d0f8c702a7dd751687bf912fdbe470f198ae6e41b5248517cb14c` exactly matches the host OBO digest. Search for `CUDA C++`, `PTX`, and `CUDA C++ device code` returned 3 bounded proposal rows; `CUDA C++` mapped to `ATLASLANG:cuda_cpp`, the other labels did not match. No authority or writes were claimed.
- **Runtime drift is real:** live `/health` reports v2 source digest `5c2a08fd7606b6472072f43ab284f8b7c9e6cc4ae9f3eecdbc15561e85c6ada7`, while the mounted checkout hashes to `86456802af82c71442bd303f886a92988d8f2a317e1a29cf905878dbc69b07e6`. The v1 digest matches the checkout (`db9d6aeeaaf70ede2662d2f6cbb3b2d2772e6d8a4929f87903ecf55ccbaef9b5`). The endpoint's old `LANGEXTRACT_ORNITH` response field and old classifier response shape are consistent with v2 still holding pre-edit imported code in process memory.
- **Live extraction works, with a lineage caveat:** a bounded `POST /extract/documentation-facts` to the local Gemma 4 route returned one NVRTC fact with exact UTF-8 bytes 0..68, model ID `gemma4-legal-iq4xs-direct.gguf`, and `canonicalAuthority=false`. The input was an ad hoc sentence with a self-computed excerpt digest, not a canonical NVIDIA page capture, so this only proves the live extraction call and alignment to supplied text. The response incorrectly labeled `extractionMethod=LANGEXTRACT_ORNITH`; do not treat it as a canonical extraction receipt.
- **Classifier checkpoint is not active in the probed route:** `/models/domain-classifier/checkpoint.joblib` is available (101,160 bytes, SHA-256 `707a8f6f40a339be531099e6c2eacc16ac57d49028dadbfeb81946560eb2b5b1`), but `/classify` returned the deterministic `gpu` proposal and reported `modelChallenger.loaded=false`. That is not a trained sklearn prediction or quality proof.
- **Artifacts present on the host:** 12 model files were hashed. This includes two 154,686,042-byte ranking `.safetensors`, two 159,138,208-byte assistant `.safetensors`, three EmbeddingGemma2 ONNX quantized components, and `.pt` files for the nested semantic autoencoder (5,825,981 bytes), Packet-JEPA (533,447), SAM2.1 tiny (156,008,466), and policy reranker (195,954). Their exact paths and SHA-256 values are in [the machine-readable audit receipt](parent-atlas-live-runtime-asset-audit-2026-11-23.json); presence does not establish a loaded consumer. No deleted paths were found under `python`, `models`, or the sidecar Docker source in the current worktree diff.
- **Recreation data check:** `docker diff` lists `/root/.data/README.md` and an empty `/root/.data/oaklib` directory in the container writable layer; no files were present under the OAK directory. Recreating the container discards its writable layer, but the inspected contents are PyStow documentation and an empty directory. The repo and model mounts are read-only host data. No container operation was performed.
- **MTP and retrieval boundaries:** live llama-server `/props` reports speculative `type=none`, so MTP is not active. MTP is llama.cpp speculative token decoding, not a CPU small language model or extraction pass. The sidecar performs bounded NLP/extraction/classification and per-document NetworkX analysis; Go Retrieval/SearchRuntime owns retrieval/fusion and canonical rejoin. Do not move DAG/search ownership into :8095.
- **Fresh RAG/DAG context check:** `build_agentic_rag_context` used live TRACE `search.hybrid` plus `atlas.packet_search`: 5 search hits became 4 cards, all 4 identity-bound. It returned `revisionStatus=MISSING_SOURCE_REVISION`, `admissionStatus=UNADMITTED_RETRIEVAL_CANDIDATES`, `proofUsable=false`, `DOMAIN_FILTER_NOT_APPLIED`, and `writesPerformed=false`. The returned cards were general source-index hits (including an older 2026-06-13 open-lanes document), not a revision-qualified current workboard→Graphify→ACE chain. This is a live RAG retrieval result, not a usable ACE proof or DAG execution.
- **No canonical or durable writes:** probes only read health/configuration, made bounded OAK/extraction/classification requests, and enumerated files; no PostgreSQL, Graphify, Qdrant, Valkey, Docker, or model artifact writes occurred.

Next action: the operator may reload the existing sidecar using the verified Compose project so its in-memory v2 module matches the read-only mounted checkout. Then rerun the exact OAK, LangExtract, and classifier probes. Do not delete helpers or checkpoints based on this audit; no replacement/caller audit has cleared them for retirement.
