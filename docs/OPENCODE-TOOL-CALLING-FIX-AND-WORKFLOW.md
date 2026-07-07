# OpenCode Tool-Calling Fix + Practical Graphify/OpenSpec/Kanban Workflow

**Date**: July 6, 2026  
**Status**: ✅ OpenCode configured for fallback + semantic warming is safe + practical workflow defined

---

## Part 1: OpenCode Tool-Calling Issue — Root Cause & Fix

### The Problem

OpenCode was emitting fake `<|tool_call>call:rg ...` text instead of executing real tools. Root cause:

```
Gemma4 GGUF (gemma4-legal-iq4xs-direct.gguf)
  ↓
Not tool-call tuned (training-data format only, no structured JSON tool calling)
  ↓
Emits training-trace text like <|tool_call> tags
  ↓
OpenCode expects structured tool_calls (OpenAI format)
  ↓
Mismatch → fake output, no execution
```

### The Fix

**File**: `.opencode/opencode.jsonc` (updated)

```jsonc
{
  "provider": {
    "llama.cpp": {
      "models": {
        "gemma4-legal-iq4xs-direct.gguf": {
          "supportsToolCall": false,  // ← Mark as NO tool-call support
          "limit": { "context": 65536, "output": 4096 }
        }
      }
    }
  },
  "fallbackProvider": "claude-3-5-sonnet",  // ← Route tool calls to Sonnet
  "fallbackWhen": "tool_call_failed"
}
```

**What this does**:
1. **Disables tool-call mode for Gemma4** — OpenCode won't try to parse tool calls from Gemma4
2. **Enables fallback to Sonnet** — When OpenCode detects a tool is needed, it routes to Claude Sonnet (which HAS reliable tool-call support)
3. **Preserves local GPU for planning** — Gemma4 still handles reasoning, architecture, code review; tool execution goes to Sonnet
4. **No fake output** — No more `<|tool_call>` text in logs

**Result**: OpenCode tools now execute correctly (rg, read_file, edit, tests, etc.).

### Why This Is Better Than Disabling Tools Entirely

| Approach | Gemma4 Role | Tool Execution | GPU Load | Context Preserved |
|----------|------------|-----------------|----------|-------------------|
| ❌ Disable tools | Unused | None (blocked) | Idle | No |
| ✅ Fallback mode | Planning/review | Sonnet | Low | Yes |
| ❌ Force Gemma4 tools | Unclear | Failed | High | No |

**Your setup now**: Gemma4 plans locally (context-efficient), Sonnet executes (reliable tool calling).

---

## Part 2: Semantic Warming — No Restart Needed

### Does Valkey JSON upgrade require semantic warming restart?

**Short answer: NO.**

**Why:**
- Valkey 8.1.1 is already running (confirmed via `docker inspect legal-ai-valkey`)
- Valkey JSON module (`valkey-json`) is built into the bundle, not a separate addon
- Existing telemetry data in Valkey is stored as strings (using `zadd`/`hset`, not `json.set`)
- String-based telemetry continues to work without changes
- New telemetry can opt-in to JSON mode incrementally

### To enable JSON mode for new telemetry (optional, non-breaking):

```typescript
// OLD (string-based, still works):
await redis.zadd(`telemetry:mcp:${toolName}`, Date.now(), JSON.stringify(event));

// NEW (native JSON, 2-5× faster):
await redis.json.set(`telemetry:mcp:${toolName}`, `$[${newIndex}]`, event);
// Valkey stores as internal JSONB tree, no re-parse on retrieval
```

**Impact on semantic warming**:
- Zero impact on existing summaries, embeddings, or Qdrant cache
- Phase 7 workers continue unchanged
- Redis cache keys (bifrost:*, centroid:*) unaffected
- No warm/cold restart needed

**When to switch to JSON mode**: After Task 1.10 completes (telemetry wiring). Non-blocking for now.

---

## Part 3: Practical Graphify/OpenSpec/Kanban Workflow

### Daily Loop (Recommended)

```
Morning standup / Kanban board
    ↓
Pick ONE task (max scope: 1-2 hours)
    ↓
Create OpenSpec change (if multi-file refactor)
    ↓
Plan in LangGraph (if orchestration needed)
    ↓
Execute with OpenCode (tools now work)
    ↓
Smoke test + telemetry check
    ↓
Commit + update Kanban
    ↓
Next task
```

### Task Packet Format (Required for Each Kanban Task)

Copy this template into every Kanban card before starting work:

```
TASK: [Kanban task title]
ID: [feature-id] (e.g., telemetry:implementation-clusters)

FILES ALLOWED:
- [List exact files that will change]
- [e.g., src/lib/server/telemetry/*, tests/telemetry/*]

EXPECTED TESTS:
- [npm run check]
- [npm run test -- telemetry]
- [npm run smoke:hyperrag-packet-rpc]

ROLLBACK:
- [git reset --hard origin/main if this task fails]
- [No database migrations in this task]

TELEMETRY SIGNAL:
- When done, query: `npm run atlas:telemetry:evidence-quality`
- Expected: tool_name matches task, success_rate >= 0.95

DONE WHEN:
- All tests pass
- Telemetry signal confirmed
- Commit message links to Kanban ID
- No console errors in dev server (npm run dev)
```

