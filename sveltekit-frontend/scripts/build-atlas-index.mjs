#!/usr/bin/env node
/**
 * build-atlas-index.mjs
 *
 * Builds a minified Karpathy-style codebase atlas index — one JSON file
 * mapping every indexed file to its 4D atlas signals. Designed to be loaded
 * once per session by the ACE skill / Gemma4 for tricubic search:
 *
 *   axis-X = cluster / topo_class           (semantic neighbourhood)
 *   axis-Y = graphPageRank / authority      (importance)
 *   axis-Z = chunk_hit_log demand           (what the agent reaches for)
 *   axis-W = recency / dirty / risk         (current task relevance)
 *
 * Output shape (column-oriented, ~70% smaller than row JSON):
 *
 *   {
 *     "v": 1,
 *     "generated_at": "...",
 *     "schema": ["f","tc","tb","c","pr","ga","h","rs","a","rules","tools","tags"],
 *     "files": [
 *       ["src/lib/server/db/client.ts", "infrastructure", 130, "gpu:50", 1.0, 0.555, 12, 0.85, "src/lib/server", 5, 9, 8],
 *       ...
 *     ],
 *     "stats": { ... },
 *     "indices": {
 *       "by_cluster":     { "gpu:50": [<file_idx>, ...] },
 *       "by_topo_class":  { "infrastructure": [...] },
 *       "by_agents_dir":  { "src/lib/server": [...] }
 *     }
 *   }
 *
 * Outputs:
 *   docs/atlas-index/codebase-atlas.json     (canonical, full)
 *   docs/atlas-index/codebase-atlas.min.json (minified — same data, no whitespace)
 *   Redis  ace:atlas:latest                  (compressed copy, 24h TTL)
 *
 * Usage:
 *   node scripts/build-atlas-index.mjs              # build + write to disk + Redis
 *   node scripts/build-atlas-index.mjs --dry-run    # preview only
 *   node scripts/build-atlas-index.mjs --no-redis   # skip Redis cache
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '..');
const args      = process.argv.slice(2);
const DRY_RUN   = args.includes('--dry-run');
const NO_REDIS  = args.includes('--no-redis');
const HOURS     = parseInt(args.find(a => a.startsWith('--hours='))?.split('=')[1] ?? '168', 10) || 168;

const DB_URL    = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const REDIS_URL = process.env.REDIS_URL    ?? 'redis://127.0.0.1:6379';
const pool      = new pg.Pool({
  connectionString: DB_URL,
  max: 4,
  connectionTimeoutMillis: 5000,
  statement_timeout: 30000,
  idleTimeoutMillis: 10000,
});
pool.on('error', () => {}); // suppress pool errors — main query will catch

console.log(`\n[atlas-index] ${DRY_RUN ? 'DRY-RUN' : 'BUILD'}  hits-window=${HOURS}h`);

// ── 1. Pull canonical file rows (one per file, dedup by relative_path) ──────
const t0 = Date.now();
// codebase_chunk_index has gpu_cluster/som_cluster/page_rank_score/community_id;
// code_retrieval_chunks has topo_class/topo_byte. Join on file_path.
const { rows: files } = await pool.query(`
  WITH per_chunk AS (
    SELECT DISTINCT ON (relative_path)
      relative_path,
      gpu_cluster,
      som_cluster,
      page_rank_score,
      community_id,
      enriched_at
    FROM codebase_chunk_index
    WHERE relative_path IS NOT NULL
    ORDER BY relative_path, enriched_at DESC NULLS LAST
  ),
  per_topo AS (
    SELECT DISTINCT ON (file_path)
      file_path,
      topo_class,
      topo_byte
    FROM code_retrieval_chunks
    WHERE file_path IS NOT NULL AND topo_class IS NOT NULL
    ORDER BY file_path, graph_authority_score DESC NULLS LAST
  )
  SELECT
    p.relative_path,
    t.topo_class,
    t.topo_byte,
    p.gpu_cluster,
    p.som_cluster,
    p.page_rank_score,
    p.community_id,
    p.enriched_at
  FROM per_chunk p
  LEFT JOIN per_topo t ON t.file_path = p.relative_path
                       OR t.file_path LIKE '%' || p.relative_path
`).catch(err => {
  console.warn(`  [atlas-index] DB unreachable: ${err.message} — continuing with 0 files`);
  return { rows: [] };
});
console.log(`  files indexed:           ${files.length}`);

// ── 2. Pull cluster_key (qdrant_cluster_members) per file ───────────────────
const { rows: clusterRows } = await pool.query(`
  SELECT
    file_path,
    array_agg(cluster_key ORDER BY membership_score DESC NULLS LAST) AS keys
  FROM qdrant_cluster_members
  WHERE file_path IS NOT NULL
  GROUP BY file_path
`).catch(() => ({ rows: [] }));
const clusterMap = new Map();
for (const r of clusterRows) {
  // Pick the first non-malformed key
  const best = (r.keys ?? []).find(k => k && /^[a-z-]+:/i.test(String(k))) ?? r.keys?.[0] ?? null;
  if (best) clusterMap.set(r.file_path, String(best));
}
console.log(`  cluster_key lookups:     ${clusterMap.size}`);

// ── 3. Pull graph_authority_score from code_retrieval_chunks (post-GDS) ─────
const { rows: authRows } = await pool.query(`
  SELECT
    file_path,
    max(graph_authority_score) AS ga
  FROM code_retrieval_chunks
  WHERE graph_authority_score IS NOT NULL
  GROUP BY file_path
`);
const authMap = new Map(authRows.map(r => [r.file_path, parseFloat(r.ga) || 0]));
console.log(`  authority scores:        ${authMap.size}`);

// ── 4. chunk_hit_log demand signal (last HOURS window) ─────────────────────
const { rows: hitRows } = await pool.query(`
  SELECT
    relative_path,
    count(*)::int                                  AS hits,
    avg(coalesce(rerank_score, score, 0))::real    AS avg_rerank
  FROM chunk_hit_log
  WHERE hit_at > now() - ($1 || ' hours')::interval
  GROUP BY relative_path
`, [String(HOURS)]).catch(() => ({ rows: [] }));
const hitMap = new Map(hitRows.map(r => [r.relative_path, { hits: r.hits, rs: parseFloat(r.avg_rerank) || 0 }]));
console.log(`  hits in last ${HOURS}h:        ${hitMap.size}`);

// ── 5. Resolve nearest AGENTS.md per file ──────────────────────────────────
const { rows: agentsRows } = await pool.query(`
  SELECT directory_path, jsonb_array_length(rules) AS rules_n,
         jsonb_array_length(tools) AS tools_n,
         array_length(qdrant_tags, 1) AS tags_n
  FROM agent_context_files
  ORDER BY length(directory_path) DESC
`);
const agentsDirs = agentsRows.map(r => ({
  dir:    r.directory_path,
  rules:  parseInt(r.rules_n,  10) || 0,
  tools:  parseInt(r.tools_n,  10) || 0,
  tags:   parseInt(r.tags_n,   10) || 0,
}));

function nearestAgents(filePath) {
  // walk up directory tree, longest-prefix match wins (agentsDirs is sorted desc by length)
  for (const a of agentsDirs) {
    if (filePath.startsWith(a.dir + '/') || filePath === a.dir) return a;
  }
  return null;
}

// ── 6. Build column-oriented rows ──────────────────────────────────────────
const SCHEMA = ['f', 'tc', 'tb', 'c', 'pr', 'ga', 'h', 'rs', 'a', 'rules', 'tools', 'tags'];
const fileRows = [];
const byCluster = new Map();
const byTopoClass = new Map();
const byAgentsDir = new Map();

for (const f of files) {
  const idx = fileRows.length;
  const c   = clusterMap.get(f.relative_path) ?? (f.gpu_cluster != null ? `gpu:${f.gpu_cluster}` : null);
  const ga  = authMap.get(f.relative_path) ?? 0;
  const hit = hitMap.get(f.relative_path);
  const a   = nearestAgents(f.relative_path);

  fileRows.push([
    f.relative_path,                                      // f
    f.topo_class ?? '',                                   // tc
    f.topo_byte ?? null,                                  // tb
    c ?? '',                                              // c
    Math.round((parseFloat(f.page_rank_score) || 0) * 1e4) / 1e4,  // pr
    Math.round(ga * 1e4) / 1e4,                           // ga
    hit?.hits ?? 0,                                       // h
    Math.round((hit?.rs ?? 0) * 1e3) / 1e3,               // rs
    a?.dir ?? '',                                         // a
    a?.rules ?? 0,                                        // rules
    a?.tools ?? 0,                                        // tools
    a?.tags  ?? 0,                                        // tags
  ]);

  if (c) {
    if (!byCluster.has(c)) byCluster.set(c, []);
    byCluster.get(c).push(idx);
  }
  if (f.topo_class) {
    if (!byTopoClass.has(f.topo_class)) byTopoClass.set(f.topo_class, []);
    byTopoClass.get(f.topo_class).push(idx);
  }
  if (a?.dir) {
    if (!byAgentsDir.has(a.dir)) byAgentsDir.set(a.dir, []);
    byAgentsDir.get(a.dir).push(idx);
  }
}

// ── 7. Compose the index ────────────────────────────────────────────────────
const stats = {
  files:         fileRows.length,
  clusters:      byCluster.size,
  topo_classes:  byTopoClass.size,
  agents_dirs:   byAgentsDir.size,
  with_authority: fileRows.filter(r => r[5] > 0).length,
  with_hits:     fileRows.filter(r => r[6] > 0).length,
  build_ms:      Date.now() - t0,
};

const atlas = {
  v: 1,
  generated_at: new Date().toISOString(),
  hours_window: HOURS,
  schema: SCHEMA,
  files: fileRows,
  indices: {
    by_cluster:    Object.fromEntries(byCluster),
    by_topo_class: Object.fromEntries(byTopoClass),
    by_agents_dir: Object.fromEntries(byAgentsDir),
  },
  stats,
};

console.log(`\n  stats:`);
for (const [k, v] of Object.entries(stats)) console.log(`    ${k.padEnd(16)} ${v}`);

// ── 8. Write outputs ────────────────────────────────────────────────────────
if (DRY_RUN) {
  console.log(`\n  [dry-run] would write ${fileRows.length} file rows`);
  await pool.end();
  process.exit(0);
}

const outDir   = resolve(ROOT, 'docs/atlas-index');
const fullPath = resolve(outDir, 'codebase-atlas.json');
const minPath  = resolve(outDir, 'codebase-atlas.min.json');
await mkdir(outDir, { recursive: true });

const fullJson = JSON.stringify(atlas, null, 2);
const minJson  = JSON.stringify(atlas);

await writeFile(fullPath, fullJson, 'utf8');
await writeFile(minPath,  minJson,  'utf8');
const fullKB = (fullJson.length / 1024).toFixed(1);
const minKB  = (minJson.length  / 1024).toFixed(1);
const ratio  = ((minJson.length / fullJson.length) * 100).toFixed(0);
console.log(`\n  ✓ wrote ${fullPath}  (${fullKB} KB)`);
console.log(`  ✓ wrote ${minPath}  (${minKB} KB, ${ratio}% of full)`);

if (!NO_REDIS) {
  try {
    const { default: Redis } = await import('ioredis');
    const r = new Redis(REDIS_URL, { lazyConnect: true });
    await r.connect();
    await r.setex('ace:atlas:latest',         24 * 3600, minJson);
    await r.setex('ace:atlas:latest:summary', 24 * 3600, JSON.stringify({
      generated_at: atlas.generated_at,
      hours_window: HOURS,
      ...stats,
    }));
    await r.quit().catch(() => {});
    console.log(`  ✓ Redis ace:atlas:latest set (${minKB} KB, 24h TTL)`);
  } catch (e) {
    console.warn(`  ⚠ Redis cache failed: ${e.message}`);
  }
}

// ── 9. Top-10 preview ───────────────────────────────────────────────────────
const top = [...fileRows]
  .map((r, i) => ({ i, blend: 0.4 * r[4] + 0.3 * r[5] + 0.2 * (r[6] / 10) + 0.1 * r[7], row: r }))
  .sort((a, b) => b.blend - a.blend)
  .slice(0, 10);
console.log(`\n  Top-10 by blend (0.4·PR + 0.3·GA + 0.2·hits/10 + 0.1·rerank):`);
for (const t of top) {
  console.log(`    ${t.blend.toFixed(3).padStart(6)}  pr=${String(t.row[4]).padStart(6)}  ga=${String(t.row[5]).padStart(6)}  h=${String(t.row[6]).padStart(3)}  ${t.row[0]}`);
}

// ── 10. Directory-level aggregation ─────────────────────────────────────────
//
// Groups files by their immediate parent directory and aggregates atlas
// signals into one card per directory. Uses path normalisation so cards
// generated from "src/lib/foo.ts" and "lib/foo.ts" land on the same dir.

function normalizeAtlasPath(path) {
  return String(path ?? '')
    .replace(/\\/g, '/')
    .replace(/^sveltekit-frontend\//, '')
    .replace(/^\.?\//, '')
    .replace(/^src\//, '');
}

function dirOf(path) {
  const i = path.lastIndexOf('/');
  return i === -1 ? '' : path.slice(0, i);
}

// AGENTS.md envelope content per dir (relations + tag/tool/constraint hints)
const { rows: relRows } = await pool.query(`
  SELECT source_key, target_key, relation, weight
  FROM agent_context_relations
  WHERE source_key LIKE 'agents:%'
`).catch(() => ({ rows: [] }));

const relationsByAgent = new Map();
for (const r of relRows) {
  const list = relationsByAgent.get(r.source_key) ?? { clusters: [], topo: [], tools: [], peers: [], parent: null };
  if (r.relation === 'COVERS_CLUSTER')      list.clusters.push(r.target_key);
  else if (r.relation === 'COVERS_TOPO_CLASS') list.topo.push(r.target_key.replace(/^topo:/, ''));
  else if (r.relation === 'REFERENCES_TOOL')  list.tools.push(r.target_key.replace(/^tool:/, ''));
  else if (r.relation === 'SHARES_TAGS')      list.peers.push(r.target_key);
  else if (r.relation === 'PARENT_OF')        list.parent = r.target_key;
  relationsByAgent.set(r.source_key, list);
}

// Karpathy GPU blend per file
let karpathyMap = new Map();
try {
  const { default: Redis } = await import('ioredis');
  const r = new Redis(REDIS_URL, { lazyConnect: true });
  await r.connect();
  const kHash = await r.hgetall('gpu:karpathy:scores').catch(() => ({}));
  for (const [k, v] of Object.entries(kHash)) {
    try {
      const obj = typeof v === 'string' ? JSON.parse(v) : v;
      const blend = obj.blend ?? obj.k ?? 0;
      // Store under both raw and normalised paths so karpathy hits land
      // regardless of which prefix the writer used.
      karpathyMap.set(k, blend);
      karpathyMap.set(normalizeAtlasPath(k), blend);
    } catch { /* skip */ }
  }
  await r.quit().catch(() => {});
} catch { /* karpathy unavailable */ }

