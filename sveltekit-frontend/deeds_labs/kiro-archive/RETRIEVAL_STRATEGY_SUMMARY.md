# 3 Routes + Restart Retrieval Strategy - Complete Summary

## Status: 60% Implemented

You have the core retrieval logic working. Here's what's done and what's left.

## ✅ What's Already Working

### 1. Quaternion Transformer (4D → 3D)
- Converts 4D embeddings to 3D for Memory Palace visualization
- Supports Euler angles and quaternion rotations
- Batch processing for performance
- **File**: `backend/services/manifold_projector.py`

### 2. Tricubic Interpolation (Smooth Paths)
- Generates smooth paths between points on manifold
- Uses Hermite basis functions
- Preserves endpoints
- **File**: `backend/services/manifold_projector.py`

### 3. 3 Routes Decision Logic
- **legal_rag_plus_kag**: Full search (RAG + Knowledge Graph)
- **legal_rag_safe**: Safe search (RAG only, no KAG)
- **general_web**: Web search fallback
- **File**: `backend/services/alignment_router.py`

### 4. Sentiment Analysis (User Mood)
- Analyzes user sentiment via Granite
- Learns negative tokens per user
- Influences route selection
- **File**: `backend/services/alignment_router.py`

### 5. Manifold Projector Orchestration
- Coordinates quaternion + tricubic operations
- Generates 3D coordinates for visualization
- **File**: `backend/services/manifold_projector.py`

## 🔄 What's Partially Done

### 1. Low Confidence Restart
- **Current**: Confidence scoring exists
- **Missing**: Automatic web search trigger, re-embedding, context reset
- **Time to Complete**: 30 min
- **File**: `backend/services/alignment_router.py`

### 2. Matrix Transformation Fallback
- **Current**: Route decision exists
- **Missing**: Explicit fallback chain, error recovery
- **Time to Complete**: 30 min
- **File**: `backend/services/alignment_router.py`

## ❌ What's Not Implemented

### 1. Web Search Integration
- Acquire web data on CPU
- Batch embeddings to GPU
- Build GPU-friendly index
- **Time to Complete**: 30 min
- **File**: `backend/services/web_search.py` (new)

### 2. LLM Style Adaptation
- Adapt generation style based on mood
- Rank results by engagement
- **Time to Complete**: 30 min
- **File**: `backend/services/ace_orchestrator.py`

## How It All Works Together

```
User Query
  ↓
┌─────────────────────────────────────┐
│ 1. Sentiment Analysis (Mood)        │
│    - angry / neutral / hopeful      │
└─────────────────────────────────────┘
  ↓
┌─────────────────────────────────────┐
│ 2. Intent Classification            │
│    - legal_rag vs general           │
└─────────────────────────────────────┘
  ↓
┌─────────────────────────────────────┐
│ 3. Negativity Scoring               │
│    - base lexicon + per-user learned│
└─────────────────────────────────────┘
  ↓
┌─────────────────────────────────────┐
│ 4. Route Decision                   │
│    - legal_rag_plus_kag             │
│    - legal_rag_safe                 │
│    - general_web                    │
└─────────────────────────────────────┘
  ↓
┌─────────────────────────────────────┐
│ 5. Execute Route                    │
│    - Search RAG/KAG/Web             │
└─────────────────────────────────────┘
  ↓
┌─────────────────────────────────────┐
│ 6. Confidence Check                 │
│    - If low → Restart with web      │
│    - If fails → Try fallback routes │
└─────────────────────────────────────┘
  ↓
┌─────────────────────────────────────┐
│ 7. Manifold Projection              │
│    - Quaternion: 4D → 3D            │
│    - Tricubic: Smooth paths         │
│    - Memory Palace visualization    │
└─────────────────────────────────────┘
  ↓
┌─────────────────────────────────────┐
│ 8. LLM Generation                   │
│    - Adapt style based on mood      │
│    - Rank results by engagement     │
│    - Return response                │
└─────────────────────────────────────┘
```

## Integration with ACE

The strategy integrates with ACE like this:

```python
# In ace_orchestrator.py
def plan_phase72_next_action_with_restart(
    session_id, user_message, role, default_goal
):
    # 1. Analyze sentiment
    mood = analyze_sentiment(user_message)

    # 2. Get initial plan
    plan = call_llm_for_plan(build_prompt(...))

    # 3. Check confidence
    confidence = compute_confidence(plan)

    # 4. Low confidence? Restart with web search
    if confidence < 0.5:
        handle_low_confidence(user_message, confidence, session_id)
        plan = call_llm_for_plan(build_prompt(...))  # Re-plan

    # 5. Failed? Try fallback routes
    if not plan.get("tool"):
        matrix_transform_fallback(user_message, primary_route, session_id)

    # 6. Adapt LLM style based on mood
    adapted_prompt = adapt_llm_style(mood, plan, confidence)

    # 7. Log and return
    append_timeline(session_id, "ace-phase72-plan-with-restart", {...})
    return plan
```

