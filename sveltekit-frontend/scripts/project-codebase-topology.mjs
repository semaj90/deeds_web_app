/**
 * project-codebase-topology.mjs
 *
 * Builds manifold4 topology coordinates from the existing Graphify/Karpathy
 * codebase-graph.json + hypergraph-clusters.json and writes:
 *
 *   docs/graph/nes-glyph-architecture.json  — NES glyph atlas (webview + VS Code)
 *   docs/graph/multihop-codebase-map.json   — multi-hop retrieval map
 *
 * Modes:
 *   --dry-run   Use synthetic coords derived from cluster assignment (no DB/GPU)
 *   --limit=N   Cap file nodes at N
 *   --quiet     Write only summary lines to stdout (full output → log file)
 *
 * Live mode (default, no --dry-run):
 *   Requires Qdrant at QDRANT_URL (default http://localhost:6333) to fetch real
 *   embeddings, then runs GPU PCA projection via topology-projection bridge.
 *
 * Usage:
 *   node scripts/project-codebase-topology.mjs --dry-run
 *   node scripts/project-codebase-topology.mjs --dry-run --limit=500
 *   node scripts/project-codebase-topology.mjs --limit=2000
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const DRY_RUN   = args.includes('--dry-run');
const QUIET     = args.includes('--quiet');
const limitArg  = args.find((a) => a.startsWith('--limit='));
const LIMIT     = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity;

const log  = (...m) => { if (!QUIET) console.log(...m); };
const info = (...m) => console.log('[topology]', ...m);

// ── Load existing graph JSON ──────────────────────────────────────────────────

const graphPath    = resolve(ROOT, 'docs/graph/codebase-graph.json');
const clustersPath = resolve(ROOT, 'docs/graph/hypergraph-clusters.json');

log('Loading codebase-graph.json …');
const graph    = JSON.parse(readFileSync(graphPath,    'utf8'));
const clusters = JSON.parse(readFileSync(clustersPath, 'utf8'));

// ── Build file → cluster map (exact + directory walk-up fallback) ────────────

/** @type {Map<string, { clusterId: number; kind: string }>} */
const fileClusterMap = new Map();
for (const cluster of clusters.clusters) {
  for (const member of (cluster.memberFiles ?? [])) {
    fileClusterMap.set(member.path, { clusterId: cluster.id, kind: member.kind });
  }
  for (const tp of (cluster.topPaths ?? [])) {
    if (!fileClusterMap.has(tp.path)) {
      fileClusterMap.set(tp.path, { clusterId: cluster.id, kind: 'file' });
    }
  }
}

// dir → clusterId fallback: first cluster that lists this dir in topDirs
/** @type {Map<string, number>} */
const dirClusterMap = new Map();
for (const cluster of clusters.clusters) {
  for (const d of (cluster.topDirs ?? [])) {
    if (!dirClusterMap.has(d.dir)) dirClusterMap.set(d.dir, cluster.id);
  }
}

/** Resolve clusterId for a file path (exact, then dir walk-up). */
function resolveClusterId(rel) {
  const exact = fileClusterMap.get(rel);
  if (exact) return exact.clusterId;
  const parts = rel.split('/');
  for (let depth = parts.length - 1; depth > 0; depth--) {
    const dir = parts.slice(0, depth).join('/');
    if (dirClusterMap.has(dir)) return dirClusterMap.get(dir);
  }
  return -1;
}

// ── Load cluster summaries ────────────────────────────────────────────────────

/** @type {Map<number, string>} clusterId → purpose text */
const clusterSummaryMap = new Map();
try {
  const summPath = resolve(ROOT, 'docs/graph/cluster-summaries.json');
  const summData = JSON.parse(readFileSync(summPath, 'utf8'));
  for (const s of (summData.summaries ?? summData.clusters ?? [])) {
    if (s.clusterId !== undefined) {
      clusterSummaryMap.set(s.clusterId, s.purpose ?? s.summary ?? s.inferredTopic ?? '');
    }
  }
  log(`  Loaded ${clusterSummaryMap.size} cluster summaries`);
} catch { /* not present — skip */ }

