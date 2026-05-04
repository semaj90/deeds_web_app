#!/usr/bin/env node
/**
 * Fast AST Codebase Indexer
 *
 * CPU-only, no GPU required. Scans source files cheaply via regex/AST heuristics
 * and writes:
 *   - Redis  code:index:* keys (6h TTL)
 *   - Redis  wiki:note:dir:* keys (24h TTL) — consumed by ACE KAG directory context
 *   - docs/graph/codebase-graph.json — machine-readable full index
 *   - docs/graph/codebase-graph.md  — graph plan (--write-plan)
 *   - docs/graph/codebase-map.md    — human-readable directory analysis map
 *
 * Usage:
 *   node scripts/index-codebase-fast.mjs [--write-plan] [--skip-redis] [--src <dir>]
 *
 * ACE source priority:
 *   Qdrant > ACP > hg:edge/SOM/Neo4j > fast-ast (score cap 0.07) > static scan
 *
 * KAG directory notes (wiki:note:dir:*) are read by getDirectoryKAGContext()
 * in community-graph.ts and injected as "## KAG Directory Audit Notes" in ACE context.
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
      lazyConnect:         true,
      connectTimeout:      3000,
      maxRetriesPerRequest: 1,
    });
    await redis.ping();
  } catch {
    console.warn('⚠️  Redis unavailable — skipping cache writes');
    redis = null;
  }
}

const REDIS_TTL      = 6  * 3600; // 6h  — file/tag/manifest keys
const WIKI_NOTE_TTL  = 24 * 3600; // 24h — wiki:note:dir keys (same as directory-summarizer.ts)

async function rset(key, value, ttl = REDIS_TTL) {
  if (!redis) return;
  try {
    await redis.setex(key, ttl, typeof value === 'string' ? value : JSON.stringify(value));
  } catch { /* non-fatal */ }
}

// ── File discovery ────────────────────────────────────────────────────────────

const EXTENSIONS  = new Set(['.ts', '.svelte', '.js', '.mjs', '.cjs', '.json']);
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

// ── Cheap metadata extraction ─────────────────────────────────────────────────

