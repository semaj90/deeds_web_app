/**
 * run-tensor-topology-mapreduce.mjs
 *
 * Map stage of the tensor topology pipeline (plain-JS, no TS compilation):
 *   1. Scroll Qdrant codebase_chunks_768 for stableKey + filePath
 *   2. Classify topo_byte for each uncached/changed file via classifyPath()
 *   3. Build tensor_analysis_cache row (Postgres upsert)
 *   4. Patch Qdrant payload: topo_byte, topo_hex, topo_class
 *   5. Write Redis quick-cache keys topo:byte:{stableKey}
 *
 * GPU mode (default when tensorrt_bridge.node is loadable):
 *   Fetches real embeddings from Qdrant and runs CUDA pcaProject → manifold4.
 *
 * Topo-only mode (fallback / --dry-run):
 *   Classifies topo_byte from file path alone. manifold4 is [0,0,0,0].
 *
 * Usage:
 *   node scripts/run-tensor-topology-mapreduce.mjs
 *   node scripts/run-tensor-topology-mapreduce.mjs --dry-run
 *   node scripts/run-tensor-topology-mapreduce.mjs --dry-run --limit 500
 *   node scripts/run-tensor-topology-mapreduce.mjs --resume
 */
import pg       from 'pg';
import Redis    from 'ioredis';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));

const DRY_RUN = process.argv.includes('--dry-run');
const RESUME  = process.argv.includes('--resume');
const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit'));
const MAX_POINTS = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1] ?? LIMIT_ARG.split(' ')[1] ?? '10000') : 10_000;
const BATCH = 500;
const DIM   = 768;

const QDRANT_URL        = process.env.QDRANT_URL        ?? 'http://127.0.0.1:6333';
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION ?? 'codebase_chunks_768';
const DB_URL            = process.env.DATABASE_URL      ?? 'postgresql://legal_admin:123456@127.0.0.1:5432/legal_ai_db';
const REDIS_URL         = process.env.REDIS_URL         ?? 'redis://127.0.0.1:6379';
const REDIS_TTL         = 3600;

// ── Topo classification (mirrors topology-byte-mapper.ts, zero-deps) ──────────

const TOPO_CLASS = {
  UNCLASSIFIED: 0, LEGAL_EVIDENCE: 1, API_ROUTE: 2, UI_COMPONENT: 3,
  DATABASE_SCHEMA: 4, TRACE_RETRIEVAL: 5, GRAPH_GPU_TOPOLOGY: 6, TEST_AUDIT_DEVTOOL: 7,
};
const TOPO_LABEL = ['unclassified','legal-evidence','api-route','ui-component',
  'database-schema','trace-retrieval','graph-gpu-topology','test-audit-devtool'];

