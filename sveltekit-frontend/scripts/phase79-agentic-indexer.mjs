#!/usr/bin/env node
/**
 * phase79-agentic-indexer.mjs — Error Indexing to Qdrant
 *
 * Indexes error clusters and individual error events from PostgreSQL into
 * Qdrant for the Phase 78-79 repair pipeline. Creates a searchable error
 * knowledge base that feeds the agentic repair agent.
 *
 * Flow:
 * 1. Read error_clusters + error_events from PostgreSQL
 * 2. Generate 768-dim embeddings via Ollama (embeddinggemma:latest)
 * 3. Ensure Qdrant collection exists (error_clusters, 768-dim, INT8 quantized)
 * 4. Upsert points with rich metadata (route, severity, pattern, suggestions)
 * 5. Optionally add BM42 sparse vectors for hybrid search
 *
 * Usage:
 *   node scripts/phase79-agentic-indexer.mjs                  # Index all unindexed
 *   node scripts/phase79-agentic-indexer.mjs --force           # Re-index everything
 *   node scripts/phase79-agentic-indexer.mjs --events          # Also index individual events
 *   node scripts/phase79-agentic-indexer.mjs --dry-run         # Show what would be indexed
 *
 * Requires: Ollama running, Qdrant running, PostgreSQL running
 */

import dotenv from 'dotenv';
import pg from 'pg';
import crypto from 'node:crypto';

dotenv.config();

// ─────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const OLLAMA_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'embeddinggemma:latest';
const COLLECTION_NAME = 'error_clusters';
const EVENTS_COLLECTION = 'error_events';
const DIMENSIONS = 768;
const BATCH_SIZE = 10;
const RATE_LIMIT_MS = 300;

// Parse args
const args = process.argv.slice(2);
const forceReindex = args.includes('--force');
const indexEvents = args.includes('--events');
const dryRun = args.includes('--dry-run');
const verbose = args.includes('--verbose') || args.includes('-v');

// ─────────────────────────────────────────────────────────────────────
// Database
// ─────────────────────────────────────────────────────────────────────

const pool = new pg.Pool({ connectionString: DATABASE_URL });

async function queryDB(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

// ─────────────────────────────────────────────────────────────────────
// Ollama Embedding
// ─────────────────────────────────────────────────────────────────────

async function generateEmbedding(text) {
  const res = await fetch(`${OLLAMA_URL}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Ollama error: ${res.status} ${res.statusText}`);
  const data = await res.json();
  return data.embeddings?.[0] ?? data.embedding;
}

// ─────────────────────────────────────────────────────────────────────
// BM42 Sparse Vector (FNV-1a hashing, log(1+TF) weighting)
// ─────────────────────────────────────────────────────────────────────

function fnv1a(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function computeSparseVector(text) {
  const tokens = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
  const tf = new Map();
  for (const token of tokens) {
    tf.set(token, (tf.get(token) || 0) + 1);
  }
  const indices = [];
  const values = [];
  for (const [token, count] of tf.entries()) {
    indices.push(fnv1a(token) % (2 ** 30));
    values.push(Math.log(1 + count));
  }
  return { indices, values };
}

// ─────────────────────────────────────────────────────────────────────
// Qdrant API
// ─────────────────────────────────────────────────────────────────────

async function qdrantFetch(path, method = 'GET', body = undefined) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${QDRANT_URL}${path}`, opts);
  const text = await res.text();
  try { return { ok: res.ok, status: res.status, data: JSON.parse(text) }; }
  catch { return { ok: res.ok, status: res.status, data: text }; }
}

async function ensureCollection(name) {
  const check = await qdrantFetch(`/collections/${name}`);
  if (check.ok) {
    console.log(`  Collection "${name}" exists`);

    // Ensure sparse vectors are configured
    try {
      await qdrantFetch(`/collections/${name}`, 'PATCH', {
        sparse_vectors: { bm42: {} },
      });
      console.log(`  Sparse vector "bm42" ensured on "${name}"`);
    } catch {
      // Sparse vectors may already exist
    }
    return;
  }

  console.log(`  Creating collection "${name}" (${DIMENSIONS}d, INT8 quantized)...`);
  const res = await qdrantFetch(`/collections/${name}`, 'PUT', {
    vectors: {
      size: DIMENSIONS,
      distance: 'Cosine',
      on_disk: true,
      hnsw_config: { m: 16, ef_construct: 200 },
    },
    sparse_vectors: { bm42: {} },
    quantization_config: {
      scalar: { type: 'int8', quantile: 0.99, always_ram: false },
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to create collection "${name}": ${JSON.stringify(res.data)}`);
  }

  // Create payload indexes for filtering
  const payloadIndexes = [
    { field: 'kind', schema: 'keyword' },
    { field: 'severity', schema: 'keyword' },
    { field: 'route_path', schema: 'keyword' },
    { field: 'source_type', schema: 'keyword' },
  ];

  for (const idx of payloadIndexes) {
    await qdrantFetch(`/collections/${name}/index`, 'PUT', {
      field_name: idx.field,
      field_schema: idx.schema,
    });
  }

  console.log(`  Collection "${name}" created with ${payloadIndexes.length} payload indexes`);
}

