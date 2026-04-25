# Legal Auto Ingestion Stack - Production Guide

**Status:** ✅ Production-Ready
**Date:** November 28, 2025
**Stack:** Ollama + Qdrant + PostgreSQL + Neo4j + Redis + FastAPI + SvelteKit

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    SvelteKit Frontend (Phase 10)                │
│  - DocumentListCHRROM.svelte (case similarity search)           │
│  - Calls /api/cases/similar, /api/chr-rom/pattern              │
│  - Renders CHR-ROM patterns (icons, gauges, badges)            │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    FastAPI Similarity API                       │
│  - /api/cases/similar (Qdrant search + Redis cache)            │
│  - /api/chr-rom/pattern (CHR-ROM pattern generation)           │
│  - /api/search (full-text semantic search)                     │
│  - /api/cases/{case_id} (case details)                         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Data Storage Layer                           │
│  ├─ Qdrant (legal_complaints, legal_images)                    │
│  ├─ PostgreSQL (legal_embeddings, case metadata)               │
│  ├─ Neo4j (Case + LegalEntity nodes + relationships)           │
│  └─ Redis (CHR-ROM patterns, similarity cache)                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Ingestion Workers                            │
│  ├─ ingest_pdf_worker.py (PDF → embeddings → storage)          │
│  ├─ chr97_image_processor.py (images → topology)               │
│  └─ embedding_service.py (centralized Ollama client)           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    External Services                            │
│  ├─ Ollama (embeddinggemma, gemma3-legal)                      │
│  ├─ Docling (IBM Granite text extraction)                      │
│  └─ langchain (text chunking)                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Services

### 1. embedding_service.py
**Purpose:** Centralized Ollama client for all embeddings
**No HF models loaded in-process**

```python
from backend.services.embedding_service import get_embedding_service

service = get_embedding_service()
vec = service.embed_one("Legal text here")  # (768,) float32
vecs = service.embed_batch(["text1", "text2"])  # (N, 768) float32
```

**Configuration:**
```bash
export OLLAMA_URL=http://localhost:11434
export OLLAMA_EMBED_MODEL=embeddinggemma:latest
export OLLAMA_TIMEOUT=60
```

### 2. ingest_pdf_worker.py
**Purpose:** PDF → chunks → embeddings → storage (Qdrant + Postgres + Neo4j)

**Pipeline:**
1. Extract text (Docling/IBM Granite or PyPDF2 fallback)
2. Chunk text (langchain RecursiveCharacterTextSplitter)
3. Generate embeddings (embedding_service)
4. Generate summary (Gemma-3 Legal)
5. Store in Qdrant (legal_complaints)
6. Store in PostgreSQL (legal_embeddings)
7. Build knowledge graph (Neo4j)

**Usage:**
```bash
export PDF_PATH=download_complaint.pdf
export CASE_ID=US_v_CA_AB32_2020
export CASE_NAME="United States v. California (A.B. 32 Challenge)"

python backend/services/ingest_pdf_worker.py
```

**Configuration:**
```bash
export CHUNK_SIZE=1500
export CHUNK_OVERLAP=200
export OLLAMA_SUMMARY_MODEL=gemma3-legal:latest
export PG_HOST=localhost
export PG_DB=legal_ai_db
export PG_USER=postgres
export PG_PASSWORD=password
export NEO4J_URI=bolt://localhost:7687
export NEO4J_USER=neo4j
export NEO4J_PASSWORD=password
```

### 3. chr97_image_processor.py
**Purpose:** Images → YOLO → SAM → embeddings → topology → storage

**Pipeline:**
1. YOLO detection
2. SAM segmentation (optional)
3. Generate embeddings (embedding_service)
4. Extract visual features
5. DBSCAN clustering
6. 4D manifold projection
7. Store in Qdrant (legal_images)
8. Store in PostgreSQL (legal_image_texts)
9. Store summaries in MinIO
10. Export image_topology.json

**Configuration:**
```bash
export QDRANT_HOST=localhost
export QDRANT_PORT=6333
export MINIO_URL=http://localhost:9000
export MINIO_ACCESS_KEY=minioadmin
export MINIO_SECRET_KEY=minioadmin
export MINIO_TOPOLOGY_BUCKET=minio_topology_cluster_bucket
```

### 4. similarity_api.py
**Purpose:** FastAPI endpoints for SvelteKit frontend

**Endpoints:**
- `POST /api/cases/similar` - Find similar cases (Qdrant search + Redis cache)
- `GET /api/chr-rom/pattern/{doc_id}/{pattern_type}` - Get CHR-ROM patterns
- `GET /api/cases/{case_id}` - Get case details
- `POST /api/search` - Full-text semantic search

**Configuration:**
```bash
export REDIS_HOST=localhost
export REDIS_PORT=6379
export REDIS_DB=0
export REDIS_TTL=3600  # 1 hour cache
```

---

## Setup Instructions

### 1. Start External Services

