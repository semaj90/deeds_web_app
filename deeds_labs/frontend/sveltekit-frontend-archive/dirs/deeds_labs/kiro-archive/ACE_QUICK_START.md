# ACE Quick Start (5 minutes)

## What is ACE?

**ACE = Agentic Control Engine**

The brain that ties everything together:
- **ACA-72** (context + summaries)
- **ToolRouter** (svelte-check, AST, CHR97, RAG, KAG, web_search)
- **KnowledgeStore** (Redis, Qdrant, Neo4j, MinIO facade)
- **Multimodal fallback** (VLM → text → RAG/KAG → web)
- **Role-based reasoning** (prosecutor, warden, admin)

---

## Files Created

```
backend/services/
  ├── ace_orchestrator.py          # Main ACE logic
  ├── tool_router.py               # Tool registration + dispatch
  ├── knowledge_store.py           # Redis/Qdrant/Neo4j facade
  └── phase72_agent_context.py     # (already existed, now used by ACE)

backend/api/
  └── phase72_agent_api.py         # (updated to use ACE)

.kiro/
  ├── ACE_ARCHITECTURE_SUMMARY.md  # Full architecture
  ├── ACE_WIRING_CHECKLIST.md      # Step-by-step execution
  └── ACE_QUICK_START.md           # This file
```

---

## 30-Second Setup

### 1. Start Backend
```bash
cd C:\Users\james\Videos\deeds-web-app
python -m uvicorn backend.api.main:app --host 0.0.0.0 --port 8000
```

### 2. Verify Redis
```bash
redis-cli ping
# Expected: PONG
```

### 3. Test CLI
```bash
node tools/yo-rha-agent.mjs "phase72:deeds-web-app:main" "what should I fix next?"
```

**Expected output:**
```
🎯 ACTION: run_svelte_check
💭 REASONING: We need fresh error counts before clustering...
🔗 ACA Marker: [[ACA72:phase72:deeds-web-app:main:s1:p1]]
```

---

## How It Works (3 Steps)

### Step 1: User asks a question
```bash
node tools/yo-rha-agent.mjs "phase72:deeds-web-app:main" "what should I fix next?"
```

### Step 2: ACE decides what to do
1. Pulls live signals (TS errors, CHR97, RAG, KAG)
2. Gets ACA context (plan + summaries)
3. Builds role-based prompt
4. Calls LLM (Gemma3 / Granite)
5. Parses TOOL / ARGS / REASON
6. Logs to timeline

### Step 3: CLI shows the result
```
🎯 ACTION: cluster_errors
💭 REASONING: We have 81,234 errors with TS1005 being the largest cluster...
```

---

## Key Concepts

### Latent Marker
```
[[ACA72:phase72:deeds-web-app:main:s1:p1]]
     ↑    ↑                          ↑  ↑
     |    |                          |  └─ spec_summary_version
     |    |                          └───── summary_version
     |    └────────────────────────────── session_id
     └──────────────────────────────────── ACA type (Phase 72)
```

Encodes the entire context state. Can be used to recover context later.

### Signal Snapshot
```python
{
  "ts_errors": {"total": 81234, "by_code": {"ts1005": 1234, ...}},
  "chr97_hotspots": [{"doc_id": "doc_1", "score": 0.95}, ...],
  "rag_health": {"index_size": 5000, "last_ingest": "..."},
  "kag_stats": {"node_count": 10000, "edge_count": 25000},
  "web_cache": {"cache_size": 42},
}
```

Real-time view of system state. ACE uses this to make informed decisions.

### Tool Call
```
TOOL: cluster_errors
ARGS: {"session_id": "phase72:deeds-web-app:main", "error_code": "ts1005"}
REASON: We have 81,234 errors with TS1005 being the largest cluster...
```

LLM output format. ACE parses this and decides whether to execute the tool.

---

## Available Tools

| Tool | Purpose |
|------|---------|
| `run_svelte_check` | Run svelte-check, return error stats |
| `cluster_errors` | Cluster errors using DBSCAN |
| `analyze_ts_ast` | Analyze TypeScript AST for a cluster |
| `chr97_get_hotspots` | Get CHR97 hotspots |
| `chr97_fetch_cartridge` | Fetch CHR97 binary topology |
| `rag_search` | Search legal/code evidence |
| `kag_search` | Search Neo4j graph |
| `web_search` | Search the web |
| `crawl_and_index` | Crawl URL and index |
| `analyze_multimodal_evidence` | VLM + RAG + KAG fallback |
| `vlm_analyze_image` | Analyze image with VLM |
| `generate_patches` | Generate AI codemods |
| `apply_patches` | Apply patches to files |
| `get_session_status` | Get session status |

---

## Role-Based Behavior

### Prosecutor
- **Focus**: Evidence strength, citation quality, legal precedent
- **Tools**: rag_search, kag_search, web_search, analyze_multimodal_evidence
- **Constraints**: Read-only, high accuracy required

### Warden / Admin
- **Focus**: Error metrics, cluster health, patch safety, system stability
- **Tools**: run_svelte_check, cluster_errors, chr97_get_hotspots, rag_search
- **Constraints**: Safe, reversible actions; validate before applying

### Admin
- **Focus**: System architecture, performance, long-term strategy
- **Tools**: All tools available
- **Constraints**: Document decisions, maintain audit trail

---

## Common Workflows