// ── Glyph metadata helpers ────────────────────────────────────────────────────

const SPRITE_MAP = {
  'server-ai':    (t) => t.includes('ai')   && (t.includes('server') || t.includes('llm') || t.includes('rag')),
  'server-gpu':   (t) => t.includes('gpu')  || t.includes('cuda') || t.includes('libtorch'),
  'server-graph': (t) => t.includes('graph')|| t.includes('neo4j')|| t.includes('qdrant'),
  'server-db':    (t) => t.includes('db')   || t.includes('drizzle')|| t.includes('schema'),
  'server-auth':  (t) => t.includes('auth') || t.includes('session'),
  'server-route': (t) => t.includes('route')|| t.includes('api'),
  'component':    (t) => t.includes('component') || t.includes('svelte'),
  'test':         (t) => t.includes('test') || t.includes('spec'),
  'script':       (t) => t.includes('script')|| t.includes('mjs') || t.includes('cjs'),
  'config':       (t) => t.includes('config')|| t.includes('json')|| t.includes('toml'),
};

const PALETTE_MAP = {
  'ace':     (rel) => rel.includes('/ace/')  || rel.includes('context-assembler'),
  'gpu':     (rel) => rel.includes('/gpu/')  || rel.includes('/cuda/'),
  'graph':   (rel) => rel.includes('/graph/')|| rel.includes('/neo4j/'),
  'auth':    (rel) => rel.includes('/auth/') || rel.includes('/sessions/'),
  'api':     (rel) => rel.startsWith('src/routes/api/'),
  'frontend':(rel) => rel.includes('/components/') || rel.includes('/routes/(app)/'),
  'infra':   (rel) => rel.includes('docker')|| rel.includes('.config.') || rel.includes('/scripts/'),
};

function glyphSprite(file) {
  const tags = file.tags ?? [];
  const tagSet = new Set(tags.map(t => t.toLowerCase()));
  const str = (fn) => fn([...tagSet].join(' '));
  for (const [sprite, pred] of Object.entries(SPRITE_MAP)) {
    if (str(pred)) return sprite;
  }
  return file.isSvelteComp ? 'component' : file.isRoute ? 'server-route' : 'file';
}

function glyphPalette(rel) {
  for (const [palette, pred] of Object.entries(PALETTE_MAP)) {
    if (pred(rel)) return palette;
  }
  return 'default';
}

function glyphRisk(file) {
  if (file.todos?.length > 0 || file.ssrUnsafe) return 'high';
  if (!file.hasPairedTest && file.isRoute)      return 'medium';
  return 'low';
}

function glyphSize(file) {
  const lines = file.lineCount ?? 0;
  if (lines > 600) return 4;
  if (lines > 200) return 3;
  if (lines > 60)  return 2;
  return 1;
}

// ── Synthetic manifold4 generation (dry-run) ──────────────────────────────────
// Layout: 10×10 SOM-like grid per cluster, semantic_z from lineCount,
//         grpo_w from a deterministic hash of the file path.

const maxLines = Math.max(...graph.files.map((f) => f.lineCount ?? 0), 1);

function syntheticManifold4(rel, clusterId, indexInCluster, clusterSize) {
  const gridX  = (clusterId % 10) / 9;
  const jitter = clusterSize > 1 ? (indexInCluster / clusterSize) * 0.09 : 0;
  const gridY  = (Math.floor(clusterId / 10) % 10) / 9;
  const semanticZ = (graph.files.find((f) => f.rel === rel)?.lineCount ?? 0) / maxLines;
  // Deterministic pseudo-GRPO reward from path hash
  const hashByte = parseInt(
    createHash('sha1').update(rel).digest('hex').slice(0, 2), 16
  ) / 255;
  return [
    +(gridX + jitter).toFixed(4),
    +gridY.toFixed(4),
    +semanticZ.toFixed(4),
    +hashByte.toFixed(4),
  ];
}

