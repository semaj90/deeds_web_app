# CLAUDE.md ops/incident sections — archived verbatim 2026-10-03

Source: root CLAUDE.md. Condensed rules were kept in place; these are the original full texts.

## 🔌 Phase 108D: Qdrant Embeddings Backfill Status (CRITICAL — July 28/29, 2026)

**PROGRESS**: 2/3 proofs PASSED ✅ | 108D-3 script ready, execution blocked by Docker daemon

| Phase | Status | Details |
|-------|--------|---------|
| **108D-1** | ✅ COMPLETE | 10-row proof: STATICALLY_PROVEN (10/10 verified) |
| **108D-2** | ✅ COMPLETE | 1000-row proof: IDEMPOTENCY_PROVEN (1000/1000 verified, 0 mismatches) |
| **108D-3** | ⏳ BLOCKED | Script created & tested; execution needs Docker daemon + Postgres/Qdrant running |

**Key Findings**:
- Qdrant endpoint: PUT to `/collections/{name}/points` (not `/upsert`)
- Named vectors: response field is `vector.content` (not `vectors.content`)
- Qdrant indexing delay: 1-second wait required between upsert and retrieval
- Postgres ENOBUFS: batched queries (50 rows/batch) bypass shell buffer limits
- Contract validation: qdrant_point_id regex must allow slashes and dots

**Artifacts**:
- `scripts/atlas/phase108d-direct-pg-client.mts` — 10-row proof ✅
- `scripts/atlas/phase108d-embeddings-backfill-1000-idempotency.mts` — 1000-row proof ✅
- `scripts/atlas/phase108d-embeddings-backfill-full.mts` — full backfill script ✅ (ready to execute)
- `docs/PHASE-108D-EXTENDED-IMPLEMENTATION-PLAN.md` — comprehensive roadmap ✅

**Disk Space Status (July 28, 29:00 UTC)**:
- ❌ **Freed 20GB** by removing temporary agent worktrees (`.claude/worktrees/agent-*`)
- ❌ **Docker daemon is DOWN** — cannot execute backfill without it
- ⏳ **Action required**: Manually restart Docker Desktop, then run: `npx tsx scripts/atlas/phase108d-embeddings-backfill-full.mts --limit 52380`

---

## 🔌 Qdrant API Strategy: Native Binary or REST with Streaming (CRITICAL — July 28, 2026)

**INCIDENT**: Attempted Qdrant backfill via shell/docker exec + curl failed with ENOBUFS on 768-dim vectors.

**ROOT CAUSE**: JSON serialization of 768-dim float arrays:
- 1 vector = ~3KB JSON (768 floats @ 4 bytes + quotes + commas)
- 1000-vector batch = ~3MB JSON
- Windows cmd.exe buffer = ~8KB
- Result: `spawnSync ENOBUFS` (buffer overflow)

**HARD RULE**: Never serialize vectors to JSON for bulk operations. Use Qdrant native protocols instead.

### Approved Patterns

**1. REST API with streaming (PREFERRED)**
```typescript
// ✅ BEST: Keep vectors in memory, stream binary directly
const vectors: Float32Array[] = [...];  // Stay binary, no JSON conversion
const points = vectors.map((vec, id) => ({
  id,
  vector: Array.from(vec),  // Only convert on serialize
  payload: { ... }
}));

const response = await fetch('http://127.0.0.1:6333/collections/X/points', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ points })  // Single JSON serialization, sent once
});
```

**2. gRPC with binary protocol (FASTEST)**
```typescript
// ✅ FASTEST: No JSON, binary protobuf wire format
import * as grpc from '@grpc/grpc-js';
const client = new qdrant.Qdrant('localhost:6334', grpc.credentials.createInsecure());
await client.Upsert({
  collectionName: 'codebase_chunks_768',
  points: vectors.map((vec, id) => ({
    id,
    vectors: { data: vec },  // Raw float32 array
    payload: { ... }
  }))
});
```

**3. Batch API with streaming (ACCEPTABLE)**
```typescript
// ✅ OK: Use streaming reader for large payloads
for (const batch of chunks(vectors, 1000)) {
  const stream = fs.createWriteStream('batch.jsonl');
  for (const point of batch) {
    stream.write(JSON.stringify(point) + '\n');  // JSONL (newline-delimited)
  }
  stream.end();

  // POST with Content-Type: application/x-ndjson
  await fetch('http://127.0.0.1:6333/collections/X/points', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-ndjson' },
    body: fs.createReadStream('batch.jsonl')
  });
}
```