```bash
# Ollama
ollama serve &

# Pull embedding models
ollama pull embeddinggemma:latest
ollama pull gemma3-legal:latest

# Qdrant
docker run -d -p 6333:6333 qdrant/qdrant

# PostgreSQL 17 + pgvector
docker run -d \
  -e POSTGRES_PASSWORD=password \
  -p 5432:5432 \
  postgres:15-alpine

# Create pgvector extension
psql -h localhost -U postgres -d legal_ai_db -c "CREATE EXTENSION IF NOT EXISTS vector;"

# Neo4j
docker run -d \
  -e NEO4J_AUTH=neo4j/password \
  -p 7687:7687 \
  -p 7474:7474 \
  neo4j:latest

# Redis
docker run -d -p 6379:6379 redis:latest

# MinIO
docker run -d \
  -p 9000:9000 \
  -p 9001:9001 \
  minio/minio server /data
```

### 2. Install Python Dependencies

```bash
pip install -r backend/requirements-legal-ingestion.txt
```

**Key packages:**
- `embedding_service.py` → requests, numpy
- `ingest_pdf_worker.py` → langchain, qdrant-client, psycopg2, neo4j, docling
- `similarity_api.py` → fastapi, redis, qdrant-client, psycopg2
- `chr97_image_processor.py` → opencv, ultralytics, segment-anything, scikit-learn

### 3. Set Environment Variables

```bash
# Create .env file
cat > .env << EOF
# Ollama
OLLAMA_URL=http://localhost:11434
OLLAMA_EMBED_MODEL=embeddinggemma:latest
OLLAMA_SUMMARY_MODEL=gemma3-legal:latest
OLLAMA_TIMEOUT=60

# Qdrant
QDRANT_HOST=localhost
QDRANT_PORT=6333

# PostgreSQL
PG_HOST=localhost
PG_DB=legal_ai_db
PG_USER=postgres
PG_PASSWORD=password

# Neo4j
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0
REDIS_TTL=3600

# MinIO
MINIO_URL=http://localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_TOPOLOGY_BUCKET=minio_topology_cluster_bucket

# Ingestion
CHUNK_SIZE=1500
CHUNK_OVERLAP=200
PDF_PATH=download_complaint.pdf
CASE_ID=US_v_CA_AB32_2020
CASE_NAME=United States v. California (A.B. 32 Challenge)
EOF

source .env
```

### 4. Run Ingestion Pipeline

```bash
# Test embedding service
python backend/services/embedding_service.py

# Ingest PDF
python backend/services/ingest_pdf_worker.py

# Process images (if available)
python backend/services/chr97_image_processor.py
```

### 5. Start FastAPI Server

```bash
python -m uvicorn backend.api.similarity_api:app --reload --host 0.0.0.0 --port 8000
```

### 6. Test Endpoints

```bash
# Health check
curl http://localhost:8000/health

# Find similar cases
curl -X POST http://localhost:8000/api/cases/similar \
  -H "Content-Type: application/json" \
  -d '{"case_id": "US_v_CA_AB32_2020", "limit": 10}'

# Get CHR-ROM pattern
curl http://localhost:8000/api/chr-rom/pattern/US_v_CA_AB32_2020/summary_icon

# Search cases
curl "http://localhost:8000/api/search?query=Supremacy%20Clause"
```

---

## Data Flow

### PDF Ingestion
```
complaint.pdf
    ↓
extract_text_from_pdf() [Docling/IBM Granite]
    ↓
chunk_text() [langchain]
    ↓
embed_batch() [Ollama embeddinggemma]
    ↓
generate_summary() [Ollama gemma3-legal]
    ↓
store_in_qdrant() [legal_complaints]
store_in_postgres() [legal_embeddings]
build_knowledge_graph() [Neo4j]
    ↓
ingestion_results_{case_id}.json
```

### Case Similarity Search
```
SvelteKit Frontend
    ↓
POST /api/cases/similar
    ↓
Check Redis cache (cases:similar:{case_id})
    ↓
Cache miss:
  - Query Qdrant (legal_complaints)
  - Fetch metadata from PostgreSQL
  - Generate CHR-ROM patterns
  - Store patterns in Redis (chr:pattern:{doc_id}:{type})
    ↓
Return JSON with results + patterns
    ↓
SvelteKit renders {@html pattern}
```

---

## Storage Schema

### Qdrant Collections
```
legal_complaints:
  - id: int
  - vector: float32[768]
  - payload:
      case_id: str
      chunk_index: int
      text: str (first 500 chars)
      metadata: dict
      created_at: ISO8601

legal_images:
  - id: int
  - vector: float32[768]
  - payload:
      case_id: str
      cluster: int
      text: str
      metadata: dict
```

### PostgreSQL Tables
```
legal_embeddings:
  - id: UUID
  - case_id: TEXT
  - chunk_index: INT
  - embedding: VECTOR(768)
  - text_chunk: TEXT
  - summary: TEXT
  - metadata: JSONB
  - created_at: TIMESTAMP

legal_image_texts:
  - id: SERIAL
  - text: TEXT
  - embedding: VECTOR(768)
  - cluster_id: INT
  - confidence: REAL
  - metadata: JSONB
  - created_at: TIMESTAMP
```

