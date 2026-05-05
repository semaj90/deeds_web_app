#!/usr/bin/env node
/**
 * Graphify SOM Topology — hypergraph cluster → SOM grid mapping
 *
 * Pipeline:
 *   1. Load hypergraph-clusters.json (100 clusters, topTags per cluster)
 *   2. Build 64-dim BoW vector per cluster from tag frequencies
 *   3. Run CPU SOM (8×8 grid) on cluster vectors — pure JS, no GPU needed at this scale
 *   4. Assign each cluster a BMU (somRow, somCol)
 *   5. Enrich hypergraph-clusters.json with somRow/somCol/somCluster fields
 *   6. Write cluster BoW tiles → Redis texture:bow:cluster:{id}
 *   7. Write docs/graph/cluster-topology.json — grid + adjacency + similarity matrix
 *   8. Optionally rebuild glyph atlas (POST /api/graph/glyph-atlas)
 *
 * Usage:
 *   node scripts/graphify-som-topology.mjs
 *   node scripts/graphify-som-topology.mjs --dry-run
 *   node scripts/graphify-som-topology.mjs --grid 10x10
 *   node scripts/graphify-som-topology.mjs --iters 1000
 *   node scripts/graphify-som-topology.mjs --rebuild-atlas --app-url http://localhost:5173
 */

import { createClient }      from 'redis';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname }  from 'path';
import { fileURLToPath }     from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── CLI args ──────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const DRY_RUN      = argv.includes('--dry-run');
const ITERS        = parseInt(argv.find(a => a.startsWith('--iters='))?.split('=')[1] ?? '600', 10);
const BOW_DIM      = 64;
const CLUSTER_TTL  = 60 * 60 * 6; // 6h cluster tiles TTL
const REDIS_URL    = process.env.REDIS_URL ?? 'redis://localhost:6379';
const QDRANT_URL   = process.env.QDRANT_URL ?? 'http://localhost:6333';
const APP_URL      = process.env.APP_URL ?? 'http://localhost:5173';
const REBUILD_ATLAS = argv.includes('--rebuild-atlas');

// Grid dims: follow Kohonen rule ceil(sqrt(sqrt(n)*5)) for n clusters
let GRID_W = 0, GRID_H = 0;
const gridArg = argv.find(a => a.startsWith('--grid=') || a.startsWith('--grid '));
if (gridArg) {
  const [w, h] = gridArg.replace('--grid=','').replace('--grid ','').split('x').map(Number);
  GRID_W = w || 8; GRID_H = h || w || 8;
}

const log = (...a) => console.log(...a);
const warn = (...a) => console.warn(...a);

// ── Load clusters ─────────────────────────────────────────────────────────────

const HYPERGRAPH_PATH = resolve(ROOT, 'docs/graph/hypergraph-clusters.json');
const TOPOLOGY_PATH   = resolve(ROOT, 'docs/graph/cluster-topology.json');

function loadClusters() {
  if (!existsSync(HYPERGRAPH_PATH)) {
    throw new Error(`hypergraph-clusters.json not found at ${HYPERGRAPH_PATH} — run npm run graphify:full first`);
  }
  const raw  = readFileSync(HYPERGRAPH_PATH, 'utf-8');
  const data = JSON.parse(raw);
  return Array.isArray(data) ? data : (data.clusters ?? Object.values(data));
}

// ── Build per-cluster BoW vectors ─────────────────────────────────────────────

/** Tokenise a directory path into discriminating sub-terms */
function dirTokens(dir) {
  if (!dir) return [];
  const raw = typeof dir === 'string' ? dir : (dir.dir ?? '');
  return raw
    .replace(/^src\//, '')
    .split(/[/\-_.]/)
    .map(t => t.trim().toLowerCase())
    .filter(t => t.length >= 3 && !['src','lib','the','and','for'].includes(t));
}

/** Extract words from an LLM topic string */
function topicTokens(topic) {
  if (!topic) return [];
  return topic
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 4 && !['this','that','with','from','into','have'].includes(t));
}