### Forbidden Patterns

- ❌ **execSync + docker exec + curl** — Shell buffers can't handle 3MB+ payloads
- ❌ **Shell-based JSON generation** — Escaping breaks, quotes clash with wrapping
- ❌ **Base64 encoding vectors** — Adds 33% overhead
- ❌ **Temp files + curl @file** — Still goes through cmd.exe parsing

### Current Implementation Status (UPDATED July 28, 2026)

- ✅ **phase108d-embeddings-backfill-ndjson.mts** — IMPLEMENTED: NDJSON streaming + simdjson addon (RECOMMENDED)
  - Fetches embeddings as NDJSON from Postgres
  - Parses with simdjson addon for 2-5× speedup
  - Streams to Qdrant HTTP API
  - Expected time: ~60-80 seconds for 52,380 vectors
  - No shell/Docker on critical path
  - **Usage**: `npx tsx phase108d-embeddings-backfill-ndjson.mts [--dry-run]`

- ✅ **phase108d-embeddings-backfill-grpc.mts** — Analysis script (ready for implementation)
  - Dry-run mode calculates payload sizes
  - Estimates gRPC speedup (~106s for 52,380 vectors)
  - Requires `@grpc/grpc-js` + qdrant.proto bindings

- ✅ **phase108d-embeddings-backfill-native.mts** — Legacy (works for analysis, not production)
  - Uses docker exec for Postgres queries
  - Falls back to `fetch()` for Qdrant
  - Suitable for small batches (<1000 vectors)

### When to Use Each

1. **52,380-vector backfill (Phase 108D)**: Use **NDJSON streaming** (`phase108d-embeddings-backfill-ndjson.mts`)
   - Simplest to implement
   - ~80 second execution
   - No new dependencies (simdjson addon already in repo)

2. **If <60 second requirement**: Switch to **gRPC** (`phase108d-embeddings-backfill-grpc.mts`)
   - Requires `@grpc/grpc-js` (add to package.json)
   - Binary protocol overhead lower
   - ~106 second execution (2s/batch × 53 batches)

3. **Recurring backfills**: Build **Python sidecar**
   - Native `qdrant-client` library
   - Async queue handling
   - Operational complexity trade-off for robustness

---

## 🗂️ Cross-Directory Script Safety (INCIDENT FIX — July 28, 2026)

**Incident**: Phase 12 backfill created 327MB duplicate DuckDB in `sveltekit-frontend/data/` due to relative path bug. Root cause: npm scripts in subdirectory call parent scripts with hardcoded relative paths.

**Hard Rule**: ALL file paths in configs must be absolute or project-root-relative. Never use relative paths.

**The Pattern (WRONG)**:
```typescript
// ❌ BAD: Works from root, breaks from sveltekit-frontend/
databasePath: process.env.ATLAS_DUCKDB_PATH ?? 'data/atlas-ml/atlas-analytics.duckdb'
```

**The Fix (CORRECT)**:
```typescript
// ✅ GOOD: Works from any working directory
function getProjectRoot(): string {
  if (process.env.PROJECT_ROOT) return process.env.PROJECT_ROOT;
  let current = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    if (current.endsWith('atlas-duckdb')) return path.join(current, '..', '..');
    current = path.dirname(current);
  }
  return process.cwd();
}

const projectRoot = getProjectRoot();
databasePath: path.join(projectRoot, 'data/atlas-ml/atlas-analytics.duckdb')
```

**When This Matters**: Any npm script in `sveltekit-frontend/package.json` that calls `../scripts/atlas/*` must use absolute paths internally.

**Validation Pattern** (add to scripts called from cross-directory):
```typescript
function validateWorkingDirectory(): void {
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    console.error(`❌ Must be run from project root. Fix: cd $(git rev-parse --show-toplevel)`);
    process.exit(1);
  }
}
```

**Files Already Fixed**:
- `packages/atlas-duckdb/src/config.ts` (commit 1de4f4936a)
- `scripts/atlas/duckdb/build-full-snapshot.mts` (commit 1de4f4936a)

**Files Needing Same Fix** (Phase 12 scripts):
- `scripts/atlas/duckdb/build-domain-snapshot.mts`
- `scripts/atlas/duckdb/freeze-vector-snapshot-5k.mts`
- `scripts/atlas/duckdb/build-vector-index-lanes.mts`
- Any other script in `sveltekit-frontend/package.json` that uses relative paths

