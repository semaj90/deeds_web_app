#!/usr/bin/env node
/**
 * QDRANT-READER-SHADOW-02 -- measures the COMPLETE candidate contract
 * (Qdrant _768_v2 ANN -> ProjectionCandidateV1 -> Postgres hydration ->
 * HydratedCandidateV1), not just ANN ranking quality (that was
 * QDRANT-READER-SHADOW-01).
 *
 * Read-only. Does not touch the production reader (qdrant-search.ts is
 * untouched). Uses the real app modules (projection-candidate-v1.ts,
 * hydrate-canonical-candidates.ts) via tsx from sveltekit-frontend/ so
 * $lib aliases resolve.
 *
 * Usage: npx tsx scripts/atlas/qdrant-reader-shadow-02.mts
 */
import { loadAtlasEnv } from './load-atlas-env.mjs';
await loadAtlasEnv();

const { mapQdrantProjectionCandidate } = await import('../../src/lib/server/search/projection-candidate-v1.js');
const { hydrateCanonicalCandidates } = await import('../../src/lib/server/search/hydrate-canonical-candidates.js');

const QDRANT_URL = (process.env.QDRANT_URL ?? 'http://127.0.0.1:6333').replace(/^0\.0\.0\.0/, '127.0.0.1');
const COLLECTION_D = 'codebase_chunks_768_v2';
const COLLECTION_A = 'codebase_chunks_768';

async function main() {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  // Reuse the same frozen query set as QDRANT-READER-SHADOW-01: 50 already
  // proven-correct generation-B vectors, no new embedding calls.
  const { rows: pgRows } = await pool.query(`
    SELECT id, qdrant_id, source_ref, relative_path
    FROM codebase_chunk_index
    WHERE qdrant_id IS NOT NULL AND qdrant_id ~ '^[0-9]+$'
    ORDER BY qdrant_id::bigint
    LIMIT 50
  `);

  let qdrantLatencyTotalMs = 0;
  let postgresLatencyTotalMs = 0;
  const perQuery: any[] = [];
  let top1SelfMatch = 0;
  let hydrationSuccessCount = 0;
  let contentNonEmptyCount = 0;
  let contentHashExactCount = 0;
  let canonicalIdentityExactCount = 0;
  let missingContentCount = 0;
  let ambiguousHydrationCount = 0;
  let revisionMismatchCount = 0;
  let legacyC1Count = 0;
  let executed = 0;

  for (const row of pgRows) {
    // Fetch B's vector as the frozen query vector.
    const bRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION_A}/points`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [row.id], with_payload: false, with_vector: true }),
    });
    const bPt = (await bRes.json()).result?.[0];
    if (!bPt) continue;
    const queryVec = bPt.vector.content;

    executed++;
    const qStart = performance.now();
    const searchRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION_D}/points/search`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vector: { name: 'content', vector: queryVec }, limit: 5, with_payload: true }),
    });
    const qElapsed = performance.now() - qStart;
    qdrantLatencyTotalMs += qElapsed;

    const points = (await searchRes.json()).result ?? [];
    const candidates = points.map((p: any) => mapQdrantProjectionCandidate(p));

    const pStart = performance.now();
    const { hydrated, failures } = await hydrateCanonicalCandidates(candidates);
    const pElapsed = performance.now() - pStart;
    postgresLatencyTotalMs += pElapsed;

    const top1 = hydrated[0];
    const isTop1SelfMatch = top1 && top1.canonicalId === row.id;
    if (isTop1SelfMatch) top1SelfMatch++;

    if (hydrated.length > 0) hydrationSuccessCount++;
    for (const h of hydrated) {
      if (h.content && h.content.length > 0) contentNonEmptyCount++;
      else missingContentCount++;
      if (h.contentHash && h.projectionCandidate.contentHash && h.contentHash === h.projectionCandidate.contentHash) {
        contentHashExactCount++;
      }
      if (h.canonicalId) canonicalIdentityExactCount++;
    }
    for (const f of failures) {
      if (f.reason === 'CONTENT_HASH_MISMATCH') revisionMismatchCount++;
      if (f.reason === 'CANONICAL_ROW_NOT_FOUND') ambiguousHydrationCount++;
    }

    perQuery.push({
      source_ref: row.source_ref ?? row.relative_path,
      top1SelfMatch: !!isTop1SelfMatch,
      hydratedCount: hydrated.length,
      failureCount: failures.length,
      failures,
      qdrantLatencyMs: Math.round(qElapsed),
      postgresLatencyMs: Math.round(pElapsed),
    });
  }

  const report = {
    schema: 'atlas.qdrant-reader-shadow-02.v1',
    task: 'QDRANT-READER-SHADOW-02',
    readOnly: true,
    writesPerformed: false,
    productionReaderTouched: false,
    executed,
    results: {
      top1SelfMatch: `${top1SelfMatch}/${executed}`,
      hydrationSuccess: `${hydrationSuccessCount}/${executed}`,
      contentNonEmptyCount,
      contentHashExactCount,
      canonicalIdentityExactCount,
      missingContentCount,
      ambiguousHydrationCount,
      revisionMismatchCount,
      legacyC1Count,
    },
    latency: {
      avgQdrantLatencyMs: Math.round(qdrantLatencyTotalMs / executed),
      avgPostgresHydrationLatencyMs: Math.round(postgresLatencyTotalMs / executed),
      avgTotalLatencyMs: Math.round((qdrantLatencyTotalMs + postgresLatencyTotalMs) / executed),
      note: 'Postgres hydration adds one relational read per query (batched, not N+1). Not optimized/cached yet per instruction -- benchmark first, cache only if this materially hurts latency.',
    },
    perQuery,
  };

  console.log(JSON.stringify(report, null, 2));
  const fs = await import('node:fs');
  fs.writeFileSync(
    'C:/Users/james/Videos/deeds-web-app/docs/reports/qdrant-reader-shadow-02-results.json',
    JSON.stringify(report, null, 2) + '\n',
  );
  await pool.end();
}

main().catch((err) => { console.error('[FAIL]', err); process.exit(1); });
