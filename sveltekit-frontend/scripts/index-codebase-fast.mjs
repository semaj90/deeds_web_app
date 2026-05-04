#!/usr/bin/env node
/**
 * Fast AST Codebase Indexer — 20-Gate Deep Audit
 *
 * CPU-only, no GPU required. Scans source files via regex heuristics and writes:
 *   - Redis  code:index:* keys (6h TTL)
 *   - Redis  wiki:note:dir:* keys (24h TTL) — consumed by ACE KAG directory context
 *   - docs/graph/codebase-graph.json — machine-readable full index
 *   - docs/graph/codebase-graph.md  — graph plan (--write-plan)
 *   - docs/graph/codebase-map.md    — human-readable directory + deep audit map
 *
 * Usage:
 *   node scripts/index-codebase-fast.mjs [--write-plan] [--skip-redis] [--src <dir>]
 *
 * ACE source priority:
 *   Qdrant > ACP > hg:edge/SOM/Neo4j > fast-ast (score cap 0.07) > static scan
 *
 * 20-Gate Audit:
 *   G1  Static ESM imports          G11 Hardcoded localhost/port
 *   G2  Dynamic imports             G12 Type-only imports (import type)
 *   G3  Barrel re-exports           G13 Dead exports (exported, never imported)
 *   G4  Auth guard                  G14 Svelte 5 rune compliance (4 sub-checks)
 *   G5  Zod validation              G15 SSR safety (window/document/localStorage)
 *   G6  Route handler methods       G16 Test file pairing
 *   G7  Drizzle schema refs         G17 Error handling (try/catch or safe())
 *   G8  TODO/FIXME markers          G18 Route depth + param extraction
 *   G9  Line count                  G19 Import fan-in (how many files import this)
 *   G10 Component sub-imports       G20 Cyclic import risk (mutual dependency pairs)
 */

import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');
const SRC_DIR   = path.resolve(ROOT, 'src');
const GRAPH_DIR = path.resolve(ROOT, 'docs', 'graph');

const WRITE_PLAN   = process.argv.includes('--write-plan');
const SKIP_REDIS   = process.argv.includes('--skip-redis');
const SRC_OVERRIDE = (() => {
  const idx = process.argv.indexOf('--src');
  return idx !== -1 ? path.resolve(process.argv[idx + 1]) : null;
})();

const scanRoot = SRC_OVERRIDE ?? SRC_DIR;

// ── Redis (optional) ──────────────────────────────────────────────────────────

let redis = null;
if (!SKIP_REDIS) {
  try {
    const { default: Redis } = await import('ioredis');
    redis = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', {
      lazyConnect:          true,
      connectTimeout:       3000,
      maxRetriesPerRequest: 1,
    });
    await redis.ping();
  } catch {
    console.warn('⚠️  Redis unavailable — skipping cache writes');
    redis = null;
  }
}

const REDIS_TTL     = 6  * 3600; // 6h  — file/tag/manifest keys
const WIKI_NOTE_TTL = 24 * 3600; // 24h — wiki:note:dir keys

async function rset(key, value, ttl = REDIS_TTL) {
  if (!redis) return;
  try {
    await redis.setex(key, ttl, typeof value === 'string' ? value : JSON.stringify(value));
  } catch { /* non-fatal */ }
}

// ── File discovery ────────────────────────────────────────────────────────────

const EXTENSIONS   = new Set(['.ts', '.svelte', '.js', '.mjs', '.cjs', '.json']);
const EXCLUDE_DIRS = new Set([
  'node_modules', '.svelte-kit', 'build', 'dist', '.git', '__mocks__', '__tests__',
]);

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (EXCLUDE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (EXTENSIONS.has(path.extname(entry.name))) {
      yield full;
    }
  }
}

// ── Regex patterns ────────────────────────────────────────────────────────────

