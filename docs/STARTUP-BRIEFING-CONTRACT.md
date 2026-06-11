# Startup Briefing Contract

**Purpose**: When ACE/Gemma4 assistant opens, provide a human-friendly context briefing synthesized from read-only Graphify and production readiness passes.

**Execution**: `npm run agent:hello` (runs `agent:startup-briefing.mjs`)

---

## Briefing Schema

```json
{
  "timestamp": "2026-06-12T...",
  "greeting": "Hello James.",
  "sinceLastWorked": {
    "tasksOpen": 18,
    "tasksClosed": 0,
    "newRecommendations": 6,
    "productionReadiness": "PASS 66 / WARN 0 / FAIL 0"
  },
  "systems": {
    "postgres": "healthy",
    "redis": "offline",
    "qdrant": "healthy",
    "neo4j": "unknown",
    "turbovec": "unknown",
    "ldjson": "unknown"
  },
  "coverage": {
    "qdrant": "33%",
    "som": "29–31%",
    "parentAtlas": "95%"
  },
  "warnings": [
    "⚠️ Redis offline: ACE cache using disk fallback only",
    "atlas_feature_map → parent_atlas_documents join incomplete"
  ],
  "recommendations": [
    "📍 Fix Redis preflight (cache offline)",
    "📍 Repair atlas_feature_map join",
    "📍 Materialize route_runtime_packets"
  ],
  "nextLane": "Infrastructure Repair"
}
```

---

## Output Files

### `.opencode/startup-briefing.md`
Human-readable briefing with:
- Greeting and task summary
- System health table
- Coverage percentages
- Warnings list
- Top 3-6 recommendations
- Recommended next lane

### `.opencode/startup-briefing.json`
Full structured briefing (for parsing by Gemma4)

### `.opencode/.startup-context.json`
Gemma4 context injection:
```json
{
  "systemState": { /* briefing */ },
  "safetyGates": {
    "allowRead": true,
    "allowGraphifyReadonly": true,
    "allowMutations": false,
    "mutationGate": "--apply flag required"
  },
  "nextActions": [ /* top 3 recommendations */ ]
}
```

---

## Agentic Flow

```
User opens OpenCode/ACE chat
  ↓
Startup hook runs `npm run agent:hello`
  ↓
startup-briefing.mjs executes:
  1. Read task state (.opencode/tasks/task-state.md)
  2. Parse readiness report (docs/reports/parent-atlas-production-readiness-report.json)
  3. Read recommendations (.opencode/recommendations/recommendations.json)
  4. Health checks (postgres, redis, qdrant) — non-blocking
  5. Determine next lane based on state
  6. Write outputs (.opencode/startup-briefing.{json,md})
  ↓
Gemma4 reads .opencode/.startup-context.json
  ↓
Assistant displays briefing:
  "Hello James.
   Since we last worked:
   - 18 tasks open
   - 6 recommendations
   - Redis offline (disk fallback)
   
   Next lane: Infrastructure Repair"
  ↓
User selects lane (no mutations yet — safe default)
  ↓
Bounded script applied with --apply flag (explicit gate)
```

---

## Safety Contract

### Read-Only Operations (Always Safe)
- ✅ Read `.opencode/tasks/task-state.md`
- ✅ Read `docs/reports/parent-atlas-production-readiness-report.json`
- ✅ Read `.opencode/recommendations/recommendations.json`
- ✅ Read `.tmp/domain-topology.json` (if exists)
- ✅ Parse Graphify outputs
- ✅ Health checks (postgres, redis, qdrant)

### Blocked (No Mutations)
- ❌ Direct Postgres mutations
- ❌ Direct Qdrant writes
- ❌ Direct Neo4j writes
- ❌ GPU training
- ❌ Loading 100MB+ JSON
- ❌ Executing --apply scripts without explicit user gate

### Explicit Gate for Mutations
Only bounded scripts may mutate state, and only with `--apply` flag:
```bash
npm run atlas:feature-map:repair -- --apply
```

---

## Integration with Gemma4/MCP

### Tool Calls Available (Read-Only)
Gemma4 may call these tools:
- `atlas.read_startup_context()` → `.opencode/.startup-context.json`
- `atlas.read_recommendations()` → parsed recommendations
- `atlas.read_readiness()` → production readiness report
- `atlas.summarize_current_state()` → brief status
- `atlas.propose_next_lane()` → lane recommendation

### Tools Blocked
Gemma4 may NOT call:
- `postgres.execute_query()`
- `qdrant.upsert_vectors()`
- `neo4j.execute_cypher()`
- Direct GPU/training functions

---

## Example Briefing Output

### Console Output
```
════════════════════════════════════════════════════════════
Hello James.
════════════════════════════════════════════════════════════

Since we last worked:
  • 18 tasks open
  • 6 recommendations pending
  • Production: PASS 66 / WARN 0 / FAIL 0

System Status:
  • PostgreSQL: healthy
  • Redis: offline
  • Qdrant: healthy

Coverage:
  • Qdrant: 33%
  • SOM: 29–31%
  • Parent Atlas: 95%

⚠️  Warnings:
  • Redis offline: ACE cache using disk fallback only
  • atlas_feature_map → parent_atlas_documents join incomplete

🎯 Recommended Next Lane:
  Infrastructure Repair

Top Actions:
  1. 📍 Fix Redis preflight (cache offline)
  2. 📍 Repair atlas_feature_map join
  3. 📍 Materialize route_runtime_packets

═══════════════════════════════════════════════════════════
📄 Full briefing: .opencode/startup-briefing.md
📊 JSON export: .opencode/startup-briefing.json
```

### Markdown Output (.opencode/startup-briefing.md)
```markdown
# Startup Briefing — June 12, 2026, 10:45 AM

Hello James.

## Since We Last Worked

- **Tasks Open**: 18
- **Tasks Closed**: 0
- **New Recommendations**: 6
- **Production Readiness**: PASS 66 / WARN 0 / FAIL 0

## System Health

| System | Status |
|--------|--------|
| PostgreSQL | healthy |
| Redis | offline |
| Qdrant | healthy |
| Neo4j | unknown |
| TurboVec | unknown |

## Coverage

- **Qdrant Coverage**: 33%
- **SOM Coverage**: 29–31%
- **Parent Atlas Coverage**: 95%

## Top Recommendations

1. 📍 Fix Redis preflight (cache offline)
2. 📍 Repair atlas_feature_map → parent_atlas_documents join
3. 📍 Materialize route_runtime_packets coverage

## Recommended Next Lane

**Infrastructure Repair**

---
*Generated by startup-briefing orchestrator*
```

---

## Next Steps

1. ✅ Create `scripts/agentic/startup-briefing.mjs`
2. ✅ Add npm aliases: `agent:startup-briefing`, `agent:hello`
3. ⏳ Wire into OpenCode startup hook (OpenCode plugin)
4. ⏳ Gemma4 context injection (read `.opencode/.startup-context.json` before planning)
5. ⏳ Bounded script execution (only with `--apply` flag)

---

## Usage

```bash
# Manual execution
npm run agent:hello

# Automatic (on OpenCode startup — requires plugin hook)
# OpenCode will execute before showing chat interface
```

**Result**: Instead of passive reports, Parent Atlas becomes an agentic "daily standup" that:
- Greets the user with current state
- Highlights blockers and warnings
- Proposes the highest-impact next action
- Remains safe by default (read-only, explicit --apply gate for mutations)
