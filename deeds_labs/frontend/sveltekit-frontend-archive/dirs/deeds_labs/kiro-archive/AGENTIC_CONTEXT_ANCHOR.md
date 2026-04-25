# Agentic Context Anchor (ACA) - Design & Implementation

## Overview

The **Agentic Context Anchor (ACA)** prevents context loss during long agent sessions by maintaining:

1. **Plan record** (high-level goal, tasks, spec refs)
2. **Latent markers** (small text IDs pointing to Redis summaries)
3. **Re-summary / retokenization** when near token limit

This allows agents to:
- Never lose the plot even if context window overflows
- Resume from summaries if processes restart
- Gracefully degrade when token budget is exhausted
- Optionally hook into C++/CUDA/TensorRT for "stop & re-encode" mechanisms

---

## Architecture

### Three Layers

#### Layer 1: Plan Record
Stored in Redis at `agent:plan:{session_id}`:
```json
{
  "session_id": "doj_v_foo:user123",
  "goal": "analyze supremacy clause conflict with AB 32",
  "current_step": "compare key precedents",
  "spec_files": [
    ".kiro/specs/legal-agentic-alignment-search/requirements.md",
    ".kiro/specs/legal-agentic-alignment-search/design.md"
  ],
  "summary_version": 2,
  "spec_summary_version": 1,
  "created_at": "2025-11-28T...",
  "updated_at": "2025-11-28T..."
}
```

#### Layer 2: Latent Markers
Small text IDs injected into system messages:
```
[[ACA:doj_v_foo:user123:s2:p1]]
```

Decoding:
- `ACA` = Agentic Context Anchor
- `doj_v_foo:user123` = session_id
- `s2` = summary_version 2
- `p1` = spec_summary_version 1

The model can refer to this marker, and your tooling knows how to decode it to fetch the actual summaries from Redis.

#### Layer 3: Re-Summary / Retokenization
When context approaches limit:
1. Compress old timeline into a new summary version
2. Truncate old events (keep last N)
3. Start a new conversation "episode" with fresh context

---

## Implementation

### Backend Services

#### `backend/services/agent_context.py`
Core ACA logic:

```python
from backend.services.agent_context import AgentContextAnchor

aca = AgentContextAnchor(redis_cache, granite_client)

# Initialize plan
aca.set_plan(
    session_id="doj_v_foo:user123",
    goal="analyze supremacy clause conflict",
    spec_files=[".kiro/specs/legal-agentic-alignment-search/requirements.md"]
)

# Append timeline events
aca.append_timeline(
    session_id="doj_v_foo:user123",
    kind="search",
    payload={"query": "Supremacy Clause"},
    description="Searched for Supremacy Clause precedents"
)

# Ensure summaries exist
ctx = aca.ensure_summaries(
    session_id="doj_v_foo:user123",
    goal="analyze supremacy clause conflict"
)
# Returns: {
#   "summary_version": 2,
#   "spec_summary_version": 1,
#   "summary_text": "...",
#   "spec_text": "...",
#   "latent_marker": "[[ACA:doj_v_foo:user123:s2:p1]]"
# }

# Build LLM prompt with ACA
system, user = aca.build_llm_prompt(
    session_id="doj_v_foo:user123",
    goal="analyze supremacy clause conflict",
    user_message="What's the next step?"
)

# Check for context overflow
if aca.maybe_compact_context(
    session_id="doj_v_foo:user123",
    goal="analyze supremacy clause conflict",
    token_limit=8192,
    safety_margin=0.7
):
    print("Context compacted; old events truncated")

# Recover context from marker
ctx = aca.recover_context("[[ACA:doj_v_foo:user123:s2:p1]]")
# Returns: {
#   "session_id": "doj_v_foo:user123",
#   "summary_version": 2,
#   "spec_summary_version": 1,
#   "summary_text": "...",
#   "spec_text": "...",
#   "plan": {...}
# }
```

#### `backend/services/agent_planner.py`
Integrated with ACA:

