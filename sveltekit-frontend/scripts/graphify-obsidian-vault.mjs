#!/usr/bin/env node
/**
 * graphify-obsidian-vault.mjs
 *
 * Materializes an Obsidian vault from the existing graphify outputs:
 *   docs/graph/codebase-graph.json       (3658 files, dirs, tags)
 *   docs/graph/hypergraph-clusters.json  (95 GPU-kmeans clusters)
 *   docs/graph/cluster-summaries.json    (LLM cluster purposes)
 *
 * Output (default → docs/obsidian-vault/):
 *   Clusters/cluster-<id>.md   one per cluster, frontmatter + wikilinks to members
 *   Files/<slug>.md            one per file, frontmatter clusterId/lines/tags
 *   codebase.canvas            JSON Canvas 1.0 with d3-force-laid file nodes + cluster groups
 *   index.md                   Top-N cluster Mermaid + dataview-friendly index
 *
 * Visualization (Obsidian 2026):
 *   - Open the vault folder in Obsidian
 *   - Vanilla Graph View handles 3k nodes; install "Extended Graph" plugin for tag coloring
 *   - Open codebase.canvas for spatial cluster map (force-directed, pre-computed)
 *
 * Usage:
 *   node scripts/graphify-obsidian-vault.mjs
 *   node scripts/graphify-obsidian-vault.mjs --vault=path/to/vault --top-clusters=20
 *   node scripts/graphify-obsidian-vault.mjs --no-canvas      # skip canvas (faster)
 *   node scripts/graphify-obsidian-vault.mjs --files-limit=500 # cap file notes
 *
 * Dependencies (zero new — uses simple force layout, no graphology):
 *   None. Layout is deterministic Fruchterman-Reingold approximation in-script.
 */

import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── CLI ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const arg = (k, def) => {
  const hit = args.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.split('=')[1] : def;
};
const VAULT_DIR    = resolve(ROOT, arg('vault', 'docs/obsidian-vault'));
const TOP_CLUSTERS = parseInt(arg('top-clusters', '20'), 10);
const FILES_LIMIT  = parseInt(arg('files-limit', '0'), 10) || Infinity;
const SKIP_CANVAS  = args.includes('--no-canvas');
const CLEAN        = args.includes('--clean');
const FORCE        = args.includes('--force');
const INCREMENTAL  = args.includes('--incremental');

const log = (...m) => console.log('[obsidian]', ...m);

// ── Helpers ────────────────────────────────────────────────────────────────
const slug = (p) => String(p)
  .replace(/\\/g, '/')
  .replace(/[^\w/.-]+/g, '_')
  .replace(/\//g, '__')
  .replace(/\.\w+$/, '')
  .toLowerCase()
  .slice(0, 180);

const yamlValue = (v) => {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'string')  return JSON.stringify(v);
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return JSON.stringify(v);
  return JSON.stringify(v);
};
const fm = (obj) => '---\n' + Object.entries(obj)
  .filter(([, v]) => v !== undefined)
  .map(([k, v]) => `${k}: ${yamlValue(v)}`)
  .join('\n') + '\n---\n';

// ── Adaptive guard: skip rebuild if source graph hasn't changed ────────────
// Compares mtime(codebase-graph.json) against vault's agent-manifest.json.
async function shouldSkip() {
  if (FORCE || CLEAN) return false;
  if (!INCREMENTAL)    return false;
  const { stat } = await import('node:fs/promises');
  try {
    const srcMtime  = (await stat(resolve(ROOT, 'docs/graph/codebase-graph.json'))).mtimeMs;
    const vaultStat = await stat(join(VAULT_DIR, 'agent-manifest.json')).catch(() => null);
    if (!vaultStat) return false;
    if (srcMtime <= vaultStat.mtimeMs) {
      log(`incremental: source graph unchanged since vault was built — skipping rebuild`);
      log(`  (pass --force to rebuild anyway)`);
      return true;
    }
  } catch { /* missing inputs handled below */ }
  return false;
}
if (await shouldSkip()) process.exit(0);

// ── Load inputs ────────────────────────────────────────────────────────────
async function loadJson(rel) {
  const p = resolve(ROOT, rel);
  if (!existsSync(p)) {
    throw new Error(`Missing input: ${rel}. Run npm run graphify:daily first.`);
  }
  return JSON.parse(await readFile(p, 'utf8'));
}

