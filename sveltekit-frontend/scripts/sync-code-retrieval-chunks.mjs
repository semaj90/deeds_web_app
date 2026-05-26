#!/usr/bin/env node
/**
 * Sync Qdrant codebase_chunks_768 → Postgres code_retrieval_chunks.
 *
 * Scrolls all points from Qdrant, upserts into Postgres with ON CONFLICT,
 * enriches topo_byte/topo_class from payload, and leaves embedding NULL
 * (populated separately by a pgvector backfill step if needed).
 *
 * Usage:
 *   node scripts/sync-code-retrieval-chunks.mjs
 *   node scripts/sync-code-retrieval-chunks.mjs --limit 1000
 *   node scripts/sync-code-retrieval-chunks.mjs --dry-run
 *
 * Env:
 *   DATABASE_URL  postgresql://...
 *   QDRANT_URL    http://localhost:6333
 */

import pg from 'pg';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({
  options: {
    limit:   { type: 'string',  default: '0' },
    'dry-run': { type: 'boolean', default: false },
    batch:   { type: 'string',  default: '100' },
    quiet:   { type: 'boolean', default: false },
  },
  allowPositionals: true,
});

const positionals = Array.isArray(args._) ? args._ : [];
const DRY_RUN = args['dry-run'];
const HARD_LIMIT = parseInt(args.limit || positionals[0] || '0', 10) || 0;
const BATCH_SIZE = parseInt(args.batch || positionals[1] || '100', 10) || 100;
const QUIET = args.quiet;

const PG_URL     = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@localhost:5434/legal_ai_db';
const QDRANT_URL = process.env.QDRANT_URL   ?? 'http://localhost:6333';
const COLLECTION = 'codebase_chunks_768';

const pool = new pg.Pool({ connectionString: PG_URL, max: 5 });

// ── Qdrant scroll helper ──────────────────────────────────────────────────────

async function* scrollQdrant(collection, batchSize = 100) {
  let offset = null;
  let fetched = 0;

  while (true) {
    const body = {
      limit: batchSize,
      with_payload: true,
      with_vector: ['content'],
    };
    if (offset !== null) body.offset = offset;

    const res = await fetch(`${QDRANT_URL}/collections/${collection}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Qdrant scroll ${res.status}: ${await res.text()}`);
    const data = await res.json();

    const points = data.result?.points ?? [];
    if (!points.length) break;

    yield points;
    fetched += points.length;

    offset = data.result?.next_page_offset ?? null;
    if (!offset) break;
    if (HARD_LIMIT > 0 && fetched >= HARD_LIMIT) break;
  }
}

function toPgVector(value) {
  if (!Array.isArray(value)) return null;
  if (value.length !== 768) return null;
  return `[${value.map((item) => Number(item)).join(',')}]`;
}

// ── Postgres upsert ───────────────────────────────────────────────────────────