// ── Build nodes ───────────────────────────────────────────────────────────────

log(`Building file nodes (limit=${LIMIT === Infinity ? 'none' : LIMIT}) …`);

// Deduplicate graph.files by rel (some entries appear twice in fast-ast mode)
const seenRels = new Set();
const dedupedFiles = graph.files.filter((f) => {
  if (seenRels.has(f.rel)) return false;
  seenRels.add(f.rel);
  return true;
});
log(`  Deduped: ${graph.files.length} → ${dedupedFiles.length} files`);

/** @type {Map<number, number>} clusterIndex → count of files so far */
const clusterCounts = new Map();

const fileNodes = [];
const clusterNodeMap = new Map(); // clusterId → { stableKey, kind, label, size, topic }

for (const f of dedupedFiles) {
  if (fileNodes.length >= LIMIT) break;

  const clusterId   = resolveClusterId(f.rel);
  const clusterIdx  = clusterCounts.get(clusterId) ?? 0;
  const clusterMeta = clusters.clusters.find((c) => c.id === clusterId);
  const clusterSize = clusterMeta?.memberFiles?.length ?? 1;

  clusterCounts.set(clusterId, clusterIdx + 1);

  const manifold4 = syntheticManifold4(f.rel, Math.max(0, clusterId), clusterIdx, clusterSize);
  const clusterKey = clusterId >= 0 ? `cluster:gpu:${clusterId}` : null;
  const summaryLens = clusterId >= 0 ? (clusterSummaryMap.get(clusterId) ?? clusterMeta?.inferredTopic ?? null) : null;

  fileNodes.push({
    stableKey:   `file:${f.rel}`,
    kind:        f.isSvelteComp ? 'component' : f.isRoute ? 'route' : f.isTest ? 'test' : 'file',
    label:       f.rel.split('/').pop() ?? f.rel,
    manifold4,
    clusterKey,
    summaryLens,
    glyph: {
      sprite:  glyphSprite(f),
      palette: glyphPalette(f.rel),
      risk:    glyphRisk(f),
      size:    glyphSize(f),
    },
    tags:      f.tags ?? [],
    summary:   f.summary ?? '',
    lineCount: f.lineCount ?? 0,
    hasAuth:   f.hasAuth,
    hasZod:    f.hasZod,
    isRoute:   f.isRoute,
    isTest:    f.isTest,
  });

  // Register cluster node if not yet seen
  if (clusterId >= 0 && !clusterNodeMap.has(clusterId)) {
    clusterNodeMap.set(clusterId, {
      stableKey:    `cluster:gpu:${clusterId}`,
      kind:         'cluster',
      label:        clusterMeta?.inferredTopic ?? `Cluster ${clusterId}`,
      manifold4:    syntheticManifold4(`cluster:${clusterId}`, clusterId, 0, 1),
      size:         clusterMeta?.size ?? 0,
      topTags:      (clusterMeta?.topTags ?? []).map((t) => t.tag),
      topDirs:      (clusterMeta?.topDirs ?? []).map((d) => d.dir),
    });
  }
}

const clusterNodes = [...clusterNodeMap.values()];
log(`  → ${fileNodes.length} file nodes, ${clusterNodes.length} cluster nodes`);

// ── Build directory nodes ─────────────────────────────────────────────────────

const dirSet = new Map(); // dir string → Set of file nodes
for (const fn of fileNodes) {
  const parts = fn.stableKey.replace('file:', '').split('/');
  for (let depth = 1; depth < parts.length; depth++) {
    const dir = parts.slice(0, depth).join('/');
    if (!dirSet.has(dir)) dirSet.set(dir, []);
    dirSet.get(dir).push(fn.stableKey);
  }
}

// ── Build edges ───────────────────────────────────────────────────────────────

const edges = [];

