# Legal Agentic Alignment + Search Router - Spec Complete ✅

## Status: APPROVED & READY FOR IMPLEMENTATION

All three spec documents have been created and approved:

- ✅ **requirements.md** - 15 detailed requirements covering all aspects
- ✅ **design.md** - Complete architecture, components, data models, error handling
- ✅ **tasks.md** - 9 implementation tasks with optional testing/docs for MVP focus

## What This Spec Delivers

### 1. Agentic Alignment Router
- **Dynamic Lexicon Learning**: Seed + global + per-user "angry words" from chat
- **Signal Extraction**: Negativity, legal relevance, on-task-ness, latency
- **Intent Classification**: Legal vs general queries
- **Route Decision**: legal_rag_plus_kag, legal_rag_safe, or general_web
- **Per-User Metrics**: Tracks behavior in Redis for personalization

### 2. /api/search Endpoint
- **Unified Search**: Single endpoint for all legal search needs
- **RAG Integration**: Qdrant semantic search with Redis caching
- **KAG Enrichment**: Neo4j context for legal graph awareness
- **Granite Reasoning**: Optional AI-generated summaries
- **Alignment Signals**: Transparent routing decisions for frontend

### 3. Chat Learning Integration
- **learn_from_chat Hook**: Learns user's "angry words" from messages
- **Granite Sentiment Analysis**: Optional sentiment classification
- **Per-User Lexicon**: Stored in Redis, influences future searches
- **Fail-Soft**: Works with or without Granite

### 4. Topology Heat Tracking
- **Manifold Usage Heat**: Redis key `manifold-usage:{case_id}:{chunk_index}`
- **Heat Calculation**: 0.5 * on_task_score + 0.5 * calm (1 - negativity)
- **CH-ROM97 Integration**: Heat feeds into 4D topology adjustments
- **Closed-Loop**: chat → search → alignment → topology → UI

### 5. Phase Container Integration
- **Existing Infrastructure**: Uses docker-compose setup
- **Shared Clients**: Reuses EmbeddingClient, GraniteClient, Redis, Neo4j
- **No New Dependencies**: Minimal additions to existing stack
- **Production-Ready**: Error handling, fail-soft degradation

## Implementation Approach

### MVP Focus (Optional Testing/Docs)
1. Backend: AlignmentRouter + /api/search (core logic)
2. Frontend: SvelteKit proxy + search UI
3. Chat: Wire learn_from_chat hook
4. Topology: Update manifold export for heat

### Later Enhancements
- Comprehensive unit/integration/property-based tests
- Full API documentation
- Advanced CH-ROM97 visualizations
- Granite sentiment classifier optimization

## Key Files to Create

```
backend/services/alignment_router.py       (AlignmentRouter class)
backend/api/search_api.py                  (/api/search endpoint)
backend/api/main.py                        (FastAPI app with both routers)
sveltekit-frontend/src/routes/api/search/+server.ts  (proxy route)
sveltekit-frontend/src/lib/stores/search.ts          (state management)
```

## Key Redis Keys

```
neg-lexicon:global                         (global "angry words")
neg-lexicon:user:{user_id}                 (per-user learned words)
user-metrics:{user_id}                     (avg latency, negativity, count)
manifold-usage:{case_id}:{chunk_index}     (heat for topology)
```

## Next Steps

1. **Start Task 1**: Backend AlignmentRouter + /api/search implementation
2. **Start Task 2**: Frontend SvelteKit integration
3. **Start Task 3**: Chat learning hooks
4. **Start Task 4**: Topology heat integration
5. **Optional**: Add comprehensive tests and documentation

## Spec Metrics

- **Requirements**: 15 detailed acceptance criteria
- **Design Sections**: 10 (overview, architecture, components, data models, error handling, testing)
- **Implementation Tasks**: 9 (with optional sub-tasks for testing/docs)
- **Estimated MVP Time**: 2-3 days for core backend + frontend
- **Full Implementation**: 1 week with comprehensive testing

---

**Ready to begin implementation. Open tasks.md to start Task 1.**
