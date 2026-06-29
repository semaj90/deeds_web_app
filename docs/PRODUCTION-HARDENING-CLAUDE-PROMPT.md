# Production Hardening: Post-Docker-Erase Recovery Prompt

**Date**: June 28, 2026  
**Context**: Docker Desktop data loss requires rebuilding all mirrors (Qdrant, Neo4j, Redis caches) from canonical Postgres source. No assumptions about volume persistence.  
**Authority**: Treat Postgres + repo files as the only surviving truth.

---

## Copy-Paste Claude/Codex Task Prompt

```
We are rebuilding the Atlas/LangExtract/Gemma4 summarization pipeline after Docker Desktop data loss.

GOAL: Create a production-hardening recovery path that repopulates summaries, semantic indexes, 
registry mappings, and validation reports from canonical files. Do not assume Docker volumes survived.

ARCHITECTURE:
- Postgres = canonical truth (58K packets, 40K chunks)
- Qdrant/TurboVec = ANN semantic search (mirrors, rebuilt from Postgres)
- Redis/Valkey = cache only (ephemeral, warmed from Postgres)
- Neo4j/KAG = topology/ontology edges (mirrors, rebuilt from Postgres)
- DuckDB = offline validation/map-reduce joins (read-only analysis)
- LangExtract = structured extraction (entities/events/claims, not training)
- embeddinggemma = embeddings (384-dim, normalized)
- Gemma4 llama-server = summaries/synthesis (only after packets built)
- Langfuse = optional observability (added AFTER core path proven)

THREE LAYERS (strict separation):

Layer 1 — Data Pipeline (deterministic, no LLM):
  Repo files → Parse/OCR/Docling → LangExtract → Canonical packet
  Packet = {packet_key, source_ref, source_id, feature_id, path, entities, events, claims, confidence}
  Output: Postgres atlas_packets + metadata_envelopes

Layer 2 — Semantic Pipeline (deterministic, no LLM):
  Packet → embeddinggemma (384-dim) → Qdrant payload → KMeans/SOM/AE → Topology fields
  Every stage has one responsibility.
  Output: Qdrant indexes + Redis warm cache + Neo4j edges

Layer 3 — Synthesis (LLM, context-aware):
  User Query → Redis → Qdrant → JSONB filters → Topology neighbors → Packet join → Gemma4
  Gemma4 sees: entity graph + ontology + neighbor packets + source refs + chunk hashes
  Output: Summary packet + validation report

REBUILD PIPELINE (order matters):
  1. Inventory canonical sources (repo files, migrations, scripts, artifacts)
  2. Schema match audit (read-only, find renamed columns)
  3. Rebuild summaries (dry-run, then apply small slice)
  4. Rebuild semantic index (dry-run, then apply)
  5. Validate source_ref/source_id roundtrip
  6. Replace stubs/mocks with registered functions
  7. Only then add Langfuse (core path must be proven first)

TASKS:

[Task 1] Inventory canonical sources (read-only):
  - repo files (src/, scripts/, docs/)
  - migrations (drizzle/*.sql)
  - scripts/atlas (all Phase 0-7 audit scripts)
  - scripts/phase85 (LangExtract, P9)
  - existing artifacts (.ndjson, .jsonl, .tmp reports)
  - package.json scripts (list all atlas:*, langextract:*)
  
  Output: inventory.md listing all canonical sources

[Task 2] Schema matching audit (read-only):
  Find tables/columns expected by LangExtract scripts:
  - source_ref (canonical identifier chain)
  - source_id (UUID, unique)
  - feature_id (category key)
  - packet_key (stable, deterministic)
  - trace_id (execution lineage)
  - payload_json (JSONB, flexible)
  - summary (text, Gemma4 output)
  - embedding (vector, embeddinggemma 384-dim)
  - som_cluster / som_cell_row / som_cell_col (topology)
  - kmeans_cluster (topic clustering)
  - ontology_tags (domain/semantic tags)
  
  Output: schema-match-report.md
  - Expected columns per table
  - Actual columns (via \d table_name)
  - Missing columns (hard stop if critical)
  - Renamed columns (alias in query or migrate)
  - Type mismatches (vector vs halfvec vs float4)

[Task 3] Validate summarizer pipeline (architecture):
  A production summary packet must include:
  - stable source_ref (never changes, used for dedup)
  - stable source_id (UUID, used for joins)
  - exact file path (canonical source location)
  - chunk hash (SHA256, for integrity)
  - extraction payload (entities, events, claims JSON)
  - embedding dimension (384 for embeddinggemma)
  - summary text (Gemma4 output)
  - cluster ids (SOM row/col, KMeans cluster, ontology tags)
  - trace_id (execution chain for audit)
  - validation status (PASS/SOFT_WARN/HARD_FAIL)
  
  Output: packet-schema.ts (Zod type + examples)

[Task 4] Dimension policy (enforce consistency):
  - Use 384 for embeddinggemma truth (NOT 768, NOT 512)
  - Optional AE compression: 384→64 (for memory paths, not search)
  - SOM grid: 20×20 (400 cells max)
  - KMeans: domain-specific K (5-50, configurable)
  - NEVER mix 384 and 768 in same Qdrant collection
  - NEVER store AE-compressed vectors in search indexes
  
  Output: dimension-policy.md (rules + exceptions)

[Task 5] Index types audit (four-system design):
  - JSONB GIN = exact metadata, filters, tree queries (Postgres)
  - Qdrant/TurboVec = semantic similarity (ANN, dense)
  - DuckDB = offline joins/audits (read-only, structured analytics)
  - Neo4j = graph traversal (ontology, topology edges)
  
  Use all four; do not replace Postgres with one index.
  Verify each is populated and consistent.
  
  Output: index-types-audit.md (each system checked)

[Task 6] Create recovery scripts (deterministic, all --dry-run mode):
  npm run atlas:rebuild:inventory             # List canonical sources
  npm run atlas:schema:match:readonly          # Audit schema differences
  npm run atlas:summaries:rebuild:dry          # Preview summary rebuild
  npm run atlas:summaries:rebuild:apply        # Apply (with --limit=N)
  npm run atlas:index:semantic:dry             # Preview semantic index
  npm run atlas:index:semantic:apply           # Apply embedding+Qdrant
  npm run atlas:index:topology:dry             # Preview topology
  npm run atlas:index:topology:apply           # Apply SOM+KMeans+Neo4j
  npm run atlas:validate:gan                   # GAN validation gate
  
  Each script outputs JSON report to .tmp/

[Task 7] GAN validation gate (before replacement):
  Before replacing any mock/stub/placeholder function:
  1. Find placeholder implementation (grep, note lines)
  2. Find canonical registered function (in registry, function-registry.mjs)
  3. Compare inputs/outputs (same signature? shape compatible?)
  4. Run smoke test (10 samples, both old + new)
  5. If test passes: update registry pointer + write report
  6. If test fails: log, skip replacement, add to blockers
  
  Output: gan-validation-report.json
  ```json
  {
    "placeholder": "extractEntitiesLLM_v1",
    "canonical": "extractEntitiesRegistry::entities",
    "test_samples": 10,
    "test_results": "9/10 PASS, 1 SOFT_WARN",
    "ready_for_replacement": true,
    "applied": false,
    "blocker": null
  }
  ```

[Task 8] Recovery report (final status):
  Output: .tmp/atlas-recovery-hardening-report.json
  ```json
  {
    "timestamp": "2026-06-28T...",
    "mode": "production-hardening",
    "phase": "Layer 1 complete, Layer 2 in progress, Layer 3 deferred",
    
    "CREATED": [
      "atlas:rebuild:inventory",
      "atlas:schema:match:readonly",
      "langextract-canonical-pipeline.mjs",
      "restore-mirrors-from-postgres.mjs"
    ],
    
    "WIRED": [
      "Postgres → Qdrant (40K points restored)",
      "Postgres → Neo4j (40K Packet nodes)",
      "LangExtract Stage 1-6 (transactional)"
    ],
    
    "PROVEN": [
      "Mirror restoration (Qdrant/Neo4j agree)",
      "Extraction schema validation",
      "Redis cache invalidation pattern"
    ],
    
    "NOT_PROVEN": [
      "End-to-end Gemma4 summaries",
      "Semantic reranking (TurboVec)",
      "Concurrent RabbitMQ pipeline",
      "Langfuse tracing"
    ],
    
    "DATA_LOST_RECOVERED": {
      "postgres_packets": 58304,
      "postgres_chunks": 40754,
      "qdrant_restored": 40568,
      "neo4j_restored": 40754,
      "redis_ephemeral": "warming in progress"
    },
    
    "COMMANDS_RUN": [
      "npm run atlas:restore:mirrors",
      "npm run langextract:canonical:dry"
    ],
    
    "TABLES_CHECKED": [
      "atlas_packets (58K, canonical)",
      "codebase_chunk_index (40K, 99.5% embeddings)",
      "embedded_summaries (2 items tested)",
      "extract_results (MISSING, TODO)"
    ],
    
    "INDEXES_CHECKED": [
      "Qdrant codebase_chunks_768 (40K points)",
      "Neo4j :Packet nodes (40K nodes)",
      "Postgres GIN indexes (verified)"
    ],
    
    "FILES_CHANGED": [
      "scripts/atlas/restore-mirrors-from-postgres.mjs (created)",
      "scripts/phase85/langextract-canonical-pipeline.mjs (created)",
      "package.json (added 4 npm scripts)"
    ],
    
    "NEXT_BLOCKER": "Extract results table missing; implement extract_results schema + backfill pipeline"
  }
  ```

HARD REQUIREMENTS (do not skip):

1. NO destructive migrations (no truncate/drop unless explicit --apply --destructive)
2. Postgres is ALWAYS canonical (mirrors rebuilt from it, never overwritten)
3. source_ref/source_id/packet_key MUST roundtrip end-to-end (test explicitly)
4. Validation report MUST be written to .tmp/ (append mode, never truncate)
5. Langfuse WAITS (core data pipeline proven first)
6. GAN validation GATE (before replacing stubs)
7. All scripts MUST have --dry-run by default
8. All scripts MUST validate schema BEFORE write
9. Cache invalidation happens AFTER Postgres succeeds
10. Mirrors agree (Qdrant point_count ≈ Neo4j Packet count ≈ Postgres row count)

DO NOT claim production PASS unless:
- Postgres insert proven (transaction committed)
- Qdrant/TurboVec upsert proven (point count matches)
- Summary generated by Gemma4 proven (not mocked)
- source_ref/source_id roundtrip proven (end-to-end test)
- Validation report written (.tmp/report.json exists)

MINIMAL TRUTH (do this in order):
1. [Layer 1] Schema match read-only
2. [Layer 1] Rebuild summaries dry-run
3. [Layer 2] Rebuild semantic index dry-run
4. [Layer 2] Apply small slice (10-100 items, not all 40K)
5. [Layer 2] Validate source_ref/source_id roundtrip
6. [Layer 1] Only then replace stubs/mocks with registered functions
7. [Layer 3] Only then add Gemma4 + Langfuse

If any layer fails: stop, write report, fix blocker, re-run.
No skipping layers.
```

