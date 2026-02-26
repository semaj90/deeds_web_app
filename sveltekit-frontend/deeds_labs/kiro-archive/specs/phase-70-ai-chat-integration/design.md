# Phase 70: AI Chat Integration - Design

## Overview

Phase 70 implements a complete AI Chat Integration system with streaming responses, evidence context, legal guardrails, and conversation persistence. The system uses Gemma-2b-it for legal reasoning and integrates with Phase 3B search for evidence context.

**Key Components**:
- Backend chat service (Python FastAPI)
- Frontend chat UI (SvelteKit)
- Conversation persistence (Postgres)
- Evidence memory tracking
- Real-time streaming (SSE)

**Performance Targets**:
- Chat start: <500ms
- Token streaming: <100ms intervals
- Context preparation: <100ms
- Evidence search: <200ms

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (SvelteKit)                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Chat Page    │  │ Message List │  │ Evidence Memory  │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│         │                 │                    │             │
│         └─────────────────┼────────────────────┘             │
│                           │                                  │
├───────────────────────────┼──────────────────────────────────┤
│                    API Layer (FastAPI)                       │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ POST /api/chat/message                               │   │
│  │ GET /api/chat/history/{case_id}                      │   │
│  │ GET /api/chat/stream/{message_id}                    │   │
│  │ GET /api/chat/evidence/{case_id}                     │   │
│  │ DELETE /api/chat/history/{case_id}                   │   │
│  └──────────────────────────────────────────────────────┘   │
│                           │                                  │
├───────────────────────────┼──────────────────────────────────┤
│                  Chat Service Layer                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Context Prep │  │ Evidence Inj │  │ Gemma3-2b LLM     │  │
│  │ (last 10)    │  │ (top-3)      │  │ (streaming)      │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│         │                 │                    │             │
├─────────┼─────────────────┼────────────────────┼─────────────┤
│         │                 │                    │             │
│  ┌──────▼──────┐  ┌──────▼──────┐  ┌─────────▼────────┐    │
│  │ Postgres    │  │ Search Svc  │  │ Gemma-2b Model   │    │
│  │ (messages)  │  │ (evidence)  │  │ (GPU)            │    │
│  └─────────────┘  └─────────────┘  └──────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. Chat Service (`backend/chat_service.py`)

**Responsibilities**:
- Message storage and retrieval
- Context window management
- Evidence context injection
- Streaming response generation

**Key Methods**:
```python
class ChatService:
    async def send_message(case_id: str, user_id: str, message: str) -> str
    async def get_conversation(case_id: str, limit: int = 10) -> List[Message]
    async def stream_response(message_id: str) -> AsyncGenerator[str, None]
    async def inject_evidence_context(query: str) -> str
```

### 2. Legal Guardrails (`backend/legal_guardrails.py`)

**Responsibilities**:
- Disclaimer injection
- Citation enforcement
- Confidence scoring
- Response validation

**Key Methods**:
```python
class LegalGuardrails:
    async def inject_disclaimer(response: str) -> str
    async def enforce_citations(response: str) -> str
    async def score_confidence(response: str) -> float
    async def validate_response(response: str) -> bool
```

### 3. Evidence Memory (`backend/evidence_memory.py`)

**Responsibilities**:
- Track evidence referenced in chat
- Score evidence by relevance
- Cluster evidence by topic
- Timeline visualization

**Key Methods**:
```python
class EvidenceMemory:
    async def add_evidence(case_id: str, chunk_id: str, relevance: float) -> None
    async def get_evidence(case_id: str, limit: int = 10) -> List[Evidence]
    async def score_evidence(case_id: str) -> Dict[str, float]
    async def cluster_evidence(case_id: str) -> Dict[str, List[str]]
```

### 4. Chat API Endpoints

**POST /api/chat/message**
```json
Request:
{
  "case_id": "case_123",
  "user_id": "user_456",
  "message": "What evidence supports intent?",
  "role": "prosecutor"
}

Response:
{
  "message_id": "msg_789",
  "status": "streaming",
  "stream_url": "/api/chat/stream/msg_789"
}
```

**GET /api/chat/stream/{message_id}** (SSE)
```
event: token
data: "The"

event: token
data: " evidence"

event: done
data: {"message_id": "msg_789", "full_response": "..."}
```