### Neo4j Graph
```
(:Case {id, name, filed, metadata})
  -[:ASSERTS]-> (:LegalEntity {name, description})
  -[:RELATES {type}]-> (:LegalEntity)

Example:
(:Case {id: "US_v_CA_AB32_2020"})
  -[:ASSERTS]-> (:LegalEntity {name: "Supremacy Clause"})
  -[:RELATES {type: "SUPPORTS"}]-> (:LegalEntity {name: "Preemption"})
```

### Redis Keys
```
cases:similar:{case_id}
  → JSON array of similar cases (TTL: 1 hour)

chr:pattern:{doc_id}:{pattern_type}
  → HTML/SVG pattern string (TTL: 1 hour)

Example pattern types:
  - summary_icon
  - risk_gauge
  - confidence_badge
  - case_type
```

---

## Performance Targets

| Operation | Target | Notes |
|-----------|--------|-------|
| Embed single text | <50ms | Ollama cached |
| Embed batch (32) | <100ms | Parallel |
| Qdrant search | <50ms | COSINE distance |
| PostgreSQL query | <20ms | Indexed |
| Redis lookup | <5ms | In-memory |
| CHR-ROM generation | <10ms | Deterministic |
| **Total API response** | **<300ms** | Cached |

---

## Monitoring & Debugging

### Check Ollama Health
```bash
curl http://localhost:11434/api/tags
```

### Check Qdrant Health
```bash
curl http://localhost:6333/health
```

### Check PostgreSQL
```bash
psql -h localhost -U postgres -d legal_ai_db -c "SELECT COUNT(*) FROM legal_embeddings;"
```

### Check Neo4j
```bash
curl -u neo4j:password http://localhost:7474/db/neo4j/tx
```

### Check Redis
```bash
redis-cli KEYS "cases:similar:*"
redis-cli KEYS "chr:pattern:*"
```

### View Logs
```bash
# Embedding service
python backend/services/embedding_service.py 2>&1 | tee embedding_service.log

# Ingestion worker
python backend/services/ingest_pdf_worker.py 2>&1 | tee ingest_worker.log

# FastAPI server
python -m uvicorn backend.api.similarity_api:app --log-level info
```

---

## Troubleshooting

### Ollama Connection Failed
```
❌ Ollama embedding failed: Connection refused
```
**Fix:** Ensure Ollama is running (`ollama serve`) and accessible at `OLLAMA_URL`.

### Model Not Found
```
⚠️ Model embeddinggemma:latest not found
```
**Fix:** Pull the model: `ollama pull embeddinggemma:latest`

### Qdrant Connection Failed
```
❌ Error connecting to Qdrant
```
**Fix:** Ensure Qdrant is running: `docker run -p 6333:6333 qdrant/qdrant`

### PostgreSQL Connection Failed
```
psycopg2.OperationalError: could not connect to server
```
**Fix:** Ensure PostgreSQL is running and pgvector extension is installed.

### Redis Connection Failed
```
redis.exceptions.ConnectionError: Connection refused
```
**Fix:** Ensure Redis is running: `docker run -p 6379:6379 redis:latest`

---

## Scaling Considerations

### Horizontal Scaling
- **Ingestion workers:** Stateless, can run multiple instances
- **FastAPI server:** Stateless, use load balancer (nginx, HAProxy)
- **Embedding service:** Centralized Ollama instance (or cluster)

### Vertical Scaling
- **Qdrant:** Increase memory for larger vector collections
- **PostgreSQL:** Add indexes on `case_id`, `embedding` for faster queries
- **Redis:** Increase memory for larger cache

### Optimization
- **Batch embeddings:** Process 32-64 texts at once
- **Redis caching:** Cache similarity results (TTL: 1 hour)
- **Qdrant indexing:** Use HNSW for faster search
- **PostgreSQL:** Use pgvector indexes for similarity search

---

## Next Steps

1. **Run ingestion pipeline** on your DOJ complaint PDF
2. **Start FastAPI server** for SvelteKit frontend
3. **Test similarity search** via API
4. **Integrate with SvelteKit** (DocumentListCHRROM.svelte)
5. **Monitor performance** and optimize as needed

---

## Files

```
backend/services/
├── embedding_service.py          (Centralized Ollama client)
├── ingest_pdf_worker.py          (PDF ingestion pipeline)
└── chr97_image_processor.py       (Image topology service)

backend/api/
└── similarity_api.py             (FastAPI endpoints)

backend/
├── requirements-legal-ingestion.txt
└── LEGAL_AUTO_INGESTION_PRODUCTION_GUIDE.md (This file)
```

---

## Status: ✅ PRODUCTION-READY

All services are implemented, tested, and ready for deployment.

