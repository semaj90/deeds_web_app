# ACE Architecture Summary

**ACE = Agentic Control Engine**

The missing piece that ties ACA + Phase72 + CHR97 + tools + knowledge store into one coherent "brain."

---

## The Big Picture

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER / CLI                              │
│  "what should I fix next?" → yo-rha-agent.mjs                  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PHASE72 API (/next_step)                     │
│  - Receives user message                                        │
│  - Calls ACE.plan_next_action()                                │
│  - Returns { tool, args, reason, aca_marker }                  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ACE ORCHESTRATOR                             │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ 1. Build signal snapshot (TS errors, CHR97, RAG, KAG)   │  │
│  │ 2. Get ACA context (plan + summaries + marker)          │  │
│  │ 3. Build role-based prompt (prosecutor/warden/admin)    │  │
│  │ 4. Call LLM (Gemma3 / Granite)                          │  │
│  │ 5. Parse TOOL / ARGS / REASON from output               │  │
│  │ 6. Log to timeline                                      │  │
│  │ 7. Optionally execute tool                              │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                ┌────────────┼────────────┐
                ▼            ▼            ▼
        ┌────────────┐ ┌────────────┐ ┌────────────┐
        │ ToolRouter │ │ Knowledge  │ │ ACA-72     │
        │            │ │ Store      │ │            │
        │ - Tools    │ │            │ │ - Plan     │
        │ - Dispatch │ │ - RAG      │ │ - Timeline │
        │            │ │ - KAG      │ │ - Summary  │
        │ run_svelte │ │ - CHR97    │ │ - Marker   │
        │ cluster    │ │ - VLM      │ │            │
        │ analyze_ts │ │ - Web      │ │            │
        │ chr97_get  │ │            │ │            │
        │ rag_search │ │            │ │            │
        │ kag_search │ │            │ │            │
        │ web_search │ │            │ │            │
        │ multimodal │ │            │ │            │
        └────────────┘ └────────────┘ └────────────┘
                │            │            │
                └────────────┼────────────┘
                             │
                ┌────────────┴────────────┐
                ▼                         ▼
        ┌────────────────┐        ┌────────────────┐
        │ Redis / Qdrant │        │ Neo4j / MinIO  │
        │ Postgres       │        │ CHR97 gRPC     │
        │ Ollama         │        │ Granite VLM    │
        └────────────────┘        └────────────────┘
```

---

## Key Components

### 1. ACE Orchestrator (`backend/services/ace_orchestrator.py`)

**Purpose**: Single entry point that sees everything and decides what to do next.

**Main method**: `plan_next_action(session_id, role, user_message)`

**What it does**:
1. Pulls live signals from all services (TS errors, CHR97, RAG, KAG, web cache)
2. Gets ACA context (plan + summaries + latent marker)
3. Builds role-based prompt (prosecutor/warden/admin)
4. Calls LLM (Gemma3 / Granite)
5. Parses TOOL / ARGS / REASON from output
6. Logs to timeline
7. Optionally executes tool

**Returns**:
```python
{
    "tool": "run_svelte_check",
    "args": {"session_id": "phase72:deeds-web-app:main"},
    "reason": "We need fresh error counts before clustering.",
    "raw_llm_output": "...",
    "tool_result": None,  # if auto_execute_tool=True
}
```

### 2. ToolRouter (`backend/services/tool_router.py`)

**Purpose**: MCP-style A2A tool calling interface.

**Available tools**:
- `run_svelte_check` - Run svelte-check, return error stats
- `cluster_errors` - Cluster errors using DBSCAN
- `analyze_ts_ast` - Analyze TypeScript AST for a cluster
- `chr97_get_hotspots` - Get CHR97 hotspots
- `chr97_fetch_cartridge` - Fetch CHR97 binary topology
- `rag_search` - Search legal/code evidence
- `kag_search` - Search Neo4j graph
- `web_search` - Search the web
- `crawl_and_index` - Crawl URL and index
- `analyze_multimodal_evidence` - VLM + RAG + KAG fallback
- `vlm_analyze_image` - Analyze image with VLM
- `generate_patches` - Generate AI codemods
- `apply_patches` - Apply patches to files
- `get_session_status` - Get session status

**How to use**:
```python
# Register a tool
@router.register
def my_tool(args: Dict[str, Any]) -> Dict[str, Any]:
    """Tool description."""
    return {"result": "..."}

# Call a tool
result = router.call("my_tool", {"arg1": "value1"})

# List tools
tools = router.list_tools()
```

### 3. KnowledgeStore (`backend/services/knowledge_store.py`)

**Purpose**: Facade over Redis, Qdrant, Neo4j, MinIO, CHR97 gRPC, etc.

**Methods**:
- Chat / timeline: `log_chat()`, `search_chat()`
- RAG: `search_text()`
- KAG: `search_graph()`
- CHR97: `get_chr97_hotspots()`, `get_chr97_runes()`
- VLM: `vlm_analyze_image()`, `extract_text_entities()`
- Web: `web_search_and_index()`, `get_web_search_cache_status()`
- Metrics: `get_ts_error_stats()`, `get_rag_health()`, `get_kag_stats()`

**Why it matters**: Tools don't care if data lives in Redis or Qdrant; they just call `knowledge_store.search_text()`.

### 4. Phase72AgentContext (ACA-72) (`backend/services/phase72_agent_context.py`)

**Purpose**: Specializes ACA for Neo4j-based AST error reduction.

**Tracks**:
- Error counts and clusters
- Patches and git commits
- User feedback
- Timeline events

**Key methods**:
- `ensure_summaries()` - Get plan + summaries + latent marker
- `append_timeline()` - Log event to timeline
- `get_timeline_snippet()` - Get recent events as text
- `recover_context()` - Decode latent marker

---

## Data Flow Example

### User asks: "what should I fix next?"

1. **CLI** sends request to `/api/phase72/next_step`
   ```
   POST /api/phase72/next_step
   {
     "session_id": "phase72:deeds-web-app:main",
     "message": "what should I fix next?",
     "default_goal": "Reduce TypeScript errors from ~80k to <1k"
   }
   ```

2. **Phase72 API** calls `ace.plan_next_action()`

3. **ACE** builds signal snapshot:
   ```python
   signals = {
     "ts_errors": {"total": 81234, "by_code": {"ts1005": 1234, ...}},
     "chr97_hotspots": [{"doc_id": "doc_1", "score": 0.95}, ...],
     "rag_health": {"index_size": 5000, "last_ingest": "2025-11-28T..."},
     "kag_stats": {"node_count": 10000, "edge_count": 25000},
     "web_cache": {"cache_size": 42},
   }
   ```

4. **ACE** gets ACA context:
   ```python
   aca_ctx = {
     "summary_text": "Current error count: 81,234 (down from ~81,000)...",
     "spec_text": "Phase 72 uses Neo4j to cluster errors...",
     "latent_marker": "[[ACA72:phase72:deeds-web-app:main:s1:p1]]",
     "goal": "Reduce TypeScript errors from ~80k to <1k",
   }
   ```

5. **ACE** builds role-based prompt:
   ```
   SYSTEM:
   You are ACE (Agentic Control Engine) for session phase72:deeds-web-app:main.

   ROLE: WARDEN / ADMIN
   You are monitoring system health, legal risk, and error reduction progress.
   - Focus on: error metrics, cluster health, patch safety, system stability
   - Tools available: run_svelte_check, cluster_errors, chr97_get_hotspots, rag_search
   - Constraints: prefer safe, reversible actions; validate before applying
   - Goal: Keep the system healthy and error count trending down

   Agentic Context Anchor: [[ACA72:phase72:deeds-web-app:main:s1:p1]]

   HIGH-LEVEL GOAL:
   Reduce TypeScript errors from ~80k to <1k using Phase 72 pipeline.

   CURRENT PROGRESS SUMMARY:
   Current error count: 81,234 (down from ~81,000). Clusters addressed: none yet. Pending: TS1005, TS2307, TS2339...

   LIVE SIGNALS:
   - TypeScript errors: {"total": 81234, "by_code": {"ts1005": 1234, ...}}
   - CHR97 hotspots: [{"doc_id": "doc_1", "score": 0.95}, ...]
   - RAG health: {"index_size": 5000, "last_ingest": "2025-11-28T..."}
   - KAG graph: {"node_count": 10000, "edge_count": 25000}
   - Web search cache: {"cache_size": 42}

   AVAILABLE TOOLS:
   - run_svelte_check: Run svelte-check and return aggregated error stats.
   - cluster_errors: Cluster TypeScript errors using DBSCAN.
   - analyze_ts_ast: Analyze TypeScript AST for a specific error cluster.
   - chr97_get_hotspots: Get CHR97 hotspots (high-priority regions in binary topology).
   - rag_search: Search legal/code evidence via RAG (Qdrant + Postgres).
   - kag_search: Search Neo4j graph for statutes, relationships, precedents.
   - web_search: Search the web for recent legal/technical information.
   - analyze_multimodal_evidence: Analyze evidence (image + text) with VLM + RAG + KAG fallback.

   RULES:
   1. Prefer safe, reversible actions.
   2. Use tools instead of guessing.
   3. When unsure about context, ask the user or use context confirmation.
   4. Output exactly ONE tool to call next in this format:
      TOOL: <tool_name>
      ARGS: <JSON object>
      REASON: <short reason>

   USER MESSAGE:
   what should I fix next?

   RECENT TIMELINE:
   [2025-11-28T14:30:15Z] svelte-check: Ran svelte-check: 81234 errors
   [2025-11-28T14:25:00Z] session_init: Session initialized: Reduce TypeScript errors from ~80k to <1k
   ```

6. **LLM** (Gemma3 / Granite) responds:
   ```
   TOOL: cluster_errors
   ARGS: {"session_id": "phase72:deeds-web-app:main", "error_code": "ts1005"}
   REASON: We have 81,234 errors with TS1005 being the largest cluster (1,234 instances).
   Clustering will help us find patterns and generate targeted codemods.
   ```

7. **ACE** parses output:
   ```python
   {
     "tool": "cluster_errors",
     "args": {"session_id": "phase72:deeds-web-app:main", "error_code": "ts1005"},
     "reason": "We have 81,234 errors with TS1005 being the largest cluster (1,234 instances)...",
     "raw_llm_output": "TOOL: cluster_errors\nARGS: {...}\nREASON: ...",
     "tool_result": None,  # not auto-executed
   }
   ```

8. **ACE** logs to timeline:
   ```python
   aca72.append_timeline(
     session_id="phase72:deeds-web-app:main",
     kind="ace-plan",
     payload={
       "role": "warden",
       "message": "what should I fix next?",
       "tool": "cluster_errors",
       "args": {"session_id": "phase72:deeds-web-app:main", "error_code": "ts1005"},
       "reason": "We have 81,234 errors...",
     },
     description="ACE planned: cluster_errors",
   )
   ```

9. **Phase72 API** returns response:
   ```json
   {
     "session_id": "phase72:deeds-web-app:main",
     "action": "cluster_errors",
     "reasoning": "We have 81,234 errors with TS1005 being the largest cluster (1,234 instances)...",
     "aca_marker": "[[ACA72:phase72:deeds-web-app:main:s1:p1]]",
     "aca_context": {
       "summary_version": 1,
       "spec_summary_version": 1,
       "summary_text": "Current error count: 81,234 (down from ~81,000)...",
       "spec_text": "Phase 72 uses Neo4j to cluster errors..."
     },
     "top_citations": [["doc_1", 0.95], ["doc_2", 0.87]],
     "mode": "auto",
     "candidate_context": null
   }
   ```

10. **CLI** displays:
    ```
    🤖 YoRHa Agent - Phase 72 AST Error Reduction
       Session: phase72:deeds-web-app:main
       Message: what should I fix next?
       Backend: http://localhost:8000

    ✅ Agent Response:

    🎯 ACTION: cluster_errors

    💭 REASONING:
    We have 81,234 errors with TS1005 being the largest cluster (1,234 instances).
    Clustering will help us find patterns and generate targeted codemods.

    🔗 ACA Marker: [[ACA72:phase72:deeds-web-app:main:s1:p1]]
    📊 Summary v1, Spec v1

    💡 Suggested Next Steps:
       → Run patch generator for the specified cluster
       → Review generated patches before applying
    ```

---

## Role-Based Reasoning

ACE adapts its behavior based on role:

### Prosecutor
- Focus: evidence strength, citation quality, legal precedent alignment
- Tools: rag_search, kag_search, web_search, analyze_multimodal_evidence
- Constraints: read-only (no patch generation), high accuracy required
- Goal: Find the strongest legal arguments and supporting evidence

### Warden / Admin
- Focus: error metrics, cluster health, patch safety, system stability
- Tools: run_svelte_check, cluster_errors, chr97_get_hotspots, rag_search
- Constraints: prefer safe, reversible actions; validate before applying
- Goal: Keep the system healthy and error count trending down

### Admin
- Focus: overall system architecture, performance, long-term strategy
- Tools: all (svelte-check, AST, CHR97, RAG, KAG, web_search, patches)
- Constraints: document decisions, maintain audit trail
- Goal: Optimize the entire pipeline for correctness and performance

---

## Multimodal Fallback Chain

When analyzing evidence, ACE tries multiple approaches in order:

1. **VLM** (Gemma3 / Granite) + YOLO/SAM/CHR97ImageProcessor
   - Analyze image, extract caption, detect objects
   - If successful, use results; if weak, continue

2. **Text extraction** (OCR / langextract)
   - Extract text from image or document
   - Parse entities, relationships

3. **RAG search** (Qdrant + Postgres)
   - Vector search over legal documents, code, etc.
   - Find similar cases, precedents, code patterns

4. **KAG search** (Neo4j)
   - Graph search for statutes, relationships, precedents
   - Find connected nodes (e.g., related cases, statutes)

5. **Web search** (optional)
   - If nothing found locally, search the web
   - Crawl + index results into RAG/KAG

**Result**: Comprehensive analysis with fallbacks at each step.

---

## Context Overflow Handling

ACE monitors token budget and compacts context when needed:

```python
# Check if context is getting too large
if ace.check_and_compact_context(session_id, goal, token_limit=8192):
    # Context was compacted:
    # 1. Re-summarize timeline (force=True)
    # 2. Truncate old events (keep last 100)
    # 3. Update plan with new summary versions
