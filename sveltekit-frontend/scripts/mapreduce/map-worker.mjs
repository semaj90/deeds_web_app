/**
 * map-worker.mjs
 *
 * worker_threads Map worker for the tensor topology MapReduce pipeline.
 *
 * Input message  (from main thread):
 *   { type: 'map', batch: MapItem[], pcaParams?: PcaParams }
 *   MapItem = { id: string|number, stableKey: string, filePath: string,
 *               hash: string, vec?: number[], content?: string }
 *   PcaParams = { mean: Float32Array, components: Float32Array }
 *
 * Output message (to main thread):
 *   { type: 'mapResult', records: MappedRecord[], projBuffer: ArrayBuffer,
 *     projCount: number, workerIdx: number }
 *   MappedRecord = { key: string, recType: RecordType, value: unknown }
 *
 * Transfer list: [projBuffer] — zero-copy Float32Array (n×4) of manifold4 coords.
 *
 * RecordTypes:
 *   'topo'    — topo class + manifold4, one per input item
 *   'file'    — import edge refs extracted from filePath pattern
 *   'ngram'   — top-5 content n-grams (bigrams)
 *   'error'   — error hash record when content looks like a stack trace
 *   'symbol'  — TypeScript/JS symbol references (export/import/function names)
 */
import { workerData, parentPort } from 'node:worker_threads';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const WORKER_IDX = workerData?.workerIdx ?? 0;
const DIM        = 768;

// ── GPU optional ──────────────────────────────────────────────────────────────

let pcaProjectFn = null;
try {
  const req     = createRequire(import.meta.url);
  const addonPath = resolve(__dirname, '../../../simd-bridge/cpp/build/Release/tensorrt_bridge.node');
  const addon   = req(addonPath);
  if (typeof addon.pcaProject === 'function') pcaProjectFn = addon.pcaProject;
} catch { /* GPU unavailable — JS fallback active */ }

// ── Topo classification (mirrors topology-byte-mapper.ts, zero-deps) ──────────

const TOPO = {
  UNCLASSIFIED:0, LEGAL_EVIDENCE:1, API_ROUTE:2, UI_COMPONENT:3,
  DATABASE_SCHEMA:4, TRACE_RETRIEVAL:5, GRAPH_GPU_TOPOLOGY:6, TEST_AUDIT_DEVTOOL:7,
};
const TOPO_LABEL = ['unclassified','legal-evidence','api-route','ui-component',
  'database-schema','trace-retrieval','graph-gpu-topology','test-audit-devtool'];

