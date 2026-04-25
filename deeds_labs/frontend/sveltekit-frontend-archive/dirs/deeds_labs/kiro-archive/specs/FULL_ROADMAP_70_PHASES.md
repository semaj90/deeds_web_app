# Full Legal AI Roadmap: 70 Phases to Agentic Prosecutor/Judge Engines

## Executive Summary

This document maps the complete evolution of a legal AI system from evidence ingestion through agentic reasoning engines. It covers:

- **Phases 1–70** with dependencies and upgrade triggers
- **Legal Model Format (LMF)** – Dual JSON-LAW + LAW-CBOR for all data exchange
- **Compliance gates** – Legal safety checkpoints at each phase
- **Interoperability** – Future-proof versioning and API contracts
- **GPU acceleration** – TensorRT, Triton, quantization roadmap

---

## Architecture: Hybrid Python Gateway + Go Inference

**Selected:** C) Hybrid: Python gateway → Go inference

See `.kiro/specs/HYBRID_ARCHITECTURE.md` for complete architecture details.

### Key Components

- **Python FastAPI Gateway (Port 8003)** – REST API, validation, orchestration
- **Go Inference Server (Port 50051)** – gRPC, embeddings, vector search, reranking, LLM
- **Go QUIC Gateway (Port 4433)** – Streaming, low-latency communication

### Performance

- Non-streaming: 203–714ms
- Streaming (first token): 250–350ms
- Throughput: 50–100 req/s (Python), 100–200 inf/s (Go)

---

## Part 1: Legal Model Format (LMF)

### Overview

All legal AI pipelines exchange data using a **dual-format standard**:

1. **JSON-LAW** – Human-readable, debuggable, audit-friendly
2. **LAW-CBOR** – Binary, GPU-optimized, high-throughput

### JSON-LAW Schema

```json
{
  "lmf_version": "1.0",
  "format": "json-law",
  "timestamp": "2025-11-23T00:00:00Z",
  "legal_object": {
    "type": "case|statute|fact|event|judgment|evidence",
    "id": "uuid",
    "jurisdiction": "CA|NY|TX|Fed-US|Other",
    "metadata": {
      "source": "string",
      "confidence": 0.0-1.0,
      "citations": ["string"],
      "tags": ["string"]
    },
    "content": {
      "title": "string",
      "body": "string",
      "structured_fields": {}
    },
    "relationships": [
      {
        "type": "cites|contradicts|supports|overrules",
        "target_id": "uuid",
        "strength": 0.0-1.0
      }
    ]
  }
}
```

### LAW-CBOR Schema

```
CBOR Map {
  "v": 1,                    // version
  "t": "case|statute|fact",  // type
  "id": bytes(16),           // UUID as binary
  "j": "CA",                 // jurisdiction
  "m": {                     // metadata
    "s": "source",
    "c": 0.95,               // confidence
    "cit": ["§123", "Case1"],
    "tags": ["child-abuse"]
  },
  "content": {
    "title": "string",
    "body": "string",
    "fields": {}
  },
  "rel": [                   // relationships
    {
      "type": 1,             // enum: cites=1, contradicts=2, etc.
      "target": bytes(16),
      "strength": 0.95
    }
  ]
}
```

### Conversion Rules

- **JSON → CBOR**: Lossless binary encoding, ~70% size reduction
- **CBOR → JSON**: Full reconstruction with metadata preservation
- **Versioning**: LMF version in header, backward-compatible upgrades

---

## Part 2: Phase Roadmap (1–70)

### Phase Group 1–5: Evidence Ingestion & Storage

| Phase | Feature | Dependencies | Compliance Gate | GPU Acceleration |
|-------|---------|--------------|-----------------|------------------|
| 1 | MinIO setup + S3 API | None | Data residency | None |
| 2 | Docling GPU extraction | Phase 1 | OCR accuracy > 95% | Granite Docling VLM |
| 3 | LangExtract chunking | Phase 2 | Chunk size validation | CPU (1000+ chunks/sec) |
| 4 | Embedding generation | Phase 3 | Embedding dim = 768 | embeddinggemma (GPU) |
| 5 | pgvector + HNSW indexes | Phase 4 | Index health check | HNSW (GPU-ready) |

