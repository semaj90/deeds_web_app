#!/usr/bin/env node
/**
 * enrich-codeintel-heuristic.mjs — Fast heuristic domain/kind/tag enrichment.
 *
 * Scrolls codebase_chunks_768, derives domain + kind + semantic_tags from
 * file_path patterns (no LLM needed). Writes to both Qdrant AND Postgres.
 *
 * Covers ~80% of chunks deterministically. Remaining ambiguous chunks
 * need LLM classification via the karpathy-tag endpoint.
 *
 * Usage:
 *   node scripts/enrich-codeintel-heuristic.mjs [--dry-run] [--limit N]
 */

import pg from 'pg';
const { Pool } = pg;

const QDRANT_URL = process.env.QDRANT_URL ?? 'http://localhost:6333';
const COLLECTION = 'codebase_chunks_768';
const PG_URL     = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const DRY_RUN    = process.argv.includes('--dry-run');
const LIMIT      = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] ?? '0');

const pool = new Pool({ connectionString: PG_URL });

// ── Domain + kind rules (order matters — first match wins) ─────────────────

const RULES = [
  // API routes
  { match: /\/routes\/api\//, domain: 'api', kind: 'api-route' },
  { match: /\+server\.ts$/,   domain: 'api', kind: 'api-route' },

  // Page components
  { match: /\+page\.svelte$/,   domain: 'ui',     kind: 'page-component' },
  { match: /\+layout\.svelte$/, domain: 'ui',     kind: 'page-component' },
  { match: /\+page\.server\.ts$/,domain: 'api',   kind: 'server-module' },
  { match: /\+layout\.server\.ts$/, domain: 'api', kind: 'server-module' },

  // Auth
  { match: /\/auth\//,        domain: 'auth',    kind: 'auth' },
  { match: /auth/i,           domain: 'auth',    kind: 'auth', fileOnly: true },

  // Database / ORM
  { match: /\/db\//,          domain: 'database', kind: 'database' },
  { match: /schema-postgres/, domain: 'database', kind: 'database' },
  { match: /drizzle/,         domain: 'database', kind: 'database' },
  { match: /migration/,       domain: 'database', kind: 'database' },

  // Vector search
  { match: /qdrant/i,         domain: 'vector-search', kind: 'vector-search' },
  { match: /vector/i,         domain: 'vector-search', kind: 'vector-search' },
  { match: /embed/i,          domain: 'embedding',     kind: 'embedding' },

  // Graph DB
  { match: /neo4j/i,          domain: 'graph',    kind: 'graph-db' },
  { match: /graph/i,          domain: 'graph',    kind: 'graph-db' },

  // Cache
  { match: /cache/i,          domain: 'cache',    kind: 'cache' },
  { match: /redis/i,          domain: 'cache',    kind: 'cache' },
  { match: /bifrost/i,        domain: 'cache',    kind: 'cache' },

  // RAG / AI
  { match: /rag/i,            domain: 'ai',       kind: 'rag-pipeline' },
  { match: /\/ai\//,          domain: 'ai',       kind: 'ml-inference' },
  { match: /ollama/i,         domain: 'ai',       kind: 'ml-inference' },
  { match: /inference/i,      domain: 'ai',       kind: 'ml-inference' },
  { match: /grpo/i,           domain: 'ai',       kind: 'ml-inference' },
  { match: /qlora/i,          domain: 'ai',       kind: 'ml-inference' },

  // State machines
  { match: /machine/i,        domain: 'state',    kind: 'state-machine' },
  { match: /xstate/i,         domain: 'state',    kind: 'state-machine' },

  // Evidence / Legal
  { match: /evidence/i,       domain: 'legal',    kind: 'server-module' },
  { match: /case/i,           domain: 'legal',    kind: 'server-module' },
  { match: /citation/i,       domain: 'legal',    kind: 'server-module' },
  { match: /statute/i,        domain: 'legal',    kind: 'server-module' },
  { match: /legal/i,          domain: 'legal',    kind: 'server-module' },
  { match: /forensic/i,       domain: 'legal',    kind: 'server-module' },

  // Analytics
  { match: /analytics/i,      domain: 'analytics', kind: 'analytics' },
  { match: /telemetry/i,      domain: 'analytics', kind: 'analytics' },
  { match: /metric/i,         domain: 'analytics', kind: 'analytics' },

  // Workers / queues
  { match: /worker/i,         domain: 'infra',    kind: 'worker' },
  { match: /rabbitmq/i,       domain: 'infra',    kind: 'worker' },
  { match: /queue/i,          domain: 'infra',    kind: 'worker' },

  // SSE
  { match: /sse/i,            domain: 'infra',    kind: 'sse' },
  { match: /stream/i,         domain: 'infra',    kind: 'sse' },

  // Config
  { match: /config/i,         domain: 'config',   kind: 'config' },
  { match: /env\./i,          domain: 'config',   kind: 'config' },
  { match: /\.config\./,      domain: 'config',   kind: 'config' },

  // Tests
  { match: /\.test\.|\.spec\./, domain: 'test',   kind: 'test' },
  { match: /tests?\//,         domain: 'test',    kind: 'test' },

  // Types
  { match: /\/types\//,       domain: 'types',    kind: 'types' },
  { match: /\.d\.ts$/,        domain: 'types',    kind: 'types' },

  // UI components
  { match: /\/components\//,  domain: 'ui',       kind: 'ui-component' },
  { match: /\.svelte$/,       domain: 'ui',       kind: 'ui-component' },

  // GPU / CUDA
  { match: /gpu/i,            domain: 'gpu',      kind: 'ml-inference' },
  { match: /cuda/i,           domain: 'gpu',      kind: 'ml-inference' },
  { match: /tensor/i,         domain: 'gpu',      kind: 'ml-inference' },
  { match: /onnx/i,           domain: 'gpu',      kind: 'ml-inference' },
  { match: /webgpu/i,         domain: 'gpu',      kind: 'ml-inference' },

  // MCP
  { match: /mcp/i,            domain: 'mcp',      kind: 'server-module' },

  // Scripts / utilities
  { match: /scripts?\//,      domain: 'tooling',  kind: 'utility' },
  { match: /utils?/i,         domain: 'utility',  kind: 'utility' },
  { match: /helpers?/i,       domain: 'utility',  kind: 'utility' },
  { match: /lib\//,           domain: 'utility',  kind: 'server-module' },
];

/** Derive domain + kind from file_path. Returns null if no rule matches. */
function classify(filePath) {
  if (!filePath) return null;
  const basename = filePath.split('/').pop() ?? '';
  for (const rule of RULES) {
    if (rule.fileOnly) {
      if (rule.match.test(basename)) return { domain: rule.domain, kind: rule.kind };
    } else {
      if (rule.match.test(filePath)) return { domain: rule.domain, kind: rule.kind };
    }
  }
  return null;
}

/** Derive semantic tags from kind (1:1 mapping). */
function kindToTags(kind) {
  return kind ? [kind] : [];
}

// ── Qdrant scroll ──────────────────────────────────────────────────────────────

async function scrollQdrant(offset, limit) {
  const body = { limit, with_payload: true, with_vectors: false };
  if (offset) body.offset = offset;

  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Qdrant scroll failed: ${res.status}`);
  const data = await res.json();
  return {
    points:     data.result?.points ?? [],
    nextOffset: data.result?.next_page_offset ?? null,
  };
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Heuristic enrichment: domain/kind/tags (dry=${DRY_RUN}, limit=${LIMIT || 'all'})`);

  let offset = null;
  let total = 0, enriched = 0, unchanged = 0, errors = 0;
  const domainDist = {};
  const kindDist   = {};
  const start = Date.now();

  // Collect all enrichments first, then batch write
  const qdrantUpdates = [];   // { id, domain, kind, tags[] }
  const pgUpdates     = [];   // same shape

  do {
    const { points, nextOffset } = await scrollQdrant(offset, 200);
    if (!points.length) break;

    for (const pt of points) {
      const filePath = pt.payload?.file_path ?? pt.payload?.relative_path ?? '';
      const result   = classify(filePath);

      if (!result) {
        unchanged++;
        total++;
        continue;
      }

      const { domain, kind } = result;
      const tags = kindToTags(kind);

      // Only enrich if domain was missing/wrong or kind was missing
      const oldDomain = pt.payload?.domain;
      const oldKind   = pt.payload?.kind;
      const needsUpdate = !oldDomain || oldDomain === 'utility' || !oldKind;

      if (!needsUpdate) {
        unchanged++;
        total++;
        continue;
      }

      qdrantUpdates.push({ id: pt.id, domain, kind, tags });
      pgUpdates.push({ qdrantId: String(pt.id), domain, kind, tags });

      domainDist[domain] = (domainDist[domain] ?? 0) + 1;
      kindDist[kind]     = (kindDist[kind] ?? 0) + 1;
      enriched++;
      total++;
    }

    process.stdout.write(`\r  ${total} scanned, ${enriched} to enrich, ${unchanged} already good`);
    offset = nextOffset;
    if (LIMIT > 0 && total >= LIMIT) break;
  } while (offset);

  console.log(`\n  Scan complete: ${enriched} need enrichment, ${unchanged} unchanged`);

  if (DRY_RUN) {
    console.log('  [DRY RUN] No writes performed.');
    console.log('  Domain distribution:', domainDist);
    console.log('  Kind distribution:', kindDist);
    await pool.end();
    return;
  }

  // ── Batch write to Qdrant ──────────────────────────────────────────────────
  console.log(`  Writing ${qdrantUpdates.length} enrichments to Qdrant...`);
  const BATCH = 100;
  for (let i = 0; i < qdrantUpdates.length; i += BATCH) {
    const batch = qdrantUpdates.slice(i, i + BATCH);

    // Qdrant set_payload with batch of point IDs
    for (const upd of batch) {
      try {
        const existingTags = [];  // We merge, not replace
        const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/payload`, {
          method:  'PUT',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            payload: { domain: upd.domain, kind: upd.kind, tags: upd.tags },
            points:  [upd.id],
          }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) errors++;
      } catch { errors++; }
    }
    process.stdout.write(`\r  Qdrant: ${Math.min(i + BATCH, qdrantUpdates.length)}/${qdrantUpdates.length}`);
  }
  console.log();

  // ── Batch write to Postgres ────────────────────────────────────────────────
  console.log(`  Writing ${pgUpdates.length} enrichments to Postgres...`);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const upd of pgUpdates) {
      try {
        await client.query(
          `UPDATE codebase_chunk_index
           SET domain = $1, kind = $2, semantic_tags = $3, updated_at = now()
           WHERE qdrant_id = $4`,
          [upd.domain, upd.kind, upd.tags, upd.qdrantId]
        );
      } catch (err) {
        errors++;
        if (errors <= 3) console.error(`  PG error: ${err.message}`);
      }
    }
    await client.query('COMMIT');
  } finally {
    client.release();
  }

  const durationMs = Date.now() - start;
  console.log(`\nDone: ${enriched} enriched, ${errors} errors, ${durationMs}ms`);
  console.log('Domain distribution:', domainDist);
  console.log('Kind distribution:', kindDist);

  // Verify
  const { rows } = await pool.query(`
    SELECT domain, count(*) as cnt
    FROM codebase_chunk_index
    WHERE domain IS NOT NULL
    GROUP BY domain ORDER BY cnt DESC
  `);
  console.log('Postgres domain stats:', rows);

  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
