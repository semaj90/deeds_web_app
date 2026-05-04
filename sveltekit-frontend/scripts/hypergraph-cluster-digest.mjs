#!/usr/bin/env node
/**
 * hypergraph-cluster-digest.mjs
 *
 * Joins hypergraph k-means assignments with Qdrant payloads to produce a
 * human-readable per-cluster digest. Pure aggregation — no LLM calls.
 *
 * Inputs (all from prior pipeline stages):
 *   tmp/hypergraph-assignments.ndjson   ({ id, centroid } per row, written by hypergraph:build:redis)
 *   tmp/hypergraph-centroids.json       ({ K, dims, counts, centroids[] }, written by hypergraph:build)
 *   Qdrant codebase_chunks_768          (fetch payloads via points API in batches)
 *
 * Outputs:
 *   docs/graph/hypergraph-clusters.md   — per-cluster topic + top member files
 *   docs/graph/hypergraph-clusters.json — same data as JSON for downstream consumers
 *
 * Per-cluster fields:
 *   - id              k-means centroid index
 *   - size            count of assigned chunks
 *   - topPaths        top 8 files by member count (with line ranges)
 *   - topKinds        kind distribution: file/type/function/component/route/etc
 *   - topTags         most-frequent payload tag (from indexer's tag extraction)
 *   - topSymbols      most-frequent named symbol (function/class/component name)
 *   - inferredTopic   short string built from topKinds[0] + topTags[0] + dominant dir
 *
 * Usage:
 *   node scripts/hypergraph-cluster-digest.mjs                       # write all
 *   node scripts/hypergraph-cluster-digest.mjs --top 8               # top-N members per cluster
 *   node scripts/hypergraph-cluster-digest.mjs --batch 200           # Qdrant fetch batch size
 *   node scripts/hypergraph-cluster-digest.mjs --quiet               # phase logs to stderr only
 *   node scripts/hypergraph-cluster-digest.mjs --summary-only        # 1-line summary
 */

import { createReadStream, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createInterface } from 'node:readline';
import path from 'node:path';

// ── Args ────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function flag(name, def) { const i = args.indexOf(name); return i === -1 ? def : args[i + 1]; }
function has(name) { return args.includes(name); }

const ROOT          = path.resolve(process.cwd());
const ASSIGN_PATH   = path.join(ROOT, 'tmp/hypergraph-assignments.ndjson');
const CENTROID_PATH = path.join(ROOT, 'tmp/hypergraph-centroids.json');
const OUT_MD        = path.join(ROOT, 'docs/graph/hypergraph-clusters.md');
const OUT_JSON      = path.join(ROOT, 'docs/graph/hypergraph-clusters.json');
const QDRANT        = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333';
const COLLECTION    = flag('--collection', 'codebase_chunks_768');
const TOP_N         = Math.max(1, Math.min(30, parseInt(flag('--top', '8'), 10)));
const BATCH         = Math.max(50, Math.min(500, parseInt(flag('--batch', '200'), 10)));
const QUIET         = has('--quiet');
const SUMMARY_ONLY  = has('--summary-only');

const log    = (QUIET || SUMMARY_ONLY) ? () => {} : (...a) => console.log(...a);
const warn   = (...a) => console.warn(...a);

// ── Pre-flight ──────────────────────────────────────────────────────────────

if (!existsSync(ASSIGN_PATH)) {
  console.error(`❌ ${ASSIGN_PATH} not found. Run npm run hypergraph:build:redis first.`);
  process.exit(2);
}
if (!existsSync(CENTROID_PATH)) {
  console.error(`❌ ${CENTROID_PATH} not found. Run npm run hypergraph:build:redis first.`);
  process.exit(2);
}

const centroidMeta = JSON.parse(readFileSync(CENTROID_PATH, 'utf-8'));
const K            = centroidMeta.K ?? centroidMeta.centroids?.length ?? 0;
const totalCounts  = centroidMeta.counts ?? [];

log(`📊 Hypergraph cluster digest`);
log(`   K=${K} centroids, dims=${centroidMeta.dims}, batch=${BATCH}, topN=${TOP_N}`);
log(`   Qdrant ${QDRANT}/${COLLECTION}`);

// ── Step 1: Stream assignments → cluster → [ids] ────────────────────────────

const startedAt = Date.now();
const clusterIds = Array.from({ length: K }, () => []); // K × []
let totalAssign = 0;

