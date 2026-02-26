# ACE Test Commands

## Prerequisites

Before running these commands, ensure:

1. **Infrastructure is running**
   ```bash
   docker-compose up -d redis postgres neo4j qdrant ollama
   ```

2. **Ollama has gemma3 model**
   ```bash
   ollama list
   # Should show: gemma3:latest

   # If not, pull it:
   ollama pull gemma3:latest
   ```

3. **Backend is running**
   ```bash
   cd backend
   uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload
   ```

4. **API is responding**
   ```bash
   curl http://localhost:8000/health
   # Should return: {"status":"ok","service":"legal-ai-backend"}
   ```

## Test Commands

### 1. Health Check

```bash
curl http://localhost:8000/health
```

**Expected Response:**
```json
{"status":"ok","service":"legal-ai-backend"}
```

---

### 2. Test General Agent API

#### Get Next Action (General)

```bash
curl -X POST http://localhost:8000/api/agent/next_step \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "general:test:1",
    "message": "what should I search for?",
    "role": "user",
    "default_goal": "Assist with legal search and analysis."
  }'
```

**Expected Response:**
```json
{
  "session_id": "general:test:1",
  "role": "user",
  "tool": "rag_search",
  "args": {"query": "..."},
  "reason": "...",
  "raw_llm_output": "TOOL: rag_search\nARGS: {...}\nREASON: ..."
}
```

#### Record Event (General)

```bash
curl -X POST http://localhost:8000/api/agent/record_event \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "general:test:1",
    "kind": "user-query",
    "payload": {"query": "what should I search for?"},
    "description": "User asked a question"
  }'
```

**Expected Response:**
```json
{"status":"recorded","session_id":"general:test:1"}
```

#### Get Timeline (General)

```bash
curl http://localhost:8000/api/agent/timeline/general:test:1
```

**Expected Response:**
```json
{
  "session_id": "general:test:1",
  "events": [
    {
      "id": "...",
      "ts": "2025-11-28T...",
      "kind": "user-query",
      "payload": {"query": "..."},
      "description": "User asked a question"
    }
  ]
}
```

---

### 3. Test Phase72 Agent API

#### Get Next Action (Phase72)

```bash
curl -X POST http://localhost:8000/api/phase72/next_step \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "phase72:deeds-web-app:main",
    "message": "what should I fix next?",
    "role": "warden",
    "default_goal": "Reduce TypeScript errors and stabilize the codebase."
  }'
```

**Expected Response:**
```json
{
  "session_id": "phase72:deeds-web-app:main",
  "role": "warden",
  "tool": "run_svelte_check",
  "args": {"command": "svelte-check", "cwd": "..."},
  "reason": "TypeScript errors are the highest priority...",
  "raw_llm_output": "TOOL: run_svelte_check\nARGS: {...}\nREASON: ...",
  "aca_marker": "[[ACA72:phase72:deeds-web-app:main:s1:p1]]"
}
```

#### Record Event (Phase72)

```bash
curl -X POST http://localhost:8000/api/phase72/record_event \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "phase72:deeds-web-app:main",
    "kind": "svelte-check",
    "payload": {"total_errors": 1234, "errors_by_type": {"type-error": 800, "unused-var": 434}},
    "description": "Ran svelte-check and found 1234 errors"
  }'
```

**Expected Response:**
```json
{"status":"recorded","session_id":"phase72:deeds-web-app:main"}
```

#### Get Timeline (Phase72)

```bash
curl http://localhost:8000/api/phase72/timeline/phase72:deeds-web-app:main
```

**Expected Response:**
```json
{
  "session_id": "phase72:deeds-web-app:main",
  "events": [
    {
      "id": "...",
      "ts": "2025-11-28T...",
      "kind": "svelte-check",
      "payload": {"total_errors": 1234, ...},
      "description": "Ran svelte-check and found 1234 errors"
    }
  ],
  "summary": "Session has 1234 TypeScript errors..."
}
```

---

### 4. Test with Different Roles

#### Prosecutor Role (Read-Only)

```bash
curl -X POST http://localhost:8000/api/phase72/next_step \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "phase72:deeds-web-app:main",
    "message": "what should I fix next?",
    "role": "prosecutor"
  }'
```

#### Admin Role (Full Control)

```bash
curl -X POST http://localhost:8000/api/phase72/next_step \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "phase72:deeds-web-app:main",
    "message": "what should I fix next?",
    "role": "admin"
  }'
```

---

### 5. Test with Different Messages

#### Ask for Specific Tool

```bash
curl -X POST http://localhost:8000/api/phase72/next_step \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "phase72:deeds-web-app:main",
    "message": "run svelte-check to see what errors we have",
    "role": "warden"
  }'
```

#### Ask for Analysis

```bash
curl -X POST http://localhost:8000/api/phase72/next_step \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "phase72:deeds-web-app:main",
    "message": "analyze the error patterns and suggest a fix strategy",
    "role": "warden"
  }'
```

#### Ask for Search

```bash
curl -X POST http://localhost:8000/api/phase72/next_step \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "phase72:deeds-web-app:main",
    "message": "search for similar TypeScript errors in our codebase",
    "role": "warden"
  }'
```

---

### 6. Test CLI Script

```bash
# Basic test
node tools/test-phase72-ace.mjs "phase72:deeds-web-app:main" "what should I fix next?"

# With custom role
node tools/test-phase72-ace.mjs "phase72:deeds-web-app:main" "what should I fix next?" "prosecutor"

# With custom API URL
API_URL=http://localhost:8000 node tools/test-phase72-ace.mjs "phase72:deeds-web-app:main" "what should I fix next?"
```

---

## Troubleshooting

### Error: Connection refused

**Problem**: `curl: (7) Failed to connect to localhost port 8000`

**Solution**:
1. Check backend is running: `ps aux | grep uvicorn`
2. Start backend: `cd backend && uvicorn api.main:app --port 8000`

### Error: 500 Internal Server Error

**Problem**: `{"detail":"Phase72 services not initialized. Check logs for details."}`

**Solution**:
1. Check backend logs for initialization errors
2. Verify Redis is running: `redis-cli ping`
3. Verify Ollama is running: `curl http://localhost:11434/api/tags`
4. Verify Neo4j is running: `curl http://localhost:7474/`

### Error: Ollama model not found

**Problem**: `Error generating text: ...`

**Solution**:
1. Check available models: `ollama list`
2. Pull gemma3: `ollama pull gemma3:latest`
3. Verify Ollama is running: `ollama serve`

### Error: Redis connection failed

**Problem**: `⚠️  Redis connection failed: ...`

**Solution**:
1. Check Redis is running: `redis-cli ping`
2. Start Redis: `docker-compose up -d redis`
3. Verify Redis URL in config: `echo $REDIS_URL`

---

## Performance Expectations

| Operation | Expected Time |
|-----------|---------------|
| Health check | <100ms |
| Get next action (cold) | 2-5s (LLM generation) |
| Get next action (warm) | 1-2s (cached) |
| Record event | <100ms |
| Get timeline | <100ms |

---

## Next Steps After Testing

1. ✅ Verify all endpoints respond correctly
2. ✅ Check timeline events are logged
3. ✅ Verify ACA markers are generated
4. 🔄 Create tool router for tool execution
5. 🔄 Wire CLI to call endpoints
6. 🔄 Build Svelte UI

---

**Last Updated**: 2025-11-28
**Status**: Ready for testing