function classifyPath(p) {
  const l = p.toLowerCase();
  if (/\/(tests?|spec|__tests?__|e2e|playwright|vitest)/.test(l) || /\/(scripts?|devtools?|audit)\//.test(l)) return TOPO.TEST_AUDIT_DEVTOOL;
  if (/\/(db|schema|drizzle|migrations?)\//.test(l) || /schema[-_]postgres/.test(l)) return TOPO.DATABASE_SCHEMA;
  if (/\/(graph|hypergraph|tensor|topology|som|neo4j|gds)\//.test(l) || /gpu|libtorch|tensorrt|cuda|simd/.test(l)) return TOPO.GRAPH_GPU_TOPOLOGY;
  if (/\/(ace|rag|kag|retrieval|indexer|vector|qdrant|embeddings?)\//.test(l)) return TOPO.TRACE_RETRIEVAL;
  if (/\/routes\/api\//.test(l) || /\+server\.ts$/.test(l)) return TOPO.API_ROUTE;
  if (/\/(evidence|legal|citations?|statutes?|documents?|cases?)\//.test(l)) return TOPO.LEGAL_EVIDENCE;
  if (/\/routes\/\(app\)\//.test(l) || (/\/components?\//.test(l) && /\.svelte$/.test(l))) return TOPO.UI_COMPONENT;
  return TOPO.UNCLASSIFIED;
}

function topoByteFromPath(fp) {
  const cls  = classifyPath(fp);
  const risk = /auth|session|token|credential|password|secret/.test(fp.toLowerCase()) ? 3
             : /migration|delete|drop|truncate/.test(fp.toLowerCase()) ? 2
             : /admin|rbac|permission|role/.test(fp.toLowerCase()) ? 1 : 0;
  const trust = /src\/lib\/server\/(db|graph|tensor|vector)\//.test(fp) ? 3
              : /src\/lib\/server\//.test(fp) ? 2
              : /src\/routes\/api\//.test(fp) ? 2
              : /src\/lib\//.test(fp) ? 1 : 0;
  const byte = (cls & 0x0f) | ((risk & 0x03) << 4) | ((trust & 0x03) << 6);
  return { byte, hex: `0x${byte.toString(16).padStart(2, '0')}`, label: TOPO_LABEL[cls], cls };
}

// ── PCA projection (JS fallback) ──────────────────────────────────────────────

function projectManifold4(vecs, pcaParams) {
  if (!vecs.length || !pcaParams) return vecs.map(() => new Float32Array(4));
  const { mean, components } = pcaParams;
  const n   = vecs.length;
  const flat = new Float32Array(n * DIM);
  for (let i = 0; i < n; i++) {
    const v = vecs[i];
    if (v) flat.set(v.length === DIM ? v : flat.subarray(i*DIM, (i+1)*DIM), i*DIM);
  }

  let proj;
  if (pcaProjectFn) {
    try { proj = pcaProjectFn(flat, n, DIM, mean, components, 4); }
    catch { proj = null; }
  }
  if (!proj) {
    proj = new Float32Array(n * 4);
    for (let i = 0; i < n; i++)
      for (let c = 0; c < 4; c++) {
        let dot = 0;
        for (let j = 0; j < DIM; j++) dot += (flat[i*DIM+j] - mean[j]) * components[c*DIM+j];
        proj[i*4+c] = dot;
      }
  }

  // Per-dim min-max normalise to [0,1]
  const mins = [1e9,1e9,1e9,1e9], maxs = [-1e9,-1e9,-1e9,-1e9];
  for (let i = 0; i < n; i++) for (let d = 0; d < 4; d++) {
    if (proj[i*4+d] < mins[d]) mins[d] = proj[i*4+d];
    if (proj[i*4+d] > maxs[d]) maxs[d] = proj[i*4+d];
  }
  return Array.from({length: n}, (_, i) => {
    const r = new Float32Array(4);
    for (let d = 0; d < 4; d++) { const range = maxs[d]-mins[d]; r[d] = range > 0 ? (proj[i*4+d]-mins[d])/range : 0; }
    return r;
  });
}

// ── Feature extractors ────────────────────────────────────────────────────────

/** Extract top-5 word bigrams from content. */
function extractNgrams(content, n = 2, top = 5) {
  if (!content) return [];
  const words = content.toLowerCase().match(/[a-z][a-z0-9_]{2,}/g) ?? [];
  if (words.length < n) return words.slice(0, top);
  const freq = new Map();
  for (let i = 0; i <= words.length - n; i++) {
    const gram = words.slice(i, i+n).join('_');
    freq.set(gram, (freq.get(gram) ?? 0) + 1);
  }
  return [...freq.entries()].sort((a,b) => b[1]-a[1]).slice(0, top).map(([g]) => g);
}

/** Extract TypeScript export/function/class symbol names from content. */
function extractSymbols(content) {
  if (!content) return [];
  const matches = new Set();
  for (const m of content.matchAll(/(?:export\s+(?:async\s+)?function|export\s+const|export\s+class|export\s+interface|export\s+type)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g))
    matches.add(m[1]);
  for (const m of content.matchAll(/from\s+['"]([^'"]+)['"]/g))
    matches.add(m[1]);
  return [...matches].slice(0, 20);
}

/** Detect if content looks like an error/stack trace. */
function isErrorLike(content) {
  return /\bError\b|\bat\s+\S+:\d+|\bException\b|Uncaught/.test(content ?? '');
}

/** Stable 12-char SHA-256 hash. */
function hashStr(s) { return createHash('sha256').update(s).digest('hex').slice(0, 12); }

// ── Map phase ─────────────────────────────────────────────────────────────────

function mapItems(batch, pcaParams) {
  const records  = [];
  const vecs     = batch.map(item => {
    if (!item.vec) return null;
    return item.vec instanceof Float32Array ? item.vec : new Float32Array(item.vec);
  });

  const projections = pcaParams
    ? projectManifold4(vecs.map(v => v ?? new Float32Array(DIM)), pcaParams)
    : vecs.map(() => new Float32Array(4));

  // Allocate transfer buffer: n×4 Float32Array
  const projBuf = new Float32Array(batch.length * 4);

  for (let i = 0; i < batch.length; i++) {
    const item   = batch[i];
    const topo   = topoByteFromPath(item.filePath);
    const m4     = projections[i];
    projBuf.set(m4, i * 4);

    // Record: topo class + manifold4 coords
    records.push({
      key:     `topo:${topo.label}`,
      recType: 'topo',
      value: {
        id:         item.id,
        stableKey:  item.stableKey,
        filePath:   item.filePath,
        hash:       item.hash,
        topoClass:  topo.label,
        topoByte:   topo.byte,
        topoHex:    topo.hex,
        manifold4:  [m4[0], m4[1], m4[2], m4[3]],
      },
    });

    // Record: file import/export edges
    const symbols = extractSymbols(item.content ?? '');
    if (symbols.length) {
      records.push({
        key:     `file:${item.filePath}`,
        recType: 'file',
        value: {
          stableKey: item.stableKey,
          filePath:  item.filePath,
          topoClass: topo.label,
          symbols,
        },
      });
    }

    // Record: n-gram features for cluster labelling
    const ngrams = extractNgrams(item.content ?? item.filePath, 2, 5);
    if (ngrams.length) {
      records.push({
        key:     `ngram:${hashStr(item.stableKey)}`,
        recType: 'ngram',
        value: { stableKey: item.stableKey, filePath: item.filePath, topoClass: topo.label, ngrams },
      });
    }

    // Record: error fingerprint (if content matches error patterns)
    if (isErrorLike(item.content ?? '')) {
      const errHash = hashStr((item.content ?? '').slice(0, 512));
      records.push({
        key:     `error:${errHash}`,
        recType: 'error',
        value: {
          stableKey: item.stableKey,
          filePath:  item.filePath,
          errorHash: errHash,
          snippet:   (item.content ?? '').slice(0, 200),
        },
      });
    }
  }

  return { records, projBuf: projBuf.buffer };
}

// ── Message handler ──────────────────────────────────────────────────────────

parentPort?.on('message', (msg) => {
  if (msg.type !== 'map') return;
  try {
    const { batch, pcaParams } = msg;
    // Reconstruct Float32Arrays from transferred ArrayBuffers
    let params = null;
    if (pcaParams) {
      params = {
        mean:       new Float32Array(pcaParams.meanBuf),
        components: new Float32Array(pcaParams.compBuf),
      };
    }
    const { records, projBuf } = mapItems(batch, params);
    parentPort.postMessage(
      { type: 'mapResult', records, projBuf, projCount: batch.length, workerIdx: WORKER_IDX },
      [projBuf]  // transfer list — zero-copy
    );
  } catch (err) {
    parentPort.postMessage({ type: 'mapError', error: String(err), workerIdx: WORKER_IDX });
  }
});
