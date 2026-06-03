# Search + Legal Library — Path Wiring Reference

> Generated: 2026-04-14
> Scope: Global Search, Legal Library Ingestion, Go Search Service, Admin UI

---

## 1. Architecture Overview

```
Browser
  │
  ├─ /global-search          ← search UI (SvelteKit SSR=false)
  │   ├─ /api/search         ← platform adapter fan-out (8 domain adapters)
  │   └─ /api/library/search ← legal corpus search (Go fast-path + SQL fallback)
  │
  └─ /admin/library          ← ingest UI (drag-drop PDF, metadata form)
      ├─ /api/library/upload              ← upload + create DB records
      └─ /api/library/ingest/[jobId]      ← SSE progress polling
```

---

## 2. Global Search — Request Flow

### 2a. Platform Search (`/api/search`)

```
+page.svelte: searchPlatform()
  └─ GET /api/search?q=...&type=all&limit=20
       src/routes/api/search/+server.ts
         │
         ├─ Layer 0: Go gRPC fast-path (if GO_SEARCH_URL set)
         │   └─ services/go-search-service/  (:8096 HTTP / :50055 gRPC)
         │       └─ parallel: citation FTS + pgvector + Qdrant + BM25
         │
         ├─ Layer 1: Domain adapter fan-out (Promise.allSettled)
         │   ├─ cases       → Drizzle: cases table (ILIKE + pgvector)
         │   ├─ evidence    → Drizzle: evidence table
         │   ├─ poi         → Drizzle: personsOfInterest table
         │   ├─ citations   → Drizzle: citations table
         │   ├─ legal       → /api/library/search (recursive)
         │   ├─ glossary    → Drizzle: legal_definitions table
         │   ├─ reports     → Drizzle: reports table
         │   └─ messages    → Drizzle: ragMessages table
         │
         └─ Layer 2: Merge → PlatformSearchHit[] → groups + timing
              └─ semantic cache hit-rate check (Redis)
```

**Response shape:**
```typescript
{
  hits: PlatformSearchHit[],
  groups: Record<PlatformEntityType, number>,   // count per type
  totalResults: number,
  timing: PlatformSearchTiming                  // per-adapter ms + count
}
```

### 2b. Library Search (`/api/library/search`)

```
+page.svelte: searchLibrary()
  └─ GET /api/library/search?q=...&limit=20[&jurisdiction=...&corpusType=...]
       src/routes/api/library/search/+server.ts
         │
         ├─ Fast-path: GO_SEARCH_URL set?
         │   └─ POST http://localhost:8096/search
         │       { query, jurisdiction, corpusType, limit, userId }
         │       → 4-way parallel: citation match + FTS + pgvector + Qdrant
         │       → RRF fusion → hits[] sorted by rrf_score
         │
         └─ Fallback: inline SQL
             ├─ Lexical: FTS on legal_nodes.full_text (to_tsvector/plainto_tsquery)
             ├─ Semantic: pgvector cosine on legal_chunks.embedding (768-dim)
             └─ JOIN: legal_nodes → legal_documents → jurisdictions
```

**Response shape:**
```typescript
{
  hits: LibraryHit[],  // { id, title, snippet, score, matchType, corpusType, jurisdictionCode, ... }
  total: number,
  meta: { source: 'go-search-service' | 'inline-sql', ... }
}
```

### 2c. Search Mode → API mapping (`+page.svelte`)

| UI Mode | `searchMode` | API(s) called |
|---------|-------------|---------------|
| All | `'all'` | `/api/search` **+** `/api/library/search` (parallel) |
| Law | `'law'` | `/api/library/search` only |
| Cases | `'cases'` | `/api/search?type=cases` |
| Evidence | `'evidence'` | `/api/evidence/search` (POST) |
| Reports | `'reports'` | `/api/search?type=reports` |
| Messages | `'messages'` | `/api/search?type=messages` |
| Statutes | `'statutes'` | `/api/search/laws` (client `searchLaws()`) |
| Precedents | `'precedents'` | `/api/precedents/search` (POST) |
| Glossary | `'glossary'` | `/api/glossary/search` (POST) |
| RAG | `'rag'` | `/api/rag/search` (POST) |

---

## 3. Legal Library Ingestion — Path Wiring

### 3a. Upload Flow

