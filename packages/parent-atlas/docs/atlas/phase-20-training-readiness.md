# Phase 20 — Training Readiness Report
Date: 2026-05-29

Summary
-------
This report assesses readiness for Phase 20 (training and GPU sidecar readiness) and maps the stack cleanly across three layers: durable storage & analytics (Postgres / DuckDB), retrieval & vector memory (Qdrant / Neo4j / Redis), and GPU tensor compute (CUDA / TensorRT / PyTorch). It also recommends partitioning, text-indexing (`pg_trgm`) fields, LoRA target modules, and deployment choices (llama-server / vLLM / TensorRT-LLM).

Training is downstream of the current live contract:
BM25 + concept activation -> deeds/engram optional adapter ->
XGBoost formal reranker -> Neo4j contextual trees + HyperRAG packet RPC ->
Autoencoder / SOM latent topology -> native GEMM deferred.

Decision docs live separately:
- `docs/atlas/xgboost-reranker-contract.md`
- `docs/atlas/native-gemm-deferral.md`

Inputs considered
---------------
- `.opencode/outcome-ledger.ndjson` — canonical outcome trace ledger (append-only). (expected)
- `memory/rewards/tool-performance.json` — aggregated tool-level rewards (present)
- `memory/rewards/sourceRef-performance.json` — sourceRef-level stats (present)
- `memory/rewards/cluster-performance.json` — cluster stats (present)
- `.tmp/phase19b-join-key-discovery.json` — Phase19B join-key discovery (present)
- `.tmp/ast-neo4j-dryrun.json` (optional)
- `.tmp/vector64-dataset.jsonl` (optional)

If any input above is missing, run the relevant dry-run scripts to generate them before heavy training work.

1) Postgres / Parent Atlas (durable record + analytics)
---------------------------------------------------
Role: ground-truth, long-term events, and SQL analytics. Use Postgres 18 (AIO) where available.

Suggested schema targets for Parent Atlas:
- `glyph_records` — keep immutable metadata + vector references (vectorId, qdrant_id)
- `outcome_ledger` — append-only outcome traces (store compact structured traces; do NOT store freeform CoT)
- `context_timeline` — per-case event timeline (partitioned)
- `chunk_hit_log` — evidence hit logs (partitioned)
- `search_analytics` — search query signals (partitioned)
- `tool_call_traces` — detailed tool usage traces (partitioned)

Partitioning recommendations
- Partition large append-only tables by time or hash:
  - monthly partitioning on `created_at` for retention-friendly queries
  - or `case_id` / `user_id` HASH partition if queries are case-scoped and evenly distributed
- Implementation caveat: use declarative partitioning with constraint-exclusion and ensure `pg_repack` / VACUUM maintenance in place.

pg_trgm (fuzzy search) — suggested fields
- `summary_cards.summary` → `GIN (summary gin_trgm_ops)`
- `source_refs.path` → fast fuzzy lookup for `sourceRef` variants
- `routes.name` or `route_path` → tolerant route-name matching
- `cards.title` and `cards.text` → near-duplicate detection

Storage policy: what to persist vs what to redact
- Persist: structured traces (intent, toolUsed, sourceRefs[], decision, outcome, reward, graphVersion, timestamps)
- Do NOT persist: hidden chain-of-thought, unverified hallucinated rationale, raw model internals (attention matrices)

2) DuckDB MapReduce for reward attribution & analytics
----------------------------------------------------
Role: fast, local SQL MapReduce style analytics on `.ndjson` or exported tables.

Example jobs (run on `.opencode/outcome-ledger.ndjson` or exported Postgres snapshot):
- Tool performance: `SELECT tool, COUNT(*) AS count, AVG(reward) AS avg_reward FROM outcome_ledger GROUP BY tool;`
- SourceRef performance: group by normalized sourceRef
- Cluster performance: join `cards` → cluster and aggregate reward sums

Execution notes
- Use DuckDB for developer/experimentation runs and for nightly batch MapReduce; schedule periodic exports from Postgres or run directly against `.ndjson` using DuckDB's `read_ndjson()` convenience.
- For very large corpus or GPU-accelerated ETL, consider RAPIDS/cuDF pipelines later.

