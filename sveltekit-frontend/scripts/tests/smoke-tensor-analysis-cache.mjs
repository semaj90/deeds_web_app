/**
 * smoke-tensor-analysis-cache.mjs
 *
 * 5-check smoke test for the tensor topology pipeline:
 *   1. tensor_analysis_cache has rows (Postgres)
 *   2. Redis topo:byte:* keys exist (at least one)
 *   3. Qdrant codebase_chunks_768 points have topo_byte payload
 *   4. topo_byte distribution is valid (no byte > 255, no NaN)
 *   5. At least 3 distinct topo classes represented
 *
 * Usage:
 *   node scripts/tests/smoke-tensor-analysis-cache.mjs
 *   node scripts/tests/smoke-tensor-analysis-cache.mjs --strict  (require ≥1000 rows)
 */
import pg    from 'pg';
import Redis from 'ioredis';
import dotenv from 'dotenv';
dotenv.config();

const STRICT = process.argv.includes('--strict');
const STRICT_MIN_ROWS = 1000;

const DB_URL            = process.env.DATABASE_URL      ?? 'postgresql://legal_admin:123456@127.0.0.1:5432/legal_ai_db';
const REDIS_URL         = process.env.REDIS_URL         ?? 'redis://127.0.0.1:6379';
const QDRANT_URL        = process.env.QDRANT_URL        ?? 'http://127.0.0.1:6333';
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION ?? 'codebase_chunks_768';

let passed = 0, failed = 0;
function pass(msg) { console.log(`  ✓ ${msg}`); passed++; }
function fail(msg) { console.error(`  ✗ ${msg}`); failed++; }
function skip(msg) { console.log(`  ~ ${msg} (service unavailable)`); }

async function main() {
  console.log(`🩺 Tensor Analysis Cache Smoke Test${STRICT ? ' [strict]' : ''}`);

  const pool  = new pg.Pool({ connectionString: DB_URL, connectionTimeoutMillis: 3000 });
  const redis = new Redis(REDIS_URL, { lazyConnect: false, enableOfflineQueue: false, connectTimeout: 3000 }).on('error', () => {});

  // ── Check 1: Postgres row count ───────────────────────────────────────────
  try {
    const { rows: [{ count }] } = await pool.query(`SELECT count(*)::int FROM tensor_analysis_cache`);
    const minRows = STRICT ? STRICT_MIN_ROWS : 1;
    if (count >= minRows) {
      pass(`tensor_analysis_cache has ${count} rows${STRICT ? ` (≥${STRICT_MIN_ROWS})` : ''}`);
    } else {
      fail(`tensor_analysis_cache has only ${count} rows (need ≥${minRows}) — run npm run tensor:topology`);
    }

    // ── Check 2: topo_byte validity ─────────────────────────────────────────
    const { rows: byteCheck } = await pool.query(`
      SELECT count(*)::int AS bad FROM tensor_analysis_cache
      WHERE topo_byte IS NULL OR topo_byte < 0 OR topo_byte > 255
    `);
    if (byteCheck[0]?.bad === 0) pass('All topo_byte values are valid (0-255)');
    else fail(`${byteCheck[0]?.bad} rows have invalid topo_byte`);

    // ── Check 3: class diversity ────────────────────────────────────────────
    const { rows: classes } = await pool.query(`SELECT DISTINCT topo_class FROM tensor_analysis_cache`);
    const classCount = classes.filter(r => r.topo_class && r.topo_class !== 'unclassified').length;
    const minClasses = STRICT ? 5 : 3;
    if (classCount >= minClasses) pass(`${classCount} distinct topo classes (need ≥${minClasses})`);
    else fail(`Only ${classCount} distinct topo classes (need ≥${minClasses})`);

    // Print distribution
    const { rows: dist } = await pool.query(`
      SELECT topo_class, count(*)::int AS n FROM tensor_analysis_cache
      GROUP BY topo_class ORDER BY n DESC LIMIT 10
    `);
    console.log('\n  Distribution:');
    for (const { topo_class, n } of dist) console.log(`    ${(topo_class ?? 'null').padEnd(25)} ${n}`);
    console.log('');

  } catch (err) {
    if (err.message?.includes('does not exist')) {
      fail('tensor_analysis_cache table missing — run: psql $DATABASE_URL -f drizzle/manual/20260505_tensor_analysis_cache.sql');
    } else {
      skip(`Postgres unavailable: ${err.message}`);
    }
  }
  await pool.end().catch(() => {});

  // ── Check 4: Redis topo:byte keys ─────────────────────────────────────────
  try {
    const keys = await redis.keys('topo:byte:*');
    if (keys.length > 0) pass(`Redis has ${keys.length} topo:byte:* keys`);
    else fail('No Redis topo:byte:* keys — run npm run tensor:topology');
  } catch {
    skip('Redis unavailable');
  }
  redis.disconnect();

  // ── Check 5: Qdrant topo_byte payload presence ────────────────────────────
  try {
    const r = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 20, with_payload: ['topo_byte', 'topo_class'], with_vector: false }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    const pts = d.result?.points ?? [];
    const withTopo = pts.filter(p => p.payload?.topo_byte !== undefined);
    if (withTopo.length > 0) {
      pass(`${withTopo.length}/${pts.length} sampled Qdrant points have topo_byte payload`);
    } else {
      fail(`0/${pts.length} sampled Qdrant points have topo_byte — run npm run qdrant:patch-topology`);
    }
  } catch (err) {
    skip(`Qdrant unavailable: ${err.message}`);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const total = passed + failed;
  console.log(`\n${failed === 0 ? '✅' : '❌'} ${passed}/${total} checks passed`);
  if (failed > 0) process.exit(1);
}

main().catch(err => { console.error('Smoke test crashed:', err); process.exit(1); });