// G1 — static ESM imports
const RE_IMPORT      = /import\s+(?:type\s+)?(?:\{[^}]*\}|[\w*]+(?:\s+as\s+\w+)?)\s+from\s+['"]([^'"]+)['"]/g;
// G1b — type-only imports with capture (erased at compile time, do not create runtime cycles)
const RE_TYPE_IMPORT_PATH = /import\s+type\s+(?:\{[^}]*\}|[\w*]+(?:\s+as\s+\w+)?)\s+from\s+['"]([^'"]+)['"]/g;
// G2 — dynamic imports
const RE_DYN_IMPORT  = /(?:await\s+)?import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
const RE_DYN_VAR     = /@vite-ignore/;
// G3 — barrel re-exports
const RE_REEXPORT    = /export\s+(?:\*|\{[^}]*\})\s+from\s+['"]([^'"]+)['"]/g;
// G4 — auth guard (locals.user, cast pattern, requireAuth, getSession, DEV_BYPASS)
// Also treat (app)/ routes as auth-guarded — layout.server.ts enforces redirect
const RE_AUTH        = /locals\.user|requireAuth|getSession|DEV_BYPASS_AUTH|\(locals\s+as\s+\{/;
function isLayoutGuarded(rel) {
  // Routes under (app)/ are protected by +layout.server.ts auth redirect
  return rel.includes('/routes/(app)/') || rel.includes('/routes/(admin)/');
}
// G5 — Zod validation (direct z.*, zod import, named schema from $lib/schemas, or .safeParse/.parse call)
const RE_ZOD         = /\bz\.\w+|from\s+['"]zod['"]|zodSchema|zod\(|from\s+['"][^'"]*\/schemas\/|\.safeParse\(|\.parse\(|Schema\s*=\s*z\./;
// G6 — route handlers (both const and function form)
const RE_ROUTE_H     = /export\s+(?:(?:async\s+)?function\s+|const\s+)(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g;
// G7 — Drizzle schema refs
const RE_DRIZZLE     = /\b(pgTable|mysqlTable|sqliteTable|InferSelect|InferInsert|drizzle)\b/g;
// G8 — TODO/FIXME
const RE_TODO        = /\/\/\s*(TODO|FIXME|HACK|XXX)[:\s]/g;
// G10 — component sub-imports from svelte files
const RE_COMPONENT   = /<([A-Z][A-Za-z0-9]+)\s/g;
// G11 — hardcoded localhost / raw port references
const RE_LOCALHOST   = /['"`](https?:\/\/(?:localhost|127\.0\.0\.1):\d+)/g;
const RE_RAW_PORT    = /:\s*(?:5432|6379|6333|9000|5672|50051|8090|11434|3040)\b/;
// G12 — type-only imports
const RE_TYPE_IMPORT = /import\s+type\s+/g;
// G14 — Svelte 4 anti-patterns
const RE_SV4_PROPS   = /\bexport\s+let\s+\w+/;
const RE_SV4_REACT   = /^\s*\$:[^:]/m;
const RE_SV4_EVENT   = /\bon:[a-z][a-z]+=\s*\{/;
const RE_SV4_DISPATCH= /createEventDispatcher\(\)/;
const RE_RUNE_IN_TS  = /\$(?:state|derived|effect|props)\s*[(<]/;
// G15 — SSR unsafe globals
const RE_SSR_UNSAFE  = /\b(?:window|document|localStorage|sessionStorage|IndexedDB)\b/;
const RE_SSR_GUARD   = /typeof\s+window|onMount|browser\s*&&|import\.meta\.env\.SSR/;
// G17 — error handling
const RE_TRY_CATCH   = /\btry\s*\{/;
const RE_SAFE_FN     = /\bsafe\s*\(|\bloadError\b/;
// G18 — route params
const RE_ROUTE_PARAM = /\[([^\]]+)\]/g;
// Export names (for G13 dead export detection)
const RE_EXPORT_NAME = /export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var|type|interface|enum)\s+([\w$]+)/g;
// Script block check for svelte components
const RE_SVELTE_SCRIPT = /<script[^>]*>/;

// ── Per-file metadata extraction (all 20 gates) ───────────────────────────────

function extractMeta(filePath, src) {
  const rel    = path.relative(ROOT, filePath).replace(/\\/g, '/');
  const ext    = path.extname(filePath);
  const isTest = rel.includes('/tests/') || rel.includes('.test.') || rel.includes('.spec.');
  const isRoute = rel.includes('/routes/') && (
    rel.endsWith('+server.ts') || rel.endsWith('+page.server.ts') ||
    rel.endsWith('+page.svelte') || rel.endsWith('+layout.svelte')
  );
  const isServerRoute = rel.endsWith('+server.ts') || rel.endsWith('+page.server.ts');
  const isSvelteComp  = ext === '.svelte' && RE_SVELTE_SCRIPT.test(src);

  // G1 — static imports
  const imports = [...src.matchAll(RE_IMPORT)].map(m => m[1]);
  // G1b — type-only imports (compile-time erased, cannot form runtime cycles)
  const typeImports = new Set([...src.matchAll(RE_TYPE_IMPORT_PATH)].map(m => m[1]));
  // G2 — dynamic imports
  const dynImports    = [...src.matchAll(RE_DYN_IMPORT)].map(m => m[1]);
  const hasViteIgnore = RE_DYN_VAR.test(src);
  // G3 — barrel re-exports
  const reExports = [...src.matchAll(RE_REEXPORT)].map(m => m[1]);
  // G4 — auth (inline guard OR layout-level protection)
  const hasAuth = RE_AUTH.test(src) || isLayoutGuarded(rel);
  // G5 — zod
  const hasZod = RE_ZOD.test(src);
  // G6 — route handlers
  const routeHandlers = [...src.matchAll(RE_ROUTE_H)].map(m => m[1]);
  // G7 — drizzle
  const drizzleRefs = [...new Set([...src.matchAll(RE_DRIZZLE)].map(m => m[1]))];
  // G8 — todos
  const todos = [...src.matchAll(RE_TODO)].map(m => m[1]);
  // G9 — line count
  const lineCount = src.split('\n').length;
  // G10 — components
  const components = ext === '.svelte'
    ? [...new Set([...src.matchAll(RE_COMPONENT)].map(m => m[1]))]
    : [];
  // G11 — hardcoded localhost
  const localhostRefs = [...src.matchAll(RE_LOCALHOST)].map(m => m[1]);
  const hasRawPort    = RE_RAW_PORT.test(src) && !rel.includes('env.server');
  // G12 — type-only imports
  const typeImportCount = (src.match(RE_TYPE_IMPORT) ?? []).length;
  // G13 — exported names (cross-referenced later for dead export detection)
  const exportedNames = [...src.matchAll(RE_EXPORT_NAME)].map(m => m[1]);
  // G14 — Svelte 4 compliance (only in .svelte files)
  const sv4Props    = ext === '.svelte' && RE_SV4_PROPS.test(src);
  const sv4Reactive = ext === '.svelte' && RE_SV4_REACT.test(src);
  const sv4Events   = ext === '.svelte' && RE_SV4_EVENT.test(src);
  const sv4Dispatch = ext === '.svelte' && RE_SV4_DISPATCH.test(src);
  const runeInTs    = ext === '.ts' && !rel.endsWith('.svelte.ts') && !rel.endsWith('.d.ts') && RE_RUNE_IN_TS.test(src);
  // G15 — SSR safety
  const ssrUnsafe = RE_SSR_UNSAFE.test(src) && !RE_SSR_GUARD.test(src);
  // G16 — test pairing (resolved later via cross-file pass)
  // G17 — error handling
  const hasTryCatch = RE_TRY_CATCH.test(src);
  const hasSafeFn   = RE_SAFE_FN.test(src);
  // G18 — route depth + params
  const routeParams = isRoute
    ? [...(rel.match(RE_ROUTE_PARAM) ?? [])].map(m => m.replace(/^\[|\]$/g, ''))
    : [];
  const routeDepth  = isRoute ? rel.split('/').length - 1 : 0;

  const summaryMatch = src.match(/\/\*\*\s*\n?\s*\*?\s*([^\n*@]+)/);
  const summary      = summaryMatch ? summaryMatch[1].trim() : '';

  const segments = rel.split('/').filter(Boolean);
  const tags = [
    ext.replace('.', ''),
    ...segments.slice(0, 3),
    isRoute          ? 'route'       : null,
    isSvelteComp     ? 'component'   : null,
    routeHandlers.length ? 'api-handler' : null,
    drizzleRefs.length   ? 'db-schema'   : null,
    todos.length         ? 'has-todo'    : null,
    hasAuth              ? 'auth'        : null,
    hasZod               ? 'zod'         : null,
    isTest               ? 'test'        : null,
    ssrUnsafe            ? 'ssr-unsafe'  : null,
    sv4Props || sv4Reactive || sv4Events || sv4Dispatch ? 'svelte4-legacy' : null,
  ].filter(Boolean);

  return {
    rel, ext, isRoute, isServerRoute, isSvelteComp, isTest,
    // G1-G3
    imports, dynImports, hasViteIgnore, reExports, typeImports,
    // G4-G8
    hasAuth, hasZod, routeHandlers, drizzleRefs, todos,
    // G9-G12
    lineCount, components, localhostRefs, hasRawPort, typeImportCount,
    // G13 (cross-ref later)
    exportedNames,
    // G14
    sv4Props, sv4Reactive, sv4Events, sv4Dispatch, runeInTs,
    // G15
    ssrUnsafe,
    // G17
    hasTryCatch, hasSafeFn,
    // G18
    routeParams, routeDepth,
    summary, tags,
  };
}

// ── Main scan ─────────────────────────────────────────────────────────────────

console.log(`🔍 Fast AST codebase index — scanning ${scanRoot}`);
const t0 = Date.now();

const files        = [];
let routeCount     = 0;
let componentCount = 0;
let apiCount       = 0;
let dbTableCount   = 0;
let todoCount      = 0;

for (const filePath of walk(scanRoot)) {
  let src;
  try { src = fs.readFileSync(filePath, 'utf8'); } catch { continue; }

  const meta = extractMeta(filePath, src);
  files.push(meta);

  if (meta.isRoute)              routeCount++;
  if (meta.isSvelteComp)         componentCount++;
  if (meta.routeHandlers.length) apiCount++;
  if (meta.drizzleRefs.length)   dbTableCount++;
  todoCount += meta.todos.length;

  const pathHash = createHash('sha1').update(meta.rel).digest('hex').slice(0, 12);
  const fileHash = createHash('sha1').update(src.slice(0, 4096)).digest('hex').slice(0, 12);

  await rset(`code:index:file:${fileHash}`, {
    rel: meta.rel, summary: meta.summary, tags: meta.tags, routeHandlers: meta.routeHandlers,
  });
  await rset(`code:index:path:${pathHash}`, {
    rel: meta.rel, imports: meta.imports.slice(0, 20), exports: meta.exportedNames.slice(0, 20),
  });
}

// ── Cross-file analysis passes ────────────────────────────────────────────────

// G13 — Dead export detection: build global import set, flag exports never imported
const allImportedSymbols = new Set();
for (const f of files) {
  // Extract named symbols from import statements (rough: from { A, B } patterns)
  for (const imp of f.imports) {
    allImportedSymbols.add(imp); // module path coverage
  }
  // Also track re-export paths
  for (const re of f.reExports) {
    allImportedSymbols.add(re);
  }
}
// Build export-name → file map; mark as potentially dead if name appears in 0 other files' src
// (lightweight: count files where exportedName appears as an import target substring)
const exportImportCounts = {};
for (const f of files) {
  for (const name of f.exportedNames) {
    exportImportCounts[name] = (exportImportCounts[name] ?? 0);
  }
}
for (const f of files) {
  const srcKey = f.imports.join(' ') + ' ' + f.dynImports.join(' ');
  for (const name of Object.keys(exportImportCounts)) {
    if (srcKey.includes(name)) exportImportCounts[name]++;
  }
}

// G19 — Fan-in: how many files import each module path
const fanIn = {};
for (const f of files) {
  for (const imp of [...f.imports, ...f.dynImports]) {
    fanIn[imp] = (fanIn[imp] ?? 0) + 1;
  }
}
// Add fan-in count to each file's own rel path
for (const f of files) {
  // Normalize rel to module path format used in imports
  const modPath = f.rel
    .replace(/^src\//, '$lib/')
    .replace(/\/index\.(ts|js|svelte)$/, '')
    .replace(/\.(ts|js|svelte)$/, '');
  f.fanIn = (fanIn[modPath] ?? 0) + (fanIn[f.rel] ?? 0);
}

// G16 — Test pairing: check if a test file exists for each server route / lib module
const testRels = new Set(files.filter(f => f.isTest).map(f => f.rel));
for (const f of files) {
  const stem = f.rel
    .replace(/\/\+server\.ts$/, '')
    .replace(/\/\+page\.server\.ts$/, '')
    .replace(/\.(ts|js|svelte)$/, '');
  // Look for matching test file pattern
  const hasPairedTest = testRels.has(`${stem}.test.ts`) ||
    testRels.has(`${stem}.spec.ts`) ||
    [...testRels].some(t => t.includes(path.basename(stem)));
  f.hasPairedTest = hasPairedTest;
}

// G20 — Cyclic import risk: detect mutual A→B and B→A pairs (runtime only, excludes type-only imports)
const importMap = {};
for (const f of files) {
  const ti = f.typeImports ?? new Set();
  importMap[f.rel] = new Set([...f.imports, ...f.dynImports].filter(i => !ti.has(i)));
}
const cyclicPairs = [];
const seen = new Set();
for (const [rel, deps] of Object.entries(importMap)) {
  for (const dep of deps) {
    // Resolve relative dep to a rel path
    const depRel = dep.startsWith('.')
      ? path.relative(ROOT, path.resolve(path.dirname(path.join(ROOT, rel)), dep)).replace(/\\/g, '/').replace(/\.(ts|js)$/, '')
      : null;
    if (!depRel) continue;
    const depFull = files.find(f => f.rel === depRel || f.rel.startsWith(depRel + '.') || f.rel === depRel + '/index.ts');
    if (!depFull || depFull.rel === rel) continue; // skip self-loops
    // Strict mutual: B's imports must contain a relative path that resolves back to A
    const reverseDeps = importMap[depFull.rel] ?? new Set();
    const aBase = path.basename(rel, path.extname(rel));
    const aDir = path.dirname(rel);
    const mutual = [...reverseDeps].some(d => {
      if (!d.startsWith('.')) return false;
      const resolved = path.relative(ROOT, path.resolve(path.dirname(path.join(ROOT, depFull.rel)), d)).replace(/\\/g, '/').replace(/\.(ts|js)$/, '');
      return resolved === rel.replace(/\.(ts|js|svelte)$/, '') || (path.basename(resolved) === aBase && path.dirname(resolved) === aDir);
    });
    if (mutual) {
      const key = [rel, depFull.rel].sort().join('↔');
      if (!seen.has(key)) { seen.add(key); cyclicPairs.push([rel, depFull.rel]); }
    }
  }
}

// Tag → files aggregate
const tagMap = {};
for (const f of files) {
  for (const tag of f.tags) {
    if (!tagMap[tag]) tagMap[tag] = [];
    if (tagMap[tag].length < 50) tagMap[tag].push(f.rel);
  }
}
for (const [tag, paths] of Object.entries(tagMap)) {
  await rset(`code:index:tag:${tag}`, paths);
}

// Route → file mapping
for (const f of files.filter(f => f.isRoute)) {
  const routeKey = f.rel.replace('src/routes', '').replace(/\/\+\w+\.(?:svelte|ts)$/, '');
  await rset(`code:index:route:${routeKey || '/'}`, f.rel);
}

// ── Directory-level aggregation ───────────────────────────────────────────────

const dirMap = {};
for (const f of files) {
  const parts = f.rel.split('/').filter(Boolean);
  if (parts.length < 2) continue;
  const depth = Math.min(parts.length - 1, 4);
  for (let d = 2; d <= depth; d++) {
    const dir = parts.slice(0, d).join('/');
    if (!dirMap[dir]) {
      dirMap[dir] = {
        files: [], todos: 0, routes: 0, components: 0, db: 0,
        apis: 0, auth: 0, zod: 0, lines: 0, ssrUnsafe: 0,
        sv4Legacy: 0, noTest: 0, localhostRefs: 0, tryCatch: 0,
        dynImports: 0, fanInTotal: 0, tags: new Set(),
      };
    }
    const e = dirMap[dir];
    if (d === depth) e.files.push(f.rel);
    e.todos        += f.todos.length;
    e.lines        += f.lineCount;
    e.fanInTotal   += f.fanIn ?? 0;
    if (f.isRoute)              e.routes++;
    if (f.isSvelteComp)         e.components++;
    if (f.drizzleRefs.length)   e.db++;
    if (f.routeHandlers.length) e.apis++;
    if (f.hasAuth)              e.auth++;
    if (f.hasZod)               e.zod++;
    if (f.ssrUnsafe)            e.ssrUnsafe++;
    if (f.sv4Props || f.sv4Reactive || f.sv4Events || f.sv4Dispatch) e.sv4Legacy++;
    if (f.isServerRoute && !f.hasPairedTest) e.noTest++;
    if (f.localhostRefs.length) e.localhostRefs++;
    if (f.hasTryCatch || f.hasSafeFn)        e.tryCatch++;
    if (f.dynImports.length)    e.dynImports++;
    for (const t of f.tags) e.tags.add(t);
  }
}

// Score: 0-100, lower = needs more attention
const dirRows = Object.entries(dirMap)
  .filter(([, d]) => d.files.length > 0)
  .map(([dir, d]) => {
    const authCoverage = d.apis > 0 ? d.auth / d.apis : 1;
    const zodCoverage  = d.apis > 0 ? d.zod  / d.apis : 1;
    const score = Math.min(100, Math.round(
      authCoverage * 25 +
      zodCoverage  * 15 +
      (d.db > 0 ? 10 : 0) +
      (d.todos === 0 ? 15 : d.todos < 3 ? 8 : 0) +
      (d.ssrUnsafe === 0 ? 10 : 0) +
      (d.sv4Legacy === 0 ? 10 : 0) +
      (d.localhostRefs === 0 ? 5 : 0) +
      (d.tryCatch > 0 || d.apis === 0 ? 5 : 0) +
      (d.files.length > 0 ? 5 : 0)
    ));
    const tagList = [...d.tags].filter(t => !['ts', 'svelte', 'js'].includes(t)).slice(0, 6);
    const kind = dir.includes('/routes/') ? 'route handler'
               : dir.includes('/lib/server') ? 'server module'
               : dir.includes('/lib/') ? 'shared library'
               : dir.includes('/components') ? 'UI component'
               : 'module';
    const summary = `${kind} directory with ${d.files.length} files, ${d.apis} API handlers` +
      (d.db ? `, ${d.db} Drizzle refs` : '') +
      (d.todos ? `, ${d.todos} TODOs` : '') +
      (d.ssrUnsafe ? `, ${d.ssrUnsafe} SSR-unsafe` : '') +
      (d.sv4Legacy ? `, ${d.sv4Legacy} Svelte4 legacy` : '');

    return {
      dir, score, summary, tagList,
      fileCount: d.files.length, todos: d.todos, routes: d.routes,
      components: d.components, db: d.db, apis: d.apis, auth: d.auth,
      zod: d.zod, lines: d.lines, ssrUnsafe: d.ssrUnsafe, sv4Legacy: d.sv4Legacy,
      noTest: d.noTest, localhostRefs: d.localhostRefs, tryCatch: d.tryCatch,
      dynImports: d.dynImports, fanInTotal: d.fanInTotal,
    };
  })
  .sort((a, b) => a.score - b.score);

// Write wiki:note:dir:* Redis keys for ACE KAG context
for (const d of dirRows) {
  const docId   = `dir:${d.dir.replace(/[^a-z0-9]/gi, '_')}`;
  const wikiKey = `wiki:note:dir:${docId}`;
  const wikiDoc = {
    type: 'cluster', clusterId: -1, clusterType: 'fast-ast',
    purpose:  `Directory audit: ${d.dir}`,
    summary:  d.summary,
    dominantTags: d.tagList,
    representativeFiles: [], topologicalNeighbors: [], relatedErrors: [], patterns: [],
    warnings: [
      ...(d.score < 40          ? [`Low quality score: ${d.score}`]        : []),
      ...(d.ssrUnsafe > 0       ? [`${d.ssrUnsafe} SSR-unsafe globals`]    : []),
      ...(d.sv4Legacy > 0       ? [`${d.sv4Legacy} Svelte 4 legacy patterns`] : []),
      ...(d.localhostRefs > 0   ? [`Hardcoded localhost refs`]              : []),
      ...(d.noTest > 0          ? [`${d.noTest} routes lack test pairing`]  : []),
    ],
    pageRankTop5: [], directoryPath: d.dir, auditScore: d.score,
    auditMetrics: {
      fileCount: d.fileCount, lineCount: d.lines, tsErrors: 0,
      todoCount: d.todos, apiCount: d.apis, authCount: d.auth,
      zodCount: d.zod, ssrUnsafeCount: d.ssrUnsafe, sv4LegacyCount: d.sv4Legacy,
      noTestCount: d.noTest, dynImportCount: d.dynImports,
    },
    hyperedge: null, generatedAt: new Date().toISOString(), version: 2, indexMode: 'fast-ast',
  };
  await rset(wikiKey, wikiDoc, WIKI_NOTE_TTL);
}

console.log(`📦 Directory wiki notes → ${dirRows.length} dirs written to Redis wiki:note:dir:*`);

// ── Manifest ──────────────────────────────────────────────────────────────────

// Aggregate gate stats across entire codebase
const gateStats = {
  // G4
  routesWithAuth:     files.filter(f => f.isServerRoute && f.hasAuth).length,
  routesWithoutAuth:  files.filter(f => f.isServerRoute && !f.hasAuth && f.routeHandlers.length).length,
  // G5
  routesWithZod:      files.filter(f => f.isServerRoute && f.hasZod).length,
  routesWithoutZod:   files.filter(f => f.isServerRoute && !f.hasZod && f.routeHandlers.length).length,
  // G11
  filesWithLocalhost: files.filter(f => f.localhostRefs.length && !f.rel.includes('env.server')).length,
  // G14
  sv4PropsCount:      files.filter(f => f.sv4Props).length,
  sv4ReactiveCount:   files.filter(f => f.sv4Reactive).length,
  sv4EventsCount:     files.filter(f => f.sv4Events).length,
  sv4DispatchCount:   files.filter(f => f.sv4Dispatch).length,
  runeInTsCount:      files.filter(f => f.runeInTs).length,
  // G15
  ssrUnsafeCount:     files.filter(f => f.ssrUnsafe).length,
  // G16
  routesWithTest:     files.filter(f => f.isServerRoute && f.hasPairedTest).length,
  routesWithoutTest:  files.filter(f => f.isServerRoute && !f.hasPairedTest && f.routeHandlers.length).length,
  // G17
  routesWithErrorHandling: files.filter(f => f.isServerRoute && (f.hasTryCatch || f.hasSafeFn)).length,
  // G20
  cyclicPairCount: cyclicPairs.length,
};

const manifest = {
  mode: 'fast-ast', createdAt: new Date().toISOString(), repoRoot: ROOT,
  fileCount: files.length, routeCount, componentCount, apiCount,
  dbTableMentions: dbTableCount, todoCount, dirCount: dirRows.length,
  qdrantUpserted: false,
  graphJsonPath: 'docs/graph/codebase-graph.json',
  codebaseMapPath: 'docs/graph/codebase-map.md',
  gateStats,
};

await rset('code:index:manifest',      manifest);
await rset('code:index:last-fast-run', new Date().toISOString());
await rset('code:index:gate-stats',    gateStats);

// ── Graph JSON ────────────────────────────────────────────────────────────────

fs.mkdirSync(GRAPH_DIR, { recursive: true });

const graphJson = {
  ...manifest,
  files: files.map(f => ({
    rel: f.rel, ext: f.ext, tags: f.tags, summary: f.summary,
    imports: f.imports.slice(0, 30), exports: f.exportedNames.slice(0, 20),
    dynImports: f.dynImports.slice(0, 10), reExports: f.reExports.slice(0, 10),
    routeHandlers: f.routeHandlers, drizzleRefs: f.drizzleRefs,
    todos: f.todos, components: f.components.slice(0, 20),
    isRoute: f.isRoute, isSvelteComp: f.isSvelteComp, lineCount: f.lineCount,
    hasAuth: f.hasAuth, hasZod: f.hasZod, ssrUnsafe: f.ssrUnsafe,
    sv4Legacy: f.sv4Props || f.sv4Reactive || f.sv4Events || f.sv4Dispatch,
    hasPairedTest: f.hasPairedTest, fanIn: f.fanIn ?? 0,
    routeParams: f.routeParams, routeDepth: f.routeDepth,
    localhostRefs: f.localhostRefs,
  })),
  directories: dirRows,
  tags: tagMap,
  audit: {
    gateStats,
    cyclicPairs: cyclicPairs.slice(0, 20),
    topFanIn: Object.entries(fanIn)
      .filter(([k]) => k.startsWith('$lib') || k.startsWith('src/'))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([mod, n]) => ({ mod, n })),
  },
};

const graphJsonPath = path.join(GRAPH_DIR, 'codebase-graph.json');
fs.writeFileSync(graphJsonPath, JSON.stringify(graphJson, null, 2));
console.log(`📄 Graph JSON → ${path.relative(ROOT, graphJsonPath)}`);

// ── Codebase Map ──────────────────────────────────────────────────────────────

const apiFiles   = files.filter(f => f.routeHandlers.length > 0);
const noAuthApis = apiFiles.filter(f => !f.hasAuth);
const noZodApis  = apiFiles.filter(f => !f.hasZod);
const ssrUnsafeFiles = files.filter(f => f.ssrUnsafe && !f.isTest);
const sv4Files   = files.filter(f => f.sv4Props || f.sv4Reactive || f.sv4Events || f.sv4Dispatch);
const lhFiles    = files.filter(f => f.localhostRefs.length && !f.rel.includes('env.server'));
const noTestRoutes = files.filter(f => f.isServerRoute && !f.hasPairedTest && f.routeHandlers.length);

const importFreq = {};
for (const f of files) {
  for (const imp of f.imports) {
    if (imp.startsWith('.')) continue;
    importFreq[imp] = (importFreq[imp] ?? 0) + 1;
  }
}
const topImports = Object.entries(importFreq)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 30)
  .map(([mod, n]) => `| \`${mod}\` | ${n} |`);

const topFanIn = Object.entries(fanIn)
  .filter(([k]) => k.startsWith('$lib') || k.startsWith('src/'))
  .sort((a, b) => b[1] - a[1])
  .slice(0, 20)
  .map(([mod, n]) => `| \`${mod}\` | ${n} |`);

const componentFiles = files.filter(f => f.isSvelteComp).slice(0, 60);

const dirSummaryRows = dirRows.map(d => {
  const icon = d.score >= 70 ? '✅' : d.score >= 40 ? '⚠️' : '❌';
  const flags = [
    d.ssrUnsafe ? `🔴ssr` : '',
    d.sv4Legacy ? `🟡sv4` : '',
    d.localhostRefs ? `🟠lh` : '',
    d.noTest    ? `⬜notest` : '',
  ].filter(Boolean).join(' ');
  return `| ${icon} | \`${d.dir}\` | ${d.score} | ${d.fileCount} | ${d.lines} | ${d.apis} | ${d.auth}/${d.zod} | ${d.todos} | ${flags || '—'} |`;
});

const topTodoDirs = dirRows
  .filter(d => d.todos > 0)
  .sort((a, b) => b.todos - a.todos)
  .slice(0, 15)
  .map(d => `- \`${d.dir}\` — ${d.todos} marker(s), score ${d.score}`);

const topRouteRows = apiFiles
  .sort((a, b) => b.routeHandlers.length - a.routeHandlers.length)
  .slice(0, 60)
  .map(f => {
    const params = f.routeParams.length ? ` [${f.routeParams.join(', ')}]` : '';
    return `| \`${f.rel.replace('src/routes/', '')}${params}\` | ${f.routeHandlers.join(', ')} | ${f.hasAuth ? '✅' : '❌'} | ${f.hasZod ? '✅' : '❌'} | ${f.hasTryCatch || f.hasSafeFn ? '✅' : '❌'} |`;
  });

// G18 — deep route analysis (routes with params, by depth)
const deepRoutes = files
  .filter(f => f.isServerRoute && f.routeParams.length > 0)
  .sort((a, b) => b.routeDepth - a.routeDepth)
  .slice(0, 30)
  .map(f => `| \`${f.rel.replace('src/routes/', '')}\` | ${f.routeDepth} | \`[${f.routeParams.join('] [')}]\` | ${f.routeHandlers.join(', ')} |`);

const codebaseMap = `# Codebase Map — 20-Gate Deep Audit
> Generated: ${manifest.createdAt}
> Mode: \`fast-ast\` · CPU-only · No GPU required
> Regenerate: \`npm run index:codebase:fast:plan\`

---

## Summary
| Metric | Count |
|--------|-------|
| Files scanned | ${manifest.fileCount} |
| Directories analysed | ${manifest.dirCount} |
| Route files | ${manifest.routeCount} |
| Svelte components | ${manifest.componentCount} |
| API handlers | ${manifest.apiCount} |
| API routes without auth | ${noAuthApis.length} |
| API routes without Zod | ${noZodApis.length} |
| SSR-unsafe files | ${ssrUnsafeFiles.length} |
| Svelte 4 legacy patterns | ${sv4Files.length} |
| Hardcoded localhost refs | ${lhFiles.length} |
| Routes without test pairing | ${noTestRoutes.length} |
| Cyclic import pairs | ${cyclicPairs.length} |
| Drizzle table refs | ${manifest.dbTableMentions} |
| TODO/FIXME markers | ${manifest.todoCount} |

---

## 20-Gate Audit Summary

| Gate | Check | Pass | Fail |
|------|-------|------|------|
| G4  | Auth guard on API routes | ${gateStats.routesWithAuth} | ${gateStats.routesWithoutAuth} |
| G5  | Zod validation on API routes | ${gateStats.routesWithZod} | ${gateStats.routesWithoutZod} |
| G11 | No hardcoded localhost (excl env.server) | ${files.length - gateStats.filesWithLocalhost} | ${gateStats.filesWithLocalhost} |
| G14a | No \`export let\` (Svelte 4 props) | ${files.length - gateStats.sv4PropsCount} | ${gateStats.sv4PropsCount} |
| G14b | No \`$:\` reactive declarations | ${files.length - gateStats.sv4ReactiveCount} | ${gateStats.sv4ReactiveCount} |
| G14c | No \`on:event=\` directives | ${files.length - gateStats.sv4EventsCount} | ${gateStats.sv4EventsCount} |
| G14d | No \`createEventDispatcher()\` | ${files.length - gateStats.sv4DispatchCount} | ${gateStats.sv4DispatchCount} |
| G14e | No runes in plain \`.ts\` files | ${files.length - gateStats.runeInTsCount} | ${gateStats.runeInTsCount} |
| G15 | No SSR-unsafe globals (unguarded) | ${files.length - gateStats.ssrUnsafeCount} | ${gateStats.ssrUnsafeCount} |
| G16 | Server routes have test pairing | ${gateStats.routesWithTest} | ${gateStats.routesWithoutTest} |
| G17 | Server routes have error handling | ${gateStats.routesWithErrorHandling} | ${files.filter(f => f.isServerRoute && !f.hasTryCatch && !f.hasSafeFn).length} |
| G20 | Cyclic import pairs | — | ${gateStats.cyclicPairCount} |

---

## Directory Scorecard (${dirRows.length} dirs · lowest score = most attention needed)

**Score factors**: Auth/API coverage 25pts · Zod coverage 15pts · Drizzle ref 10pts · No TODOs 15pts · SSR-safe 10pts · No Svelte4 10pts · No localhost 5pts · Error handling 5pts · Non-empty 5pts

**Flags**: 🔴ssr = SSR-unsafe globals · 🟡sv4 = Svelte4 legacy · 🟠lh = localhost hardcoded · ⬜notest = routes lack tests

| Status | Directory | Score | Files | Lines | APIs | Auth/Zod | TODOs | Flags |
|--------|-----------|-------|-------|-------|------|----------|-------|-------|
${dirSummaryRows.join('\n')}

---

## API Routes (${apiFiles.length} total · top 60)

| Route [params] | Methods | Auth | Zod | Error handling |
|----------------|---------|------|-----|----------------|
${topRouteRows.join('\n')}
${apiFiles.length > 60 ? `\n_…and ${apiFiles.length - 60} more. See \`codebase-graph.json\` for full list._` : ''}

---

## G4 — API Routes Missing Auth Guard (${noAuthApis.length})
${noAuthApis.length === 0
  ? '_All API handlers have auth guards. ✅_'
  : noAuthApis.slice(0, 30).map(f => `- \`${f.rel}\` · ${f.routeHandlers.join('/')}`).join('\n')}

---

## G5 — API Routes Missing Zod Validation (${noZodApis.length})
${noZodApis.length === 0
  ? '_All API handlers use Zod. ✅_'
  : noZodApis.slice(0, 30).map(f => `- \`${f.rel}\` · ${f.routeHandlers.join('/')}`).join('\n')}

---

## G14 — Svelte 4 Legacy Patterns (${sv4Files.length} files)
${sv4Files.length === 0
  ? '_No Svelte 4 patterns found. ✅_'
  : sv4Files.slice(0, 20).map(f => {
      const flags = [
        f.sv4Props    ? 'export-let' : '',
        f.sv4Reactive ? '$:reactive'  : '',
        f.sv4Events   ? 'on:event'    : '',
        f.sv4Dispatch ? 'dispatcher'  : '',
      ].filter(Boolean).join(', ');
      return `- \`${f.rel}\` · ${flags}`;
    }).join('\n')}

---

## G15 — SSR-Unsafe Globals (${ssrUnsafeFiles.length} files · unguarded window/document/localStorage)
${ssrUnsafeFiles.length === 0
  ? '_No unguarded SSR-unsafe globals. ✅_'
  : ssrUnsafeFiles.slice(0, 20).map(f => `- \`${f.rel}\``).join('\n')}

---

## G16 — Routes Without Test Pairing (${noTestRoutes.length})
${noTestRoutes.length === 0
  ? '_All server routes have paired tests. ✅_'
  : noTestRoutes.slice(0, 30).map(f => `- \`${f.rel}\` · ${f.routeHandlers.join('/')}`).join('\n')}

---

## G11 — Hardcoded Localhost References (${lhFiles.length} files)
${lhFiles.length === 0
  ? '_No hardcoded localhost outside env.server.ts. ✅_'
  : lhFiles.slice(0, 20).map(f => `- \`${f.rel}\` · ${f.localhostRefs.slice(0, 2).join(', ')}`).join('\n')}

---

## G18 — Deep Route Paths (parameterised, sorted by depth)

| Route [params] | Depth | Params | Methods |
|----------------|-------|--------|---------|
${deepRoutes.join('\n')}

---

## G19 — Top Module Fan-In (most imported \`$lib\` paths)
| Module | Import Count |
|--------|-------------|
${topFanIn.join('\n')}

---

## G20 — Cyclic Import Pairs (${cyclicPairs.length} found · top 20)
${cyclicPairs.length === 0
  ? '_No cyclic imports detected. ✅_'
  : cyclicPairs.slice(0, 20).map(([a, b]) => `- \`${a}\` ↔ \`${b}\``).join('\n')}

---

## Svelte Components (${componentFiles.length} shown of ${componentCount})
| File | Sub-components | Key \`$lib\` Imports |
|------|---------------|---------------------|
${componentFiles.map(f =>
  `| \`${f.rel}\` | ${[...new Set(f.components)].slice(0, 4).join(', ')} | ${f.imports.filter(i => i.startsWith('$lib')).slice(0, 3).join(', ')} |`
).join('\n')}

---

## Top External Module Imports
| Module | Consumer Count |
|--------|----------------|
${topImports.join('\n')}

---

## Directories with TODO/FIXME
${topTodoDirs.length ? topTodoDirs.join('\n') : '_No TODO markers found. ✅_'}

---

## ACE / KAG Integration

**Fast-AST source** (score cap 0.07):
- Redis key \`code:index:manifest\` — manifest with mode, fileCount, gateStats
- Redis keys \`code:index:tag:{word}\` — file paths per keyword tag
- Redis key \`code:index:gate-stats\` — live gate pass/fail counts
- Injected when codebase context is sparse (< 3 Qdrant chunks)

**KAG directory notes** (score cap 0.08):
- Redis keys \`wiki:note:dir:{docId}\` (24h TTL) — per-directory audit docs with warnings
- Injected as \`## KAG Directory Audit Notes\` section in ACE \`webSearchContext\`
- Populated by this script **and** by \`POST /api/codebase-index/directory-summaries\`

**Full GPU pipeline**:
\`\`\`bash
npm run index:codebase:full
\`\`\`
`;

const mapPath = path.join(GRAPH_DIR, 'codebase-map.md');
fs.writeFileSync(mapPath, codebaseMap);
console.log(`🗺️  Codebase map → ${path.relative(ROOT, mapPath)}`);

// ── Graph plan (--write-plan only) ────────────────────────────────────────────

if (WRITE_PLAN) {
  const topTodoFiles = files
    .filter(f => f.todos.length)
    .sort((a, b) => b.todos.length - a.todos.length)
    .slice(0, 20)
    .map(f => `- \`${f.rel}\` — ${f.todos.length} marker(s)`);

  const graphMd = `# Codebase Graph Plan — Fast AST (20-Gate)
> Generated: ${manifest.createdAt}
> Mode: \`fast-ast\` (CPU only)

## Stats
| Metric | Count |
|--------|-------|
| Files | ${manifest.fileCount} |
| Routes | ${manifest.routeCount} |
| Components | ${manifest.componentCount} |
| API handlers | ${manifest.apiCount} |
| TODOs | ${manifest.todoCount} |
| Dirs | ${manifest.dirCount} |

## Gate Failures (action needed)
| Gate | Fail Count |
|------|-----------|
| G4 No auth | ${gateStats.routesWithoutAuth} |
| G5 No Zod  | ${gateStats.routesWithoutZod} |
| G11 Localhost | ${gateStats.filesWithLocalhost} |
| G14 Svelte4 | ${gateStats.sv4PropsCount + gateStats.sv4ReactiveCount + gateStats.sv4EventsCount + gateStats.sv4DispatchCount} |
| G15 SSR unsafe | ${gateStats.ssrUnsafeCount} |
| G16 No test | ${gateStats.routesWithoutTest} |
| G20 Cyclic | ${gateStats.cyclicPairCount} |

## Files with TODO/FIXME
${topTodoFiles.join('\n')}

## ACE usage
Redis \`code:index:manifest\`, \`code:index:tag:{word}\`, \`code:index:gate-stats\`, \`wiki:note:dir:*\`
Score cap: 0.07 (fast-ast), 0.08 (KAG dir notes)

## Full GPU
\`\`\`bash
npm run index:codebase:full
\`\`\`
`;
  const graphMdPath = path.join(GRAPH_DIR, 'codebase-graph.md');
  fs.writeFileSync(graphMdPath, graphMd);
  console.log(`📝 Graph plan → ${path.relative(ROOT, graphMdPath)}`);
}

// ── Done ──────────────────────────────────────────────────────────────────────

const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`\n✅ Fast index complete in ${elapsed}s`);
console.log(`   Files: ${manifest.fileCount}  Dirs: ${manifest.dirCount}  Routes: ${routeCount}  Components: ${componentCount}  API handlers: ${apiCount}  TODOs: ${todoCount}`);
console.log(`   G4 auth: ${gateStats.routesWithAuth}✅ ${gateStats.routesWithoutAuth}❌  G5 zod: ${gateStats.routesWithZod}✅ ${gateStats.routesWithoutZod}❌  G15 ssr-unsafe: ${gateStats.ssrUnsafeCount}  G20 cyclic: ${gateStats.cyclicPairCount}`);
console.log(`   Redis wiki:note:dir: ${redis ? dirRows.length + ' written' : 'skipped (no Redis)'}`);
console.log(`   Outputs: docs/graph/codebase-graph.json  docs/graph/codebase-map.md`);

if (redis) await redis.quit();
