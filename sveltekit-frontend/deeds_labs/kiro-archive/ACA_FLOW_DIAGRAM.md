# Agentic Context Anchor (ACA) - Flow Diagrams

## 1. Session Initialization Flow

```
User initiates work
        ↓
POST /api/agent/next_step
  ├─ session_id: "doj_v_foo:user123"
  ├─ goal: "analyze supremacy clause conflict"
  └─ spec_files: [".kiro/specs/..."]
        ↓
AgentPlanner.init_session_with_plan()
        ↓
ACA.set_plan()
  └─ Stores in Redis: agent:plan:{session_id}
        ↓
ACA.ensure_summaries()
  ├─ Generates session summary (Granite)
  ├─ Generates spec summary (ripgrep + Granite)
  └─ Stores in Redis: agent:summary:{session_id}:{version}
        ↓
Returns Response
  ├─ action: "search"
  ├─ reason: "New case ingested..."
  ├─ aca_marker: "[[ACA:doj_v_foo:user123:s1:p1]]"
  └─ aca_context: {summary_version, spec_summary_version, ...}
        ↓
Client receives marker + context
```

## 2. Timeline Event Recording Flow

```
User performs action (search, ingest, edit, etc.)
        ↓
POST /api/agent/record_event
  ├─ session_id: "doj_v_foo:user123"
  ├─ kind: "search"
  ├─ payload: {query: "Supremacy Clause"}
  └─ description: "Searched for Supremacy Clause precedents"
        ↓
ACA.append_timeline()
  ├─ Creates event: {ts, kind, payload, description}
  ├─ Stores in Redis: agent:timeline:{session_id}
  └─ Keeps last 500 events (FIFO)
        ↓
Event recorded
```

## 3. Next Step Decision Flow

```
POST /api/agent/next_step
  └─ session_id: "doj_v_foo:user123"
        ↓
ACA.ensure_summaries()
  ├─ Fetch or generate session summary
  ├─ Fetch or generate spec summary
  └─ Return latent marker
        ↓
AgentPlanner.next_step()
  ├─ Read timeline events
  ├─ Analyze event patterns
  ├─ Check alignment signals (negativity, intent, on-task)
  ├─ Check CHR97 heat (where in legal manifold?)
  └─ Decide next action
        ↓
ACA.maybe_compact_context()
  ├─ Estimate tokens
  ├─ If > 70% of limit:
  │  ├─ Force re-summarization
  │  ├─ Truncate old events
  │  └─ Return True
  └─ Else: Return False
        ↓
Returns Response
  ├─ action: "search" | "analyze" | "summarize" | etc.
  ├─ reason: "..."
  ├─ confidence: 0.9
  ├─ aca_marker: "[[ACA:...]]"
  └─ aca_context: {...}
```

## 4. LLM Call with ACA Context Flow

```
Chat Driver
        ↓
ACA.build_llm_prompt_with_aca()
  ├─ Fetch plan + summaries
  ├─ Build system prompt:
  │  ├─ "You are YoRHa Legal Agent..."
  │  ├─ "Agentic Context Anchor: [[ACA:...]]"
  │  ├─ "High-level plan summary: ..."
  │  └─ "Relevant spec summary: ..."
  └─ Build user prompt:
     ├─ "User message: ..."
     └─ "Recent events: ..."
        ↓
LLM (Gemma/Granite)
  ├─ Reads system prompt with ACA marker
  ├─ Reads user message + recent events
  ├─ Generates response
  └─ May emit <|CTX_RECALL|> if needs context
        ↓
Chat Driver
  ├─ Receives response
  ├─ Calls ACA.maybe_compact_context()
  │  └─ If overflow: auto-compact
  └─ Continues
```

## 5. Context Overflow Handling Flow

```
LLM Call
        ↓
ACA.maybe_compact_context()
  ├─ Estimate tokens from timeline
  ├─ If tokens > 70% of 8192:
  │  ├─ ACA.ensure_summaries(..., force=True)
  │  │  ├─ Generate new session summary (v2)
  │  │  ├─ Generate new spec summary (v2)
  │  │  └─ Update plan versions
  │  ├─ Redis.ltrim(agent:timeline:{session_id}, 0, 99)
  │  │  └─ Keep last 100 events, drop older
  │  └─ Return True (compaction triggered)
  └─ Else: Return False
        ↓
If compaction triggered:
  ├─ New latent marker: [[ACA:session_id:s2:p2]]
  ├─ Old events truncated
  ├─ Summaries cached in Redis
  └─ Next LLM call uses fresh context
```

## 6. Context Recovery Flow

```
Process crashes or context lost
        ↓
Client has latent marker: [[ACA:doj_v_foo:user123:s1:p1]]
        ↓
POST /api/agent/recover_context
  └─ marker: "[[ACA:doj_v_foo:user123:s1:p1]]"
        ↓
ACA.recover_context()
  ├─ Parse marker:
  │  ├─ session_id: "doj_v_foo:user123"
  │  ├─ summary_version: 1
  │  └─ spec_summary_version: 1
  ├─ Fetch from Redis:
  │  ├─ agent:summary:doj_v_foo:user123:1
  │  ├─ agent:spec_summary:doj_v_foo:user123:1
  │  └─ agent:plan:doj_v_foo:user123
  └─ Return full context
        ↓
Returns Response
  ├─ session_id: "doj_v_foo:user123"
  ├─ summary_version: 1
  ├─ spec_summary_version: 1
  ├─ summary_text: "..."
  ├─ spec_text: "..."
  └─ plan: {...}
        ↓
Client rebuilds prompt with recovered context
        ↓
Resume work
```

## 7. TensorRT Hook Flow (Optional)

```
TRT Decode Loop
        ↓
Generate tokens
        ↓
Check for <|CTX_RECALL|> token
        ↓
If found:
  ├─ Stop decoding
  ├─ Fetch ACA from Redis:
  │  ├─ Decode marker from prompt
  │  ├─ Fetch agent:summary:{session_id}:{version}
  │  ├─ Fetch agent:spec_summary:{session_id}:{version}
  │  └─ Fetch agent:plan:{session_id}
  ├─ Rebuild prompt with fresh context
  ├─ Reset input_ids
  └─ Continue decoding
        ↓
Else:
  ├─ Append tokens to response
  ├─ Continue decoding
  └─ Check stopping criterion
        ↓
Done
```

## 8. Full Session Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│ Session Lifecycle                                           │
└─────────────────────────────────────────────────────────────┘

1. INIT
   ├─ POST /api/agent/next_step (with goal + spec_files)
   ├─ ACA.set_plan()
   ├─ ACA.ensure_summaries()
   └─ Return marker: [[ACA:session_id:s1:p1]]

2. WORK
   ├─ User performs actions (search, ingest, edit)
   ├─ POST /api/agent/record_event (for each action)
   ├─ ACA.append_timeline()
   └─ Events stored in Redis

3. PLAN
   ├─ POST /api/agent/next_step (periodically)
   ├─ ACA.ensure_summaries()
   ├─ AgentPlanner.next_step()
   ├─ ACA.maybe_compact_context()
   └─ Return next action + marker

4. LLM
   ├─ Chat driver calls LLM
   ├─ ACA.build_llm_prompt_with_aca()
   ├─ LLM generates response
   ├─ ACA.maybe_compact_context()
   └─ Continue

5. OVERFLOW (if needed)
   ├─ ACA.ensure_summaries(..., force=True)
   ├─ Generate new summary versions
   ├─ Truncate old timeline events
   ├─ Update plan versions
   └─ New marker: [[ACA:session_id:s2:p2]]

6. RECOVERY (if crash)
   ├─ Client has marker: [[ACA:session_id:s1:p1]]
   ├─ POST /api/agent/recover_context
   ├─ ACA.recover_context()
   ├─ Fetch summaries + plan from Redis
   └─ Resume work

