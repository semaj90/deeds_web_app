# Handler + TODO Integration — Agentic Task Prioritization

**Date:** June 29, 2026  
**Status:** DESIGN (ready to implement)  
**Scope:** Wire codebase-todo-aggregator into NATS handler queue prioritization

---

## Overview

The **codebase-todo-aggregator** skill ranks what work to do next (based on authority, GPU blend, attention, dirty files, AGENTS.md rules). The **NATS handlers** execute distributed tasks. Together they form a **priority-driven agentic task loop**:

```
Idle review (periodic heartbeat)
  ↓
TODO aggregator (fuse Redis signals + Postgres + Gemma4)
  ↓
Ranked work queue (top 7 priorities)
  ↓
NATS handlers (execute task in order)
  ↓
Feedback loop (update Redis + Postgres)
  ↓
Repeat
```

---

## Component Architecture

### 1. Codebase TODO Aggregator

**File:** `scripts/skills/codebase-todo-aggregator.mjs`

**Input signals (fused with weights):**
- `ace:authority:top` (Redis hash) — 40% weight
- `gpu:karpathy:scores` (Redis hash) — 35% weight
- `gpu:karpathy:scores` attention field — 15% weight
- `ace:rank:dirty_files` (Redis set) — 10% boost
- `agent_context_files` (Postgres) — AGENTS.md rule density (filter)
- `ace:engram:bigram:*` (Redis) — bias toward active domains

**Output:**
```json
[
  {
    "file": "path/to/file.ts",
    "title": "Human-readable task description",
    "authority": 0.88,
    "karpathy": 0.81,
    "attention": 0.76,
    "isDirty": false,
    "blend": 0.654,  // 0.40*authority + 0.35*karpathy + 0.15*attention + dirty_boost
    "reason": "Why this ranked high"
  },
  // ... top 7
]
```

**Current state:** Mock data (pending Redis wiring). Gemma4 rerank not yet integrated.

### 2. NATS Handlers

**Files:** `sveltekit-frontend/scripts/nats-handlers.mjs`

**5 subjects responding to requests:**
- `agent.task.execute` — Run task from queue
- `retrieval.turbovec.rerank` — Rerank candidates for this task
- `gpu.cuvs.search` — Find related code/docs for context
- `gpu.cuda.rank` — Score relevance of findings
- `engram.feedback.async` — Log outcome (success/fail)

**Current state:** Synchronous stubs (no queue management yet). Each subject independent.

### 3. Integration Point: Task Queue

A new subject wraps the aggregator + handlers:

```
agent.task.execute (existing)
  ↑
Input: { task_type: "codebase-fix", file: "...", title: "...", blend: 0.65 }
  ↓
Handler logic:
1. Fetch task context (AGENTS.md for file + related files)
2. Fetch code snippet (Git + Postgres)
3. Call Gemma4 to generate fix
4. Validate fix (lint, type check, tests)
5. Propose PR or commit
6. Log outcome (engram.feedback.async)
```

---

## Proposed Integration (Phase 2)

### New Subject: `agent.task.from-queue`

**Request:**
```json
{
  "task_id": "uuid",
  "task_type": "codebase-fix|feature|test|refactor",
  "file": "path/to/file.ts",
  "title": "Human-readable task",
  "blend": 0.65,
  "authority": 0.88,
  "reason": "Why this was recommended"
}
```

**Handler logic (pseudocode):**
```javascript
async function handleTaskFromQueue(nc) {
  const sub = nc.subscribe('agent.task.from-queue');
  
  for await (const msg of sub) {
    const req = JSON.parse(msg.data);
    
    try {
      // 1. Load AGENTS.md context for file
      const context = await getAgentsMdContext(req.file);
      
      // 2. Fetch code snippet + related files
      const code = await fetchCodeSnippet(req.file);
      
      // 3. Call Gemma4 to generate fix
      const fixPrompt = buildFixPrompt(req.title, code, context);
      const fix = await callGemma4(fixPrompt);
      
      // 4. Validate
      const validated = await validateFix(fix);
      
      // 5. Respond with fix + next action
      const response = {
        task_id: req.task_id,
        status: 'completed|needs_review|failed',
        fix: { code, description, tests },
        nextAction: 'commit|review|iterate',
        handler: 'agent.task.from-queue'
      };
      
      msg.respond(encode(response));
      
      // 6. Log feedback
      await nc.publish('engram.feedback.async', {
        task_id: req.task_id,
        outcome: 'completed|failed',
        duration_ms: Date.now() - start
      });
    } catch (err) {
      // Error response
      msg.respond(encode({
        task_id: req.task_id,
        status: 'failed',
        error: err.message
      }));
    }
  }
}
```

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ Idle Review Agent (periodic, or user-triggered)               │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ Codebase TODO Aggregator                                        │
│ ├─ Read Redis signals (authority, karpathy, attention)         │
│ ├─ Read Postgres AGENTS.md rule density                        │
│ ├─ Fuse scores: 0.40*auth + 0.35*karp + 0.15*attn + 0.10*dirty│
│ └─ Output: ranked list of 7 top tasks                          │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ NATS Task Queue                                                 │
│ (publish top-7 to agent.task.from-queue)                       │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ NATS Handler: agent.task.from-queue                            │
│ ├─ Load AGENTS.md context                                      │
│ ├─ Fetch code + related files                                  │
│ ├─ Call Gemma4 (generate fix)                                  │
│ ├─ Validate (lint + type check)                                │
│ └─ Respond with fix OR error                                   │
└─────────────────────────────────────────────────────────────────┘
                    ↙           ↓           ↘
         ┌──────────────┐  ┌──────────┐  ┌──────────────┐
         │ git commit   │  │ propose  │  │ iterate w/   │
         │ (auto-apply) │  │ PR       │  │ Gemma4       │
         └──────────────┘  └──────────┘  └──────────────┘
                    ↓           ↓           ↓
          ┌─────────────────────────────────────────┐
          │ engram.feedback.async (log outcome)     │
          └─────────────────────────────────────────┘
                            ↓
          ┌─────────────────────────────────────────┐
          │ Update Redis + Postgres with results    │
          │ (for next aggregator run)               │
          └─────────────────────────────────────────┘
```

---

## Wiring Checklist

### Phase 1 (Current): Handler Proof ✅
- ✅ NATS handlers proven (5/5 subjects)
- ✅ Request/reply semantics working
- ✅ Mock responses + test suite

### Phase 2 (Next): Real Logic + TODO Integration
- ⏳ Replace handler mock responses with real logic
- ⏳ Wire codebase-todo-aggregator to Redis (replace mock data)
- ⏳ Create `agent.task.from-queue` handler
- ⏳ Integrate Gemma4 for fix generation
- ⏳ Add validation (lint + type check)
- ⏳ Wire engram.feedback for outcome logging

### Phase 3 (Future): Production Hardening
- ⏳ Move handlers to Go sidecar
- ⏳ Add circuit breaker + retry logic
- ⏳ Implement rate limiting per task type
- ⏳ Add observability (Langfuse + Datadog)
- ⏳ Implement feedback loop back to TODO scores

---

## Key Signals (Redis Keys to Wire)

| Key | Type | Content | Weight | Used by |
|-----|------|---------|--------|---------|
| `ace:authority:top` | hash | file → score | 40% | TODO aggregator |
| `gpu:karpathy:scores` | hash | file → {pr, attn, auth, blend} | 35% + 15% | TODO aggregator |
| `ace:rank:dirty_files` | set | recently modified files | +10% boost | TODO aggregator |
| `ace:engram:bigram:*` | sorted set | topic → frequency | bias | TODO aggregator (domain bias) |
| `agents:dir:*` | string | rendered AGENTS.md | filter | TODO aggregator (rule density) |

All signals should update after each successful task completion (engram.feedback.async).

---

## Testing the Integration

### Before Phase 2 Implementation:

```bash
# 1. Verify TODO aggregator outputs top-7
npm run skill:codebase-todo:stdout

# 2. Verify handlers work
npm run nats:handlers &
npm run nats:proof-of-life:all

# 3. Verify AGENTS.md context loads
npm run agents:write  # regenerate if needed
/nes-arch inspect src/lib/server  # spot-check one dir
```

### After Phase 2 Implementation:

```bash
# 1. Publish task from TODO queue to NATS
node -e "
  import { connect, StringCodec } from 'nats';
  const nc = await connect();
  const task = {
    task_id: 'test-1',
    task_type: 'codebase-fix',
    file: 'src/lib/server/db/client.ts',
    title: 'Fix connection pooling timeout',
    blend: 0.72
  };
  const reply = await nc.request('agent.task.from-queue', 
    JSON.stringify(task), { timeout: 10000 });
  console.log(JSON.parse(reply.data));
"

# 2. Verify outcome logged to engram.feedback.async
# (should see task_id + outcome in response)

# 3. Check Redis updated with results
npm run nes:inspect:agents  # verify latest todo scores
```

---

## Success Criteria

| Criterion | Verification |
|-----------|--------------|
| **TODO aggregator outputs ranked list** | `npm run skill:codebase-todo:stdout` returns top-7 |
| **Handlers accept tasks from queue** | `agent.task.from-queue` subject responds correctly |
| **Context loads + code fetched** | AGENTS.md + code snippet included in Gemma4 prompt |
| **Fix generated + validated** | Response includes fix + validation result |
| **Feedback logged** | engram.feedback.async receives task_id + outcome |
| **Signals updated** | Next TODO run reflects completed task (lower score) |

---

## Future: Autonomous Loop

Once all pieces are wired, the full autonomous loop:

```
every 5 minutes:
  1. Run codebase-todo-aggregator
  2. For each top-7 task:
     - Publish to agent.task.from-queue
     - Wait for response (10s timeout)
     - Log outcome
  3. Update Redis signals
  4. Repeat
```

This becomes the **idle review agent** that finds + prioritizes + executes work with zero manual intervention.

---

## Files to Update

| File | Changes |
|------|---------|
| `sveltekit-frontend/scripts/nats-handlers.mjs` | Add `handleTaskFromQueue()` handler |
| `sveltekit-frontend/scripts/nats-proof-of-life.mjs` | Add test for `agent.task.from-queue` |
| `sveltekit-frontend/package.json` | Add `nats:task:from-queue:test` script |
| `scripts/skills/codebase-todo-aggregator.mjs` | Wire Redis + Gemma4 (replace mocks) |
| `docs/HANDLER-TODO-INTEGRATION.md` | This file |
| `sveltekit-frontend/scripts/AGENTS.md` | Update with new handler |

---

## Summary

**The pattern is proven.** NATS handlers work. TODO aggregator is ready. Next step is wiring them together so:

1. TODO aggregator ranks work
2. Handlers execute ranked tasks
3. Feedback loop updates signals
4. Repeat autonomously

This completes the **agentic task loop** that was the original goal of Session 91.

---

**Status:** DESIGN READY  
**Owner:** Agentic system  
**Next:** Implement Phase 2 (real logic + integration)