await new Promise((resolve, reject) => {
  const rl = createInterface({ input: createReadStream(ASSIGN_PATH), crlfDelay: Infinity });
  rl.on('line', (line) => {
    if (!line.trim()) return;
    try {
      const { id, centroid } = JSON.parse(line);
      if (typeof centroid === 'number' && centroid >= 0 && centroid < K) {
        clusterIds[centroid].push(id);
        totalAssign++;
      }
    } catch { /* skip malformed */ }
  });
  rl.on('close', resolve);
  rl.on('error', reject);
});

log(`   Loaded ${totalAssign.toLocaleString()} assignments across ${K} clusters`);

// ── Step 2: Sample top-N ids per cluster (cap fetches; even sampling) ───────

const sampleIds = new Set();
const clusterSamples = clusterIds.map((ids) => {
  // Keep first TOP_N + a few extras for fallback if Qdrant misses some
  const sample = ids.slice(0, TOP_N * 2);
  sample.forEach((id) => sampleIds.add(id));
  return sample;
});

log(`   Fetching ${sampleIds.size.toLocaleString()} unique payloads from Qdrant…`);

// ── Step 3: Batch-fetch payloads from Qdrant ────────────────────────────────

const payloadById = new Map();
const idArray = [...sampleIds];
let fetched = 0;

for (let i = 0; i < idArray.length; i += BATCH) {
  const slice = idArray.slice(i, i + BATCH);
  try {
    const res = await fetch(`${QDRANT}/collections/${COLLECTION}/points`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ ids: slice, with_payload: true, with_vector: false }),
      signal:  AbortSignal.timeout(15_000),
    });
    if (!res.ok) { warn(`  ⚠️ Qdrant batch ${i}: HTTP ${res.status}`); continue; }
    const body = await res.json();
    for (const p of body?.result ?? []) {
      payloadById.set(p.id, p.payload ?? {});
      fetched++;
    }
  } catch (e) {
    warn(`  ⚠️ Qdrant batch ${i} error: ${e.message}`);
  }
  if (i % (BATCH * 5) === 0 && i > 0) log(`   …fetched ${fetched.toLocaleString()}/${idArray.length.toLocaleString()}`);
}
log(`   Fetched ${fetched.toLocaleString()} payloads`);

// ── Step 4: Aggregate per cluster ───────────────────────────────────────────

function topN(map, n) {
  return [...map.entries()].sort(([, a], [, b]) => b - a).slice(0, n);
}

function shortPath(p) {
  if (!p) return '';
  // Strip absolute prefix; keep src/lib/server/cache → src/lib/server/cache
  const s = String(p).replace(/\\/g, '/');
  const idx = s.indexOf('/src/');
  return idx >= 0 ? s.slice(idx + 1) : s;
}

const digest = {
  generatedAt: new Date().toISOString(),
  collection:  COLLECTION,
  K,
  totalAssignments: totalAssign,
  clusters:    [],
};