log('Loading graphify artifacts…');
const graph     = await loadJson('docs/graph/codebase-graph.json');
const clustersJ = await loadJson('docs/graph/hypergraph-clusters.json');
const summJ     = await loadJson('docs/graph/cluster-summaries.json').catch(() => ({ clusters: [] }));

const clusters = Array.isArray(clustersJ?.clusters) ? clustersJ.clusters : [];
const summaries = new Map(
  (summJ.clusters ?? summJ.summaries ?? []).map((s) => [s.clusterId ?? s.id, s])
);
const files = Array.isArray(graph.files) ? graph.files : [];

// Optional: load latest authority_scores.json for pagerank/blend signals.
const authorityMap = new Map();
try {
  const { readdirSync, statSync } = await import('node:fs');
  const runsDir = resolve(ROOT, 'memory/runs');
  const runs = readdirSync(runsDir)
    .filter((d) => /^\d{4}-\d{2}-\d{2}T/.test(d))
    .sort()
    .reverse();
  for (const r of runs) {
    const p = join(runsDir, r, 'authority_scores.json');
    if (existsSync(p)) {
      const j = JSON.parse(await readFile(p, 'utf8'));
      const arr = Array.isArray(j) ? j : (j.topScores ?? j.scores ?? j.authority ?? []);
      for (const row of arr) {
        const k = row.stableKey ?? row.path ?? row.rel;
        if (k) authorityMap.set(k, row);
      }
      log(`  authority: loaded ${authorityMap.size} scores from ${r}`);
      break;
    }
  }
} catch { /* optional */ }

log(`  files=${files.length}  clusters=${clusters.length}  summaries=${summaries.size}`);
const NOW_ISO = new Date().toISOString();

// ── file → cluster map (exact + dir walk-up) ───────────────────────────────
const fileClusterMap = new Map();
const dirClusterMap = new Map();

for (const c of clusters) {
  for (const m of (c.memberFiles ?? [])) {
    if (m.path && !fileClusterMap.has(m.path)) fileClusterMap.set(m.path, c.id);
  }
  for (const tp of (c.topPaths ?? [])) {
    if (tp.path && !fileClusterMap.has(tp.path)) fileClusterMap.set(tp.path, c.id);
  }
  for (const td of (c.topDirs ?? [])) {
    if (td.dir && !dirClusterMap.has(td.dir)) dirClusterMap.set(td.dir, c.id);
  }
}

function resolveClusterId(rel) {
  if (fileClusterMap.has(rel)) return fileClusterMap.get(rel);
  const parts = rel.split('/');
  for (let depth = parts.length - 1; depth > 0; depth--) {
    const dir = parts.slice(0, depth).join('/');
    if (dirClusterMap.has(dir)) return dirClusterMap.get(dir);
  }
  return -1;
}

// ── Pre-pass: per-file pagerank, per-cluster aggregates, cluster↔cluster sim ─
const filePagerank = new Map();
for (const f of files) {
  if (!f.rel) continue;
  const a = authorityMap.get(f.rel) ?? authorityMap.get(`src/${f.rel}`) ?? {};
  filePagerank.set(f.rel, Number(a.score ?? a.pageRank ?? a.pagerank ?? a.graphPageRank ?? 0) || 0);
}

// Cluster aggregates — pagerank_sum, top_tags, risk
const clusterAgg = new Map();
for (const c of clusters) {
  const memberPaths = [
    ...(c.memberFiles ?? []).map((m) => m.path),
    ...(c.topPaths    ?? []).map((m) => m.path),
  ].filter(Boolean);
  const uniq = [...new Set(memberPaths)];
  const prSum = uniq.reduce((s, p) => s + (filePagerank.get(p) ?? 0), 0);
  const prMax = uniq.reduce((m, p) => Math.max(m, filePagerank.get(p) ?? 0), 0);
  const summary = summaries.get(c.id) ?? {};
  // risk: high if low-confidence summary AND low pagerank exposure ; high pr ⇒ high blast radius
  const risk = (!summary.summary && prMax > 0.05) ? 'high'
             : (!summary.summary)                  ? 'medium'
             : (prMax > 0.1)                       ? 'medium'
             :                                       'low';
  clusterAgg.set(c.id, {
    members: uniq,
    pagerank_sum: +prSum.toFixed(6),
    pagerank_max: +prMax.toFixed(6),
    top_tags: (c.topTags ?? []).slice(0, 5).map((t) => t.tag),
    risk,
  });
}

