#!/usr/bin/env node
// EMBED-CALLER-CONVERGENCE-01 (bounded gate): classify every production source file that references
// a direct embedding endpoint, using the real import graph and the local call structure to separate
// callers from wrappers, transport owners, non-callers and dormant code. Read-only.
//
//   node scripts/atlas/audit-embedding-direct-endpoints-v1.mjs [--out file] [--check] [--write-baseline]
//
// --check          fail (exit 1) when a production file gains a direct embedding CALL that is neither
//                  a declared transport owner nor in the tolerated baseline.
// --write-baseline write the current guarded set as tolerated debt (explicit only).
//
// Classes: LIVE_DIRECT_CALLER, LIVE_WRAPPER, TRANSPORT_OWNER, ROUTE_REACHABLE_NONCALLER,
//   FIXTURE, TEST, DIAGNOSTIC, LEGACY, DORMANT, DEAD. TEST/fixture files remain outside the
//   production census; LEGACY/DEAD require explicit evidence, since import-graph absence proves neither.
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
  'lib/server/embedding/embedding-provider-executor-v1.ts',
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
export const FIXTURE_PATH = /(^|\/)(__mocks__|mocks?|stubs?|fixtures?|examples?|demos?)(\/|$)/;
// Classes the ratchet guards. A non-caller, a facade-only route, a fixture or a diagnostic cannot bypass.
export const GUARDED_CLASSES = new Set(['LIVE_DIRECT_CALLER', 'LIVE_WRAPPER']);

