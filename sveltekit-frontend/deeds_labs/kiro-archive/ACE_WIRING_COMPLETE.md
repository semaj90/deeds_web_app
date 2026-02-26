# ✅ ACE Wiring Complete

## Summary

ACE (Agentic Control Engine) has been **physically wired** into both API endpoints with real imports, proper initialization, and error handling.

## What Was Done

### 1. Created Missing Service Wrappers

**`backend/services/redis_cache.py`** - RedisCache wrapper
- Simple Redis interface for JSON get/set, list operations, TTL
- Handles connection pooling and error logging
- Used by all services for state management

**`backend/services/granite_client.py`** - GraniteClient wrapper
- LLM interface for Ollama/Gemma3
- Methods: `generate()`, `plan_phase72_next_step()`, `summarize()`, `embed()`
- Handles HTTP requests to Ollama API with timeout/retry

### 2. Wired General Agent API

**`backend/api/agent_api.py`** - Updated with:
```python
# Real initialization
redis_cache = RedisCache(CFG.redis_url)
granite_client = GraniteClient({
    "ollama_url": CFG.ollama_url,
    "ollama_model": "gemma3:latest"
})

_aca = AgentContextAnchor(redis_cache=redis_cache, granite_client=granite_client)
_planner = AgentPlanner(redis_url=CFG.redis_url, granite_config={...}, neo4j_config={...})
_alignment = AlignmentRouter(redis_cache=redis_cache, neo4j_uri=CFG.neo4j_uri, ...)
_ace = AceOrchestrator(aca=_aca, phase72_ctx=None, planner=_planner, alignment=_alignment, llm_client=granite_client)
```

**Endpoints:**
- `POST /api/agent/next_step` - Get next action for general sessions
- `POST /api/agent/record_event` - Record timeline event
- `GET /api/agent/timeline/{session_id}` - Get timeline

### 3. Wired Phase72 Agent API

**`backend/api/phase72_agent_api.py`** - Updated with:
```python
# Real initialization (same pattern as general API)
redis_cache = RedisCache(CFG.redis_url)
granite_client = GraniteClient({...})

_aca = AgentContextAnchor(redis_cache=redis_cache, granite_client=granite_client)
_phase72_ctx = Phase72AgentContext(redis_cache=redis_cache, granite_client=granite_client)
_planner = AgentPlanner(redis_url=CFG.redis_url, granite_config={...}, neo4j_config={...})
_alignment = AlignmentRouter(redis_cache=redis_cache, neo4j_uri=CFG.neo4j_uri, ...)
_ace = AceOrchestrator(aca=_aca, phase72_ctx=_phase72_ctx, planner=_planner, alignment=_alignment, llm_client=granite_client)
```

**Endpoints:**
- `POST /api/phase72/next_step` - Get next action for Phase72 error reduction
- `POST /api/phase72/record_event` - Record timeline event
- `GET /api/phase72/timeline/{session_id}` - Get timeline

### 4. Error Handling & Logging

Both APIs now have:
- Try/except blocks during initialization with detailed logging
- Service availability checks before each endpoint call
- Proper HTTP 500 errors with descriptive messages
- Full exception tracebacks in logs

## Data Flow

```
CLI Request
  ↓
POST /api/phase72/next_step
  ↓
Phase72NextStepRequest (session_id, message, role, default_goal)
  ↓
_ace.plan_phase72_next_action()
  ├─ _phase72_ctx.ensure_summaries() → get ACA context
  ├─ _phase72_ctx.build_phase72_prompt() → build prompt
  ├─ granite_client.generate() → call LLM
  ├─ parse TOOL/ARGS/REASON from output
  └─ _phase72_ctx.append_timeline() → log decision
  ↓
Phase72NextStepResponse (tool, args, reason, aca_marker, raw_llm_output)
  ↓
CLI renders result
```

## Testing the Wiring

### 1. Start Infrastructure
```bash
docker-compose up -d redis postgres neo4j qdrant ollama
```

### 2. Start Backend
```bash
cd backend
uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload
```

### 3. Test General Agent API
```bash
curl -X POST http://localhost:8000/api/agent/next_step \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "general:test:1",
    "message": "what should I search for?",
    "role": "user"
  }'
```

Expected response:
```json
{
  "session_id": "general:test:1",
  "role": "user",
  "tool": "rag_search",
  "args": {"query": "..."},
  "reason": "...",
  "raw_llm_output": "..."
}
```

### 4. Test Phase72 Agent API
```bash
curl -X POST http://localhost:8000/api/phase72/next_step \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "phase72:deeds-web-app:main",
    "message": "what should I fix next?",
    "role": "warden"
  }'
```

Expected response:
```json
{
  "session_id": "phase72:deeds-web-app:main",
  "role": "warden",
  "tool": "run_svelte_check",
  "args": {"command": "svelte-check", "cwd": "..."},
  "reason": "...",
  "raw_llm_output": "...",
  "aca_marker": "[[ACA72:phase72:deeds-web-app:main:s1:p1]]"
}
```

### 5. Test CLI Integration
```bash
node tools/yo-rha-agent.mjs "phase72:deeds-web-app:main" "what should I fix next?"
```

## Next Steps

1. **Verify Redis/Neo4j/Ollama are running** - Check logs for connection errors
2. **Test endpoints** - Use curl or Postman to verify responses
3. **Wire CLI** - Update `tools/yo-rha-agent.mjs` to call `/api/phase72/next_step`
4. **Add Tool Execution** - Create `/api/phase72/next_step_and_execute` endpoint
5. **Connect UI** - Wire Svelte phase72-chat page to call endpoints

## Files Modified/Created

- ✅ `backend/services/redis_cache.py` - NEW
- ✅ `backend/services/granite_client.py` - NEW
- ✅ `backend/api/agent_api.py` - UPDATED with real wiring
- ✅ `backend/api/phase72_agent_api.py` - UPDATED with real wiring
- ✅ `backend/api/main.py` - Already includes both routers
- ✅ `backend/services/ace_orchestrator.py` - Already exists, used by both APIs

## Status

🟢 **Ready to test** - All wiring is in place. Start infrastructure and backend, then test endpoints.
