# Parent Atlas — Storage & Runtime Decision

Date: 2026-05-29

Summary
-------
This document records storage roles, recommended services, tooling, and quick runtime checks for the Parent Atlas architecture. It reflects the current choices:
- Postgres 18 + `pgvector` as the durable source-of-truth and structured/vector layer.
- Qdrant retained for large-scale ANN/production vector memory.
- Neo4j used for GraphRAG / relationship joins.
- DuckDB, Arrow/Parquet for analytics and zero-copy movement.
- LanceDB as an offline/experiment vector lake.
- Langfuse for LLM & tool observability.
- LangGraph for durable agent orchestration.
- spectra-g / Engram is the preferred optional memory adapter lane.
- Tiny-Engram stays experimental only and is not the canonical contract.

Related decisions now live in separate docs:
- XGBoost formal reranker contract: `docs/atlas/xgboost-reranker-contract.md`
- Native GEMM / pybind11 deferral: `docs/atlas/native-gemm-deferral.md`

Two-lane model
--------------
- Cold store: original files, archives, and large raw artifacts stay here.
- Warm index: packets/cards/summaries stay small and point back to cold originals.
- Hot cache: only active task memory and recent retrieval state live here.
- Queue: work waiting to be processed, not source truth.
- Qdrant: semantic lookup plus payload filters for traversal and ANN recall.
- Postgres: truth table, packet registry, and durable joins.
- RabbitMQ: promotion and ingest work queue with separate lanes for urgent, normal, bulk, and dead-letter traffic.
- SeaweedFS: cold original object store for large artifacts that have already been packetized and verified.
- See also: [Dual-Lane Hot Brain, Cold Queue](</C:/Users/james/Videos/deeds-web-app/docs/architecture/dual-lane-hot-brain-cold-queue.md>)

Caveman rule
-----------
Postgres stores truth.
Qdrant finds meaning fast.
Neo4j proves relationships.
DuckDB audits joins.
Arrow moves columns fast.
LanceDB stores offline vectors.
Langfuse watches the agent.
LangGraph runs the workflow.

Quick Model Endpoint Health Checks (run on this host)
-----------------------------------------------------
Ollama (:11434)

Run:
```
curl -s http://localhost:11434/api/tags 2>&1 | grep -o '"name":"[^"']*"' | head -20
```
Observed (snippet):
- "name":"gemma4-rotorquant:latest"
- "name":"embeddinggemma:latest"
- "name":"ibm/granite-docling:258m"
- "name":"nomic-embed-text:latest"

llama-server / TurboQuant (:8090) — OpenAI-compatible

Run:
```
curl -s http://127.0.0.1:8090/v1/models | head
```
Observed (snippet):
- `gemma4-legal.gguf` listed as available (OpenAI-compatible models endpoint responded)

YorHA / local OpenAI facade (:5173)

Run:
```
curl -s http://127.0.0.1:5173/api/v1/models | head
```
Observed (snippet): contains `gemma4-agent`, `gemma4-raw`, `yorha-legal`, `gemma4-rotorquant:latest`, etc.

Notes: in this environment the Ollama tags endpoint returned model names, and both `:8090` and `:5173` are responding locally.

Postgres 18 + `pgvector` (recommended role)
-------------------------------------------
Rationale:
- Postgres 18 adds modern features (async I/O, `uuidv7()` support) useful for event/trace tables and scalable writes.
- `pgvector` provides ANN search inside Postgres and supports HNSW indexes, enabling co-located vector+metadata queries and transactional updates.

Suggested Postgres responsibilities (durable truth + vectors):
- `glyph_records` (event/glyph ledger)
- `summary_cards` (short summaries + embeddings)
- `scenario_cache` (embeddings + small vectors)
- `outcome_traces` (decision/outcome ledger)
- `reward_attribution` (reward traces + metadata)
- `promotion_states` (promotion history)
- `sourceRefs` (canonical source references)

Use `pgvector` for:
- small/medium structured embeddings
- `scenario_cache`
- `summary_cards`
- recommendations
- metadata-bound vectors where transactional guarantees matter
- warm packet mirrors that need durable joins back to `sourceRef` / `feature_id`

Qdrant (retained for large-scale ANN)
-------------------------------------
Rationale:
- Qdrant is optimized for large-scale vector stores and production ANN retrieval with payload filters.
- Keep Qdrant for heavy, large-dataset retrieval use-cases (e.g., `codebase_chunks_768`) and traversal surfaces where payload filtering matters.
- Treat quantization, multi-stage retrieval, and hybrid search as storage-efficiency and recall tools, not as a replacement for the durable ledger.
- Keep quaternion / SOM / XGBoost / topology math outside Qdrant; compute those transforms in the CUDA, PyTorch, or LibTorch lane, then persist the resulting metadata or vectors back into the index.