function buildBowVectors(clusters) {
  const N = clusters.length;

  // Build per-cluster term sets (raw TF)
  const clusterTermFreq = clusters.map(c => {
    const freq = new Map();

    // 1. Directory path tokens (high discriminating power)
    for (const d of (c.topDirs ?? [])) {
      const tokens = dirTokens(typeof d === 'string' ? d : d.dir);
      const w = typeof d === 'object' ? (d.count ?? 1) : 1;
      for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + w * 2); // 2× weight
    }
    for (const p of (c.topPaths ?? []).slice(0, 5)) {
      for (const t of dirTokens(p)) freq.set(t, (freq.get(t) ?? 0) + 1);
    }

    // 2. Inferred topic words (LLM-generated, cluster-specific)
    for (const t of topicTokens(c.inferredTopic)) {
      freq.set('topic:' + t, (freq.get('topic:' + t) ?? 0) + 3); // 3× weight
    }

    // 3. Top symbol names (function/class/type names)
    for (const s of (c.topSymbols ?? []).slice(0, 10)) {
      const sym = typeof s === 'string' ? s : (s.symbol ?? '');
      const w   = typeof s === 'object' ? (s.count ?? 1) : 1;
      // camelCase → tokens
      const tokens = sym.replace(/([A-Z])/g, ' $1').toLowerCase().split(/\s+/).filter(t => t.length >= 3);
      for (const t of tokens) freq.set('sym:' + t, (freq.get('sym:' + t) ?? 0) + w);
    }

    // 4. topKinds (function, class, interface, type — useful for separation)
    for (const [kind, count] of Object.entries(c.topKinds ?? {})) {
      freq.set('kind:' + kind, (freq.get('kind:' + kind) ?? 0) + Number(count));
    }

    // 5. Tags (lower weight — too shared across clusters)
    for (const entry of (c.topTags ?? []).slice(0, 6)) {
      const tag   = typeof entry === 'string' ? entry : (entry.tag ?? '');
      const count = typeof entry === 'object' ? (entry.count ?? 1) : 1;
      freq.set(tag, (freq.get(tag) ?? 0) + count * 0.3); // 0.3× weight (less discriminating)
    }

    return freq;
  });

  // Build global document frequency (how many clusters contain each term)
  const df = new Map();
  for (const freq of clusterTermFreq) {
    for (const term of freq.keys()) df.set(term, (df.get(term) ?? 0) + 1);
  }

  // IDF = log((N + 1) / (df + 1)) — penalise terms present in many clusters
  const idf = term => Math.log((N + 1) / ((df.get(term) ?? 0) + 1)) + 1;

  // Build TF-IDF per cluster; collect global top-BOW_DIM terms by max TF-IDF
  const allTermTfIdf = new Map();
  const tfidfPerCluster = clusterTermFreq.map(freq => {
    const tfidf = new Map();
    const total = [...freq.values()].reduce((a, b) => a + b, 0) || 1;
    for (const [term, tf] of freq.entries()) {
      const score = (tf / total) * idf(term);
      tfidf.set(term, score);
      if (!allTermTfIdf.has(term) || allTermTfIdf.get(term) < score)
        allTermTfIdf.set(term, score);
    }
    return tfidf;
  });

  // Vocab: top BOW_DIM terms by peak TF-IDF score across any cluster
  const vocab = [...allTermTfIdf.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, BOW_DIM)
    .map(([term]) => term);

  const vocabIdx = new Map(vocab.map((t, i) => [t, i]));

  // Build final vectors
  const vectors = tfidfPerCluster.map(tfidf => {
    const vec = new Float32Array(BOW_DIM);
    for (const [term, score] of tfidf.entries()) {
      const idx = vocabIdx.get(term);
      if (idx !== undefined) vec[idx] = score;
    }
    // L2-normalise
    let norm = 0;
    for (let i = 0; i < BOW_DIM; i++) norm += vec[i] * vec[i];
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < BOW_DIM; i++) vec[i] /= norm;
    return vec;
  });

  return { vectors, vocab };
}

// ── CPU SOM ───────────────────────────────────────────────────────────────────

function initGrid(gridW, gridH) {
  // Random init in [-0.05, 0.05]
  const neurons = new Array(gridW * gridH);
  for (let i = 0; i < neurons.length; i++) {
    neurons[i] = new Float32Array(BOW_DIM).map(() => (Math.random() - 0.5) * 0.1);
  }
  return neurons;
}

