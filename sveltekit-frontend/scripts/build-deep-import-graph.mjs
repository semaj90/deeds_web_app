#!/usr/bin/env node
/**
 * Phase 1 — Deep Import Graph Builder
 *
 * Extends codebase-graph.json (1-hop) with:
 *   • Resolved $lib/ aliases + relative path normalization
 *   • Barrel index.ts re-export following (A → barrel → actual target)
 *   • Strongly Connected Components (true circular-dep chains with paths)
 *   • Transitive fan-in per file (how many files transitively depend on it)
 *   • Coupling hotspots (top-30 by transitive fan-in)
 *   • Orphans (0 direct AND 0 transitive importers, not an entrypoint)
 *   • Missing files (imported by 1+ files but absent from the graph)
 *
 * Outputs:
 *   docs/graph/deep-import-graph.json   — augmented node list + summary
 *   docs/graph/deep-import-graph.md     — human-readable report
 *   Redis  code:deep:manifest           — lightweight manifest (if --redis)
 *
 * Usage (from sveltekit-frontend/):
 *   node scripts/build-deep-import-graph.mjs [--neo4j] [--redis] [--quiet]
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname   = dirname(fileURLToPath(import.meta.url));
const ROOT        = resolve(__dirname, '..');
const GRAPH_JSON  = join(ROOT, 'docs', 'graph', 'codebase-graph.json');
const OUT_JSON    = join(ROOT, 'docs', 'graph', 'deep-import-graph.json');
const OUT_MD      = join(ROOT, 'docs', 'graph', 'deep-import-graph.md');

const QUIET       = process.argv.includes('--quiet');
const USE_REDIS   = process.argv.includes('--redis');
const USE_NEO4J   = process.argv.includes('--neo4j');

const log  = (...a) => { if (!QUIET) console.log(...a); };
const warn = (...a) => console.warn(...a);

// ── 1. Load graph ─────────────────────────────────────────────────────────────

if (!existsSync(GRAPH_JSON)) {
  warn('codebase-graph.json not found — run `npm run graphify:daily` first');
  process.exit(1);
}

const graph = JSON.parse(readFileSync(GRAPH_JSON, 'utf8'));
const rawNodes = graph.files ?? [];
log(`\n📊 Deep Import Graph Builder`);
log(`   Input: ${rawNodes.length} nodes from codebase-graph.json`);

// ── 2. Build node map (relPath → node) ────────────────────────────────────────

const nodeMap = new Map();       // rel → node (raw)
const allPaths = new Set();      // all known rel paths (for resolution)

for (const n of rawNodes) {
  const rel = n.rel?.replace(/\\/g, '/');
  if (!rel) continue;
  nodeMap.set(rel, n);
  allPaths.add(rel);
}

// ── 3. Alias + path resolver ──────────────────────────────────────────────────
// Resolves module paths (as stored in node.imports[]) → relative repo paths.
// Returns null for external npm packages or unresolvable paths.

const EXTS = ['.ts', '.svelte', '.js', '.mjs', '.cjs',
              '/index.ts', '/index.js', '/+page.svelte', '/+server.ts'];

function tryFile(base) {
  // exact match
  if (allPaths.has(base)) return base;
  // with extensions
  for (const ext of EXTS) {
    const c = base + ext;
    if (allPaths.has(c)) return c;
  }
  return null;
}

function resolveModulePath(imp, fromFile) {
  if (!imp || typeof imp !== 'string') return null;
  // external packages
  if (!imp.startsWith('.') && !imp.startsWith('/') && !imp.startsWith('$')) return null;

  let base;

  if (imp.startsWith('$lib/')) {
    base = imp.replace('$lib/', 'src/lib/');
  } else if (imp.startsWith('$app/') || imp.startsWith('$env/') || imp.startsWith('$service-worker')) {
    return null; // SvelteKit internals
  } else if (imp.startsWith('./') || imp.startsWith('../')) {
    const dir = dirname(fromFile);
    // naive relative resolution (no path.resolve to avoid OS path sep issues)
    const parts = (dir + '/' + imp).split('/');
    const resolved = [];
    for (const p of parts) {
      if (p === '..') resolved.pop();
      else if (p !== '.') resolved.push(p);
    }
    base = resolved.join('/');
  } else if (imp.startsWith('/')) {
    base = imp.slice(1);
  } else {
    return null;
  }

  // strip query/hash (e.g. ?raw, #anchor)
  base = base.split('?')[0].split('#')[0];
  // strip trailing .js → try .ts etc.
  if (base.endsWith('.js')) base = base.slice(0, -3);
  if (base.endsWith('.mjs')) base = base.slice(0, -4);

  return tryFile(base);
}

// ── 4. Build direct adjacency list ────────────────────────────────────────────
//  adj[from] = Set of resolved target relPaths
//  radj[to]  = Set of resolved source relPaths  (reverse graph)

const adj   = new Map(); // forward: who does this file import?
const radj  = new Map(); // reverse: who imports this file?
const missingRefs = new Map(); // unresolved path → Set of files that reference it

for (const rel of allPaths) {
  adj.set(rel, new Set());
  radj.set(rel, new Set());
}

let resolvedEdges = 0;
let unresolvedEdges = 0;

for (const [rel, node] of nodeMap) {
  const sources = [
    ...(node.imports   ?? []),
    ...(node.dynImports ?? []),
    ...(node.reExports  ?? []),
  ];
  for (const imp of sources) {
    const target = resolveModulePath(imp, rel);
    if (target) {
      adj.get(rel).add(target);
      radj.get(target).add(rel);
      resolvedEdges++;
    } else {
      // track external/unresolvable for missing-file detection
      if (imp && (imp.startsWith('.') || imp.startsWith('$lib/'))) {
        if (!missingRefs.has(imp)) missingRefs.set(imp, new Set());
        missingRefs.get(imp).add(rel);
        unresolvedEdges++;
      }
    }
  }
}

log(`   Resolved: ${resolvedEdges} edges, Unresolved: ${unresolvedEdges}`);

// ── 5. Tarjan SCC (cycle detection) ──────────────────────────────────────────
// Returns array of SCCs where size > 1 (these are true circular deps).

function tarjanSCC(graph) {
  let idx = 0;
  const stack = [];
  const onStack = new Set();
  const indices = new Map();
  const lowlinks = new Map();
  const sccs = [];

  function sc(v) {
    indices.set(v, idx);
    lowlinks.set(v, idx);
    idx++;
    stack.push(v);
    onStack.add(v);

    for (const w of (graph.get(v) ?? [])) {
      if (!indices.has(w)) {
        sc(w);
        lowlinks.set(v, Math.min(lowlinks.get(v), lowlinks.get(w)));
      } else if (onStack.has(w)) {
        lowlinks.set(v, Math.min(lowlinks.get(v), indices.get(w)));
      }
    }

    if (lowlinks.get(v) === indices.get(v)) {
      const scc = [];
      let w;
      do { w = stack.pop(); onStack.delete(w); scc.push(w); } while (w !== v);
      sccs.push(scc);
    }
  }

  // Iterative DFS to avoid stack overflow on deep graphs
  // Using explicit call stack
  const callStack = [];
  const iterators = new Map();

  for (const v of graph.keys()) {
    if (indices.has(v)) continue;

    // Push initial frame
    callStack.push({ v, phase: 'enter', parentV: null });

    while (callStack.length > 0) {
      const frame = callStack[callStack.length - 1];
      const { v: cur, phase } = frame;

      if (phase === 'enter') {
        if (indices.has(cur)) { callStack.pop(); continue; }
        indices.set(cur, idx);
        lowlinks.set(cur, idx);
        idx++;
        stack.push(cur);
        onStack.add(cur);
        frame.phase = 'iterate';
        iterators.set(cur, [...(graph.get(cur) ?? [])][Symbol.iterator]());
      }

      if (frame.phase === 'iterate') {
        const iter = iterators.get(cur);
        let done = false;
        while (true) {
          const next = iter.next();
          if (next.done) { done = true; break; }
          const w = next.value;
          if (!indices.has(w)) {
            callStack.push({ v: w, phase: 'enter', parentV: cur });
            break;
          } else if (onStack.has(w)) {
            lowlinks.set(cur, Math.min(lowlinks.get(cur), indices.get(w)));
          }
        }
        if (done) {
          // All neighbors visited — finalize
          if (frame.parentV !== null) {
            lowlinks.set(frame.parentV,
              Math.min(lowlinks.get(frame.parentV), lowlinks.get(cur)));
          }
          if (lowlinks.get(cur) === indices.get(cur)) {
            const scc = [];
            let w;
            do { w = stack.pop(); onStack.delete(w); scc.push(w); } while (w !== cur);
            sccs.push(scc);
          }
          callStack.pop();
        }
      }
    }
  }

  return sccs.filter(s => s.length > 1);
}

log(`   Running Tarjan SCC...`);
const cycles = tarjanSCC(adj);
log(`   Found ${cycles.length} circular dependency chains`);

// ── 6. Transitive fan-in (BFS on reverse graph) ───────────────────────────────
// For each node, count how many files transitively depend on it.
// We count only, not store, to keep memory bounded.

log(`   Computing transitive fan-in...`);

function countTransitiveFanIn(startNode, reverseAdj) {
  const visited = new Set();
  const queue = [startNode];
  while (queue.length > 0) {
    const cur = queue.shift();
    for (const importer of (reverseAdj.get(cur) ?? [])) {
      if (!visited.has(importer)) {
        visited.add(importer);
        queue.push(importer);
      }
    }
  }
  return visited.size;
}

// Only compute for files with ≥1 direct importer (optimization)
const transitiveFanIn = new Map();
let done = 0;
for (const rel of allPaths) {
  const directIn = radj.get(rel)?.size ?? 0;
  if (directIn > 0) {
    transitiveFanIn.set(rel, countTransitiveFanIn(rel, radj));
  } else {
    transitiveFanIn.set(rel, 0);
  }
  done++;
  if (!QUIET && done % 500 === 0) process.stdout.write(`\r   ${done}/${allPaths.size} files processed`);
}
if (!QUIET) process.stdout.write('\r\x1b[K');

// ── 7. Classify nodes ─────────────────────────────────────────────────────────

// Map each node to its SCC (if any cycle)
const cycleMap = new Map(); // rel → cycle index
cycles.forEach((scc, i) => scc.forEach(p => cycleMap.set(p, i)));

// Entrypoints: routes, layout, server hooks, test files, standalone scripts
const ENTRYPOINT_PATTERNS = [
  /\/routes\//,
  /\+page\.svelte$/, /\+layout\.svelte$/, /\+server\.ts$/, /\+page\.server\.ts$/,
  /\/hooks\.server\.ts$/, /\/hooks\.client\.ts$/,
  /\/scripts\//,
  /\.test\.(ts|js)$/, /\.spec\.(ts|js)$/, /playwright/,
  /\/workers\//,
  /\/(main|index)\.(ts|js|mjs)$/,
];

function isEntrypoint(rel) {
  return ENTRYPOINT_PATTERNS.some(p => p.test(rel));
}

// Orphans: 0 transitive importers AND not an entrypoint
const orphans = [];
for (const rel of allPaths) {
  if (transitiveFanIn.get(rel) === 0 && !isEntrypoint(rel)) {
    orphans.push(rel);
  }
}

// Hotspots: top 30 by transitive fan-in
const hotspots = [...allPaths]
  .filter(r => transitiveFanIn.get(r) > 0)
  .sort((a, b) => (transitiveFanIn.get(b) ?? 0) - (transitiveFanIn.get(a) ?? 0))
  .slice(0, 30);

// Missing file references (imported but not in graph)
const missingFiles = [...missingRefs.entries()]
  .sort((a, b) => b[1].size - a[1].size)
  .slice(0, 50)
  .map(([path, importers]) => ({ path, importerCount: importers.size, importers: [...importers].slice(0, 5) }));

// ── 8. Build augmented nodes ───────────────────────────────────────────────────

const augmentedNodes = rawNodes.map(n => {
  const rel = n.rel?.replace(/\\/g, '/');
  if (!rel) return n;
  return {
    ...n,
    rel,
    resolvedImports:   [...(adj.get(rel) ?? [])],
    directFanIn:       radj.get(rel)?.size ?? 0,
    transitiveFanIn:   transitiveFanIn.get(rel) ?? 0,
    cycleIndex:        cycleMap.has(rel) ? cycleMap.get(rel) : null,
    isEntrypoint:      isEntrypoint(rel),
    isOrphan:          transitiveFanIn.get(rel) === 0 && !isEntrypoint(rel),
  };
});

// ── 9. Summary stats ──────────────────────────────────────────────────────────

const stats = {
  fileCount:         rawNodes.length,
  resolvedEdges,
  unresolvedEdges,
  cycleCount:        cycles.length,
  filesInCycles:     cycleMap.size,
  orphanCount:       orphans.length,
  hotspotCount:      hotspots.length,
  missingFileCount:  missingFiles.length,
};

// ── 10. Write JSON output ─────────────────────────────────────────────────────

const output = {
  generatedAt: new Date().toISOString(),
  mode: 'deep-import-graph',
  stats,
  hotspots: hotspots.map(rel => ({
    rel,
    directFanIn:     radj.get(rel)?.size ?? 0,
    transitiveFanIn: transitiveFanIn.get(rel) ?? 0,
    summary:         nodeMap.get(rel)?.summary ?? null,
  })),
  cycles: cycles.map((scc, i) => ({ index: i, size: scc.length, files: scc })),
  orphans: orphans.slice(0, 200).map(rel => ({
    rel,
    lineCount: nodeMap.get(rel)?.lineCount ?? 0,
    ext:       nodeMap.get(rel)?.ext ?? '',
    summary:   nodeMap.get(rel)?.summary ?? null,
  })),
  missingFiles,
  nodes: augmentedNodes,
};

writeFileSync(OUT_JSON, JSON.stringify(output, null, 2));
log(`\n✓ deep-import-graph.json written (${augmentedNodes.length} nodes)`);

// ── 11. Write Markdown report ─────────────────────────────────────────────────

const md = `# Deep Import Graph Report
Generated: ${output.generatedAt}

## Stats
| Metric | Value |
|--------|-------|
| Files | ${stats.fileCount} |
| Resolved edges | ${stats.resolvedEdges} |
| Circular chains | ${stats.cycleCount} |
| Files in cycles | ${stats.filesInCycles} |
| Orphan files | ${stats.orphanCount} |
| Missing file refs | ${stats.missingFileCount} |

## Top 30 Coupling Hotspots
> Sorted by transitive fan-in (how many files depend on this file, directly or transitively)

| Rank | File | Direct FanIn | Transitive FanIn |
|------|------|-------------|-----------------|
${hotspots.map((rel, i) => {
  const d = radj.get(rel)?.size ?? 0;
  const t = transitiveFanIn.get(rel) ?? 0;
  return `| ${i+1} | \`${rel}\` | ${d} | ${t} |`;
}).join('\n')}

## Circular Dependency Chains (${cycles.length})
${cycles.length === 0 ? '_No cycles found_' : cycles.slice(0, 20).map((scc, i) =>
  `### Cycle ${i+1} (${scc.length} files)\n${scc.map(f => `- \`${f}\``).join('\n')}`
).join('\n\n')}

## Orphan Files (${orphans.length} files with 0 importers, not entrypoints)
> These may be dead code, dynamically imported, or need wiring

${orphans.slice(0, 50).map(rel => {
  const n = nodeMap.get(rel);
  return `- \`${rel}\` (${n?.lineCount ?? 0} lines)`;
}).join('\n')}
${orphans.length > 50 ? `\n_...and ${orphans.length - 50} more (see deep-import-graph.json)_` : ''}

## Possibly Missing Files (imported but not in graph)
| Path | Referenced by |
|------|--------------|
${missingFiles.slice(0, 20).map(m => `| \`${m.path}\` | ${m.importerCount} files |`).join('\n')}
`;

writeFileSync(OUT_MD, md);
log(`✓ deep-import-graph.md written`);

// ── 12. Redis (optional) ──────────────────────────────────────────────────────

if (USE_REDIS) {
  try {
    const { default: Redis } = await import('ioredis');
    const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', { lazyConnect: false });
    await redis.set('code:deep:manifest', JSON.stringify({
      generatedAt: output.generatedAt,
      stats,
      hotspots: hotspots.slice(0, 10).map(r => ({ rel: r, tfi: transitiveFanIn.get(r) })),
    }), 'EX', 86400);
    await redis.quit();
    log(`✓ Redis code:deep:manifest written`);
  } catch (e) {
    warn(`⚠ Redis write skipped: ${e.message}`);
  }
}

// ── 13. Neo4j TRANSITIVELY_IMPORTS edges (optional) ──────────────────────────

if (USE_NEO4J) {
  try {
    const neo4j = await import('neo4j-driver');
    const driver = neo4j.default.driver(
      process.env.NEO4J_URL ?? 'bolt://localhost:7687',
      neo4j.default.auth.basic(
        process.env.NEO4J_USER ?? 'neo4j',
        process.env.NEO4J_PASSWORD ?? 'neo4jpassword',
      ),
    );
    const session = driver.session();

    // Only write top 50 hotspots' transitive importers to keep batch size bounded
    let neo4jEdges = 0;
    for (const rel of hotspots) {
      const transImporters = [];
      const q = [rel];
      const vis = new Set();
      while (q.length) {
        const cur = q.shift();
        for (const imp of (radj.get(cur) ?? [])) {
          if (!vis.has(imp)) { vis.add(imp); q.push(imp); transImporters.push(imp); }
        }
      }
      if (transImporters.length === 0) continue;
      await session.run(
        `UNWIND $importers AS src
         MATCH (a:CodebaseFile {filePath: $target})
         MATCH (b:CodebaseFile {filePath: src})
         MERGE (b)-[:TRANSITIVELY_IMPORTS]->(a)`,
        { target: rel, importers: transImporters.slice(0, 200) },
      );
      neo4jEdges += transImporters.length;
    }

    await session.close();
    await driver.close();
    log(`✓ Neo4j: ${neo4jEdges} TRANSITIVELY_IMPORTS edges written`);
  } catch (e) {
    warn(`⚠ Neo4j write skipped: ${e.message}`);
  }
}

// ── 14. Final summary ─────────────────────────────────────────────────────────

console.log(`
📈 Deep Import Analysis Complete
   Resolved edges:     ${stats.resolvedEdges}
   Circular chains:    ${stats.cycleCount} (${stats.filesInCycles} files)
   Orphans:            ${stats.orphanCount}
   Missing file refs:  ${stats.missingFileCount}
   Top hotspot:        ${hotspots[0] ?? 'n/a'} (${transitiveFanIn.get(hotspots[0]) ?? 0} transitive deps)
   Output: docs/graph/deep-import-graph.json
`);
