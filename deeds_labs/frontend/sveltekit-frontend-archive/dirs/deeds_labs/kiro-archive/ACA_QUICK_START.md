# ACA Quick Start Checklist

## ✅ Pre-Flight Checks

- [ ] Redis running: `redis-cli ping` → `PONG`
- [ ] Python 3.9+ installed: `python --version`
- [ ] Node.js 16+ installed: `node --version`
- [ ] Backend dependencies installed: `pip install -r requirements.txt`
- [ ] Granite client configured in `backend/api/agent_api.py`

## 🚀 Start Services

### 1. Start Redis (if not already running)
```bash
redis-server
```

### 2. Start Backend
```bash
cd /path/to/deeds-web-app
python -m uvicorn backend.api.main:app --host 0.0.0.0 --port 8000
```

Expected output:
```
INFO:     Uvicorn running on http://0.0.0.0:8000
INFO:     Application startup complete
```

### 3. Verify Backend is Live
```bash
curl http://localhost:8000/health
# Expected: {"status":"ok","service":"legal-ai-backend"}
```

## 🧪 Test ACA

### Run End-to-End Test
```bash
node tools/test-agent-api.mjs
```

Expected output:
```
🤖 Testing Agent API with ACA...

1️⃣  Initializing session with plan...
✅ Session initialized
   Action: search
   Reason: New case ingested - should search for relevant legal precedents
   ACA Marker: [[ACA:doj_v_foo:test_user:s1:p1]]
   Summary version: 1
   Spec version: 1

2️⃣  Recording timeline events...
✅ Event recorded

3️⃣  Getting next recommended step...
✅ Next step retrieved
   Action: search
   Reason: Multiple searches completed - ready to summarize findings
   Confidence: 0.8

4️⃣  Fetching timeline...
✅ Timeline retrieved
   Events: 2
   Summary: Session summary...

5️⃣  Recovering context from marker...
✅ Context recovered from marker
   Session ID: doj_v_foo:test_user
   Summary version: 1
   Spec version: 1
   Plan goal: analyze supremacy clause conflict with AB 32

🎉 All tests passed!
```

## 🔍 Manual Testing

### Initialize Session
```bash
curl -X POST http://localhost:8000/api/agent/next_step \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "doj_v_foo:user123",
    "goal": "analyze supremacy clause conflict with AB 32",
    "spec_files": [
      ".kiro/specs/legal-agentic-alignment-search/requirements.md",
      ".kiro/specs/legal-agentic-alignment-search/design.md"
    ]
  }'
```

### Record Event
```bash
curl -X POST http://localhost:8000/api/agent/record_event \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "doj_v_foo:user123",
    "kind": "search",
    "payload": {"query": "Supremacy Clause"},
    "description": "Searched for Supremacy Clause precedents"
  }'
```

### Get Next Step
```bash
curl -X POST http://localhost:8000/api/agent/next_step \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "doj_v_foo:user123",
    "user_message": "What should I do next?"
  }'
```

### Get Timeline
```bash
curl http://localhost:8000/api/agent/timeline/doj_v_foo:user123
```

### Recover Context from Marker
```bash
curl -X POST http://localhost:8000/api/agent/recover_context \
  -H "Content-Type: application/json" \
  -d '{
    "marker": "[[ACA:doj_v_foo:user123:s1:p1]]"
  }'
```

## 📊 Monitor Redis

### Check Session Plan
```bash
redis-cli get "agent:plan:doj_v_foo:user123"
```

### Check Timeline Events
```bash
redis-cli lrange "agent:timeline:doj_v_foo:user123" 0 -1
```

### Check Summaries
```bash
redis-cli get "agent:summary:doj_v_foo:user123:1"
redis-cli get "agent:spec_summary:doj_v_foo:user123:1"
```

### List All ACA Keys
```bash
redis-cli keys "agent:*"
```

## 🐛 Troubleshooting

### Backend won't start
```bash
# Check if port 8000 is in use
lsof -i :8000

# Kill process if needed
kill -9 <PID>

# Try different port
python -m uvicorn backend.api.main:app --host 0.0.0.0 --port 8001
```

### Redis connection error
```bash
# Check Redis is running
redis-cli ping

# Start Redis if needed
redis-server

# Check Redis config
redis-cli config get "*"
```

### Granite client error
```bash
# Verify Granite config in backend/api/agent_api.py
# Check credentials and endpoint

# Test Granite connection
python -c "from backend.services.granite_client import GraniteClient; print('OK')"
```

### Test script fails
```bash
# Check backend is running
curl http://localhost:8000/health

# Check Redis is running
redis-cli ping

# Run with verbose output
DEBUG=* node tools/test-agent-api.mjs
```

## 📚 Documentation

- **Full Design**: `.kiro/AGENTIC_CONTEXT_ANCHOR.md`
- **Implementation Summary**: `.kiro/ACA_IMPLEMENTATION_SUMMARY.md`
- **This Checklist**: `.kiro/ACA_QUICK_START.md`

## 🎯 Next Steps After Testing

1. **Integrate into chat driver**
   ```python
   from backend.services.agent_planner import AgentPlanner

   planner = AgentPlanner(redis_url, granite_config, neo4j_config)

   # Before LLM call
   system, user = planner.build_llm_prompt_with_aca(
       session_id, goal, user_message
   )

   # After LLM call
   planner.check_context_overflow(session_id, goal)
   ```

2. **Wire into VS Code**
   - Show ACA marker in status bar
   - Display timeline in sidebar
   - Allow manual context recovery

3. **Add TRT hook** (optional)
   - Define `<|CTX_RECALL|>` token
   - Add stopping criterion in decode loop
   - Fetch ACA from Redis on recall

4. **Monitor in production**
   - Log token estimates
   - Alert on compaction events
   - Track summary versions

## 💡 Tips

- **Token estimation**: Default is 1 token ≈ 4 chars. Refine with actual tokenizer.
- **Safety margin**: Default 0.7 (compact at 70% of limit). Adjust based on model.
- **Spec files**: Use absolute paths or paths relative to workspace root.
- **Latent markers**: Can be embedded in system prompt or user message.
- **Context recovery**: Decode marker to fetch summaries without re-running ripgrep.

## 🔗 Related Systems

- **CHR97 Memory Palace**: `.kiro/GPU_MEMORY_PALACE_COMPLETE.md`
- **Alignment Router**: `backend/services/alignment_router.py`
- **Search API**: `backend/api/search_api.py`
- **Agent Planner**: `backend/services/agent_planner.py`

---

**Status**: ✅ Ready to test

**Last Updated**: 2025-11-28

**Questions?** Check `.kiro/AGENTIC_CONTEXT_ANCHOR.md` for full design details.