```python
planner = AgentPlanner(redis_url, granite_config, neo4j_config)

# Initialize session with plan
planner.init_session_with_plan(
    session_id="doj_v_foo:user123",
    goal="analyze supremacy clause conflict",
    spec_files=[".kiro/specs/legal-agentic-alignment-search/requirements.md"]
)

# Get ACA context
aca_ctx = planner.get_aca_context(
    session_id="doj_v_foo:user123",
    goal="analyze supremacy clause conflict"
)

# Build LLM prompt with ACA
system, user = planner.build_llm_prompt_with_aca(
    session_id="doj_v_foo:user123",
    goal="analyze supremacy clause conflict",
    user_message="What's the next step?"
)

# Check for overflow
planner.check_context_overflow(
    session_id="doj_v_foo:user123",
    goal="analyze supremacy clause conflict"
)

# Recover from marker
ctx = planner.recover_context_from_marker("[[ACA:doj_v_foo:user123:s2:p1]]")
```

### API Endpoints

#### `POST /api/agent/next_step`
Get next recommended action with ACA context.

**Request:**
```json
{
  "session_id": "doj_v_foo:user123",
  "user_message": "What's the next step?",
  "goal": "analyze supremacy clause conflict",
  "spec_files": [".kiro/specs/legal-agentic-alignment-search/requirements.md"]
}
```

**Response:**
```json
{
  "action": "search",
  "reason": "New case ingested - should search for relevant legal precedents",
  "confidence": 0.9,
  "summary": "Session summary...",
  "mini_graph": {...},
  "aca_marker": "[[ACA:doj_v_foo:user123:s2:p1]]",
  "aca_context": {
    "summary_version": 2,
    "spec_summary_version": 1,
    "summary_text": "...",
    "spec_text": "..."
  }
}
```

#### `POST /api/agent/recover_context`
Recover context from a latent marker.

**Request:**
```json
{
  "marker": "[[ACA:doj_v_foo:user123:s2:p1]]"
}
```

**Response:**
```json
{
  "session_id": "doj_v_foo:user123",
  "summary_version": 2,
  "spec_summary_version": 1,
  "summary_text": "...",
  "spec_text": "...",
  "plan": {...}
}
```

---

## Token Budget Management

### Estimation
```python
def estimate_tokens(text: str) -> int:
    """Rough estimate: 1 token ≈ 4 chars"""
    return len(text) // 4
```

### Overflow Handling
```python
def maybe_compact_context(
    session_id: str,
    goal: str,
    token_limit: int = 8192,
    safety_margin: float = 0.7
) -> bool:
    """
    If context > safety_margin * token_limit:
    1. Force re-summarization
    2. Truncate old timeline events
    3. Return True if compaction triggered
    """
```

**Flow:**
1. Before each LLM call, estimate tokens
2. If approaching limit (e.g., > 70% of 8192):
   - Call `ensure_summaries(..., force=True)` to create new summary version
   - Truncate old events (keep last 100)
   - Continue with fresh context

---

## C++ / CUDA / TensorRT Hook

### Pattern: "Inject Bit, Stop & Re-Encode"

Define a special token/string, e.g., `<|CTX_RECALL|>` or `[[ACA_RECALL]]`.

Add a custom stopping criterion in your TRT-LLM decode loop:

```cpp
bool contains_ctx_recall(const std::vector<int>& token_ids, int recall_token_id) {
    for (int t : token_ids) {
        if (t == recall_token_id) return true;
    }
    return false;
}

void run_llm_with_ctx_anchor(SessionCtx& session, int recall_token_id) {
    std::vector<int> input_ids = build_prompt_tokens(session);
    // includes ACA marker text

    while (true) {
        // Run one inference step or block of steps
        std::vector<int> out_tokens = trtllm_decode_step(input_ids);

        if (contains_ctx_recall(out_tokens, recall_token_id)) {
            // 1) Fetch new summary/spec from Redis
            auto ctx = fetch_aca_from_redis(session.session_id);
            session.summary_text = ctx.summary_text;
            session.spec_text = ctx.spec_text;

            // 2) Rebuild prompt with fresh summary
            input_ids = build_prompt_tokens(session);
            continue;  // "re-encode" with new context
        }

        if (/* stopping */) {
            break;
        }

        // Append outputs and keep going
        append_to_response(out_tokens);
        input_ids.insert(input_ids.end(), out_tokens.begin(), out_tokens.end());
    }
}
```