// Cluster ↔ cluster jaccard on top-tags (for `same::` Breadcrumbs edges)
const clusterTags = new Map();
for (const c of clusters) {
  clusterTags.set(c.id, new Set((c.topTags ?? []).slice(0, 8).map((t) => t.tag)));
}
function clusterNeighbors(cid, threshold = 0.3, limit = 5) {
  const a = clusterTags.get(cid) ?? new Set();
  if (a.size === 0) return [];
  const scores = [];
  for (const c of clusters) {
    if (c.id === cid) continue;
    const b = clusterTags.get(c.id) ?? new Set();
    if (b.size === 0) continue;
    let inter = 0;
    for (const t of a) if (b.has(t)) inter++;
    const j = inter / (a.size + b.size - inter);
    if (j >= threshold) scores.push({ id: c.id, j });
  }
  return scores.sort((x, y) => y.j - x.j).slice(0, limit);
}

// ── Vault dirs ─────────────────────────────────────────────────────────────
if (CLEAN && existsSync(VAULT_DIR)) {
  log(`Cleaning ${VAULT_DIR}…`);
  await rm(VAULT_DIR, { recursive: true, force: true });
}
await mkdir(join(VAULT_DIR, 'Clusters'), { recursive: true });
await mkdir(join(VAULT_DIR, 'Files'),    { recursive: true });
await mkdir(join(VAULT_DIR, 'Indexes'),  { recursive: true });

// ── Cluster notes ──────────────────────────────────────────────────────────
log(`Writing ${clusters.length} cluster notes…`);
let clusterFiles = 0;
for (const c of clusters) {
  const summary = summaries.get(c.id) ?? {};
  const topic = c.inferredTopic || summary.bowTerms?.slice(0, 3).join(' / ') || `Cluster ${c.id}`;

  const memberPaths = [
    ...(c.memberFiles ?? []).map((m) => m.path),
    ...(c.topPaths    ?? []).map((m) => m.path),
  ].filter(Boolean);
  const uniqMembers = [...new Set(memberPaths)];

  const tags = [
    'cluster',
    `cluster/${c.id}`,
    ...(summary.bowTerms ?? []).slice(0, 5).map((t) => `topic/${String(t).replace(/[^\w-]+/g, '_')}`),
  ];

  const agg = clusterAgg.get(c.id) ?? { pagerank_sum: 0, pagerank_max: 0, top_tags: [], risk: 'low' };
  const neighbors = clusterNeighbors(c.id);

  const front = fm({
    type: 'cluster',
    cluster_id: `cluster-${c.id}`,
    clusterId: c.id,
    topic,
    aliases: [`cluster-${c.id}`, topic].filter(Boolean),
    memberCount: c.size ?? uniqMembers.length,
    pagerank_sum: agg.pagerank_sum,
    pagerank_max: agg.pagerank_max,
    risk: agg.risk,
    top_tags: agg.top_tags,
    llmHits: summary.llmTotalHits ?? 0,
    summaryMode: summary.summaryMode ?? null,
    confidence: summary.summary ? 'high' : (summary.bowTerms?.length ? 'medium' : 'low'),
    last_updated_by_llm: NOW_ISO,
    'ai-first': true,
    // Breadcrumbs typed-edge fields (Juggl renders as colored edges):
    contains: uniqMembers.slice(0, 50).map((p) => `[[Files/${slug(p)}]]`),
    same:     neighbors.map((n) => `[[Clusters/cluster-${n.id}]]`),
    tags,
  });

  const body = [
    front,
    `# ${topic}`,
    '',
    '## For future Claude',
    summary.summary
      ? `> ${summary.summary}`
      : `> Cluster of ${uniqMembers.length} files. Top dirs: ${(c.topDirs ?? []).slice(0, 3).map((d) => d.dir).join(', ')}. Top tags: ${agg.top_tags.slice(0, 3).join(', ')}. Risk: ${agg.risk}.`,
    summary.purpose ? `\n**Purpose:** ${summary.purpose}` : '',
    '',
    // Dataview inline fields — queryable + Extended Graph filterable
    `cluster:: cluster-${c.id}`,
    `cluster_id:: ${c.id}`,
    `member_count:: ${uniqMembers.length}`,
    `pagerank_sum:: ${agg.pagerank_sum}`,
    `risk:: ${agg.risk}`,
    `top_tags:: ${agg.top_tags.join(', ')}`,
    '',
    '## Agent hints',
    `Use this cluster when investigating ${agg.top_tags.slice(0, 3).join(', ') || 'these files'}.`,
    `Risk: **${agg.risk}** (pagerank_max=${agg.pagerank_max}, confidence=${summary.summary ? 'high' : 'medium/low'}).`,
    '',
    '## Main dependencies',
    neighbors.length
      ? neighbors.map((n) => `- same:: [[Clusters/cluster-${n.id}]] (jaccard ${n.j.toFixed(2)})`).join('\n')
      : '_no strongly-related clusters_',
    '',
    '## Top Directories',
    ...(c.topDirs ?? []).slice(0, 10).map((d) => `- \`${d.dir}\` (${d.count})`),
    '',
    '## Top Tags',
    ...(c.topTags ?? []).slice(0, 10).map((t) => `- ${t.tag} (${t.count})`),
    '',
    `## Members (${uniqMembers.length})`,
    ...uniqMembers.slice(0, 200).map((p) => `- contains:: [[Files/${slug(p)}|${p}]]`),
    uniqMembers.length > 200 ? `\n_…and ${uniqMembers.length - 200} more_` : '',
    '',
    '## Backlinks (Dataview)',
    '```dataview',
    `LIST FROM "Files" WHERE clusterId = ${c.id} SORT pagerank DESC LIMIT 30`,
    '```',
  ].filter(Boolean).join('\n');

  await writeFile(join(VAULT_DIR, 'Clusters', `cluster-${c.id}.md`), body);
  clusterFiles++;
}

// ── File notes ─────────────────────────────────────────────────────────────
log(`Writing file notes (limit=${Number.isFinite(FILES_LIMIT) ? FILES_LIMIT : 'all'})…`);
let fileNotes = 0;
const fileNodeIds = []; // for canvas

const sortedFiles = [...files].sort((a, b) => (b.lineCount || 0) - (a.lineCount || 0));
for (const f of sortedFiles) {
  if (fileNotes >= FILES_LIMIT) break;
  const rel = f.rel;
  if (!rel) continue;

  const clusterId = resolveClusterId(rel);
  const fSlug = slug(rel);

  const tags = [
    'file',
    f.ext ? `ext/${f.ext.replace(/^\./, '')}` : null,
    clusterId >= 0 ? `cluster/${clusterId}` : null,
    f.isRoute ? 'route' : null,
    f.isSvelteComp ? 'svelte' : null,
    f.isTest ? 'test' : null,
    f.hasAuth ? 'auth' : null,
    f.hasZod ? 'zod' : null,
    ...(f.tags ?? []).slice(0, 3).map((t) => `t/${String(t).replace(/[^\w-]+/g, '_')}`),
  ].filter(Boolean);

  const auth = authorityMap.get(rel) ?? authorityMap.get(`src/${rel}`) ?? {};
  const pagerank = Number(auth.score ?? auth.pageRank ?? auth.pagerank ?? auth.graphPageRank ?? 0) || 0;
  const blend    = Number(auth.blend ?? auth.graphAuthorityScore ?? 0) || 0;

  const importLinks = (f.imports ?? [])
    .map((i) => typeof i === 'string' ? i : i?.from)
    .filter((s) => typeof s === 'string' && s.startsWith('.'))
    .slice(0, 30);

  // Resolve relative imports to other file slugs for Breadcrumbs typed edges.
  const importWikilinks = importLinks
    .map((imp) => {
      // Best-effort path resolution: drop leading ./ / ../, append common ext
      const cleaned = imp.replace(/^\.+\//, '').replace(/\.(ts|js|svelte|mjs)$/, '');
      return `[[Files/${slug(cleaned)}]]`;
    })
    .slice(0, 20);

  const front = fm({
    type: 'file',
    path: rel,
    aliases: [rel.split('/').pop(), rel].filter(Boolean),
    clusterId,
    ext: f.ext,
    lineCount: f.lineCount ?? 0,
    pagerank: +pagerank.toFixed(6),
    blend: +blend.toFixed(6),
    isRoute: f.isRoute ?? false,
    isSvelteComp: f.isSvelteComp ?? false,
    isTest: f.isTest ?? false,
    hasAuth: f.hasAuth ?? false,
    hasZod: f.hasZod ?? false,
    importCount: (f.imports ?? []).length,
    embedding_id: `qdrant://codebase_chunks_768/${rel}`,
    last_updated_by_llm: NOW_ISO,
    'ai-first': true,
    confidence: f.summary ? 'high' : 'medium',
    // Breadcrumbs typed-edge fields:
    up: clusterId >= 0 ? [`[[Clusters/cluster-${clusterId}]]`] : [],
    imports: importWikilinks,
    tags,
  });

  const body = [
    front,
    `# \`${rel}\``,
    '',
    '## For future Claude',
    f.summary
      ? `> ${f.summary}`
      : `> ${f.ext || 'file'} at ${rel} (${f.lineCount ?? 0} lines)${f.isRoute ? ', SvelteKit route' : ''}${f.isSvelteComp ? ', Svelte component' : ''}${f.hasAuth ? ', auth-guarded' : ''}.`,
    '',
    // Dataview inline fields — queryable + picked up as typed edges where supported
    clusterId >= 0 ? `cluster:: [[Clusters/cluster-${clusterId}]]` : '',
    `pagerank:: ${pagerank.toFixed(6)}`,
    `blend:: ${blend.toFixed(6)}`,
    `lines:: ${f.lineCount ?? 0}`,
    '',
    f.summary ? `## Summary\n\n${f.summary}\n` : '',
    importLinks.length
      ? '## Imports\n\n' + importLinks.map((i, idx) => {
          const wl = importWikilinks[idx];
          return `- imports:: ${wl} \`${i}\``;
        }).join('\n')
      : '',
    (f.todos ?? []).length
      ? '\n## TODOs\n\n' + f.todos.slice(0, 10).map((t) => `- ${typeof t === 'string' ? t : t.text || JSON.stringify(t)}`).join('\n')
      : '',
    '',
    '## Backlinks (Dataview)',
    '```dataviewjs',
    'const cur = dv.current().file.path;',
    'dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);',
    '```',
  ].filter(Boolean).join('\n');

  await writeFile(join(VAULT_DIR, 'Files', `${fSlug}.md`), body);
  fileNodeIds.push({ id: fSlug, rel, clusterId, lineCount: f.lineCount ?? 0, pagerank });
  fileNotes++;
}

// ── Canvas (JSON Canvas 1.0) ───────────────────────────────────────────────
if (!SKIP_CANVAS && fileNodeIds.length > 0) {
  log(`Building Canvas with ${fileNodeIds.length} file nodes + ${clusters.length} cluster groups…`);

  // Deterministic radial layout: clusters around origin, files orbiting their cluster.
  const clusterAngle = new Map();
  clusters.forEach((c, i) => clusterAngle.set(c.id, (i / Math.max(1, clusters.length)) * Math.PI * 2));
  const CLUSTER_R = 4000;
  const FILE_R    = 800;

  const canvasNodes = [];
  const canvasEdges = [];

  // Cluster groups
  for (const c of clusters) {
    const angle = clusterAngle.get(c.id) ?? 0;
    const cx = Math.cos(angle) * CLUSTER_R;
    const cy = Math.sin(angle) * CLUSTER_R;
    canvasNodes.push({
      id: `group-${c.id}`,
      type: 'group',
      label: `[${c.id}] ${(c.inferredTopic || 'cluster').slice(0, 60)}`,
      x: Math.round(cx - FILE_R - 100),
      y: Math.round(cy - FILE_R - 100),
      width: FILE_R * 2 + 200,
      height: FILE_R * 2 + 200,
      color: String(((c.id % 6) + 1)),
    });
  }

  // File nodes — orbit their cluster center
  const filesByCluster = new Map();
  for (const f of fileNodeIds) {
    if (!filesByCluster.has(f.clusterId)) filesByCluster.set(f.clusterId, []);
    filesByCluster.get(f.clusterId).push(f);
  }
  for (const [cid, list] of filesByCluster) {
    const angle = clusterAngle.get(cid) ?? 0;
    const cx = Math.cos(angle) * CLUSTER_R;
    const cy = Math.sin(angle) * CLUSTER_R;
    list.forEach((f, i) => {
      const a = (i / Math.max(1, list.length)) * Math.PI * 2;
      const r = FILE_R * (0.4 + 0.6 * Math.sqrt((i + 1) / list.length));
      canvasNodes.push({
        id: f.id,
        type: 'file',
        file: `Files/${f.id}.md`,
        x: Math.round(cx + Math.cos(a) * r),
        y: Math.round(cy + Math.sin(a) * r),
        width: 260,
        height: 60,
      });
    });
  }

  // Edges: cluster → top-3 file nodes (keeps Canvas readable; vanilla Graph View handles import edges)
  for (const [cid, list] of filesByCluster) {
    if (cid < 0) continue;
    list.slice(0, 3).forEach((f, i) => {
      canvasEdges.push({
        id: `e-${cid}-${i}`,
        fromNode: `group-${cid}`,
        toNode: f.id,
        toEnd: 'arrow',
      });
    });
  }

  await writeFile(
    join(VAULT_DIR, 'codebase.canvas'),
    JSON.stringify({ nodes: canvasNodes, edges: canvasEdges }, null, 2),
  );
  log(`  Canvas: ${canvasNodes.length} nodes, ${canvasEdges.length} edges`);

  // ── kg.canvas: cluster-only typed-edge subgraph (Juggl-loadable, <200 nodes) ──
  // Edges drawn between clusters that share top-tags (proxy for SIMILAR_TOPOLOGY).
  const clusterTopTags = new Map();
  for (const c of clusters) {
    const tagSet = new Set((c.topTags ?? []).slice(0, 5).map((t) => t.tag));
    clusterTopTags.set(c.id, tagSet);
  }
  const kgNodes = [];
  const kgEdges = [];
  for (const c of clusters) {
    const angle = clusterAngle.get(c.id) ?? 0;
    kgNodes.push({
      id: `kg-${c.id}`,
      type: 'file',
      file: `Clusters/cluster-${c.id}.md`,
      x: Math.round(Math.cos(angle) * CLUSTER_R / 2),
      y: Math.round(Math.sin(angle) * CLUSTER_R / 2),
      width: 320,
      height: 80,
      color: String(((c.id % 6) + 1)),
    });
  }
  // Cluster ↔ cluster edges: jaccard ≥ 0.4 on top-tags
  let kgEdgeId = 0;
  for (let i = 0; i < clusters.length; i++) {
    for (let j = i + 1; j < clusters.length; j++) {
      const a = clusterTopTags.get(clusters[i].id);
      const b = clusterTopTags.get(clusters[j].id);
      if (!a || !b || a.size === 0 || b.size === 0) continue;
      let intersect = 0;
      for (const t of a) if (b.has(t)) intersect++;
      const union = a.size + b.size - intersect;
      const jaccard = union > 0 ? intersect / union : 0;
      if (jaccard >= 0.4) {
        kgEdges.push({
          id: `kg-e-${kgEdgeId++}`,
          fromNode: `kg-${clusters[i].id}`,
          toNode: `kg-${clusters[j].id}`,
          label: `sim:${jaccard.toFixed(2)}`,
        });
      }
    }
  }
  await writeFile(
    join(VAULT_DIR, 'kg.canvas'),
    JSON.stringify({ nodes: kgNodes, edges: kgEdges }, null, 2),
  );
  log(`  KG Canvas: ${kgNodes.length} nodes, ${kgEdges.length} typed edges (cluster↔cluster jaccard≥0.4)`);
}

// ── Index page (Mermaid top-N) ─────────────────────────────────────────────
const topClusters = [...clusters]
  .sort((a, b) => (b.size ?? 0) - (a.size ?? 0))
  .slice(0, TOP_CLUSTERS);

const mermaid = [
  '```mermaid',
  'graph LR',
  ...topClusters.map((c) => `  C${c.id}["${(c.inferredTopic || `cluster ${c.id}`).replace(/"/g, "'").slice(0, 50)}"]`),
  '```',
].join('\n');

const indexBody = [
  fm({
    title: 'Codebase Map',
    generated: new Date().toISOString(),
    fileCount: fileNotes,
    clusterCount: clusters.length,
    tags: ['index', 'codebase'],
  }),
  '# Codebase Map',
  '',
  `Generated: ${new Date().toISOString()}`,
  '',
  `- **${fileNotes}** file notes`,
  `- **${clusters.length}** clusters`,
  `- **${(graph.audit?.routesByMethod && Object.keys(graph.audit.routesByMethod).length) || 'n/a'}** route methods`,
  '',
  '## Visualization',
  '',
  '- **Graph View** (vanilla): toggle tag coloring to see cluster membership',
  '- **Canvas**: open `codebase.canvas` for spatial cluster map',
  '- **Extended Graph plugin** (recommended for 3k+ nodes): `ElsaTam/obsidian-extended-graph`',
  '',
  `## Top ${TOP_CLUSTERS} Clusters (Mermaid)`,
  '',
  mermaid,
  '',
  '## Cluster Index',
  '',
  ...topClusters.map((c) => `- [[Clusters/cluster-${c.id}|${c.inferredTopic || `cluster ${c.id}`}]] (${c.size ?? 0} members)`),
].join('\n');

await writeFile(join(VAULT_DIR, 'index.md'), indexBody);

// ── Generated dataview indexes ─────────────────────────────────────────────
const indexNotes = {
  'High-Risk-Files.md': {
    title: 'High-Risk Files',
    purpose: 'Files with high blast radius (pagerank > 0.05) OR low LLM confidence.',
    query: [
      '```dataview',
      'TABLE clusterId AS cluster, pagerank, blend, confidence, lineCount AS lines',
      'FROM "Files"',
      'WHERE confidence = "low" OR pagerank > 0.05',
      'SORT pagerank DESC',
      'LIMIT 50',
      '```',
    ].join('\n'),
  },
  'Low-Confidence-Summaries.md': {
    title: 'Low-Confidence Summaries',
    purpose: 'Notes the LLM was uncertain about — candidates for manual review or re-summarization.',
    query: [
      '```dataview',
      'TABLE confidence, clusterId AS cluster, lineCount AS lines, pagerank',
      'FROM "Files"',
      'WHERE confidence != "high"',
      'SORT pagerank DESC',
      'LIMIT 50',
      '```',
    ].join('\n'),
  },
  'Top-PageRank-Files.md': {
    title: 'Top PageRank Files',
    purpose: 'Highest authority files in the import graph — start investigations here.',
    query: [
      '```dataview',
      'TABLE pagerank, clusterId AS cluster, blend, isRoute, hasAuth, lineCount AS lines',
      'FROM "Files"',
      'WHERE pagerank > 0',
      'SORT pagerank DESC',
      'LIMIT 30',
      '```',
    ].join('\n'),
  },
  'Cluster-Entry-Points.md': {
    title: 'Cluster Entry Points',
    purpose: 'Top file in each cluster (by pagerank) — minimal navigation set.',
    query: [
      '```dataview',
      'TABLE WITHOUT ID',
      '  cluster_id AS Cluster,',
      '  topic AS Topic,',
      '  risk AS Risk,',
      '  pagerank_sum AS PageRankSum,',
      '  member_count AS Members',
      'FROM "Clusters"',
      'SORT pagerank_sum DESC',
      'LIMIT 50',
      '```',
    ].join('\n'),
  },
};

for (const [fname, spec] of Object.entries(indexNotes)) {
  const front = fm({
    type: 'index',
    title: spec.title,
    generated: NOW_ISO,
    'ai-first': true,
    tags: ['index', 'agent-readable'],
  });
  const body = [
    front,
    `# ${spec.title}`,
    '',
    `> ${spec.purpose}`,
    '',
    spec.query,
  ].join('\n');
  await writeFile(join(VAULT_DIR, 'Indexes', fname), body);
}
log(`  Indexes: ${Object.keys(indexNotes).length} dataview notes`);

// ── Agent manifest (read-only contract for Gemma4 / MCP) ───────────────────
const agentManifest = {
  vault_version: NOW_ISO,
  generated_by: 'graphify-obsidian-vault.mjs',
  collections: {
    files:    'Files/',
    clusters: 'Clusters/',
    indexes:  'Indexes/',
  },
  canvases: {
    full_map:   'codebase.canvas',
    cluster_kg: 'kg.canvas',
  },
  retrieval: {
    qdrant_collection:   'codebase_chunks_768',
    embedding_id_scheme: 'qdrant://codebase_chunks_768/<path>',
    neo4j_node_label:    'CodebaseFile',
    neo4j_pagerank_property: 'pageRank',
  },
  schema: {
    file_frontmatter: ['type', 'path', 'aliases', 'clusterId', 'pagerank', 'blend', 'confidence', 'embedding_id', 'last_updated_by_llm', 'ai-first', 'up', 'imports', 'tags'],
    cluster_frontmatter: ['type', 'cluster_id', 'clusterId', 'topic', 'aliases', 'memberCount', 'pagerank_sum', 'pagerank_max', 'risk', 'top_tags', 'confidence', 'contains', 'same', 'tags'],
    typed_edges: {
      up:       'BELONGS_TO_CLUSTER (file → cluster)',
      contains: 'CONTAINS (cluster → file)',
      same:     'SIMILAR_TOPOLOGY (cluster ↔ cluster, jaccard ≥ 0.3 on top-tags)',
      imports:  'IMPORTS (file → file, local imports only)',
    },
  },
  agent_policy: {
    read_only: true,
    allowed_actions: [
      'search_notes',
      'read_note',
      'follow_links',
      'resolve_embedding_id',
      'qdrant_lookup',
      'generate_plan',
      'propose_fix_markdown',
    ],
    forbidden_actions: [
      'patch_code',
      'mutate_qdrant',
      'mutate_postgres',
      'mutate_redis',
      'mutate_neo4j',
      'rewrite_vault',
      'execute_shell',
    ],
  },
  stats: {
    file_notes:    fileNotes,
    cluster_notes: clusterFiles,
    index_notes:   Object.keys(indexNotes).length,
  },
};
await writeFile(
  join(VAULT_DIR, 'agent-manifest.json'),
  JSON.stringify(agentManifest, null, 2),
);
log('  agent-manifest.json written (read-only policy)');

// ── Plugin config + README ─────────────────────────────────────────────────
// Breadcrumbs hierarchy config — Juggl picks these up as typed colored edges.
// Drop in vault/.obsidian/plugins/breadcrumbs/data.json after enabling the plugin.
const breadcrumbsConfig = {
  userHiers: [
    { up: ['up'], same: ['same'], down: ['contains'] },
    { up: [], same: ['imports'], down: [] },
  ],
  showNameOrType: true,
  showRelationType: true,
};
await writeFile(
  join(VAULT_DIR, 'breadcrumbs.suggested.json'),
  JSON.stringify(breadcrumbsConfig, null, 2),
);

const readme = [
  '# Codebase KG Vault',
  '',
  '## Install plugins (community)',
  '1. **Extended Graph** — `ElsaTam/obsidian-extended-graph` (primary view, tag/property coloring)',
  '2. **Breadcrumbs** — `SkepticMystic/breadcrumbs` (typed-edge frontmatter → Juggl bridge)',
  '3. **Juggl** — Cytoscape-backed graph view (use only on subgraphs, freezes >2k nodes)',
  '4. **Dataview** — required by inline `key:: value` fields',
  '5. **Graph Analysis** *(optional)* — co-citation + centrality overlays',
  '6. **ExcaliBrain** *(optional)* — per-note relational map',
  '',
  '## Configure Breadcrumbs',
  'After enabling, copy `breadcrumbs.suggested.json` → `.obsidian/plugins/breadcrumbs/data.json`.',
  'Hierarchies: `up: [up]  same: [same]  down: [contains]` and a flat `same: [imports]`.',
  '',
  '## Open',
  '- `index.md` — Mermaid top-N + cluster index',
  '- `codebase.canvas` — full spatial map (cluster groups + orbiting files, JSON Canvas 1.0)',
  '- `kg.canvas` — cluster↔cluster typed-edge subgraph (Juggl-loadable, ~100 nodes)',
  '',
  '## Frontmatter schema (LLM-wiki 2026)',
  '```yaml',
  'type: file | cluster',
  'aliases: [...]',
  'tags: [...]',
  'cluster_id / clusterId: <int>',
  'pagerank: <float>          # numeric → "size by property" in Extended Graph',
  'embedding_id: qdrant://codebase_chunks_768/<path>',
  'last_updated_by_llm: <ISO>',
  'ai-first: true',
  'confidence: high | medium | low',
  '# Breadcrumbs typed edges (rendered in Juggl):',
  'up: ["[[Clusters/cluster-N]]"]',
  'imports: ["[[Files/dep]]", ...]',
  'contains: ["[[Files/member]]", ...]   # cluster notes only',
  '```',
  '',
  '## Dataview inline fields (in body)',
  '- `cluster:: [[Clusters/cluster-N]]`',
  '- `pagerank:: <float>`',
  '- `imports:: [[Files/dep]]`',
  '- `contains:: [[Files/member]]`',
].join('\n');

await writeFile(join(VAULT_DIR, 'README.md'), readme);

// ── Done ───────────────────────────────────────────────────────────────────
log('');
log(`✅ Vault ready: ${VAULT_DIR}`);
log(`   Clusters: ${clusterFiles}`);
log(`   Files:    ${fileNotes}`);
log(`   Canvas:   ${SKIP_CANVAS ? 'skipped' : 'codebase.canvas'}`);
log(`   Index:    index.md`);
log('');
log('Next:');
log(`   1. Open ${VAULT_DIR} as an Obsidian vault`);
log('   2. Install plugin: "Extended Graph" (ElsaTam/obsidian-extended-graph)');
log('   3. Open codebase.canvas for the spatial cluster view');