---

## Architecture Diagrams

### Layer 1: Data Pipeline (Deterministic)

```
Repo Files (src/, docs/, evidence/)
  │
  ├─ Code files (.ts, .js, .py)
  ├─ Markdown (.md)
  ├─ PDFs (Docling OCR)
  ├─ Images (vision)
  └─ Audio (transcribe)
  │
  ▼
Parse/OCR/Docling
  │ Extracts raw text + structure
  │
  ▼
LangExtract (Structure Recognition)
  │ Identifies entities, events, claims, relations
  │ NO embeddings, NO LLM
  │ Output: canonical packet
  │
  ▼
Canonical Packet (JSONB)
{
  "packet_key": "ace:chunk:auth:001",
  "source_ref": "src/lib/server/auth.ts",
  "source_id": "550e8400-e29b-41d4-a716-446655440000",
  "feature_id": "auth.sessions",
  "feature_label": "Authentication Sessions",
  "relative_path": "src/lib/server/auth.ts",
  "line_start": 42,
  "line_end": 89,
  "entities": [
    {"type": "FUNCTION", "value": "validateSession", "confidence": 0.99},
    {"type": "TYPE", "value": "Lucia", "confidence": 0.95}
  ],
  "events": [{"type": "SESSION_CREATED", "timestamp": "2026-06-28T..."}],
  "claims": [{"claim": "Sessions validated server-side", "evidence": "..."}],
  "relations": [{"type": "DEPENDS_ON", "target": "src/lib/server/db/client.ts"}],
  "confidence_score": 0.97,
  "extraction_method": "langextract_v2",
  "trace_id": "trace:2026-06-28:phase85:p9:001"
}
  │
  ▼
Postgres atlas_packets (canonical storage)
  │ INSERT + UPDATE atomic
  │ trace_id prevents duplicates
  │ source_ref/source_id/packet_key are keys
  │
  ▼
✓ Layer 1 Complete
```