async function upsertBatch(collection, points) {
  const res = await qdrantFetch(`/collections/${collection}/points`, 'PUT', {
    points,
  });
  if (!res.ok) {
    throw new Error(`Upsert failed: ${JSON.stringify(res.data)}`);
  }
  return res;
}

async function getExistingIds(collection) {
  // Scroll all point IDs to check what's already indexed
  const ids = new Set();
  let offset = null;
  do {
    const body = { limit: 100, with_payload: false, with_vector: false };
    if (offset) body.offset = offset;
    const res = await qdrantFetch(`/collections/${collection}/points/scroll`, 'POST', body);
    if (!res.ok) return ids;
    const points = res.data?.result?.points || [];
    for (const p of points) ids.add(String(p.id));
    offset = res.data?.result?.next_page_offset ?? null;
  } while (offset);
  return ids;
}

// ─────────────────────────────────────────────────────────────────────
// Deterministic ID generation (MD5 → unsigned int32)
// ─────────────────────────────────────────────────────────────────────

function deterministicId(input) {
  const hash = crypto.createHash('md5').update(input).digest();
  return hash.readUInt32BE(0);
}

// ─────────────────────────────────────────────────────────────────────
// Index Error Clusters
// ─────────────────────────────────────────────────────────────────────

async function indexClusters() {
  console.log('\n  Indexing error_clusters → Qdrant...');

  // Check if error_suggestions table exists (may not in native PG)
  const sugCheck = await queryDB(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'error_suggestions'
    ) as exists
  `);
  const hasSuggestions = sugCheck[0]?.exists === true;

  let clusters;
  if (hasSuggestions) {
    // Detect actual column names (native PG uses summary/risk_level, Drizzle schema uses title/confidence)
    const cols = await queryDB(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'error_suggestions'
    `);
    const colNames = new Set(cols.map(c => c.column_name));
    const titleCol = colNames.has('title') ? 's.title' : colNames.has('summary') ? 's.summary' : "'N/A'";
    const confCol = colNames.has('confidence') ? 's.confidence' : colNames.has('risk_level') ? 's.risk_level' : "'N/A'";
    const explCol = colNames.has('explanation') ? 's.explanation' : "'N/A'";

    clusters = await queryDB(`
      SELECT c.*,
        COALESCE(
          json_agg(json_build_object(
            'title', ${titleCol},
            'explanation', ${explCol},
            'confidence', ${confCol}
          )) FILTER (WHERE s.id IS NOT NULL), '[]'
        ) as suggestions
      FROM error_clusters c
      LEFT JOIN error_suggestions s ON s.cluster_id = c.id
      GROUP BY c.id
      ORDER BY c.member_count DESC NULLS LAST
    `);
  } else {
    console.log('  (error_suggestions table not found — indexing without suggestions)');
    clusters = await queryDB(`
      SELECT *, '[]'::json as suggestions
      FROM error_clusters
      ORDER BY member_count DESC NULLS LAST
    `);
  }

  console.log(`  Found ${clusters.length} clusters in PostgreSQL`);
  if (clusters.length === 0) return { indexed: 0, skipped: 0, failed: 0 };

  await ensureCollection(COLLECTION_NAME);

  // Check existing
  let existingIds = new Set();
  if (!forceReindex) {
    existingIds = await getExistingIds(COLLECTION_NAME);
    console.log(`  ${existingIds.size} already indexed in Qdrant`);
  }

  let indexed = 0, skipped = 0, failed = 0;

  for (let i = 0; i < clusters.length; i += BATCH_SIZE) {
    const batch = clusters.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(clusters.length / BATCH_SIZE);
    console.log(`  Batch ${batchNum}/${totalBatches}...`);

    const points = [];

    for (const cluster of batch) {
      const pointId = deterministicId(`cluster:${cluster.id}`);

      if (!forceReindex && existingIds.has(String(pointId))) {
        skipped++;
        if (verbose) console.log(`    SKIP ${cluster.id} (already indexed)`);
        continue;
      }

      // Build rich text for embedding (use actual native PG column names)
      const suggestions = Array.isArray(cluster.suggestions) ? cluster.suggestions : [];
      const sugText = suggestions.map(s => `Fix: ${s.title} (${s.confidence ?? '?'})`).join('. ');
      const pattern = cluster.error_pattern || cluster.pattern || '';
      const memberCount = cluster.member_count ?? cluster.error_count ?? 0;
      const desc = cluster.description || '';
      const fixApproach = cluster.suggested_fix_approach || '';

      const text = [
        `Error Cluster [${cluster.kind}] Severity: ${cluster.severity}`,
        `Pattern: ${pattern}`,
        desc ? `Description: ${desc}` : '',
        `Member count: ${memberCount}`,
        fixApproach ? `Fix approach: ${fixApproach}` : '',
        sugText || '',
      ].filter(Boolean).join('\n');

      if (dryRun) {
        console.log(`    DRY-RUN: Would index cluster ${cluster.id} (${text.length} chars)`);
        indexed++;
        continue;
      }

      try {
        const embedding = await generateEmbedding(text);
        if (!embedding || embedding.length !== DIMENSIONS) {
          console.log(`    FAIL ${cluster.id}: Bad embedding (${embedding?.length ?? 0}d)`);
          failed++;
          continue;
        }

        const sparse = computeSparseVector(text);

        points.push({
          id: pointId,
          vector: {
            '': embedding,       // default dense vector
            bm42: sparse,        // sparse vector for hybrid search
          },
          payload: {
            cluster_id: cluster.id,
            kind: cluster.kind,
            severity: cluster.severity,
            pattern: pattern.slice(0, 2000),
            description: desc.slice(0, 2000),
            member_count: memberCount,
            suggested_fix_approach: fixApproach.slice(0, 2000),
            route_id: cluster.route_id || null,
            suggestions: suggestions.slice(0, 5),
            source_type: 'cluster',
            indexed_at: new Date().toISOString(),
          },
        });

        indexed++;
        if (verbose) console.log(`    OK ${cluster.id}: ${embedding.length}d + ${sparse.indices.length} sparse terms`);
      } catch (err) {
        console.log(`    FAIL ${cluster.id}: ${err.message}`);
        failed++;
      }
    }

    // Upsert batch
    if (points.length > 0 && !dryRun) {
      await upsertBatch(COLLECTION_NAME, points);
    }

    // Rate limit between batches
    if (i + BATCH_SIZE < clusters.length) {
      await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
    }
  }

  return { indexed, skipped, failed };
}