Suggested Qdrant responsibilities:
- `codebase_chunks_768` (large code chunk vectors)
- fast ANN retrieval for production query paths
- payload filter-powered retrieval
- production vector memory where high throughput and filtering are priority

DuckDB, Arrow, Parquet (analytics & export)
-------------------------------------------
Rationale:
- Arrow/Parquet provide fast columnar I/O; DuckDB provides zero-install analytical queries over Arrow/Parquet/JSONL.

Suggested flow:
```
NDJSON exports → DuckDB (ad-hoc joins) → Arrow/Parquet → Python/RAPIDS (training/autoencoder) → LanceDB/Parquet
```
Use Arrow for zero-copy exchanges when moving large columnar data to GPU (RAPIDS/cuDF) or to training pipelines.

LanceDB (offline vector lake)
-----------------------------
Role:
- An offline, local vector lake for experiments, portable exports, and training-data staging.
- Use for offline vector64 experiments and for staging training datasets (autoencoder, SOM).

Langfuse (observability)
-------------------------
Role:
- Trace LLM calls, tool calls, prompt versions, latencies, token counts, rewards, and outcome events.
- Ideal for outcome-ledger integration: capture Gemma4/Gemma4-decisions → Langfuse trace → `outcome-ledger.ndjson` → DuckDB reward aggregation.

LangGraph (orchestration)
-------------------------
Role:
- Orchestrate durable agent workflows (scenario lookup → retrieval → tool call → LLM generation → outcome storage → memory promotion).
- Do not give LangGraph direct DB fat interfaces; prefer service/MCP tool calls as the boundary.

Recommended stack (Parent Atlas)
--------------------------------
Runtime:
- Redis/Valkey (fast cache/coordination)
- Postgres 18 + `pgvector` (durable truth + small/transactional vectors)
- Qdrant (large ANN / production vector memory)
- Neo4j (GraphRAG / explicit relationships)
- Gemma4 llama-server(s) behind facades (Ollama, YorHA)
- MCP tools/service layer for DB access and business logic
- spectra-g / Engram (optional low-trust memory adapter)

Analytics / Audit:
- DuckDB + Arrow/Parquet for exports and fast joins
- Langfuse for LLM observability
- CouchDB for archival JSON replication (optional archive store)
- Adapter boundary note: TurboVec, LlamaIndex, LangChain, and LangGraph are adapters only; do not let them become canonical storage or write paths.

Experimentation / Training:
- LanceDB for offline vector lake and training-data staging
- Python worker + RAPIDS/cuDF + PyTorch autoencoder + SOM for GPU experiments

Practical Recommendations & Next Steps
-------------------------------------
- Run `graphify:semantic` and rebuild `codebase_chunks_768` before large backfill jobs.
- Keep Qdrant for `codebase_chunks_768` and heavy ANN; use `pgvector` for transactional, metadata-bound vectors.
- Add a small QA pass after any mass-enrich (backfill) to sample 200 files and compare `qdrant_tags` with `extractLegalTags` outputs.
- Use Arrow/Parquet as the canonical export format for DuckDB analytic passes and for training ingestion.
- Add Langfuse instrumentation around Gemma4 calls to capture prompt versions, tokens, and outcomes for reward aggregation.
- Use LangGraph to orchestrate workflows but route storage calls through MCP/HTTP services to centralize DB logic.
- Keep native GEMM / pybind11 deferred until signal quality and reranker gates justify it.
- Keep the XGBoost formal reranker contract separate from this storage note; storage owns the tiers, not the ranking decision.

Commands: quick checks you can run locally
-----------------------------------------
Check Ollama tags (port 11434):
```
curl -s http://localhost:11434/api/tags | jq -r '.[].name' | head -20
```
Check llama-server / TurboQuant (OpenAI-compatible, port 8090):
```
curl -s http://127.0.0.1:8090/v1/models | jq '.' | head
```
Check YorHA facade (port 5173):
```
curl -s http://127.0.0.1:5173/api/v1/models | jq -r '.data[].id' | head -20
```

Appendix — Parent Atlas architecture (one-liner map)
---------------------------------------------------
Runtime: Redis / Postgres18+pgvector / Qdrant / Neo4j / Gemma4 llama-server / MCP tools
Analytics: DuckDB / Arrow / Parquet / Langfuse
Experiment: LanceDB / PyTorch / RAPIDS


