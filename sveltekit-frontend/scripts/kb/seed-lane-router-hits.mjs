#!/usr/bin/env node
/**
 * seed-lane-router-hits.mjs
 *
 * Synthetic hit seeder for lane router training.
 * INSERTs realistic chunk_hit_log rows (with non-NULL rerank_score) so the
 * full training pipeline can be tested without waiting for organic ACE traffic.
 *
 * Uses real file paths discovered from the Qdrant codebase_chunks_768 collection
 * (or falls back to a hardcoded path list when Qdrant is unavailable).
 *
 * The rerank_score distribution is modeled realistically:
 *   - Files matching the dominant lane for their topo class → score 0.55-0.90
 *   - Other files → score 0.20-0.55
 *
 * All inserted rows have a synthetic chunk_id prefixed with "seed_" so they
 * can be trivially cleaned up with:
 *   DELETE FROM chunk_hit_log WHERE chunk_id LIKE 'seed_%'
 *
 * Usage:
 *   node scripts/kb/seed-lane-router-hits.mjs                     # insert 200 rows
 *   node scripts/kb/seed-lane-router-hits.mjs --count 500
 *   node scripts/kb/seed-lane-router-hits.mjs --dry-run           # preview only
 *   node scripts/kb/seed-lane-router-hits.mjs --clean             # DELETE seed rows
 */

import pg       from 'pg';
import Redis    from 'ioredis';
import path     from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir  = path.dirname(fileURLToPath(import.meta.url));
const ROOT   = path.resolve(__dir, '../..');

const argv    = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const CLEAN   = argv.includes('--clean');
const COUNT_I = argv.indexOf('--count');
const COUNT   = COUNT_I >= 0 ? Number(argv[COUNT_I + 1]) : 200;

const DB_URL    = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const REDIS_URL = process.env.REDIS_URL    ?? 'redis://localhost:6379';

// ── Topo label → preferred pipeline mapping ───────────────────────────────────
// Mirrors the expected ground truth the router should learn.
const TOPO_PIPELINE_MAP = {
  'trace-retrieval':   { preferred: 'ace',      others: ['rag', 'kag'] },
  'database-schema':   { preferred: 'kag',      others: ['ace', 'rag'] },
  'api-route':         { preferred: 'ace',      others: ['rag', 'codebase'] },
  'ui-component':      { preferred: 'codebase', others: ['ace', 'rag'] },
  'legal-evidence':    { preferred: 'rag',      others: ['ace', 'kag'] },
  'graph-gpu-topology':{ preferred: 'ace',      others: ['kag', 'rag'] },
  'test-audit-devtool':{ preferred: 'codebase', others: ['ace', 'rag'] },
  'unclassified':      { preferred: 'rag',      others: ['ace', 'kag', 'codebase'] },
};

// ── Representative file paths covering all topo classes ───────────────────────
const SEED_PATHS = [
  // trace-retrieval
  'src/lib/server/ace/context-assembler.ts',
  'src/lib/server/ace/types.ts',
  'src/lib/server/vector/qdrant-manager.ts',
  'src/lib/server/rag-pipeline.ts',
  'src/lib/server/indexer/legal-chunker.ts',
  'src/lib/server/retrieval/karpathy-blend.ts',
  'src/lib/server/ace/topo-candidate-cache.ts',
  'src/lib/server/embeddings/embedding-client.ts',
  // database-schema
  'src/lib/server/db/schema-postgres.ts',
  'src/lib/server/db/client.ts',
  'drizzle/0013_codeintel_indexes.sql',
  'src/lib/server/db/migrations/0001_init.sql',
  // api-route
  'src/routes/api/embed/+server.ts',
  'src/routes/api/cases/+server.ts',
  'src/routes/api/evidence/+server.ts',
  'src/routes/api/analytics/chunk-hits/+server.ts',
  'src/routes/api/health/+server.ts',
  // ui-component
  'src/routes/(app)/cases/+page.svelte',
  'src/lib/components/ui/Button.svelte',
  'src/lib/components/evidence/EvidenceUpload.svelte',
  'src/routes/(app)/dashboard/+page.svelte',
  // legal-evidence
  'src/lib/server/analysis/entity-extraction.ts',
  'src/lib/server/analysis/forensics.ts',
  'src/lib/server/legal/statute-linker.ts',
  // graph-gpu-topology
  'src/lib/server/graph/community-graph.ts',
  'src/lib/server/tensor/topology-byte-mapper.ts',
  'src/lib/server/graph/hypergraph-4d.ts',
  'simd-bridge/cpp/libtorch_graph.cc',
  'scripts/atlas/karpathy-gpu-enrich.mjs',
  // test-audit-devtool
  'tests/retrieval-lanes.spec.ts',
  'tests/e2e/upload-button-diagnostic.spec.ts',
  'scripts/kb/eval-lane-router-policy.mjs',
  // unclassified
  'README.md',
  'CLAUDE.md',
  'atlas.config.json',
];

