# Graphify Readiness Infrastructure

## Overview

New endpoints and dashboard for monitoring graphify:daily pipeline readiness, with lane-policy aggregation (core structural vs optional enrichment vs gated integrations).

## Endpoints

### GET `/api/graphify/status`

Returns lane readiness aggregation for all 6 stages of `graphify:daily`.

**Response shape:**

```json
{
  "status": {
    "coreStructural": "PASS|WARN|FAIL",
    "optionalEnrichment": "PASS|REFERENCE_ONLY",
    "gatedIntegrations": "PASS|GATED"
  },
  "blockingLanes": ["lane1", "lane2"],
  "nonBlockingLanes": [
    {
      "lane": "knowledgeLayerContract",
      "state": "REFERENCE_ONLY",
      "reason": "Optional knowledge-layer export not yet introduced"
    }
  ],
  "pipeline": {
    "allReady": true,
    "stages": [
      {
        "name": "validate",
        "command": "npm run graphify:validate",
        "ready": true,
        "message": "All services healthy"
      },
      ...6 stages total
    ],
    "readyToRun": true,
    "nextSafeAction": "npm run graphify:daily"
  },
  "timestamp": "2026-07-19T19:46:00.000Z"
}
```

**Lane policies:**

| Lane | Structural Required | Production Required | State | Notes |
|------|-----|-----|-------|-------|
| treeSitterAstFacts | ✅ | ✅ | ACTIVE_VERIFIED | AST extraction |
| socraticodeGraphFacts | ✅ | ✅ | ACTIVE_VERIFIED | Graph relationships |
| usedConceptEdgeProjection | ✅ | ✅ | ACTIVE_VERIFIED | 173K+ Neo4j edges |
| topologyAuthorityBackfill | ✅ | ✅ | ACTIVE_VERIFIED | PageRank + community |
| okfExport | ❌ | ❌ | REFERENCE_ONLY | Optional export |
| knowledgeLayerContract | ❌ | ❌ | REFERENCE_ONLY | Optional knowledge-layer |
| bitfrostAudit | ❌ | ❌ | GATED | Auth required |

**Cache header:** `Cache-Control: max-age=30`

---

## Admin Dashboard

### GET `/admin/graphify-readiness`

Admin-only page displaying graphify readiness with lane status cards, pipeline stages, and actionable next steps.

**Features:**
- Real-time status refresh (polls `/api/graphify/status`)
- Lane policy table (required vs optional)
- Traffic-light indicators (PASS/WARN/FAIL)
- Non-blocking lanes note (REFERENCE_ONLY + GATED lanes don't block execution)
- Pipeline stage checklist
- "Run graphify:daily" button (for future automation)

**Access:** `/admin/graphify-readiness` (admin-only, auth-guarded)

**Added to admin hub:** `/admin/ai-dashboard` now links to Graphify Readiness card

---

## Dev Startup Integration

### `npm run dev:gpu` enhancements

**New behavior:**
1. Launches Gemma4 llama-server :8090 (via `launch-turboquant.ps1`)
2. Launches ONNX embedding server :8081 (optional, Ollama L2 fallback)
3. **NEW:** Checks graphify readiness via `/api/graphify/status`
4. Reports lane status (advisory, non-blocking)
5. Launches TRACE MCP server :8788
6. Starts Vite dev server :5173

**Console output (new):**

```
[dev:gpu] Checking graphify readiness...
[dev:gpu] ✅ Graphify core: PASS
[dev:gpu] View: http://localhost:5173/admin/graphify-readiness
```

**If degraded:**

```
[dev:gpu] ⚠️  Advisory: Some graphify lanes are degraded.
[dev:gpu]    View: http://localhost:5173/admin/graphify-readiness
```

---

## Pipeline Stages Monitored

1. **validate** (`npm run graphify:validate`)
   - Checks: Gemma4 :8090, Ollama :11434, Qdrant :6333, Postgres :5434
   - Blocks: All other stages

2. **materialize** (`npm run graphify:materialize:apply`)
   - Checks: Postgres :5434
   - Purpose: Consolidate addressable packets

3. **summarize** (`node daily-graphify-cold-processing.mjs`)
   - Checks: Ollama :11434, Qdrant :6333
   - Purpose: Summaries + embeddings + domain classification

4. **fanout** (`npm run atlas:phase8:fanout:apply`)
   - Checks: Postgres :5434
   - Purpose: Fan-out to secondary indexes

5. **qdrant-tag-mirror** (`npm run atlas:qdrant:tag-mirror:apply`)
   - Checks: Qdrant :6333
   - Purpose: Qdrant payload mirroring

6. **qdrant-feature-sync** (`npm run atlas:qdrant:feature-map-sync:apply`)
   - Checks: Qdrant :6333
   - Purpose: Feature map synchronization

---

## Status Aggregation Logic

### Core Structural (PASS/WARN/FAIL)

- **PASS:** All required lanes (4) are ACTIVE_VERIFIED
- **WARN:** Any required lane is ACTIVE_DEGRADED or GATED
- **FAIL:** Any required lane is FAILED

### Optional Enrichment

- **PASS:** No optional lanes degraded
- **REFERENCE_ONLY:** Some optional lanes disabled (okfExport, knowledgeLayerContract)

### Gated Integrations

- **PASS:** No gated lanes need attention
- **GATED:** bitfrostAudit awaiting auth configuration

---

## Usage

**Manual check:**

```bash
curl http://localhost:5173/api/graphify/status | jq .status
```

**Dashboard:**

```
http://localhost:5173/admin/graphify-readiness
```

**Run graphify:daily (when ready):**

```bash
npm run graphify:daily
```

---

## Files Created/Modified

| File | Change |
|------|--------|
| `src/routes/api/graphify/status/+server.ts` | NEW: Status aggregation endpoint |
| `src/routes/(app)/admin/graphify-readiness/+page.server.ts` | NEW: Admin page server load |
| `src/routes/(app)/admin/graphify-readiness/+page.svelte` | NEW: Readiness dashboard UI |
| `src/routes/(app)/admin/ai-dashboard/+page.svelte` | MODIFIED: Added graphify-readiness card to hub |
| `scripts/startup/dev-gpu-runtime.mjs` | MODIFIED: Added graphify readiness check |

---

## Next Steps

1. ✅ Endpoint wired and tested
2. ✅ Dashboard UI built with lane policy display
3. ✅ Admin hub linked
4. ✅ Dev startup integrated
5. ⏳ (Future) Wire `/api/graphify/trigger` for button-click execution
6. ⏳ (Future) Implement graphify:daily auto-run on scheduled interval

