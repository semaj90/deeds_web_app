#!/usr/bin/env node
// EMBED-CALLER-CONVERGENCE-01 (bounded gate), step 1 + guard: classify every production source
// file that references a direct embedding endpoint, using the real import graph to separate live
// callers from dormant ones. Read-only.
//
//   node scripts/atlas/audit-embedding-direct-endpoints-v1.mjs [--out file] [--check] [--write-baseline]
//
// --check          fail (exit 1) when a file with a direct endpoint is neither in the tolerated
//                  baseline nor a declared transport owner (a NEW bypass).
// --write-baseline write the current LIVE direct-endpoint set as tolerated debt (explicit only).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = join(ROOT, 'sveltekit-frontend', 'src');
const BASELINE_PATH = join(ROOT, 'docs', 'architecture', 'embedding-direct-endpoint-baseline.json');

export const SCAN_EXT = /\.(ts|mts|js|mjs|svelte)$/;
const SKIP_DIR = new Set(['node_modules', '.svelte-kit', 'archive', 'archived', '__tests__', 'fixtures']);
const TEST_FILE = /\.(spec|test)\.[cm]?[tj]s$|\.d\.ts$/;

// Files that ARE the embedding transport/adapter layer, not consumers of it. Declared, not inferred.
export const TRANSPORT_OWNERS = new Set([
  'lib/server/embedding/embedding-execution-adapter-v1.ts',
  'lib/server/embedding/embedding-query-route-adapter-v1.ts',
  'lib/server/embedding/embedding-provider-v1.ts',
  'lib/server/embedding/embedding-backend-resolution.ts',
  'lib/server/embedding/embedding-contract.ts',
  'lib/server/embedding/embedding-contract-768.ts',
  'lib/server/embedding/canonical-embed.ts',
  'lib/server/embedding/ollama-embed.ts',
  'lib/server/embedding/embed.ts',
  'lib/server/embeddings/representation-contract-validator.ts',
  'lib/server/env.server.ts'
]);
export const DIAGNOSTIC_PATH = /(^|\/)(health|semantic-health)(\/|\.|$)|system-configuration/;

const ENTRY = /(^|\/)(\+(server|page\.server|layout\.server|page|layout)\.(ts|js|svelte)|hooks\.(server|client)\.[tj]s|service-worker\.[tj]s)$|^mcp\/(server|trace-mcp-server)\.ts$/;
const WORKER_ROOT = /^lib\/server\/workers\//;

/** A line is a DIRECT endpoint reference unless it is a bare relative call to the app's own route. */
export function classifyLine(line) {
  const t = line.trim();
  if (/^(\/\/|\*|\/\*)/.test(t)) return null;
  const hasEndpoint = /\/v1\/embeddings|\/api\/embeddings|\/api\/embed\b/.test(t);
  if (!hasEndpoint) return null;
  if (/\/v1\/embeddings/.test(t)) return 'V1_EMBEDDINGS';
  if (/fetch\(\s*[`'"]\/api\/embed/.test(t) || /^[`'"]\/api\/embed[`'"]/.test(t)) return 'INTERNAL_ROUTE';
  return 'DIRECT_API_EMBED';
}

export function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIR.has(entry.name)) walk(join(dir, entry.name), out);
    } else if (SCAN_EXT.test(entry.name) && !TEST_FILE.test(entry.name)) out.push(join(dir, entry.name));
  }
  return out;
}

