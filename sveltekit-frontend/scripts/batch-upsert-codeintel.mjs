#!/usr/bin/env node
/**
 * batch-upsert-codeintel.mjs — One-pass Qdrant → Postgres mirror sync.
 *
 * Scrolls codebase_chunks_768 in pages, extracts payload + vectors,
 * upserts into codebase_chunk_index with typed columns + JSONB metadata.
 *
 * Matches the codeintel.v1 protobuf schema for field naming.
 *
 * Usage:
 *   node scripts/batch-upsert-codeintel.mjs [--limit N] [--batch N] [--dry-run]
 *
 * Requires: pg (node-postgres), Qdrant running on 6333, Postgres on 5434.
 */

import pg from 'pg';
const { Pool } = pg;

const QDRANT_URL   = process.env.QDRANT_URL ?? 'http://localhost:6333';
const COLLECTION   = 'codebase_chunks_768';
const PG_URL       = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const BATCH_SIZE   = parseInt(process.argv.find(a => a.startsWith('--batch='))?.split('=')[1] ?? '100');
const LIMIT        = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] ?? '0');
const DRY_RUN      = process.argv.includes('--dry-run');

const pool = new Pool({ connectionString: PG_URL });

// ── Qdrant scroll ──────────────────────────────────────────────────────────

async function scrollQdrant(offset, limit) {
  const body = {
    limit,
    with_payload: true,
    with_vectors: false,  // skip vectors for speed; content_embedding comes from Qdrant search
    ...(offset ? { offset } : {}),
  };
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Qdrant scroll failed: ${res.status}`);
  const data = await res.json();
  return {
    points: data.result?.points ?? [],
    nextOffset: data.result?.next_page_offset ?? null,
  };
}

// ── Postgres upsert ────────────────────────────────────────────────────────

const UPSERT_SQL = `
INSERT INTO codebase_chunk_index (
  qdrant_id, relative_path, symbol, kind, domain, language, extension,
  gpu_cluster, som_cluster, page_rank_score, community_id,
  tags, semantic_tags, cluster_summary, neo4j_meta, metadata,
  content, indexed_at, updated_at
) VALUES (
  $1, $2, $3, $4, $5, $6, $7,
  $8, $9, $10, $11,
  $12::jsonb, $13::text[], $14::jsonb, $15::jsonb, $16::jsonb,
  $17, now(), now()
)
ON CONFLICT (qdrant_id) DO UPDATE SET
  relative_path = EXCLUDED.relative_path,
  symbol = EXCLUDED.symbol,
  kind = EXCLUDED.kind,
  domain = EXCLUDED.domain,
  language = EXCLUDED.language,
  extension = EXCLUDED.extension,
  gpu_cluster = EXCLUDED.gpu_cluster,
  som_cluster = EXCLUDED.som_cluster,
  page_rank_score = EXCLUDED.page_rank_score,
  community_id = EXCLUDED.community_id,
  tags = EXCLUDED.tags,
  semantic_tags = EXCLUDED.semantic_tags,
  cluster_summary = EXCLUDED.cluster_summary,
  neo4j_meta = EXCLUDED.neo4j_meta,
  metadata = EXCLUDED.metadata,
  content = EXCLUDED.content,
  updated_at = now()
`;

function extractParams(point) {
  const p = point.payload ?? {};
  const id = String(point.id);

  // Derive language/extension from file_path
  const filePath = p.file_path ?? p.relative_path ?? '';
  const ext = filePath.match(/(\.[^./]+)$/)?.[1] ?? null;
  const lang = ext === '.ts' ? 'typescript'
    : ext === '.js' ? 'javascript'
    : ext === '.svelte' ? 'svelte'
    : ext === '.mjs' ? 'javascript'
    : ext === '.mts' ? 'typescript'
    : null;

  // Tags: ensure array
  const rawTags = p.tags ?? [];
  const tags = Array.isArray(rawTags) ? rawTags : [rawTags];

  // Cluster summary: normalize to object
  const clusterSummary = typeof p.cluster_summary === 'object' && p.cluster_summary
    ? p.cluster_summary
    : {};

  // Neo4j metadata
  const neoMeta = {};
  for (const [k, v] of Object.entries(p)) {
    if (k.startsWith('neo4j_')) neoMeta[k.replace('neo4j_', '')] = v;
  }

  // Flexible metadata: everything not captured in typed columns
  const TYPED_KEYS = new Set([
    'file_path', 'relative_path', 'content', 'symbol', 'kind', 'domain',
    'extension', 'tags', 'gpu_cluster', 'som_cluster', 'page_rank_score',
    'community_id', 'cluster_summary', 'line_start', 'line_end',
  ]);
  const metadata = {};
  for (const [k, v] of Object.entries(p)) {
    if (!TYPED_KEYS.has(k) && !k.startsWith('neo4j_') && k !== 'content') {
      metadata[k] = v;
    }
  }

  return [
    id,                                           // $1 qdrant_id
    filePath,                                     // $2 relative_path
    p.symbol ?? null,                             // $3 symbol
    p.kind ?? null,                               // $4 kind
    p.domain ?? null,                             // $5 domain
    lang,                                         // $6 language
    ext,                                          // $7 extension
    p.gpu_cluster ?? null,                        // $8 gpu_cluster
    p.som_cluster ?? null,                        // $9 som_cluster
    p.page_rank_score ?? null,                    // $10 page_rank_score
    p.community_id ?? null,                       // $11 community_id
    JSON.stringify(tags),                          // $12 tags (jsonb)
    tags,                                          // $13 semantic_tags (text[])
    JSON.stringify(clusterSummary),                // $14 cluster_summary
    JSON.stringify(neoMeta),                       // $15 neo4j_meta
    JSON.stringify(metadata),                      // $16 metadata
    (p.content ?? '').slice(0, 50_000),            // $17 content (capped)
  ];
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Batch upsert: Qdrant → Postgres (batch=${BATCH_SIZE}, limit=${LIMIT || 'all'}, dry=${DRY_RUN})`);

  let offset = null;
  let total = 0;
  let upserted = 0;
  let errors = 0;
  const start = Date.now();

  do {
    const { points, nextOffset } = await scrollQdrant(offset, BATCH_SIZE);
    if (points.length === 0) break;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const point of points) {
        try {
          const params = extractParams(point);
          if (!DRY_RUN) {
            await client.query(UPSERT_SQL, params);
          }
          upserted++;
        } catch (err) {
          errors++;
          if (errors <= 3) console.error(`  Error on ${point.id}: ${err.message}`);
        }
      }
      if (!DRY_RUN) await client.query('COMMIT');
      else await client.query('ROLLBACK');
    } finally {
      client.release();
    }

    total += points.length;
    process.stdout.write(`\r  ${total} scrolled, ${upserted} upserted, ${errors} errors`);

    offset = nextOffset;
    if (LIMIT > 0 && total >= LIMIT) break;
  } while (offset);

  const durationMs = Date.now() - start;
  console.log(`\nDone: ${upserted} upserted, ${errors} errors, ${durationMs}ms`);

  // Verify
  if (!DRY_RUN) {
    const { rows } = await pool.query(`
      SELECT count(*) as total,
             count(gpu_cluster) as with_cluster,
             count(domain) as with_domain,
             count(NULLIF(semantic_tags, '{}')) as with_tags
      FROM codebase_chunk_index
    `);
    console.log('Postgres mirror stats:', rows[0]);
  }

  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });