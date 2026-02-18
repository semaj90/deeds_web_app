# Protocol Buffers & gRPC — Implementation Guide

## Last Updated: February 2026 (Session 53)

---

## Architecture Overview

This platform uses gRPC for **internal binary-protocol communication** between the SvelteKit gateway and backend services. The browser communicates with SvelteKit via HTTP/SSE/WebSocket; SvelteKit communicates with backend services via gRPC (HTTP/2).

```
Browser ──SSE/HTTP──→ SvelteKit Gateway ──gRPC──→ EmbeddingService (port 50051)
                                          ──gRPC──→ Chr97Agent (port 50052)
                                          ──gRPC──→ RetrievalService (port 50053)
```

**Edge transport** (HTTP/3 / QUIC / WebTransport) is a future gateway capability — it does NOT mean internal services speak QUIC.

---

## Currently Implemented Services

| Service | Proto | Port | Language | Status |
|---------|-------|------|----------|--------|
| **EmbeddingService** | `proto/active/embedding.proto` | 50051 | Python (backend/) | **REAL** — batch 768d embeddings via gRPC, Ollama HTTP fallback |
| **Chr97Agent** | `proto/active/chr97_agent.proto` | 50052 | Python (chr97-runtime/) | **REAL** — binary cartridge streaming, tag queries, timelines |
| **RetrievalService** | `proto/active/retrieval.proto` | 50053 | TypeScript (planned) | **NEW** — RAG+KAG+DAG evidence retrieval, wraps existing pipeline |
| **CyberElephantService** | `proto/active/vectors.proto` | — | Go (cyber-elephant/) | **SILOED** — document vector processing, can be folded later |

### SvelteKit Gateway (HTTP/SSE today)
- All frontend-facing endpoints are SvelteKit `+server.ts` routes
- Currently handles RAG/evidence/embedding inline (TypeScript)
- RetrievalService will externalize the retrieval pipeline

---

## Proto Directory Structure

```
proto/
├── active/                        ← ONLY these are production-wired
│   ├── embedding.proto            ← EmbeddingService (batch 768d, RTX 3060 Ti)
│   ├── chr97_agent.proto          ← Chr97Agent (binary cartridges + KAG graph)
│   ├── retrieval.proto            ← RetrievalService (RAG+KAG+DAG evidence search)
│   └── vectors.proto              ← CyberElephantService (document vectors)
├── archived/                      ← 32 protos — aspirational, not production-wired
│   ├── legal_ai.proto             ← Core AI services (aspirational)
│   ├── case_scoring.proto         ← Case evaluation (aspirational)
│   ├── tensor_cache.proto         ← GPU tensor caching (aspirational)
│   ├── gateway_streaming.proto    ← Edge streaming (renamed from quic_streaming)
│   └── ... (28 more)
├── embed/                         ← Generated Go stubs (embed_grpc.pb.go)
├── gpu/                           ← Generated Go stubs (gpu_service*.pb.go)
├── ingest/                        ← Generated Go stubs (ingest_grpc.pb.go)
└── tensor/                        ← Generated Go stubs (tensor_grpc.pb.go)
```

### Other Proto Locations (Not Canonical)
- `backend/proto/embedding.proto` — Python server's copy (canonical is `proto/active/`)
- `sveltekit-frontend/proto/embedding.proto` — TS client's copy (should import from `proto/active/`)
- `go-microservice/proto/` — 18 protos (10 empty stubs), generated Go code, buf config
- `sveltekit-frontend/src/lib/proto/` — ai-suggestions.proto, vector-search.proto
- `sveltekit-frontend/protos/` — legal_bert.proto, rag_kag.proto

---

## Currently Wired TS Clients

### 1. Embedding Client (`src/lib/server/grpc/embedding-client.ts`)
```typescript
// Lazy-loads @grpc/grpc-js + @grpc/proto-loader
// Connects to EMBEDDING_GRPC_URL (default: 127.0.0.1:50051)
// Falls back to HTTP/Ollama if gRPC disabled or unavailable
import { generateEmbeddings, generateSingleEmbedding } from '$lib/server/grpc/embedding-client.js';
```

### 2. Retrieval Client (planned: `src/lib/server/grpc/retrieval-client.ts`)
```typescript
// Will wrap the existing evidence search pipeline
// Connects to RETRIEVAL_GRPC_URL (default: 127.0.0.1:50053)
// Falls back to inline TypeScript pipeline if gRPC unavailable
import { searchEvidence, searchCodebase } from '$lib/server/grpc/retrieval-client.js';
```

---

## Target Service Registry (Aspirational)

The following 37 services were planned in the original architecture but **none are production-wired**. They live in `proto/archived/` and `go-microservice/proto/`. Do not claim these are running.

### Core AI Services (Ports 8080-8099)
- `legal-gateway` (8080), `enhanced-rag` (8094), `gpu-orchestrator` (8095)

### Legal Analysis Services (Ports 8100-8109)
- `legal-ai-inference` (8100), `case-scoring` (8101), `precedent-search` (8102)

### Vector & Embedding Services (Ports 8110-8119)
- `vector-search` (8110), `embedding-generator` (8111)

### Storage & Cache Services (Ports 8120-8129)
- `tensor-cache` (8120), `redis-orchestrator` (8121), `minio-gateway` (8122)

### Streaming Services (Ports 8130-8139)
- `edge-streaming-gateway` (8130) — formerly "quic-streaming", handles HTTP/3 at the edge

### Monitoring (Ports 8140-8149)
- `health-monitor` (8140), `metrics-collector` (8141)

*(Full list in archived proto files)*

---

## RetrievalService Design

### What It Wraps
The RetrievalService wraps the existing SvelteKit `POST /api/evidence/search` pipeline:

1. **RAG**: Embed query → pgvector cosine + Qdrant ANN → legal-aware rerank (75% cosine + 15% citations + 10% section proximity)
2. **KAG**: Traverse `yorha_evidence_connections` graph → score neighbors by connection strength
3. **DAG**: Resolve citation cross-references across documents

### Implementation Path
1. Start as thin gRPC wrapper around existing TypeScript logic (same machine)
2. SvelteKit `/api/evidence/search` calls `RetrievalService.SearchEvidence()` via gRPC
3. If gRPC unavailable, falls back to inline pipeline (same as today)
4. Add Redis caching at the retrieval-service layer (sha256 of query+filters)

### Proto Messages
See `proto/active/retrieval.proto` for full message definitions. Key types:
- `EvidenceSearchRequest` → maps 1:1 to current POST body
- `ContextBundle` → hit + siblings + sectionPath + citations
- `SearchTiming` → embed_ms, search_ms, rerank_ms, hop_ms, total_ms
- `CodebaseSearchRequest` → dual-vector codebase search

---

## Edge Transport Strategy

| Layer | Protocol | Today | Future |
|-------|----------|-------|--------|
| Browser → Gateway | HTTP/1.1, SSE | Working | HTTP/3, WebTransport |
| Gateway → Services | gRPC (HTTP/2) | Working (embedding) | All services |
| Service → Service | gRPC (HTTP/2) | N/A | If needed |

**QUIC/HTTP/3** is an edge transport capability via Caddy reverse proxy. Internal services remain gRPC over HTTP/2. The `gateway_streaming.proto` (formerly `quic_streaming.proto`) defines the edge streaming interface — it is NOT a requirement for internal services.

---

## Usage

### Generate stubs (when proto changes)
```bash
# Go stubs
protoc --go_out=. --go-grpc_out=. proto/active/retrieval.proto

# Python stubs
python -m grpc_tools.protoc -Iproto/active --python_out=. --grpc_python_out=. proto/active/retrieval.proto

# TypeScript uses @grpc/proto-loader at runtime (no codegen needed)
```

### Test gRPC services
```bash
# Check embedding service health
grpcurl -plaintext localhost:50051 embedding.EmbeddingService/Health

# Check retrieval service health
grpcurl -plaintext localhost:50053 yorha.retrieval.RetrievalService/Health
```