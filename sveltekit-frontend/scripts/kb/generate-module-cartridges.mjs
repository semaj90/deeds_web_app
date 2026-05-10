#!/usr/bin/env node
/**
 * generate-module-cartridges.mjs
 *
 * Generates a symbolic module index for the sveltekit-frontend codebase.
 *
 * Reads source files → extracts structural metadata → enriches from Redis
 * (pagerank/blend) + codebase-graph.json (SOM coords) →
 * writes memory/codebase/module-cartridges.{jsonl,min.json,idx.json}
 *
 * Does NOT:
 *   - Train any models         - Mutate Qdrant / Neo4j / PostgreSQL
 *   - Run GPU jobs             - Call Python
 *   - Change MCP schemas       - Touch reconstruction compiler
 *
 * Usage:
 *   node scripts/kb/generate-module-cartridges.mjs
 *   node scripts/kb/generate-module-cartridges.mjs --dry-run
 *   node scripts/kb/generate-module-cartridges.mjs --no-redis
 *   node scripts/kb/generate-module-cartridges.mjs --verbose
 */

import {
  readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, existsSync,
} from 'node:fs';
import { createHash }                      from 'node:crypto';
import { resolve, relative, join, extname, dirname, basename } from 'node:path';
import { fileURLToPath }                   from 'node:url';
import { performance }                     from 'node:perf_hooks';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '../..');   // sveltekit-frontend/
const SRC       = join(ROOT, 'src');
const SCRIPTS   = join(ROOT, 'scripts');
const TESTS     = join(ROOT, 'tests');
const MEM_DIR   = join(ROOT, 'memory', 'codebase');
const GRAPH_JSON = join(ROOT, 'docs', 'graph', 'codebase-graph.json');

const ARGS = {
  dryRun:  process.argv.includes('--dry-run'),
  noRedis: process.argv.includes('--no-redis'),
  verbose: process.argv.includes('--verbose'),
};

// ── File inclusion ────────────────────────────────────────────────────────────

const INCLUDE_EXTS = new Set(['.ts', '.svelte', '.mjs', '.js', '.cjs']);
const EXCLUDE_DIRS = new Set([
  'node_modules', '.svelte-kit', 'build', 'dist', '.git',
  'static', '.vscode', 'coverage', 'playwright-report', 'test-results',
  'deeds_labs', '.turbo', 'scratch',
]);

function shouldSkip(name, fullPath) {
  if (name.endsWith('.d.ts'))  return true;
  if (name.endsWith('.min.js')) return true;
  if (name.endsWith('.map'))   return true;
  return false;
}

// ── Regex patterns ────────────────────────────────────────────────────────────

const RE = {
  // export const/function/class/interface/type/enum Name
  exportNamed:    /\bexport\s+(?:declare\s+)?(?:async\s+)?(?:const|function|class|interface|type|enum|abstract\s+class)\s+(\w+)/g,
  // export { A, B as C, type D }
  exportGroup:    /\bexport\s+(?:type\s+)?\{([^}]+)\}/g,
  // export default function/class Name
  exportDefault:  /\bexport\s+default\s+(?:async\s+)?(?:function\s+(\w+)|class\s+(\w+))/g,

  // import [type] { A, B } from 'mod'
  importNamed:    /\bimport\s+(?:type\s+)?\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/g,
  // import Default from 'mod'   (not import type)
  importDefault:  /\bimport\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g,
  // import * as X from 'mod'
  importStar:     /\bimport\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]/g,
  // dynamic import('mod')
  dynamicImport:  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,

  // Drizzle table imports from schema-postgres
  schemaImport:   /\bimport\s+(?:type\s+)?\{([^}]+)\}\s+from\s+['"][^'"]*schema-postgres['"]/g,

  // MCP tool registration: server.tool('name', ...)
  mcpTool:        /\bserver\.tool\s*\(\s*['"]([^'"]+)['"]/g,

  // First JSDoc comment block (top of file)
  jsdocFirst:     /^[\s\S]*?\/\*\*?\s*([\s\S]*?)\s*\*\//,
};

// ── File walker ───────────────────────────────────────────────────────────────