**Deliverables:**
- Evidence files stored in MinIO with jurisdiction scoping
- Chunks in PostgreSQL with pgvector embeddings
- Audit log for all ingestion operations
- LMF JSON export for each evidence file

**Compliance:** Data residency by jurisdiction, encryption at rest/transit

---

### Phase Group 6–10: Semantic Search & Ranking

| Phase | Feature | Dependencies | Compliance Gate | GPU Acceleration |
|-------|---------|--------------|-----------------|------------------|
| 6 | PGVector cosine search | Phase 5 | Latency < 30ms | HNSW GPU ops |
| 7 | Elasticsearch BM25 | Phase 3 | Recall > 90% | CPU (optimized) |
| 8 | MiniLM reranking | Phase 6, 7 | Rerank latency < 20ms | TensorRT (GPU) |
| 9 | Result merging + dedup | Phase 8 | Merge latency < 5ms | CPU |
| 10 | Jurisdiction filtering | Phase 9 | Jurisdiction enforcement | CPU |

**Deliverables:**
- Hybrid search (semantic + BM25)
- MiniLM cross-encoder reranking
- Multi-jurisdiction result scoping
- LMF JSON results with scores

**Compliance:** Search audit trail, result provenance tracking

---

### Phase Group 11–15: Citation Validation & UI

| Phase | Feature | Dependencies | Compliance Gate | GPU Acceleration |
|-------|---------|--------------|-----------------|------------------|
| 11 | Citation validator | Phase 10 | Cite-or-silence policy | CPU |
| 12 | Jurisdiction selector | Phase 11 | Jurisdiction required | None |
| 13 | Tag auto-scaling | Phase 12 | Tag weight formula | CPU (log-based) |
| 14 | Clickable citations | Phase 13 | Citation links verified | None |
| 15 | Export guard | Phase 14 | Block invalid exports | None |

**Deliverables:**
- Citation validation engine (regex + semantic)
- Jurisdiction-first UI workflow
- Auto-scaling tag weights (formula: 1.0 + log(1 + usage_count))
- Citation-to-source linking
- Export blocking for unverified summaries

**Compliance:** Citation accuracy > 99%, jurisdiction enforcement

---

### Phase Group 16–20: Responsive YoRHa PWA

| Phase | Feature | Dependencies | Compliance Gate | GPU Acceleration |
|-------|---------|--------------|-----------------|------------------|
| 16 | SvelteKit 2 PWA shell | Phase 15 | Offline capability | None |
| 17 | Admin sidebar + layout | Phase 16 | Navigation complete | None |
| 18 | Evidence CRUD UI | Phase 17 | CRUD operations | None |
| 19 | Faceted filters | Phase 18 | Filter performance | None |
| 20 | Responsive design | Phase 19 | Mobile-first | None |

