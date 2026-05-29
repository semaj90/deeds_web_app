## Phase 1.5 — Atlas Feature Registry Discovery

Purpose
-------
Ensure every feature produced into the Atlas has a discoverable producer, canonical Redis key, storage location, and consumer. This prevents guessing key schemas and avoids schema drift when assembling knowledge.

Search heuristics (run from repo root)
------------------------------------
rg "ace:packet" .
rg "ace:intent" .
rg "engram" .
rg "featureLabels" .
rg "domain-topology" .
rg "sourceRef" .
rg "redis.*get" .
rg "redis.*set" .

Feature registry map (canonical shape)
-------------------------------------
Feature
 ↓
Producer (script/module)
 ↓
Redis Key (stable pattern)
 ↓
Storage (memory/exports, docs/, qdrant collection, postgres)
 ↓
Consumer(s)

Example
-------
FeatureLabels
 ↓
`scripts/atlas/label-features.mjs`
 ↓
`ace:intent:*:featureLabels`
 ↓
Redis (ace:intent:...)
 ↓
Atlas Context Agent (consumes featureLabels to enrich ACE packets)

Atlas Context Schema Adapter Requirements
----------------------------------------
To avoid schema drift require that every Atlas context object contain the following fields (fields may be empty but MUST be present):

```json
{
  "description": "",
  "context": {
    "ace_packet": {},
    "sourceRefs": [],
    "featureLabels": [],
    "domainTopology": {},
    "retrievalLanes": [],
    "graphSummary": {},
    "qdrantCollections": [],
    "embeddingModel": "",
    "postgresSchemaVersion": "",
    "migrationState": ""
  }
}
```

Notes
-----
- Every consumer and producer must declare which subset of the above they read/write.
- Adapter implementations should tolerate empty arrays/objects but reject missing keys.
- Put an audit header `atlas_schema_version` in Redis JSON blobs to enable safe upgrades.

Manifest schema (richer)
------------------------
When generating `memory/exports/graph-refresh-manifest.json` prefer the richer schema below so downstream DuckDB smoke and validation have more fields to assert against:

```json
{
  "generatedAt": "",
  "nodeCount": 0,
  "edgeCount": 0,
  "exportCount": 0,
  "exports": [],
  "domains": [],
  "producer": "graph-refresh",
  "status": "ok"
}
```

Production Gate (knowledge consolidation)
---------------------------------------
Before running `npm run knowledge:documents:refresh` require the following sequence (fail-fast if any step fails):

```powershell
npm run graph:manifest
powershell -ExecutionPolicy Bypass -File duckdb/smoke-duckdb.ps1
npm run smoke:task-payload
npm run smoke:opencode
node scripts/opencode/smoke-searxng.mjs
node scripts/ingest/qdrant-dim-smoke.mjs
node scripts/ingest/audit-embedding-coverage.mjs
node scripts/opencode/rerank-cards.mjs --dry-run
# then
npm run knowledge:documents:refresh
```

Caveman checklist
-----------------
1. Find who should generate `graph-refresh-manifest.json` (producer script).
2. Ensure that producer writes the richer manifest (this repo now has `scripts/atlas/write-graph-refresh-manifest.mjs`).
3. Prove manifest validity with `duckdb/smoke-duckdb.ps1`.
4. Patch agent callsites to include the full `context` adapter schema when publishing to Redis/Qdrant/Postgres.
5. Re-run retrieval smoke tests and the knowledge build.

This reduces the chance of generating bad knowledge cards from an incomplete or underspecified graph.
