# Legal Document Intelligence Pipeline Roadmap (2025-09-01)

## 1. Executive Summary
Establish an end-to-end legal document intelligence pipeline: OCR tiling → semantic passage splitting → embeddings (pgvector primary, optional Qdrant mirror) → multi-typed similarity/citation/hierarchy graph with PageRank & clustering → hybrid RAG retrieval endpoint → multidimensional visualization (UMAP/3D + temporal/interaction overlays) → (deferred) RL graph traversal optimization. Integrate performance profiling (CUPTI), caching, and orchestration (NATS JetStream) to achieve low-latency, observable, and incrementally optimizable behavior.

## 2. Current Architecture Snapshot ("AS IS")
| Layer | Existing Components | Status | Gaps Relevant to Pipeline |
|-------|---------------------|--------|---------------------------|
| Ingestion / OCR | (None in repo core yet) | Missing | Need GPU OCR tiler + region detection + transformer OCR.
| Passage Splitting | Basic text handling only | Missing | Need semantic / heading splitter + legal-BERT refinement.
| Embeddings | Some vector search infra placeholders, pgvector index scripts (partial) | Partial | Standardize dim, ingestion workflow, batch GPU embedding service.
| Storage (Vectors) | PostgreSQL present; pgvector indexes partially scripted; Qdrant optional not wired | Partial | Migrations w/ CHECK dim + IVFFLAT/HNSW, Qdrant sync worker.
| Graph Layer | Frontend graph visual & traversal utilities (`SoraGraphTraversal`, `GraphExplorer`) | Partial (client-side) | Need backend graph edge construction, PageRank, context expansion endpoints.
| Retrieval (RAG) | Vector search endpoints (basic), no hybrid ranking logic | Partial | Add hybrid retrieval (dense + filters), context packing, caching strategy.
| Visualization | SvelteKit components (3D/AI visualizations) | Strong UI foundation | Need UMAP offline projection + cluster coloring + export pathway.
| RL Traversal | Not implemented | Missing | Defer until graph stabilized + metrics.
| Orchestration | Tasks, some Redis usage, planned NATS | Partial | Need JetStream subjects & retry/DLQ policies.
| Caching | Redis (metrics, alerts); service worker concept | Partial | Extend to query result, neighbor prefetch, embedding batch metadata.
| Profiling | Synthetic CUPTI-backed snapshot scaffold; GPU + per-process metrics | Partial | Replace synthetic with real CUPTI Activity/Event API, correlate batch latency.
| Observability | Prometheus metrics, anomaly detection, dashboard panels | Solid base | Add per-stage histograms, queue depth anomalies, graph build latency.
| Acceleration | NVML, planned mixed precision, some WebGPU/WASM stubs | Emerging | Implement AMP in OCR & embedding, SIMD JSON parsing, quantized preview embedder.
| Serialization | JSON only | Baseline | Introduce Protobuf for embedding batches (later FlatBuffers if justified).

## 3. Target Architecture ("TO BE")
```
[OCR Tiler GPU] -> [Transformer OCR] -> [Passage Splitter + Legal-BERT Refiner]
   -> (Passages) -> [Embedding Service (Batch+AMP)] -> [pgvector + Qdrant Sync]
      -> [Graph Builder: Similarity + Citation + Hierarchy Edges]
         -> [Analytics: PageRank + Louvain Clusters + UMAP Projection]
            -> [Hybrid Retrieval API /rag] -> [Answer Synthesizer]
               -> [Frontend Visualization (3D + Temporal + Cluster Coloring)]
                    ↘ (Optional) [RL Traversal Agent]
Support Planes: { NATS JetStream | Redis Caches | Prometheus + CUPTI | Protobuf | QUIC/gRPC }
```

## 4. Detailed Pipeline Stages & Implementation Notes
### 4.1 OCR & Tiling
- GPU tiler: slice PDFs/images into adaptive tiles (dpi-aware).
- Region detector: YOLOv8 / CRAFT (tables, clauses, signatures).
- Transformer OCR: TrOCR or Nougat (legal document performance).
- Mixed precision (AMP) to leverage Tensor Cores; fall back to FP32 if accuracy dips >1.5% WER.
- Output schema: `ocr_tiles(tile_id, doc_id, page, bbox, text, confidence, block_type, created_at)`.

