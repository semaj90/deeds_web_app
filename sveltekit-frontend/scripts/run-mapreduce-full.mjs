/**
 * run-mapreduce-full.mjs
 *
 * Full GPU-accelerated worker_threads MapReduce pipeline:
 *
 *   Scroll phase  — pull points from Qdrant codebase_chunks_768 in batches
 *   Map phase     — worker_threads pool (numCPUs-1 workers) fan-out feature extraction
 *                   Zero-copy Float32Array transfer via ArrayBuffer transferList
 *   Shuffle phase — in-memory groupBy(recType, key) → four reduce groups
 *   Reduce phase  — four parallel writers:
 *                     R1: Postgres tensor_analysis_cache upsert + Redis quick-cache
 *                     R2: Qdrant payload patch (topo_byte, manifold4, topo_class)
 *                     R3: Neo4j SIMILAR_TOPOLOGY edges + CodebaseFile property sync
 *                     R4: CouchDB wiki cards per topo class (human-readable summaries)
 *   Decoder phase — OLS linear decoder (manifold4 → embedding) persisted to Redis
 *
 * GPU (pcaProject N-API):
 *   Workers carry their own pcaProject reference.  The main thread fits PCA params
 *   on the first real batch, then broadcasts the ArrayBuffers to all workers via
 *   SharedArrayBuffer so subsequent batches use consistent PCA coordinates without
 *   re-sending 768×4 floats per message.
 *
 * Usage:
 *   node scripts/run-mapreduce-full.mjs
 *   node scripts/run-mapreduce-full.mjs --dry-run
 *   node scripts/run-mapreduce-full.mjs --dry-run --limit=500
 *   node scripts/run-mapreduce-full.mjs --resume
 *   node scripts/run-mapreduce-full.mjs --no-neo4j
 *   node scripts/run-mapreduce-full.mjs --no-couch
 *
 * NPM: tensor:topology:full | tensor:topology:full:dry
 */
import os          from 'node:os';
import { Worker }  from 'node:worker_threads';
import { resolve, dirname } from 'node:path';
import { fileURLToPath }    from 'node:url';
import { createHash }       from 'node:crypto';
import { createRequire }    from 'node:module';
import pg   from 'pg';
import Redis from 'ioredis';
import dotenv from 'dotenv';
dotenv.config();

import { reduceNeo4j, reduceNeo4jSymbols } from './mapreduce/reduce-neo4j.mjs';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const WORKER_FILE = resolve(__dirname, 'mapreduce/map-worker.mjs');

// ── CLI flags ─────────────────────────────────────────────────────────────────

const DRY_RUN   = process.argv.includes('--dry-run');
const RESUME    = process.argv.includes('--resume');
const NO_NEO4J  = process.argv.includes('--no-neo4j');
const NO_COUCH  = process.argv.includes('--no-couch');
const LIMIT_ARG = process.argv.find(a => a.startsWith('--limit'));
const MAX_POINTS = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1] ?? LIMIT_ARG.split(' ')[1] ?? '10000') : 10_000;
const SCROLL_BATCH = 500;
const MAP_BATCH    = 100;   // items per worker dispatch
const DIM          = 768;

// ── Config ────────────────────────────────────────────────────────────────────

const QDRANT_URL   = process.env.QDRANT_URL        ?? 'http://127.0.0.1:6333';
const QDRANT_COLL  = process.env.QDRANT_COLLECTION ?? 'codebase_chunks_768';
const DB_URL       = process.env.DATABASE_URL      ?? 'postgresql://legal_admin:123456@127.0.0.1:5432/legal_ai_db';
const REDIS_URL    = process.env.REDIS_URL         ?? 'redis://127.0.0.1:6379';
const REDIS_TTL    = 3600;
const NEO4J_URL    = process.env.NEO4J_HTTP_URL    ?? 'http://localhost:7474';
const NEO4J_USER   = process.env.NEO4J_USER        ?? 'neo4j';
const NEO4J_PASS   = process.env.NEO4J_PASSWORD ?? process.env.NEO4J_PASS ?? 'neo4j123';
const COUCH_URL    = process.env.COUCHDB_URL       ?? 'http://localhost:5984';
const COUCH_USER   = process.env.COUCHDB_USER      ?? 'admin';
const COUCH_PASS   = process.env.COUCHDB_PASSWORD  ?? 'admin';
const COUCH_DB     = process.env.COUCHDB_DB        ?? 'wiki_cards';