**GET /api/chat/history/{case_id}**
```json
Response:
{
  "case_id": "case_123",
  "messages": [
    {
      "id": "msg_1",
      "role": "user",
      "content": "What evidence supports intent?",
      "timestamp": "2024-01-01T12:00:00Z"
    },
    {
      "id": "msg_2",
      "role": "assistant",
      "content": "Based on the evidence...",
      "timestamp": "2024-01-01T12:00:05Z"
    }
  ]
}
```

### 5. Frontend Chat UI (`sveltekit-frontend/src/routes/chat/+page.svelte`)

**Components**:
- Chat message list
- Message input box
- Streaming response display
- Evidence memory panel
- Disclaimer stripe

**State Management**:
- Messages list
- Current message
- Streaming state
- Evidence memory
- User role

### 6. Evidence Memory Panel (`sveltekit-frontend/src/lib/components/EvidenceMemory.svelte`)

**Features**:
- Top-10 referenced evidence
- Relevance scoring
- Evidence clustering
- Timeline visualization
- Click to navigate

## Data Models

### Message
```python
@dataclass
class Message:
    id: str
    case_id: str
    user_id: str
    role: str  # "user", "assistant", "prosecutor", "detective"
    content: str
    timestamp: datetime
    evidence_references: List[str]
    citations: List[str]
```

### Conversation
```python
@dataclass
class Conversation:
    id: str
    case_id: str
    user_id: str
    created_at: datetime
    last_updated: datetime
    message_count: int
    evidence_memory: Dict[str, float]
```

### EvidenceReference
```python
@dataclass
class EvidenceReference:
    chunk_id: str
    doc_id: str
    relevance_score: float
    reference_count: int
    last_referenced: datetime
```

## Error Handling

**Chat Errors**:
- LLM unavailable → "Chat service unavailable"
- Evidence search fails → "Could not load evidence context"
- Message storage fails → "Could not save message"
- Streaming connection fails → "Connection lost"
- User not authenticated → "Please log in to chat"

**Retry Logic**:
- LLM request: 2 retries with exponential backoff
- Evidence search: 2 retries
- Message storage: 1 retry

**Logging**:
- Log all chat messages (anonymized)
- Log evidence references
- Log latency breakdown
- Log errors with context

## Testing Strategy

### Unit Tests
- Message storage and retrieval
- Context window management
- Evidence context injection
- Legal guardrails enforcement
- Citation linking

### Integration Tests
- End-to-end chat (message → response → storage)
- Evidence context injection
- Streaming response
- Conversation persistence

### Performance Tests
- Chat start latency (<500ms)
- Token streaming latency (<100ms)
- Context preparation (<100ms)
- Evidence search (<200ms)
- Concurrent chat handling (10+ simultaneous)

### UI Tests
- Message input and submission
- Streaming response display
- Evidence memory panel
- Citation linking
- Disclaimer display

## Performance Optimization

**Caching Strategy**:
- Context caching (5-minute TTL)
- Evidence context caching (1-hour TTL)
- Conversation history caching (session)

**Chat Optimization**:
- Batch message storage
- Async evidence search
- Token streaming with buffering
- Connection pooling (Postgres, search service)

**Frontend Optimization**:
- Lazy loading of message history
- Virtual scrolling for long conversations
- Debounced message input
- Progressive rendering of evidence memory

## Deployment Considerations

**Environment Variables**:
- `GEMMA_MODEL`: Gemma model name (default: `gemma3-legal:latest`)
- `POSTGRES_URL`: Postgres connection URL
- `SEARCH_SERVICE_URL`: Search service URL
- `EVIDENCE_MEMORY_TTL`: Evidence memory TTL (default: 24h)

**Dependencies**:
- Postgres (message storage)
- Gemma-2b-it model (GPU)
- Search service (Phase 3B)
- FastAPI (backend)
- SvelteKit (frontend)

**Scaling**:
- Horizontal scaling: Multiple chat service instances
- Load balancing: Round-robin across instances
- Database sharing: Centralized Postgres
- Model sharing: Centralized GPU inference

## Security Considerations

- Input validation: Message length, content
- Rate limiting: Messages per user per minute
- Authentication: User must be logged in
- Authorization: Users can only chat on their cases
- Data privacy: Chat messages encrypted at rest
- Audit logging: All chat interactions logged

---

## Summary

Phase 70 implements a complete AI Chat Integration system with:
- Streaming chat responses via SSE
- Evidence context injection from search
- Conversation persistence in Postgres
- Legal guardrails and disclaimers
- Citation linking and evidence memory
- Real-time token-by-token rendering

The design prioritizes performance (<500ms chat start, <100ms token streaming) and user experience (intuitive chat, evidence tracking).
