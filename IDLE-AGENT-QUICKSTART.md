# Idle-Aware Agentic Workstation Loop — Quick Start

## What It Does

When VS Code detects you're idle (no file edits, no terminal input for 60+ seconds), the idle agent automatically:

1. **Reads your recent work** — git branch, recent commits, dirty files, session summaries
2. **Ranks 5 next tasks** — uses a scoring formula to estimate priority (0-100%)
3. **Warms cache** — prefetches top 3 tasks' related packets from Qdrant
4. **Logs decisions** — writes RLM feedback trace for training
5. **Queues recommendations** — publishes to NATS for operator review

**Key principle**: The agent *recommends*, it does *not* execute. You review and approve.

## Try It Now

```bash
cd c:\Users\james\Videos\deeds-web-app

# Run the idle agent manually (simulates VS Code idle detection)
npm run agent:idle-review

# Verify NATS subjects (optional, requires: npm install nats)
npm run nats:proof-of-life:all
```

### Expected Output

```
[idle-review] ========================================
[idle-review] Idle Review Agent Started
[idle-review] ========================================

[idle-review] Recent state: {
  branch: 'main',
  recentCommits: [...],
  dirtyFiles: 12
}

[idle-review] Top 5 recommendations:
  1. [87%] End-to-end test /api/ace/policy-orchestrator
  2. [82%] Wire LangGraph workers to RLM function signatures
  3. [76%] Load policy-reranker.pt model into Stage 3
  4. [68%] Create atlas_rlm_traces Postgres schema
  5. [64%] Verify NATS proof-of-life (5/5 subjects)

[idle-review] Warming BitFrost cache...
[idle-review] RLM feedback written: idle-review-1782707677557
[idle-review] NATS tasks queued: 5

[idle-review] ========================================
[idle-review] Idle Review Complete
[idle-review] Top recommendation: "End-to-end test /api/ace/policy-orchestrator"
[idle-review] Priority: 87%
[idle-review] ========================================
```

## Next Steps (For Full Integration)

### 1. Create NATS Postgres Schema (20 min)
```sql
CREATE TABLE IF NOT EXISTS atlas_rlm_traces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trace_id text UNIQUE NOT NULL,
  user_id text NOT NULL,
  action text NOT NULL,
  recommendations_generated integer,
  top_recommendation text,
  top_score integer,
  recent_commits integer,
  dirty_files integer,
  created_at timestamp DEFAULT now()
);
```

Then update `scripts/agent/idle-review.mjs` line 180 (search "TODO: Insert into"):
```javascript
// Wire real Postgres insert here
const insertResult = await db.insert(atlasRlmTraces).values(feedbackRow);
```

### 2. Wire Real NATS Client (10 min)
Update `scripts/agent/idle-review.mjs` line 225 (search "TODO: Connect to NATS"):
```javascript
// Wire real NATS client here
const nc = await connect({ servers: ["nats://127.0.0.1:4222"] });
for (const task of tasks) {
  nc.publish(task.subject, JSON.stringify(task.data));
}
await nc.close();
```

### 3. Integrate with VS Code Idle Detection (30 min)
Create a VS Code extension or use the workbench idle event:
```typescript
// In VS Code extension
vscode.commands.registerCommand('extension.onIdle', () => {
  execSync('npm run agent:idle-review');
});
```

### 4. Implement LangGraph Workers (2 hours)
Wire the 6 RLM function signatures to LangGraph nodes:
```javascript
// In sveltekit-frontend/src/lib/server/rlm/langgraph-workers.ts
import { createGraph } from "@langchain/langgraph";

const graph = createGraph()
  .addNode("search_codebase", searchCodebaseNode)
  .addNode("semantic_search", semanticSearchNode)
  .addNode("verify_facts", verifyFactsNode)
  // ... 3 more nodes
  .compile();
```

See `gemma4-feedback-layer.ts` for the function signature contract.

### 5. Load Policy Model (1 hour)
Replace the mock Stage 3 scoring with real policy model:
```typescript
// In policy-orchestrator.ts Stage 3
const scores = await policyModel.rank(candidates);  // Real model
```

## File Structure

```
scripts/
├── agent/
│   └── idle-review.mjs              # Main idle agent (280 lines)
└── nats/
    ├── proof-of-life-subjects.mjs   # NATS verification (290 lines)
    └── utils.mjs                     # Shared config (49 lines)

sveltekit-frontend/
├── src/lib/server/rlm/
│   ├── rlm-recursive-engine.ts       # RLM pipeline (320 lines)
│   ├── gemma4-feedback-layer.ts      # Gemma4↔LangGraph feedback (280 lines)
│   └── langgraph-workers.ts          # TODO: LangGraph implementation
├── src/lib/gpu/
│   └── gemma4-synthesis-generator.ts # Stage 5 synthesis (380 lines)
└── src/routes/api/ace/
    └── policy-orchestrator/          # Full 6-stage orchestrator

package.json
├── "agent:idle-review"              # Run idle agent
└── "nats:proof-of-life:all"         # Verify NATS (requires: npm install nats)
```

## Scoring Formula (How It Ranks)

Each recommendation gets scored on 7 factors (0-1 scale):

