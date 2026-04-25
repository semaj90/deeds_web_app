# Agentic Context Anchor (ACA) - Delivery Summary

## 🎯 Problem Solved

**Challenge**: Agent sessions lose context when:
- Context window overflows
- Processes restart
- Token budget exhausted
- Long-running tasks span multiple LLM calls

**Solution**: Three-layer ACA system that maintains plan + summaries + latent markers, enabling:
- ✅ Never lose the plot (plan always available)
- ✅ Graceful degradation (auto-compact when near limit)
- ✅ Survivability (resume from Redis + marker)
- ✅ Optional TRT hook (stop & re-encode with fresh context)

---

## 📦 Deliverables

### 1. Core Service: `backend/services/agent_context.py` (350 lines)
**Implements the three-layer ACA architecture:**

- **Plan Management**
  - `get_plan()` / `set_plan()` - Fetch/store session plans
  - `update_plan_step()` - Update current step

- **Timeline Management**
  - `append_timeline()` - Record events (search, ingest, edit, etc.)
  - `get_timeline_snippet()` - Retrieve recent events as text

- **Spec Extraction**
  - `_ripgrep_spec()` - Extract relevant spec chunks via ripgrep

- **Summary Generation**
  - `ensure_summaries()` - Generate/fetch session + spec summaries
  - Returns: summary_version, spec_summary_version, summary_text, spec_text, latent_marker

- **Token Budget**
  - `estimate_tokens()` - Rough token count (1 token ≈ 4 chars)
  - `maybe_compact_context()` - Detect overflow, auto-compact

- **Context Recovery**
  - `recover_context()` - Decode latent marker, fetch summaries

### 2. Planner Integration: `backend/services/agent_planner.py` (updated)
**Wires ACA into the agent planner:**

- `init_session_with_plan()` - Initialize with goal + specs
- `get_aca_context()` - Fetch plan + summaries
- `build_llm_prompt_with_aca()` - Build system + user prompts with ACA
- `check_context_overflow()` - Detect and handle overflow
- `recover_context_from_marker()` - Decode markers

### 3. Enhanced API: `backend/api/agent_api.py` (updated)
**New endpoints + enhanced responses:**

- `POST /api/agent/next_step`
  - Now accepts: `goal`, `spec_files` for plan initialization
  - Returns: `aca_marker`, `aca_context` in response
  - Auto-checks for context overflow

- `POST /api/agent/recover_context` (NEW)
  - Decode latent marker
  - Return full context (summary, spec, plan)

### 4. Backend Wiring: `backend/api/main.py` (updated)
- Mounted `agent_router` so `/api/agent/*` endpoints are live

### 5. Test Suite: `tools/test-agent-api.mjs` (100 lines)
**End-to-end test covering:**
1. Initialize session with plan
2. Record timeline events
3. Get next recommended step
4. Fetch timeline
5. Recover context from marker

### 6. Documentation

#### `.kiro/AGENTIC_CONTEXT_ANCHOR.md` (400 lines)
- Complete design + architecture
- Three-layer explanation
- Implementation guide
- C++/CUDA/TensorRT hook pattern
- Integration with CHR97 + ACE
- Redis key reference
- Usage examples

#### `.kiro/ACA_IMPLEMENTATION_SUMMARY.md` (300 lines)
- What was built
- How it works
- Redis keys
- API endpoints
- Quick start
- Integration points
- Files created/modified

#### `.kiro/ACA_QUICK_START.md` (200 lines)
- Pre-flight checklist
- Start services
- Test ACA
- Manual testing
- Monitor Redis
- Troubleshooting
- Next steps

---

## 🏗️ Architecture

### Three Layers

```
Layer 1: Plan Record
├─ agent:plan:{session_id}
├─ goal, spec_files, versions
└─ TTL: 7 days

Layer 2: Latent Markers
├─ [[ACA:session_id:s{N}:p{N}]]
├─ Injected into system prompt
└─ Model can refer to it

Layer 3: Re-Summary / Retokenization
├─ When context > 70% of limit
├─ Force new summary version
├─ Truncate old timeline events
└─ Continue with fresh context
```

### Redis Keys

| Key | Purpose | TTL |
|-----|---------|-----|
| `agent:plan:{session_id}` | Session plan | 7 days |
| `agent:timeline:{session_id}` | Timeline events (max 500) | 7 days |
| `agent:summary:{session_id}:{version}` | Session summary | 7 days |
| `agent:spec_summary:{session_id}:{version}` | Spec summary | 7 days |
| `agent:session:{session_id}` | Session metadata | 7 days |

---

## 🚀 Quick Start

### 1. Start Backend
```bash
python -m uvicorn backend.api.main:app --host 0.0.0.0 --port 8000
```

### 2. Test ACA
```bash
node tools/test-agent-api.mjs
```

### 3. Expected Output
```
🤖 Testing Agent API with ACA...

1️⃣  Initializing session with plan...
✅ Session initialized
   ACA Marker: [[ACA:doj_v_foo:test_user:s1:p1]]

2️⃣  Recording timeline events...
✅ Event recorded

3️⃣  Getting next recommended step...
✅ Next step retrieved

4️⃣  Fetching timeline...
✅ Timeline retrieved

5️⃣  Recovering context from marker...
✅ Context recovered from marker

🎉 All tests passed!
```

---

## 💡 Key Features

### ✅ Context Awareness
- Plan always available (goal, spec files, current step)
- Latent markers point to Redis summaries
- Model can refer to marker instead of hallucinating

### ✅ Token-Safe
- Estimate tokens before LLM call
- Auto-compact when approaching limit
- Truncate old events, keep summaries

