# Agentic Context Anchor (ACA) - Complete Index

## 📚 Documentation

### Getting Started
1. **[ACA Quick Start](.kiro/ACA_QUICK_START.md)** ⭐ START HERE
   - Pre-flight checklist
   - Start services
   - Test ACA
   - Manual testing
   - Troubleshooting
   - **Time**: 5-10 minutes

### Understanding ACA
2. **[ACA Flow Diagrams](.kiro/ACA_FLOW_DIAGRAM.md)**
   - Session initialization flow
   - Timeline event recording
   - Next step decision
   - LLM call with ACA
   - Context overflow handling
   - Context recovery
   - TensorRT hook
   - Full lifecycle
   - Data flow
   - Redis state

3. **[Agentic Context Anchor Design](.kiro/AGENTIC_CONTEXT_ANCHOR.md)** (Full Design)
   - Overview
   - Three-layer architecture
   - Implementation guide
   - API endpoints
   - Token budget management
   - C++/CUDA/TensorRT hook
   - Integration with CHR97 + ACE
   - Redis keys reference
   - Usage examples
   - Troubleshooting

### Implementation Details
4. **[ACA Implementation Summary](.kiro/ACA_IMPLEMENTATION_SUMMARY.md)**
   - What was built
   - How it works
   - Redis keys
   - API endpoints
   - Quick start
   - Integration points
   - Files created/modified

### Delivery
5. **[ACA Delivery Summary](.kiro/ACA_DELIVERY_SUMMARY.md)**
   - Problem solved
   - Deliverables
   - Architecture
   - Quick start
   - Key features
   - Integration points
   - Files created/modified
   - Testing
   - Next steps

---

## 🔧 Code Files

### Core Implementation
- **`backend/services/agent_context.py`** (350 lines)
  - Plan management
  - Timeline management
  - Spec extraction (ripgrep)
  - Summary generation
  - Token budget
  - Context recovery

- **`backend/services/agent_planner.py`** (updated, +50 lines)
  - ACA integration
  - Session initialization
  - LLM prompt building
  - Context overflow checking
  - Context recovery

### API
- **`backend/api/agent_api.py`** (updated, +30 lines)
  - Enhanced `/api/agent/next_step`
  - New `/api/agent/recover_context`

- **`backend/api/main.py`** (updated, +5 lines)
  - Mounted agent_router

### Testing
- **`tools/test-agent-api.mjs`** (100 lines)
  - End-to-end test
  - 5 test scenarios
  - Automated verification

---

## 🚀 Quick Commands

### Start Services
```bash
# Terminal 1: Redis
redis-server

# Terminal 2: Backend
cd /path/to/deeds-web-app
python -m uvicorn backend.api.main:app --host 0.0.0.0 --port 8000

# Terminal 3: Test
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

### Monitor Redis
```bash
# Check session plan
redis-cli get "agent:plan:doj_v_foo:user123"

# Check timeline events
redis-cli lrange "agent:timeline:doj_v_foo:user123" 0 -1

# Check summaries
redis-cli get "agent:summary:doj_v_foo:user123:1"
redis-cli get "agent:spec_summary:doj_v_foo:user123:1"