### 4.2 Passage Splitting & Refinement
- Baseline heuristic: headings, numbered clauses, sentence length thresholds, table segmentation.
- Legal-BERT boundary refinement (feature flagged: `LEGAL_BERT_BOUNDARY=1`).
- Unit tests: nested numbered clauses, table boundaries, unusually long recitals.
- Output schema: `passages(passage_id, doc_id, seq, text, char_start, char_end, section_type, hash)`.

### 4.3 Embedding & Storage Layer
- Standard embedding dimension (env `EMB_DIM=768` or 1536 if using larger model).
- Migrations:
  - `ALTER TABLE passages ADD COLUMN embedding vector(768);`
  - `CREATE INDEX ON passages USING ivfflat (embedding vector_cosine_ops) WITH (lists=200);` (after populating >50k rows).
  - `CHECK (embedding IS NULL OR vector_dims(embedding) = 768)`.
- Batch embedding service: adaptive batch size (monitor GPU memory; target 80% utilization ceiling).
- Qdrant mirror worker (idempotent upsert keyed by passage hash).

### 4.4 Graph Construction
- Similarity edges: top-20 cosine neighbors per passage (exclude self; threshold floor e.g. >0.55).
- Citation edges: extracted from references / cross-doc citations (future NLP extraction module).
- Hierarchy edges: document → section → clause (structural tree).
- Store in `graph_edges(edge_id, src_id, dst_id, type, weight, created_at)` with composite index `(src_id, type)`.
- PageRank: nightly + incremental mini-PR for changed nodes (delta approach).
- Cluster labeling: Louvain or Leiden; store `cluster_id` on passage record.

### 4.5 Hybrid RAG Retrieval Endpoint `/api/rag`
- Request: query text + optional filters (doc type, date range).
- Steps: embed query → vector search (pgvector) → refine with graph context expansion (neighbors / citations) → re-rank (semantic + structure weight) → context pack (token budget aware) → model generation.
- Caching key: `hash(query_embedding|filters|k)` stored in Redis with TTL (e.g. 15m) + invalidation channel `graph.update`.

### 4.6 Visualization Layer
- Offline UMAP (batch) writes to `embedding_projection(passage_id, x, y, z, cluster_id, pagerank, updated_at)` (z reserved for temporal or second reduction stage).
- Three.js or existing graph components render point cloud; color by `cluster_id`, size by `pagerank`.
- Time slider (future): show ingestion wave (temporal dimension = ingestion day or revision).

### 4.7 RL Traversal (Deferred)
- Phase 1: heuristic path scoring (coverage + legal relevance + novelty).
- Phase 2: logging trajectories (state = node features; action = next edge).
- Phase 3: PPO w/ GNN encoder after stable graph metrics.

### 4.8 Profiling & Performance Tuning
- Replace synthetic CUPTI: capture kernel & memcpy durations; map to embedding batches and OCR inference calls.
- Correlate per-batch latency vs GPU utilization; auto-adjust batch size (PID-like controller).
- Prometheus histograms: `ocr_tile_latency_seconds`, `embedding_batch_seconds`, `graph_build_duration_seconds`.

### 4.9 Caching & Client Enhancements
- Redis caches for RAG results & nearest neighbors; service worker triggers neighbor prefetch after query.
- Local fuzzy fallback (Fuse.js) over last N (e.g. 200) retrieved passages for offline refinement.

### 4.10 Orchestration (NATS JetStream)
| Subject | Payload | Purpose | Retry / DLQ |
|---------|---------|---------|-------------|
| `ocr.tiles` | tile spec | Downstream OCR processing | 5 retries → `dlq.ocr` |
| `text.passages` | passage batch | Embed scheduling | 5 retries → `dlq.passages` |
| `embed.queue` | passage ids | Batch embedding | 3 retries → `dlq.embed` |
| `graph.update` | changed ids | Recompute similarity/PR | 3 retries → `dlq.graph` |
| `rag.cache.invalidate` | key(s) | Cache coherency | No retry |