**Deliverables:**
- YoRHa-themed PWA (dark mode, #9df accent)
- Admin sidebar with 6 sections
- Evidence datagrid with pagination
- Evidence drawer with inline editing
- Faceted search (jurisdiction, status, type, tags)
- Mobile-responsive layout

**Compliance:** WCAG 2.1 AA accessibility

---

### Phase Group 21–25: Auto-Scaling Tags & RAG Weighting

| Phase | Feature | Dependencies | Compliance Gate | GPU Acceleration |
|-------|---------|--------------|-----------------|------------------|
| 21 | Tag frequency tracking | Phase 20 | Usage count accuracy | CPU |
| 22 | RAG index sync | Phase 21 | Index consistency | CPU |
| 23 | Tag weight updates | Phase 22 | Weight formula validation | CPU |
| 24 | Soft tag filtering | Phase 23 | Filter performance | CPU |
| 25 | Tag boost application | Phase 24 | Boost factor validation | CPU |

**Deliverables:**
- Tag usage frequency tracking (incremented on summary save)
- Auto-scaling weight formula: `weight = 1.0 + log(1 + usage_count)`
- RAG index metadata updates
- Optional tag filtering (strict mode)
- Tag-based weight boosting (soft mode, 1.5x boost)
- LMF JSON with tag metadata

**Compliance:** Tag weight audit trail, frequency validation

---

### Phase Group 26–30: LLM Structured Reasoning & Judge AI

| Phase | Feature | Dependencies | Compliance Gate | GPU Acceleration |
|-------|---------|--------------|-----------------|------------------|
| 26 | Ollama LLM integration | Phase 25 | Model accuracy > 85% | Ollama GPU |
| 27 | Structured output | Phase 26 | JSON schema validation | CPU |
| 28 | Legal reasoning chain | Phase 27 | Reasoning steps logged | CPU |
| 29 | Judge AI engine | Phase 28 | Judgment consistency | CPU |
| 30 | Streaming responses | Phase 29 | First token < 350ms | Ollama GPU |

**Deliverables:**
- Ollama LLM integration (Gemma 2, Mistral, Qwen)
- Structured JSON output (reasoning, citations, judgment)
- Legal reasoning chain-of-thought
- Judge AI for case analysis
- Streaming LLM responses with citation validation
- LMF JSON with reasoning steps

**Compliance:** Reasoning audit trail, citation enforcement, bias detection

---

### Phase Group 31–40: Case Graph KAG & Timeline Engine

| Phase | Feature | Dependencies | Compliance Gate | GPU Acceleration |
|-------|---------|--------------|-----------------|------------------|
| 31 | Knowledge graph schema | Phase 30 | Graph consistency | CPU |
| 32 | Entity extraction | Phase 31 | Entity accuracy > 90% | CPU (NER) |
| 33 | Relationship linking | Phase 32 | Link validation | CPU |
| 34 | Graph traversal | Phase 33 | Query latency < 100ms | CPU |
| 35 | Timeline engine | Phase 34 | Event ordering | CPU |
| 36 | Case clustering | Phase 35 | Cluster quality | CPU |
| 37 | Precedent linking | Phase 36 | Precedent accuracy | CPU |
| 38 | Contradiction detection | Phase 37 | Contradiction scoring | CPU |
| 39 | Graph visualization | Phase 38 | Render performance | GPU (WebGL) |
| 40 | Graph export (LMF) | Phase 39 | Export validation | CPU |

**Deliverables:**
- Knowledge graph with entities, relationships, events
- Entity extraction (legal concepts, parties, dates)
- Relationship linking (cites, contradicts, supports, overrules)
- Graph traversal for case analysis
- Timeline engine for event sequencing
- Case clustering by similarity
- Precedent linking and ranking
- Contradiction detection with scoring
- Interactive graph visualization
- LMF JSON-LAW + LAW-CBOR export

**Compliance:** Graph audit trail, relationship provenance

---

### Phase Group 41–50: Law-to-Fact Probability Models

| Phase | Feature | Dependencies | Compliance Gate | GPU Acceleration |
|-------|---------|--------------|-----------------|------------------|
| 41 | Fact extraction | Phase 40 | Fact accuracy > 85% | CPU (NER) |
| 42 | Statute matching | Phase 41 | Match confidence > 80% | CPU |
| 43 | Probability scoring | Phase 42 | Score calibration | CPU |
| 44 | Bayesian reasoning | Phase 43 | Posterior validation | CPU |
| 45 | Evidence weighting | Phase 44 | Weight consistency | CPU |
| 46 | Outcome prediction | Phase 45 | Prediction accuracy > 75% | CPU |
| 47 | Confidence intervals | Phase 46 | CI coverage > 95% | CPU |
| 48 | Sensitivity analysis | Phase 47 | Sensitivity validation | CPU |
| 49 | Counterfactual reasoning | Phase 48 | Counterfactual logic | CPU |
| 50 | Probability export (LMF) | Phase 49 | Export validation | CPU |

**Deliverables:**
- Fact extraction from evidence
- Statute-to-fact matching
- Bayesian probability scoring
- Evidence weighting model
- Outcome prediction with confidence
- Sensitivity analysis for key factors
- Counterfactual reasoning engine
- LMF JSON with probability metadata

**Compliance:** Probability audit trail, model explainability

---

### Phase Group 51–60: Agentic Prosecutor & Defense Engines

| Phase | Feature | Dependencies | Compliance Gate | GPU Acceleration |
|-------|---------|--------------|-----------------|------------------|
| 51 | Prosecutor agent | Phase 50 | Argument quality > 80% | Ollama GPU |
| 52 | Defense agent | Phase 51 | Counter-argument quality | Ollama GPU |
| 53 | Argument generation | Phase 52 | Argument coherence | CPU |
| 54 | Counter-argument | Phase 53 | Counter logic validation | CPU |
| 55 | Evidence marshaling | Phase 54 | Evidence relevance > 85% | CPU |
| 56 | Precedent citation | Phase 55 | Citation accuracy > 95% | CPU |
| 57 | Weakness identification | Phase 56 | Weakness scoring | CPU |
| 58 | Strength ranking | Phase 57 | Strength consistency | CPU |
| 59 | Debate simulation | Phase 58 | Debate coherence | Ollama GPU |
| 60 | Agent export (LMF) | Phase 59 | Export validation | CPU |

**Deliverables:**
- Prosecutor agent (builds strongest case)
- Defense agent (identifies weaknesses)
- Argument generation with evidence
- Counter-argument generation
- Evidence marshaling and ranking
- Precedent citation and weighting
- Weakness identification and scoring
- Strength ranking and comparison
- Debate simulation between agents
- LMF JSON with agent reasoning

**Compliance:** Agent reasoning audit trail, bias detection

---

### Phase Group 61–70: TensorRT/Triton Acceleration & GPU Scaling

| Phase | Feature | Dependencies | Compliance Gate | GPU Acceleration |
|-------|---------|--------------|-----------------|------------------|
| 61 | TensorRT model compilation | Phase 60 | Compilation success | TensorRT |
| 62 | Triton inference server | Phase 61 | Server health check | Triton |
| 63 | Model quantization (INT8) | Phase 62 | Accuracy loss < 2% | TensorRT |
| 64 | Batch inference | Phase 63 | Batch latency < 100ms | Triton GPU |
| 65 | Multi-GPU scaling | Phase 64 | GPU utilization > 80% | Multi-GPU |
| 66 | CBOR vector storage | Phase 65 | CBOR size < 70% JSON | CPU |
| 67 | IVFFlat GPU indexes | Phase 66 | Index latency < 10ms | GPU (IVFFlat) |
| 68 | Streaming inference | Phase 67 | First token < 250ms | Triton GPU |
| 69 | Inference caching | Phase 68 | Cache hit rate > 70% | GPU memory |
| 70 | Production deployment | Phase 69 | SLA: 99.9% uptime | Multi-GPU cluster |

**Deliverables:**
- TensorRT compiled models (MiniLM, embeddings)
- Triton inference server with model repository
- INT8 quantization for 4x speedup
- Batch inference pipeline
- Multi-GPU scaling with load balancing
- CBOR binary vector storage (70% size reduction)
- IVFFlat GPU indexes for vector search
- Streaming inference with token buffering
- Inference result caching
- Production deployment on GPU cluster

**Compliance:** Performance SLA, inference audit trail

---

## Part 3: Compliance Gates & Legal Safety

### Compliance Checkpoints

| Phase | Gate | Requirement | Enforcement |
|-------|------|-------------|-------------|
| 1–5 | Data Residency | Evidence stored by jurisdiction | Database constraints |
| 6–10 | Search Accuracy | Recall > 90%, Precision > 85% | Automated testing |
| 11–15 | Citation Accuracy | Citations > 99% accurate | Validator engine |
| 16–20 | Accessibility | WCAG 2.1 AA compliance | Automated audit |
| 21–25 | Tag Integrity | Tag weights audited | Audit log |
| 26–30 | Reasoning Transparency | All reasoning steps logged | Audit trail |
| 31–40 | Graph Consistency | Graph integrity checks | Validation rules |
| 41–50 | Probability Calibration | Confidence intervals > 95% | Statistical tests |
| 51–60 | Agent Fairness | Bias detection on arguments | Fairness metrics |
| 61–70 | Performance SLA | 99.9% uptime, < 350ms latency | Monitoring |

### Bias Detection & Mitigation

- **Phase 26+**: Bias scoring on LLM outputs
- **Phase 51+**: Fairness metrics on agent arguments
- **Phase 70**: Continuous bias monitoring in production

### Audit Logging

- All operations logged to immutable `audit_log` table
- LMF JSON export for compliance discovery
- Timestamp from server (not client)
- User ID and operation type tracked

---

## Part 4: Interoperability & Versioning

### API Versioning

```
/api/v1/evidence       # Phase 1–5
/api/v2/search         # Phase 6–10
/api/v3/citations      # Phase 11–15
/api/v4/rag            # Phase 16–20
/api/v5/tags           # Phase 21–25
/api/v6/reasoning      # Phase 26–30
/api/v7/graph          # Phase 31–40
/api/v8/probability    # Phase 41–50
/api/v9/agents         # Phase 51–60
/api/v10/inference     # Phase 61–70
```

### LMF Versioning

```
lmf_version: "1.0"  # Phases 1–30
lmf_version: "1.1"  # Phases 31–40 (graph support)
lmf_version: "1.2"  # Phases 41–50 (probability support)
lmf_version: "2.0"  # Phases 51–60 (agent support)
lmf_version: "2.1"  # Phases 61–70 (GPU acceleration)
```

### Backward Compatibility

- All API versions remain available
- LMF versions support upgrade path
- Database migrations are reversible
- Feature flags for gradual rollout

---

## Part 5: Dependencies & Upgrade Triggers

### Upgrade Triggers

| Trigger | Action | Phase |
|---------|--------|-------|
| Evidence count > 100k | Add GIN JSONB indexes | 5 |
| Search latency > 50ms | Enable MiniLM reranking | 8 |
| Tag count > 1000 | Implement tag caching | 25 |
| LLM latency > 500ms | Enable streaming | 30 |
| Graph size > 10k nodes | Implement graph sharding | 40 |
| Inference latency > 100ms | Enable TensorRT | 61 |
| GPU utilization > 90% | Add multi-GPU scaling | 65 |

### Dependency Graph

```
Phase 1 (MinIO)
  ↓
Phase 2 (Docling)
  ↓
Phase 3 (LangExtract)
  ↓
Phase 4 (Embeddings)
  ↓
Phase 5 (pgvector)
  ↓
Phase 6 (PGVector search)
  ↓
Phase 7 (Elasticsearch)
  ↓
Phase 8 (MiniLM reranking)
  ↓
Phase 9 (Result merging)
  ↓
Phase 10 (Jurisdiction filtering)
  ↓
Phase 11 (Citation validator)
  ↓
Phase 12 (Jurisdiction UI)
  ↓
Phase 13 (Tag auto-scaling)
  ↓
Phase 14 (Clickable citations)
  ↓
Phase 15 (Export guard)
  ↓
Phase 16 (SvelteKit PWA)
  ↓
Phase 17 (Admin sidebar)
  ↓
Phase 18 (Evidence CRUD UI)
  ↓
Phase 19 (Faceted filters)
  ↓
Phase 20 (Responsive design)
  ↓
Phase 21 (Tag frequency)
  ↓
Phase 22 (RAG index sync)
  ↓
Phase 23 (Tag weight updates)
  ↓
Phase 24 (Soft filtering)
  ↓
Phase 25 (Tag boost)
  ↓
Phase 26 (Ollama LLM)
  ↓
Phase 27 (Structured output)
  ↓
Phase 28 (Legal reasoning)
  ↓
Phase 29 (Judge AI)
  ↓
Phase 30 (Streaming)
  ↓
Phase 31 (KAG schema)
  ↓
... (continues through Phase 70)
```

---

## Part 6: Implementation Timeline

### Year 1 (Phases 1–25)
- Q1: Evidence ingestion + storage (Phases 1–5)
- Q2: Semantic search + ranking (Phases 6–10)
- Q3: Citation validation + UI (Phases 11–20)
- Q4: Auto-scaling tags + RAG (Phases 21–25)

### Year 2 (Phases 26–50)
- Q1: LLM reasoning + Judge AI (Phases 26–30)
- Q2: Case graph + timeline (Phases 31–40)
- Q3: Probability models (Phases 41–50)

### Year 3 (Phases 51–70)
- Q1: Agentic engines (Phases 51–60)
- Q2: GPU acceleration (Phases 61–70)
- Q3: Production deployment + scaling

---

## Conclusion

This 70-phase roadmap provides a complete path from evidence ingestion to agentic prosecutor/judge engines with full GPU acceleration. Each phase builds on previous phases with clear compliance gates, interoperability standards (LMF), and performance targets.

The dual JSON-LAW + LAW-CBOR format ensures human readability for debugging and audit while enabling GPU-optimized binary encoding for high-throughput inference.