// Build per-directory card
const dirMap = new Map();   // dir → card
for (let i = 0; i < fileRows.length; i++) {
  const row    = fileRows[i];
  const path   = row[0];
  const norm   = normalizeAtlasPath(path);
  const dir    = dirOf(path);
  const agentKey = row[8] ? `agents:${row[8]}/AGENTS.md` : '';
  const c      = row[3];
  const tc     = row[1];
  const ga     = row[5];
  const pr     = row[4];
  const hits   = row[6];
  const kBlend = karpathyMap.get(path) ?? karpathyMap.get(norm) ?? 0;
  const rel    = relationsByAgent.get(agentKey);

  let card = dirMap.get(dir);
  if (!card) {
    card = {
      d:           dir,
      a:           agentKey,
      p:           rel?.parent ?? '',
      n:           0,
      clusters:    new Set(),
      topo:        new Set(),
      tools:       new Set(),
      tags:        new Set(),
      pr:          0,
      auth:        0,
      authSum:     0,
      authN:       0,
      kgpu:        0,
      hits:        0,
      dirty:       0,
      top:         [],
      _files:      [],
    };
    dirMap.set(dir, card);
  }
  card.n++;
  card._files.push({ path, pr, ga, kBlend, hits });
  if (c)  card.clusters.add(c);
  if (tc) card.topo.add(tc);
  if (rel?.tools) for (const t of rel.tools) card.tools.add(t);
  card.pr     = Math.max(card.pr, pr);
  card.auth   = Math.max(card.auth, ga);
  card.authSum += ga;
  card.authN++;
  card.kgpu   = Math.max(card.kgpu, kBlend);
  card.hits  += hits;
}