// ─────────────────────────────────────────────────────────────────────
// Index Individual Error Events (optional, --events flag)
// ─────────────────────────────────────────────────────────────────────

async function indexErrorEvents() {
  console.log('\n  Indexing error_events → Qdrant...');

  const events = await queryDB(`
    SELECT id, route_path, file, kind, severity, ts_code, message,
           line_number, column_number, cluster_id, collected_at
    FROM error_events
    ORDER BY collected_at DESC
    LIMIT 1000
  `);

  console.log(`  Found ${events.length} error events`);
  if (events.length === 0) return { indexed: 0, skipped: 0, failed: 0 };

  await ensureCollection(EVENTS_COLLECTION);

  let existingIds = new Set();
  if (!forceReindex) {
    existingIds = await getExistingIds(EVENTS_COLLECTION);
    console.log(`  ${existingIds.size} already indexed`);
  }

  let indexed = 0, skipped = 0, failed = 0;

  for (let i = 0; i < events.length; i += BATCH_SIZE) {
    const batch = events.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(events.length / BATCH_SIZE);
    console.log(`  Batch ${batchNum}/${totalBatches}...`);

    const points = [];

    for (const event of batch) {
      const pointId = deterministicId(`event:${event.id}`);

      if (!forceReindex && existingIds.has(String(pointId))) {
        skipped++;
        continue;
      }

      const text = [
        `${event.kind} error in ${event.route_path || event.file || 'unknown'}`,
        event.ts_code ? `TS${event.ts_code}` : '',
        event.message,
        event.file && event.line_number ? `at ${event.file}:${event.line_number}` : '',
      ].filter(Boolean).join(' — ');

      if (dryRun) {
        indexed++;
        continue;
      }

      try {
        const embedding = await generateEmbedding(text);
        if (!embedding || embedding.length !== DIMENSIONS) {
          failed++;
          continue;
        }

        const sparse = computeSparseVector(text);

        points.push({
          id: pointId,
          vector: { '': embedding, bm42: sparse },
          payload: {
            event_id: event.id,
            route_path: event.route_path,
            file: event.file,
            kind: event.kind,
            severity: event.severity,
            ts_code: event.ts_code,
            message: event.message?.slice(0, 2000),
            line_number: event.line_number,
            cluster_id: event.cluster_id,
            collected_at: event.collected_at?.toISOString(),
            source_type: 'event',
          },
        });

        indexed++;
      } catch (err) {
        failed++;
        if (verbose) console.log(`    FAIL ${event.id}: ${err.message}`);
      }
    }

    if (points.length > 0 && !dryRun) {
      await upsertBatch(EVENTS_COLLECTION, points);
    }

    if (i + BATCH_SIZE < events.length) {
      await new Promise(r => setTimeout(r, RATE_LIMIT_MS));
    }
  }

  return { indexed, skipped, failed };
}