function walkDir(dir, files = []) {
  let entries;
  try { entries = readdirSync(dir); }
  catch { return files; }

  for (const entry of entries) {
    if (entry.startsWith('.')) continue;
    const full = join(dir, entry);
    let stat;
    try { stat = statSync(full); } catch { continue; }

    if (stat.isDirectory()) {
      if (!EXCLUDE_DIRS.has(entry)) walkDir(full, files);
    } else if (INCLUDE_EXTS.has(extname(entry)) && !shouldSkip(entry, full)) {
      files.push(full);
    }
  }
  return files;
}

// ── Kind detection ────────────────────────────────────────────────────────────

function detectKind(p) {
  if (p.startsWith('tests/'))                     return 'test';
  if (p.startsWith('scripts/'))                   return 'script';
  if (p.startsWith('src/mcp/'))                   return 'mcp';
  if (p.startsWith('src/routes/api/'))            return 'api';
  if (p.startsWith('src/routes/'))                return 'route';
  if (p.startsWith('src/lib/components/'))        return 'component';
  if (p.startsWith('src/lib/stores/'))            return 'store';
  if (/src\/lib\/server\/db\/schema/.test(p))     return 'schema';
  if (p.startsWith('src/lib/server/'))            return 'server';
  return 'lib';
}

// ── SvelteKit route extraction ────────────────────────────────────────────────

function extractRoutes(p) {
  if (!p.startsWith('src/routes/')) return [];
  // Strip prefix and file
  let route = p
    .replace(/^src\/routes/, '')
    .replace(/\/\+\w+(\.\w+)+$/, '');
  // Remove SvelteKit group segments: (app), (admin), etc.
  route = route.replace(/\/\([^)]+\)/g, '');
  if (!route) route = '/';
  return [route];
}

// ── Export extraction ─────────────────────────────────────────────────────────

function parseExports(src, relPath) {
  const exports = new Set();

  for (const m of src.matchAll(RE.exportNamed))  if (m[1]) exports.add(m[1]);
  for (const m of src.matchAll(RE.exportDefault)) {
    const name = m[1] || m[2];
    if (name) exports.add(name);
    exports.add('default');
  }
  if (/\bexport\s+default\b/.test(src)) exports.add('default');

  for (const m of src.matchAll(RE.exportGroup)) {
    for (const part of m[1].split(',')) {
      const clean = part.trim().replace(/^type\s+/, '');
      const name  = clean.split(/\s+as\s+/).pop()?.trim() ?? '';
      if (name && name !== 'default' && /^\w+$/.test(name)) exports.add(name);
    }
  }

  // Svelte components are always default exports
  if (relPath.endsWith('.svelte')) exports.add('default');

  return [...exports].filter(Boolean);
}

// ── Import extraction ─────────────────────────────────────────────────────────

function parseImports(src) {
  const map = new Map(); // module → { names: Set<string>, isType: boolean }

  function add(module, names, isType) {
    if (!map.has(module)) map.set(module, { names: new Set(), isType });
    const e = map.get(module);
    for (const n of names) if (n) e.names.add(n);
    if (!isType) e.isType = false;
  }

  for (const m of src.matchAll(RE.importNamed)) {
    const isType = !!m[1];
    const names  = m[2].split(',')
      .map(n => n.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim())
      .filter(Boolean);
    add(m[3] /* module */, names, isType);  // m[3] because group 1 = optional 'type '
  }

  // Fix: importNamed has 3 capture groups; module is index 2
  // Re-do with corrected regex (the regex above has: 1=type?, 2=names, 3=module)
  // Already correct — continuing

  for (const m of src.matchAll(RE.importStar)) {
    add(m[2], ['*'], false);
  }

  for (const m of src.matchAll(RE.dynamicImport)) {
    add(m[1], [], false);
  }

  return [...map.entries()].map(([module, { names, isType }]) => ({
    module,
    names:  [...names],
    isType,
  }));
}

// ── Table extraction (Drizzle schema imports) ─────────────────────────────────