const IMPORT_RE = /(?:from\s*|import\s*\(\s*|import\s+|require\s*\(\s*)['"]([^'"]+)['"]/g;

/** Resolve a specifier to a repo-relative src path, or null for packages / unresolved. */
export function resolveSpecifier(spec, fromRel, exists) {
  let base;
  if (spec.startsWith('$lib/')) base = `lib/${spec.slice(5)}`;
  else if (spec.startsWith('./') || spec.startsWith('../')) base = join(dirname(fromRel), spec).replaceAll('\\', '/');
  else return null;
  const stem = base.replace(/\.(js|mjs)$/, '');
  for (const candidate of [base, `${stem}.ts`, `${stem}.js`, `${stem}.svelte`, `${stem}.svelte.ts`, `${base}/index.ts`, `${base}/index.js`]) {
    if (exists(candidate)) return candidate;
  }
  return null;
}

export function buildGraph(files, read) {
  const set = new Set(files);
  const exists = (p) => set.has(p);
  const edges = new Map();
  for (const f of files) {
    const out = new Set();
    for (const m of read(f).matchAll(IMPORT_RE)) {
      const r = resolveSpecifier(m[1], f, exists);
      if (r) out.add(r);
    }
    edges.set(f, [...out]);
  }
  return edges;
}

export function reachableFrom(roots, edges) {
  const seen = new Set(roots);
  const stack = [...roots];
  while (stack.length) {
    for (const next of edges.get(stack.pop()) ?? []) if (!seen.has(next)) { seen.add(next); stack.push(next); }
  }
  return seen;
}

export function classifyFile({ file, kinds, reachableFromRoutes, reachableFromWorkers }) {
  if (TRANSPORT_OWNERS.has(file)) return 'TRANSPORT_OWNER';
  if (DIAGNOSTIC_PATH.test(file)) return 'DIAGNOSTIC';
  if (kinds.every((k) => k === 'INTERNAL_ROUTE')) return 'INTERNAL_ROUTE_ONLY';
  if (reachableFromRoutes) return 'LIVE_CONSUMER';
  if (reachableFromWorkers) return 'LIVE_CONSUMER_VIA_WORKER';
  return 'UNREACHABLE_DORMANT_CANDIDATE';
}

export function runCensus() {
  const files = walk(SRC).map((p) => relative(SRC, p).replaceAll('\\', '/'));
  const cache = new Map();
  const read = (f) => (cache.has(f) ? cache.get(f) : (cache.set(f, readFileSync(join(SRC, f), 'utf8')), cache.get(f)));
  const edges = buildGraph(files, read);
  const routeRoots = files.filter((f) => ENTRY.test(f));
  const workerRoots = files.filter((f) => WORKER_ROOT.test(f));
  const fromRoutes = reachableFrom(routeRoots, edges);
  const fromWorkers = reachableFrom(workerRoots, edges);
  const rows = [];
  for (const file of files) {
    const hits = [];
    read(file).split(/\r?\n/).forEach((line, i) => {
      const kind = classifyLine(line);
      if (kind) hits.push({ line: i + 1, kind });
    });
    if (!hits.length) continue;
    const kinds = [...new Set(hits.map((h) => h.kind))];
    rows.push({
      file, kinds, hitCount: hits.length,
      reachableFromRoutes: fromRoutes.has(file),
      reachableFromWorkers: fromWorkers.has(file),
      classification: classifyFile({ file, kinds, reachableFromRoutes: fromRoutes.has(file), reachableFromWorkers: fromWorkers.has(file) })
    });
  }
  rows.sort((a, b) => a.file.localeCompare(b.file));
  const summary = {};
  for (const r of rows) summary[r.classification] = (summary[r.classification] ?? 0) + 1;
  return { scannedFiles: files.length, routeRoots: routeRoots.length, workerRoots: workerRoots.length, summary, rows };
}

/** The gate: tolerated baseline of live direct-endpoint files; a new one fails. */
export function evaluateGuard(rows, baseline) {
  const tolerated = new Set(baseline?.tolerated ?? []);
  const live = rows.filter((r) => ['LIVE_CONSUMER', 'LIVE_CONSUMER_VIA_WORKER', 'UNREACHABLE_DORMANT_CANDIDATE'].includes(r.classification));
  const newBypasses = live.filter((r) => !tolerated.has(r.file)).map((r) => r.file);
  const resolvedSinceBaseline = [...tolerated].filter((f) => !live.some((r) => r.file === f));
  return { pass: newBypasses.length === 0, newBypasses, resolvedSinceBaseline };
}

function main() {
  const argv = process.argv.slice(2);
  const outIdx = argv.indexOf('--out');
  const census = runCensus();
  const baseline = existsSync(BASELINE_PATH) ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) : null;
  const guard = evaluateGuard(census.rows, baseline);
  if (argv.includes('--write-baseline')) {
    const live = census.rows.filter((r) => ['LIVE_CONSUMER', 'LIVE_CONSUMER_VIA_WORKER', 'UNREACHABLE_DORMANT_CANDIDATE'].includes(r.classification)).map((r) => r.file);
    mkdirSync(dirname(BASELINE_PATH), { recursive: true });
    writeFileSync(BASELINE_PATH, `${JSON.stringify({ schema: 'atlas.embedding-direct-endpoint-baseline.v1', purpose: 'Tolerated debt: production source files that reference a direct embedding endpoint outside the declared transport owners. A file NOT listed here that gains such a reference fails the guard. Shrinking this list is the migration; growing it needs a recorded reason.', tolerated: live }, null, 2)}\n`, 'utf8');
  }
  if (outIdx >= 0) {
    const out = resolve(argv[outIdx + 1]);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify({ schema: 'atlas.embedding-direct-endpoint-census.v1', ...census, guard, writesPerformed: false }, null, 2)}\n`, 'utf8');
  }
  console.log(JSON.stringify({ scannedFiles: census.scannedFiles, routeRoots: census.routeRoots, workerRoots: census.workerRoots, summary: census.summary, baselinePresent: Boolean(baseline), guard: { pass: guard.pass, newBypasses: guard.newBypasses.slice(0, 20), newBypassCount: guard.newBypasses.length, resolvedSinceBaseline: guard.resolvedSinceBaseline.length } }, null, 2));
  if (argv.includes('--check') && !guard.pass) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
