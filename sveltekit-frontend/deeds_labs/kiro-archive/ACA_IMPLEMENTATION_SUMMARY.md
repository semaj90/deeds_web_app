# Agentic Context Anchor (ACA) - Implementation Summary

## What Was Built

### 1. Core ACA Service (`backend/services/agent_context.py`)
- **Plan management**: Create/update session plans with goals + spec files
- **Timeline management**: Append events, retrieve snippets
- **Spec extraction**: ripgrep-based keyword search over spec files
- **Summary generation**: Granite-powered compression of timeline + specs
- **Latent markers**: Encode/decode context pointers (`[[ACA:session_id:s{N}:p{N}]]`)
- **Token budget**: Estimate tokens, detect overflow, auto-compact
- **Context recovery**: Decode markers and fetch summaries from Redis

### 2. Agent Planner Integration (`backend/services/agent_planner.py`)
- Added `AgentContextAnchor` instance
- New methods:
  - `init_session_with_plan()` - Initialize with goal + specs
  - `get_aca_context()` - Fetch plan + summaries
  - `build_llm_prompt_with_aca()` - Build system + user prompts with ACA
  - `check_context_overflow()` - Detect and handle overflow
  - `recover_context_from_marker()` - Decode markers

### 3. Enhanced Agent API (`backend/api/agent_api.py`)
- Updated `/api/agent/next_step` to:
  - Accept `goal` + `spec_files` for plan initialization
  - Return `aca_marker` + `aca_context` in response
  - Auto-check for context overflow
- New endpoint: `POST /api/agent/recover_context`
  - Decode latent marker
  - Return full context (summary, spec, plan)

### 4. Backend Wiring (`backend/api/main.py`)
- Mounted `agent_router` so `/api/agent/*` endpoints are live

### 5. Test Script (`tools/test-agent-api.mjs`)
- End-to-end test of ACA flow:
  1. Initialize session with plan
  2. Record timeline events
  3. Get next recommended step
  4. Fetch timeline
  5. Recover context from marker

### 6. Documentation (`.kiro/AGENTIC_CONTEXT_ANCHOR.md`)
- Complete design + usage guide
- Redis key reference
- C++/CUDA/TensorRT hook pattern
- Integration with CHR97 + ACE

---

## How It Works

### Three-Layer Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 1: Plan Record                                        │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ agent:plan:{session_id}                                 │ │
│ │ {goal, spec_files, summary_version, spec_summary_v...} │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 2: Latent Markers                                     │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ [[ACA:session_id:s{N}:p{N}]]                            │ │
│ │ Injected into system prompt; model can refer to it      │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 3: Re-Summary / Retokenization                        │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ When context > 70% of limit:                            │ │
│ │ 1. Force new summary version                            │ │
│ │ 2. Truncate old timeline events                         │ │
│ │ 3. Continue with fresh context                          │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Flow: User → Agent → LLM → Response

```
1. User initiates work
   ↓
2. Events recorded to agent:timeline:{session_id}
   ↓
3. /api/agent/next_step called
   ├─ Reads plan + alignment signals + CHR97 heat
   ├─ Calls ensure_summaries() → gets ACA marker
   ├─ Checks maybe_compact_context() → auto-truncates if needed
   └─ Returns action + ACA marker
   ↓
4. LLM call with ACA context
   ├─ System prompt includes marker + summaries
   ├─ Model can refer to marker or emit <|CTX_RECALL|>
   └─ Response includes reasoning
   ↓
5. If context overflow detected
   ├─ Force re-summarization
   ├─ Truncate old events
   └─ Continue with fresh context
   ↓
6. If process crashes
   ├─ Decode marker from Redis
   ├─ Fetch summaries + plan
   └─ Resume from checkpoint
```

---

## Redis Keys

| Key | Purpose | Example |
|-----|---------|---------|
| `agent:plan:{session_id}` | Session plan | `agent:plan:doj_v_foo:user123` |
| `agent:timeline:{session_id}` | Timeline events (FIFO, max 500) | `agent:timeline:doj_v_foo:user123` |
| `agent:summary:{session_id}:{version}` | Compressed session summary | `agent:summary:doj_v_foo:user123:2` |
| `agent:spec_summary:{session_id}:{version}` | Compressed spec summary | `agent:spec_summary:doj_v_foo:user123:1` |
| `agent:session:{session_id}` | Session metadata | `agent:session:doj_v_foo:user123` |

---

## API Endpoints

### `POST /api/agent/next_step`
Get next recommended action with ACA context.

**Request:**
```json
{
  "session_id": "doj_v_foo:user123",
  "user_message": "What's next?",
  "goal": "analyze supremacy clause conflict",
  "spec_files": [".kiro/specs/legal-agentic-alignment-search/requirements.md"]
}
```