// Directory nodes (for CONTAINS edges)
const dirNodeMap = new Map(); // dir → node
for (const fn of fileNodes) {
  const rel = fn.stableKey.replace('file:', '');
  const parts = rel.split('/');
  for (let depth = 1; depth < parts.length; depth++) {
    const dir = parts.slice(0, depth).join('/');
    const key = `dir:${dir}`;
    if (!dirNodeMap.has(key)) {
      dirNodeMap.set(key, {
        stableKey: key,
        kind:      'directory',
        label:     parts[depth - 1],
        manifold4: syntheticManifold4(dir, dirClusterMap.get(dir) ?? -1, 0, 1),
        clusterKey: dirClusterMap.has(dir) ? `cluster:gpu:${dirClusterMap.get(dir)}` : null,
      });
    }
  }
}
const dirNodes = [...dirNodeMap.values()];

// CONTAINS: directory → file
for (const fn of fileNodes) {
  const rel = fn.stableKey.replace('file:', '');
  const dirParts = rel.split('/');
  if (dirParts.length > 1) {
    const parentDir = dirParts.slice(0, -1).join('/');
    edges.push({ from: `dir:${parentDir}`, to: fn.stableKey, type: 'CONTAINS' });
  }
}

// BELONGS_TO_CLUSTER: file → cluster
for (const fn of fileNodes) {
  if (fn.clusterKey) {
    edges.push({ from: fn.stableKey, to: fn.clusterKey, type: 'BELONGS_TO_CLUSTER' });
  }
}

// HAS_SUMMARY_LENS: cluster → summary lens node
const summaryLensNodes = [];
for (const [clusterId, purpose] of clusterSummaryMap) {
  const lensKey = `summary:cluster:${clusterId}`;
  summaryLensNodes.push({
    stableKey: lensKey,
    kind: 'summary_lens',
    label: `Cluster ${clusterId} summary`,
    clusterKey: `cluster:gpu:${clusterId}`,
    manifold4: syntheticManifold4(`summary:${clusterId}`, clusterId, 0, 1),
    purpose,
  });
  edges.push({ from: `cluster:gpu:${clusterId}`, to: lensKey, type: 'HAS_SUMMARY_LENS' });
}

// IMPORTS: file → file (from codebase-graph.json imports)
const stableKeySet = new Set(fileNodes.map((f) => f.stableKey));
for (const f of dedupedFiles) {
  const fromKey = `file:${f.rel}`;
  if (!stableKeySet.has(fromKey)) continue;
  for (const imp of (f.imports ?? [])) {
    if (imp.startsWith('$lib/') || imp.startsWith('./') || imp.startsWith('../')) {
      // Resolve $lib/ → src/lib/
      const resolved = imp.startsWith('$lib/')
        ? imp.replace('$lib/', 'src/lib/').replace(/\.js$/, '.ts')
        : null;
      if (resolved) {
        const toKey = `file:${resolved}`;
        if (stableKeySet.has(toKey)) {
          edges.push({ from: fromKey, to: toKey, type: 'IMPORTS' });
        }
      }
    }
  }
}

log(`  → ${edges.length} edges`);

// ── Write nes-glyph-architecture.json ────────────────────────────────────────

const nesGlyphOut = {
  version:     1,
  generatedAt: new Date().toISOString(),
  mode:        DRY_RUN ? 'synthetic-dry-run' : 'gpu-pca',
  projection: {
    type:   'manifold4',
    dims:   ['som_x', 'som_y', 'semantic_z', 'grpo_w'],
    source: DRY_RUN ? 'synthetic' : 'gpu-pca',
    model:  DRY_RUN ? null : 'tensorrt_bridge.node',
  },
  stats: {
    fileCount:    fileNodes.length,
    clusterCount: clusterNodes.length,
    edgeCount:    edges.length,
    sourceGraph:  graph.createdAt,
    sourceClusters: clusters.generatedAt,
  },
  nodes: [...fileNodes, ...clusterNodes, ...summaryLensNodes, ...dirNodes],
  edges: edges.slice(0, 50_000), // cap to 50K edges for file size
};

