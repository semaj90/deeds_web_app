# Phase 72 Context Confirmation Layer

## Overview

A **human-in-the-loop context confirmation system** that allows the agent to propose a candidate context from chat history, ask "is this the one you meant?", and wait for explicit user feedback before proceeding.

This prevents the agent from gambling on the wrong part of the history and ensures it stays aligned with the user's intent.

---

## Architecture

### Flow

```
User sends message
        ↓
Agent searches chat history for candidate context
        ↓
If confidence < 92%:
  ├─ Propose context in modal
  ├─ Wait for user feedback (yes/no)
  ├─ Record feedback to timeline
  └─ Adjust ACA based on feedback
        ↓
Else:
  ├─ Proceed with normal ACA-driven planning
  ├─ Call LLM for next action
  └─ Return action + reasoning
```

### Components

**Backend**
- `backend/services/agent_context_confirmation.py` - Context search + feedback management
- `backend/api/phase72_agent_api.py` - Extended endpoints for context confirmation

**Frontend**
- `sveltekit-frontend/src/lib/components/ContextConfirmModal.svelte` - Modal UI
- `sveltekit-frontend/src/routes/phase72-chat/+page.svelte` - Chat page with modal integration

---

## Backend Implementation

### 1. Context Confirmation Manager

```python
from backend.services.agent_context_confirmation import ContextConfirmationManager

context_mgr = ContextConfirmationManager(redis, embeddings)

# Log a chat message
context_mgr.log_chat_event(
    session_id="phase72:deeds-web-app:main",
    role="user",
    content="What should I fix next?",
    msg_id=42
)

# Find candidate context
candidate, score = context_mgr.find_chat_context_candidate(
    session_id="phase72:deeds-web-app:main",
    user_query="What should I fix next?"
)
# Returns: (candidate_dict, 0.85)

# Record user feedback
result = context_mgr.record_context_feedback(
    session_id="phase72:deeds-web-app:main",
    context_id="uuid-...",
    accepted=True,
    user_comment="Yes, that's what I meant"
)
# Returns: {"status": "accepted", "next_hint": "..."}
```

### 2. API Endpoints

#### `POST /api/phase72/next_step`
Enhanced to support context confirmation.

**Request:**
```json
{
  "session_id": "phase72:deeds-web-app:main",
  "message": "what should I fix next?",
  "spec_files": [".kiro/specs/phase72-neo4j-ast-reducer.md"]
}
```

**Response (context confirmation mode):**
```json
{
  "session_id": "phase72:deeds-web-app:main",
  "action": "await_context_confirmation",
  "reasoning": "I found a likely previous point in this session...",
  "mode": "confirm_context",
  "candidate_context": {
    "context_id": "uuid-...",
    "source": "chatlog",
    "score": 0.85,
    "snippet": "Earlier message about fixing TS1005...",
    "range": {"from_msg_id": 10, "to_msg_id": 10},
    "timestamp": "2025-11-28T..."
  }
}
```

**Response (normal mode):**
```json
{
  "session_id": "phase72:deeds-web-app:main",
  "action": "run_svelte_check",
  "reasoning": "Need to ingest current error state...",
  "mode": "auto",
  "candidate_context": null,
  "aca_marker": "[[ACA72:...]]"
}
```

#### `POST /api/phase72/log_chat`
Log a chat message to the timeline.

**Request:**
```json
{
  "session_id": "phase72:deeds-web-app:main",
  "role": "user",
  "content": "What should I fix next?",
  "msg_id": 42
}
```

#### `POST /api/phase72/context_feedback`
Record user feedback on a proposed context.

**Request:**
```json
{
  "session_id": "phase72:deeds-web-app:main",
  "context_id": "uuid-...",
  "accepted": true,
  "user_comment": "Yes, that's what I meant"
}
```

**Response:**
```json
{
  "status": "accepted",
  "next_hint": "Context locked in; agent will continue from this point.",
  "context_id": "uuid-..."
}
```

#### `GET /api/phase72/context/{context_id}`
Retrieve a cached context candidate by ID.

---

## Frontend Implementation

### 1. Context Confirmation Modal

```svelte
<ContextConfirmModal
  context={candidateContext}
  hint="I think you meant this earlier part of the session."
  on:accept={(e) => handleContextFeedback(true, e.detail?.comment)}
  on:reject={(e) => handleContextFeedback(false, e.detail?.comment)}
/>
```

**Features:**
- Shows snippet from chat history
- Displays confidence score
- Optional user comment field
- Yes/No buttons
- Timestamp and message range info

### 2. Chat Page Integration

```svelte
<script>
  let pendingContext: CandidateContext | null = null;
  let agentHint: string | null = null;

  async function sendMessage() {
    // ... send to /api/phase72/next_step

    if (data.mode === 'confirm_context' && data.candidate_context) {
      pendingContext = data.candidate_context;
      agentHint = data.reasoning;
    } else {
      // Normal response
    }
  }

  async function handleContextFeedback(accepted: boolean, comment?: string) {
    // ... send to /api/phase72/context_feedback
  }
</script>

{#if pendingContext}
  <ContextConfirmModal
    context={pendingContext}
    hint={agentHint}
    on:accept={(e) => handleContextFeedback(true, e.detail?.comment)}
    on:reject={(e) => handleContextFeedback(false, e.detail?.comment)}
  />
{/if}
```