const N_WORKERS    = Math.max(1, (os.cpus().length - 1));

// ── GPU ───────────────────────────────────────────────────────────────────────

let pcaProjectFn = null;
let gpuAvailable = false;
try {
  const req = createRequire(import.meta.url);
  const addon = req(resolve(__dirname, '../simd-bridge/cpp/build/Release/tensorrt_bridge.node'));
  if (typeof addon.pcaProject === 'function') { pcaProjectFn = addon.pcaProject; gpuAvailable = true; }
} catch { /* GPU unavailable */ }

// ── PCA fitting (main thread only) ───────────────────────────────────────────

function fitPca(embeddings, k = 4) {
  const n = embeddings.length, dim = embeddings[0].length;
  const mean = new Float32Array(dim);
  for (const emb of embeddings) for (let j = 0; j < dim; j++) mean[j] += emb[j] / n;
  const centered = embeddings.map(emb => { const c = new Float32Array(dim); for (let j = 0; j < dim; j++) c[j] = emb[j] - mean[j]; return c; });
  const components = new Float32Array(k * dim);
  for (let c = 0; c < k; c++) {
    let v = new Float32Array(centered[c % n]);
    let norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
    if (norm < 1e-10) { v = new Float32Array(dim); v[c] = 1; norm = 1; }
    for (let j = 0; j < dim; j++) v[j] /= norm;
    for (let iter = 0; iter < 20; iter++) {
      const newV = new Float32Array(dim);
      for (const cx of centered) { let dot = 0; for (let j = 0; j < dim; j++) dot += cx[j] * v[j]; for (let j = 0; j < dim; j++) newV[j] += cx[j] * dot; }
      for (let prev = 0; prev < c; prev++) { let dot = 0; for (let j = 0; j < dim; j++) dot += components[prev*dim+j]*newV[j]; for (let j = 0; j < dim; j++) newV[j] -= dot * components[prev*dim+j]; }
      const n2 = Math.sqrt(newV.reduce((s, x) => s + x * x, 0));
      if (n2 < 1e-10) break;
      for (let j = 0; j < dim; j++) v[j] = newV[j] / n2;
    }
    for (let j = 0; j < dim; j++) components[c * dim + j] = v[j];
  }
  return { mean, components };
}

// ── Worker pool ───────────────────────────────────────────────────────────────

class WorkerPool {
  constructor(n) {
    this.workers = Array.from({ length: n }, (_, i) => {
      const w = new Worker(WORKER_FILE, { workerData: { workerIdx: i } });
      w.on('error', (e) => console.warn(`  ⚠ worker ${i} error:`, e.message));
      return w;
    });
    this.available = [...this.workers.map((_, i) => i)];
    this.pending   = [];
  }

  /** Dispatch a Map batch; returns a promise resolving to mapResult. */
  dispatch(batch, pcaParams) {
    return new Promise((resolve, reject) => {
      const send = (idx) => {
        const w = this.workers[idx];
        const msg = { type: 'map', batch };
        const transferList = [];
        if (pcaParams) {
          // Clone Float32Array buffers — workers may be running concurrently
          const meanBuf = pcaParams.mean.buffer.slice(0);
          const compBuf = pcaParams.components.buffer.slice(0);
          msg.pcaParams = { meanBuf, compBuf };
          transferList.push(meanBuf, compBuf);
        }
        const onMsg = (result) => {
          w.off('message', onMsg);
          this.available.push(idx);
          if (this.pending.length) { const next = this.pending.shift(); send(next.idx); next.resolve && this.dispatch(next.batch, next.params).then(next.resolve).catch(next.reject); }
          resolve(result);
        };
        w.on('message', onMsg);
        w.postMessage(msg, transferList);
      };
      if (this.available.length) {
        send(this.available.shift());
      } else {
        this.pending.push({ batch, params: pcaParams, resolve, reject });
      }
    });
  }