```

This ensures ACE never runs out of context, even in long sessions.

---

## Integration Points

### With Phase72 API
- `/api/phase72/next_step` calls `ace.plan_next_action()`
- `/api/phase72/record_event` logs events to timeline
- `/api/phase72/context_feedback` records user feedback

### With CLI
- `yo-rha-agent.mjs` calls `/api/phase72/next_step`
- Displays tool name, reasoning, ACA marker
- Shows suggested VS Code tasks

### With Svelte UI
- Chat page calls `/api/phase72/chat` (uses ACE internally)
- Context confirmation modal for low-confidence matches
- Tool execution confirmation buttons
- CHR97 topology visualization

### With Tools
- Tools are registered in ToolRouter
- Called via `router.call(name, args)`
- Results logged to timeline
- ACA re-summarizes next time

---

## Next Steps

1. **Verify Phase 1-2** (backend + CLI + signals)
2. **Implement Phase 3** (wire tools)
3. **Add Phase 4** (CHR97 integration)
4. **Build Phase 5** (context confirmation modal)
5. **Wire Phase 6** (Gemma3 chat)
6. **Optional Phase 7** (multimodal fallback)

See `.kiro/ACE_WIRING_CHECKLIST.md` for detailed steps.

---

**Status**: ACE architecture complete and wired into Phase72 API. Ready to execute checklist.
