# Codebase Reference & Directory Structure

## Project Overview

This document maps all directories, files, and services related to the Legal AI Evidence CRUD + RAG Integration system.

---

## Part 1: Core Project Structure

### Root Level Directories

```
.
├── .kiro/                          # Kiro IDE configuration & specs
│   └── specs/
│       ├── evidence-crud-rag-integration/
│       │   ├── requirements.md     # Feature requirements (7 requirements)
│       │   ├── design.md           # Architecture & design
│       │   └── tasks.md            # Implementation tasks (30+ subtasks)
│       ├── legal-crud-admin/       # Legacy CRUD spec
│       ├── FULL_ROADMAP_70_PHASES.md  # Complete 70-phase roadmap
│       └── CODEBASE_REFERENCE.md   # This file
│
├── python-services/                # Backend Python services
│   ├── validators.py               # Legal constraint validation
│   ├── audit_service.py            # Immutable audit logging
│   ├── evidence_crud.py            # Evidence CRUD routes
│   ├── tags_crud.py                # Citation tags CRUD
│   ├── rag_index_sync.py           # RAG index synchronization
│   ├── rag_search.py               # RAG search with tag filtering
│   ├── audit_routes.py             # Audit log query routes
│   ├── nlp_middleware_service.py   # NLP orchestration (streaming + citations)
│   ├── BACKEND_IMPLEMENTATION_SUMMARY.md
│   ├── STREAMING_CITATIONS.md
│   ├── INTEGRATION_GUIDE.md
│   ├── QUICK_REFERENCE.md
│   └── test_streaming_citations.py # Test suite
│
├── sveltekit-frontend/             # Frontend SvelteKit 2 application
│   ├── src/
│   │   ├── lib/
│   │   │   ├── components/
│   │   │   │   ├── admin/
│   │   │   │   │   ├── AdminSidebar.svelte      # Navigation sidebar
│   │   │   │   │   ├── AdminLayout.svelte       # Layout wrapper
│   │   │   │   │   ├── EvidenceDataGrid.svelte  # Paginated table
│   │   │   │   │   └── EvidenceDrawer.svelte    # Inline editing form
│   │   │   │   └── ...other components
│   │   │   ├── server/
│   │   │   │   └── db/
│   │   │   │       └── schema/
│   │   │   │           └── evidence.ts          # Drizzle ORM schema
│   │   │   └── ...other lib files
│   │   ├── routes/
│   │   │   ├── admin/
│   │   │   │   ├── evidence/
│   │   │   │   ├── chunks/
│   │   │   │   ├── embeddings/
│   │   │   │   ├── citations/
│   │   │   │   ├── kag/
│   │   │   │   └── audit/
│   │   │   ├── rag/
│   │   │   │   ├── query/
│   │   │   │   └── result/
│   │   │   └── api/
│   │   └── app.html
│   ├── drizzle/
│   │   ├── schema/
│   │   │   └── evidence.ts         # Extended schema with tags, audit, RAG metadata
│   │   └── migrations/
│   │       ├── 0001_evidence_system.sql
│   │       └── 0002_citation_tags_audit.sql
│   ├── svelte.config.cjs
│   ├── vite.config.ts
│   └── tsconfig.json
│
├── granite-docling-worker/         # GPU document extraction
│   ├── src/
│   │   ├── chunking/
│   │   │   ├── semantic_chunker.py
│   │   │   ├── parallel_chunker.py
│   │   │   ├── structure_preserving.py
│   │   │   └── table_preservation.py
│   │   ├── rag/
│   │   │   ├── bm25_indexer.py
│   │   │   ├── embedding_generator.py
│   │   │   ├── ranking_engine.py
│   │   │   └── rag_service.py
│   │   ├── events/
│   │   │   ├── event_models.py
│   │   │   ├── event_emitter.py
│   │   │   └── metrics_collector.py
│   │   └── ...other modules
│   └── tests/
│       └── test_events.py           # 24/24 tests passing
│
├── docker/                         # Docker configuration
│   ├── docker-compose.yml
│   ├── docker-compose.phase72.yml
│   └── Dockerfile.*
│
├── docs/                           # Documentation
│   ├── evidence-board-integration-plan.md
│   └── ...other docs
│
└── ...other directories
```

---

## Part 2: Backend Services (Python)

### Service Architecture