// ─────────────────────────────────────────────────────────────────────
// Health Check
// ─────────────────────────────────────────────────────────────────────

async function checkServices() {
  const checks = {};

  // PostgreSQL
  try {
    const rows = await queryDB('SELECT 1 as ok');
    checks.postgres = rows[0]?.ok === 1;
  } catch { checks.postgres = false; }

  // Ollama
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(5000) });
    checks.ollama = res.ok;
  } catch { checks.ollama = false; }

  // Qdrant
  try {
    const res = await qdrantFetch('/collections');
    checks.qdrant = res.ok;
  } catch { checks.qdrant = false; }

  return checks;
}

// ─────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n  Phase 79 — Agentic Error Indexer');
  console.log(`  Qdrant: ${QDRANT_URL}`);
  console.log(`  Ollama: ${OLLAMA_URL} (${EMBEDDING_MODEL})`);
  console.log(`  Mode: ${dryRun ? 'DRY-RUN' : forceReindex ? 'FORCE RE-INDEX' : 'INCREMENTAL'}`);
  if (indexEvents) console.log('  Including individual error events');

  // Pre-flight checks
  const health = await checkServices();
  const allOk = Object.values(health).every(Boolean);

  for (const [svc, ok] of Object.entries(health)) {
    console.log(`  ${ok ? 'OK' : 'FAIL'} ${svc}`);
  }

  if (!allOk && !dryRun) {
    console.error('\n  ERROR: Not all services are reachable. Fix before indexing.');
    process.exit(1);
  }

  // Index clusters (always)
  const clusterResult = await indexClusters();

  // Index events (optional)
  let eventResult = { indexed: 0, skipped: 0, failed: 0 };
  if (indexEvents) {
    eventResult = await indexErrorEvents();
  }

  // Summary
  console.log('\n  ── Summary ──');
  console.log(`  Clusters: ${clusterResult.indexed} indexed, ${clusterResult.skipped} skipped, ${clusterResult.failed} failed`);
  if (indexEvents) {
    console.log(`  Events:   ${eventResult.indexed} indexed, ${eventResult.skipped} skipped, ${eventResult.failed} failed`);
  }

  const total = clusterResult.indexed + eventResult.indexed;
  console.log(`  Total:    ${total} points indexed to Qdrant`);

  if (dryRun) {
    console.log('\n  (Dry run — no changes made)');
  }

  console.log('\n  Done.\n');
}

main()
  .catch(err => {
    console.error(`  FATAL: ${err.message}`);
    if (verbose) console.error(err.stack);
    process.exit(1);
  })
  .finally(() => pool.end());