### 4.11 Serialization Upgrade Path
- Introduce Protobuf: `BatchEmbeddingRequest`, `BatchEmbeddingResult { repeated PassageEmbedding }`.
- Activate when batch JSON size > 256KB median or marshalling cost > 5ms.
- Evaluate FlatBuffers only if CPU marshalling <50% of end-to-end embedding latency target.

### 4.12 Acceleration & Edge
- SIMD JSON ingestion (simdjson via cgo or Node native addon for pre-processing large JSON docs).
- WebGPU micro-embedder (quantized 4-bit) for client preview clustering.
- QUIC/gRPC bridge for low-latency graph expansion (optional future).

### 4.13 Observability Extensions
- Add queue depth gauges: `nats_subject_queue_length{subject="embed.queue"}`.
- Anomaly detection on embedding throughput & OCR backlog using existing Welford z-score infra.
- Correlate alert events with profiling snapshots (join by timestamp window ±2s).

## 5. Gap Analysis Matrix
| Capability | Current | Target | Delta Actions |
|------------|---------|--------|---------------|
| OCR | None | GPU tiler + transformer OCR | Implement tiler, select OCR model, AMP, tile schema.
| Passage Split | None | Semantic + BERT refinement | Build splitter, feature flag refinement, tests.
| Embeddings | Ad hoc | Batched GPU + pgvector | Migration + service + batch autotune.
| Graph | Frontend only | Backend edges + PageRank | Edge job, PageRank scheduler, endpoints.
| RAG | Basic vector | Hybrid + context packing | Implement pipeline & cache layer.
| Visualization | UI 3D base | UMAP + clusters | Offline job + projection table.
| RL | None | Heuristic → PPO | Defer until stable metrics.
| Profiling | Synthetic | Real CUPTI | Activity API integration.
| Caching | Metrics only | Query + neighbor | Redis keys + invalidation subjects.
| Orchestration | Scripts | JetStream pipeline | Define subjects, consumers, DLQ.
| Serialization | JSON | Protobuf (option) | Define schema, gating metrics.

## 6. Prioritized Next Steps (Actionable)
1. Passage Pipeline MVP (OCR tiler skeleton + splitter + tests).
2. Embedding layer (migrations, service, batch embedding, dimension guard).
3. Graph construction job (similarity edges + PageRank baseline).
4. Hybrid RAG endpoint + caching key strategy.
5. UMAP offline job + projection table + simple visualization overlay.
6. CUPTI real integration & batch latency correlation.
7. JetStream subject wiring + DLQ flows.
8. Protobuf embedding batches (conditional activation).
9. RL traversal prototype (after stable metrics).

## 7. 3-Day Sprint (Immediate Targets)
| Day | Goals | Success Criteria |
|-----|-------|------------------|
| 1 | OCR tiler skeleton, region detector stub, passage splitter, pgvector migrations | Migrations applied; passage splitter test suite passes; sample doc → passages stored. |
| 2 | Embedding service (batch), populate embeddings, similarity edge job, initial PageRank | >10k passages embedded; top-20 edges computed; PR scores persisted. |
| 3 | /api/rag hybrid retrieval, Redis cache, UMAP job stub + export, profiling batch metrics logged | RAG returns contextual answer < 1.2s P95 on sample set; UMAP table filled; profiling shows batch latency + GPU util correlation. |

## 8. Dependencies & Guards
- Uniform embed dimension enforced by DB CHECK + service assert.
- Edge cap (top-20) + weight threshold to avoid combinatorial explosion.
- Batch size autotuner clamp (max memory <80% of VRAM; min throughput guard).
- Feature flags: `LEGAL_BERT_BOUNDARY`, `ENABLE_QDRANT_SYNC`, `ENABLE_CUPTI_REAL`.
- Retry limit & DLQ for each JetStream subject; manual inspection dashboard.
- Graph rebuild partial (delta) only for changed passages to limit cost.

## 9. Optional Quick Wins
- `GET /passage/:id/neighbors` using vector + graph edges.
- Precompute Louvain cluster id for visualization coloring (no UMAP dependency).
- Add `cluster_id` & `pagerank` columns directly to `passages` for single-query enrichment.
- Lightweight local Fuse.js fuzzy over last 200 passages for instant UI refinement.