```
python-services/
├── validators.py
│   ├── Jurisdiction enum (CA, NY, TX, Fed-US, Other)
│   ├── FileType enum (pdf, docx, txt)
│   ├── ProcessingStatus enum (pending, processing, completed, failed)
│   ├── validate_evidence_file()
│   ├── validate_citation_tag()
│   ├── calculate_tag_weight()  # Auto-scaling formula
│   └── get_tag_boost_factor()
│
├── audit_service.py
│   ├── AuditLogService class
│   │   ├── log_create()
│   │   ├── log_update()
│   │   ├── log_delete()
│   │   ├── log_tag_weight_update()
│   │   ├── query_audit_log()
│   │   ├── get_user_activity()
│   │   ├── get_resource_history()
│   │   └── verify_immutability()
│   └── AuditContext context manager
│
├── evidence_crud.py
│   ├── GET /api/evidence (list with pagination/filtering)
│   ├── POST /api/evidence (multipart upload to MinIO)
│   ├── GET /api/evidence/{id}
│   ├── PATCH /api/evidence/{id}
│   ├── DELETE /api/evidence/{id}
│   ├── upload_to_minio()
│   └── delete_from_minio()
│
├── tags_crud.py
│   ├── GET /api/tags (list with filtering)
│   ├── POST /api/tags (create tag)
│   ├── GET /api/tags/{id}
│   ├── PATCH /api/tags/{id}
│   ├── POST /api/tags/evidence/{id}/tags (link tags)
│   ├── GET /api/tags/evidence/{id}/tags (get linked tags)
│   └── update_rag_index_for_evidence()
│
├── rag_index_sync.py
│   ├── RAGIndexSyncService class
│   │   ├── add_evidence_to_index()
│   │   ├── update_tags_in_index()
│   │   ├── remove_evidence_from_index()
│   │   ├── regenerate_embeddings()
│   │   └── update_tag_weight_on_summary_save()
│   └── SearchService interface
│
├── rag_search.py
│   ├── POST /api/rag/search (semantic + BM25 + reranking)
│   ├── POST /api/rag/search/stream (streaming with LLM)
│   ├── search_pgvector()
│   ├── search_elasticsearch()
│   ├── merge_search_results()
│   ├── rerank_results()
│   ├── apply_tag_weighting()
│   └── stream_llm_response()
│
├── audit_routes.py
│   ├── GET /api/audit (query with filtering)
│   ├── GET /api/audit/user/{id} (user activity)
│   ├── GET /api/audit/resource/{type}/{id} (resource history)
│   ├── GET /api/audit/export/csv (CSV export)
│   ├── GET /api/audit/export/json (JSON export)
│   └── GET /api/audit/verify (immutability check)
│
├── nlp_middleware_service.py
│   ├── POST /api/embeddings (embedding generation)
│   ├── POST /api/extract-entities (entity extraction)
│   ├── POST /api/process-granite (Docling GPU processing)
│   ├── POST /api/generate-llm (LLM generation)
│   ├── POST /api/process-pipeline (full pipeline)
│   ├── POST /api/rag/stream (streaming RAG with citations)
│   ├── format_llm_prompt_with_citations()
│   ├── validate_citations()
│   └── stream_llm_output()
│
└── Documentation
    ├── BACKEND_IMPLEMENTATION_SUMMARY.md
    ├── STREAMING_CITATIONS.md
    ├── INTEGRATION_GUIDE.md
    ├── QUICK_REFERENCE.md
    └── test_streaming_citations.py
```

