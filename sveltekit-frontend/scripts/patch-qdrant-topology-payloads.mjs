/**
 * patch-qdrant-topology-payloads.mjs
 *
 * Reads tensor_analysis_cache from Postgres and patches every matching
 * Qdrant point in codebase_chunks_768 with:
 *   topo_byte, topo_hex, topo_class, manifold4, graphAuthorityScore
 *
 * Usage:
 *   node scripts/patch-qdrant-topology-payloads.mjs
 *   node scripts/patch-qdrant-topology-payloads.mjs --dry-run
 *   node scripts/patch-qdrant-topology-payloads.mjs --dry-run --limit=500
 */
import pg    from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const DRY_RUN   = process.argv.includes('--dry-run');
const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit'));
const LIMIT     = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1] ?? '10000') : 10_000;
const BATCH     = 200;

const QDRANT_URL        = process.env.QDRANT_URL        ?? 'http://127.0.0.1:6333';
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION ?? 'codebase_chunks_768';
const DB_URL            = process.env.DATABASE_URL      ?? 'postgresql://legal_admin:123456@127.0.0.1:5432/legal_ai_db';

async function main() {
  console.log(`📦 Patch Qdrant topology payloads${DRY_RUN ? ' [DRY RUN]' : ''} (limit ${LIMIT})`);

  const pool = new pg.Pool({ connectionString: DB_URL });

  // 1. Load from tensor_analysis_cache
  const { rows: cacheRows } = await pool.query(
    `SELECT stable_key, topo_byte, topo_hex, topo_class,
            manifold4_x, manifold4_y, manifold4_z, manifold4_w,
            graph_authority_score
     FROM tensor_analysis_cache
     ORDER BY updated_at DESC
     LIMIT $1`,
    [LIMIT]
  ).catch(() => ({ rows: [] }));

  if (!cacheRows.length) {
    console.log('  ⚠ tensor_analysis_cache is empty — run npm run tensor:topology first');
    await pool.end();
    return;
  }

  // stableKey → payload map
  /** @type {Map<string, Record<string,unknown>>} */
  const payloadMap = new Map(cacheRows.map(r => [r.stable_key, {
    topo_byte:            r.topo_byte,
    topo_hex:             r.topo_hex,
    topo_class:           r.topo_class,
    manifold4:            [r.manifold4_x, r.manifold4_y, r.manifold4_z, r.manifold4_w],
    graphAuthorityScore:  r.graph_authority_score,
  }]));

  console.log(`  Loaded ${payloadMap.size} cache entries`);

  // 2. Scroll Qdrant and patch matching points
  let offset = null;
  let patched = 0, missed = 0;

  while (patched + missed < LIMIT) {
    const r = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: BATCH, with_payload: ['stable_key'], with_vector: false, ...(offset ? { offset } : {}) }),
    });
    if (!r.ok) break;
    const d = await r.json();
    const pts = d.result?.points ?? [];
    if (!pts.length) break;

    const patches = pts
      .filter(pt => payloadMap.has(pt.payload?.stable_key))
      .map(pt => ({ id: pt.id, payload: payloadMap.get(pt.payload.stable_key) }));

    missed += pts.length - patches.length;

    if (!DRY_RUN && patches.length > 0) {
      await Promise.all(patches.map(p =>
        fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/payload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payload: p.payload, points: [p.id] }),
        }).catch(() => {})
      ));
    }

    patched += patches.length;
    process.stdout.write(`\r  Patched: ${patched}  Missed: ${missed}    `);

    offset = d.result?.next_page_offset ?? null;
    if (!offset || pts.length < BATCH) break;
  }

  console.log(`\n\n✅ Done — patched ${patched} points${DRY_RUN ? ' (dry — no writes)' : ''}, ${missed} had no cache entry`);
  await pool.end();
}

main().catch(err => { console.error('\n❌ Patch failed:', err); process.exit(1); });
