# Phase 3B: Evidence RAG Search UI - Specification

## Overview

Phase 3B implements the Evidence RAG (Retrieval-Augmented Generation) Search UI, enabling users to search through uploaded legal evidence documents using semantic search, reranking, and visual evidence board organization.

**Status**: ✅ Specification Complete (Requirements → Design → Tasks)

## Key Features

### 1. Semantic Search
- Query embedding generation using Gemma-2b model
- Qdrant vector database search (top-50 results)
- Filter support (jurisdiction, statute, date range)
- Search result caching (24-hour TTL)
- Performance: <500ms new search, <100ms cached

### 2. Reranking Pipeline
- MiniLM-L6-v2 cross-encoder scoring
- Top-50 → Top-5 reranking
- Relevance score computation
- Result caching
- Performance: <50ms reranking

### 3. Evidence Board Visualization
- Golden-ratio 3-column layout (22% / 55% / 23%)
- Evidence cards (manila folder/polaroid style)
- Connection lines between related evidence
- Zoom controls (100%, ±10%, reset)
- Pan controls (drag to move)

### 4. Search Result Display
- List view with rank, title, snippet, score
- Detail panel with full context
- Related chunks navigation
- Statute reference linking
- Metadata display (page, doc_id, bounding boxes)

### 5. Real-time Progress Streaming
- SSE (Server-Sent Events) for progress updates
- Events: embedding_complete, search_complete, reranking_complete, done
- Real-time UI updates
- Error handling and reconnection

## Architecture

```
Frontend (SvelteKit)
├── Search Page (/search)
├── Evidence Board (/evidence-board)
└── Result Detail Panel

Backend (FastAPI)
├── Search Service (query embedding → Qdrant)
├── Reranking Service (MiniLM cross-encoder)
├── Search Cache (Redis)
└── API Endpoints (/api/search/*)

Data Layer
├── Qdrant (vector database)
├── Redis (caching)
└── MinIO (chunk metadata)
```

## Implementation Tasks

**Total Tasks**: 30
- **Core Tasks**: 18 (search service, API, UI, evidence board)
- **Optional Tasks**: 12 (tests, documentation, monitoring)

**Estimated Timeline**:
- Core implementation: 3-4 days
- Testing & optimization: 2-3 days
- Deployment: 1 day

## Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| Cached search | <100ms | Query hash lookup + result retrieval |
| New search | <500ms | Embedding + search + reranking |
| Embedding | <50ms | Gemma-2b query embedding |
| Qdrant search | <100ms | Top-50 vector search |
| Reranking | <50ms | MiniLM cross-encoder scoring |

## Integration Points

**Depends On**:
- Phase 3A: Evidence Upload (file storage in MinIO)
- Phase 3D: Worker Pipeline (chunk embeddings in Qdrant)
- ABC Bundle: CUDA Tokenizer Service (optimized preprocessing)

**Feeds Into**:
- Phase 70: AI Chat Integration (search results as context)
- Phase 72: TensorRT Pooling (search optimization)

## Files to Create/Modify

### Backend
- `backend/search_service.py` (new)
- `backend/search_cache.py` (new)
- `backend/reranker_service.py` (new)
- `backend/search_events.py` (new)
- `backend/search_metrics.py` (new)
- `backend/search_analytics.py` (new)
- `backend/api/search_routes.py` (new)

### Frontend
- `sveltekit-frontend/src/routes/search/+page.svelte` (new)
- `sveltekit-frontend/src/routes/evidence-board/+page.svelte` (new)
- `sveltekit-frontend/src/lib/services/searchService.ts` (new)
- `sveltekit-frontend/src/lib/services/searchStream.ts` (new)
- `sveltekit-frontend/src/lib/components/SearchResults.svelte` (new)
- `sveltekit-frontend/src/lib/components/ResultDetail.svelte` (new)
- `sveltekit-frontend/src/lib/components/EvidenceCard.svelte` (new)
- `sveltekit-frontend/src/lib/components/EvidenceConnections.svelte` (new)

### Tests
- `tests/test_search_service.py` (optional)
- `tests/test_reranker_service.py` (optional)
- `tests/test_search_integration.py` (optional)
- `tests/test_search_performance.py` (optional)

### Documentation
- `docs/SEARCH_API.md` (optional)
- `docs/EVIDENCE_BOARD.md` (optional)

## Next Steps

1. **Review Specification**: Confirm requirements, design, and tasks
2. **Execute Core Tasks**: Implement search service, API, and UI
3. **Test & Optimize**: Run performance tests and optimize
4. **Deploy**: Deploy to production
5. **Monitor**: Track search metrics and user engagement

## Specification Files

- `requirements.md` - Feature requirements (10 requirements)
- `design.md` - Architecture and design decisions
- `tasks.md` - Implementation tasks (30 tasks, 18 core + 12 optional)

---

**Ready to execute Phase 3B tasks?**

Start with Task 1: Implement Search Service Backend