### API Endpoints Summary

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/api/evidence` | GET | List evidence with pagination | ✅ |
| `/api/evidence` | POST | Upload evidence file | ✅ |
| `/api/evidence/{id}` | GET | Get single evidence | ✅ |
| `/api/evidence/{id}` | PATCH | Update evidence metadata | ✅ |
| `/api/evidence/{id}` | DELETE | Delete evidence | ✅ |
| `/api/tags` | GET | List tags | ✅ |
| `/api/tags` | POST | Create tag | ✅ |
| `/api/tags/{id}` | GET | Get tag | ✅ |
| `/api/tags/{id}` | PATCH | Update tag | ✅ |
| `/api/tags/evidence/{id}/tags` | POST | Link tags to evidence | ✅ |
| `/api/tags/evidence/{id}/tags` | GET | Get evidence tags | ✅ |
| `/api/rag/search` | POST | Search with tag filtering | ✅ |
| `/api/rag/search/stream` | POST | Streaming search with LLM | ✅ |
| `/api/audit` | GET | Query audit log | ✅ |
| `/api/audit/user/{id}` | GET | User activity | ✅ |
| `/api/audit/resource/{type}/{id}` | GET | Resource history | ✅ |
| `/api/audit/export/csv` | GET | CSV export | ✅ |
| `/api/audit/export/json` | GET | JSON export | ✅ |
| `/api/audit/verify` | GET | Immutability check | ✅ |

---

## Part 3: Frontend Components (SvelteKit)

### Component Hierarchy

```
sveltekit-frontend/src/lib/components/admin/
├── AdminSidebar.svelte
│   ├── Navigation sections (6 items)
│   ├── Active section highlighting
│   ├── Status indicator
│   └── YoRHa dark theme
│
├── AdminLayout.svelte
│   ├── Grid layout (sidebar + main)
│   ├── Header with title/subtitle
│   ├── Sticky sidebar
│   └── Responsive design
│
├── EvidenceDataGrid.svelte
│   ├── Searchable table
│   ├── Pagination controls
│   ├── Multi-select filters
│   │   ├── Jurisdiction filter
│   │   ├── Status filter
│   │   └── File type filter
│   ├── Sortable columns
│   ├── Status badges
│   ├── Row click handler
│   ├── Loading state
│   └── Empty state
│
└── EvidenceDrawer.svelte
    ├── Inline editing form
    ├── Read-only info section
    │   ├── File ID
    │   ├── File type
    │   ├── File size
    │   ├── Chunk count
    │   ├── Created/Updated dates
    │   └── MinIO path
    ├── Editable form section
    │   ├── Filename input
    │   ├── Jurisdiction select
    │   ├── Status select
    │   └── Metadata JSON textarea
    ├── Form validation
    ├── Error messages
    ├── Delete confirmation modal
    ├── Save/Cancel buttons
    └── Delete button
```

### Database Schema (Drizzle ORM)

```
sveltekit-frontend/drizzle/schema/evidence.ts

Tables:
├── evidenceFiles
│   ├── id (UUID, PK)
│   ├── caseId (UUID, FK)
│   ├── filename (VARCHAR)
│   ├── fileSize (BIGINT)
│   ├── fileType (VARCHAR: pdf, docx, txt)
│   ├── minioPath (VARCHAR)
│   ├── uploadedBy (UUID)
│   ├── uploadedAt (TIMESTAMP)
│   ├── processingStatus (VARCHAR: pending, processing, completed, failed)
│   ├── processingError (TEXT)
│   ├── processingStartedAt (TIMESTAMP)
│   ├── processingCompletedAt (TIMESTAMP)
│   ├── chunkCount (INTEGER)
│   ├── metadata (JSONB)
│   ├── createdAt (TIMESTAMP)
│   └── updatedAt (TIMESTAMP)
│
├── evidenceChunks
│   ├── id (UUID, PK)
│   ├── evidenceId (UUID, FK → evidenceFiles)
│   ├── chunkIndex (INTEGER)
│   ├── content (TEXT)
│   ├── pageNumber (INTEGER)
│   ├── sectionTitle (VARCHAR)
│   ├── metadata (JSONB)
│   ├── createdAt (TIMESTAMP)
│   └── updatedAt (TIMESTAMP)
│
├── evidenceEmbeddings
│   ├── id (UUID, PK)
│   ├── chunkId (UUID, FK → evidenceChunks)
│   ├── embedding (vector(768))
│   ├── embeddingModel (VARCHAR)
│   ├── metadata (JSONB)
│   └── createdAt (TIMESTAMP)
│
├── citationTags
│   ├── id (UUID, PK)
│   ├── name (VARCHAR, UNIQUE with jurisdiction)
│   ├── jurisdiction (VARCHAR: CA, NY, TX, Fed-US, Other)
│   ├── description (TEXT)
│   ├── usageCount (INTEGER, default 0)
│   ├── baseWeight (INTEGER, default 1)
│   ├── createdAt (TIMESTAMP)
│   └── updatedAt (TIMESTAMP)
│
├── evidenceTags (M2M)
│   ├── id (UUID, PK)
│   ├── evidenceId (UUID, FK → evidenceFiles)
│   ├── tagId (UUID, FK → citationTags)
│   └── createdAt (TIMESTAMP)
│
├── ragIndexMetadata
│   ├── id (UUID, PK)
│   ├── chunkId (UUID, FK → evidenceChunks)
│   ├── evidenceId (UUID, FK → evidenceFiles)
│   ├── tags (TEXT[])
│   ├── tagWeight (INTEGER, default 1)
│   ├── jurisdiction (VARCHAR)
│   └── updatedAt (TIMESTAMP)
│
└── auditLog (Immutable)
    ├── id (UUID, PK)
    ├── userId (UUID)
    ├── resourceType (VARCHAR)
    ├── resourceId (UUID)
    ├── operation (VARCHAR: CREATE, UPDATE, DELETE)
    ├── oldValues (JSONB)
    ├── newValues (JSONB)
    └── timestamp (TIMESTAMP, immutable)
