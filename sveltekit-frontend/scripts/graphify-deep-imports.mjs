#!/usr/bin/env node
/**
 * graphify-deep-imports.mjs - Phase A typed deep import graph
 *
 * Reads codebase-graph.json, enriches with zone/edge-type classifications,
 * computes bounded BFS neighborhoods for hotspots+routes+tests, and writes:
 *   memory/graphify/deep/deep-import-graph.json
 *   memory/graphify/deep/deep-import-edges.jsonl
 *   memory/graphify/deep/unresolved-imports.json
 *   memory/graphify/deep/route-dependency-map.json
 *   memory/graphify/deep/test-coverage-links.json
 *   memory/graphify/deep/graph-stats.json
 *   memory/graphify/deep/graphify-deep-summary.md
 *   memory/ingest/pending/graphify_deep_imports_<ts>.jsonl
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const GRAPH_JSON = join(ROOT, 'docs/graph/codebase-graph.json');
const OUT_DIR = join(ROOT, 'memory/graphify/deep');
const INGEST_DIR = join(ROOT, 'memory/ingest/pending');

// ── 0. Load graph ──────────────────────────────────────────────────────────

if (!existsSync(GRAPH_JSON)) {
  console.error('codebase-graph.json not found. Run: npm run graphify:map');
  process.exit(1);
}

const graph = JSON.parse(readFileSync(GRAPH_JSON, 'utf8'));
const files = graph.files ?? [];
console.log(`Loaded ${files.length} files from codebase-graph.json`);

// ── 1. Node lookup ────────────────────────────────────────────────────────

const nodeByRel = new Map();
for (const f of files) nodeByRel.set(f.rel, f);

// ── 2. $lib / relative resolver ───────────────────────────────────────────

const EXTS = [
  '', '.ts', '.svelte', '.js', '.mjs',
  '/index.ts', '/index.js',
  '/+server.ts', '/+page.ts', '/+page.svelte', '/+layout.svelte',
];

function resolveWithExts(base) {
  for (const ext of EXTS) {
    const c = base + ext;
    if (nodeByRel.has(c)) return c;
    if (c.endsWith('.js')) {
      const ts = c.slice(0, -3) + '.ts';
      if (nodeByRel.has(ts)) return ts;
    }
  }
  return null;
}

function resolveImport(spec, fromRel) {
  if (!spec) return null;
  const s = spec.split('?')[0].split('#')[0];
  if (s.startsWith('$lib/')) return resolveWithExts('src/lib/' + s.slice(5));
  if (s.startsWith('$app/') || s.startsWith('$env/') || s.startsWith('$service-worker')) {
    return 'SVELTEKIT:' + s;
  }
  if (s.startsWith('.')) {
    const parts = [];
    for (const p of [...fromRel.split('/').slice(0, -1), ...s.split('/')]) {
      if (p === '..') parts.pop();
      else if (p !== '.') parts.push(p);
    }
    return resolveWithExts(parts.join('/'));
  }
  if (/^(src|tests|scripts)\//.test(s)) return resolveWithExts(s);
  return null; // external
}

// ── 3. Zone classifier ─────────────────────────────────────────────────────

function zone(rel) {
  if (rel.startsWith('tests/') || /\.(spec|test)\.(ts|js|mjs)$/.test(rel)) return 'test';
  if (rel.startsWith('scripts/')) return 'script';
  if (/\.config\.(ts|js|mjs)$/.test(rel) || rel.includes('unocss.config')) return 'config';
  if (rel.endsWith('.d.ts') || rel.includes('/types/') || /types\.ts$/.test(rel)) return 'types';
  if (rel.startsWith('src/lib/server/')) return 'server';
  if (rel.startsWith('src/routes/')) return 'route';
  if (rel.startsWith('src/lib/') || rel.startsWith('src/')) return 'client';
  return 'shared';
}

// ── 4. Edge type + infra tag classifiers ──────────────────────────────────

// Keyword → tag map; used by both edgeType and infraTags to avoid duplication
const INFRA_KEYWORDS = [
  ['redis',                  'redis'],
  ['qdrant',                 'qdrant'],
  ['neo4j',                  'neo4j'],
  ['drizzle',                'drizzle'],
  ['/db/',                   'drizzle'],
  ['rabbitmq',               'rabbitmq'],
  ['amqp',                   'rabbitmq'],
  ['ollama',                 'llm'],
  ['gemma',                  'llm'],
  ['grpc',                   'grpc'],
  ['mcp',                    'mcp'],
];

function infraTags(fromRel, toRel, spec) {
  const combined = (toRel ?? '') + (spec ?? '') + fromRel;
  const seen = new Set();
  const t = [];
  for (const [kw, tag] of INFRA_KEYWORDS) {
    if (!seen.has(tag) && combined.includes(kw)) { seen.add(tag); t.push(tag); }
  }
  return t;
}

function edgeType(fromRel, spec, toRel, isDyn, isReEx) {
  if (isReEx) return 'exports_from';
  const combined = (toRel ?? '') + (spec ?? '') + fromRel;
  if ((spec ?? '').startsWith('$env/') || (toRel ?? '').includes('env.server')) return 'env_dependency';
  if ((toRel ?? '').includes('/db/') || (toRel ?? '').includes('schema') || (toRel ?? '').includes('drizzle')) return 'db_dependency';
  if (combined.includes('redis')) return 'redis_dependency';
  if (combined.includes('qdrant')) return 'qdrant_dependency';
  if (combined.includes('neo4j')) return 'neo4j_dependency';
  if (combined.includes('/mcp/') || combined.includes('mcp-server') || combined.includes('trace-mcp')) return 'mcp_tool_calls';
  const fromIsTest = fromRel.includes('.spec.') || fromRel.includes('.test.') || fromRel.startsWith('tests/');
  if (fromIsTest) return 'test_covers_file';
  const toIsServer = (toRel ?? '').startsWith('src/lib/server/') || (toRel ?? '').includes('+server.ts');
  if (fromRel.startsWith('src/routes/') && toIsServer) return 'server_route_depends_on';
  const fromIsPage = fromRel.includes('+page.svelte') || fromRel.includes('+layout.svelte');
  const toIsLoad = (toRel ?? '').includes('+page.server') || (toRel ?? '').includes('+layout.server');
  if (fromIsPage && toIsLoad) return 'svelte_route_uses_loader';
  return isDyn ? 'imports_dynamic' : 'imports_static';
}

// ── 5. Build typed edges ───────────────────────────────────────────────────

const edges = [];
const unresolvedMap = new Map();

function addEdge(from, spec, isDyn, isReEx) {
  const resolved = resolveImport(spec, from);
  if (!resolved) {
    const key = (spec.startsWith('.') || /^(src|tests|scripts)\//.test(spec))
      ? 'UNRESOLVED:' + spec
      : 'EXTERNAL:' + spec;
    if (!unresolvedMap.has(key)) unresolvedMap.set(key, new Set());
    unresolvedMap.get(key).add(from);
    edges.push({ from, to: key, type: edgeType(from, spec, null, isDyn, isReEx), resolved: false, isDyn, isReEx, tags: infraTags(from, null, spec) });
    return;
  }
  if (resolved.startsWith('SVELTEKIT:')) {
    edges.push({ from, to: resolved, type: 'env_dependency', resolved: false, isDyn, isReEx, tags: ['sveltekit'] });
    return;
  }
  edges.push({ from, to: resolved, type: edgeType(from, spec, resolved, isDyn, isReEx), resolved: true, isDyn, isReEx, tags: infraTags(from, resolved, spec) });
}

for (const f of files) {
  const from = f.rel;
  for (const s of f.imports ?? []) addEdge(from, s, false, false);
  for (const s of f.dynImports ?? []) addEdge(from, s, true, false);
  for (const s of f.reExports ?? []) addEdge(from, s, false, true);
  for (const dr of f.drizzleRefs ?? []) {
    if (typeof dr === 'string' && /^src\//.test(dr)) {
      edges.push({ from, to: dr, type: 'db_dependency', resolved: nodeByRel.has(dr), isDyn: false, isReEx: false, tags: ['drizzle'] });
    }
  }
}

console.log(`Built ${edges.length} typed edges`);

// ── 6. Enrich nodes ────────────────────────────────────────────────────────

const fanIn = new Map();
const fanOut = new Map();
for (const e of edges) {
  if (e.resolved && nodeByRel.has(e.to)) fanIn.set(e.to, (fanIn.get(e.to) ?? 0) + 1);
  if (e.resolved) fanOut.set(e.from, (fanOut.get(e.from) ?? 0) + 1);
}

const nodes = files.map(f => ({
  rel: f.rel,
  zone: zone(f.rel),
  isRoute: f.isRoute,
  isSvelteComp: f.isSvelteComp,
  isTest: f.isTest,
  lineCount: f.lineCount,
  hasAuth: f.hasAuth,
  hasZod: f.hasZod,
  directFanIn: fanIn.get(f.rel) ?? 0,
  directFanOut: fanOut.get(f.rel) ?? 0,
  hash: createHash('sha1').update(f.rel).digest('hex').slice(0, 8),
}));

// ── 7. Bounded BFS neighborhoods (hotspots + routes + tests only) ──────────

const MAX_DEPTH = 20, MAX_NODES = 500, MAX_EDGES = 1500;

const outAdj = new Map();
const inAdj = new Map();
for (const e of edges) {
  if (!e.resolved || !nodeByRel.has(e.to)) continue;
  if (!outAdj.has(e.from)) outAdj.set(e.from, []);
  outAdj.get(e.from).push(e.to);
  if (!inAdj.has(e.to)) inAdj.set(e.to, []);
  inAdj.get(e.to).push(e.from);
}

function bfs(start, dir) {
  const visited = new Set([start]);
  const queue = [{ rel: start, depth: 0 }];
  let ec = 0;
  while (queue.length && visited.size < MAX_NODES && ec < MAX_EDGES) {
    const { rel, depth } = queue.shift();
    if (depth >= MAX_DEPTH) continue;
    const nbrs = dir === 'out' ? (outAdj.get(rel) ?? []) : (inAdj.get(rel) ?? []);
    for (const n of nbrs) {
      if (ec++ >= MAX_EDGES) break;
      if (!visited.has(n) && visited.size < MAX_NODES) {
        visited.add(n);
        queue.push({ rel: n, depth: depth + 1 });
      }
    }
  }
  return { nodeCount: visited.size, truncated: visited.size >= MAX_NODES || ec >= MAX_EDGES };
}

const hotspots = [...nodes].sort((a, b) => b.directFanIn - a.directFanIn).slice(0, 50);
const routeNodes = nodes.filter(n => n.isRoute).slice(0, 50);
const testNodes = nodes.filter(n => n.isTest).slice(0, 30);
const subjects = [
  ...new Map([...hotspots, ...routeNodes, ...testNodes].map(n => [n.rel, n])).values(),
].slice(0, 100);

const neighborhoods = {};
for (const n of subjects) {
  const up = bfs(n.rel, 'in');
  const dn = bfs(n.rel, 'out');
  neighborhoods[n.rel] = {
    upstreamNodeCount: up.nodeCount,
    downstreamNodeCount: dn.nodeCount,
    upstreamTruncated: up.truncated,
    downstreamTruncated: dn.truncated,
  };
}
console.log(`Computed ${Object.keys(neighborhoods).length} neighborhoods`);

// ── 8. Route dep map + test coverage links ────────────────────────────────

const routeDepMap = {};
for (const n of nodes.filter(n => n.isRoute)) {
  const deps = outAdj.get(n.rel) ?? [];
  routeDepMap[n.rel] = {
    zone: n.zone,
    directDeps: deps.length,
    serverDeps: deps.filter(d => d.startsWith('src/lib/server/')).length,
    dbDeps: deps.filter(d => d.includes('/db/') || d.includes('schema')).length,
  };
}

const testLinks = {};
for (const e of edges) {
  if (e.type === 'test_covers_file' && e.resolved) {
    if (!testLinks[e.to]) testLinks[e.to] = [];
    testLinks[e.to].push(e.from);
  }
}

// ── 9. Stats ──────────────────────────────────────────────────────────────

const typeCount = {};
for (const e of edges) typeCount[e.type] = (typeCount[e.type] ?? 0) + 1;
const zoneCount = {};
for (const n of nodes) zoneCount[n.zone] = (zoneCount[n.zone] ?? 0) + 1;

const stats = {
  generatedAt: new Date().toISOString(),
  nodeCount: nodes.length,
  edgeCount: edges.length,
  resolvedEdges: edges.filter(e => e.resolved).length,
  unresolvedEdges: edges.filter(e => !e.resolved && e.to.startsWith('UNRESOLVED:')).length,
  externalEdges: edges.filter(e => !e.resolved && e.to.startsWith('EXTERNAL:')).length,
  edgeTypeBreakdown: typeCount,
  zoneBreakdown: zoneCount,
  hotspotCount: hotspots.length,
  routeCount: routeNodes.length,
  testCount: testNodes.length,
  neighborhoodsComputed: Object.keys(neighborhoods).length,
  coveredFiles: Object.keys(testLinks).length,
};

// ── 10. Write all artifacts ────────────────────────────────────────────────

mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(INGEST_DIR, { recursive: true });

writeFileSync(
  join(OUT_DIR, 'deep-import-graph.json'),
  JSON.stringify({ generatedAt: stats.generatedAt, sourceGraph: 'docs/graph/codebase-graph.json', stats, nodes, neighborhoods }, null, 2)
);
console.log('Wrote deep-import-graph.json');

writeFileSync(join(OUT_DIR, 'deep-import-edges.jsonl'), edges.map(e => JSON.stringify(e)).join('\n'));
console.log(`Wrote deep-import-edges.jsonl (${edges.length} edges)`);

const unresolvedOut = {};
for (const [k, v] of unresolvedMap) unresolvedOut[k] = [...v];
writeFileSync(join(OUT_DIR, 'unresolved-imports.json'), JSON.stringify(unresolvedOut, null, 2));
writeFileSync(join(OUT_DIR, 'route-dependency-map.json'), JSON.stringify(routeDepMap, null, 2));
writeFileSync(join(OUT_DIR, 'test-coverage-links.json'), JSON.stringify(testLinks, null, 2));
writeFileSync(join(OUT_DIR, 'graph-stats.json'), JSON.stringify(stats, null, 2));

// ── 11. ACE ingest JSONL ──────────────────────────────────────────────────

const ts = new Date().toISOString().replace(/[:.]/g, '-');
const ingestPath = join(INGEST_DIR, `graphify_deep_imports_${ts}.jsonl`);
const ingestRecords = [];

for (const n of nodes.filter(n => n.directFanIn >= 3 || n.isRoute || n.isTest)) {
  const nb = neighborhoods[n.rel];
  ingestRecords.push({
    source_kind: 'graphify_deep_imports',
    source_type: 'node_summary',
    stable_key: `node:${n.hash}:${n.rel}`,
    file_path: n.rel,
    zone: n.zone,
    isRoute: n.isRoute,
    isTest: n.isTest,
    directFanIn: n.directFanIn,
    directFanOut: n.directFanOut,
    upstreamNodeCount: nb?.upstreamNodeCount ?? null,
    downstreamNodeCount: nb?.downstreamNodeCount ?? null,
    text: `${n.rel} [zone=${n.zone}, fanIn=${n.directFanIn}, fanOut=${n.directFanOut}]` +
      (nb ? ` upstream=${nb.upstreamNodeCount} downstream=${nb.downstreamNodeCount}` : ''),
    generatedAt: stats.generatedAt,
  });
}

const top30 = [...nodes].sort((a, b) => b.directFanIn - a.directFanIn).slice(0, 30);
for (const n of top30) {
  const callers = (inAdj.get(n.rel) ?? []).slice(0, 10);
  ingestRecords.push({
    source_kind: 'graphify_deep_imports',
    source_type: 'hotspot_callers',
    stable_key: `hotspot:${n.hash}:${n.rel}`,
    file_path: n.rel,
    zone: n.zone,
    directFanIn: n.directFanIn,
    topCallers: callers,
    text: `Hotspot ${n.rel} (fanIn=${n.directFanIn}) called by: ${callers.slice(0, 5).join(', ')}`,
    generatedAt: stats.generatedAt,
  });
}

writeFileSync(ingestPath, ingestRecords.map(r => JSON.stringify(r)).join('\n'));
console.log(`Wrote ACE ingest: ${ingestRecords.length} records → ${ingestPath}`);

// ── 12. Summary markdown ──────────────────────────────────────────────────

const top20 = [...nodes].sort((a, b) => b.directFanIn - a.directFanIn).slice(0, 20);
const md = `# Deep Import Graph - Phase A
Generated: ${stats.generatedAt}

## Stats
| Metric | Value |
|--------|-------|
| Nodes | ${stats.nodeCount} |
| Total edges | ${stats.edgeCount} |
| Resolved edges | ${stats.resolvedEdges} |
| Unresolved (local) | ${stats.unresolvedEdges} |
| External refs | ${stats.externalEdges} |
| Neighborhoods computed | ${stats.neighborhoodsComputed} |
| Test-covered files | ${stats.coveredFiles} |

## Zone Breakdown
| Zone | Count |
|------|-------|
${Object.entries(zoneCount).sort((a, b) => b[1] - a[1]).map(([z, c]) => `| ${z} | ${c} |`).join('\n')}

## Edge Type Breakdown
| Type | Count |
|------|-------|
${Object.entries(typeCount).sort((a, b) => b[1] - a[1]).map(([t, c]) => `| ${t} | ${c} |`).join('\n')}

## Top 20 Coupling Hotspots (directFanIn)
| Rank | File | Zone | FanIn | FanOut |
|------|------|------|-------|--------|
${top20.map((n, i) => `| ${i + 1} | \`${n.rel}\` | ${n.zone} | ${n.directFanIn} | ${n.directFanOut} |`).join('\n')}
`;
writeFileSync(join(OUT_DIR, 'graphify-deep-summary.md'), md);

console.log('\n=== Deep Import Graph Complete ===');
console.log(`Nodes: ${stats.nodeCount}  Edges: ${stats.edgeCount}  Resolved: ${stats.resolvedEdges}`);
console.log('Top edge types:', Object.entries(typeCount).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t, c]) => `${t}:${c}`).join(', '));
console.log(`Top hotspot: ${top20[0]?.rel} (fanIn=${top20[0]?.directFanIn})`);
console.log(`Output: ${OUT_DIR}`);