const ENTRY = /(^|\/)(\+(server|page\.server|layout\.server|page|layout)\.(ts|js|svelte)|hooks\.(server|client)\.[tj]s|service-worker\.[tj]s)$|^mcp\/(server|trace-mcp-server)\.ts$/;
const ROUTE_HANDLER = /(^|\/)\+(server|page\.server|layout\.server)\.(ts|js)$/;
const WORKER_ROOT = /^lib\/server\/workers\//;
// Includes repo fetch wrappers such as `ollamaFetch(` / `safeFetch(` (any identifier ending in Fetch).
const CALL_SITE = /\b(axios|got|request|post|ky|undici)\s*\(|\b[A-Za-z_$]*[Ff]etch\s*\(|\.(post|request|fetch)\s*\(|new\s+Request\s*\(/;

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

/**
 * Is the endpoint string at `index` used in a request, or only mentioned (a constant, a URL
 * builder, a log or doc string)? A call-shaped token within 6 lines before or 3 after counts.
 */
export function isCallSite(lines, index) {
  const from = Math.max(0, index - 6);
  const to = Math.min(lines.length - 1, index + 3);
  for (let i = from; i <= to; i += 1) if (CALL_SITE.test(lines[i])) return true;
  // The endpoint is stored in a variable (`const EMBED_URL = ...`, `endpoint = '/api/embeddings'`)
  // and requested elsewhere in the file: follow that one hop.
  const assigned = /(?:^|\s)(?:const|let|var)?\s*([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*[`'"{]/.exec(lines[index]);
  if (assigned) {
    const name = assigned[1];
    const use = new RegExp(`\\b${name.replace(/\$/g, '\\$')}\\b`);
    for (let i = 0; i < lines.length; i += 1) if (i !== index && use.test(lines[i]) && CALL_SITE.test(lines[i])) return true;
  }
  return false;
}

const FN_DECL = [
  /^\s*(export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/,
  /^\s*(export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:\(|function|[A-Za-z_$][\w$]*\s*=>)/,
  /^\s{2,}(?:public\s+|private\s+|protected\s+|static\s+)*(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?::[^{;]+)?\{\s*$/
];

/** Nearest preceding function-like declaration, with whether it is exported. Heuristic. */
export function enclosingFunction(lines, index) {
  for (let i = index; i >= 0; i -= 1) {
    for (let k = 0; k < FN_DECL.length; k += 1) {
      const m = FN_DECL[k].exec(lines[i]);
      if (!m) continue;
      if (k === 2) {
        const name = m[1];
        if (/^(if|for|while|switch|catch|function|return)$/.test(name)) continue;
        return { name, exported: false, kind: 'method' };
      }
      return { name: m[2], exported: Boolean(m[1]), kind: 'function' };
    }
  }
  return null;
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

/** A wrapper owns a transport call inside an exported embedding-ish function other modules import. */
const WRAPPER_NAME = /embed|vector|encode/i;

export function classifyFile({ file, hits, reachableFromRoutes, reachableFromWorkers, manualClassification = null }) {
  if (TRANSPORT_OWNERS.has(file)) return 'TRANSPORT_OWNER';
  if (DIAGNOSTIC_PATH.test(file)) return 'DIAGNOSTIC';
  if (FIXTURE_PATH.test(file)) return 'FIXTURE';
  if (TEST_FILE.test(file)) return 'TEST';
  if (manualClassification === 'LEGACY' || manualClassification === 'DEAD') return manualClassification;
  if (hits.every((h) => h.kind === 'INTERNAL_ROUTE')) return 'LIVE_WRAPPER';
  const direct = hits.filter((h) => h.kind !== 'INTERNAL_ROUTE');
  const calls = direct.filter((h) => h.isCall);
  const live = reachableFromRoutes || reachableFromWorkers;
  if (!calls.length) return live ? 'ROUTE_REACHABLE_NONCALLER' : 'DORMANT';
  if (!live) return 'DORMANT';
  if (ROUTE_HANDLER.test(file)) return 'LIVE_DIRECT_CALLER';
  if (calls.some((h) => h.enclosing?.exported && WRAPPER_NAME.test(h.enclosing.name))) return 'LIVE_WRAPPER';
  return 'LIVE_DIRECT_CALLER';
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
    const lines = read(file).split(/\r?\n/);
    const hits = [];
    lines.forEach((line, i) => {
      const kind = classifyLine(line);
      if (!kind) return;
      hits.push({ line: i + 1, kind, isCall: isCallSite(lines, i), enclosing: enclosingFunction(lines, i) });
    });
    if (!hits.length) continue;
    rows.push({
      file,
      kinds: [...new Set(hits.map((h) => h.kind))],
      hitCount: hits.length,
      callCount: hits.filter((h) => h.isCall && h.kind !== 'INTERNAL_ROUTE').length,
      enclosing: [...new Set(hits.filter((h) => h.enclosing).map((h) => `${h.enclosing.exported ? 'export ' : ''}${h.enclosing.name}`))].slice(0, 4),
      reachableFromRoutes: fromRoutes.has(file),
      reachableFromWorkers: fromWorkers.has(file),
      classification: classifyFile({ file, hits, reachableFromRoutes: fromRoutes.has(file), reachableFromWorkers: fromWorkers.has(file) })
    });
  }
  rows.sort((a, b) => a.file.localeCompare(b.file));
  const summary = {};
  for (const r of rows) summary[r.classification] = (summary[r.classification] ?? 0) + 1;
  return { scannedFiles: files.length, routeRoots: routeRoots.length, workerRoots: workerRoots.length, summary, rows };
}

/** The ratchet: new live direct callers/wrappers fail. Facade-only /api/embed clients and dormant
 *  code are visible in the census but do not count as endpoint bypasses. */
export function evaluateGuard(rows, baseline) {
  const tolerated = new Set(baseline?.tolerated ?? []);
  const guarded = rows.filter((r) => GUARDED_CLASSES.has(r.classification)
    && !(r.classification === 'LIVE_WRAPPER' && r.kinds?.every((kind) => kind === 'INTERNAL_ROUTE')));
  const newBypasses = guarded.filter((r) => !tolerated.has(r.file)).map((r) => r.file);
  const resolvedSinceBaseline = [...tolerated].filter((f) => !guarded.some((r) => r.file === f));
  return { pass: newBypasses.length === 0, newBypasses, resolvedSinceBaseline };
}

function main() {
  const argv = process.argv.slice(2);
  const outIdx = argv.indexOf('--out');
  const census = runCensus();
  const baseline = existsSync(BASELINE_PATH) ? JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) : null;
  const guard = evaluateGuard(census.rows, baseline);
  if (argv.includes('--write-baseline')) {
    const tolerated = census.rows.filter((r) => GUARDED_CLASSES.has(r.classification)
      && !(r.classification === 'LIVE_WRAPPER' && r.kinds?.every((kind) => kind === 'INTERNAL_ROUTE'))).map((r) => r.file);
    mkdirSync(dirname(BASELINE_PATH), { recursive: true });
    writeFileSync(BASELINE_PATH, `${JSON.stringify({ schema: 'atlas.embedding-direct-endpoint-baseline.v2', purpose: 'Tolerated debt: route/worker-reachable production files that directly call an embedding endpoint or wrap such a call, excluding calls to the application /api/embed facade. A new caller/wrapper file fails the guard. Non-callers, facade-only routes, fixtures, diagnostics and dormant code are not guarded. Shrinking this list is the migration; growing it needs a recorded reason.', tolerated }, null, 2)}\n`, 'utf8');
  }
  if (outIdx >= 0) {
    const out = resolve(argv[outIdx + 1]);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify({ schema: 'atlas.embedding-direct-endpoint-census.v2', ...census, guard, writesPerformed: false }, null, 2)}\n`, 'utf8');
  }
  console.log(JSON.stringify({ scannedFiles: census.scannedFiles, routeRoots: census.routeRoots, workerRoots: census.workerRoots, summary: census.summary, baselinePresent: Boolean(baseline), guard: { pass: guard.pass, newBypasses: guard.newBypasses.slice(0, 20), newBypassCount: guard.newBypasses.length, resolvedSinceBaseline: guard.resolvedSinceBaseline.length } }, null, 2));
  if (argv.includes('--check') && !guard.pass) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