```

### Database Migrations

```
sveltekit-frontend/drizzle/migrations/

0001_evidence_system.sql
├── evidenceFiles table
├── evidenceChunks table
├── evidenceEmbeddings table
├── HNSW indexes for pgvector
└── Full-text search indexes

0002_citation_tags_audit.sql
├── citationTags table
├── evidenceTags M2M table
├── ragIndexMetadata table
├── auditLog table
├── BTREE indexes (jurisdiction, citation_number, authority_type)
├── GIN indexes (JSONB, trigram)
└── Unique constraints
```

---

## Part 4: Related Services & Infrastructure

### Document Processing Pipeline

```
granite-docling-worker/
├── src/
│   ├── chunking/
│   │   ├── semantic_chunker.py      # 256-512 token chunks
│   │   ├── parallel_chunker.py      # 1000+ chunks/sec
│   │   ├── structure_preserving.py  # Preserve headings, tables
│   │   └── table_preservation.py    # Extract table structure
│   │
│   ├── rag/
│   │   ├── bm25_indexer.py          # Elasticsearch indexing
│   │   ├── embedding_generator.py   # LegalBERT embeddings
│   │   ├── ranking_engine.py        # Multi-factor ranking
│   │   └── rag_service.py           # RAG orchestration
│   │
│   └── events/
│       ├── event_models.py          # Event data models
│       ├── event_emitter.py         # SSE streaming
│       └── metrics_collector.py     # Performance metrics
│
└── tests/
    └── test_events.py               # 24/24 tests passing
```

### Storage & Infrastructure

```
MinIO (S3-compatible)
├── lawpdfs/
│   ├── {jurisdiction}/
│   │   └── {evidence_id}/
│   │       └── {filename}

PostgreSQL 17 + pgvector
├── evidence_files table
├── evidence_chunks table
├── evidence_embeddings table (768-dim vectors)
├── citation_tags table
├── evidence_tags M2M table
├── rag_index_metadata table
└── audit_log table (immutable)

Elasticsearch
├── BM25 indexing for full-text search
├── Jurisdiction-scoped indexes
└── Tag-aware filtering

Redis
├── Caching layer
├── Session management
└── Rate limiting
```

---

## Part 5: Testing & Documentation

### Test Files

```
python-services/
├── test_streaming_citations.py
│   ├── Citation validation tests (15+)
│   ├── Prompt formatting tests
│   ├── Edge case tests
│   ├── Real-world scenario tests
│   └── Integration tests

sveltekit-frontend/
├── js_tests/
│   └── create-sample-evidence.js
│
└── src_fixed/
    ├── ai-evidence-analyzer.ts
    ├── evidence-processing-service.ts
    ├── evidenceStore.ts
    └── evidenceCustodyMachine.ts
```

### Documentation Files

```
.kiro/specs/
├── evidence-crud-rag-integration/
│   ├── requirements.md              # 7 requirements
│   ├── design.md                    # Architecture & components
│   └── tasks.md                     # 30+ implementation tasks
│
├── FULL_ROADMAP_70_PHASES.md        # Complete roadmap
├── CODEBASE_REFERENCE.md            # This file
└── legal-crud-admin/                # Legacy specs

python-services/
├── BACKEND_IMPLEMENTATION_SUMMARY.md
├── STREAMING_CITATIONS.md
├── INTEGRATION_GUIDE.md
├── QUICK_REFERENCE.md
└── test_streaming_citations.py

docs/
└── evidence-board-integration-plan.md
```

---

## Part 6: Key Features & Implementation Status

### Evidence CRUD
- ✅ List with pagination, filtering, sorting
- ✅ Create with multipart upload to MinIO
- ✅ Read single evidence file
- ✅ Update metadata with validation
- ✅ Delete with cleanup
- ✅ Audit logging for all operations

### Citation Tags
- ✅ Create, read, update tags
- ✅ Link tags to evidence
- ✅ Auto-scaling weight calculation
- ✅ Tag frequency tracking
- ✅ RAG index synchronization

### RAG Search
- ✅ Semantic search (PGVector)
- ✅ BM25 search (Elasticsearch)
- ✅ Result merging & deduplication
- ✅ MiniLM reranking
- ✅ Optional tag filtering (strict mode)
- ✅ Tag-based weighting (soft mode)
- ✅ Streaming responses with citations

### Frontend Components
- ✅ AdminSidebar navigation
- ✅ EvidenceDataGrid with pagination
- ✅ EvidenceDrawer with inline editing
- ✅ Form validation
- ✅ YoRHa dark theme
- ✅ Responsive design

### Audit & Compliance
- ✅ Immutable audit log
- ✅ User activity tracking
- ✅ Resource history
- ✅ CSV/JSON export
- ✅ Immutability verification

---

## Part 7: Deployment & Configuration

### Environment Variables

```
# Backend
MINIO_URL=http://localhost:9000
MINIO_BUCKET=lawpdfs
EMBEDDING_URL=http://localhost:8000
GRANITE_DOCLING_URL=http://localhost:8094
OLLAMA_URL=http://localhost:11434
LANGEXTRACT_URL=http://localhost:9002
REDIS_URL=redis://redis:6379
PORT=8003

