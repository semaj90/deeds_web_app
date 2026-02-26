# ACE Wired Complete ✅

## What Was Delivered

### 1. AceOrchestrator Class
**File**: `backend/services/ace_orchestrator.py`

Wired directly to your existing services:
- `AgentContextAnchor` (general ACA)
- `Phase72AgentContext` (Phase 72 ACA)
- `AgentPlanner` (heuristic tool router)
- `AlignmentRouter` (alignment signals)
- `GraniteClient` (LLM)

Two main methods:
- `plan_general_next_action()` - For general sessions
- `plan_phase72_next_action()` - For Phase 72 sessions

### 2. How-To Guide
**File**: `.kiro/howtoguide_4d_ace.txt`

7-step guide covering:
- Step 0: Mental model
- Step 1: Create AceOrchestrator
- Step 2: Wire into Agent API
- Step 3: Wire into Phase72 Agent API
- Step 4: Connect to Frontend / VS Code
- Step 5: Extending signals (4D)
- Step 6: Optional TRT hook
- Step 7: Sanity checklist

---

## How to Use

### Initialize ACE
```python
from backend.services.ace_orchestrator import AceOrchestrator
from backend.services.agent_context import AgentContextAnchor
from backend.services.phase72_agent_context import Phase72AgentContext
from backend.services.agent_planner import AgentPlanner
from backend.services.alignment_router import AlignmentRouter

_aca = AgentContextAnchor()
_phase72_ctx = Phase72AgentContext()
_planner = AgentPlanner()
_alignment = AlignmentRouter()

_ace = AceOrchestrator(
    aca=_aca,
    phase72_ctx=_phase72_ctx,
    planner=_planner,
    alignment=_alignment,
)
```

### Call ACE (General)
```python
plan = _ace.plan_general_next_action(
    session_id="session_123",
    user_message="what should I do next?",
    role="prosecutor",
    default_goal="Assist with legal search and analysis.",
    user_id="user_456",
)

# Returns:
# {
#   "tool": "rag_search",
#   "args": {"query": "..."},
#   "reason": "...",
#   "raw_llm_output": "TOOL: rag_search\nARGS: {...}\nREASON: ...",
# }
```

### Call ACE (Phase72)
```python
plan = _ace.plan_phase72_next_action(
    session_id="phase72:deeds-web-app:main",
    user_message="what should I fix next?",
    role="warden",
    default_goal="Reduce TypeScript errors and stabilize the codebase.",
)

# Returns:
# {
#   "tool": "cluster_errors",
#   "args": {"error_code": "ts1005"},
#   "reason": "...",
#   "raw_llm_output": "TOOL: cluster_errors\nARGS: {...}\nREASON: ...",
# }
```

---

## Integration Points

### Agent API (`backend/api/agent_api.py`)
```python
from backend.services.ace_orchestrator import AceOrchestrator

_ace = AceOrchestrator(_aca, None, _planner, _alignment)

@router.post("/next_step")
def next_step(req: NextStepRequest):
    plan = _ace.plan_general_next_action(
        session_id=req.session_id,
        user_message=req.message,
        role=req.role,
        user_id=req.user_id,
    )
    return NextStepResponse(
        session_id=req.session_id,
        role=req.role,
        tool=plan["tool"],
        args=plan["args"],
        reason=plan["reason"],
        raw_llm_output=plan["raw_llm_output"],
    )
```

### Phase72 Agent API (`backend/api/phase72_agent_api.py`)
```python
from backend.services.ace_orchestrator import AceOrchestrator

_ace = AceOrchestrator(_aca, _phase72_ctx, _planner, _alignment)

@router.post("/next_step")
def next_step(req: Phase72NextStepRequest):
    plan = _ace.plan_phase72_next_action(
        session_id=req.session_id,
        user_message=req.message,
        role=req.role,
        default_goal=req.default_goal or "Reduce TypeScript errors...",
    )
    return Phase72NextStepResponse(
        session_id=req.session_id,
        role=req.role,
        tool=plan["tool"],
        args=plan["args"],
        reason=plan["reason"],
        raw_llm_output=plan["raw_llm_output"],
    )
```

---

## Data Flow

```
User: "what should I fix next?"
  ↓
CLI: node tools/yo-rha-agent.mjs "phase72:deeds-web-app:main" "..."
  ↓
API: POST /api/phase72/next_step
  ↓
ACE.plan_phase72_next_action():
  1. phase72_ctx.build_phase72_prompt() → get context + summaries
  2. _build_phase72_signals() → get error metrics, cluster status
  3. _call_llm_for_plan() → call LLM
  4. Parse TOOL / ARGS / REASON
  5. phase72_ctx.append_timeline() → log decision
  ↓
Response: { tool, args, reason, raw_llm_output }
  ↓
CLI: Display result
```

---

## Key Features

✅ **No new storage** - Uses your existing Redis keys
✅ **No new schema** - Reuses ACA + Phase72 patterns
✅ **Thin orchestrator** - Just pulls context + signals + calls LLM
✅ **Extensible signals** - Easy to add CHR97, RAG, VLM data
✅ **Heuristic fallback** - AgentPlanner.next_step() as backup
✅ **Timeline logging** - All decisions logged to agent:timeline / phase72:timeline

---

## Next Steps

1. **Wire into APIs** - Update agent_api.py and phase72_agent_api.py
2. **Test with CLI** - Run yo-rha-agent.mjs and verify TOOL / ARGS / REASON
3. **Add signals** - Extend _build_phase72_signals() with real metrics
4. **Build tool registry** - Map TOOL names to actual implementations
5. **Connect UI** - Wire Svelte chat pages to /api/agent/next_step and /api/phase72/next_step

---

## Files

- `backend/services/ace_orchestrator.py` - AceOrchestrator class
- `.kiro/howtoguide_4d_ace.txt` - 7-step integration guide
- `.kiro/ACE_WIRED_COMPLETE.md` - This summary

---

**Status**: ✅ Ready to integrate into APIs