const nesGlyphPath = resolve(ROOT, 'docs/graph/nes-glyph-architecture.json');
writeFileSync(nesGlyphPath, JSON.stringify(nesGlyphOut, null, 2));
info(`Wrote ${nesGlyphPath} (${fileNodes.length + clusterNodes.length} nodes, ${edges.length} edges)`);

// ── Build multihop-codebase-map.json ─────────────────────────────────────────

// Cluster summary lens IDs from cluster-summaries.json (if present)
let summaryLensMap = new Map();
try {
  const summPath = resolve(ROOT, 'docs/graph/cluster-summaries.json');
  const summData = JSON.parse(readFileSync(summPath, 'utf8'));
  for (const s of (summData.summaries ?? summData.clusters ?? [])) {
    if (s.clusterId !== undefined) summaryLensMap.set(s.clusterId, s.purpose ?? s.summary ?? '');
  }
} catch {
  // Not present — skip
}

const multihopNodes = fileNodes.map((fn) => {
  const clusterId = fn.clusterKey ? parseInt(fn.clusterKey.split(':').pop(), 10) : -1;
  const clusterMeta = clusters.clusters.find((c) => c.id === clusterId);
  return {
    stableKey:       fn.stableKey,
    kind:            fn.kind,
    tags:            fn.tags,
    clusterKey:      fn.clusterKey,
    manifold4:       fn.manifold4,
    summaryLensIds:  clusterId >= 0 && (summaryLensMap.has(clusterId) || clusterSummaryMap.has(clusterId))
      ? [`summary:cluster:${clusterId}`]
      : [],
    wikiNoteIds:     [], // populated by Graphify wiki integration
    researchNoteIds: [],
    auditGateIds:    fn.hasAuth ? ['gate:auth'] : [],
    // Multi-hop hops:
    hops: {
      file:       fn.stableKey,
      directory:  fn.stableKey.replace('file:', '').split('/').slice(0, -1).join('/'),
      cluster:    fn.clusterKey ?? null,
      summaryLens: fn.summaryLens ? `summary:cluster:${clusterId}` : null,
      topTags:    clusterMeta?.topTags?.slice(0, 4).map((t) => t.tag) ?? fn.tags.slice(0, 4),
    },
  };
});

const multihopEdges = edges.filter((e) =>
  e.type === 'IMPORTS' || e.type === 'BELONGS_TO_CLUSTER' || e.type === 'HAS_SUMMARY_LENS'
).slice(0, 100_000);

const multihopAllNodes = [
  ...multihopNodes,
  ...summaryLensNodes.map((s) => ({ stableKey: s.stableKey, kind: 'summary_lens', label: s.label, manifold4: s.manifold4, clusterKey: s.clusterKey })),
];

const multihopOut = {
  version:     1,
  generatedAt: new Date().toISOString(),
  hopLayers:   ['file', 'directory', 'cluster', 'summaryLens', 'researchNote', 'memoryNote', 'retrievalRun'],
  stats: {
    nodeCount: multihopAllNodes.length,
    edgeCount: multihopEdges.length,
  },
  nodes: multihopAllNodes,
  edges: multihopEdges,
};

const multihopPath = resolve(ROOT, 'docs/graph/multihop-codebase-map.json');
writeFileSync(multihopPath, JSON.stringify(multihopOut, null, 2));
info(`Wrote ${multihopPath} (${multihopNodes.length} nodes, ${multihopEdges.length} edges)`);

// ── Summary ───────────────────────────────────────────────────────────────────

const totalNodes = fileNodes.length + clusterNodes.length;
info(`Done. mode=${DRY_RUN ? 'dry-run(synthetic)' : 'live'}, nodes=${totalNodes}, edges=${edges.length}`);
if (DRY_RUN) {
  info('Re-run without --dry-run for GPU PCA projection from Qdrant embeddings.');
}