/** @param {string} p */
function classifyPath(p) {
  const l = p.toLowerCase();
  if (/\/(tests?|spec|__tests?__|e2e|playwright|vitest)/.test(l) || /\/(scripts?|tools?|devtools?|audit)\//.test(l)) return TOPO_CLASS.TEST_AUDIT_DEVTOOL;
  if (/\/(db|schema|drizzle|migrations?)\//.test(l) || /schema[-_]postgres/.test(l)) return TOPO_CLASS.DATABASE_SCHEMA;
  if (/\/(graph|hypergraph|tensor|topology|som|neo4j|gds)\//.test(l) || /gpu|libtorch|tensorrt|cuda|simd/.test(l)) return TOPO_CLASS.GRAPH_GPU_TOPOLOGY;
  if (/\/(ace|rag|kag|retrieval|indexer|vector|qdrant|embeddings?)\//.test(l)) return TOPO_CLASS.TRACE_RETRIEVAL;
  if (/\/routes\/api\//.test(l) || /\+server\.ts$/.test(l)) return TOPO_CLASS.API_ROUTE;
  if (/\/(evidence|legal|citations?|statutes?|documents?|cases?)\//.test(l)) return TOPO_CLASS.LEGAL_EVIDENCE;
  if (/\/routes\/\(app\)\//.test(l) || (/\/components?\//.test(l) && /\.svelte$/.test(l))) return TOPO_CLASS.UI_COMPONENT;
  return TOPO_CLASS.UNCLASSIFIED;
}
function riskLevel(p) {
  const l = p.toLowerCase();
  if (/auth|session|token|credential|password|secret/.test(l)) return 3;
  if (/migration|delete|drop|truncate/.test(l)) return 2;
  if (/admin|rbac|permission|role/.test(l)) return 1;
  return 0;
}
function trustLevel(p) {
  const l = p.toLowerCase();
  if (/src\/lib\/server\/(db|graph|tensor|vector)\//.test(l)) return 3;
  if (/src\/lib\/server\//.test(l)) return 2;
  if (/src\/routes\/api\//.test(l)) return 2;
  if (/src\/lib\//.test(l)) return 1;
  return 0;
}
/** @param {string} filePath @returns {{ byte: number, hex: string, label: string }} */
function topoByteFromPath(filePath) {
  const cls   = classifyPath(filePath);
  const risk  = riskLevel(filePath);
  const trust = trustLevel(filePath);
  const byte  = (cls & 0x0f) | ((risk & 0x03) << 4) | ((trust & 0x03) << 6);
  return { byte, hex: `0x${byte.toString(16).padStart(2, '0')}`, label: TOPO_LABEL[cls] };
}

// ── GPU helpers ───────────────────────────────────────────────────────────────

let pcaProjectFn = null;
async function tryLoadGpu() {
  try {
    const req = createRequire(import.meta.url);
    const addonPath = resolve(__dirname, '../../simd-bridge/cpp/build/Release/tensorrt_bridge.node');
    const addon = req(addonPath);
    if (typeof addon.pcaProject === 'function') { pcaProjectFn = addon.pcaProject; return true; }
  } catch { /* unavailable */ }
  return false;
}

/** @param {Float32Array[]} embeddings @returns {Array<[number,number,number,number]>} */
function gpuProjectManifold4(embeddings) {
  if (!pcaProjectFn || !embeddings.length) return embeddings.map(() => [0, 0, 0, 0]);
  const n   = embeddings.length;
  const flat = new Float32Array(n * DIM);
  for (let i = 0; i < n; i++) flat.set(embeddings[i], i * DIM);
  const proj = pcaProjectFn(flat, n, DIM, 4);
  // Per-dim normalize [0,1]
  const mins = [1e9,1e9,1e9,1e9], maxs = [-1e9,-1e9,-1e9,-1e9];
  for (let i = 0; i < n; i++) for (let d = 0; d < 4; d++) {
    if (proj[i*4+d] < mins[d]) mins[d] = proj[i*4+d];
    if (proj[i*4+d] > maxs[d]) maxs[d] = proj[i*4+d];
  }
  return Array.from({length: n}, (_, i) =>
    [0,1,2,3].map(d => { const r = maxs[d]-mins[d]; return r>0 ? (proj[i*4+d]-mins[d])/r : 0; })
  );
}

// ── Qdrant helpers ────────────────────────────────────────────────────────────

/** @param {string|null} offset @param {number} limit */
async function qdrantScroll(offset, limit) {
  const r = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/scroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit, with_payload: true, with_vector: true, ...(offset ? { offset } : {}) }),
  });
  if (!r.ok) throw new Error(`Qdrant scroll ${r.status}`);
  const d = await r.json();
  return { points: d.result?.points ?? [], next: d.result?.next_page_offset ?? null };
}

/** @param {string} id @param {Record<string,unknown>} payload */
async function qdrantSetPayload(id, payload) {
  await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/payload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload, points: [id] }),
  }).catch(() => {});
}

// ── Redis quick-cache ─────────────────────────────────────────────────────────

/** @param {Redis} redis @param {string} stableKey @param {number} byte */
async function cacheTopoByte(redis, stableKey, byte) {
  await redis.setex(`topo:byte:${stableKey}`, REDIS_TTL, String(byte)).catch(() => {});
}

/** @param {Redis} redis @param {string} stableKey @param {number} contentHash */
async function getCachedHash(redis, stableKey, contentHash) {
  const v = await redis.get(`tensor:hash:${stableKey}`).catch(() => null);
  return v === contentHash;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`🔬 Tensor Topology MapReduce${DRY_RUN ? ' [DRY RUN]' : ''}${RESUME ? ' [RESUME]' : ''}`);
  console.log(`   Max points: ${MAX_POINTS}  Batch: ${BATCH}`);

  const gpuAvailable = !DRY_RUN && (await tryLoadGpu());
  console.log(`   GPU (pcaProject): ${gpuAvailable ? '✓' : '✗ topo-only mode'}`);

  const pool  = new pg.Pool({ connectionString: DB_URL });
  const redis = new Redis(REDIS_URL, { lazyConnect: false, enableOfflineQueue: false, connectTimeout: 3000 }).on('error', () => {});

  // Ensure table exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tensor_analysis_cache (
      stable_key TEXT PRIMARY KEY, content_hash TEXT NOT NULL,
      topo_byte SMALLINT NOT NULL DEFAULT 0, topo_hex TEXT NOT NULL DEFAULT '0x00', topo_class TEXT NOT NULL DEFAULT 'unclassified',
      manifold4_x REAL DEFAULT 0, manifold4_y REAL DEFAULT 0, manifold4_z REAL DEFAULT 0, manifold4_w REAL DEFAULT 0,
      centroid_key TEXT, som_cluster SMALLINT,
      graph_authority_score REAL DEFAULT 0, tensor_affinity_score REAL DEFAULT 0,
      tensor_json JSONB DEFAULT '{}', qdrant_payload JSONB DEFAULT '{}', output_meta JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
    )
  `).catch(() => {});

  let offset = null;
  let totalProcessed = 0, totalWritten = 0, totalSkipped = 0;
  const classDist = {};

  // Resume: read last processed offset from Redis
  if (RESUME) {
    const saved = await redis.get('tensor:mapreduce:offset').catch(() => null);
    if (saved) { offset = saved; console.log(`   Resuming from offset ${offset}`); }
  }

  while (totalProcessed < MAX_POINTS) {
    const { points, next } = await qdrantScroll(offset, Math.min(BATCH, MAX_POINTS - totalProcessed));
    if (!points.length) break;

    const toProcess = [];
    for (const pt of points) {
      const p = pt.payload ?? {};
      const filePath = (p.relativePath ?? p.file_path ?? p.path ?? p.stable_key ?? String(pt.id));
      const stableKey = (p.stable_key ?? `qdrant:${pt.id}`);
      const content   = (p.chunk_text ?? p.content ?? filePath);
      const hash      = createHash('sha256').update(content).digest('hex').slice(0, 16);

      // Cache hit check
      if (RESUME || !DRY_RUN) {
        const cached = await getCachedHash(redis, stableKey, hash);
        if (cached) { totalSkipped++; continue; }
      }

      let vec = null;
      if (Array.isArray(pt.vector)) vec = new Float32Array(pt.vector);
      else if (pt.vector && typeof pt.vector === 'object') {
        const arr = pt.vector['content'] ?? Object.values(pt.vector)[0];
        if (arr) vec = new Float32Array(arr);
      }

      toProcess.push({ id: pt.id, stableKey, filePath, hash, vec });
    }

    if (toProcess.length > 0) {
      const manifold4s = gpuAvailable
        ? gpuProjectManifold4(toProcess.map(x => x.vec ?? new Float32Array(DIM)))
        : toProcess.map(() => [0, 0, 0, 0]);

      const rows = toProcess.map((item, idx) => {
        const { byte, hex, label } = topoByteFromPath(item.filePath);
        classDist[label] = (classDist[label] ?? 0) + 1;
        const [mx, my, mz, mw] = manifold4s[idx];
        return { ...item, byte, hex, label, mx, my, mz, mw };
      });

      if (!DRY_RUN) {
        // Batch upsert Postgres
        const VALUES = rows.map((_, i) => {
          const o = i * 12;
          return `($${o+1},$${o+2},$${o+3},$${o+4},$${o+5},$${o+6},$${o+7},$${o+8},$${o+9},$${o+10},$${o+11},$${o+12})`;
        }).join(',');
        const params = rows.flatMap(r => [
          r.stableKey, r.hash, r.byte, r.hex, r.label,
          r.mx, r.my, r.mz, r.mw,
          JSON.stringify({ topo_byte: r.byte, topo_hex: r.hex, topo_class: r.label, manifold4: [r.mx,r.my,r.mz,r.mw] }),
          JSON.stringify({ source: gpuAvailable ? 'cuda-pca' : 'topo-only', filePath: r.filePath }),
          JSON.stringify({}),
        ]);
        await pool.query(
          `INSERT INTO tensor_analysis_cache
            (stable_key,content_hash,topo_byte,topo_hex,topo_class,manifold4_x,manifold4_y,manifold4_z,manifold4_w,qdrant_payload,output_meta,tensor_json)
           VALUES ${VALUES}
           ON CONFLICT(stable_key) DO UPDATE SET
             content_hash=EXCLUDED.content_hash, topo_byte=EXCLUDED.topo_byte,
             topo_hex=EXCLUDED.topo_hex, topo_class=EXCLUDED.topo_class,
             manifold4_x=EXCLUDED.manifold4_x, manifold4_y=EXCLUDED.manifold4_y,
             manifold4_z=EXCLUDED.manifold4_z, manifold4_w=EXCLUDED.manifold4_w,
             qdrant_payload=EXCLUDED.qdrant_payload, output_meta=EXCLUDED.output_meta,
             updated_at=now()`,
          params
        ).catch(e => console.warn('  ⚠ pg batch failed:', e.message));

        // Qdrant + Redis in parallel
        await Promise.all(rows.map(async r => {
          await qdrantSetPayload(r.id, { topo_byte: r.byte, topo_hex: r.hex, topo_class: r.label,
            manifold4: [r.mx,r.my,r.mz,r.mw] });
          await cacheTopoByte(redis, r.stableKey, r.byte);
          await redis.setex(`tensor:hash:${r.stableKey}`, REDIS_TTL, r.hash).catch(() => {});
        }));
      }

      totalWritten += rows.length;
    }

    totalProcessed += points.length;
    process.stdout.write(`\r   Processed: ${totalProcessed}  Written: ${totalWritten}  Skipped: ${totalSkipped}    `);

    if (!next || points.length < BATCH) break;
    offset = next;

    // Save resume checkpoint
    if (!DRY_RUN) await redis.set('tensor:mapreduce:offset', offset).catch(() => {});
  }

  // Clear checkpoint on completion
  if (!DRY_RUN) await redis.del('tensor:mapreduce:offset').catch(() => {});

  console.log('\n');
  console.log(`✅ Done`);
  console.log(`   Processed : ${totalProcessed}`);
  console.log(`   Written   : ${totalWritten}${DRY_RUN ? ' (dry — no writes)' : ''}`);
  console.log(`   Skipped   : ${totalSkipped}`);
  console.log('\n   Topo class distribution:');
  for (const [label, count] of Object.entries(classDist).sort((a,b) => b[1]-a[1])) {
    console.log(`     ${label.padEnd(25)} ${count}`);
  }

  await pool.end();
  redis.disconnect();
}

main().catch(err => { console.error('\n❌ MapReduce failed:', err); process.exit(1); });