---

## Qdrant Payload workspace_id Convention (Snapshot Scoping — July 28, 2026)

**workspace_id** is a required Qdrant payload field that scopes enrichment work to a specific snapshot or backfill. It enables:
- Incremental enrichment (Phases 15+ add cluster metadata, SOM coordinates, policy hints)
- Snapshot isolation (multiple simultaneous backfill runs don't interfere)
- Rollback/replay (old workspace_id points can be re-indexed separately)

**Population rules**:
- **Phase 12 (DuckDB snapshot)**: Auto-generated from environment or timestamp
  ```typescript
  const workspaceId = process.env.ATLAS_WORKSPACE_ID ?? `snapshot-phase12-${new Date().toISOString().split('T')[0]}`;
  ```
  This gives Phase 12 snapshots an identifier like `snapshot-phase12-2026-07-28` (deterministic per calendar day).

- **Phases 15+ (enrichment)**: Inherit from Postgres `atlas_packets.workspace_id` column
  Once the column is added to the schema, enrichment scripts read and pass-through the value.

- **Multi-tenant or multi-repo scenarios**: Override via `ATLAS_WORKSPACE_ID` environment variable
  ```bash
  ATLAS_WORKSPACE_ID=acme-legal-2026q3 npm run phase12:snapshot
  ```

**Do NOT**:
- ❌ Leave workspace_id empty or undefined (Qdrant validation rejects it)
- ❌ Use random UUIDs (loses determinism and traceability)
- ❌ Mix different workspace_ids in the same Qdrant collection without explicit intent

**Schema status**: The `atlas_packets.workspace_id` column does not exist yet. Phase 12 scripts populate it in Qdrant payloads for forward compatibility. When the column is added to Postgres (planned for Phases 15+), enrichment scripts will read it from there instead of generating it.

---

## ⚡ CRITICAL: Graphify Startup Daily Validation Gates (July 1, 2026)

**Status**: All infrastructure operational. Validation gates ensure correct service endpoints.

### Graphify Daily Startup Validation

**Before running `npm run graphify:daily`**, validate all services:

```bash
# 1. Embedding Service (embeddinggemma:latest, 768-dim)
curl -s http://127.0.0.1:11434/api/embeddings \
  -d '{"model":"embeddinggemma:latest","prompt":"test"}' | jq '.embedding | length'
# Expected: 768

# 2. Synthesis Server (llama-server at :8090)
curl -s http://127.0.0.1:8090/v1/models | jq '.data[0] | {id, context_length}'
# Expected: id = "hforf.gguf" (alias for gemma4-legal-iq4xs-direct.gguf)

# 3. Go Retrieval (embedding sidecar + search)
curl -s http://127.0.0.1:8100/health | jq '{embeddingServiceUp, pgvectorConnected, qdrantConnected}'
# Expected: all true

# 4. TurboVec (vector prefilter at :8791)
curl -s http://127.0.0.1:8791/health | jq '{ok, indexed, dim, turbovec}'
# Expected: indexed >= 1000, dim = 64 (4-bit quantized)

# 5. Qdrant (vector DB at :6333)
curl -s http://127.0.0.1:6333/collections | jq '.result | length'
# Expected: >= 58 collections

# 6. Postgres (truth layer, port 5434 from Windows / 5432 from Docker)
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c \
  "SELECT count(*) FROM atlas_packets;" | grep -E '[0-9]+' | tail -1
# Expected: 58304 or close to it

# 7. Valkey/Redis (cache at :6379, password: redis)
docker exec legal-ai-valkey valkey-cli PING
# Expected: PONG
```

### Hard Rules for Graphify Startup

- ❌ **Do NOT use Ollama for synthesis.** llama-server at :8090 is canonical.
- ✅ **Run graphify and DuckDB/RabbitMQ export scripts from the repo root** so spawned subprocesses and report paths resolve the same workspace. The scripts now align `cwd` internally and gzip large DuckDB exports automatically.
- ✅ **Use `embeddinggemma:latest` for embeddings** (768-dim, Ollama :11434)
- ✅ **All vectors must be 768-dim** (not 384, not 64-dim AE for ANN)
- ✅ **Postgres is the truth** — all summaries and embeddings written to Postgres FIRST
- ✅ **Redis invalidation AFTER Postgres** — never before
- ❌ **Never call Gemma4 for embeddings** — only synthesis/summaries

### Validation Script (npm run graphify:validate)

**Location**: `scripts/validate-graphify-startup.mjs`

**Checks 7 critical services**:
1. Embedding Service (embeddinggemma @ :11434) — ✅
2. llama-server synthesis (:8090) — ✅
3. Go Retrieval (:8100) — ✅
4. TurboVec ANN (:8791) — ✅
5. Qdrant Vector DB (:6333) — ✅
6. Postgres Truth Layer (:5434) — ⚠️ optional
7. Valkey/Redis Cache (:6379) — ⚠️ optional

**Exit behavior**:
- ✅ Exit 0 if all 4 critical services (1-4) are UP
- ❌ Exit 1 if any critical service is DOWN
- ⚠️ Warns about optional services (5-7) but proceeds if critical pass

**Usage**:
```bash
# Manual validation (before graphify:daily)
npm run graphify:validate

# Graphify daily with auto-validation
npm run graphify:daily  # calls graphify:validate first, then proceeds

# Skip validation (if you know services are up)
npm run graphify:daily:skip-validation
```

**Status (July 1, 2026 07:00 UTC)**:
- ✅ All 4 critical services ONLINE
- ✅ Qdrant running with 34 collections
- ⚠️ Postgres/Redis containers down (rebuilding)
- 🟢 Ready for graphify:daily execution

---

## PostgreSQL 18 Query Optimization & Export Performance (July 4, 2026)

**Status**: PostgreSQL 18.4 is performant. Slow exports are caused by unindexed full-table scans with expensive string operations (e.g., `regexp_split_to_array`, `cardinality`), NOT PostgreSQL latency.

### Fast Export Pattern (Materialized Stats Table)

**Problem**: Queries like `SELECT COUNT(*) WHERE regexp_split_to_array(btrim(summary), '[[:space:]]+') satisfies condition` scan 39K text rows and do string processing per row (O(n) string work).

**Solution**: Pre-compute aggregate statistics in a materialized table, update on schedule.

```sql
-- 1. Create stats table (append-only, 10-row history)
CREATE TABLE codebase_chunk_index_stats (
  id SERIAL PRIMARY KEY,
  total_chunks INT NOT NULL DEFAULT 0,
  summarized_chunks INT NOT NULL DEFAULT 0,
  missing_chunks INT NOT NULL DEFAULT 0,
  good_summaries INT NOT NULL DEFAULT 0,
  contaminated_summaries INT NOT NULL DEFAULT 0,
  last_5min_summaries INT NOT NULL DEFAULT 0,
  last_computed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(last_computed_at)
);

-- 2. Create refresh function (CPU-bound work happens once, not per query)
CREATE OR REPLACE FUNCTION refresh_codebase_chunk_stats()
RETURNS void AS $$
BEGIN
  INSERT INTO codebase_chunk_index_stats 
    (total_chunks, summarized_chunks, missing_chunks, good_summaries, contaminated_summaries, last_computed_at)
  VALUES (
    (SELECT COUNT(*) FROM codebase_chunk_index),
    (SELECT COUNT(*) FROM codebase_chunk_index WHERE summary IS NOT NULL AND btrim(summary) <> ''),
    (SELECT COUNT(*) FROM codebase_chunk_index WHERE summary IS NULL OR btrim(summary) = ''),
    (SELECT COUNT(*) FROM codebase_chunk_index WHERE LENGTH(COALESCE(summary, '')) >= 30),
    (SELECT COUNT(*) FROM codebase_chunk_index WHERE summary LIKE '%<end_of_turn>%' OR summary LIKE '%<thinking>%' OR summary LIKE '%<start_of_turn>%'),
    NOW()
  );
  DELETE FROM codebase_chunk_index_stats 
  WHERE id NOT IN (SELECT id FROM codebase_chunk_index_stats ORDER BY last_computed_at DESC LIMIT 10);
END;
$$ LANGUAGE plpgsql;

-- 3. Create partial index on summary column (filters NULL before scan)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_codebase_chunk_summary_null 
ON codebase_chunk_index (summary) 
WHERE summary IS NOT NULL AND btrim(summary) <> '';

-- 4. Schedule periodic refresh (PostgreSQL 18.4 pg_cron extension, if available)
-- SELECT cron.schedule('refresh_chunk_stats', '*/5 * * * *', 'SELECT refresh_codebase_chunk_stats()');
-- OR: call refresh_codebase_chunk_stats() manually from application startup or scheduled job

-- 5. Query stats instead of raw table (instant, <1ms)
SELECT * FROM codebase_chunk_index_stats ORDER BY last_computed_at DESC LIMIT 1;
```

### Performance Comparison

| Query Type | Table Scan | Latency | Status |
|-----------|-----------|---------|--------|
| Full scan + regex (before) | 39,151 rows | 30-60s | ❌ TIMEOUT |
| Partial index filter (after) | ~39K rows | 78ms | ✅ OK |
| Materialized stats (final) | 1 row | <1ms | ✅ BEST |

### Current Codebase Chunk Stats (July 4, 2026)

```
Total chunks: 39,151
Summarized: 39,151 (100%)
Missing: 0 (0%)
Good summaries (≥30 chars): 39,151 (100%)
Contaminated: 0 (100% CLEAN)
Last computed: 2026-07-04 01:52:54 UTC
```

### Rules for Future Exports

1. **Never use `regexp_split_to_array` in SELECT without filtering/indexing first** — string operations are expensive on large text columns
2. **Always create partial indexes on text columns used in WHERE clauses** — prevents full table scans
3. **Prefer materialized stats tables over computed aggregates** — reuse the same precomputed counts
4. **Schedule periodic refresh via application startup or cron** — keep stats fresh without blocking queries

### Configuration (PostgreSQL 18.4)

Current settings (verified live):
- `shared_buffers: 128MB` ✅ adequate for 251MB table
- `effective_cache_size: 4GB` ✅ keeps hot data in RAM
- `work_mem: 4MB` ✅ per-operation memory
- `jit: on` ✅ JIT compilation enabled (helps regex/function calls)
- `random_page_cost: 4` ✅ balanced for SSD

PostgreSQL 18 is NOT the bottleneck. Query design is.

---

## Object Storage: SeaweedFS is canonical (MinIO deprecated, May 11, 2026)

**MinIO has license issues (AGPL change → commercial/restricted use).** The repo has cut over to **SeaweedFS S3 gateway** as the canonical object store. SeaweedFS is Apache 2.0, S3-compatible, and the existing MinIO SDK speaks to it unchanged.

**Current implementation rule (July 26, 2026):**
- Treat SeaweedFS as the storage product in all new code, prompts, and docs.
- Do not introduce new MinIO-first naming for routes, features, or storage contracts.
- Legacy schema fields and compatibility shims such as `minio_key`, `MINIO_*`, or `minio-client.ts` may remain only until an explicit storage-contract migration renames them.
- When the schema still requires those legacy names, write SeaweedFS-compatible S3 object keys into them rather than inventing a parallel storage path.

**Architecture:**
- `legal-ai-seaweed-master` (port 9333) — metadata
- `legal-ai-seaweed-volume` (host port 8380 → container 8080) — file blobs
- `legal-ai-seaweed-filer`  (host port 8382 → container 8888) — POSIX-style file API
- `legal-ai-seaweed-s3`     (port 8333) — **AWS S3-compatible gateway, this is what the SDK talks to**
- Credentials: `minio` / `minio123` (mirrored in `etc/seaweedfs/s3.json` so the existing MinIO SDK keys work without rotation)
- Bucket: `legal-evidence` (same name as MinIO had — drop-in)

**How the cutover works** (zero code changes in `minio-client.ts` or call sites):

`src/lib/server/env.server.ts:300-307` has a SEAWEED override block:
```ts
if (privateEnv.SEAWEED_S3_PORT) {
  ENV.MINIO_PORT = privateEnv.SEAWEED_S3_PORT;
  if (privateEnv.SEAWEED_ENDPOINT) ENV.MINIO_ENDPOINT = privateEnv.SEAWEED_ENDPOINT;
  if (privateEnv.SEAWEED_ACCESS_KEY) ENV.MINIO_ACCESS_KEY = privateEnv.SEAWEED_ACCESS_KEY;
  if (privateEnv.SEAWEED_SECRET_KEY) ENV.MINIO_SECRET_KEY = privateEnv.SEAWEED_SECRET_KEY;
}
```

The MinIO SDK reads `ENV.MINIO_*` and connects to whatever those resolve to. Setting `SEAWEED_S3_PORT=8333` transparently retargets every `uploadFile` / `deleteFile` / `getMinioClient` / presign call at SeaweedFS.

**The four required env vars** (set in `package.json` `dev` script via cross-env, AND in `.env` for non-`npm run dev` callers like CI / scripts):
```
SEAWEED_S3_PORT=8333
SEAWEED_ENDPOINT=localhost
SEAWEED_ACCESS_KEY=minio
SEAWEED_SECRET_KEY=minio123
```

**Verification (2026-05-11):**
- `POST /api/evidence/upload` 1-byte file → HTTP 201
- `mc ls local/legal-evidence/.../<new-key>` → empty (NOT in MinIO)
- `HEAD /buckets/legal-evidence/.../<new-key>` on SeaweedFS filer → HTTP 200 ✅
- Existing `evidence.fileUrl` records may still carry a legacy `minio://...` prefix, but new guidance and new storage semantics are SeaweedFS-first unless and until the persistence contract is renamed.

**`.env` is gitignored** — production deployments must set the 4 SEAWEED_* env vars in their orchestrator (k8s, fly.io, docker-compose `environment:`, etc.) for the override to fire.

**Migration of existing MinIO objects to SeaweedFS** (separate ops task, not auto):
```bash
# Mirror legal-evidence bucket from MinIO to SeaweedFS
docker exec legal-ai-minio mc mirror --overwrite local/legal-evidence/ \
  http://minio:minio123@seaweed-s3:8333/legal-evidence/
```

**Deprecation timeline:**
1. ✅ 2026-05-11 — cutover env vars set; new uploads go to SeaweedFS
2. ✅ 2026-05-11 — `/api/health` probes SeaweedFS master (:9333/cluster/status) instead of MinIO `/minio/health/live`; `SEAWEED_MASTER_PORT` + `SEAWEED_FILER_PORT` exported from `env.server.ts`
3. ⏳ Pending operator decision — mirror existing MinIO objects to SeaweedFS
4. ⏳ Pending operator decision — `docker stop legal-ai-minio` once mirror complete
5. ⏳ Pending operator decision — remove `legal-ai-minio` service from `docker-compose.yml`
6. ⏳ Pending operator decision — rename `MINIO_*` env vars to `S3_*` (cosmetic; the SDK doesn't care)

**Do NOT:**
- Use `mc admin policy` / MinIO-specific admin commands going forward — they don't translate to SeaweedFS
- Rely on MinIO Console UI (port 9001) for ops — use SeaweedFS Filer UI at port 8382 instead
- Add SeaweedFS-specific multipart features without checking the AWS SDK compatibility matrix (SeaweedFS supports basic multipart but not all advanced S3 features — check before adopting)

---

## Gemma4 LLM Call Rules (Hard Rules — June 2026)

Gemma4 (`gemma4-rotorquant:latest`, `gemma4-legal-iq4xs`) is a thinking/reasoning model. These rules are mandatory for any script or route that calls it:

### llama-server `:8090` — always `stream: true`

```javascript
const res = await fetch(`${LLAMA_URL}/v1/chat/completions`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: MODEL,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 1024,
    temperature: 0.3,
    stream: true,  // REQUIRED — see below
  }),
  signal: AbortSignal.timeout(90_000),
});
// Assemble content deltas from SSE stream:
let assembled = '';
const decoder = new TextDecoder();
let buf = '';
for await (const chunk of res.body) {
  buf += decoder.decode(chunk, { stream: true });
  const lines = buf.split('\n');
  buf = lines.pop() ?? '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const payload = trimmed.slice(5).trim();
    if (payload === '[DONE]') break;
    try {
      const parsed = JSON.parse(payload);
      assembled += parsed.choices?.[0]?.delta?.content ?? '';
    } catch { /* skip malformed SSE line */ }
  }
}
const text = assembled.trim();
```

**Why:** With `stream: false`, the Gemma4 thinking block fills `reasoning_content` first — ~350–400 tokens of chain-of-thought before any `content` tokens appear. A fixed `max_tokens` budget (even 1024) can be exhausted by thinking, leaving `content` empty and `finish_reason: "length"`. Streaming accumulates content deltas as they arrive; `[DONE]` signals stop correctly regardless of thinking length. Streaming also enables `cache_prompt: true` KV reuse across calls with identical prompt prefixes.

**Timeout:** 90s — model may take up to ~30s to finish thinking before first content token arrives.

### Ollama `:11434` — always `think: false`

```javascript
const res = await fetch(`${OLLAMA_URL}/api/chat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: MODEL,
    messages: [{ role: 'user', content: prompt }],
    stream: false,
    think: false,   // REQUIRED — suppresses reasoning block entirely
    options: { temperature: 0.3, num_predict: 200 },
  }),
  signal: AbortSignal.timeout(60_000),
});
const data = await res.json();
const text = data.message?.content?.trim();  // NOT data.response
```

**Why:** Ollama exposes `think: false` to suppress the reasoning block entirely; `num_predict: 200` is then sufficient for a 2–3 sentence answer.

### Batch rule

`batch=1` (sequential) — Gemma4 cannot serve parallel completions. Concurrent requests queue; the first-in AbortSignal.timeout fires before queued ones start.

### OLLAMA_HOST normalization

Ollama sets `OLLAMA_HOST=0.0.0.0` when binding to all interfaces. `0.0.0.0` is not a connectable address. Always normalize before use:

```javascript
const _ollamaRaw = (process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434').replace(/^0\.0\.0\.0/, '127.0.0.1');
const OLLAMA_URL = _ollamaRaw.startsWith('http') ? _ollamaRaw : `http://${_ollamaRaw}:11434`;
```

---

## OpenCode + llama-server Config — Validated Shape (June 2026)

### Root cause: historical template mismatch, now fixed in the live launch config

The older embedded `gemma` chat template path was the source of the earlier system-role drop. The live server on `:8090` now reports `supports_system_role: true` and `supports_tool_calls: true`, which means the current launch path is using the corrected chat-template wiring.

**Current rule**: keep the `--chat-template-file configs/templates/custom_pub_chat_template_gemma4.jinja`
override in the launcher so the runtime stays on the validated template path — this is the same file
named in the "❄️ CANONICAL LLAMA-SERVER STARTUP CONTRACT" at the top of this document and is
`scripts/launch-turboquant.ps1`'s own hard-coded default (`$defaultTemplate`). A prior revision of
this section named `gemma4-opencode.jinja` instead; that was stale — the launcher's own gate
explicitly flags `gemma4-opencode.jinja` as the wrong template (`supports_tools:false`).

```
llama-server.exe -m model.gguf
  --chat-template-file configs/templates/custom_pub_chat_template_gemma4.jinja
  --jinja --reasoning-format none
  -c 65536 -ngl 99 -fa on -ctk q8_0 -ctv q8_0
  --cache-prompt --cache-reuse 256
```

**Env override**: set `TURBO_CHAT_TEMPLATE_FILE=<absolute path>` to use a different template; set `TURBO_CHAT_TEMPLATE_FILE=none` to skip (only if GGUF has a correct embedded template).

Do NOT pass: `--chat-template gemma`, `--chat-template gemma3`, `--reasoning auto`, `--reasoning-budget 0` — older named templates cause `supports_system_role: false` on this build.

After restart, `/props` should still show `supports_system_role: true, supports_tool_calls: true`.

**Sanity check** (run after any llama-server restart):
```powershell
curl.exe http://127.0.0.1:8090/v1/chat/completions `
  -H "Content-Type: application/json" `
  -d '{"model":"gemma4-legal-iq4xs-direct.gguf","messages":[{"role":"system","content":"Reply exactly: SYSTEM_OK"},{"role":"user","content":"hello"}],"temperature":0,"stream":false,"max_tokens":16}'
# Expected content: SYSTEM_OK
# Bad (training-trace): "gemma3.5-27-g..." → --chat-template was passed, restart without it
```

### opencode.jsonc model block

Use `limit.context` / `limit.output` (not `contextLength`) and match the exact server model ID:

```jsonc
"models": {
  "gemma4-legal-iq4xs-direct.gguf": {   // must match /v1/models id exactly
    "name": "Gemma4 Legal",
    "tools": true,           // REQUIRED for tool-call streaming
    "reasoning": false,
    "limit": {
      "context": 65536,      // NOT contextLength — ignored by @ai-sdk/openai-compatible
      "output": 8192
    }
  }
},
"model": "bifrost-local/gemma4-legal-iq4xs-direct.gguf"
```

### TRACE MCP transport

`StreamableHTTPServerTransport` with `sessionIdGenerator: undefined` (stateless) does not support GET-based SSE session establishment. GET `/mcp` now returns `405 Allow: POST` immediately — OpenCode falls back to POST-only Streamable HTTP. POST `tools/list` returns 124 tools.

```jsonc
"trace": {
  "type": "remote",
  "url": "http://127.0.0.1:8788/mcp",
  "headers": { "Accept": "application/json, text/event-stream" }
}
```

### Instruction pollution guard

`instructions` array must only list files that are provably clean:
- `.opencode/system.md` — safe (no card imports, no `Self-Correction` strings)
- `AGENTS.md` — safe (rules only)
- Do NOT include `.opencode/cards/**`, `TOC.md`, audit reports, session transcripts

**`Self-Correction` contamination** (seen in `.opencode/cards/*.json`): if OpenCode loads these as context, Gemma4 completes the training-trace pattern. Detection: `rg "Self-Correction" .opencode/`. Fix: delete contaminated cards; never add `.opencode/cards/` to `instructions`.

---

## Neural Decoder Container + PyTorch/CUDA Pin Reference (2026-08-31)

**TL;DR**: The Parent Atlas neural decoder (NestedSemanticAutoencoder,
`semantic_768` → `latent_256`/`128`/`64`) is now a real `docker-compose` GPU
service (`DECODER-CONTAINER-01`, closed), not just a manually-launched host
process. Live-proven: real 768-dim encode call, `device: "cuda"`, checksums
match. Full evidence trail:
`openspec/changes/parent-atlas-neural-prefill-encoder/tasks.md`
(`DECODER-CONTAINER-01`, `PREFILL-CALLER-01` per-candidate wiring).

| Item | Value |
|---|---|
| Service | `atlas-neural-decoder` in `docker/docker-compose.gpu.yml` (profile `atlas-gpu`) |
| Dockerfile | `docker/atlas-neural-decoder/Dockerfile` |
| Base image | `pytorch/pytorch:2.13.0-cuda13.2-cudnn9-runtime` (pinned by tag **and** digest) |
| Port | `8121` (matches `NEURAL_DECODER_URL` default; not `8100`/`8101`/`8095`) |
| Checkpoint mount | `../models/nested-semantic-autoencoder:/models/nested-semantic-autoencoder:ro` |
| VRAM footprint | ~200MB measured live (6384→6587MiB of 8192MiB) |

**CUDA/PyTorch version note (verified via live web search, 2026-08-31) —
don't copy the old `cu128` reference from historical proof logs**: `torch
2.8.0+cu128`, seen in this repo's earlier host-process decoder proof, is now
deprecated — PyTorch 2.12 CI removed CUDA 12.8 from its build matrix (week of
2026-04-06). Current stable PyTorch as of this check is 2.12+/2.13.x. CUDA
13.0 is PyTorch's own pip-wheel "stable" tier; CUDA 13.2 is still
experimental there (nightly-only wheels), but Docker Hub ships
maintainer-built `pytorch/pytorch:*-cuda13.2-*` release images independently
of the pip wheel channel. cuTile (NVIDIA's tile-based kernel programming
model) went stable on Ampere/compute-capability-8.x in CUDA 13.2 — this
host's RTX 3060 Ti is 8.6, so 13.2 was chosen over 13.0 for forward-compat
at zero measured cost (this decoder has no custom-kernel code path today).
Before pinning any new PyTorch/CUDA Docker base image anywhere in this repo,
verify current versions live (`docker manifest inspect` / `docker buildx
imagetools inspect` + a real web search) — do not assume an old proof log's
version string is still current.

**Packaging gotcha (found via a real build failure, not hypothetical)**:
`atlas_neural_decoder_service.py` imports `atlas_compute.latent_autoencoder`,
but the real `python/atlas_compute/__init__.py` eagerly imports RAPIDS
(`cugraph_ppr`, `cuvs_analytics`) modules this decoder never uses and a plain
PyTorch image doesn't carry — importing the real package would crash at
container startup. A minimal image must `COPY` only
`latent_autoencoder.py` (verified self-contained: only imports
numpy/torch/stdlib) plus a build-time-only empty `__init__.py` written
inside the image — never copy the real package `__init__.py` for this
service, and never edit the repo's real `atlas_compute/__init__.py` to work
around it. Separately, this specific base image is Debian PEP-668
"externally managed" — plain `pip install` fails there without
`--break-system-packages` (safe for a single-purpose container).