## Quick Implementation Checklist

### Phase 1: Low Confidence Restart (30 min)
- [ ] Add `handle_low_confidence()` to AlignmentRouter
- [ ] Add `_web_search()` to AlignmentRouter
- [ ] Add `_batch_embed()` to AlignmentRouter
- [ ] Add `_store_in_qdrant()` to AlignmentRouter
- [ ] Add `_reset_session_context()` to AlignmentRouter
- [ ] Test with low confidence query

### Phase 2: Matrix Fallback (30 min)
- [ ] Add `matrix_transform_fallback()` to AlignmentRouter
- [ ] Add `_execute_route()` to AlignmentRouter
- [ ] Add `_search_rag_plus_kag()` to AlignmentRouter
- [ ] Add `_search_rag_safe()` to AlignmentRouter
- [ ] Add `_search_general_web()` to AlignmentRouter
- [ ] Test with failing route

### Phase 3: LLM Style Adaptation (30 min)
- [ ] Add `adapt_llm_style()` to AceOrchestrator
- [ ] Add `rank_results_by_engagement()` to AceOrchestrator
- [ ] Add `_compute_engagement_score()` to AceOrchestrator
- [ ] Add `plan_phase72_next_action_with_restart()` to AceOrchestrator
- [ ] Test with different moods

### Phase 4: Integration (30 min)
- [ ] Wire into `/api/phase72/next_step` endpoint
- [ ] Test end-to-end flow
- [ ] Verify all containers still running
- [ ] Document in README

## Testing Commands

```bash
# Test quaternion transformer
python -c "
from backend.services.manifold_projector import QuaternionTransformer
import numpy as np
qt = QuaternionTransformer()
qt.set_euler_angles(0.1, 0.2, 0.3)
print(qt.project_4d_to_3d(np.array([1, 0, 0, 0])))
"

# Test tricubic interpolation
python -c "
from backend.services.manifold_projector import TricubicInterpolator
import numpy as np
path = TricubicInterpolator.interpolate_path(
    np.array([0, 0, 0]),
    np.array([1, 1, 1]),
    10
)
print(f'Path length: {len(path)}')
"

# Test 3 routes
python -c "
from backend.services.alignment_router import AlignmentRouter
ar = AlignmentRouter(...)
print(ar._route_decision('legal_rag', 0.7))  # legal_rag_safe
print(ar._route_decision('legal_rag', 0.3))  # legal_rag_plus_kag
"

# Test sentiment
python -c "
from backend.services.alignment_router import AlignmentRouter
ar = AlignmentRouter(...)
ar.learn_from_chat('user123', 'This is stupid and useless!')
"
```

## Files to Modify

1. **backend/services/alignment_router.py**
   - Add: `handle_low_confidence()`
   - Add: `_web_search()`
   - Add: `_batch_embed()`
   - Add: `_store_in_qdrant()`
   - Add: `_reset_session_context()`
   - Add: `matrix_transform_fallback()`
   - Add: `_execute_route()`
   - Add: `_search_rag_plus_kag()`
   - Add: `_search_rag_safe()`
   - Add: `_search_general_web()`

2. **backend/services/ace_orchestrator.py**
   - Add: `adapt_llm_style()`
   - Add: `rank_results_by_engagement()`
   - Add: `_compute_engagement_score()`
   - Add: `plan_phase72_next_action_with_restart()`

3. **backend/api/phase72_agent_api.py**
   - Update: `/api/phase72/next_step` to use new strategy

## Performance Expectations

| Operation | Time | Notes |
|-----------|------|-------|
| Sentiment analysis | <100ms | Via Granite |
| Route decision | <50ms | Simple scoring |
| Web search | 1-3s | Network dependent |
| Batch embedding | 500ms-1s | 8-16 items, GPU |
| Qdrant storage | <100ms | In-memory |
| Quaternion projection | <10ms | Per point |
| Tricubic interpolation | <50ms | 10 points |
| LLM generation | 2-5s | Via Ollama |

## Container Dependencies

**All containers must stay running**:
- Redis (session state, metrics)
- PostgreSQL (metadata)
- Neo4j (knowledge graph)
- Qdrant (vector search)
- Ollama (LLM + embeddings)
- Phase72 Go Service (graph ops)
- Phase72 Python Service (GPU embeddings)

## Next Steps

1. **Implement Phase 1** (Low Confidence Restart) - 30 min
2. **Implement Phase 2** (Matrix Fallback) - 30 min
3. **Implement Phase 3** (LLM Style Adaptation) - 30 min
4. **Test end-to-end** - 30 min
5. **Total**: ~2 hours

All code is ready in `.kiro/IMPLEMENT_MISSING_RETRIEVAL_PIECES.md`

---

**Status**: 60% complete. Ready to implement remaining 40%.
**Containers**: All preserved. No deletions until all phases complete.
