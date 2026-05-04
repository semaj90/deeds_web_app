#!/usr/bin/env node
/**
 * analyze-graph.mjs
 *
 * Reads the JSON outputs from the Graphify pipeline and produces a prioritized
 * next_steps markdown report. No LLM, no GPU — pure aggregation + cross-join.
 *
 * Inputs:
 *   docs/graph/codebase-graph.json      (fast AST: files, gate stats, top fan-in, cycles)
 *   docs/graph/hypergraph-clusters.json (k-means cluster digest with topics, member files)
 *   tmp/hypergraph-assignments.ndjson   (chunk-id → cluster mapping)
 *
 * Outputs:
 *   next_steps/active/<YYYY-MM-DD>-graph-analysis.md
 *
 * Cross-correlations produced:
 *   - Auth gaps grouped by hypergraph cluster (which clusters need auth most)
 *   - Test coverage gaps grouped by cluster
 *   - High fan-in files (refactoring targets) with their cluster + neighbours
 *   - Cyclic dependency pairs (always actionable)
 *   - SSR-unsafe components clustered (which feature areas have most browser-globals)
 *   - Localhost references (env-var migration candidates)
 *   - Per-cluster prod-readiness score (0-100)
 *
 * Flags:
 *   --top N         show top N items per category (default 15)
 *   --no-write      print only, don't write markdown file
 *   --out PATH      override output path
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const TOP        = parseInt(process.argv.find(a => a.startsWith('--top='))?.split('=')[1] ?? '15', 10);
const NO_WRITE   = process.argv.includes('--no-write');
const OUT_OVERRIDE = process.argv.find(a => a.startsWith('--out='))?.split('=')[1];

const c = {
  green:  s => `\x1b[32m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`,
  red:    s => `\x1b[31m${s}\x1b[0m`,
  cyan:   s => `\x1b[36m${s}\x1b[0m`,
  bold:   s => `\x1b[1m${s}\x1b[0m`,
  dim:    s => `\x1b[2m${s}\x1b[0m`,
};

// ── Load inputs ─────────────────────────────────────────────────────────────

const graphPath    = path.join(ROOT, 'docs/graph/codebase-graph.json');
const clustersPath = path.join(ROOT, 'docs/graph/hypergraph-clusters.json');
const assignPath   = path.join(ROOT, 'tmp/hypergraph-assignments.ndjson');

if (!existsSync(graphPath)) {
  console.error(c.red(`Missing ${graphPath} — run npm run index:codebase:fast first`));
  process.exit(1);
}

const graph    = JSON.parse(readFileSync(graphPath, 'utf8'));
const clustersAvailable = existsSync(clustersPath);
const clusters = clustersAvailable ? JSON.parse(readFileSync(clustersPath, 'utf8')) : null;

console.log(c.bold('\n=== Graphify Analysis ===\n'));
console.log(c.dim(`Loaded: ${graph.files?.length ?? 0} files, ${graph.directories?.length ?? 0} dirs`));
console.log(c.dim(`Hypergraph: ${clusters?.clusters?.length ?? 0} clusters from ${clusters?.totalAssignments ?? 0} chunks`));
console.log();

// ── Helpers ─────────────────────────────────────────────────────────────────

const files = graph.files ?? [];
const dirs  = graph.directories ?? [];
const gateStats = graph.gateStats ?? graph.audit?.gateStats ?? {};
const cyclicPairs = graph.audit?.cyclicPairs ?? graph.cyclicPairs ?? [];
const topFanIn    = graph.audit?.topFanIn    ?? graph.topFanIn    ?? [];

// File-by-rel index for fast lookups
const fileByRel = new Map();
for (const f of files) fileByRel.set(f.rel, f);

// Directory-by-path index
const dirByPath = new Map();
for (const d of dirs) dirByPath.set(d.dir, d);

// ── Section 1: gate-stats summary ──────────────────────────────────────────

const totalRoutes = (gateStats.routesWithAuth ?? 0) + (gateStats.routesWithoutAuth ?? 0);
const authPct  = totalRoutes ? ((gateStats.routesWithAuth ?? 0) / totalRoutes * 100).toFixed(1) : 'N/A';
const zodPct   = totalRoutes ? ((gateStats.routesWithZod ?? 0)  / totalRoutes * 100).toFixed(1) : 'N/A';
const testPct  = totalRoutes
  ? (((gateStats.routesWithTest ?? 0) / ((gateStats.routesWithTest ?? 0) + (gateStats.routesWithoutTest ?? 0))) * 100).toFixed(1)
  : 'N/A';

console.log(c.bold('Gate coverage:'));
console.log(`  Auth:       ${gateStats.routesWithAuth ?? 0}/${totalRoutes} routes  (${authPct}%)  — ${c.red(gateStats.routesWithoutAuth ?? 0)} unguarded`);
console.log(`  Zod:        ${gateStats.routesWithZod ?? 0}/${totalRoutes} routes  (${zodPct}%)`);
console.log(`  Tests:      ${gateStats.routesWithTest ?? 0}/${(gateStats.routesWithTest ?? 0) + (gateStats.routesWithoutTest ?? 0)} routes  (${testPct}%)  — ${c.red(gateStats.routesWithoutTest ?? 0)} untested`);
console.log(`  SSR-unsafe: ${c.yellow(gateStats.ssrUnsafeCount ?? 0)} components`);
console.log(`  Localhost:  ${c.yellow(gateStats.filesWithLocalhost ?? 0)} files (env-var candidates)`);
console.log(`  Cycles:     ${c.red(gateStats.cyclicPairCount ?? 0)} cyclic pairs`);
console.log(`  $rune in .ts: ${gateStats.runeInTsCount ?? 0} (Svelte 5 leakage)`);
console.log();

// ── Section 2: per-file gate flag walk ─────────────────────────────────────
//
// Re-derive which specific files trigger which gate by walking files[] and
// applying the same heuristics. Gives us actionable lists.

const unguarded         = []; // API route handlers without auth (+server.ts only)
const noTest            = []; // API route handlers without paired test
const ssrUnsafe         = []; // components with browser globals
const localhost         = []; // ALL files with localhostRefs[]
const localhostBreaks   = []; // ONLY server-side files (production-breaking)
const runeInTs          = []; // .ts files (not .svelte.ts) using runes
const sv4Legacy         = []; // files still using Svelte 4 patterns

const isApiRoute = (f) => f.isRoute && (f.rel.endsWith('+server.ts') || f.rel.endsWith('+server.js'));

for (const f of files) {
  if (isApiRoute(f) && f.hasAuth === false) unguarded.push(f);
  if (isApiRoute(f) && f.hasPairedTest === false) noTest.push(f);
  if (f.ssrUnsafe) ssrUnsafe.push(f);
  if (Array.isArray(f.localhostRefs) ? f.localhostRefs.length > 0 : f.localhostRefs) localhost.push(f);
  if (f.localhostBreaks) localhostBreaks.push(f);
  if (f.sv4Legacy) sv4Legacy.push(f);
  if (f.runeInTs) runeInTs.push(f);
}

// ── Section 3: cluster cross-join ──────────────────────────────────────────
//
// For each cluster, count how many of its memberFiles fall into each gate-fail
// category. This tells us which feature areas need work most.

const clusterStats = new Map(); // clusterId → { auth, test, ssr, localhost, total }
function bumpCluster(id, key) {
  if (!clusterStats.has(id)) clusterStats.set(id, { auth: 0, test: 0, ssr: 0, localhost: 0, total: 0 });
  clusterStats.get(id)[key]++;
}

if (clusters?.clusters) {
  // Build path → clusterId map from member files
  const pathToCluster = new Map();
  for (const cl of clusters.clusters) {
    for (const mf of (cl.memberFiles ?? [])) {
      // memberFiles can be {path, count} or just a string
      const p = typeof mf === 'string' ? mf : mf.path;
      if (p && !pathToCluster.has(p)) pathToCluster.set(p, cl.id);
    }
  }

  // Now cross-reference gate-fail files
  const tally = (list, key) => {
    for (const f of list) {
      const cid = pathToCluster.get(f.rel);
      if (cid != null) bumpCluster(cid, key);
    }
  };
  tally(unguarded,  'auth');
  tally(noTest,     'test');
  tally(ssrUnsafe,  'ssr');
  tally(localhost,  'localhost');

  // Total (gate-fail file count per cluster)
  for (const stat of clusterStats.values()) {
    stat.total = stat.auth + stat.test + stat.ssr + stat.localhost;
  }
}

// ── Section 4: priority targets ────────────────────────────────────────────

// 4a — clusters ranked by total gate-fail density
const clusterPriority = clusters?.clusters
  ? [...clusters.clusters]
      .map(cl => ({ ...cl, gateFails: clusterStats.get(cl.id) ?? { auth: 0, test: 0, ssr: 0, localhost: 0, total: 0 } }))
      .filter(cl => cl.gateFails.total > 0)
      .sort((a, b) => b.gateFails.total - a.gateFails.total)
      .slice(0, TOP)
  : [];

// 4b — top fan-in files (refactor targets) annotated with cluster
const fanInWithCluster = topFanIn.slice(0, TOP).map(f => {
  const fileObj = fileByRel.get(f.rel ?? f.file);
  return {
    rel:      f.rel ?? f.file,
    fanIn:    f.fanIn ?? f.count ?? 0,
    cluster:  fileObj ? null : null,  // populated below if cluster data present
    summary:  fileObj?.summary ?? '',
  };
});

if (clusters?.clusters) {
  const pathToCluster = new Map();
  for (const cl of clusters.clusters) {
    for (const mf of (cl.memberFiles ?? [])) {
      const p = typeof mf === 'string' ? mf : mf.path;
      if (p) pathToCluster.set(p, cl.id);
    }
  }
  for (const item of fanInWithCluster) {
    item.cluster = pathToCluster.get(item.rel) ?? null;
  }
}

// ── Section 5: render markdown ─────────────────────────────────────────────

const today = new Date().toISOString().slice(0, 10);
const outPath = OUT_OVERRIDE ?? path.join(ROOT, '..', 'next_steps', 'active', `${today}-graph-analysis.md`);

const lines = [];
const push = (...l) => lines.push(...l);

push(`# Codebase Graph Analysis — ${today}`);
push('');
push(`Generated by \`scripts/analyze-graph.mjs\` from Graphify pipeline outputs.`);
push('');
push('## Sources');
push(`- \`docs/graph/codebase-graph.json\` — ${files.length} files, ${dirs.length} dirs`);
if (clusters) push(`- \`docs/graph/hypergraph-clusters.json\` — ${clusters.clusters?.length ?? 0} k-means clusters from ${clusters.totalAssignments ?? 0} chunks`);
push('');

push('## Gate coverage at a glance');
push('');
push('| Gate | Pass | Fail | Coverage |');
push('|------|------|------|----------|');
push(`| Auth guards | ${gateStats.routesWithAuth ?? 0} | ${gateStats.routesWithoutAuth ?? 0} | ${authPct}% |`);
push(`| Zod validation | ${gateStats.routesWithZod ?? 0} | ${gateStats.routesWithoutZod ?? 0} | ${zodPct}% |`);
push(`| Route tests | ${gateStats.routesWithTest ?? 0} | ${gateStats.routesWithoutTest ?? 0} | ${testPct}% |`);
push(`| SSR-safe components | — | ${gateStats.ssrUnsafeCount ?? 0} | — |`);
push(`| Hardcoded localhost | — | ${gateStats.filesWithLocalhost ?? 0} | — |`);
push(`| Cyclic deps | — | ${gateStats.cyclicPairCount ?? 0} | — |`);
push(`| Runes in plain .ts | — | ${gateStats.runeInTsCount ?? 0} | — |`);
push('');

// 1. Auth gaps
push(`## 1. Unguarded routes (${unguarded.length})`);
push('');
if (unguarded.length === 0) {
  push('_None — all routes have auth checks._');
} else {
  push('| Route | Summary |');
  push('|-------|---------|');
  for (const f of unguarded.slice(0, TOP)) {
    push(`| \`${f.rel}\` | ${(f.summary ?? '').slice(0, 80).replace(/\|/g, '\\|')} |`);
  }
  if (unguarded.length > TOP) push(`\n_…${unguarded.length - TOP} more_`);
}
push('');

// 2. Untested routes
push(`## 2. Routes without paired tests (${noTest.length})`);
push('');
if (noTest.length === 0) {
  push('_None — every route has a test._');
} else {
  push(`Total: ${noTest.length}. Sample (top ${Math.min(TOP, noTest.length)}):`);
  push('');
  push('| Route |');
  push('|-------|');
  for (const f of noTest.slice(0, TOP)) push(`| \`${f.rel}\` |`);
  if (noTest.length > TOP) push(`\n_…${noTest.length - TOP} more_`);
  push('');
  push('**Action:** `npm run audit:test-stubs` writes scaffolds. `npm run test:stubs:progress` runs them.');
}
push('');

// 3. SSR-unsafe
push(`## 3. SSR-unsafe components (${ssrUnsafe.length})`);
push('');
if (ssrUnsafe.length === 0) {
  push('_None._');
} else {
  push('| Component | Hint |');
  push('|-----------|------|');
  for (const f of ssrUnsafe.slice(0, TOP)) {
    const hint = (f.summary ?? '').slice(0, 70).replace(/\|/g, '\\|');
    push(`| \`${f.rel}\` | ${hint} |`);
  }
  if (ssrUnsafe.length > TOP) push(`\n_…${ssrUnsafe.length - TOP} more_`);
  push('');
  push('**Action:** wrap browser globals in `onMount()` or `typeof window !== \'undefined\'`, or set `export const ssr = false` on demo routes.');
}
push('');

// 4. Localhost (split: production-breaking server-side vs cosmetic client-side)
push(`## 4. Hardcoded localhost (${localhost.length} total — ${localhostBreaks.length} server-side production-breaking)`);
push('');
if (localhost.length === 0) {
  push('_None._');
} else if (localhostBreaks.length === 0) {
  push(`All ${localhost.length} hits are client-side fallback constants — safe in dev, no production impact (Vite substitutes at build time).`);
} else {
  push(`### 4a. Server-side (real bugs — fix these first)`);
  push('');
  push('These run inside Node.js process at request time and **will break in Docker/prod** when `localhost` resolves to the wrong network namespace.');
  push('');
  push('| File | First ref |');
  push('|------|-----------|');
  for (const f of localhostBreaks.slice(0, TOP)) {
    const ref = Array.isArray(f.localhostRefs) ? f.localhostRefs[0] : '?';
    push(`| \`${f.rel}\` | \`${ref}\` |`);
  }
  if (localhostBreaks.length > TOP) push(`\n_…${localhostBreaks.length - TOP} more_`);
  push('');
  push('**Action:** import from `$lib/server/env.server.js` and use `ENV.OLLAMA_URL`, `ENV.QDRANT_URL`, etc. The DEV fallback there already points to `http://localhost:PORT` so behaviour is identical in dev but production env vars take effect.');
  push('');

  const clientSide = localhost.filter(f => !localhostBreaks.includes(f));
  if (clientSide.length > 0) {
    push(`### 4b. Client-side (cosmetic — Vite handles in prod)`);
    push('');
    push(`${clientSide.length} client-side hits in \`src/lib/components/\`, \`src/lib/ai/\`, etc. These run in the browser; \`localhost\` resolves to the user's machine. Use \`PUBLIC_*\` env vars from \`$env/static/public\` if you need build-time substitution.`);
    push('');
  }
}
push('');

// 4b. Runes in plain .ts (svelte 5 leakage — runes are inert outside .svelte/.svelte.ts)
push(`## 4b. Runes in plain .ts files (${runeInTs.length})`);
push('');
if (runeInTs.length === 0) {
  push('_None._');
} else {
  push('Files using `$state`/`$derived`/`$effect`/`$props` syntax outside `.svelte` or `.svelte.ts` — runes are inert in plain .ts and produce no reactivity.');
  push('');
  push('| File |');
  push('|------|');
  for (const f of runeInTs.slice(0, TOP)) push(`| \`${f.rel}\` |`);
  if (runeInTs.length > TOP) push(`\n_…${runeInTs.length - TOP} more_`);
  push('');
  push('**Action:** rename to `.svelte.ts` (works in stores/utils used by Svelte components), OR refactor to plain TS classes/functions if the file has no Svelte consumer.');
}
push('');

// 5. Cyclic pairs
push(`## 5. Cyclic dependencies (${cyclicPairs.length})`);
push('');
if (cyclicPairs.length === 0) {
  push('_None._');
} else {
  for (const pair of cyclicPairs.slice(0, TOP)) {
    const a = pair.a ?? pair[0];
    const b = pair.b ?? pair[1];
    push(`- \`${a}\` ↔ \`${b}\``);
  }
  if (cyclicPairs.length > TOP) push(`\n_…${cyclicPairs.length - TOP} more_`);
  push('');
  push('**Action:** extract shared types/utils into a third module both can import.');
}
push('');

// 6. Top fan-in (refactor leverage points)
push(`## 6. Top fan-in files (refactor leverage points)`);
push('');
if (fanInWithCluster.length === 0) {
  push('_No fan-in data._');
} else {
  push('Files imported by the most other modules. Changes here have the largest blast radius.');
  push('');
  push('| Fan-in | File | Cluster | Summary |');
  push('|--------|------|---------|---------|');
  for (const item of fanInWithCluster) {
    const cl = item.cluster != null ? `#${item.cluster}` : '—';
    const summary = (item.summary ?? '').slice(0, 60).replace(/\|/g, '\\|');
    push(`| ${item.fanIn} | \`${item.rel}\` | ${cl} | ${summary} |`);
  }
}
push('');

// 7. Hypergraph clusters by gate-fail density
push(`## 7. Cluster priorities (by gate-fail density)`);
push('');
if (clusterPriority.length === 0) {
  push('_No hypergraph clusters loaded — run `npm run hypergraph:digest` first._');
} else {
  push('Clusters ranked by combined gate-fail count (auth + test + ssr + localhost).');
  push('Investigate these feature areas first.');
  push('');
  push('| # | Size | Topic | Auth | Test | SSR | Localhost | Total |');
  push('|---|------|-------|------|------|-----|-----------|-------|');
  for (const cl of clusterPriority) {
    const gf = cl.gateFails;
    const topic = (cl.inferredTopic ?? '?').slice(0, 60).replace(/\|/g, '\\|');
    push(`| ${cl.id} | ${cl.size} | ${topic} | ${gf.auth} | ${gf.test} | ${gf.ssr} | ${gf.localhost} | **${gf.total}** |`);
  }
  push('');
  push('**Cross-reference:** see `docs/graph/hypergraph-clusters.md` for full per-cluster member lists.');
}
push('');

// 8. Action plan
push('## 8. Suggested action plan');
push('');
push('Ordered by ROI (impact ÷ effort):');
push('');
let order = 1;
if ((gateStats.cyclicPairCount ?? 0) > 0) push(`${order++}. **Break cyclic deps** (${gateStats.cyclicPairCount}) — small change, removes an entire class of bugs.`);
if ((gateStats.routesWithoutAuth ?? 0) > 0) push(`${order++}. **Add auth guards** to ${gateStats.routesWithoutAuth} unguarded routes — security baseline.`);
if ((gateStats.runeInTsCount ?? 0) > 0) push(`${order++}. **Move runes out of \`.ts\`** (${gateStats.runeInTsCount}) — runes are inert in plain .ts; rename to \`.svelte.ts\` or refactor.`);
if ((gateStats.filesWithLocalhost ?? 0) > 0) push(`${order++}. **Migrate hardcoded localhost** (${gateStats.filesWithLocalhost} files) → \`ENV.*\` getters — unblocks Docker/prod.`);
if ((gateStats.ssrUnsafeCount ?? 0) > 0) push(`${order++}. **SSR-guard browser globals** (${gateStats.ssrUnsafeCount} components) — wrap in \`onMount()\` or set \`ssr=false\`.`);
if ((gateStats.routesWithoutTest ?? 0) > 0) push(`${order++}. **Fill test coverage gaps** (${gateStats.routesWithoutTest} routes) — \`npm run audit:test-stubs\` scaffolds, \`npm run test:stubs:progress\` runs.`);
push('');

// 9. How to refresh
push('## 9. Refresh this report');
push('');
push('```bash');
push('# Quick refresh (~10s, no LLM):');
push('npm run graphify:daily');
push('npm run hypergraph:digest');
push('node scripts/analyze-graph.mjs');
push('');
push('# Full refresh (~30 min, hits Ollama):');
push('npm run graphify:full');
push('npm run hypergraph:digest');
push('node scripts/analyze-graph.mjs');
push('```');
push('');

const output = lines.join('\n');

// ── Console summary ─────────────────────────────────────────────────────────

console.log(c.bold('Findings:'));
console.log(`  Unguarded routes:  ${c.red((gateStats.routesWithoutAuth ?? 0).toString().padStart(4))}`);
console.log(`  Untested routes:   ${c.yellow((gateStats.routesWithoutTest ?? 0).toString().padStart(4))}`);
console.log(`  SSR-unsafe comps:  ${c.yellow((gateStats.ssrUnsafeCount ?? 0).toString().padStart(4))}`);
console.log(`  Hardcoded localhost: ${c.yellow((gateStats.filesWithLocalhost ?? 0).toString().padStart(4))}`);
console.log(`  Cyclic pairs:      ${c.red((gateStats.cyclicPairCount ?? 0).toString().padStart(4))}`);
console.log(`  Rune-in-.ts:       ${c.yellow((gateStats.runeInTsCount ?? 0).toString().padStart(4))}`);
console.log();
console.log(c.bold('Top 5 cluster hotspots (by gate-fail density):'));
for (const cl of clusterPriority.slice(0, 5)) {
  const topic = (cl.inferredTopic ?? '?').slice(0, 60);
  console.log(`  #${String(cl.id).padStart(3)}  size=${String(cl.size).padStart(4)}  fails=${cl.gateFails.total}  ${c.dim(topic)}`);
}
console.log();

if (NO_WRITE) {
  console.log(c.dim('--no-write: skipping markdown output'));
} else {
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, output, 'utf8');
  const relOut = path.relative(path.resolve(ROOT, '..'), outPath).replace(/\\/g, '/');
  console.log(`${c.green('✓')} Wrote ${c.cyan(relOut)} (${output.length.toLocaleString()} chars, ${lines.length} lines)`);
}
