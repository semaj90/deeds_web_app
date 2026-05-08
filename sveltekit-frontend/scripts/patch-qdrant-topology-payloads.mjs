/**
 * patch-qdrant-topology-payloads.mjs
 *
 * Reads tensor_analysis_cache from Postgres and patches every matching
 * Qdrant point in codebase_chunks_768 with:
 *   topo_byte, topo_hex, topo_class, manifold4, graphAuthorityScore
 *   som_cluster, gpu_cluster   ← added: from codebase_chunk_index
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
const DB_URL            = process.env.DATABASE_URL      ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

async function main() {
  console.log(`📦 Patch Qdrant topology + cluster payloads${DRY_RUN ? ' [DRY RUN]' : ''} (limit ${LIMIT})`);

  const pool = new pg.Pool({ connectionString: DB_URL });

  // ── 1. Topology fields from tensor_analysis_cache ────────────────────────────

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

  /** @type {Map<string, Record<string,unknown>>} */
  const payloadByStableKey = new Map();
  /** @type {Map<string, Record<string,unknown>>} */
  const payloadByQdrantId  = new Map();

  for (const r of cacheRows) {
    const p = {
      topo_byte:           r.topo_byte,
      topo_hex:            r.topo_hex,
      topo_class:          r.topo_class,
      manifold4:           [r.manifold4_x, r.manifold4_y, r.manifold4_z, r.manifold4_w],
      graphAuthorityScore: r.graph_authority_score,
    };
    if (r.stable_key.startsWith('qdrant:')) {
      payloadByQdrantId.set(r.stable_key.slice(7), p);
    } else {
      payloadByStableKey.set(r.stable_key, p);
    }
  }

  console.log(`  Topology: ${cacheRows.length} cache entries (${payloadByStableKey.size} by stableKey, ${payloadByQdrantId.size} by qdrantId)`);

  // ── 2. Cluster fields from codebase_chunk_index ───────────────────────────────
  // Maps Qdrant numeric point ID → { som_cluster, gpu_cluster }

  const { rows: clusterRows } = await pool.query(
    `SELECT cci.qdrant_id, cci.gpu_cluster, cci.som_cluster, cci.som_bmu_row, cci.som_bmu_col,
            tac.topo_class
     FROM codebase_chunk_index cci
     LEFT JOIN tensor_analysis_cache tac ON tac.stable_key = cci.relative_path
     WHERE cci.qdrant_id IS NOT NULL
       AND (cci.gpu_cluster IS NOT NULL OR cci.som_cluster IS NOT NULL)
     LIMIT $1`,
    [LIMIT]
  ).catch(() => ({ rows: [] }));

  /** @type {Map<string, {som_cluster:number|null, gpu_cluster:number|null, som_bmu_row:number|null, som_bmu_col:number|null, glyph_cluster:string}>} */
  const clusterByQdrantId = new Map();
  for (const r of clusterRows) {
    // glyph_cluster: deterministic label used by the glyph_cluster retrieval lane.
    // Format: "<topo_class>:<som_cluster>" — both sourced from codebase_chunk_index.
    // Populated here so the lane has payload backing without needing a live GPU run.
    const glyphCluster = `${r.topo_class ?? 'unknown'}:${r.som_cluster ?? 'na'}`;
    clusterByQdrantId.set(String(r.qdrant_id), {
      som_cluster:   r.som_cluster,
      gpu_cluster:   r.gpu_cluster,
      som_bmu_row:   r.som_bmu_row,
      som_bmu_col:   r.som_bmu_col,
      glyph_cluster: glyphCluster,
    });
  }

  console.log(`  Clusters: ${clusterRows.length} rows with gpu_cluster / som_cluster / glyph_cluster`);

  // ── 3. Scroll Qdrant and patch matching points ────────────────────────────────

  let offset = null;
  let patched = 0, missed = 0, clusterPatched = 0;

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
      .map(pt => {
        const ptId = String(pt.id);
        const byKey = payloadByStableKey.get(pt.payload?.stable_key);
        const byId  = payloadByQdrantId.get(ptId);
        const topoPayload = byKey ?? byId ?? null;

        const clusterPayload = clusterByQdrantId.get(ptId) ?? null;

        if (!topoPayload && !clusterPayload) return null;

        const merged = { ...(topoPayload ?? {}), ...(clusterPayload ?? {}) };

        // Derive glyph_cluster from topo_class + som_cluster (deterministic label)
        const topoClass   = merged.topo_class   ?? null;
        const somCluster  = merged.som_cluster   ?? null;
        if (topoClass !== null || somCluster !== null) {
          merged.glyph_cluster = `${topoClass ?? 'unknown'}:${somCluster ?? 'na'}`;
        }

        // Strip nulls — don't overwrite existing payload with null
        for (const k of Object.keys(merged)) {
          if (merged[k] === null || merged[k] === undefined) delete merged[k];
        }

        if (clusterPayload) clusterPatched++;
        return { id: pt.id, payload: merged };
      })
      .filter(Boolean);

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
    process.stdout.write(`\r  Patched: ${patched}  Missed: ${missed}  (${clusterPatched} with cluster)    `);

    offset = d.result?.next_page_offset ?? null;
    if (!offset || pts.length < BATCH) break;
  }

  console.log(`\n\n✅ Done — patched ${patched} points${DRY_RUN ? ' (dry — no writes)' : ''}, ${missed} had no cache entry`);
  console.log(`   ${clusterPatched} points received som_cluster/gpu_cluster/glyph_cluster fields`);
  await pool.end();
}

main().catch(err => { console.error('\n❌ Patch failed:', err); process.exit(1); });
