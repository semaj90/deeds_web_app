#!/usr/bin/env node
/**
 * QDRANT-READER-FIX-02 bounded live canary. Calls the ACTUAL wired public
 * entry point (searchCodebaseAnn) exactly as application code would --
 * not a reimplementation of the pipeline. Read-only (search only, no
 * Qdrant/Postgres writes).
 */
import { loadAtlasEnv } from './load-atlas-env.mjs';
await loadAtlasEnv();

const { searchCodebaseAnn } = await import('../../src/lib/server/search/qdrant-search.js');

async function main() {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const { rows } = await pool.query(`
    SELECT id, qdrant_id, source_ref, relative_path
    FROM codebase_chunk_index
    WHERE qdrant_id IS NOT NULL AND qdrant_id ~ '^[0-9]+$'
    ORDER BY qdrant_id::bigint
    LIMIT 50
  `);

  const results: any[] = [];
  for (const row of rows) {
    const bRes = await fetch('http://127.0.0.1:6333/collections/codebase_chunks_768/points', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [row.id], with_payload: false, with_vector: true }),
    });
    const bPt = (await bRes.json()).result?.[0];
    if (!bPt) continue;
    const embedding = bPt.vector.content;

    // No `collection` argument -- exactly how a real caller invokes this
    // (searchCodebaseAnn(embedding, limit, topoClass) without a 4th arg).
    const hits = await searchCodebaseAnn(embedding, 5);

    results.push({
      source_ref: row.source_ref ?? row.relative_path,
      hitCount: hits.length,
      top1: hits[0] ? {
        stable_key: hits[0].stable_key,
        source_ref: hits[0].source_ref,
        contentLength: hits[0].content?.length ?? 0,
        semantic_score: hits[0].semantic_score,
        isSelfMatch: hits[0].stable_key === row.id,
      } : null,
      allHaveContent: hits.every((h: any) => h.content && h.content.length > 0),
    });
  }

  const report = {
    schema: 'atlas.qdrant-reader-fix-02-canary.v1',
    task: 'QDRANT-READER-FIX-02 bounded live canary',
    readOnly: true,
    writesPerformed: false,
    calledVia: 'searchCodebaseAnn() -- the actual wired public entry point, no collection arg (default path)',
    sampleSize: results.length,
    allHitsHaveContent: results.every((r) => r.allHaveContent),
    top1SelfMatchCount: results.filter((r) => r.top1?.isSelfMatch).length,
    zeroHitQueries: results.filter((r) => r.hitCount === 0).length,
    results,
  };

  console.log(JSON.stringify(report, null, 2));
  const fs = await import('node:fs');
  fs.writeFileSync(
    'C:/Users/james/Videos/deeds-web-app/docs/reports/qdrant-reader-fix-02-canary-results.json',
    JSON.stringify(report, null, 2) + '\n',
  );
  await pool.end();
  // Force clean exit -- the Qdrant client's underlying fetch keep-alive
  // agent (or similar) otherwise keeps this one-shot script's process
  // alive after all real work + the file write above have completed.
  process.exit(0);
}

main().catch((err) => { console.error('[FAIL]', err); process.exit(1); });