**Response:**
```json
{
  "action": "search",
  "reason": "New case ingested - should search for precedents",
  "confidence": 0.9,
  "aca_marker": "[[ACA:doj_v_foo:user123:s1:p1]]",
  "aca_context": {
    "summary_version": 1,
    "spec_summary_version": 1,
    "summary_text": "...",
    "spec_text": "..."
  }
}
```

### `POST /api/agent/recover_context`
Recover context from a latent marker.

**Request:**
```json
{
  "marker": "[[ACA:doj_v_foo:user123:s1:p1]]"
}
```

**Response:**
```json
{
  "session_id": "doj_v_foo:user123",
  "summary_version": 1,
  "spec_summary_version": 1,
  "summary_text": "...",
  "spec_text": "...",
  "plan": {...}
}
```

---

## Quick Start

### 1. Start Backend
```bash
cd /path/to/deeds-web-app
python -m uvicorn backend.api.main:app --host 0.0.0.0 --port 8000
```

### 2. Ensure Redis is Running
```bash
redis-server
```

### 3. Test Agent API
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

---

## Integration Points

### With Chat Driver
```python
# Before each LLM call
system, user = planner.build_llm_prompt_with_aca(
    session_id, goal, user_message
)

# Call LLM with system + user
response = llm.generate(system, user)

# After LLM call
planner.check_context_overflow(session_id, goal)
```

### With CHR97 + Memory Palace
```python
# When user searches
aca.append_timeline(
    session_id,
    kind="search",
    payload={"query": query, "results": len(chunks)},
    description=f"Searched for {query}"
)

# Get CHR97 heat + alignment signals
aca_ctx = planner.get_aca_context(session_id, goal)
alignment = planner.align.get_alignment_signals(session_id)
chr97_heat = get_chr97_heat(session_id)

# Combine for next-step decision
next_action = decide_next_step(aca_ctx, alignment, chr97_heat)
```

### With TensorRT (Optional)
```cpp
// In TRT decode loop
if (contains_ctx_recall(out_tokens, recall_token_id)) {
    // Fetch ACA from Redis
    auto ctx = fetch_aca_from_redis(session_id);

    // Rebuild prompt with fresh summary
    input_ids = build_prompt_tokens(session, ctx);

    // Continue decoding
    continue;
}
```

---

## Files Created/Modified

### Created
- `backend/services/agent_context.py` - Core ACA implementation
- `tools/test-agent-api.mjs` - End-to-end test script
- `.kiro/AGENTIC_CONTEXT_ANCHOR.md` - Full design guide
- `.kiro/ACA_IMPLEMENTATION_SUMMARY.md` - This file

### Modified
- `backend/services/agent_planner.py` - Added ACA integration
- `backend/api/agent_api.py` - Enhanced endpoints with ACA
- `backend/api/main.py` - Mounted agent_router

---

## Next Steps

1. **Test the API**
   ```bash
   node tools/test-agent-api.mjs
   ```

2. **Integrate into chat driver**
   - Use `build_llm_prompt_with_aca()` before LLM calls
   - Use `check_context_overflow()` after LLM calls

3. **Monitor context usage**
   - Log token estimates
   - Alert on compaction events
   - Track summary versions

4. **Add TRT hook** (optional)
   - Define `<|CTX_RECALL|>` token
   - Add stopping criterion in decode loop
   - Fetch ACA from Redis on recall

5. **Wire into VS Code**
   - Show ACA marker in status bar
   - Display timeline in sidebar
   - Allow manual context recovery

---

## Troubleshooting

### Agent API returns 500
- Check Redis is running: `redis-cli ping`
- Check Granite client config in `backend/api/agent_api.py`
- Check logs for import errors

### Context not compacting
- Verify token estimate logic
- Check `safety_margin` (default 0.7)
- Ensure `maybe_compact_context()` is called

### Marker decode fails
- Verify marker format: `[[ACA:session_id:s{N}:p{N}]]`
- Check Redis keys exist: `redis-cli keys "agent:summary:*"`
- Ensure session_id matches

---

## References

- **Core Implementation**: `backend/services/agent_context.py`
- **Planner Integration**: `backend/services/agent_planner.py`
- **API Endpoints**: `backend/api/agent_api.py`
- **Full Design**: `.kiro/AGENTIC_CONTEXT_ANCHOR.md`
- **CHR97 Integration**: `.kiro/GPU_MEMORY_PALACE_COMPLETE.md`
- **System Overview**: `.kiro/IMPLEMENTATION_COMPLETE.md`