### ✅ Survivable
- If process crashes, Redis + marker let you resume
- Decode marker → fetch summaries → rebuild prompt → continue

### ✅ Agentic
- Integrates with AlignmentRouter (negativity, intent, on-task)
- Integrates with CHR97 (heat, topology)
- Suggests next step based on plan + signals

### ✅ Optional TRT Hook
- Define `<|CTX_RECALL|>` token
- Host detects it → fetches ACA from Redis → rebuilds prompt → continues
- No need to hack CUDA kernels

---

## 📊 Integration Points

### With Chat Driver
```python
# Before LLM call
system, user = planner.build_llm_prompt_with_aca(
    session_id, goal, user_message
)

# After LLM call
planner.check_context_overflow(session_id, goal)
```

### With CHR97 + Memory Palace
```python
# Record search event
aca.append_timeline(
    session_id,
    kind="search",
    payload={"query": query, "results": len(chunks)},
    description=f"Searched for {query}"
)

# Get ACA context + alignment + CHR97 heat
aca_ctx = planner.get_aca_context(session_id, goal)
alignment = planner.align.get_alignment_signals(session_id)
chr97_heat = get_chr97_heat(session_id)

# Decide next step
next_action = decide_next_step(aca_ctx, alignment, chr97_heat)
```

### With TensorRT (Optional)
```cpp
// In TRT decode loop
if (contains_ctx_recall(out_tokens, recall_token_id)) {
    auto ctx = fetch_aca_from_redis(session_id);
    input_ids = build_prompt_tokens(session, ctx);
    continue;  // re-encode with fresh context
}
```

---

## 📁 Files Created/Modified

### Created
- `backend/services/agent_context.py` (350 lines)
- `tools/test-agent-api.mjs` (100 lines)
- `.kiro/AGENTIC_CONTEXT_ANCHOR.md` (400 lines)
- `.kiro/ACA_IMPLEMENTATION_SUMMARY.md` (300 lines)
- `.kiro/ACA_QUICK_START.md` (200 lines)
- `.kiro/ACA_DELIVERY_SUMMARY.md` (this file)

### Modified
- `backend/services/agent_planner.py` (+50 lines)
- `backend/api/agent_api.py` (+30 lines)
- `backend/api/main.py` (+5 lines)

**Total**: ~1,400 lines of code + documentation

---

## 🧪 Testing

### Automated Test
```bash
node tools/test-agent-api.mjs
```

### Manual Testing
```bash
# Initialize session
curl -X POST http://localhost:8000/api/agent/next_step \
  -H "Content-Type: application/json" \
  -d '{"session_id": "doj_v_foo:user123", "goal": "...", "spec_files": [...]}'

# Record event
curl -X POST http://localhost:8000/api/agent/record_event \
  -H "Content-Type: application/json" \
  -d '{"session_id": "doj_v_foo:user123", "kind": "search", ...}'

# Get next step
curl -X POST http://localhost:8000/api/agent/next_step \
  -H "Content-Type: application/json" \
  -d '{"session_id": "doj_v_foo:user123", "user_message": "What next?"}'

# Recover context
curl -X POST http://localhost:8000/api/agent/recover_context \
  -H "Content-Type: application/json" \
  -d '{"marker": "[[ACA:doj_v_foo:user123:s1:p1]]"}'
```

---

## 🎯 Next Steps

1. **Test the API** (5 min)
   ```bash
   node tools/test-agent-api.mjs
   ```

2. **Integrate into chat driver** (30 min)
   - Use `build_llm_prompt_with_aca()` before LLM calls
   - Use `check_context_overflow()` after LLM calls

3. **Monitor context usage** (15 min)
   - Log token estimates
   - Alert on compaction events
   - Track summary versions

4. **Add TRT hook** (optional, 1 hour)
   - Define `<|CTX_RECALL|>` token
   - Add stopping criterion in decode loop
   - Fetch ACA from Redis on recall

5. **Wire into VS Code** (optional, 2 hours)
   - Show ACA marker in status bar
   - Display timeline in sidebar
   - Allow manual context recovery

---

## 📚 Documentation

| Document | Purpose | Lines |
|----------|---------|-------|
| `.kiro/AGENTIC_CONTEXT_ANCHOR.md` | Full design + usage guide | 400 |
| `.kiro/ACA_IMPLEMENTATION_SUMMARY.md` | What was built + how it works | 300 |
| `.kiro/ACA_QUICK_START.md` | Pre-flight checklist + troubleshooting | 200 |
| `.kiro/ACA_DELIVERY_SUMMARY.md` | This summary | 300 |

---

## ✅ Checklist

- [x] Core ACA service implemented
- [x] Planner integration complete
- [x] API endpoints enhanced
- [x] Backend wiring done
- [x] Test suite created
- [x] Full documentation written
- [x] Quick start guide provided
- [x] Troubleshooting guide included
- [x] Integration examples shown
- [x] TRT hook pattern documented

---

## 🎉 Status

**Ready to use!**

Start with `.kiro/ACA_QUICK_START.md` to get up and running in 5 minutes.

---

## 📞 Support

- **Design Questions**: See `.kiro/AGENTIC_CONTEXT_ANCHOR.md`
- **Implementation Questions**: See `.kiro/ACA_IMPLEMENTATION_SUMMARY.md`
- **Getting Started**: See `.kiro/ACA_QUICK_START.md`
- **Troubleshooting**: See `.kiro/ACA_QUICK_START.md` → Troubleshooting section

---

**Delivered**: 2025-11-28
**Status**: ✅ Complete
**Ready for**: Integration + Testing