## 10. Risk & Mitigation
| Risk | Impact | Mitigation |
|------|--------|------------|
| OCR accuracy variance | Low-quality text downstream | Confidence thresholds + reprocess low-confidence tiles. |
| Embedding dimension drift | Query/runtime errors | Enforce CHECK + startup validation. |
| Graph blowup | Memory / perf issues | Top-k cap + periodic pruning of low-weight edges. |
| CUPTI integration instability | Service crashes | Feature flag + fallback to synthetic snapshot. |
| UMAP runtime cost | Slow deploy | Offline batch only + incremental updates. |
| RL premature deployment | Wasted cycles | Defer until KPIs stable. |

## 11. Metrics & KPIs
| Stage | KPI | Target (Initial) |
|-------|-----|------------------|
| OCR | WER | <5% on validation subset |
| Passage Split | Boundary F1 | >0.92 |
| Embedding | Batch Throughput | >2k tokens/sec/GPU |
| Graph | Edge Build Time | <30m nightly / <5s delta |
| Retrieval | P95 Latency | <1.2s (k=12 context) |
| RAG Quality | Answer Relevance (human) | >85% accurate references |
| Visualization | Projection Refresh | <10m batch |
| Profiling | GPU Utilization | 70–85% sustained during embedding |

## 12. Implementation Order Justification
Focus first on ingestion → embeddings → graph → retrieval to unlock user-visible value; defer performance micro-optimizations (CUPTI detail, RL) until baseline utility is validated and telemetry informs scaling.

## 13. Next Action (Decision Needed)
Select initial implementation focus: (A) Generate pgvector migration & embedding service skeleton OR (B) OCR tiler + passage splitter scaffolding. Provide choice to proceed in-code immediately.

---
Generated 2025-09-01 for alignment with current repo architecture and forward planning.

## 14. Technology & Execution Strategy Addendum (PyTorch vs TF.js, Compute Placement)
This addendum codifies technology selection and execution placement decisions for the next 2‑week acceleration window.

### 14.1 Framework Selection (Insertion for $SELECTION_PLACEHOLDER$)

Primary rule: All throughput‑critical or accuracy‑sensitive workloads run server‑side on PyTorch; only latency‑sensitive micro‑classification or offline UX hints run in browser with TensorFlow.js / WebGPU using tiny distilled or quantized models.

| Use Case | PyTorch (Server GPU) | TensorFlow.js / WebGPU (Browser) | Decision |
|----------|---------------------|----------------------------------|----------|
| Heavy OCR (TrOCR / Nougat / PaddleOCR) | Full CUDA, AMP, tensor cores, layout models | WASM/Tesseract slow; limited layout fidelity | PyTorch |
| Light ad‑hoc snippet OCR (small pasted image) | Possible but overkill | Feasible (tesseract.js) for ≤2 small images | Browser (optional) |
| High‑throughput embeddings (Legal-BERT / nomic / Gemma distill) | Batched FP16 / INT8, torch.compile, Triton upgrade path | Memory + perf constraints | PyTorch |
| Similarity graph build (Faiss / ANN) | Native libs, multi-GPU scaling | Not suitable | PyTorch |
| RL traversal (PPO + GNN) | PyTorch Geometric / RLlib | Not feasible | PyTorch (deferred) |
| Lightweight semantic re-rank / filter | Can share embedding GPU | Distilled classifier (<5 MB) for instant UI | Dual (prefer browser if offline) |
| Client offline preview embeddings | Optional small model gateway | Tiny 4–8 bit quantized micro-embedder only | Browser (experimental) |
| On-device privacy-sensitive hinting | N/A | Runs fully local | Browser (when required) |

Rationale:
- Throughput & cost: GPU batching + AMP yields >5–8× speedup vs browser.
- Accuracy: Production OCR & embeddings rely on models not practical in browser memory limits.
- Latency UX: Small classifiers client-side remove extra round-trips for quick tag/filter feedback.
- Progressive enhancement: Fallback to server when WebGPU unavailable.
- Maintainability: Single authoritative model weights (server) with periodically distilled mini variants for browser.