const RE_IMPORT    = /import\s+(?:type\s+)?(?:\{[^}]*\}|[\w*]+)\s+from\s+['"]([^'"]+)['"]/g;
const RE_EXPORT    = /export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var|type|interface|enum)\s+([\w$]+)/g;
const RE_SVELTE_C  = /<script[^>]*>/;
const RE_TODO      = /\/\/\s*(TODO|FIXME|HACK|XXX)[:\s]/g;
const RE_DRIZZLE   = /\b(pgTable|mysqlTable|sqliteTable|InferSelect|InferInsert|drizzle)\b/g;
const RE_ROUTE_H   = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*\(/g;
const RE_COMPONENT = /<([A-Z][A-Za-z0-9]+)\s/g;
const RE_AUTH      = /locals\.user|requireAuth|getSession|DEV_BYPASS_AUTH/;

function extractMeta(filePath, src) {
  const rel    = path.relative(ROOT, filePath).replace(/\\/g, '/');
  const ext    = path.extname(filePath);
  const isRoute = rel.includes('/routes/') && (
    rel.endsWith('+server.ts') || rel.endsWith('+page.server.ts') ||
    rel.endsWith('+page.svelte') || rel.endsWith('+layout.svelte')
  );

  const imports       = [...src.matchAll(RE_IMPORT)].map(m => m[1]);
  const exports       = [...src.matchAll(RE_EXPORT)].map(m => m[1]);
  const routeHandlers = [...src.matchAll(RE_ROUTE_H)].map(m => m[1]);
  const drizzleRefs   = [...new Set([...src.matchAll(RE_DRIZZLE)].map(m => m[1]))];
  const todos         = [...src.matchAll(RE_TODO)].map(m => m[1]);
  const components    = ext === '.svelte'
    ? [...new Set([...src.matchAll(RE_COMPONENT)].map(m => m[1]))]
    : [];
  const isSvelteComp  = ext === '.svelte' && RE_SVELTE_C.test(src);
  const hasAuth       = RE_AUTH.test(src);
  const lineCount     = src.split('\n').length;

  const summaryMatch  = src.match(/\/\*\*\s*\n?\s*\*?\s*([^\n*@]+)/);
  const summary       = summaryMatch ? summaryMatch[1].trim() : '';

  const segments = rel.split('/').filter(Boolean);
  const tags = [
    ext.replace('.', ''),
    ...segments.slice(0, 3),
    isRoute       ? 'route'      : null,
    isSvelteComp  ? 'component'  : null,
    routeHandlers.length ? 'api-handler' : null,
    drizzleRefs.length   ? 'db-schema'   : null,
    todos.length         ? 'has-todo'    : null,
    hasAuth              ? 'auth'        : null,
  ].filter(Boolean);

  return {
    rel, ext, imports, exports, routeHandlers, drizzleRefs, todos,
    components, isSvelteComp, isRoute, hasAuth, lineCount, summary, tags,
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
    rel: meta.rel, imports: meta.imports.slice(0, 20), exports: meta.exports.slice(0, 20),
  });
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

// Group by parent dir relative to scanRoot (max depth 3 segments)
const dirMap = {};
for (const f of files) {
  const parts = f.rel.split('/').filter(Boolean);
  if (parts.length < 2) continue;
  // Use up to 4 path segments as the directory key (e.g. src/lib/server/cache)
  const depth = Math.min(parts.length - 1, 4);
  for (let d = 2; d <= depth; d++) {
    const dir = parts.slice(0, d).join('/');
    if (!dirMap[dir]) {
      dirMap[dir] = {
        files: [], todos: 0, routes: 0, components: 0, db: 0,
        apis: 0, auth: 0, lines: 0, tags: new Set(),
      };
    }
    const entry = dirMap[dir];
    if (d === depth) entry.files.push(f.rel); // only count file at deepest matching dir
    entry.todos      += f.todos.length;
    entry.lines      += f.lineCount;
    if (f.isRoute)              entry.routes++;
    if (f.isSvelteComp)         entry.components++;
    if (f.drizzleRefs.length)   entry.db++;
    if (f.routeHandlers.length) entry.apis++;
    if (f.hasAuth)              entry.auth++;
    for (const t of f.tags) entry.tags.add(t);
  }
}

// Score: 0-100, lower = needs more attention
const dirRows = Object.entries(dirMap)
  .filter(([, d]) => d.files.length > 0)
  .map(([dir, d]) => {
    const authCoverage = d.apis > 0 ? d.auth / d.apis : 1;
    const score = Math.min(100, Math.round(
      authCoverage * 30 +
      (d.db > 0 ? 15 : 0) +
      (d.todos === 0 ? 20 : d.todos < 3 ? 10 : 0) +
      (d.components > 0 ? 10 : 0) +
      (d.routes > 0 ? 15 : 0) +
      (d.files.length > 0 ? 10 : 0)
    ));
    const tagList = [...d.tags].filter(t => !['ts', 'svelte', 'js'].includes(t)).slice(0, 6);
    // Summary derived from the directory structure
    const kind = dir.includes('/routes/') ? 'route handler'
               : dir.includes('/lib/server') ? 'server module'
               : dir.includes('/lib/') ? 'shared library'
               : dir.includes('/components') ? 'UI component'
               : 'module';
    const summary = `${kind} directory with ${d.files.length} files, ${d.apis} API handlers` +
      (d.db ? `, ${d.db} Drizzle refs` : '') +
      (d.todos ? `, ${d.todos} TODOs` : '');

    return {
      dir, score, summary, tagList,
      fileCount: d.files.length, todos: d.todos, routes: d.routes,
      components: d.components, db: d.db, apis: d.apis, auth: d.auth, lines: d.lines,
    };
  })
  .sort((a, b) => a.score - b.score); // lowest first — needs most attention

// Write wiki:note:dir:* Redis keys for ACE KAG context
for (const d of dirRows) {
  const docId    = `dir:${d.dir.replace(/[^a-z0-9]/gi, '_')}`;
  const wikiKey  = `wiki:note:dir:${docId}`;
  const wikiDoc  = {
    type:             'cluster',
    clusterId:        -1,         // resolved by ingestDirectorySummaries when full GPU runs
    clusterType:      'fast-ast',
    purpose:          `Directory audit: ${d.dir}`,
    summary:          d.summary,
    dominantTags:     d.tagList,
    representativeFiles: [],
    topologicalNeighbors: [],
    relatedErrors:    [],
    patterns:         [],
    warnings:         d.score < 40 ? [`Low quality score: ${d.score}`] : [],
    pageRankTop5:     [],
    directoryPath:    d.dir,
    auditScore:       d.score,
    auditMetrics:     {
      fileCount:  d.fileCount,
      lineCount:  d.lines,
      tsErrors:   0,             // not available in fast-ast mode
      todoCount:  d.todos,
      apiCount:   d.apis,
      authCount:  d.auth,
    },
    hyperedge:        null,
    generatedAt:      new Date().toISOString(),
    version:          1,
    indexMode:        'fast-ast',
  };
  await rset(wikiKey, wikiDoc, WIKI_NOTE_TTL);
}

console.log(`📦 Directory wiki notes → ${dirRows.length} dirs written to Redis wiki:note:dir:*`);

// ── Manifest ──────────────────────────────────────────────────────────────────

const manifest = {
  mode:            'fast-ast',
  createdAt:       new Date().toISOString(),
  repoRoot:        ROOT,
  fileCount:       files.length,
  routeCount,
  componentCount,
  apiCount,
  dbTableMentions: dbTableCount,
  todoCount,
  dirCount:        dirRows.length,
  qdrantUpserted:  false,
  graphJsonPath:   'docs/graph/codebase-graph.json',
  codebaseMapPath: 'docs/graph/codebase-map.md',
};

await rset('code:index:manifest',      manifest);
await rset('code:index:last-fast-run', new Date().toISOString());

// ── Graph JSON ────────────────────────────────────────────────────────────────

fs.mkdirSync(GRAPH_DIR, { recursive: true });

const graphJson = {
  ...manifest,
  files: files.map(f => ({
    rel: f.rel, ext: f.ext, tags: f.tags, summary: f.summary,
    imports: f.imports.slice(0, 30), exports: f.exports.slice(0, 20),
    routeHandlers: f.routeHandlers, drizzleRefs: f.drizzleRefs,
    todos: f.todos, components: f.components.slice(0, 20),
    isRoute: f.isRoute, isSvelteComp: f.isSvelteComp, lineCount: f.lineCount,
  })),
  directories: dirRows,
  tags: tagMap,
};

const graphJsonPath = path.join(GRAPH_DIR, 'codebase-graph.json');
fs.writeFileSync(graphJsonPath, JSON.stringify(graphJson, null, 2));
console.log(`📄 Graph JSON → ${path.relative(ROOT, graphJsonPath)}`);

// ── Codebase Map (always written, separate from --write-plan graph.md) ────────

const apiFiles    = files.filter(f => f.routeHandlers.length > 0);
const noAuthApis  = apiFiles.filter(f => !f.hasAuth);
const importFreq  = {};
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

const componentFiles = files.filter(f => f.isSvelteComp).slice(0, 60);

const dirSummaryRows = dirRows.map(d => {
  const icon = d.score >= 70 ? '✅' : d.score >= 40 ? '⚠️' : '❌';
  return `| ${icon} | \`${d.dir}\` | ${d.score} | ${d.fileCount} | ${d.lines} | ${d.apis} | ${d.auth} | ${d.todos} | ${d.tagList.join(', ')} |`;
});

const topTodoDirs = dirRows
  .filter(d => d.todos > 0)
  .sort((a, b) => b.todos - a.todos)
  .slice(0, 15)
  .map(d => `- \`${d.dir}\` — ${d.todos} marker(s), score ${d.score}`);

const topRouteRows = apiFiles
  .sort((a, b) => b.routeHandlers.length - a.routeHandlers.length)
  .slice(0, 50)
  .map(f => `| \`${f.rel.replace('src/routes/', '')}\` | ${f.routeHandlers.join(', ')} | ${f.hasAuth ? '✅' : '❌'} |`);

const codebaseMap = `# Codebase Map — Directory Analysis
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
| Drizzle table refs | ${manifest.dbTableMentions} |
| TODO/FIXME markers | ${manifest.todoCount} |

---

## Directory Scorecard (${dirRows.length} dirs · lowest score = most attention needed)

| Status | Directory | Score | Files | Lines | APIs | Auth | TODOs | Tags |
|--------|-----------|-------|-------|-------|------|------|-------|------|
${dirSummaryRows.join('\n')}

**Scoring**: Auth coverage 30pts · Drizzle ref 15pts · No TODOs 20pts · Has components 10pts · Has routes 15pts · Non-empty 10pts

---

## API Routes (${apiFiles.length} total)

| Route | Methods | Auth |
|-------|---------|------|
${topRouteRows.join('\n')}
${apiFiles.length > 50 ? `\n_…and ${apiFiles.length - 50} more. See \`codebase-graph.json\` for full list._` : ''}