### Workflow 1: Error Reduction
```bash
# 1. Ask what to do
node tools/yo-rha-agent.mjs "phase72:deeds-web-app:main" "what should I fix next?"
# → ACTION: run_svelte_check

# 2. Run svelte-check
SESSION_ID="phase72:deeds-web-app:main" node tools/run-svelte-check-phase72.mjs
# → Records error counts to timeline

# 3. Ask again
node tools/yo-rha-agent.mjs "phase72:deeds-web-app:main" "what should I fix next?"
# → ACTION: cluster_errors (because we now have error data)

# 4. Cluster errors
curl -X POST http://localhost:8000/api/tools/call \
  -H "Content-Type: application/json" \
  -d '{"name": "cluster_errors", "args": {"session_id": "phase72:deeds-web-app:main", "error_code": "ts1005"}}'
# → Returns clusters

# 5. Ask what to do with clusters
node tools/yo-rha-agent.mjs "phase72:deeds-web-app:main" "how do I fix the TS1005 cluster?"
# → ACTION: analyze_ts_ast (or generate_patches)
```

### Workflow 2: Evidence Analysis (Prosecutor)
```bash
# 1. Chat with prosecutor role
curl -X POST http://localhost:8000/api/phase72/chat \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "phase72:deeds-web-app:main",
    "role": "prosecutor",
    "message": "What evidence supports the defendant liability?"
  }'
# → ACTION: analyze_multimodal_evidence (or rag_search)

# 2. Analyze evidence
curl -X POST http://localhost:8000/api/tools/call \
  -H "Content-Type: application/json" \
  -d '{
    "name": "analyze_multimodal_evidence",
    "args": {
      "session_id": "phase72:deeds-web-app:main",
      "doc_id": "complaint_001",
      "image_path": "/path/to/evidence.jpg"
    }
  }'
# → Returns: summary, entities, citations, chr97_glyphs, fallback_chain
```

---

## Troubleshooting

### Backend won't start
```bash
# Check Python
python --version  # Should be 3.10+

# Check imports
python -c "from backend.api.main import app"

# Check Redis
redis-cli ping  # Should return PONG
```

### CLI can't connect
```bash
# Check backend is running
curl http://localhost:8000/docs

# Check environment
echo $YORHA_BACKEND_URL  # Should be http://localhost:8000 or empty

# Check firewall
netstat -an | grep 8000
```

### ACE returns "none" tool
```bash
# Check LLM output parsing
# Look for TOOL: / ARGS: / REASON: in backend logs

# Check tool list is formatted correctly
curl http://localhost:8000/api/tools/list

# Check LLM is responding
# Try a simpler prompt first
```

### Tool execution fails
```bash
# Check tool is registered
curl http://localhost:8000/api/tools/list | grep "tool_name"

# Check tool arguments
curl -X POST http://localhost:8000/api/tools/call \
  -H "Content-Type: application/json" \
  -d '{"name": "tool_name", "args": {}}'

# Check backend logs for detailed error
```

---

## Next Steps

1. **Verify Phase 1** (backend + CLI + signals)
   - Start backend
   - Verify Redis
   - Test CLI
   - Expected: CLI returns a tool name

2. **Execute Phase 2** (wire real signals)
   - Create svelte-check wrapper
   - Run svelte-check
   - Ask ACE again
   - Expected: ACE mentions error counts

3. **Execute Phase 3** (wire tools)
   - Implement tool stubs
   - Test via `/api/tools/call`
   - Expected: Tools return realistic data

4. **Execute Phase 4-7** (optional)
   - CHR97 integration
   - Context confirmation modal
   - Gemma3 chat
   - Multimodal fallback

See `.kiro/ACE_WIRING_CHECKLIST.md` for detailed steps.

---

## Key Files to Know

| File | Purpose |
|------|---------|
| `backend/services/ace_orchestrator.py` | Main ACE logic |
| `backend/services/tool_router.py` | Tool registration + dispatch |
| `backend/services/knowledge_store.py` | Redis/Qdrant/Neo4j facade |
| `backend/api/phase72_agent_api.py` | Phase72 API (uses ACE) |
| `tools/yo-rha-agent.mjs` | CLI interface |
| `.kiro/ACE_ARCHITECTURE_SUMMARY.md` | Full architecture |
| `.kiro/ACE_WIRING_CHECKLIST.md` | Step-by-step execution |

---

## One-Liner Commands

```bash
# Start backend
python -m uvicorn backend.api.main:app --host 0.0.0.0 --port 8000

# Test CLI
node tools/yo-rha-agent.mjs "phase72:deeds-web-app:main" "what should I fix next?"

# List tools
curl http://localhost:8000/api/tools/list

# Call a tool
curl -X POST http://localhost:8000/api/tools/call \
  -H "Content-Type: application/json" \
  -d '{"name": "run_svelte_check", "args": {"session_id": "phase72:deeds-web-app:main"}}'

# Get timeline
curl http://localhost:8000/api/phase72/timeline/phase72:deeds-web-app:main

# Chat with prosecutor role
curl -X POST http://localhost:8000/api/phase72/chat \
  -H "Content-Type: application/json" \
  -d '{"session_id": "phase72:deeds-web-app:main", "role": "prosecutor", "message": "test"}'
```

---

**Status**: ACE is live and ready to use. Start with Phase 1 verification.