function findBmu(neuron, vec) {
  let bestIdx = 0, bestDist = Infinity;
  for (let i = 0; i < neuron.length; i++) {
    let d = 0;
    for (let k = 0; k < BOW_DIM; k++) {
      const diff = neuron[i][k] - vec[k];
      d += diff * diff;
    }
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  }
  return bestIdx;
}

function trainSOM(vectors, gridW, gridH, iters) {
  const neurons = initGrid(gridW, gridH);
  const n = vectors.length;
  const initLR  = 0.5;
  const initRad = Math.max(gridW, gridH) / 2;

  for (let iter = 0; iter < iters; iter++) {
    const t   = iter / iters;
    const lr  = initLR  * Math.exp(-t * 3);          // decay learning rate
    const rad = initRad * Math.exp(-t * 3) + 0.5;    // decay neighbourhood radius

    // Pick random sample
    const sampleIdx = Math.floor(Math.random() * n);
    const vec       = vectors[sampleIdx];

    const bmuIdx = findBmu(neurons, vec);
    const bmuRow = Math.floor(bmuIdx / gridW);
    const bmuCol = bmuIdx % gridW;

    // Update neighbourhood
    const radSq = rad * rad;
    for (let i = 0; i < gridW * gridH; i++) {
      const r = Math.floor(i / gridW);
      const c = i % gridW;
      const distSq = (r - bmuRow) ** 2 + (c - bmuCol) ** 2;
      if (distSq > radSq * 4) continue; // skip far neurons
      const h = Math.exp(-distSq / (2 * radSq));
      const n_ = neurons[i];
      for (let k = 0; k < BOW_DIM; k++) {
        n_[k] += lr * h * (vec[k] - n_[k]);
      }
    }

    if (iter % 100 === 0 && iter > 0) {
      process.stdout.write(`  SOM iter ${iter}/${iters}\r`);
    }
  }
  process.stdout.write('\n');
  return neurons;
}

function assignBmu(neurons, vectors, gridW) {
  return vectors.map(vec => {
    const bmuIdx = findBmu(neurons, vec);
    return { row: Math.floor(bmuIdx / gridW), col: bmuIdx % gridW, idx: bmuIdx };
  });
}