// Drizzle helper function names that are NOT table references
const NON_TABLE_NAMES = new Set([
  'eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'and', 'or', 'not', 'sql',
  'desc', 'asc', 'inArray', 'notInArray', 'isNull', 'isNotNull',
  'between', 'like', 'ilike', 'exists', 'notExists',
  'count', 'sum', 'avg', 'min', 'max',
  'primaryKey', 'index', 'uniqueIndex', 'foreignKey',
  'vector', 'halfvec', 'sparsevec', 'bit',
  'cosineDistance', 'l2Distance', 'innerProduct',
]);

function parseTables(src) {
  const tables = new Set();
  for (const m of src.matchAll(RE.schemaImport)) {
    for (const part of m[1].split(',')) {
      const clean = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim();
      // Table names start lowercase and are not helper functions or type aliases
      if (clean && /^[a-z][a-zA-Z0-9]*$/.test(clean) && !NON_TABLE_NAMES.has(clean)) {
        tables.add(clean);
      }
    }
  }
  return [...tables];
}

// ── MCP tool extraction ───────────────────────────────────────────────────────

function parseMcpTools(src) {
  const tools = new Set();
  for (const m of src.matchAll(RE.mcpTool)) if (m[1]) tools.add(m[1]);
  return [...tools];
}

// ── Tag extraction ────────────────────────────────────────────────────────────