// Compose final dir cards (sets → arrays, top-5 files, rank score)
const dirCards = [];
for (const card of dirMap.values()) {
  const sortedFiles = card._files.sort((a, b) =>
    (0.4 * b.pr + 0.3 * b.ga + 0.2 * b.kBlend + 0.1 * (b.hits / 10)) -
    (0.4 * a.pr + 0.3 * a.ga + 0.2 * a.kBlend + 0.1 * (a.hits / 10)),
  );
  const dirty = sortedFiles.filter(f => f.hits > 0).length;
  // Directory rank composite (0..1):
  //   0.25 maxAuth + 0.20 normKarpathy + 0.20 normHits
  // + 0.15 dirtyShare + 0.10 relDensity + 0.10 tagCoverage
  const normHits   = Math.min(1, card.hits / 50);
  const normKarp   = Math.min(1, card.kgpu / 3.5);
  const dirtyShare = card.n ? dirty / card.n : 0;
  const relDensity = Math.min(1, (card.clusters.size + card.topo.size) / 8);
  const tagCov     = Math.min(1, card.tools.size / 6);
  const rank = 0.25 * card.auth
             + 0.20 * normKarp
             + 0.20 * normHits
             + 0.15 * dirtyShare
             + 0.10 * relDensity
             + 0.10 * tagCov;

  dirCards.push({
    d:        card.d,
    a:        card.a,
    p:        card.p,
    n:        card.n,
    clusters: [...card.clusters],
    topo:     [...card.topo],
    tools:    [...card.tools].slice(0, 8),
    tags:     [...card.tags].slice(0, 8),
    pr:       Math.round(card.pr   * 1e3) / 1e3,
    auth:     Math.round(card.auth * 1e3) / 1e3,
    avgAuth:  Math.round((card.authSum / Math.max(card.authN, 1)) * 1e3) / 1e3,
    kgpu:     Math.round(card.kgpu * 1e3) / 1e3,
    hits:     card.hits,
    dirty,
    rank:     Math.round(rank * 1e3) / 1e3,
    top:      sortedFiles.slice(0, 5).map(f => f.path),
  });
}
dirCards.sort((a, b) => b.rank - a.rank);