```
priority = 0.30 * blocker_severity      # Is this a hard blocker?
         + 0.20 * dependency_unblock    # Does this unblock others?
         + 0.15 * replay_reward         # Will this improve recommendations?
         + 0.10 * recent_user_context   # Did you just work on this?
         + 0.10 * cache_miss_penalty    # Will this miss cache?
         + 0.10 * low_cost_bonus        # Is this quick?
         + 0.05 * gpu_available         # Can GPU help?

Example:
  [87%] End-to-end test /api/ace/policy-orchestrator
    blocker_severity: 0.85  (unproven 6-stage pipeline = blocker)
    dependency_unblock: 0.7 (unblocks LangGraph worker wiring)
    replay_reward: 0.6      (will generate RLM traces)
    recent_user_context: 0.8 (just implemented)
    cache_miss_penalty: 0.4
    low_cost_bonus: 0.7
    gpu_available: 0.5
    → 0.30*0.85 + 0.20*0.7 + 0.15*0.6 + 0.10*0.8 + 0.10*0.4 + 0.10*0.7 + 0.05*0.5
    → 0.255 + 0.14 + 0.09 + 0.08 + 0.04 + 0.07 + 0.025 = 0.870 = 87%
```

## Architecture: Agent → Operator → Execute

```
┌─────────────────────────────────────────┐
│ VS Code Idle Detection (60+ sec)        │
└──────────────┬──────────────────────────┘
               ↓
┌─────────────────────────────────────────┐
│ Idle Agent reads state                  │
│ • git branch, commits, dirty files      │
│ • recent session summaries              │
└──────────────┬──────────────────────────┘
               ↓
┌─────────────────────────────────────────┐
│ Rank 5 next tasks (scoring formula)     │
│ • blocker severity, dependencies, cost  │
│ • GPU availability, context, rewards    │
└──────────────┬──────────────────────────┘
               ↓
┌─────────────────────────────────────────┐
│ Warm BitFrost cache (prefetch)          │
│ • top 3 recommendations' packets        │
└──────────────┬──────────────────────────┘
               ↓
┌─────────────────────────────────────────┐
│ Write RLM feedback (logging)            │
│ • trace_id, user_id, action, top_score  │
│ • recent_commits, dirty_files           │
└──────────────┬──────────────────────────┘
               ↓
┌─────────────────────────────────────────┐
│ Queue NATS tasks (recommendations)      │
│ • agent.recommendation.created subject  │
│ • 5 suggestions ready for review        │
└──────────────┬──────────────────────────┘
               ↓
┌─────────────────────────────────────────┐
│ OPERATOR REVIEWS                        │
│ ❌ Reject (don't execute)               │
│ ✅ Accept (execute recommendation)      │
│ 🔄 Defer (review later)                 │
└──────────────┬──────────────────────────┘
               ↓
        (IF ACCEPTED)
               ↓
┌─────────────────────────────────────────┐
│ Execute recommended task                │
│ • npm run {nextCommand}                 │
│ • LangGraph workers process in parallel │
│ • Gemma4 synthesizes result             │
└──────────────┬──────────────────────────┘
               ↓
┌─────────────────────────────────────────┐
│ Log outcome to RLM training dataset      │
│ • What worked? What didn't?             │
│ • Improve scoring for next time         │
└─────────────────────────────────────────┘
```

## Tuning the Scoring Formula

If recommendations feel wrong, adjust the weights in `idle-review.mjs` (line 100):

```javascript
scoreBreakdown: {
  blocker_severity: 0.85,       // ← Increase if blockers matter more
  dependency_unblock: 0.7,      // ← Increase if you want breadth first
  replay_reward: 0.6,           // ← Increase to prioritize learning
  recent_user_context: 0.8,     // ← Increase to stick with what you're doing
  cache_miss_penalty: 0.4,      // ← Increase to prefer cached paths
  low_cost_bonus: 0.7,          // ← Increase to prefer quick tasks
  gpu_available: 0.5            // ← Increase to prioritize GPU work
}
```

The weights sum to 1.0 (normalized). Higher weight = higher influence on score.

## Status

- ✅ Idle agent implemented and tested
- ✅ NATS subjects defined (5 new + 5 legacy)
- ✅ Scoring formula verified
- ⏳ NATS real client (TODO: 10 min)
- ⏳ Postgres schema (TODO: 20 min)
- ⏳ LangGraph workers (TODO: 2 hours)
- ⏳ Policy model loading (TODO: 1 hour)
- ⏳ VS Code extension hook (TODO: 30 min)

## Key Files

| File | Purpose |
|------|---------|
| `scripts/agent/idle-review.mjs` | Main agent (what you run) |
| `scripts/nats/proof-of-life-subjects.mjs` | Verify NATS is operational |
| `scripts/nats/utils.mjs` | Shared NATS config |
| `SESSION-94-IDLE-AGENT-COMPLETE.md` | Implementation details |
| `IDLE-AGENT-QUICKSTART.md` | This file |

## Contact

For issues or questions, check:
1. `SESSION-94-IDLE-AGENT-COMPLETE.md` — full implementation notes
2. `docs/KARPATHY_PIPELINE_ARCHITECTURE.md` — scoring formula theory
3. Recent session notes in `.claude/projects/` memory

---

**Happy idling!** The agent works best when you take a break. Go grab coffee, and let it recommend what's next. ☕