// ── topoLabelFromPath (mirrors topology-byte-mapper.ts and train-lane-router.mjs) ──
function topoLabelFromPath(p) {
  if (!p) return 'unclassified';
  const lp = p.toLowerCase();
  if (/\/(tests?|spec|__tests?__|e2e|playwright|vitest|scripts\/)/.test(lp)) return 'test-audit-devtool';
  if (/\/(scripts?|tools?|devtools?|audit)\//.test(lp))                       return 'test-audit-devtool';
  if (/\/(db|schema|drizzle|migrations?)\//.test(lp))                         return 'database-schema';
  if (/schema[-_]postgres|schema[-_]sqlite/.test(lp))                         return 'database-schema';
  if (/\/(graph|hypergraph|tensor|topology|som|neo4j|gds)\//.test(lp))        return 'graph-gpu-topology';
  if (/gpu|libtorch|tensorrt|cuda|simd/.test(lp))                             return 'graph-gpu-topology';
  if (/\/(ace|rag|kag|retrieval|indexer|vector|qdrant|embeddings?)\//.test(lp)) return 'trace-retrieval';
  if (/\/routes\/api\//.test(lp) || /\+server\.ts$/.test(lp))                return 'api-route';
  if (/\/(evidence|legal|citations?|statutes?|documents?|cases?)\//.test(lp)) return 'legal-evidence';
  if (/\/(components?|routes\/\(app\)|svelte)/.test(lp) && /\.svelte$/.test(lp)) return 'ui-component';
  if (/\/routes\/\(app\)\//.test(lp))                                         return 'ui-component';
  return 'unclassified';
}

// ── Random helpers ────────────────────────────────────────────────────────────
function rand(min, max) { return Math.random() * (max - min) + min; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function uid() { return Math.random().toString(36).slice(2, 10); }

// ── Build synthetic hit rows ──────────────────────────────────────────────────
function buildRows(count) {
  const rows = [];
  for (let i = 0; i < count; i++) {
    const p       = pick(SEED_PATHS);
    const topo    = topoLabelFromPath(p);
    const mapping = TOPO_PIPELINE_MAP[topo] ?? TOPO_PIPELINE_MAP.unclassified;

    // 70% chance the preferred lane was used (simulate majority of good hits)
    const usePreferred = Math.random() < 0.70;
    const pipeline     = usePreferred ? mapping.preferred : pick(mapping.others);
    const isPreferred  = pipeline === mapping.preferred;

    // Score distribution: preferred lanes get higher rerank on average
    const rawScore    = rand(0.3, 0.75);
    const rerankScore = isPreferred
      ? rand(0.55, 0.92)  // preferred lane → high rerank
      : rand(0.15, 0.58); // other lanes → lower rerank

    // Cluster assignments (sparse — most rows don't have GPU cluster data yet)
    const gpuCluster = Math.random() < 0.3 ? Math.floor(rand(0, 20)) : null;
    const somCluster = Math.random() < 0.2 ? Math.floor(rand(0, 25)) : null;

    // Scatter hit_at timestamps over the past 48h for realism
    const hitAt = new Date(Date.now() - rand(0, 48 * 3600 * 1000)).toISOString();

    rows.push({
      chunk_id:      `seed_${uid()}`,
      relative_path: p,
      pipeline,
      gpu_cluster:   gpuCluster,
      som_cluster:   somCluster,
      score:         rawScore,
      rerank_score:  rerankScore,
      trust_tier:    'T3',
      hit_at:        hitAt,
    });
  }
  return rows;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const pool = new pg.Pool({ connectionString: DB_URL, max: 2, idleTimeoutMillis: 5000 });

  // Handle --clean mode
  if (CLEAN) {
    console.log('[seed-hits] Deleting seed rows (chunk_id LIKE \'seed_%\')...');
    if (!DRY_RUN) {
      const { rowCount } = await pool.query(`DELETE FROM chunk_hit_log WHERE chunk_id LIKE 'seed_%'`);
      console.log(`[seed-hits] ✅ Deleted ${rowCount} seed rows`);
    } else {
      const { rows: [{ n }] } = await pool.query(`SELECT COUNT(*)::int AS n FROM chunk_hit_log WHERE chunk_id LIKE 'seed_%'`);
      console.log(`[seed-hits] DRY: would delete ${n} seed rows`);
    }
    await pool.end();
    return;
  }

  // Build and preview rows
  const rows = buildRows(COUNT);
  console.log(`[seed-hits] Generated ${rows.length} synthetic hit rows`);

  // Topo distribution summary
  const byTopo = {};
  for (const r of rows) {
    const t = topoLabelFromPath(r.relative_path);
    if (!byTopo[t]) byTopo[t] = { count: 0, avgRerank: 0 };
    byTopo[t].count++;
    byTopo[t].avgRerank += r.rerank_score;
  }
  console.log('\n[seed-hits] Topo label distribution:');
  for (const [label, s] of Object.entries(byTopo).sort((a, b) => b[1].count - a[1].count)) {
    console.log(`  ${label.padEnd(22)} ${String(s.count).padStart(3)} rows  avg_rerank=${( s.avgRerank / s.count).toFixed(3)}`);
  }
  console.log('');

  if (DRY_RUN) {
    console.log('[seed-hits] DRY RUN — no rows inserted');
    console.log('[seed-hits] Sample row:', JSON.stringify(rows[0], null, 2));
    await pool.end();
    return;
  }

  // Batch INSERT in chunks of 50 to avoid hitting parameter limits
  const BATCH = 50;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const values = batch.map((_, j) => {
      const base = j * 10;
      return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},$${base+7},$${base+8})`;
    }).join(',');
    const params = batch.flatMap(r => [
      r.chunk_id, r.relative_path, r.pipeline,
      r.gpu_cluster, r.som_cluster,
      r.score, r.rerank_score, r.hit_at,
    ]);
    await pool.query(
      `INSERT INTO chunk_hit_log
         (chunk_id, relative_path, pipeline, gpu_cluster, som_cluster, score, rerank_score, hit_at)
       VALUES ${values}
       ON CONFLICT DO NOTHING`,
      params
    );
    inserted += batch.length;
    process.stdout.write(`\r[seed-hits] Inserted ${inserted}/${rows.length}  `);
  }
  console.log(`\n[seed-hits] ✅ Done — inserted ${inserted} synthetic rows`);
  console.log(`[seed-hits] Next: npm run kb:lane-router:full`);
  console.log(`[seed-hits] Clean up: node scripts/kb/seed-lane-router-hits.mjs --clean`);

  await pool.end();
}

main().catch(err => {
  console.error('[seed-hits]', err.message);
  process.exit(1);
});