---

## How It Ties Back to ACA + CHR97

### ACA Integration

1. **Timeline Recording**: All context confirmations are recorded to the timeline
   - `agent-context-proposed` - Agent proposed a context
   - `agent-context-accepted` - User accepted the context
   - `agent-context-rejected` - User rejected the context

2. **Plan Updates**: When context is accepted, ACA can optionally:
   - Update the plan goal or current step
   - Create a strong link: "this range of messages == canonical for this topic"
   - Boost citations from that range

3. **Summary Regeneration**: After context feedback, ACA can force re-summarization to incorporate the confirmed context

### CHR97 Integration

1. **Heat Map Awareness**: CHR97 can track which parts of the codebase are "hot" (recently worked on)
2. **Citation Ranking**: Saved citations from confirmed contexts get boosted 3x
3. **Glyph Highlighting**: When a context is confirmed, highlight related glyphs in the GPU visualization

### Multi-Cache Sampling

1. **Authoritative Plot**: ACA-72 (Redis) keeps the high-level plan
2. **Chat History**: Stored in timeline, searchable via embeddings
3. **Confirmation State**: Cached in `agent:context_candidate:{id}` for 1 hour
4. **Feedback Loop**: User feedback updates timeline → ACA re-summarizes → next decision is more informed

---

## Usage Example

### Backend Setup

```python
from backend.services.agent_context_confirmation import ContextConfirmationManager
from backend.services.embeddings import EmbeddingService

# Initialize
embeddings = EmbeddingService(CFG)
context_mgr = ContextConfirmationManager(redis, embeddings)

# In your chat API
@app.post("/api/chat")
def chat(message: str, session_id: str):
    # Log user message
    context_mgr.log_chat_event(session_id, "user", message)

    # Get agent response
    response = agent.next_step(session_id, message)

    # Log assistant response
    context_mgr.log_chat_event(session_id, "assistant", response.reasoning)

    return response
```

### Frontend Usage

```svelte
<script>
  import ContextConfirmModal from '$lib/components/ContextConfirmModal.svelte';

  let pendingContext = null;

  async function sendMessage() {
    const res = await fetch('/api/phase72/next_step', {
      method: 'POST',
      body: JSON.stringify({ session_id, message: input })
    });

    const data = await res.json();

    if (data.mode === 'confirm_context') {
      pendingContext = data.candidate_context;
    }
  }

  async function handleFeedback(accepted) {
    await fetch('/api/phase72/context_feedback', {
      method: 'POST',
      body: JSON.stringify({
        session_id,
        context_id: pendingContext.context_id,
        accepted
      })
    });

    pendingContext = null;
  }
</script>

{#if pendingContext}
  <ContextConfirmModal
    context={pendingContext}
    on:accept={() => handleFeedback(true)}
    on:reject={() => handleFeedback(false)}
  />
{/if}
```

---

## Confidence Threshold

The default confidence threshold is **0.92** (92% match). You can adjust this:

```python
# In /api/phase72/next_step
if candidate and confidence < 0.92:  # Adjust this value
    # Ask for confirmation
```

**Tuning:**
- **Higher threshold** (e.g., 0.95) - Ask for confirmation more often (safer)
- **Lower threshold** (e.g., 0.85) - Ask less often (faster, riskier)

---

## Redis Keys

```
agent:timeline:{session_id}
  └─ Contains all events including chat messages and confirmations

agent:context_candidate:{context_id}
  └─ Cached candidate context (TTL: 1 hour)
  └─ Format: {
       "session_id": "...",
       "candidate": {...},
       "created_at": "..."
     }
```

---

## Files Created

- `backend/services/agent_context_confirmation.py` (250 lines)
- `backend/api/phase72_agent_api.py` (extended with new endpoints)
- `sveltekit-frontend/src/lib/components/ContextConfirmModal.svelte` (150 lines)
- `sveltekit-frontend/src/routes/phase72-chat/+page.svelte` (250 lines)

---

## Next Steps

1. **Wire up embeddings service** - Ensure `EmbeddingService` is available
2. **Test context search** - Verify embedding-based search works
3. **Test modal UX** - Ensure modal appears and feedback is recorded
4. **Integrate with Phase 72 pipeline** - Wire chat logging into your pipeline
5. **Monitor confidence scores** - Adjust threshold based on real usage

---

## Summary

You now have a **human-in-the-loop context confirmation layer** that:

✅ Searches chat history for candidate contexts
✅ Proposes contexts when confidence is low
✅ Shows a modal asking "is this the one you meant?"
✅ Records user feedback to timeline
✅ Updates ACA based on confirmed contexts
✅ Prevents agent from gambling on wrong history

The agent stays aligned with user intent and never loses the plot.
