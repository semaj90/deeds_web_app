# AI Analysis Recommendations Buildout
**Created**: 2026-04-18
**Status**: ✅ COMPLETED — all 5 items built 2026-04-18. Archive candidate.

---

## Problem

`POST /api/phase89/analysis` generates 3 static recommendation strings based on
collection point counts only. The agentic error analysis page shows these plus raw
collection stats but no deeper insight.

The GEMINI_API_KEY warning in the UI means AI-generated recommendations are blocked.
We should not require Gemini — use Ollama/gemma4-rotorquant:latest which is already available.

---

## What To Build

### 1. Richer Recommendations in `/api/phase89/analysis`

Replace the 3 static strings with a structured recommendations array that includes:
- Per-collection health signals (empty, stale, healthy, oversized)
- Cross-collection coverage gaps (e.g. evidence indexed but no legal_documents)
- Retrieval quality signals (if chunk counts are known vs expected)
- Suggested actions with priority (HIGH/MED/LOW) and estimated effort

Shape:
```typescript
recommendations: Array<{
  priority: 'HIGH' | 'MED' | 'LOW';
  category: 'indexing' | 'retrieval' | 'health' | 'pipeline';
  title: string;
  detail: string;
  action: string;           // concrete next step
  estimatedImpact: string;
}>
```

### 2. Ollama-Driven Analysis Summary

After computing collection stats, call gemma4-rotorquant:latest with a structured prompt:
- Input: collection names + point counts + health status
- Output: 2-3 sentence narrative + top 3 actionable recommendations
- Timeout: 15s, non-fatal (fall back to static recommendations)
- Record as `tool_call` event in `context_timeline`

```typescript
const prompt = `You are a legal AI platform administrator.
Vector store status:
${collections.map(c => `- ${c.name}: ${c.points} points (${c.status})`).join('\n')}

Identify the top issues and suggest concrete remediation steps.
Respond as JSON: { "summary": "...", "recommendations": [...] }`;
```

### 3. Phase89 Cluster Centroid Health Check

Add to the analysis response:
```typescript
clusterHealth: {
  totalClusters: number;        // COUNT(*) from error_clusters (NOT phase89_error_clusters)
  errorEvents: number;          // COUNT(*) from error_events
  codebaseChunksInQdrant: number;  // points in codebase_chunks_768
  phase89ChunksInQdrant: number;   // points in phase89_error_chunks
  phase90CardsInQdrant: number;    // points in phase90_error_cards
}
```

This directly answers "did we lose centroids?" — if `centroidsInQdrant: false` after
Docker comes up, trigger a re-index.

### 4. Frontend: Recommendations Panel

In the agentic error analysis page, render recommendations as cards with:
- Priority badge (RED/AMBER/GREEN)
- Category icon
- Action button (where applicable: "Run Indexer", "Open Admin", etc.)
- Expand/collapse for detail text

### 5. Re-index Trigger

Add `POST /api/phase89/reindex` that:
1. Calls `POST /api/codebase-index` to re-run codebase embedding
2. Streams progress via SSE
3. On completion, fires a `graph_edge` event in `context_timeline`

---

## Phase89 Cluster Centroid Recovery Plan

If `codebase_chunks_768` is empty after Docker up:

```bash
# Check live count
curl -s http://localhost:6333/collections/codebase_chunks_768 | jq .result.points_count

# If 0, trigger re-index via dev server
curl -X POST http://localhost:5173/api/codebase-index \
  -H "Content-Type: application/json" \
  -d '{"force": true}'

# Phase89 PostgreSQL data is safe — verify:
# psql $DATABASE_URL -c "SELECT COUNT(*) FROM error_clusters;"  -- actual table name
# psql $DATABASE_URL -c "SELECT COUNT(*) FROM error_events;"
# Phase89 data lives in Qdrant collections: phase89_error_chunks, phase90_error_cards, phase90_error_clusters
# NOT in PostgreSQL tables (raw_error_embeddings, phase89_kb_cards do not exist)
```

PostgreSQL cluster data survives Qdrant resets. Only the vector embeddings in
`codebase_chunks_768` need re-indexing.

---

## Files To Touch

| File | Change |
|------|--------|
| `src/routes/api/phase89/analysis/+server.ts` | Add cluster health, Ollama summary, structured recommendations |
| `src/routes/api/phase89/reindex/+server.ts` | NEW — SSE re-index trigger |
| `src/routes/(app)/admin/search-intelligence/+page.svelte` or agentic error analysis page | Recommendations cards panel |