Guardrails:
- Distill browser models only when end-to-end latency gain >80 ms or offline requirement explicit.
- Enforce version tag (MODEL_SHA) to invalidate stale browser caches.
- Instrument both paths; disable browser model if divergence in classification F1 >2% absolute.

Upgrade Triggers:
- Introduce Triton Inference Server when >2 distinct GPU models concurrently saturated.
- Add INT8 quantization after retrieval recall benchmark shows <1% loss.

This table anchors subsequent compute placement (14.2) and optimization triggers (14.5).

Rule of Thumb: Heavy OCR & embeddings always server-side (PyTorch). Lightweight classification / filtering or UI semantic hinting may run client-side (TF.js/WebGPU) for latency & offline UX.

### 14.2 Compute Placement Strategy
| Layer | Placement | Rationale |
|-------|-----------|-----------|
| OCR tiling & inference | Server GPU | Batch + AMP + consistent accuracy |
| Passage splitting (heuristic + BERT refinement) | Server CPU/GPU (BERT) | Mixed text ops + occasional model calls |
| Embedding generation | Server GPU | High throughput, tensor cores |
| Graph construction (similarity/PageRank) | Server CPU (parallel) + optional GPU (Faiss) | Memory locality + existing DB proximity |
| Hybrid retrieval scoring | Server (CPU+GPU optional) | Combine vector + structural contextualization |
| Client-side fuzzy / cache search | Browser (IndexedDB + Fuse.js/Loki.js) | Instant UI interactions offline |
| Visualization (UMAP render / 3D) | Server (precompute) + Browser (Three.js) | Heavy reduction offline, interactive display client |
| RL traversal (deferred) | Server GPU | Requires GNN + PPO training |

### 14.3 Multicore & Caching Guidelines
**Python GPU Workers**: Use multiprocessing or Dask for CPU-bound pre/post; enable `pin_memory=True` and async CUDA streams; maintain dynamic batch size controller (target 70–85% GPU util).
**Caching Layers**:
- Redis: hot query & neighbor cache; embedding batch metadata; job status.
- MinIO: binary raw artifacts (PDFs, page images, tile crops).
- Postgres (JSONB + pgvector): canonical passage & vector store.
- Qdrant: fast ANN mirror (eventual consistency worker).
- Browser (Loki.js / Fuse.js / IndexedDB): local recent passage & neighbor sets; offline semantic filtering.

### 14.4 SIMD / Serialization / Transport Stack
- SIMD parsing (simdjson) for OCR metadata ingestion & large JSON batches.
- Protobuf first binary step for embedding batches (`BatchEmbeddingResult`).
- FlatBuffers only if profiling shows >5ms marshalling overhead or >10% of request latency.
- QUIC or gRPC for low-latency embedding & graph expansion microservices; REST + SSE/WebSocket for browser streaming.

### 14.5 GPU Parallelism & Throughput Tuning
| Optimization | Action | Trigger Metric |
|--------------|--------|----------------|
| AMP / FP16 | Enable `torch.cuda.amp.autocast()` | Default unless WER regression >1.5% |
| INT8 quantization (embeddings) | Calibrate + quantize model | If latency > target & accuracy loss <1% retrieval recall |
| Batch size expansion | Gradually double until util plateau or OOM | GPU util <70% sustained |
| TorchScript / torch.compile | Compile stable models | Hot path stabilized, >5% predicted speedup |
| Triton Inference Server | Externalize model hosting | Multiple models or >1 GPU scaling needed |

### 14.6 Condensed End-to-End Pipeline (Operational View)
1. Upload: SvelteKit → presigned MinIO → enqueue job (RabbitMQ / NATS JetStream).
2. OCR Pipeline: YOLO/CRAFT region detect → TrOCR batch OCR (AMP) → assemble text.
3. Passage Processing: heuristic split → (optional) legal-BERT boundary refine.
4. Embedding: batch GPU encode → store vectors (pgvector) → emit `embed.queue` completion event.
5. Graph Build: periodic / delta similarity edges (top-20) → PageRank + cluster assignment.
6. Retrieval (/api/rag): embed query → hybrid vector + graph context expansion → re-rank → context pack → Gemma3 answer generation.
7. Visualization: offline UMAP + cluster export → Three.js interactive cloud (pagerank = size, cluster = color).
8. (Deferred) RL Agent: path optimization using passage graph & feedback signals.