# List all ACA keys
redis-cli keys "agent:*"
```

---

## 📊 Architecture Overview

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

## 🎯 Integration Checklist

- [ ] Read [ACA Quick Start](.kiro/ACA_QUICK_START.md)
- [ ] Start Redis: `redis-server`
- [ ] Start Backend: `python -m uvicorn backend.api.main:app --host 0.0.0.0 --port 8000`
- [ ] Run Test: `node tools/test-agent-api.mjs`
- [ ] Verify all tests pass
- [ ] Read [ACA Flow Diagrams](.kiro/ACA_FLOW_DIAGRAM.md)
- [ ] Integrate into chat driver:
  - [ ] Use `build_llm_prompt_with_aca()` before LLM calls
  - [ ] Use `check_context_overflow()` after LLM calls
- [ ] Monitor context usage:
  - [ ] Log token estimates
  - [ ] Alert on compaction events
  - [ ] Track summary versions
- [ ] (Optional) Add TRT hook:
  - [ ] Define `<|CTX_RECALL|>` token
  - [ ] Add stopping criterion in decode loop
  - [ ] Fetch ACA from Redis on recall
- [ ] (Optional) Wire into VS Code:
  - [ ] Show ACA marker in status bar
  - [ ] Display timeline in sidebar
  - [ ] Allow manual context recovery

---

## 🔗 Related Systems

- **CHR97 Memory Palace**: `.kiro/GPU_MEMORY_PALACE_COMPLETE.md`
- **Alignment Router**: `backend/services/alignment_router.py`
- **Search API**: `backend/api/search_api.py`
- **Agent Planner**: `backend/services/agent_planner.py`
- **Legal Ingestion**: `backend/LEGAL_COMPLAINT_INGESTION_GUIDE.md`

---

## 📖 Reading Order

### For Quick Start (5 min)
1. [ACA Quick Start](.kiro/ACA_QUICK_START.md)
2. Run `node tools/test-agent-api.mjs`

### For Understanding (30 min)
1. [ACA Flow Diagrams](.kiro/ACA_FLOW_DIAGRAM.md)
2. [ACA Implementation Summary](.kiro/ACA_IMPLEMENTATION_SUMMARY.md)

### For Deep Dive (1 hour)
1. [Agentic Context Anchor Design](.kiro/AGENTIC_CONTEXT_ANCHOR.md)
2. `backend/services/agent_context.py` (code)
3. `backend/services/agent_planner.py` (code)

### For Integration (2 hours)
1. [ACA Implementation Summary](.kiro/ACA_IMPLEMENTATION_SUMMARY.md) → Integration Points
2. Integrate into chat driver
3. Test with your data
4. Monitor in production

---

## 🐛 Troubleshooting

### Backend won't start
→ See [ACA Quick Start](.kiro/ACA_QUICK_START.md) → Troubleshooting

### Redis connection error
→ See [ACA Quick Start](.kiro/ACA_QUICK_START.md) → Troubleshooting

### Test script fails
→ See [ACA Quick Start](.kiro/ACA_QUICK_START.md) → Troubleshooting

### Marker decode fails
→ See [Agentic Context Anchor Design](.kiro/AGENTIC_CONTEXT_ANCHOR.md) → Troubleshooting

---

## 📞 Support

| Question | Answer |
|----------|--------|
| How do I get started? | Read [ACA Quick Start](.kiro/ACA_QUICK_START.md) |
| How does ACA work? | Read [ACA Flow Diagrams](.kiro/ACA_FLOW_DIAGRAM.md) |
| What was built? | Read [ACA Delivery Summary](.kiro/ACA_DELIVERY_SUMMARY.md) |
| How do I integrate it? | Read [ACA Implementation Summary](.kiro/ACA_IMPLEMENTATION_SUMMARY.md) → Integration Points |
| What's the full design? | Read [Agentic Context Anchor Design](.kiro/AGENTIC_CONTEXT_ANCHOR.md) |
| How do I debug? | Read [ACA Quick Start](.kiro/ACA_QUICK_START.md) → Troubleshooting |

---

## ✅ Status

- [x] Core ACA service implemented
- [x] Planner integration complete
- [x] API endpoints enhanced
- [x] Backend wiring done
- [x] Test suite created
- [x] Full documentation written
- [x] Quick start guide provided
- [x] Flow diagrams created
- [x] Troubleshooting guide included
- [x] Integration examples shown

**Status**: ✅ Ready to use

**Last Updated**: 2025-11-28

---

## 🎉 Next Steps

1. **Start with [ACA Quick Start](.kiro/ACA_QUICK_START.md)** (5 min)
2. **Run the test** (2 min)
3. **Read [ACA Flow Diagrams](.kiro/ACA_FLOW_DIAGRAM.md)** (10 min)
4. **Integrate into your chat driver** (30 min)
5. **Monitor in production** (ongoing)

---

**Questions?** Check the relevant documentation above or see [Agentic Context Anchor Design](.kiro/AGENTIC_CONTEXT_ANCHOR.md) for full details.