# Frontend
VITE_API_URL=http://localhost:8003
VITE_MINIO_URL=http://localhost:9000
DATABASE_URL=postgresql://user:pass@localhost:5432/legal_ai
```

### Docker Services

```
docker-compose.yml
├── postgres (PostgreSQL 17 + pgvector)
├── redis (Caching)
├── minio (S3-compatible storage)
├── elasticsearch (Full-text search)
├── ollama (LLM inference)
├── embedding-service (embeddinggemma)
├── granite-docling-worker (GPU document extraction)
├── nlp-middleware (FastAPI orchestration)
├── sveltekit-frontend (SvelteKit 2 app)
└── nginx (Reverse proxy)
```

---

## Part 8: Integration Points

### Data Flow

```
Evidence Upload
    ↓
MinIO Storage
    ↓
LangExtract Chunking
    ↓
embeddinggemma Embeddings
    ↓
PostgreSQL + pgvector
    ↓
Elasticsearch BM25
    ↓
RAG Index Metadata
    ↓
Citation Tags
    ↓
Audit Log

RAG Query
    ↓
Query Embedding
    ↓
PGVector Search
    ↓
Elasticsearch Search
    ↓
Result Merging
    ↓
MiniLM Reranking
    ↓
Tag Weighting
    ↓
LLM Generation (Ollama)
    ↓
Citation Validation
    ↓
Streaming Response
```

---

## Part 9: Future Phases (Roadmap Reference)

### Phases 1–25 (Current Implementation)
- ✅ Evidence ingestion & storage (Phases 1–5)
- ✅ Semantic search & ranking (Phases 6–10)
- ✅ Citation validation & UI (Phases 11–15)
- ✅ Responsive YoRHa PWA (Phases 16–20)
- ✅ Auto-scaling tags & RAG (Phases 21–25)

### Phases 26–70 (Future)
- ⏳ LLM reasoning & Judge AI (Phases 26–30)
- ⏳ Case graph KAG & timeline (Phases 31–40)
- ⏳ Probability models (Phases 41–50)
- ⏳ Agentic engines (Phases 51–60)
- ⏳ GPU acceleration (Phases 61–70)

---

## Part 10: Quick Reference

### Key Files by Purpose

| Purpose | File | Location |
|---------|------|----------|
| Evidence CRUD | evidence_crud.py | python-services/ |
| Citation Tags | tags_crud.py | python-services/ |
| RAG Search | rag_search.py | python-services/ |
| Audit Logging | audit_service.py | python-services/ |
| Validation | validators.py | python-services/ |
| Database Schema | evidence.ts | sveltekit-frontend/drizzle/schema/ |
| Migrations | 0002_citation_tags_audit.sql | sveltekit-frontend/drizzle/migrations/ |
| Admin Sidebar | AdminSidebar.svelte | sveltekit-frontend/src/lib/components/admin/ |
| Data Grid | EvidenceDataGrid.svelte | sveltekit-frontend/src/lib/components/admin/ |
| Drawer Form | EvidenceDrawer.svelte | sveltekit-frontend/src/lib/components/admin/ |
| Layout | AdminLayout.svelte | sveltekit-frontend/src/lib/components/admin/ |
| Streaming | nlp_middleware_service.py | python-services/ |
| Tests | test_streaming_citations.py | python-services/ |

---

## Conclusion

This codebase reference provides a complete map of all directories, files, and services related to the Legal AI Evidence CRUD + RAG Integration system. Use this document to:

1. **Navigate the codebase** – Find files by purpose or location
2. **Understand dependencies** – See how services connect
3. **Reference implementations** – Locate specific features
4. **Plan future work** – Use the roadmap for next phases
5. **Onboard new developers** – Provide complete project overview