// ── Cosine similarity ─────────────────────────────────────────────────────────

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < BOW_DIM; i++) {
    dot += a[i] * b[i];
    na  += a[i] * a[i];
    nb  += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// ── Build cluster BoW tile for Redis ─────────────────────────────────────────

function buildClusterTile(cluster, vec, vocab) {
  // Weighted terms from the vocab
  const pairs = vocab
    .map((term, i) => ({ term, weight: vec[i] }))
    .filter(p => p.weight > 0)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, BOW_DIM);

  return {
    tileId:  `cluster:${cluster.id ?? cluster.clusterId}`,
    terms:   pairs.map(p => p.term),
    weights: pairs.map(p => p.weight),
    source:  'som-topology',
    chunkIds: (cluster.memberFiles ?? []).slice(0, 20),
    meta: {
      clusterId:    cluster.id ?? cluster.clusterId,
      inferredTopic: cluster.inferredTopic ?? '',
      fileCount:    cluster.size ?? cluster.fileCount ?? 0,
    },
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

log('');
log('═══ Graphify SOM Topology ═══');
log(`  Grid:     auto (Kohonen rule) unless --grid=WxH`);
log(`  SOM iters: ${ITERS}`);
log(`  BoW dims:  ${BOW_DIM}`);
log(`  Dry-run:   ${DRY_RUN}`);
log('');

// Step 1: Load clusters
log('Step 1: Loading hypergraph clusters…');
const clusters = loadClusters();
const N = clusters.length;
log(`  Loaded ${N} clusters`);
if (N === 0) { log('  No clusters — aborting'); process.exit(1); }

// Auto grid size
if (!GRID_W) {
  GRID_W = GRID_H = Math.ceil(Math.sqrt(Math.sqrt(N) * 5));
  log(`  Auto grid: ${GRID_W}×${GRID_H} (${GRID_W * GRID_H} neurons for ${N} clusters)`);
}

// Step 2: Build BoW vectors
log('Step 2: Building cluster BoW vectors…');
const { vectors, vocab } = buildBowVectors(clusters);
log(`  Vocabulary: ${vocab.length} terms`);
log(`  Sample vocab: ${vocab.slice(0, 8).join(', ')}`);

// Step 3: Train SOM
log(`Step 3: Training SOM (${GRID_W}×${GRID_H}, ${ITERS} iterations)…`);
const neurons = trainSOM(vectors, GRID_W, GRID_H, ITERS);
log(`  SOM trained — ${neurons.length} neurons`);

// Step 4: Assign BMU per cluster
log('Step 4: Assigning BMU (best-matching unit) per cluster…');
const assignments = assignBmu(neurons, vectors, GRID_W);

// Report grid usage
const gridUsed = new Set(assignments.map(a => a.idx)).size;
log(`  Grid utilisation: ${gridUsed}/${GRID_W * GRID_H} neurons occupied`);

// Cluster collisions (multiple clusters on same neuron)
const neuronMap = new Map();
for (let i = 0; i < N; i++) {
  const bmu = assignments[i].idx;
  if (!neuronMap.has(bmu)) neuronMap.set(bmu, []);
  neuronMap.get(bmu).push(clusters[i].id ?? clusters[i].clusterId ?? i);
}
const collisions = [...neuronMap.values()].filter(v => v.length > 1).length;
if (collisions > 0) warn(`  ⚠  ${collisions} neuron(s) shared by multiple clusters (expected for dense maps)`);

// Step 5: Enrich clusters with SOM coords
log('Step 5: Enriching hypergraph-clusters.json with SOM coordinates…');
const enriched = clusters.map((c, i) => ({
  ...c,
  somRow:     assignments[i].row,
  somCol:     assignments[i].col,
  somCluster: assignments[i].idx,
  somGridW:   GRID_W,
  somGridH:   GRID_H,
}));

if (!DRY_RUN) {
  writeFileSync(HYPERGRAPH_PATH, JSON.stringify(enriched, null, 2));
  log(`  ✓ Written ${HYPERGRAPH_PATH}`);
} else {
  log(`  [dry] Would write ${HYPERGRAPH_PATH}`);
}

// Step 6: Compute similarity matrix + adjacency
log('Step 6: Computing inter-cluster similarity matrix…');
const simMatrix = new Array(N * N).fill(0);
for (let i = 0; i < N; i++) {
  for (let j = i; j < N; j++) {
    const sim = cosine(vectors[i], vectors[j]);
    simMatrix[i * N + j] = sim;
    simMatrix[j * N + i] = sim;
  }
}

// Adjacency: clusters whose BMU neurons are within Manhattan dist ≤ 2
const adjacency = clusters.map((c, i) => {
  const { row: ri, col: ci } = assignments[i];
  return clusters
    .map((d, j) => {
      if (i === j) return null;
      const { row: rj, col: cj } = assignments[j];
      const manhattan = Math.abs(ri - rj) + Math.abs(ci - cj);
      if (manhattan > 2) return null;
      return {
        clusterId: d.id ?? d.clusterId ?? j,
        manhattan,
        cosine:    Math.round(simMatrix[i * N + j] * 1000) / 1000,
      };
    })
    .filter(Boolean);
});

// Step 7: Write cluster-topology.json
log('Step 7: Writing cluster-topology.json…');
const topology = {
  generatedAt:  new Date().toISOString(),
  clusterCount: N,
  gridW: GRID_W,
  gridH: GRID_H,
  iters: ITERS,
  vocab: vocab.slice(0, BOW_DIM),
  clusters: enriched.map((c, i) => ({
    clusterId:     c.id ?? c.clusterId ?? i,
    inferredTopic: c.inferredTopic ?? '',
    somRow:        assignments[i].row,
    somCol:        assignments[i].col,
    somCluster:    assignments[i].idx,
    fileCount:     c.size ?? c.fileCount ?? 0,
    topDirs:       (c.topDirs ?? []).slice(0, 5).map(d => d.dir ?? d),
    bowWeights:    Array.from(vectors[i]),
    neighbors:     adjacency[i],
  })),
  // Compact similarity: top-3 similar clusters per cluster
  topSimilar: clusters.map((c, i) => {
    const sims = clusters
      .map((d, j) => ({ id: d.id ?? d.clusterId ?? j, sim: simMatrix[i * N + j] }))
      .filter(s => s.id !== (c.id ?? c.clusterId ?? i))
      .sort((a, b) => b.sim - a.sim)
      .slice(0, 3);
    return { clusterId: c.id ?? c.clusterId ?? i, similar: sims };
  }),
};

if (!DRY_RUN) {
  writeFileSync(TOPOLOGY_PATH, JSON.stringify(topology, null, 2));
  log(`  ✓ Written ${TOPOLOGY_PATH}`);
} else {
  log(`  [dry] Would write ${TOPOLOGY_PATH}`);
}

// Step 8: Write cluster BoW tiles to Redis
log('Step 8: Writing cluster BoW tiles to Redis…');
let redis = null;
try {
  redis = createClient({ url: REDIS_URL });
  await redis.connect();
} catch (e) {
  warn(`  ⚠  Cannot connect to Redis (${e.message}) — skipping tile writes`);
  redis = null;
}

if (redis && !DRY_RUN) {
  let written = 0;
  const pipe = redis.multi();
  for (let i = 0; i < N; i++) {
    const c   = enriched[i];
    const cid = c.id ?? c.clusterId ?? i;
    const tile = buildClusterTile(c, vectors[i], vocab);
    const key  = `texture:bow:cluster:${cid}`;
    pipe.set(key, JSON.stringify(tile), { EX: CLUSTER_TTL });
    written++;
  }
  await pipe.exec();
  log(`  ✓ Wrote ${written} cluster BoW tiles (texture:bow:cluster:*)`);
} else if (DRY_RUN) {
  log(`  [dry] Would write ${N} cluster tiles to Redis`);
}

// Step 9: Enrich codebase-graph.json with clusterId + SOM coords from hypergraph memberFiles
log('Step 9: Enriching codebase-graph.json with clusterId + SOM coords…');
const GRAPH_PATH = resolve(ROOT, 'docs/graph/codebase-graph.json');
if (existsSync(GRAPH_PATH)) {
  try {
    const graph = JSON.parse(readFileSync(GRAPH_PATH, 'utf-8'));

    // Build file → {clusterId, somRow, somCol} from enriched clusters' memberFiles
    const fileToCluster = new Map();
    for (let i = 0; i < enriched.length; i++) {
      const c   = enriched[i];
      const cid = c.id ?? c.clusterId ?? i;
      const bmu = assignments[i];
      for (const entry of (c.memberFiles ?? [])) {
        // memberFiles can be {path, kind, symbol, ...} objects or plain strings
        const raw = typeof entry === 'string' ? entry : (entry.path ?? entry.file ?? entry.rel ?? '');
        if (!raw) continue;
        const rel = raw.replace(/\\/g, '/').replace(/^.*?src\//, 'src/');
        const info = { clusterId: cid, somBmuRow: bmu.row, somBmuCol: bmu.col, somCluster: bmu.idx };
        fileToCluster.set(rel, info);
        fileToCluster.set(raw.replace(/\\/g, '/'), info);
      }
      // Also cover topPaths (same shape: {path, count})
      for (const entry of (c.topPaths ?? [])) {
        const raw = typeof entry === 'string' ? entry : (entry.path ?? '');
        if (!raw) continue;
        const rel = raw.replace(/\\/g, '/').replace(/^.*?src\//, 'src/');
        const info = { clusterId: cid, somBmuRow: bmu.row, somBmuCol: bmu.col, somCluster: bmu.idx };
        fileToCluster.set(rel, info);
        fileToCluster.set(raw.replace(/\\/g, '/'), info);
      }
    }

    let updated = 0, alreadyHad = 0;
    for (const file of (graph.files ?? [])) {
      const rel = (file.rel ?? file.path ?? '').replace(/\\/g, '/');
      const entry = fileToCluster.get(rel) ?? fileToCluster.get('src/' + rel);
      if (entry) {
        if (file.clusterId !== undefined) alreadyHad++;
        file.clusterId  = entry.clusterId;
        file.somBmuRow  = entry.somBmuRow;
        file.somBmuCol  = entry.somBmuCol;
        file.somCluster = entry.somCluster;
        updated++;
      }
    }

    if (!DRY_RUN && updated > 0) {
      writeFileSync(GRAPH_PATH, JSON.stringify(graph, null, 2));
      log(`  ✓ Updated ${updated} files with clusterId+somBmuRow/Col (${alreadyHad} already had clusterId)`);
      log(`  ✓ File→cluster map: ${fileToCluster.size} entries for ${enriched.length} clusters`);
    } else if (updated > 0) {
      log(`  [dry] Would update ${updated} files in codebase-graph.json`);
    } else {
      log(`  ℹ  No memberFiles matched graph file paths`);
      log(`     (cluster memberFiles sample: ${enriched[0]?.memberFiles?.slice(0,2).join(', ')})`);
      log(`     (graph file rel sample: ${(graph.files ?? []).slice(0,2).map(f => f.rel).join(', ')})`);
    }
  } catch (e) {
    warn(`  ⚠  Could not enrich codebase-graph.json: ${e.message}`);
  }
} else {
  log(`  ℹ  codebase-graph.json not found — run graphify:daily first`);
}

// Step 10: Rebuild glyph atlas (optional, requires dev server)
if (REBUILD_ATLAS && !DRY_RUN) {
  log('Step 10: Triggering glyph atlas rebuild…');
  try {
    const res = await fetch(`${APP_URL}/api/graph/glyph-atlas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ forceRebuild: true }),
      signal: AbortSignal.timeout(60_000),
    });
    if (res.ok) {
      const d = await res.json();
      log(`  ✓ Atlas rebuilt — ${d.manifest?.clusterCount ?? '?'} clusters, ${d.durationMs}ms`);
    } else {
      warn(`  ⚠  Atlas rebuild returned HTTP ${res.status} — run manually after starting dev server`);
    }
  } catch (e) {
    warn(`  ⚠  Atlas rebuild failed (${e.message}) — dev server not running?`);
    warn(`      Run manually: curl -X POST ${APP_URL}/api/graph/glyph-atlas -d '{}'`);
  }
} else if (!REBUILD_ATLAS) {
  log('Step 10: Atlas rebuild skipped (pass --rebuild-atlas to trigger, requires dev server)');
}

if (redis) await redis.quit().catch(() => {});

// ── Final report ──────────────────────────────────────────────────────────────

log('');
log('═══ SOM Topology Complete ═══');
log(`  Clusters mapped:  ${N}`);
log(`  Grid:             ${GRID_W}×${GRID_H} (${GRID_W * GRID_H} neurons)`);
log(`  Neurons used:     ${gridUsed}`);
log(`  SOM iterations:   ${ITERS}`);

// Print SOM grid preview (8×8 max)
const previewW = Math.min(GRID_W, 12);
const previewH = Math.min(GRID_H, 12);
log('');
log('  SOM grid (cluster topics per neuron):');
const grid2d = Array.from({ length: GRID_H }, (_, r) =>
  Array.from({ length: GRID_W }, (_, c) => {
    const idx = r * GRID_W + c;
    const clustersHere = enriched.filter((_, i) => assignments[i].idx === idx);
    if (clustersHere.length === 0) return '·';
    const label = (clustersHere[0].inferredTopic ?? '').split(' ').slice(0, 2).join(' ') || `c${clustersHere[0].id}`;
    return label.slice(0, 12).padEnd(12);
  })
);

for (let r = 0; r < Math.min(GRID_H, previewH); r++) {
  log('  ' + grid2d[r].slice(0, previewW).join(' │ '));
}

log('');
log(`  Files:`);
log(`    ${HYPERGRAPH_PATH.replace(ROOT + '/', '')} — enriched with somRow/Col/Cluster`);
log(`    ${TOPOLOGY_PATH.replace(ROOT + '/', '')} — full topology + similarity matrix`);
if (!DRY_RUN && redis) log(`    Redis texture:bow:cluster:* — ${N} cluster tiles`);
log('');
log('  Next: npm run graphify:bow-tiles:fast   ← rebuilds cluster tiles from topology');
log('        npm run graphify:health            ← verify all tiers green');
log('');