### 14.7 Two-Week Phase Plan (Supersets of 3-Day Sprint)
| Phase | Goal | Output Artifacts |
|-------|------|------------------|
| 0 (Done) | Core infra online | Postgres+pgvector, Redis, MinIO, Gemma3, basic metrics |
| 1 (Done) | CPU OCR ingest validation | Text stored in Postgres (no vectors) |
| 2 | GPU OCR + Embeddings | OCR tiler service; embeddings column populated; IVFFLAT index created |
| 3 | /api/rag Hybrid Retrieval | Endpoint, caching layer, query metrics |
| 4 | Visualization | UMAP projection table + JSON export + initial 3D render |
| 5 | RL Prototype (Optional) | Heuristic traversal API stub, logging schema |

### 14.8 Example Python Worker (Illustrative)
```python
def process_document(doc_id, file_path):
   img = Image.open(file_path)
   tiles = tile_image(img)
   ocr_texts = ocr_tiles(tiles)  # Batched OCR (AMP)
   full_text = "\n".join(ocr_texts)

   passages = split_passages(full_text)  # Heuristic + optional BERT
   embeddings = embed_passages(passages)  # GPU batched embeddings

   for passage, emb in zip(passages, embeddings):
      db.execute(
         "INSERT INTO evidence (case_id, text, metadata, embedding) VALUES (%s, %s, %s, %s)",
         (doc_id, passage, {}, emb)
      )
```

### 14.9 Alignment with Earlier Sections
All additions reinforce Sections 4–8 without altering priorities: ingestion → embeddings → graph → retrieval remains the critical path; addendum simply formalizes compute placement, performance envelopes, and scaling triggers.

### 14.10 Decision Reminder
Please confirm initial build focus: (A) pgvector migrations + embedding service skeleton, (B) OCR tiler + passage splitter scaffolding, (C) similarity edge + PageRank job, or (D) /api/rag hybrid endpoint.

### 14.11 Value vs Effort Matrix (A–D)
| Initiative | Description | Effort* | Leverage / Value | Direct Dependencies | Unblocks | Primary KPIs Impacted | Key Risks | Net Recommendation |
|------------|-------------|---------|------------------|---------------------|----------|------------------------|-----------|--------------------|
| A | pgvector migrations + embedding service skeleton (batch, dim guard) | Low | High (foundation for retrieval, ranking, graph weights, caching correctness) | Postgres + pgvector extension | B (stores text vectors), C (needs embeddings), D (needs query embeddings) | Embedding Throughput, Retrieval Latency, Graph Edge Quality | Schema drift if dimension changes; premature index creation cost | Do first |
| B | OCR tiler + passage splitter (heuristic + stubs) | Medium | High (unlocks raw textual corpus generation feeding embeddings) | A not required to start, but benefits once embeddings live | A (embedding ingestion), C (graph density), D (content breadth) | OCR WER, Passage Boundary F1, Ingestion Throughput | Model selection churn; tile over-segmentation yields noise | Start immediately after A (can parallelize late stage) |
| C | Similarity edge build + baseline PageRank | Medium‑High (needs enough data) | Medium initially (value scales with corpus size) | A (vectors), B (corpus critical mass) | D (context expansion), Visualization (cluster coloring), Future RL | Edge Build Time, Retrieval Relevance, Pagerank Stability | Sparse graph if run too early; compute waste | Defer until ≥10k passages embedded |
| D | Hybrid /api/rag endpoint (vector + graph expansion + re-rank) | Medium | High user-visible value; depends on A (mandatory) & improved by C | A (required), C (enhanced context), Partial without C | User adoption KPIs, Retrieval P95 Latency, Answer Relevance | Shipping too early without graph lowers initial quality; cache invalidation bugs | Implement right after minimal C (or stub expansion) |

*Effort scale (relative): Low (<1 day dev + review), Medium (1–2 days), Medium‑High (2–4 days).

