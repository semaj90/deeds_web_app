# Startup Degraded Mode Handling

**Date**: 2026-07-29  
**Status**: ✅ IMPLEMENTED  
**Purpose**: Allow VS Code to start and work even when services (Redis, Qdrant, Postgres) are offline

---

## Problem: Hard Blocks on Service Failures

Previously, if any service was offline during startup, the entire VS Code workspace would fail to initialize. This blocked all work, even if that work didn't require the offline service.

**Example failure chain**:
```
startup → Redis offline
       ↓
      ❌ EXIT 1
       ↓
VS Code blocked, no terminal, no dev server
```

---

## Solution: Graceful Degradation

The startup pipeline now:
1. Runs health checks for all services
2. **Records** which services are down (without blocking)
3. **Sets environment variables** to alert downstream code
4. **Continues startup** with fallback strategies active

**Improved flow**:
```
startup → service checks
       ↓
       ├─ Redis offline → cache falls back to memory
       ├─ Qdrant offline → search falls back to SQL/BM25
       ├─ Postgres offline → ❌ HARD BLOCK (cannot proceed)
       ↓
       ✓ Proceed with degraded mode
       ↓
VS Code starts, ACE aware of limitations
```

---

## Implementation

### Three-Tier Recovery Strategy

#### Tier 1: Health Check (Non-Blocking)
```bash
# scripts/startup/ensure-nats-langgraph.mjs
# Reports: PASS | FAIL | SKIP status for each service
# Does NOT stop on failure
```

Output example:
```
-- Startup Health Check --
PASS Redis: Connection is closed.          ← Recorded as down
FAIL Qdrant: fetch failed                  ← Recorded as down
OK Ollama                                  ← Operational
FAIL Postgres: postgres container not detected  ← Recorded as down
OK TurboQuant                              ← Operational
```

#### Tier 2: Attempt Recovery (Optional)
```bash
# scripts/startup/recover-degraded-startup.mjs --auto-restart
# If enabled, tries to restart failed services
# Useful after Docker crash or network flap
```

#### Tier 3: Record Degraded State
```json
// .tmp/ace-degraded-state.json
{
  "timestamp": "2026-07-29T...",
  "services": {
    "redis": {
      "down": true,
      "recovered": false,
      "impact": "Cache operations will fall back to memory-only"
    },
    "qdrant": {
      "down": true,
      "recovered": false,
      "impact": "Vector search unavailable; SQL/lexical fallback enabled"
    },
    "postgres": {
      "down": false,
      "recovered": true,
      "impact": "Database operational"
    }
  },
  "canProceed": true,
  "recommendations": [
    "Restart Docker: docker restart legal-ai-redis",
    "Restart Docker: docker restart legal-ai-qdrant"
  ]
}
```

---

## Service Impact Matrix

### Hard Blocks (Cannot Proceed Without)
| Service | Impact | Fallback |
|---------|--------|----------|
| **Postgres** | Database truth layer unavailable | None — hard block |
| (none else) | — | — |

### Soft Failures (Proceed with Degradation)
| Service | Impact | Fallback |
|---------|--------|----------|
| **Redis/Valkey** | Cache offline | In-memory LRU cache (slower, loses persistence) |
| **Qdrant** | Vector search offline | SQL full-text search + BM25 (slower but works) |
| **Bifrost** | Semantic cache offline | Fall back to Qdrant or direct LLM calls |
| **Go Retrieval** | Search orchestrator offline | Direct Qdrant ANN queries (slower, less optimization) |
| **TurboVec** | Vector prefilter offline | Skip prefilter, use full Qdrant ANN (slower) |
| **LangExtract** | Feature extraction offline | Skip LangExtract, use AST-only analysis |

---

## Startup Checklist

When VS Code starts, the health check runs automatically:

```
✓ PASS checks: Services operational, full speed
⚠️  FAIL checks: Services down, but fallbacks active
  - Proceed with degraded mode
  - Check .tmp/ace-degraded-state.json for impact
  - Run recovery: npm run startup:recover:auto
❌ HARD BLOCK: Postgres down
  - Cannot proceed; database is mandatory
  - Restart Docker: docker restart legal-ai-postgres
```

---

## Usage Commands

### Manual Health Check (No Recovery)
```bash
npm run startup:health
# Output: Reports status, no automatic restarts
# Exit code: 0 (can proceed) or 1 (hard block)
```

### Recovery (Auto-Restart Failed Services)
```bash
npm run startup:recover:auto --verbose
# Attempts to restart Redis, Qdrant, Postgres
# Exit code: 0 (recovered) or 1 (recovery failed)
```