---

## API Routes Missing Auth Guard (${noAuthApis.length})
${noAuthApis.length === 0
  ? '_All API handlers have auth guards. ✅_'
  : noAuthApis.map(f => `- \`${f.rel}\` · ${f.routeHandlers.join('/')}`).join('\n')}

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
- Redis key \`code:index:manifest\` — manifest with mode, fileCount, etc.
- Redis keys \`code:index:tag:{word}\` — file paths per keyword tag
- Injected when codebase context is sparse (< 3 Qdrant chunks)

**KAG directory notes** (score cap 0.08):
- Redis keys \`wiki:note:dir:{docId}\` (24h TTL) — per-directory audit docs
- Read by \`getDirectoryKAGContext(query)\` in \`community-graph.ts\`
- Injected as \`## KAG Directory Audit Notes\` section in ACE \`webSearchContext\`
- Populated by this script **and** by \`POST /api/codebase-index/directory-summaries\`

**Full GPU pipeline** (replaces fast-ast with 768-dim embeddings):
\`\`\`bash
npm run index:codebase:full          # full GPU pipeline
npm run test:prod-readiness:full-gpu # production readiness harness
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

  const graphMd = `# Codebase Graph Plan — Fast AST
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

## Files with TODO/FIXME
${topTodoFiles.join('\n')}

## ACE usage
Redis \`code:index:manifest\`, \`code:index:tag:{word}\`, \`wiki:note:dir:*\`
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
console.log(`   Redis wiki:note:dir: ${redis ? dirRows.length + ' written' : 'skipped (no Redis)'}`);
console.log(`   Outputs: docs/graph/codebase-graph.json  docs/graph/codebase-map.md`);

if (redis) await redis.quit();