7. END
   ├─ Session complete
   ├─ Redis keys expire after 7 days
   └─ Or manually delete: redis-cli del agent:*:{session_id}
```

## 9. Data Flow: User → Agent → LLM → Response

```
┌──────────────────────────────────────────────────────────────┐
│ User                                                         │
│ ├─ Searches legal corpus                                    │
│ ├─ Ingests complaint                                        │
│ ├─ Edits notes                                              │
│ └─ Asks "What's next?"                                      │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│ Agent (AgentPlanner + ACA)                                  │
│ ├─ Record event to timeline                                 │
│ ├─ Fetch plan + summaries                                   │
│ ├─ Check alignment signals (negativity, intent, on-task)   │
│ ├─ Check CHR97 heat (topology)                              │
│ ├─ Decide next action                                       │
│ └─ Check context overflow                                   │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│ LLM (Gemma/Granite)                                         │
│ ├─ System prompt: goal + plan + spec + ACA marker          │
│ ├─ User prompt: message + recent events                    │
│ ├─ Generate response                                        │
│ └─ May emit <|CTX_RECALL|> if needs context                │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│ Response                                                     │
│ ├─ Action: "search" | "analyze" | "summarize" | etc.       │
│ ├─ Reason: "..."                                            │
│ ├─ ACA Marker: "[[ACA:session_id:s1:p1]]"                  │
│ ├─ Context: {summary_version, spec_summary_version, ...}   │
│ └─ Confidence: 0.9                                          │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│ User                                                         │
│ ├─ Sees recommended action                                  │
│ ├─ Sees ACA marker (for recovery)                           │
│ ├─ Sees context summary                                     │
│ └─ Decides to proceed or ask for clarification              │
└──────────────────────────────────────────────────────────────┘
```

## 10. Redis State Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ Redis State                                                 │
└─────────────────────────────────────────────────────────────┘

agent:plan:doj_v_foo:user123
├─ session_id: "doj_v_foo:user123"
├─ goal: "analyze supremacy clause conflict"
├─ spec_files: [".kiro/specs/..."]
├─ summary_version: 1
├─ spec_summary_version: 1
└─ updated_at: "2025-11-28T..."

agent:timeline:doj_v_foo:user123 (FIFO, max 500)
├─ [0] {ts, kind: "search", payload: {query: "Supremacy Clause"}, ...}
├─ [1] {ts, kind: "ingest", payload: {case_id: "doj_v_foo"}, ...}
├─ [2] {ts, kind: "edit", payload: {note: "..."}, ...}
└─ ...

agent:summary:doj_v_foo:user123:1
└─ "Session summary text (compressed)..."

agent:spec_summary:doj_v_foo:user123:1
└─ "Spec summary text (compressed)..."

agent:session:doj_v_foo:user123
├─ session_id: "doj_v_foo:user123"
├─ created_at: "2025-11-28T..."
├─ updated_at: "2025-11-28T..."
├─ last_step: "search"
└─ last_description: "Searched for Supremacy Clause precedents"
```

---

## Legend

```
→   Flow direction
├─  Branch
└─  End of branch
[N] Array index
{...} Object/dict
"..." String
```

---

## Quick Reference

| Flow | Purpose | Endpoint |
|------|---------|----------|
| 1 | Initialize session | `POST /api/agent/next_step` (with goal + spec_files) |
| 2 | Record event | `POST /api/agent/record_event` |
| 3 | Get next step | `POST /api/agent/next_step` |
| 4 | LLM call | Chat driver (internal) |
| 5 | Handle overflow | `ACA.maybe_compact_context()` (internal) |
| 6 | Recover context | `POST /api/agent/recover_context` |
| 7 | TRT hook | TRT decode loop (optional) |
| 8 | Full lifecycle | All of the above |
| 9 | Data flow | User → Agent → LLM → Response |
| 10 | Redis state | Redis keys + values |