Decision Logic:
1. A first — establishes invariant (embedding dim) & enables all downstream vectorized operations.
2. B second — produces the content that populates embeddings; early feedback on passage heuristics.
3. Short C spike (infrastructure + similarity job) once ≥ threshold corpus density (e.g. 10k passages) to avoid premature optimization.
4. D released after A; initially with vector-only + simple neighbor expansion; upgrade to full hybrid once C yields stable edges & PageRank.

Execution Sequencing (Practical): A (Day 0) → B (Days 0–2 overlap after A’s migration applied) → Light C (Day 3+) → D (Day 3/4) in parallel with C tuning.

Risk Mitigations:
- Gate enabling of PageRank / neighbor expansion behind feature flag `GRAPH_HYBRID_CONTEXT=1` until edge density KPI (>80% nodes having ≥5 edges) met.
- Delay IVFFLAT index creation in A until row count >50k to reduce initial build time.
- Maintain a schema version in `embedding_metadata` table to prevent stale embeddings after model swap.

### 14.12 When the WASM Engine Matters (Activation Criteria & ROI)
Purpose: Clarify the precise point at which the client-side / edge WebAssembly (WASM) parsing & micro‑embedding components add net positive value, avoiding premature complexity.

Activation Window: AFTER A + B are complete and the system begins sustained ingestion of heterogeneous JSON / manifest metadata or large client-side documents prior to upload.

Primary WASM Use Cases (Post A+B):
1. Client Pre‑Parsing: Chunk & normalize large JSON / manifest files (e.g. evidence metadata, docket exports) before network transfer to reduce payload size & server CPU time.
2. Lightweight Feature Extraction: Compute cheap lexical stats (token counts, simple hash fingerprints) to assist server-side de‑duplication and batching heuristics.
3. Experimental Micro‑Embedder: Optional quantized 4‑bit preview embeddings for immediate local clustering preview (non-authoritative; server overwrites with canonical embeddings later).

Deferral Justification (Why Not Before A+B):
- Without embeddings (A) and passages (B), early WASM parsing yields little actionable pipeline progress.
- Early introduction risks API churn and maintenance overhead before upstream schemas stabilize.

Enabling Criteria (All TRUE to proceed):
- Corpus growth rate > N documents/day where server-side pre-processing queue shows sustained CPU contention (>60% utilization for >10 min windows) OR average upload-to-available latency > target (e.g. 30s P95).
- Repeated large JSON manifest uploads (>2MB each) form ≥25% of ingestion volume.
- Network bandwidth or server CPU parsing shows up in profiling as ≥10% of ingestion critical path.

Instrumentation Requirements (before enabling):
- Add Prometheus metrics: `ingest_manifest_bytes_total`, `ingest_manifest_parse_seconds`, client timing beacon for `wasm_parse_ms`.
- Log structured field `client_preparsed=true` to compare latency delta.

Rollout Plan:
Phase 1: Ship WASM parser (pure parsing + stats) behind feature flag `ENABLE_WASM_PARSE=1`.
Phase 2: Add micro‑embedder (quantized) with safeguard: only use for UI preview; never persisted.
Phase 3: Progressive enhancement: if WASM unavailable, fallback to server parse path with identical canonical chunking algorithm.

Security / Integrity Guards:
- Include SHA-256 of client-parsed manifest; server recomputes and compares — mismatch triggers fallback & audit log.
- Reject client-provided micro‑embeddings for storage; treat as hint only.

Failure & Fallback Strategy:
- If client parse time > server median parse time (telemetry sliding window) for 3 consecutive samples, auto-disable feature via remote config.
- If mismatch rate (hash compare) >0.5%, escalate alert & disable until investigated.

Success KPIs (Post Enable):
| KPI | Target Improvement |
|-----|--------------------|
| Upload→Passage Availability P95 | -15–25% |
| Server CPU parse time share | -30% |
| Mean payload size (compressed) | -10–20% |
| Early clustering preview latency | <500 ms local |

Decommission Criteria:
- If after 2 weeks improvement in any primary ingestion latency KPI <5%, and maintenance cost (issues per week) > threshold, retire WASM path.

Summary: WASM activation is an optimization layer — intentionally gated after foundational vector & passage layers (A+B) to ensure measurable ROI and avoid premature complexity.