### Layer 2: Semantic Pipeline (Deterministic)

```
Canonical Packet (from Layer 1)
  │
  ▼
embeddinggemma (384-dim)
  │ Summarize packet JSON → 384-dimensional vector
  │ Deterministic (same input = same output)
  │
  ▼
Qdrant Payload (384-dim "content" vector)
{
  "id": "550e8400...",
  "vector": {"content": [0.12, -0.45, ...], "error": [...], "signature": [...]},
  "payload": {
    "packet_key": "ace:chunk:auth:001",
    "source_ref": "src/lib/server/auth.ts",
    "som_cluster": 42,
    "som_bmu_row": 2,
    "som_bmu_col": 1,
    "kmeans_cluster": 7,
    "tags": ["auth", "session", "validation"]
  }
}
  │
  ▼
KMeans/SOM/AE (Topology)
  │ K-means: topic clustering (K=5-50)
  │ SOM: 20×20 grid (400 cells, proximity matters)
  │ AE: optional 384→64 compression (for memory paths, not search)
  │
  ▼
Topology Fields (in Postgres + Qdrant payload)
  │ som_cluster (0-399)
  │ som_bmu_row (0-19)
  │ som_bmu_col (0-19)
  │ kmeans_cluster (0-K)
  │ ontology_tags (["auth", "session", ...])
  │
  ▼
Neo4j Edges (Topology Mirror)
  │ Create SIMILAR_TOPOLOGY edges (SOM adjacency)
  │ Create BELONGS_TO_CLUSTER edges (KMeans)
  │
  ▼
Redis Warm Cache
  │ bitfrost:packet:{key} → embedding vector
  │ centroid:kmeans:{cluster} → cluster center
  │ topology:som:{row}:{col} → neighbors list
  │ TTL = 24h (ephemeral)
  │
  ▼
✓ Layer 2 Complete (Qdrant/Neo4j/Redis in sync)
```

