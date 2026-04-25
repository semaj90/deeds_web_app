# ACE Integration Checklist

## ✅ Phase 1: Wiring Complete

- [x] Created `backend/services/redis_cache.py` - RedisCache wrapper
- [x] Created `backend/services/granite_client.py` - GraniteClient wrapper
- [x] Updated `backend/api/agent_api.py` - General agent API with real wiring
- [x] Updated `backend/api/phase72_agent_api.py` - Phase72 agent API with real wiring
- [x] Created `tools/test-phase72-ace.mjs` - CLI test script
- [x] Created `.kiro/ACE_WIRING_COMPLETE.md` - Wiring documentation

## 🔄 Phase 2: Infrastructure & Testing

### Start Infrastructure
- [ ] Start Redis: `docker-compose up -d redis`
- [ ] Start PostgreSQL: `docker-compose up -d postgres`
- [ ] Start Neo4j: `docker-compose up -d neo4j`
- [ ] Start Qdrant: `docker-compose up -d qdrant`
- [ ] Start Ollama: `ollama serve` (or `docker-compose up -d ollama`)
- [ ] Verify Ollama has gemma3 model: `ollama list`

### Start Backend
- [ ] Navigate to backend: `cd backend`
- [ ] Install dependencies: `pip install -r requirements.txt`
- [ ] Start FastAPI: `uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload`
- [ ] Verify health: `curl http://localhost:8000/health`

### Test Endpoints
- [ ] Test general agent API:
  ```bash
  curl -X POST http://localhost:8000/api/agent/next_step \
    -H "Content-Type: application/json" \
    -d '{"session_id": "test:1", "message": "hello", "role": "user"}'
  ```

- [ ] Test Phase72 agent API:
  ```bash
  curl -X POST http://localhost:8000/api/phase72/next_step \
    -H "Content-Type: application/json" \
    -d '{"session_id": "phase72:deeds-web-app:main", "message": "what should I fix?", "role": "warden"}'
  ```

- [ ] Test CLI script:
  ```bash
  node tools/test-phase72-ace.mjs "phase72:deeds-web-app:main" "what should I fix next?"
  ```

## 🛠️ Phase 3: Tool Router Integration

### Create Tool Router
- [ ] Create `backend/services/tool_router.py` with:
  - [ ] `ToolContext` class (session_id, role, ACA, Phase72, AlignmentRouter, etc.)
  - [ ] `ToolRouter` class with `register_tool()` and `execute_tool()`
  - [ ] Tool implementations:
    - [ ] `run_svelte_check` - Run svelte-check command
    - [ ] `cluster_errors` - Cluster TypeScript errors
    - [ ] `chr97_get_hotspots` - Query CHR97 for hotspots
    - [ ] `rag_search` - Search via RAG
    - [ ] `analyze_multimodal_evidence` - VLM analysis

### Wire Tool Execution
- [ ] Add `/api/phase72/next_step_and_execute` endpoint
- [ ] Implement tool execution loop:
  1. Call ACE to get tool/args
  2. Build ToolContext
  3. Execute tool via ToolRouter
  4. Log result to timeline
  5. Return tool result to CLI

## 🎨 Phase 4: UI Integration

### Svelte Phase72 Chat Page
- [ ] Create `src/routes/phase72-chat/+page.svelte` with:
  - [ ] Text input for user message
  - [ ] Role selector (prosecutor / warden / admin)
  - [ ] "Get Next Action" button → calls `/api/phase72/next_step`
  - [ ] Display tool + reason + ACA marker
  - [ ] "Run Tool" button → calls `/api/phase72/next_step_and_execute`
  - [ ] Display tool result

### Context Confirmation Modal
- [ ] Create `ContextConfirmModal.svelte` component
- [ ] Show when ACE confidence is low
- [ ] Allow user to confirm or reject proposed context
- [ ] Call `/api/phase72/context_feedback` with user choice

## 📊 Phase 5: Monitoring & Logging

### Add Observability
- [ ] Add structured logging to all services
- [ ] Log all ACE decisions to timeline
- [ ] Track tool execution times
- [ ] Monitor Redis/Neo4j/Ollama connections
- [ ] Add metrics endpoint: `GET /api/metrics`

### Create Dashboard
- [ ] Session timeline viewer
- [ ] Error rate monitoring
- [ ] Tool execution history
- [ ] ACA summary versions

## 🚀 Phase 6: Production Readiness

### Performance
- [ ] Benchmark ACE response time (target: <2s)
- [ ] Optimize LLM prompt length
- [ ] Add caching for repeated queries
- [ ] Profile memory usage

### Reliability
- [ ] Add retry logic for failed LLM calls
- [ ] Implement circuit breaker for external services
- [ ] Add graceful degradation (fallback tools)
- [ ] Test with network failures

### Security
- [ ] Validate all user inputs
- [ ] Add rate limiting to endpoints
- [ ] Implement role-based access control
- [ ] Audit all tool executions

## 📝 Documentation

- [ ] Update README with ACE architecture
- [ ] Create API documentation (OpenAPI/Swagger)
- [ ] Write tool development guide
- [ ] Create troubleshooting guide

## 🎯 Success Criteria

- [x] ACE APIs are wired and initialized
- [ ] Endpoints respond with valid TOOL/ARGS/REASON
- [ ] Timeline events are logged correctly
- [ ] CLI can call endpoints and display results
- [ ] Tools execute and return results
- [ ] UI displays ACE suggestions
- [ ] Role-based access control works
- [ ] Performance meets targets (<2s response time)

## 📞 Support

If you encounter issues:

1. **Check logs**: `docker-compose logs -f redis postgres neo4j qdrant ollama`
2. **Verify connections**: `curl http://localhost:6379` (Redis), etc.
3. **Test endpoints**: Use `tools/test-phase72-ace.mjs`
4. **Check config**: Verify `CFG` values in `backend/services/legal_complaint_ingestion.py`
5. **Review errors**: Check FastAPI logs for detailed error messages

## Next Immediate Steps

1. **Start infrastructure** (Redis, Postgres, Neo4j, Qdrant, Ollama)
2. **Start backend** (`uvicorn api.main:app --port 8000`)
3. **Test endpoints** (use curl or test script)
4. **Verify responses** (should get TOOL/ARGS/REASON)
5. **Create tool router** (implement tool execution)
6. **Wire CLI** (update yo-rha-agent.mjs to call endpoints)
7. **Build UI** (create phase72-chat page)

---

**Status**: 🟢 Ready for Phase 2 (Infrastructure & Testing)