3) GPU tensor compute lane (CUDA / PyTorch / TensorRT)
---------------------------------------------------
Role: efficient encoding (768→64), batch similarity, autoencoder training, SOM training, and reward‑score acceleration.

Core functions to implement in the CUDA sidecar
- `encode768to64(float32[768]) -> float32[64]` — batched encoder (PyTorch→TorchScript/TensorRT)
- `similarityBatch(query[768], candidates[N,768]) -> topK indices+scores` — GPU kernel, use cuBLAS or custom fused kernel
- `somTrainStep(latents[64], params) -> centroids` — SOM training step (PyTorch/CUDA)
- `rewardScoreBatch(features, weights) -> scores` — custom CUDA kernel for reward re-scoring

Deployment notes
- Prototype locally with `llama-server/llama.cpp` (GGUF) for Gemma4 on workstation.
- vLLM for high-throughput multi-user serving when concurrency matters.
- TensorRT-LLM for Nvidia-optimized production when engine-building is acceptable and model is supported.

4) Model internals & LoRA recommendations
----------------------------------------
What to fine-tune (LoRA/QLoRA targets)
- Attention projections: `q_proj`, `k_proj`, `v_proj`, `o_proj` (prime targets for tool-selection behavior)
- Optional MLP `gate_proj`/`up_proj`/`down_proj` if reasoning style needs tuning later

Training signal
- Use structured traces as supervised targets (intent + candidate tools + chosen tool + chosen sourceRefs + concise explanation). Avoid training on freeform CoT.

5) Retrieval & memory mapping
-----------------------------
- Qdrant remains the 768-d semantic store. Keep embeddings at 768 for retrieval fidelity.
- Sidecar fast GPU prefilter: run `similarityBatch` to produce top-K candidates, then re-query Qdrant or fetch associated chunks for ACE context.
- Neo4j for relationship/topology queries (authority, PageRank); use Qdrant+Neo4j blended rerank.
- Redis for hot ACE cache and short‑lived prior-answer caching.

6) Short recommendations (llama-server vs vLLM vs TensorRT-LLM)
-----------------------------------------------------------
- Local dev / workstation: **llama-server / llama.cpp** (GGUF, quantized) — easiest to iterate.
- Production high-throughput: **vLLM** — continuous batching, prefix caching, great throughput.
- Maximum Nvidia-optimized performance: **TensorRT-LLM** — build engines, best latency/throughput on supported models.

7) Training-readiness checklist (automatable)
--------------------------------------------
- [ ] Export recent `outcome_ledger` snapshot to DuckDB or Postgres staging table.
- [ ] Ensure `memory/rewards/*.json` aggregates exist and align with ledger rows.
- [ ] Normalize `sourceRefs` (run Phase19B normalization) and confirm top unmatched list is small.
- [ ] Identify partitioning key for `outcome_ledger` (monthly `created_at` or `case_id` hash).
- [ ] Decide LoRA targets and collect 10k+ structured training examples from traces.
- [ ] Prepare GPU sidecar CI: small encode/sim benchmark harness.

8) Immediate next actions (Phase 20 sprint start)
-------------------------------------------------
1. Run DuckDB MapReduce on `.opencode/outcome-ledger.ndjson` to produce tool/source/cluster aggregates (attach results).
2. Finalize Postgres partitioning plan for `outcome_ledger` and `chunk_hit_log` (monthly vs hash).
3. Prototype `encode768to64()` using a small PyTorch autoencoder and export to TorchScript/TensorRT.
4. Implement a gRPC/MCP proto for the CUDA sidecar (`EncodeRequest/EncodeResponse`, `SimilarityRequest/SimilarityResponse`).
5. Collect and verify 10k+ training-ready traces (structured only) for LoRA tuning.

Appendix — What not to store
----------------------------
- No chain-of-thought, no raw attention maps, no verbatim internal hidden states. Store only structured summaries and decisions.

Deliverable
-----------
I can produce runnable artifacts next: (A) a DuckDB script for reward aggregation, (B) a PyTorch prototype autoencoder `encode768to64`, and (C) an MCP/gRPC proto + TypeScript client scaffold. Which would you like first?