for (let c = 0; c < K; c++) {
  const ids = clusterIds[c];
  const sample = clusterSamples[c];
  const pathCounts   = new Map();
  const kindCounts   = new Map();
  const tagCounts    = new Map();
  const symbolCounts = new Map();
  const dirCounts    = new Map();
  const memberFiles  = []; // { path, kind, symbol, lineStart, lineEnd }

  for (const id of sample) {
    const p = payloadById.get(id);
    if (!p) continue;
    const sp = shortPath(p.path ?? p.relativePath ?? '');
    if (sp) {
      pathCounts.set(sp, (pathCounts.get(sp) ?? 0) + 1);
      const dir = sp.split('/').slice(0, -1).join('/');
      if (dir) dirCounts.set(dir, (dirCounts.get(dir) ?? 0) + 1);
    }
    if (p.kind)   kindCounts.set(p.kind, (kindCounts.get(p.kind) ?? 0) + 1);
    if (p.symbol) symbolCounts.set(p.symbol, (symbolCounts.get(p.symbol) ?? 0) + 1);
    if (Array.isArray(p.tags)) {
      for (const t of p.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
    }
    if (memberFiles.length < TOP_N) {
      memberFiles.push({
        path:      sp,
        kind:      p.kind ?? '',
        symbol:    p.symbol ?? '',
        lineStart: p.lineStart ?? null,
        lineEnd:   p.lineEnd ?? null,
      });
    }
  }

  const topPaths   = topN(pathCounts, TOP_N).map(([path, count]) => ({ path, count }));
  const topKinds   = topN(kindCounts, 5).map(([kind, count]) => ({ kind, count }));
  const topTags    = topN(tagCounts, 5).map(([tag, count]) => ({ tag, count }));
  const topSymbols = topN(symbolCounts, 5).map(([symbol, count]) => ({ symbol, count }));
  const topDirs    = topN(dirCounts, 3).map(([dir, count]) => ({ dir, count }));

  // Inferred topic: <kind> in <dominant dir> [tag]
  const dominantDir   = topDirs[0]?.dir ?? '';
  const dominantKind  = topKinds[0]?.kind ?? 'mixed';
  const dominantTag   = topTags[0]?.tag ?? '';
  const inferredTopic = dominantDir
    ? `${dominantKind} chunks in \`${dominantDir}\`${dominantTag ? ` (tag: ${dominantTag})` : ''}`
    : `${dominantKind} chunks${dominantTag ? ` (tag: ${dominantTag})` : ''}`;

  digest.clusters.push({
    id:          c,
    size:        ids.length,
    sampledFor:  sample.length,
    inferredTopic,
    topKinds,
    topTags,
    topSymbols,
    topDirs,
    topPaths,
    memberFiles,
  });
}

// Sort clusters by size (largest first) for the markdown
const sortedClusters = [...digest.clusters].sort((a, b) => b.size - a.size);

// ── Step 5: Render outputs ──────────────────────────────────────────────────

mkdirSync(path.dirname(OUT_JSON), { recursive: true });
writeFileSync(OUT_JSON, JSON.stringify(digest, null, 2), 'utf-8');

const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

// Markdown report
const md = [
  `# Hypergraph Cluster Digest`,
  ``,
  `> Generated ${digest.generatedAt} from \`${COLLECTION}\` (K=${K}, ${totalAssign.toLocaleString()} chunks clustered, ${fetched.toLocaleString()} payloads sampled, ${elapsed}s)`,
  ``,
  `Pure aggregation over hypergraph k-means assignments + Qdrant payloads — no LLM. Drives ACE community summaries and the audit-hotspots tool.`,
  ``,
  `## Cluster overview`,
  ``,
  `| # | Size | Topic | Top dir |`,
  `|---|------|-------|---------|`,
  ...sortedClusters.map((c) =>
    `| ${c.id} | ${c.size.toLocaleString()} | ${c.inferredTopic} | \`${c.topDirs[0]?.dir ?? '—'}\` |`
  ),
  ``,
  `## Per-cluster details`,
  ``,
  ...sortedClusters.flatMap((c) => [
    `### Cluster ${c.id} — ${c.inferredTopic}`,
    ``,
    `- **Size:** ${c.size.toLocaleString()} chunks (sampled ${c.sampledFor})`,
    `- **Top kinds:** ${c.topKinds.map(k => `${k.kind}×${k.count}`).join(', ') || '—'}`,
    `- **Top tags:** ${c.topTags.map(t => `${t.tag}×${t.count}`).join(', ') || '—'}`,
    `- **Top symbols:** ${c.topSymbols.map(s => `\`${s.symbol}\`×${s.count}`).join(', ') || '—'}`,
    `- **Top directories:** ${c.topDirs.map(d => `\`${d.dir}\`×${d.count}`).join(', ') || '—'}`,
    ``,
    `**Top member files:**`,
    ...c.topPaths.map((p) => `- \`${p.path}\` (${p.count}×)`),
    ``,
  ]),
].join('\n');

writeFileSync(OUT_MD, md, 'utf-8');

// ── Summary ─────────────────────────────────────────────────────────────────

if (SUMMARY_ONLY) {
  console.log(`Cluster digest: K=${K}, ${totalAssign.toLocaleString()} chunks, largest=${sortedClusters[0]?.size ?? 0}, smallest=${sortedClusters[sortedClusters.length - 1]?.size ?? 0}, ${elapsed}s → ${OUT_MD.replace(ROOT + path.sep, '')}`);
} else {
  console.log(`✅ Wrote ${OUT_MD.replace(ROOT + path.sep, '')} (${(md.length / 1024).toFixed(1)} KB)`);
  console.log(`✅ Wrote ${OUT_JSON.replace(ROOT + path.sep, '')} (${(JSON.stringify(digest).length / 1024).toFixed(1)} KB)`);
  console.log(`   K=${K}, total=${totalAssign.toLocaleString()}, largest cluster=${sortedClusters[0]?.size ?? 0}, ${elapsed}s`);
}