console.log(`\n  Directory cards: ${dirCards.length}`);
console.log(`  Top-10 directories by rank:`);
for (const d of dirCards.slice(0, 10)) {
  console.log(`    ${d.rank.toFixed(3).padStart(6)}  files=${String(d.n).padStart(3)}  pr=${String(d.pr).padStart(6)}  hits=${String(d.hits).padStart(3)}  ${d.d}`);
}

// Write directory + top JSONs to memory/atlas/ (also keep docs/atlas-index/ for back-compat)
const memoryAtlasDir = resolve(ROOT, 'memory/atlas');
await mkdir(memoryAtlasDir, { recursive: true });

const dirsJson = JSON.stringify({
  v: 1,
  generated_at: atlas.generated_at,
  count: dirCards.length,
  cards: dirCards,
});
const topJson = JSON.stringify({
  v: 1,
  generated_at: atlas.generated_at,
  count: Math.min(50, dirCards.length),
  top: dirCards.slice(0, 50),
});

const mdLines = [
  `# Directory Atlas Recommendations`,
  ``,
  `> Generated: ${atlas.generated_at} · ${dirCards.length} directories · ${fileRows.length} files`,
  ``,
];
for (const d of dirCards.slice(0, 25)) {
  mdLines.push(`## \`${d.d || '(repo root)'}\``);
  mdLines.push(``);
  mdLines.push(`- Rank: **${d.rank.toFixed(3)}** · files=${d.n} · hits=${d.hits} · dirty=${d.dirty}`);
  mdLines.push(`- AGENTS: \`${d.a || '—'}\`${d.p ? ` (parent: \`${d.p}\`)` : ''}`);
  mdLines.push(`- Authority max=${d.auth} avg=${d.avgAuth}, PageRank max=${d.pr}, Karpathy blend=${d.kgpu}`);
  if (d.topo.length)     mdLines.push(`- Topo classes: ${d.topo.map(t => `\`${t}\``).join(', ')}`);
  if (d.clusters.length) mdLines.push(`- Clusters: ${d.clusters.slice(0, 4).map(c => `\`${c}\``).join(', ')}`);
  if (d.tools.length)    mdLines.push(`- Tools: ${d.tools.slice(0, 4).map(t => `\`${t}\``).join(', ')}`);
  if (d.top.length)      mdLines.push(`- Top files: ${d.top.slice(0, 3).map(f => `\`${f}\``).join(', ')}`);
  mdLines.push(``);
}

if (!DRY_RUN) {
  await writeFile(resolve(memoryAtlasDir, 'codebase-atlas.dirs.json'), dirsJson, 'utf8');
  await writeFile(resolve(memoryAtlasDir, 'codebase-atlas.top.json'),  topJson,  'utf8');
  await writeFile(resolve(memoryAtlasDir, 'codebase-atlas.latest.md'), mdLines.join('\n'), 'utf8');
  await writeFile(resolve(memoryAtlasDir, 'codebase-atlas.min.json'),  minJson,  'utf8');

  console.log(`\n  ✓ wrote memory/atlas/codebase-atlas.dirs.json   (${(dirsJson.length / 1024).toFixed(1)} KB)`);
  console.log(`  ✓ wrote memory/atlas/codebase-atlas.top.json    (${(topJson.length / 1024).toFixed(1)} KB)`);
  console.log(`  ✓ wrote memory/atlas/codebase-atlas.latest.md   (${(mdLines.join('\n').length / 1024).toFixed(1)} KB)`);

  if (!NO_REDIS) {
    try {
      const { default: Redis } = await import('ioredis');
      const r = new Redis(REDIS_URL, { lazyConnect: true });
      await r.connect();
      await r.setex('ace:atlas:dirs', 24 * 3600, dirsJson);
      // Per-directory cache for O(1) skill lookups
      const pipe = r.pipeline();
      for (const d of dirCards) {
        const slug = (d.d || '_root').replace(/[\/\(\)]/g, '_');
        pipe.setex(`ace:atlas:dir:${slug}`, 24 * 3600, JSON.stringify(d));
      }
      await pipe.exec().catch(() => {});
      await r.quit().catch(() => {});
      console.log(`  ✓ Redis ace:atlas:dirs + ace:atlas:dir:* set (${dirCards.length} keys, 24h TTL)`);
    } catch (e) {
      console.warn(`  ⚠ Redis dir cache failed: ${e.message}`);
    }
  }
}

await pool.end();
console.log();