### Layer 3: Synthesis (LLM Context-Aware)

```
User Query
  │ "What are auth patterns in this codebase?"
  │
  ▼
Routing Decision (4-way)
  │
  ├─ [L1 Redis Exact] bitfrost:query_hash → cached answer (5ms)
  ├─ [L2 Bifrost Semantic] ≈query in 0.8+ similarity (2-5s, Qdrant)
  ├─ [L3 Live Postgres] Full-text search + JSONB filter
  └─ [L4 Fresh Inference] Gemma4 generation (30s+)
  │
  ▼
Candidate Assembly (Context Window)
  │ Qdrant: find 50 neighbors (384-dim cosine similarity)
  │ Postgres: filter by packet_key/source_ref/feature_id
  │ Neo4j: expand via SIMILAR_TOPOLOGY + BELONGS_TO_CLUSTER (2-hop)
  │ DuckDB: offline join validation (audit only)
  │
  ▼
Gemma4 Synthesis
  │ Context (compact):
  │   - Entity graph (extracted in Layer 1)
  │   - Ontology (tags from Layer 2)
  │   - Neighbor packets (from topology)
  │   - Source refs (for audit trail)
  │   - Chunk hashes (for integrity)
  │   - Feature IDs (for categorization)
  │ Task: Synthesize answer (not summarize random pages)
  │
  ▼
Summary Packet (stored)
{
  "packet_key": "summary:auth:patterns:2026-06-28",
  "type": "synthesis",
  "source_ids": ["550e8400...", "..."],  // packets synthesized from
  "summary_text": "Auth validation in this codebase follows Lucia pattern...",
  "trace_id": "trace:synthesis:2026-06-28:001",
  "validation_status": "PASS"
}
  │
  ▼
✓ Layer 3 Complete (User gets answer, audit trail preserved)
```