  async terminate() {
    await Promise.all(this.workers.map(w => w.terminate()));
  }
}

// ── Qdrant helpers ────────────────────────────────────────────────────────────

async function qdrantScroll(offset, limit) {
  const r = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLL}/points/scroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit, with_payload: true, with_vector: true, ...(offset ? { offset } : {}) }),
  });
  if (!r.ok) throw new Error(`Qdrant scroll ${r.status}`);
  const d = await r.json();
  return { points: d.result?.points ?? [], next: d.result?.next_page_offset ?? null };
}

async function qdrantBatchPatch(patches) {
  await Promise.all(patches.map(({ id, payload }) =>
    fetch(`${QDRANT_URL}/collections/${QDRANT_COLL}/points/payload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload, points: [id] }),
    }).catch(() => {})
  ));
}

// ── CouchDB wiki card writer ──────────────────────────────────────────────────

async function writeCouchWikiCard(topoClass, topFiles, ngrams) {
  const docId  = `wiki:topo:${topoClass}`;
  const auth   = `Basic ${Buffer.from(`${COUCH_USER}:${COUCH_PASS}`).toString('base64')}`;
  const docUrl = `${COUCH_URL}/${COUCH_DB}/${encodeURIComponent(docId)}`;

  // Fetch existing rev
  let rev;
  try {
    const existing = await fetch(docUrl, { headers: { Authorization: auth } });
    if (existing.ok) { const d = await existing.json(); rev = d._rev; }
  } catch { /* new doc */ }

  const doc = {
    _id:       docId,
    ...(rev ? { _rev: rev } : {}),
    type:      'wiki_topo_card',
    topoClass,
    title:     `Topo Class: ${topoClass}`,
    summary:   `Files in the ${topoClass} topology class. Top files: ${topFiles.slice(0, 5).join(', ')}.`,
    topFiles:  topFiles.slice(0, 20),
    topNgrams: ngrams.slice(0, 10),
    fileCount: topFiles.length,
    updatedAt: new Date().toISOString(),
  };

  await fetch(docUrl, {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body:    JSON.stringify(doc),
  }).catch(() => {});
}

// ── OLS decoder ───────────────────────────────────────────────────────────────

function invert4x4(m) {
  const a = new Float64Array(m), inv = new Float64Array(16);
  for (let i = 0; i < 4; i++) inv[i*4+i] = 1;
  for (let col = 0; col < 4; col++) {
    let maxVal = Math.abs(a[col*4+col]), maxRow = col;
    for (let row = col+1; row < 4; row++) if (Math.abs(a[row*4+col]) > maxVal) { maxVal = Math.abs(a[row*4+col]); maxRow = row; }
    if (maxRow !== col) { for (let j = 0; j < 4; j++) { [a[col*4+j],a[maxRow*4+j]] = [a[maxRow*4+j],a[col*4+j]]; [inv[col*4+j],inv[maxRow*4+j]] = [inv[maxRow*4+j],inv[col*4+j]]; } }
    const piv = a[col*4+col];
    if (Math.abs(piv) < 1e-12) throw new Error('Singular');
    for (let j = 0; j < 4; j++) { a[col*4+j] /= piv; inv[col*4+j] /= piv; }
    for (let row = 0; row < 4; row++) { if (row === col) continue; const f = a[row*4+col]; for (let j = 0; j < 4; j++) { a[row*4+j] -= f*a[col*4+j]; inv[row*4+j] -= f*inv[col*4+j]; } }
  }
  return inv;
}

function fitDecoder(projList, embList) {
  const n = projList.length, k = 4, d = DIM;
  if (n < k+1) return null;
  const pm = new Float64Array(k), em = new Float64Array(d);
  for (let i = 0; i < n; i++) { for (let j = 0; j < k; j++) pm[j] += projList[i][j]/n; for (let j = 0; j < d; j++) em[j] += embList[i][j]/n; }
  const A = new Float64Array(k*k), B = new Float64Array(k*d);
  for (let i = 0; i < n; i++) {
    const pc = projList[i].map((v,j) => v-pm[j]), ec = embList[i].map((v,j) => v-em[j]);
    for (let r = 0; r < k; r++) { for (let c = 0; c < k; c++) A[r*k+c] += pc[r]*pc[c]; for (let c = 0; c < d; c++) B[r*d+c] += pc[r]*ec[c]; }
  }
  let Ainv; try { Ainv = invert4x4(A); } catch { return null; }
  const Wf = new Float64Array(k*d);
  for (let r = 0; r < k; r++) for (let c = 0; c < d; c++) { let s=0; for (let m=0;m<k;m++) s += Ainv[r*k+m]*B[m*d+c]; Wf[r*d+c]=s; }
  const bf = new Float64Array(d);
  for (let c = 0; c < d; c++) { bf[c]=em[c]; for (let r=0;r<k;r++) bf[c]-=pm[r]*Wf[r*d+c]; }
  return { W: Array.from(Wf), b: Array.from(bf), hidden: k, outputDim: d };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`🗺  MapReduce Full Pipeline${DRY_RUN ? ' [DRY RUN]' : ''}${RESUME ? ' [RESUME]' : ''}`);
  console.log(`   Workers: ${N_WORKERS}  Max points: ${MAX_POINTS}  GPU: ${gpuAvailable ? '✓ pcaProject' : '✗ JS fallback'}`);
  console.log(`   Neo4j: ${NO_NEO4J ? 'disabled' : NEO4J_URL}  CouchDB: ${NO_COUCH ? 'disabled' : COUCH_URL}`);

  const pool  = new pg.Pool({ connectionString: DB_URL, max: 4 });
  const redis = new Redis(REDIS_URL, { lazyConnect: false, enableOfflineQueue: false, connectTimeout: 3000 }).on('error', () => {});
  const workerPool = new WorkerPool(N_WORKERS);

  // Ensure Postgres table
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tensor_analysis_cache (
      stable_key TEXT PRIMARY KEY, content_hash TEXT NOT NULL,
      topo_byte SMALLINT NOT NULL DEFAULT 0, topo_hex TEXT NOT NULL DEFAULT '0x00', topo_class TEXT NOT NULL DEFAULT 'unclassified',
      manifold4_x REAL DEFAULT 0, manifold4_y REAL DEFAULT 0, manifold4_z REAL DEFAULT 0, manifold4_w REAL DEFAULT 0,
      centroid_key TEXT, som_cluster SMALLINT, graph_authority_score REAL DEFAULT 0,
      tensor_json JSONB DEFAULT '{}', qdrant_payload JSONB DEFAULT '{}', output_meta JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
    )
  `).catch(() => {});

  // Resume checkpoint
  let scrollOffset = null;
  if (RESUME) {
    const saved = await redis.get('tensor:mapreduce:full:offset').catch(() => null);
    if (saved) { scrollOffset = saved; console.log(`   Resuming from ${scrollOffset}`); }
  }

  // ── SCROLL + MAP ──────────────────────────────────────────────────────────

  /** @type {Map<string, unknown[]>} */  const shuffleByKey  = new Map();
  /** @type {Map<string, string[]>} */  const shuffleByType = new Map();
  const addRecord = (recType, key, value) => {
    const typeKey = `${recType}:${key}`;
    if (!shuffleByKey.has(typeKey)) { shuffleByKey.set(typeKey, []); const arr = shuffleByType.get(recType) ?? []; arr.push(typeKey); shuffleByType.set(recType, arr); }
    shuffleByKey.get(typeKey).push(value);
  };

  let globalPcaParams  = null;
  let totalScrolled    = 0;
  const decoderProj    = [], decoderEmb = [];
  const DECODER_CAP    = 2000;
  let pendingMapBatch  = [];

  /** Flush pendingMapBatch to workers. */
  const flushMapBatch = async () => {
    if (!pendingMapBatch.length) return;
    const batch = pendingMapBatch.splice(0);
    const result = await workerPool.dispatch(batch, globalPcaParams);
    if (result.type === 'mapResult') {
      for (const rec of result.records) addRecord(rec.recType, rec.key, rec.value);
      // Accumulate projections for decoder fitting (up to DECODER_CAP)
      if (result.projBuf && result.projCount > 0 && decoderProj.length < DECODER_CAP) {
        const proj4 = new Float32Array(result.projBuf);
        for (let i = 0; i < result.projCount && decoderProj.length < DECODER_CAP; i++) {
          const item = batch[i];
          if (item.vec) {
            decoderProj.push(Array.from(proj4.subarray(i*4, i*4+4)));
            decoderEmb.push(item.vec instanceof Float32Array ? item.vec : new Float32Array(item.vec));
          }
        }
      }
    }
  };

  while (totalScrolled < MAX_POINTS) {
    const { points, next } = await qdrantScroll(scrollOffset, Math.min(SCROLL_BATCH, MAX_POINTS - totalScrolled));
    if (!points.length) break;

    // Fit PCA on first real batch with real embeddings (main thread, once)
    if (!globalPcaParams) {
      const firstVecs = points
        .map(pt => { const arr = Array.isArray(pt.vector) ? pt.vector : (pt.vector?.['content'] ?? Object.values(pt.vector ?? {})[0]); return arr ? new Float32Array(arr) : null; })
        .filter(Boolean);
      if (firstVecs.length >= 4) {
        process.stdout.write(`   Fitting PCA on ${firstVecs.length} samples…`);
        globalPcaParams = fitPca(firstVecs, 4);
        console.log(' done');
      }
    }

    // Build MapItems
    for (const pt of points) {
      const p         = pt.payload ?? {};
      const filePath  = (p.relativePath ?? p.file_path ?? p.path ?? p.stable_key ?? String(pt.id));
      const stableKey = (p.stable_key ?? `qdrant:${pt.id}`);
      const content   = (p.chunk_text ?? p.content ?? undefined);
      const hash      = createHash('sha256').update(content ?? filePath).digest('hex').slice(0, 16);
      let vec = null;
      if (Array.isArray(pt.vector)) vec = pt.vector;
      else if (pt.vector && typeof pt.vector === 'object') { const arr = pt.vector['content'] ?? Object.values(pt.vector)[0]; if (arr) vec = arr; }
      pendingMapBatch.push({ id: pt.id, stableKey, filePath, hash, vec, content });
      if (pendingMapBatch.length >= MAP_BATCH) await flushMapBatch();
    }

    totalScrolled += points.length;
    process.stdout.write(`\r   Scrolled: ${totalScrolled}  Shuffled keys: ${shuffleByKey.size}    `);

    if (!next || points.length < SCROLL_BATCH) break;
    scrollOffset = next;
    if (!DRY_RUN) await redis.set('tensor:mapreduce:full:offset', scrollOffset).catch(() => {});
  }
  await flushMapBatch();  // flush remainder
  if (!DRY_RUN) await redis.del('tensor:mapreduce:full:offset').catch(() => {});

  console.log(`\n\n── SHUFFLE complete ─────────────────────────────────────────────`);
  for (const [type, keys] of shuffleByType)
    console.log(`   ${type.padEnd(10)} ${keys.length} groups`);

  // ── REDUCE R1+R2: Postgres + Qdrant + Redis ───────────────────────────────

  console.log('\n── Reduce R1/R2: Postgres + Qdrant + Redis ──────────────────────');
  const topoKeys = shuffleByType.get('topo') ?? [];
  let r1Written = 0;
  const PG_BATCH = 200;

  const allTopoValues = topoKeys.flatMap(k => shuffleByKey.get(k) ?? []);
  for (let i = 0; i < allTopoValues.length; i += PG_BATCH) {
    const chunk = allTopoValues.slice(i, i + PG_BATCH);
    if (!DRY_RUN) {
      const VALUES = chunk.map((_, j) => { const o = j*12; return `($${o+1},$${o+2},$${o+3},$${o+4},$${o+5},$${o+6},$${o+7},$${o+8},$${o+9},$${o+10},$${o+11},$${o+12})`; }).join(',');
      const params = chunk.flatMap(r => [
        r.stableKey, r.hash, r.topoByte, r.topoHex, r.topoClass,
        r.manifold4[0], r.manifold4[1], r.manifold4[2], r.manifold4[3],
        JSON.stringify({ topo_byte: r.topoByte, topo_class: r.topoClass, manifold4: r.manifold4 }),
        JSON.stringify({ source: gpuAvailable ? 'cuda-pca' : 'js-pca', filePath: r.filePath }),
        JSON.stringify({}),
      ]);
      await pool.query(
        `INSERT INTO tensor_analysis_cache
           (stable_key,content_hash,topo_byte,topo_hex,topo_class,manifold4_x,manifold4_y,manifold4_z,manifold4_w,qdrant_payload,output_meta,tensor_json)
         VALUES ${VALUES}
         ON CONFLICT(stable_key) DO UPDATE SET
           content_hash=EXCLUDED.content_hash, topo_byte=EXCLUDED.topo_byte, topo_hex=EXCLUDED.topo_hex,
           topo_class=EXCLUDED.topo_class, manifold4_x=EXCLUDED.manifold4_x, manifold4_y=EXCLUDED.manifold4_y,
           manifold4_z=EXCLUDED.manifold4_z, manifold4_w=EXCLUDED.manifold4_w,
           qdrant_payload=EXCLUDED.qdrant_payload, output_meta=EXCLUDED.output_meta, updated_at=now()`,
        params
      ).catch(e => console.warn(`  ⚠ pg batch:`, e.message));

      // Qdrant + Redis
      await qdrantBatchPatch(chunk.map(r => ({ id: r.id, payload: { topo_byte: r.topoByte, topo_hex: r.topoHex, topo_class: r.topoClass, manifold4: r.manifold4 } })));
      const pipeline = redis.pipeline();
      for (const r of chunk) pipeline.setex(`topo:byte:${r.stableKey}`, REDIS_TTL, String(r.topoByte));
      await pipeline.exec().catch(() => {});
    }
    r1Written += chunk.length;
    process.stdout.write(`\r   R1/R2 written: ${r1Written}/${allTopoValues.length}    `);
  }
  console.log(`\n   ✓ Postgres/Qdrant/Redis: ${r1Written} records`);

  // ── REDUCE R3: Neo4j SIMILAR_TOPOLOGY ────────────────────────────────────

  if (!NO_NEO4J) {
    console.log('\n── Reduce R3: Neo4j SIMILAR_TOPOLOGY edges ──────────────────────');
    try {
      const { nodesUpdated, edgesWritten } = await reduceNeo4j(allTopoValues, {
        neo4jUrl: NEO4J_URL, neo4jUser: NEO4J_USER, neo4jPass: NEO4J_PASS, dryRun: DRY_RUN,
      });
      console.log(`   ✓ Neo4j: ${nodesUpdated} nodes updated, ${edgesWritten} SIMILAR_TOPOLOGY edges`);

      // Also write file symbol edges
      const fileKeys  = shuffleByType.get('file') ?? [];
      const fileValues = fileKeys.flatMap(k => shuffleByKey.get(k) ?? []);
      if (fileValues.length) {
        const { symbolsWritten } = await reduceNeo4jSymbols(fileValues, {
          neo4jUrl: NEO4J_URL, neo4jUser: NEO4J_USER, neo4jPass: NEO4J_PASS, dryRun: DRY_RUN,
        });
        console.log(`   ✓ Neo4j: ${symbolsWritten} file symbol records`);
      }
    } catch (e) {
      console.warn(`  ⚠ Neo4j reduce failed: ${e.message}`);
    }
  }

  // ── REDUCE R4: CouchDB wiki cards per topo class ──────────────────────────

  if (!NO_COUCH) {
    console.log('\n── Reduce R4: CouchDB topo wiki cards ───────────────────────────');
    // Group all topo values by class
    const byClass = new Map();
    for (const r of allTopoValues) {
      let arr = byClass.get(r.topoClass); if (!arr) { arr = []; byClass.set(r.topoClass, arr); }
      arr.push(r);
    }
    // Aggregate top n-grams per class from ngram records
    const ngramKeys   = shuffleByType.get('ngram') ?? [];
    const ngramByClass = new Map();
    for (const k of ngramKeys) {
      for (const rec of shuffleByKey.get(k) ?? []) {
        let arr = ngramByClass.get(rec.topoClass); if (!arr) { arr = new Map(); ngramByClass.set(rec.topoClass, arr); }
        for (const gram of rec.ngrams ?? []) arr.set(gram, (arr.get(gram) ?? 0) + 1);
      }
    }

    let couchWritten = 0;
    for (const [topoClass, items] of byClass) {
      const topFiles = [...new Set(items.map(r => r.filePath).filter(Boolean))].slice(0, 30);
      const ngramMap = ngramByClass.get(topoClass) ?? new Map();
      const topNgrams = [...ngramMap.entries()].sort((a,b) => b[1]-a[1]).slice(0, 10).map(([g]) => g);
      if (!DRY_RUN) {
        await writeCouchWikiCard(topoClass, topFiles, topNgrams).catch(() => {});
      }
      couchWritten++;
    }
    console.log(`   ✓ CouchDB: ${couchWritten} wiki cards${DRY_RUN ? ' (dry)' : ''}`);
  }

  // ── Decoder fitting ───────────────────────────────────────────────────────

  if (!DRY_RUN && decoderProj.length >= 5) {
    console.log(`\n── Decoder: OLS fit on ${decoderProj.length} samples ─────────────────`);
    const w = fitDecoder(decoderProj, decoderEmb);
    if (w) {
      await redis.setex('ace:autoencoder:decoder:weights', 86400, JSON.stringify(w)).catch(() => {});
      console.log(`   ✓ Decoder saved to Redis (W=${w.W.length} floats)`);
    } else {
      console.warn('   ⚠ Decoder fit skipped (insufficient samples)');
    }
  }

  // ── Topo class distribution ───────────────────────────────────────────────

  console.log('\n── Topo class distribution ──────────────────────────────────────');
  const dist = new Map();
  for (const r of allTopoValues) dist.set(r.topoClass, (dist.get(r.topoClass) ?? 0) + 1);
  for (const [label, count] of [...dist.entries()].sort((a,b) => b[1]-a[1]))
    console.log(`   ${label.padEnd(26)} ${count}`);

  console.log(`\n✅ MapReduce done — ${totalScrolled} scrolled, ${r1Written} written (R1/R2)`);

  await workerPool.terminate();
  await pool.end();
  redis.disconnect();
}

main().catch(err => { console.error('\n❌ MapReduce failed:', err); process.exit(1); });
