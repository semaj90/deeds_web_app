# Phase 70: AI Chat Integration - Specification

## Overview

Phase 70 implements the AI Chat Integration system, enabling legal professionals to have real-time conversations with an AI legal assistant powered by Gemma-3-Legal. The system integrates evidence search results as context, maintains conversation history, enforces legal guardrails, and provides citation linking.

**Status**: ✅ Specification Complete (Requirements → Design → Tasks)

## Key Features

### 1. Streaming Chat Responses
- Real-time token-by-token rendering via SSE
- Gemma-3-Legal model for legal reasoning
- Context window management (last 10 messages)
- Performance: <500ms start, <100ms token intervals

### 2. Evidence Context Injection
- Integration with Phase 3B search service
- Top-3 evidence results injected into prompt
- Evidence reference tracking
- Evidence memory panel

### 3. Legal Guardrails
- Disclaimer stripe (always visible)
- Citation enforcement
- Confidence scoring
- "Cannot determine guilt or innocence" warning

### 4. Conversation Persistence
- Message storage in Postgres
- Conversation history retrieval
- Message ordering and timestamps
- User and case association

### 5. Citation Linking
- Statute reference detection and linking
- Case reference detection and linking
- Evidence reference linking
- Clickable citations in responses

### 6. Evidence Memory Panel
- Top-10 referenced evidence display
- Relevance scoring
- Evidence clustering by topic
- Timeline visualization

## Architecture

```
Frontend (SvelteKit)
├── Chat Page (/chat)
├── Message List
├── Streaming Response
├── Evidence Memory Panel
└── Citation Links

Backend (FastAPI)
├── Chat Service (message storage, context)
├── Gemma-3-Legal Integration (streaming)
├── Evidence Context Injection (search)
├── Legal Guardrails (disclaimers, citations)
├── Evidence Memory (tracking, scoring)
└── API Endpoints (/api/chat/*)

Data Layer
├── Postgres (messages, conversations)
├── Search Service (Phase 3B)
└── Gemma-3-Legal Model (GPU)
```

## Implementation Tasks

**Total Tasks**: 30
- **Core Tasks**: 20 (chat service, API, UI, evidence integration)
- **Optional Tasks**: 10 (tests, documentation, monitoring)

**Estimated Timeline**:
- Core implementation: 3-4 days
- Testing & optimization: 2-3 days
- Deployment: 1 day

## Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| Chat start | <500ms | Message submission to first token |
| Token streaming | <100ms | Interval between tokens |
| Context prep | <100ms | Last 10 messages formatting |
| Evidence search | <200ms | Top-3 evidence retrieval |

## Integration Points

**Depends On**:
- Phase 3B: Evidence Search (context injection)
- Phase 3A: Evidence Upload (evidence references)
- Phase 3D: Worker Pipeline (chunk embeddings)

**Feeds Into**:
- Phase 71: Evidence Upload + Worker Trigger
- Phase 72: RAG Evidence Search UI
- Phase 73: TensorRT Pooling Optimization

## Files to Create/Modify

### Backend
- `backend/chat_service.py` (new)
- `backend/legal_guardrails.py` (new)
- `backend/evidence_context.py` (new)
- `backend/evidence_memory.py` (new)
- `backend/gemma_service.py` (new)
- `backend/citation_extractor.py` (new)
- `backend/chat_metrics.py` (new)
- `backend/chat_analytics.py` (new)
- `backend/models/conversation.py` (new)
- `backend/api/chat_routes.py` (new)

### Frontend
- `sveltekit-frontend/src/routes/chat/+page.svelte` (new)
- `sveltekit-frontend/src/lib/services/chatService.ts` (new)
- `sveltekit-frontend/src/lib/components/ChatMessages.svelte` (new)
- `sveltekit-frontend/src/lib/components/StreamingResponse.svelte` (new)
- `sveltekit-frontend/src/lib/components/CitationLink.svelte` (new)
- `sveltekit-frontend/src/lib/components/EvidenceMemory.svelte` (new)
- `sveltekit-frontend/src/lib/components/LegalDisclaimer.svelte` (new)

### Tests (Optional)
- `tests/test_chat_service.py` (optional)
- `tests/test_legal_guardrails.py` (optional)
- `tests/test_evidence_context.py` (optional)
- `tests/test_chat_integration.py` (optional)
- `tests/test_chat_performance.py` (optional)

### Documentation (Optional)
- `docs/CHAT_API.md` (optional)
- `docs/CHAT_USER_GUIDE.md` (optional)

## Next Steps

1. **Review Specification**: Confirm requirements, design, and tasks
2. **Execute Core Tasks**: Implement chat service, API, and UI
3. **Test & Optimize**: Run performance tests and optimize
4. **Deploy**: Deploy to production
5. **Monitor**: Track chat metrics and user engagement

## Specification Files

- `requirements.md` - Feature requirements (10 requirements)
- `design.md` - Architecture and design decisions
- `tasks.md` - Implementation tasks (30 tasks, 20 core + 10 optional)

---

**Ready to execute Phase 70 tasks?**

Start with Task 1: Implement Chat Service Backend