async function upsertBatch(client, points) {
  if (points.length === 0) return;
  const valueBlocks = [];
  const queryParams = [];
  let paramIndex = 1;

  for (const p of points) {
    const pl = p.payload ?? {};
    const manifold4 = Array.isArray(pl.manifold4) ? pl.manifold4 : [];
    // stable_key: prefer explicit field, then build from relativePath + symbol, then fall back to qdrant id
    const relPath = pl.relativePath ?? pl.path ?? '';
    const sym     = pl.symbol ?? '';
    const stableKey = String(
      pl.stable_key ?? pl.chunk_id ??
      (relPath ? `file:${relPath}${sym ? `:${sym}` : ''}` : `qdrant:${p.id}`)
    );

    const filePath   = String(pl.file_path ?? pl.path ?? pl.relativePath ?? '');
    const symbolName = pl.symbol ?? pl.symbol_name ?? null;
    const symbolKind = pl.kind   ?? pl.symbol_kind  ?? null;
    const language   = pl.language ?? null;

    // Detect language from path extension if not set
    const langFromExt = language ?? (filePath.match(/\.(\w+)$/)?.[1] ?? null);

    const tagsArr = Array.isArray(pl.tags) ? pl.tags : (pl.tags ? [pl.tags] : []);
    const tagsStr = tagsArr.join(' ');

    // error_terms: extract from pipeline_tags or tags that contain error-like tokens
    const errorTerms = (Array.isArray(pl.pipeline_tags) ? pl.pipeline_tags : [])
      .filter(t => /error|err|fail|exception|warn/i.test(String(t)))
      .join(' ');

    const contentVec = p.vector?.content ?? p.vector?.default ?? (Array.isArray(p.vector) ? p.vector : null);
    const embeddingStr = toPgVector(contentVec);

    const rowParams = [
      stableKey,                                             // stable_key
      `qdrant:${p.id}`,                                      // qdrant_id
      filePath,                                              // file_path
      symbolName ? String(symbolName) : null,                // symbol_name
      symbolKind ? String(symbolKind) : null,                // symbol_kind
      langFromExt ? String(langFromExt) : null,              // language
      String(pl.content ?? pl.text ?? pl.chunk_text ?? ''),  // content
      tagsStr,                                               // tags
      errorTerms,                                            // error_terms
      '',                                                    // tool_terms
      pl.topo_byte  != null ? Number(pl.topo_byte)  : null,  // topo_byte
      pl.topo_hex   ? String(pl.topo_hex)   : null,          // topo_hex
      pl.topo_class ? String(pl.topo_class) : null,          // topo_class
      manifold4[0]  != null ? Number(manifold4[0])  : null,  // manifold4_x
      manifold4[1]  != null ? Number(manifold4[1])  : null,  // manifold4_y
      manifold4[2]  != null ? Number(manifold4[2])  : null,  // manifold4_z
      manifold4[3]  != null ? Number(manifold4[3])  : null,  // manifold4_w
      Number(pl.graphAuthorityScore ?? pl.graph_authority_score ?? 0), // graph_authority_score
      JSON.stringify(pl),                                    // metadata
      embeddingStr,                                          // embedding
    ];

    const placeholders = [];
    for (let i = 0; i < rowParams.length; i++) {
      placeholders.push(`$${paramIndex++}`);
    }
    valueBlocks.push(`(${placeholders.join(', ')})`);
    queryParams.push(...rowParams);
  }

  const sql = `
    INSERT INTO code_retrieval_chunks (
      stable_key, qdrant_id, file_path, symbol_name, symbol_kind, language,
      content, tags, error_terms, tool_terms,
      topo_byte, topo_hex, topo_class,
      manifold4_x, manifold4_y, manifold4_z, manifold4_w,
      graph_authority_score, metadata, embedding
    ) VALUES ${valueBlocks.join(', ')}
    ON CONFLICT (stable_key) DO UPDATE SET
      qdrant_id              = EXCLUDED.qdrant_id,
      file_path              = EXCLUDED.file_path,
      symbol_name            = EXCLUDED.symbol_name,
      symbol_kind            = EXCLUDED.symbol_kind,
      language               = EXCLUDED.language,
      content                = EXCLUDED.content,
      tags                   = EXCLUDED.tags,
      error_terms            = EXCLUDED.error_terms,
      tool_terms             = EXCLUDED.tool_terms,
      topo_byte              = EXCLUDED.topo_byte,
      topo_hex               = EXCLUDED.topo_hex,
      topo_class             = EXCLUDED.topo_class,
      manifold4_x            = EXCLUDED.manifold4_x,
      manifold4_y            = EXCLUDED.manifold4_y,
      manifold4_z            = EXCLUDED.manifold4_z,
      manifold4_w            = EXCLUDED.manifold4_w,
      graph_authority_score  = EXCLUDED.graph_authority_score,
      metadata               = EXCLUDED.metadata,
      embedding              = EXCLUDED.embedding,
      updated_at             = now()
  `;

  await client.query(sql, queryParams);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!QUIET) console.log(`🔄 Syncing ${COLLECTION} → code_retrieval_chunks${DRY_RUN ? ' [DRY RUN]' : ''}`);

  let total = 0;
  let skipped = 0;
  const t0 = Date.now();

  // Verify Qdrant is reachable
  try {
    const r = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`);
    if (!r.ok) throw new Error(`Collection not found (${r.status})`);
  } catch (err) {
    console.error(`❌ Qdrant unreachable: ${err.message}`);
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    for await (const points of scrollQdrant(COLLECTION, BATCH_SIZE)) {
      if (DRY_RUN) {
        if (!QUIET) console.log(`  [dry-run] Would upsert ${points.length} rows`);
        total += points.length;
        if (HARD_LIMIT > 0 && total >= HARD_LIMIT) break;
        continue;
      }

      // Filter out points with no stable content
      const valid = points.filter((p) => {
        const pl = p.payload ?? {};
        return (pl.content || pl.text || pl.chunk_text);
      });
      skipped += points.length - valid.length;

      await upsertBatch(client, valid);
      total += valid.length;

      if (!QUIET) process.stdout.write(`\r  ✅ ${total} rows upserted...`);
      if (HARD_LIMIT > 0 && total >= HARD_LIMIT) break;
    }
  } finally {
    client.release();
    await pool.end();
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  if (!QUIET) {
    console.log(`\n✅ Done: ${total} rows upserted, ${skipped} skipped (${elapsed}s)`);
  } else {
    console.log(`sync:done total=${total} skipped=${skipped} elapsed=${elapsed}s`);
  }
}

main().catch((err) => { console.error('Fatal:', err); process.exit(1); });