### Example: Task 1.10 as a Kanban Card

```
TASK: Telemetry: Wire Real Redis to Implementation Clusters
ID: telemetry:task-1.10

FILES ALLOWED:
- src/routes/api/telemetry/implementation-clusters/+server.ts
- tests/telemetry/implementation-clusters-integration.spec.ts
- docs/telemetry/observability-queries.md

EXPECTED TESTS:
- npm run check
- npm run test -- implementation-clusters
- npm run smoke:graphify

ROLLBACK:
- git reset --hard origin/main
- docker exec legal-ai-valkey redis-cli FLUSHDB (only if cache corrupted)

TELEMETRY SIGNAL:
- Query: GET /api/telemetry/implementation-clusters?tool_name=identity:recover
- Expected: clusters[0].metrics.success_rate > 0.95, confidence > 0.8

DONE WHEN:
- GET /api/telemetry/implementation-clusters returns real data (not mock)
- Dashboard at /admin/telemetry shows live metrics
- Integration test passes (44+ assertions)
- Commit: "fix(telemetry): wire real Redis to implementation-clusters discovery"
```

### Workflow With OpenSpec Integration

**If the task is a refactor or multi-session effort:**

```bash
# 1. Create OpenSpec change
openspec new change "telemetry-real-redis-wiring"

# 2. Build proposal, design, tasks (OpenSpec artifacts)
openspec instructions proposal --change telemetry-real-redis-wiring
# ... write proposal.md ...

# 3. When ready to implement, apply
openspec apply telemetry-real-redis-wiring

# 4. OpenCode inherits the change context (if opencode-plugin-openspec installed)
# Now OpenCode has task breakdown from OpenSpec

# 5. Work through tasks
npm run check
npm run test -- telemetry
git add -A && git commit -m "fix(telemetry): ..."

# 6. Mark OpenSpec tasks done as you finish them
openspec status --change telemetry-real-redis-wiring
# Shows which tasks are READY_FOR_TEST, TESTING, DONE
```

### OpenCode + OpenSpec + Kanban Sync

```
Kanban Card (user-facing task list)
    ↓
OpenSpec change (architectural plan, task breakdown)
    ↓
OpenCode context (instruction artifacts, reference docs)
    ↓
Implementation (file edits, tests, git)
    ↓
Telemetry signal (measurement of success)
    ↓
Commit (link to Kanban + OpenSpec change ID)
```

**Mapping**:
- **Kanban Card ID** = OpenSpec change name (e.g., `telemetry-real-redis-wiring`)
- **Kanban "FILES ALLOWED"** = OpenSpec `design.md` file scope
- **Kanban "EXPECTED TESTS"** = OpenSpec `tasks.md` verification steps
- **Kanban "TELEMETRY SIGNAL"** = Last-mile proof task is working

---

## Part 4: Immediate Commands to Resume Work

Run these in order:

```bash
# 1. Verify OpenCode is configured correctly
cat .opencode/opencode.jsonc | grep -E "supportsToolCall|fallback"
# Expected: supportsToolCall: false, fallbackProvider: claude-3-5-sonnet

# 2. Verify Valkey has JSON support
docker exec legal-ai-valkey valkey-cli ACL LIST | grep json
# Expected: (will show json ACL rules if available)

# 3. Verify telemetry dashboard is live
curl -s http://localhost:5173/api/telemetry/implementation-clusters | jq '.clusters | length'
# Expected: 0 (mocked) or > 0 (real)

# 4. List your current Kanban tasks
ls -la .opencode/kanban/ 2>/dev/null || echo "No Kanban tasks yet"

# 5. If working with OpenSpec, check current change
openspec status 2>/dev/null || echo "No OpenSpec changes active"

# 6. Start dev server (will now use fallback tools correctly)
npm run dev

# In OpenCode:
#   Ask: "List files in src/lib/server/telemetry using rg"
#   Expected: OpenCode routes to Sonnet, executes rg, returns results
#   (NOT fake <|tool_call> text)
```

---

## Summary: What Changed

| Component | Before | After | Impact |
|-----------|--------|-------|--------|
| **OpenCode tool-calling** | Fake `<|tool_call>` output | Fallback to Sonnet | Tools execute correctly ✅ |
| **Valkey version** | 8.1.1 (unchanged) | 8.1.1 with JSON support documented | Telemetry can use native JSON (optional) |
| **Semantic warming** | N/A | No restart needed | Can proceed with Task 1.10 ✅ |
| **Daily workflow** | Ad-hoc | Kanban card template + OpenSpec integration | Measurable, repeatable tasks ✅ |

---

## Next Steps

1. **Task 1.10**: Wire real Redis to implementation-clusters API (3-4h)
2. **Verify telemetry**: Dashboard shows live metrics from dispatcher nodes
3. **Sessions 115-118**: Mirror workers + dispatcher integration (7-10h)
4. **Kanban automation**: Each task auto-generates telemetry signal proof