```
/admin/library  (+page.svelte)
  │  FormData: { file (PDF), title, corpusType, jurisdiction,
  │              citation?, officialUrl?, effectiveDate? }
  │
  └─ POST /api/library/upload
       src/routes/api/library/upload/+server.ts
         │
         ├─ Zod validation (uploadSchema)
         ├─ uploadLibraryDocument() → ingestion-worker.ts
         │   ├─ SHA-256 hash check → skip if duplicate
         │   ├─ ensureBucket('legal-library')
         │   ├─ putObject(bucket, key, buffer)  → SeaweedFS S3 gateway (legal-library bucket)
         │   ├─ INSERT INTO jurisdictions (upsert by code)
         │   ├─ INSERT INTO library_documents  → returns documentId
         │   └─ INSERT INTO ingestion_jobs     → returns jobId
         │
         └─ runIngestionPipeline({ documentId, jobId })  ← fire-and-forget
              (async, non-blocking — client polls for status)
```

**Response:**
```json
{ "success": true, "documentId": "uuid", "jobId": "uuid", "alreadyExists": false }
```

### 3b. Ingestion Pipeline (8 stages)

```
ingestion-worker.ts: runIngestionPipeline()
  │
  ├─ Stage 1: queued        → job created, waiting
  ├─ Stage 2: extracting    → getFile(bucket, key) → pdf-parse → text + pageCount
  ├─ Stage 3: ocr           → fallback if pdf-parse yields <100 chars
  │                            Tesseract CLI → tesseract.js → skip
  ├─ Stage 4: structuring   → chunkLegalDocument(text, metadata)
  │                            src/lib/server/indexer/legal-chunker.ts
  │                            → detects PART/TITLE/CHAPTER/ARTICLE/SECTION
  │                            → preserves hierarchy, extracts citations
  ├─ Stage 5: chunking      → INSERT INTO legal_nodes (hierarchy tree)
  │                            each node: { nodePath, heading, fullText, depth, ... }
  ├─ Stage 6: embedding     → generateEmbeddings(textBatch) via gRPC
  │                            src/lib/server/grpc/embedding-client.ts
  │                            model: embeddinggemma:latest (768-dim)
  │                            batch size: 32 chunks
  │                            → UPDATE legal_chunks SET embedding = $vec
  ├─ Stage 7: graphing      → extract citation references from chunk text
  │                            → UPDATE legal_nodes SET metadata_json
  └─ Stage 8: complete      → UPDATE library_documents SET processing_status='complete'
                               UPDATE ingestion_jobs SET stage='complete', progress=100
```

**Database writes per stage:**

| Stage | Table | Operation |
|-------|-------|-----------|
| queued | `ingestion_jobs` | INSERT |
| queued | `library_documents` | INSERT |
| extracting | `library_documents` | UPDATE page_count |
| chunking | `legal_nodes` | INSERT (one per section) |
| chunking | `legal_chunks` | INSERT (one per chunk, ~512 chars) |
| embedding | `legal_chunks` | UPDATE embedding (pgvector float4[768]) |
| complete | `library_documents` | UPDATE processing_status |
| complete | `ingestion_jobs` | UPDATE stage, progress=100 |

### 3c. Status Polling

```
/admin/library  (+page.svelte)
  └─ poll every 2500ms:
       GET /api/library/ingest/[jobId]
         src/routes/api/library/ingest/[jobId]/+server.ts
           └─ SELECT stage, progress, metrics_json FROM ingestion_jobs
              Response: { stage, progress, status, stageIndex, totalStages, metrics }
              Closes SSE when status = 'complete' | 'failed'
```

---

## 4. Go Search Service — Internal Architecture

**Binary:** `services/go-search-service/search-server.exe`
**Ports:** `:8096` (HTTP) · `:50055` (gRPC)
**Config:** `GO_SEARCH_URL=http://localhost:8096` in `.env`

```
POST /search
  { query, jurisdiction, corpusType, limit, userId }
  │
  ├─ goroutine 1: Citation match    → legal_citations (exact + trigram)
  ├─ goroutine 2: FTS               → legal_nodes full_text (PostgreSQL tsvector)
  ├─ goroutine 3: pgvector          → legal_chunks.embedding cosine <=> query_vec
  └─ goroutine 4: Qdrant            → legal_documents collection (768-dim cosine)
      │
      └─ RRF fusion (k=60)
          → hits[] sorted by rrf_score DESC
          → returned to SvelteKit → client
```

**Start command (manual):**
```bash
cd services/go-search-service
GO_SEARCH_URL=http://localhost:8096 \
POSTGRES_DSN="postgres://..." \
QDRANT_URL="http://localhost:6333" \
./search-server.exe
```

---

## 5. Storage Layer Summary