### Full Startup (Health + Optional Recovery)
```bash
npm run dev
# Runs health check → reports degraded state → starts dev server
```

---

## Environment Variables Set During Startup

After health check completes, these env vars are available to downstream code:

```javascript
// In any Node.js script or route handler
if (process.env.STARTUP_REDIS_DOWN === '1') {
  console.log('Redis offline; using in-memory cache');
  cacheLayer = new MemoryCacheOnly();
}

if (process.env.STARTUP_QDRANT_DOWN === '1') {
  console.log('Qdrant offline; using SQL fallback');
  searchStrategy = 'sql_bm25';
}

if (process.env.STARTUP_DEGRADED_MODE === '1') {
  console.log('Degraded mode active; check .tmp/ace-degraded-state.json');
}
```

---

## Examples

### Scenario 1: Redis Offline, All Else OK
```
Startup health check:
  ✓ Postgres OK
  ✓ Qdrant OK
  ✗ Redis (connection closed)

Result:
  - Can proceed: YES
  - Degraded mode: Memory-only cache
  - Impact: Cache misses, slower repeating queries
  - Fix: docker restart legal-ai-redis
```

### Scenario 2: Qdrant Offline, Redis OK
```
Startup health check:
  ✓ Postgres OK
  ✓ Redis OK
  ✗ Qdrant (fetch failed)

Result:
  - Can proceed: YES
  - Degraded mode: SQL full-text search
  - Impact: Vector search unavailable, slower recall
  - Fix: docker restart legal-ai-qdrant
```

### Scenario 3: Postgres Offline (HARD BLOCK)
```
Startup health check:
  ✗ Postgres (container not detected)
  ✓ Redis OK
  ✓ Qdrant OK

Result:
  - Can proceed: NO (hard block)
  - Must restart Postgres before proceeding
  - Fix: docker restart legal-ai-postgres
```

---

## Non-Blocking Services

These services are optional; startup proceeds even if offline:

- **LangExtract** — feature extraction (fallback to AST)
- **TurboVec** — vector prefilter (fallback to full ANN)
- **Bifrost** — semantic cache (fallback to direct inference)
- **Go Retrieval** — search orchestrator (fallback to direct queries)

If you see warnings for these, operations continue at reduced speed but without blocking startup.

---

## Monitoring Degraded State

After startup completes, check if degraded mode is active:

```bash
# Check degraded state file
cat .tmp/ace-degraded-state.json | jq '.services | to_entries[] | select(.value.down == true)'

# Expected output (if services are down):
# {
#   "key": "redis",
#   "value": {
#     "down": true,
#     "recovered": false,
#     "impact": "Cache operations will fall back to memory-only"
#   }
# }

# Check which services are down
cat .tmp/ace-startup-status.json | jq '.checks | to_entries[] | select(.value.ok == false) | .key'

# Recommendations for recovery
cat .tmp/ace-degraded-state.json | jq '.recommendations[]'
```

---

## Architecture: Degraded Mode Detection

The ACE context assembler automatically detects degraded mode:

```typescript
// src/lib/server/ace/context-assembler.ts
const degradedState = JSON.parse(
  fs.readFileSync('.tmp/ace-degraded-state.json', 'utf8')
);

if (degradedState.services.redis.down) {
  // Use in-memory cache instead of Redis
  contextCache = new MemoryCacheAdapter();
}

if (degradedState.services.qdrant.down) {
  // Fall back to SQL search
  searchStrategy = 'postgres_fts';
}

// Include degradation metadata in ACE context
context.systemPrompt += `

Note: Running in degraded mode due to offline services:
- ${Object.entries(degradedState.services)
  .filter(([_, svc]) => svc.down)
  .map(([name, svc]) => `${name}: ${svc.impact}`)
  .join('\n- ')}

`;
```

---

## Summary

**Startup degraded mode handling**:
1. ✅ Health checks run for all services (non-blocking)
2. ✅ Degraded state recorded to `.tmp/ace-degraded-state.json`
3. ✅ Environment variables set for downstream awareness
4. ✅ Fallback strategies active (cache → memory, search → SQL, etc.)
5. ✅ VS Code starts even with services offline (except Postgres)

**Hard block only on**: Postgres (database mandatory)

**Soft failures with fallback**: Redis, Qdrant, Bifrost, Go Retrieval, TurboVec, LangExtract

**Recovery**: `npm run startup:recover:auto` to attempt restart of failed services