**Key points:**
- No need to hack RTX kernels
- Control loop at host level is sufficient
- Model can emit special token when it realizes "I'm missing context"
- Host detects it → fetches ACA from Redis → rebuilds prompt → continues

---

## Integration with CHR97 + ACE

### Flow

1. **User does work** in VS Code / UI
   - Ingest complaint
   - Search legal corpus
   - Edit notes
   - etc.

2. **Events recorded** to `agent:timeline:{session_id}`
   - Each action → timeline event

3. **Planner called** via `/api/agent/next_step`
   - Reads timeline
   - Reads ACA (plan + summaries)
   - Reads alignment signals (negativity, intent, on-task)
   - Reads CHR97 heat + graph (where in legal manifold are we?)
   - Suggests next step

4. **LLM calls** always go through `ensure_summaries()` + `maybe_compact_context()`
   - System prompt includes ACA marker
   - Model can refer to marker or emit `<|CTX_RECALL|>`
   - If overflow detected, auto-compact

5. **Survivability**
   - If processes crash, Redis + ACA + timeline let you resume
   - Decode marker → fetch summaries → rebuild prompt → continue

---

## Usage Example: CLI

```bash
# Initialize session with plan
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

# Response includes ACA marker + context
# {
#   "action": "search",
#   "reason": "...",
#   "aca_marker": "[[ACA:doj_v_foo:user123:s1:p1]]",
#   "aca_context": {...}
# }

# Later, if context is lost, recover it
curl -X POST http://localhost:8000/api/agent/recover_context \
  -H "Content-Type: application/json" \
  -d '{"marker": "[[ACA:doj_v_foo:user123:s1:p1]]"}'

# Response: full context (summary, spec, plan)
```

---

## Redis Keys Reference

| Key | Purpose | TTL |
|-----|---------|-----|
| `agent:plan:{session_id}` | Session plan (goal, spec files, versions) | 7 days |
| `agent:timeline:{session_id}` | Timeline events (FIFO, max 500) | 7 days |
| `agent:summary:{session_id}:{version}` | Compressed session summary | 7 days |
| `agent:spec_summary:{session_id}:{version}` | Compressed spec summary | 7 days |
| `agent:session:{session_id}` | Session metadata | 7 days |

---

## Next Steps

1. **Test the agent API**
   ```bash
   python -m uvicorn backend.api.main:app --host 0.0.0.0 --port 8000
   node tools/yo-rha-agent.mjs "doj_v_foo:user123" "testing agent integration"
   ```

2. **Wire into chat driver**
   - Before each LLM call, use `build_llm_prompt_with_aca()`
   - After each call, check `maybe_compact_context()`

3. **Add TRT hook** (optional)
   - Define `<|CTX_RECALL|>` token
   - Add stopping criterion in decode loop
   - Fetch ACA from Redis on recall

4. **Monitor context usage**
   - Log token estimates
   - Alert on compaction events
   - Track summary versions over time

---

## Troubleshooting

### Agent API returns 500
- Ensure Redis is running at `redis://localhost:6379`
- Ensure Granite client is configured correctly
- Check logs for import errors

### Context not compacting
- Check token estimate logic (may be too conservative)
- Verify `safety_margin` is reasonable (default 0.7)
- Ensure `maybe_compact_context()` is called before LLM

### Marker decode fails
- Verify marker format: `[[ACA:session_id:s{N}:p{N}]]`
- Check Redis keys exist: `agent:summary:{session_id}:{N}`
- Ensure session_id matches

---

## References

- `backend/services/agent_context.py` - Core ACA implementation
- `backend/services/agent_planner.py` - Planner integration
- `backend/api/agent_api.py` - API endpoints
- `.kiro/GPU_MEMORY_PALACE_COMPLETE.md` - CHR97 + Memory Palace
- `.kiro/IMPLEMENTATION_COMPLETE.md` - Full system overview