| Store | Table / Collection | Content | Indexed By |
|-------|--------------------|---------|------------|
| PostgreSQL | `library_documents` | Document metadata, status, SeaweedFS S3 key | corpus_type, processing_status |
| PostgreSQL | `jurisdictions` | Jurisdiction lookup (code, name, level) | code (unique) |
| PostgreSQL | `legal_nodes` | Section hierarchy tree | document_id, node_path |
| PostgreSQL | `legal_chunks` | Text chunks + pgvector embedding (768-dim) | legal_node_id, qdrant_point_id |
| PostgreSQL | `ingestion_jobs` | Pipeline stage tracking | document_id |
| PostgreSQL | `legal_citations` | Extracted citation references | node_id |
| SeaweedFS S3 | `legal-library` bucket | Raw PDF files | `{documentId}/{filename}` |
| Qdrant | `legal_documents` | 768-dim chunk embeddings (cosine, INT8) | point_id = legal_chunks.qdrant_point_id |

---

## 6. Key File Map

| File | Role |
|------|------|
| `src/routes/(app)/global-search/+page.svelte` | Search UI — 10 modes, auto-debounce, score bars |
| `src/routes/(app)/admin/library/+page.svelte` | Ingest UI — drop zone, pipeline tracker, doc list |
| `src/routes/api/search/+server.ts` | Platform search — 8 adapters, Go fast-path |
| `src/routes/api/library/search/+server.ts` | Library search — Go fast-path + SQL fallback |
| `src/routes/api/library/upload/+server.ts` | PDF upload + DB record creation |
| `src/routes/api/library/ingest/[jobId]/+server.ts` | SSE job status polling |
| `src/routes/api/library/documents/+server.ts` | Document list with counts |
| `src/lib/server/legal/ingestion-worker.ts` | 8-stage pipeline orchestrator |
| `src/lib/server/indexer/legal-chunker.ts` | Structure-aware legal chunker |
| `src/lib/server/grpc/embedding-client.ts` | gRPC embed → Ollama fallback |
| `src/lib/server/minio-client.ts` | SeaweedFS S3 upload/download (legacy module name) |
| `src/lib/components/layout/YorhaSidebar.svelte` | Nav — LIBRARY INGEST link at `/admin/library` |
| `src/lib/types/search.ts` | `PlatformSearchHit`, `PlatformSearchTiming` |
| `services/go-search-service/main.go` | Go 4-way parallel search + RRF |

---

## 7. Environment Variables

| Variable | Default | Used By |
|----------|---------|---------|
| `GO_SEARCH_URL` | `''` (disabled) | `/api/library/search`, `/api/search` |
| `MINIO_LIBRARY_BUCKET` | `legal-library` | SeaweedFS bucket name (legacy env var) |
| `MINIO_ENDPOINT` | `localhost` | SeaweedFS S3 endpoint host (legacy env var) |
| `MINIO_ACCESS_KEY` | `minio` | SeaweedFS S3 access key (legacy env var) |
| `MINIO_SECRET_KEY` | `minio123` | SeaweedFS S3 secret key (legacy env var) |
| `DATABASE_URL` | — | All PostgreSQL queries |
| `QDRANT_URL` | `http://localhost:6333` | Qdrant vector search |

---

## 8. Data Flow Diagram (end-to-end)

```
Admin uploads PDF
      │
      ▼
SeaweedFS S3: legal-library/{docId}/file.pdf
      │
      ▼
library_documents  (status: queued)
      │
      ▼ ingestion-worker.ts (async)
      │
  pdf-parse ──────────────────────────────► text + pageCount
      │
  legal-chunker.ts ───────────────────────► legal_nodes (hierarchy)
      │                                     legal_chunks (text)
      │
  generateEmbeddings() [gRPC/Ollama] ─────► legal_chunks.embedding (768-dim float4[])
      │
  Qdrant upsert ──────────────────────────► legal_documents collection
      │
  library_documents (status: complete)
      │
      ▼
User searches "fourth amendment"
      │
  /api/library/search ──► Go service (4-way parallel)
      │                         ├─ FTS on legal_nodes
      │                         ├─ pgvector cosine on legal_chunks
      │                         ├─ Qdrant cosine on legal_documents
      │                         └─ citation match on legal_citations
      │                    └─ RRF fusion
      │
  /api/search ──────────► 8 domain adapters (cases, evidence, POI, ...)
      │
      ▼
  /global-search UI
      ├─ Platform hits  (match badges: fts/vector/fused/qdrant + score bars)
      └─ Legal corpus   (⚖ LEGAL CORPUS section, green score bars)
```