---

## Key Decisions

### Concurrency Pattern (not sequential)

**❌ DO NOT**:
```javascript
for (const packet of packets) {
  await extractDeterministically(packet);
  await embedWithGemma(packet);
  await storeInQdrant(packet);
}
```

**✅ DO**:
```javascript
const embeddings = await Promise.all(
  packets.map(p => embedder(p))
);
const qdrantUpserts = await Promise.all(
  embeddings.map(e => qdrant.upsert(e))
);
const postgresWrites = await Promise.all(
  embeddings.map(e => postgres.update(e))
);
const neo4jEdges = await buildTopology(embeddings);
const redisWarm = await redis.pipeline().set(...).exec();
```

Layers that don't depend on each other execute in parallel.

### RPC vs HTTP/JSON

**Use HTTP/JSON for**:
- SvelteKit API routes → internal services (simplicity wins)
- Document payloads (flexible, self-describing)
- <100 req/sec (transport overhead negligible)

**Migrate to gRPC for**:
- Long-running background services (GPU workers, Go retrieval, Rust sidecars)
- >1000 req/sec (performance matters)
- Streaming (continuous updates, not single-shot)

**Use JSON-RPC 2.0 for**:
- Tool invocation (ACP/MCP tool calling)
- NOT for moving large payloads

For now: **HTTP/JSON everywhere**. Profile, then upgrade specific paths if needed.

### Truth Sources (Precedence)

1. **Postgres** (canonical, all inserts/updates)
2. **Repo files** (code, schemas, migrations, scripts)
3. **Artifacts** (.ndjson, .jsonl, .tmp reports, NOT as truth, only as evidence)
4. **Docker volumes** (ephemeral, assume lost)
5. **Qdrant/Neo4j/Redis** (mirrors, rebuilt from 1-2)

If Docker data is lost, rebuild from 1 + 2. Always.

---

## Next Actions (Priority)

1. **[Task 1 + 2]** Run inventory + schema match (read-only, 5 min)
2. **[Task 3 + 4]** Define packet schema + dimension policy (types, 10 min)
3. **[Task 5]** Verify four-system indexes exist + populate (audit, 15 min)
4. **[Task 6 + 7]** Create recovery scripts + GAN gate (code, 45 min)
5. **[Task 8]** Generate hardening report (.tmp/report.json, 5 min)
6. **[Layer 1]** Rebuild summaries (dry-run → small slice apply)
7. **[Layer 2]** Rebuild semantic index (dry-run → apply)
8. **[Layer 3]** Wire Gemma4 (only after Layer 1+2 proven)

**DO NOT claim production PASS until Layer 1+2 are proven AND report is written.**

---

## Files to Create/Modify

```
NEW:
  scripts/atlas/recover-from-docker-loss.mjs
  scripts/atlas/rebuild-inventory.mjs
  scripts/atlas/schema-match-audit.mjs
  scripts/phase85/langextract-canonical-pipeline.mjs (already done)
  scripts/atlas/restore-mirrors-from-postgres.mjs (already done)
  
  docs/production-hardening-report.md
  docs/packet-schema.ts (Zod types)
  docs/dimension-policy.md
  docs/index-types-audit.md
  
  .tmp/atlas-recovery-hardening-report.json (output)

MODIFY:
  package.json (add npm run scripts)
  sveltekit-frontend/src/lib/function-registry.mjs (track canonical functions)
```

---

**Authority**: Claude Code (Anthropic)  
**Last Updated**: June 28, 2026  
**Status**: Ready for implementation