const TAG_SIGNALS = /** @type {[RegExp, string][]} */ ([
  [/qdrant|vector\s*search|\.search\(.*embedding/i, 'vector'],
  [/neo4j|cypher\s*`|MATCH\s+\(|graphDb/i,          'graph'],
  [/\bredis\b|getRedis|HINCRBY|HSET|EXPIRE|setex\b/i, 'cache'],
  [/drizzle|from.*schema-postgres|\.insert\(|\.select\(\)/i, 'database'],
  [/rabbitmq|amqp|\.publish\(|\.consume\(/i,         'queue'],
  [/locals\.user|getSession|requireAuth|jwt\b/i,     'auth'],
  [/\bgrpc\b|\bproto\b|grpcClient/i,                 'grpc'],
  [/minio|uploadFile|deleteFile|getBucketName/i,      'storage'],
  [/ollama|bifrostChat|gemma|qwen|llm\b/i,            'llm'],
  [/\bgpu\b|cuda\b|wgsl\b|webgpu\b|tensorrt|libtorch/i, 'gpu'],
  [/onnxruntime|InferenceSession|webgpu.*ort\b/i,    'inference'],
  [/ragChunks|hybridSearch|contextAssembler|ACE/i,   'rag'],
  [/evidence\b|legalCase\b|statute\b|citation\b/i,   'legal'],
  [/EventSource|text\/event-stream|sseFormat/i,      'streaming'],
  [/createMachine|useMachine|fromPromise.*xstate/i,  'state-machine'],
  [/superForm|superValidate|zodClient/i,             'forms'],
  [/karpathy|pagerank|som_bmu|hyperedge/i,           'topology'],
  [/server\.tool\(|mcpServer|FastMCP/i,              'mcp'],
  [/worker_threads|new Worker\(/i,                   'worker'],
  [/\bwebsocket\b|new WebSocket\(/i,                 'websocket'],
]);

function extractTags(src, p) {
  const tags = new Set();

  // Path-derived tags
  if (p.includes('/auth/'))           tags.add('auth');
  if (p.includes('/evidence/'))       tags.add('evidence');
  if (p.includes('/cases/') || p.includes('/case/')) tags.add('cases');
  if (p.includes('/graph/'))          tags.add('graph');
  if (p.includes('/vector/'))         tags.add('vector');
  if (p.includes('/cache/'))          tags.add('cache');
  if (p.includes('/gpu/'))            tags.add('gpu');
  if (p.includes('/ai/'))             tags.add('ai');
  if (p.includes('/analytics/'))      tags.add('analytics');
  if (p.includes('/rag'))             tags.add('rag');
  if (p.includes('/mcp/'))            tags.add('mcp');
  if (p.includes('schema-postgres'))  tags.add('database');
  if (p.includes('/grpc/'))           tags.add('grpc');
  if (p.includes('/kb/'))             tags.add('kb');
  if (p.includes('/ace/'))            tags.add('ace');
  if (p.includes('/cartridge'))       tags.add('cartridge');
  if (p.includes('/search'))          tags.add('search');
  if (p.includes('/upload'))          tags.add('upload');
  if (p.includes('/health'))          tags.add('health');

  // Content-derived tags
  for (const [re, tag] of TAG_SIGNALS) {
    if (re.test(src)) tags.add(tag);
  }

  return [...tags].slice(0, 16);
}

// ── Summary extraction ────────────────────────────────────────────────────────

function extractSummary(src) {
  const m = RE.jsdocFirst.exec(src);
  if (!m) return undefined;
  const clean = m[1]
    .split('\n')
    .map(l => l.replace(/^\s*\*?\s?/, '').trim())
    .filter(l => l && !l.startsWith('@'))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return clean.slice(0, 200) || undefined;
}

// ── Source hash ───────────────────────────────────────────────────────────────

function sourceHash(content) {
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
}

// ── Graph data loader (codebase-graph.json → SOM coords) ─────────────────────

function loadGraphData() {
  if (!existsSync(GRAPH_JSON)) return new Map();
  try {
    const raw  = JSON.parse(readFileSync(GRAPH_JSON, 'utf-8'));
    const map  = new Map();
    // Support both { nodes: [...] } and { elements: { nodes: [...] } } shapes
    const nodes = raw.nodes ?? raw.elements?.nodes ?? [];
    for (const node of nodes) {
      const d    = node.data ?? node;
      const key  = d.id ?? d.path ?? d.file_path;
      if (!key) continue;
      const entry = {};
      if (d.somBmuRow  != null) entry.som_row  = d.somBmuRow;
      if (d.som_row    != null) entry.som_row  = d.som_row;
      if (d.somBmuCol  != null) entry.som_col  = d.somBmuCol;
      if (d.som_col    != null) entry.som_col  = d.som_col;
      if (d.pagerank   != null) entry.pagerank = d.pagerank;
      if (d.pr         != null) entry.pagerank = d.pr;
      if (Object.keys(entry).length) map.set(key, entry);
    }
    return map;
  } catch {
    return new Map();
  }
}

// ── Redis enrichment (Phase C: ace:module:cartridge and pagerank) ─────────────

async function enrichFromRedis(cartridges) {
  let redis = null;
  try {
    const { default: Redis } = await import('ioredis');
    const url = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
    redis = new Redis(url, {
      lazyConnect:          true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue:   false,
      retryStrategy:        () => null,
    });
    redis.on('error', () => {});
    await redis.connect();
    await redis.ping();
  } catch (e) {
    if (ARGS.verbose) console.warn('[cartridge] Redis unavailable:', e.message);
    else              console.warn('[cartridge] Redis unavailable — skipping enrichment');
    if (redis) { try { redis.disconnect(); } catch {} }
    return cartridges;
  }

  try {
    // Batch HGET gpu:karpathy:scores for all paths
    const pipeline = redis.pipeline();
    for (const c of cartridges) pipeline.hget('gpu:karpathy:scores', c.stable_key);
    const results = await pipeline.exec();

    let enriched = 0;
    for (let i = 0; i < cartridges.length; i++) {
      const [err, val] = results[i];
      if (err || !val) continue;
      try {
        const parsed = JSON.parse(val);
        const score  = parsed.blend ?? parsed.pr ?? null;
        if (score != null) {
          cartridges[i].pagerank = Math.round(score * 1000) / 1000;
          enriched++;
        }
      } catch {}
    }

    if (enriched > 0) console.log(`[cartridge] Redis enriched ${enriched} pagerank scores`);

    // Phase C: cache each cartridge in Redis for ACE fast-path
    // Key: ace:module:cartridge:{stable_key} (24h TTL)
    // Value: minified JSON
    if (!ARGS.dryRun) {
      const writePipeline = redis.pipeline();
      const TTL = 24 * 3600;
      for (const c of cartridges) {
        const min = JSON.stringify({
          p: c.path, t: c.kind, e: c.exports.slice(0, 20),
          tg: c.tags, pr: c.pagerank, h: c.source_hash.slice(0, 12),
        });
        writePipeline.setex(`ace:module:cartridge:${c.stable_key}`, TTL, min);
      }
      await writePipeline.exec();
      console.log(`[cartridge] Wrote ${cartridges.length} entries to Redis ace:module:cartridge:* (24h TTL)`);
    }

  } finally {
    try { await redis.quit(); } catch { try { redis.disconnect(); } catch {} }
  }

  return cartridges;
}

// ── Core cartridge builder ────────────────────────────────────────────────────

function buildCartridge(filePath, graphData) {
  const relPath = relative(ROOT, filePath).replace(/\\/g, '/');
  let src;
  try { src = readFileSync(filePath, 'utf-8'); }
  catch { return null; }

  // Skip empty or very small generated files
  if (src.trim().length < 10) return null;

  const hash    = sourceHash(src);
  const kind    = detectKind(relPath);
  const routes  = extractRoutes(relPath);
  const exports = parseExports(src, relPath);
  const imports = parseImports(src);
  const tables  = parseTables(src);
  const tools   = parseMcpTools(src);
  const tags    = extractTags(src, relPath);
  const summary = extractSummary(src);

  // SOM / pagerank from graph JSON
  const gd = graphData.get(relPath) ?? graphData.get(basename(relPath)) ?? {};

  return {
    stable_key:   relPath,
    kind,
    path:         relPath,
    exports:      exports.slice(0, 60),
    imports:      imports.slice(0, 60),
    routes,
    tables,
    mcp_tools:    tools,
    tags,
    ...(gd.pagerank != null ? { pagerank: gd.pagerank }   : {}),
    ...(gd.som_row  != null ? { som_row:  gd.som_row  }   : {}),
    ...(gd.som_col  != null ? { som_col:  gd.som_col  }   : {}),
    ...(summary                ? { summary }               : {}),
    source_hash:  hash,
    generated_at: new Date().toISOString(),
  };
}

// ── Output helpers ────────────────────────────────────────────────────────────

function printSample(cartridges) {
  const sample =
    cartridges.find(c => c.pagerank != null && c.kind === 'server' && c.exports.length > 0) ??
    cartridges.find(c => c.kind === 'api' && c.exports.length > 0) ??
    cartridges.find(c => c.exports.length > 0) ??
    cartridges[0];

  if (!sample) return;

  console.log('\n── Sample cartridge ─────────────────────────────────────────');
  const { imports: _i, ...display } = sample;  // omit imports for brevity
  console.log(JSON.stringify(display, null, 2).slice(0, 1400));

  console.log('\n── Sample minified entry ────────────────────────────────────');
  console.log(JSON.stringify({
    p:  sample.path,
    t:  sample.kind,
    e:  sample.exports.slice(0, 6),
    tg: sample.tags.slice(0, 6),
    ...(sample.pagerank != null ? { pr: sample.pagerank } : {}),
    h:  sample.source_hash.slice(0, 12),
  }, null, 2));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const t0 = performance.now();
  console.log('[cartridge] Scanning codebase...');
  if (ARGS.dryRun) console.log('[cartridge] DRY RUN — outputs will not be written');

  // Collect source files
  const allFiles = [
    ...walkDir(SRC),
    ...walkDir(SCRIPTS),
    ...walkDir(TESTS),
  ];
  console.log(`[cartridge] Found ${allFiles.length} source files`);

  // Load graph data for SOM coords / pagerank
  const graphData = loadGraphData();
  if (graphData.size > 0) {
    console.log(`[cartridge] Loaded graph data for ${graphData.size} nodes`);
  }

  // Build cartridges
  const cartridges = [];
  for (const filePath of allFiles) {
    const c = buildCartridge(filePath, graphData);
    if (c) cartridges.push(c);
  }
  console.log(`[cartridge] Built ${cartridges.length} cartridges`);

  // Enrich from Redis (pagerank + write cache)
  if (!ARGS.noRedis) {
    await enrichFromRedis(cartridges);
  }

  const withPagerank = cartridges.filter(c => c.pagerank != null).length;
  const withSom      = cartridges.filter(c => c.som_row  != null).length;
  console.log(`[cartridge] Coverage — pagerank: ${withPagerank}, som: ${withSom}`);

  if (ARGS.dryRun) {
    console.log('\n[cartridge] DRY RUN complete — no files written');
    printSample(cartridges);
    return;
  }

  // ── Write outputs ──────────────────────────────────────────────────────────
  mkdirSync(MEM_DIR, { recursive: true });

  // 1. Full JSONL (one cartridge per line)
  const jsonlPath  = join(MEM_DIR, 'module-cartridges.jsonl');
  const jsonlLines = cartridges.map(c => JSON.stringify(c));
  writeFileSync(jsonlPath, jsonlLines.join('\n') + '\n', 'utf-8');
  const jsonlKB = (jsonlLines.reduce((a, l) => a + l.length, 0) / 1024).toFixed(0);
  console.log(`[cartridge] Wrote ${jsonlPath}  (${cartridges.length} lines, ${jsonlKB} KB)`);

  // 2. Minified JSON array (compact, short keys, no imports)
  const minPath    = join(MEM_DIR, 'module-cartridges.min.json');
  const minEntries = cartridges.map(c => ({
    p:  c.path,
    t:  c.kind,
    e:  c.exports.slice(0, 20),
    tg: c.tags,
    ...(c.pagerank != null ? { pr: Math.round(c.pagerank * 1000) / 1000 } : {}),
    h:  c.source_hash.slice(0, 12),
  }));
  const minJson = JSON.stringify(minEntries);
  writeFileSync(minPath, minJson, 'utf-8');
  console.log(`[cartridge] Wrote ${minPath}  (${(minJson.length / 1024).toFixed(0)} KB)`);

  // 3. Index JSON (stable_key → { kind, source_hash })
  const idxPath = join(MEM_DIR, 'module-cartridges.idx.json');
  const idxEntries = Object.fromEntries(
    cartridges.map(c => [c.stable_key, { kind: c.kind, source_hash: c.source_hash }])
  );
  const idx = {
    version:      '1.0.0',
    generated_at: new Date().toISOString(),
    count:        cartridges.length,
    entries:      idxEntries,
  };
  writeFileSync(idxPath, JSON.stringify(idx, null, 2), 'utf-8');
  console.log(`[cartridge] Wrote ${idxPath}`);

  // 4. Binary Float32 pagerank array (.f32) + positional index (.idx.json)
  // Only cartridges that have a pagerank score are included. The companion
  // idx.json maps stable_key → array position so callers can read a single
  // value from the Float32Array without loading the full JSONL.
  const pagerankEntries = cartridges.filter(c => c.pagerank != null);
  if (pagerankEntries.length > 0) {
    const f32Path  = join(MEM_DIR, 'module-pagerank.f32');
    const f32IdxPath = join(MEM_DIR, 'module-pagerank.idx.json');
    const buf = Buffer.allocUnsafe(pagerankEntries.length * 4);
    const posMap = {};
    for (let i = 0; i < pagerankEntries.length; i++) {
      buf.writeFloatLE(pagerankEntries[i].pagerank, i * 4);
      posMap[pagerankEntries[i].stable_key] = i;
    }
    writeFileSync(f32Path, buf);
    writeFileSync(f32IdxPath, JSON.stringify({ count: pagerankEntries.length, keys: posMap }));
    console.log(`[cartridge] Wrote ${f32Path}  (${pagerankEntries.length} floats, ${(buf.length / 1024).toFixed(1)} KB)`);
    console.log(`[cartridge] Wrote ${f32IdxPath}`);
  }

  const elapsed = ((performance.now() - t0) / 1000).toFixed(2);
  console.log(`\n[cartridge] Done in ${elapsed}s — ${cartridges.length} cartridges`);

  // Kind distribution
  const byKind = {};
  for (const c of cartridges) byKind[c.kind] = (byKind[c.kind] ?? 0) + 1;
  const dist = Object.entries(byKind).sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k}:${n}`).join('  ');
  console.log(`[cartridge] Kinds — ${dist}`);

  printSample(cartridges);
}

main().catch(e => {
  console.error('[cartridge] Fatal:', e.message ?? e);
  process.exit(1);
});
