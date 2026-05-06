/**
 * Reference verifier — turns Graphify fanIn=0 orphan *candidates* into
 * grade-A pruning classifications via chunked, streamed, cache-aware
 * import-graph analysis.
 *
 * Used by D9 of deep-audit-ast.mjs and the /deep-audit slash command.
 *
 * Performance pipeline:
 *   1. Build haystack ONCE (read all src/**\/*.{ts,tsx,svelte,...} files)
 *   2. Hash haystack content → cache key
 *   3. Load `.cache/d9-verifier/<haystackHash>.json` if present (cache hit
 *      means the underlying source didn't change → all classifications reusable)
 *   4. For unhashed candidates, classify in chunks of CHUNK_SIZE
 *   5. Stream progress to caller via onChunk callback (one event per chunk)
 *   6. Persist cache after every chunk (resumable on Ctrl-C)
 *
 * Typical runtime:
 *   - cold (no cache): 3000 candidates / 50 per chunk = 60 chunks, ~30-60s
 *   - warm (full cache): <100ms (just JSON.parse the cache file)
 *   - partial (50% cache): proportional speedup
 *
 * Classifications (priority order):
 *   - route-entrypoint              SvelteKit auto-loaded; never prune
 *   - config-or-framework-entrypoint hooks/sw/configs/migrations; never prune
 *   - ambient-types                 .d.ts files that ship types only
 *   - runtime-referenced            real `from '...'` consumer
 *   - dynamic-referenced            `import('...')` only
 *   - barrel-reexported             surfaced via index.ts re-export
 *   - type-only-referenced          `import type` only
 *   - path-mentioned                bare string mention (rare; manual)
 *   - true-orphan-candidate         no references — safe to archive after manual peek
 */
import { spawnSync }     from 'node:child_process';
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash }    from 'node:crypto';
import path              from 'node:path';

// ── Tuneables ───────────────────────────────────────────────────────────────

export const CHUNK_SIZE     = Number(process.env.D9_CHUNK_SIZE ?? '50');
export const CACHE_DIR      = path.join('.cache', 'd9-verifier');
export const CACHE_VERSION  = 'v5'; // bump if classifier semantics change

// ── Bulk source loader ──────────────────────────────────────────────────────

function loadAllSources(cwd) {
  let files = [];
  try {
    const result = spawnSync(
      'rg', ['--files', '--type-add', 'srcweb:*.{ts,tsx,svelte,svelte.ts,js,mjs,cjs}', '-tsrcweb', 'src'],
      { cwd, encoding: 'utf8', shell: false, maxBuffer: 50 * 1024 * 1024 },
    );
    if (result.status === 0 && result.stdout) {
      files = result.stdout.split(/\r?\n/).filter(Boolean);
    }
  } catch { /* fall through */ }

  if (!files.length) {
    files = walkSync(path.join(cwd, 'src')).filter((f) => /\.(ts|tsx|svelte|svelte\.ts|js|mjs|cjs)$/.test(f));
  }

  // Deterministic ordering — keeps the haystack hash stable across runs so
  // the cache survives. rg/walkSync may return non-deterministic orders.
  files.sort();

  const chunks = [];
  for (const f of files) {
    try { chunks.push(readFileSync(f, 'utf8')); } catch { /* skip unreadable */ }
  }
  return chunks.join('\n');
}

function walkSync(dir, out = []) {
  try {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
        walkSync(full, out);
      } else {
        out.push(full);
      }
    }
  } catch { /* skip */ }
  return out;
}

// ── Lazy haystack + content-hash cache ──────────────────────────────────────

let _state = null; // { haystack, importLines, hash, cacheFile, cache }

function ensureHaystack(cwd) {
  if (_state) return _state;
  const haystack = loadAllSources(cwd);
  // Pre-extract import-shape lines (10× smaller than full corpus)
  const importLines = haystack
    .split('\n')
    .filter((ln) => /\b(from|import|export)\s*[(\s'"`]/.test(ln))
    .join('\n');
  // Hash the import lines (not the whole corpus — keeps cache valid across
  // non-import file edits like comment tweaks)
  const hash = createHash('sha1').update(CACHE_VERSION + ':' + importLines).digest('hex').slice(0, 16);

  const cacheRoot = path.join(cwd, CACHE_DIR);
  const cacheFile = path.join(cacheRoot, `${hash}.json`);
  let cache = {};
  if (existsSync(cacheFile)) {
    try { cache = JSON.parse(readFileSync(cacheFile, 'utf8')); } catch { cache = {}; }
  }

  _state = { haystack, importLines, hash, cacheFile, cacheRoot, cache };
  return _state;
}

function persistCache() {
  if (!_state) return;
  try {
    if (!existsSync(_state.cacheRoot)) mkdirSync(_state.cacheRoot, { recursive: true });
    writeFileSync(_state.cacheFile, JSON.stringify(_state.cache), 'utf8');
  } catch { /* non-fatal */ }
}

export function moduleStem(filePath) {
  return path.basename(filePath).replace(/\.(d\.ts|ts|tsx|svelte|svelte\.ts|js|mjs|cjs)$/, '');
}

const ROUTE_ENTRY_RE   = /\/\+(server|page|layout)(\.server)?\.(ts|svelte)$/;
const FRAMEWORK_RE     = /(^|\/)(hooks\.server|hooks\.client|app\.html|service-worker|vite\.config|svelte\.config|tailwind\.config|uno\.config|drizzle\.config|playwright\.config|vitest\.config)\./;
const FRAMEWORK_DIR_RE = /(^|\/)(routes|params|workers|migrations|drizzle|schemas|static|tests|test|__tests__)\//;
// Runtime-only / browser-shim paths that have no static importers in src/ but
// are loaded at runtime via vite, $app/environment, or browser entry points.
// Documented in CLAUDE.md "Known False Negatives".
const RUNTIME_LOAD_RE  = /(^|\/)(shims|webgpu|gpu|ai\/onnx|icons|webgl)\//;

export function classifyEntry(rel) {
  const norm = rel.replaceAll('\\', '/');
  if (norm.endsWith('.d.ts'))                          return 'ambient-types';
  if (/\.(test|spec)\.(ts|tsx|js|mjs)$/.test(norm))    return 'test-suite';
  if (ROUTE_ENTRY_RE.test(norm))                       return 'route-entrypoint';
  if (FRAMEWORK_RE.test(norm))                         return 'config-or-framework-entrypoint';
  if (FRAMEWORK_DIR_RE.test(norm))                     return 'config-or-framework-entrypoint';
  if (RUNTIME_LOAD_RE.test(norm))                      return 'runtime-loaded';
  return null;
}

// ── Single-candidate verifier (cache-aware) ─────────────────────────────────

export function verifyReferences(filePath, cwd) {
  const state = ensureHaystack(cwd);
  const rel  = filePath.replaceAll('\\', '/');
  const stem = moduleStem(rel);

  // Cache lookup (key = rel path; hash invalidates on import-line change)
  const cached = state.cache[rel];
  if (cached) return cached;

  const earlyExit = classifyEntry(rel);
  if (earlyExit) {
    const r = { filePath: rel, stem, classification: earlyExit, totalReferences: 0, hits: {} };
    state.cache[rel] = r;
    return r;
  }

  const esc = stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = {
    directFrom:    new RegExp(`from\\s*['"\`][^'"\`]*\\b${esc}\\b[^'"\`]*['"\`]`),
    dynamicImport: new RegExp(`import\\s*\\(\\s*['"\`][^'"\`]*\\b${esc}\\b[^'"\`]*['"\`]`),
    typeImport:    new RegExp(`import\\s+type[^;]*['"\`][^'"\`]*\\b${esc}\\b[^'"\`]*['"\`]`),
    barrelExport:  new RegExp(`export\\s+(?:type\\s+)?(?:\\*|\\{[^}]*\\})\\s+from\\s+['"\`][^'"\`]*\\b${esc}\\b[^'"\`]*['"\`]`),
    pathMention:   new RegExp(`['"\`][^'"\`]*\\b${esc}\\b[^'"\`]*['"\`]`),
  };

  const hits = {
    directFrom:    patterns.directFrom.test(state.importLines),
    dynamicImport: patterns.dynamicImport.test(state.importLines),
    typeImport:    patterns.typeImport.test(state.importLines),
    barrelExport:  patterns.barrelExport.test(state.importLines),
    pathMention:   patterns.pathMention.test(state.importLines),
  };

  let classification = 'true-orphan-candidate';
  if      (hits.directFrom)    classification = 'runtime-referenced';
  else if (hits.dynamicImport) classification = 'dynamic-referenced';
  else if (hits.barrelExport)  classification = 'barrel-reexported';
  else if (hits.typeImport)    classification = 'type-only-referenced';
  else if (hits.pathMention)   classification = 'path-mentioned';

  const total = Object.values(hits).filter(Boolean).length;
  const r = { filePath: rel, stem, classification, totalReferences: total, hits };
  state.cache[rel] = r;
  return r;
}

// ── Chunked + streamed batch verifier ───────────────────────────────────────

/**
 * Verify candidates in chunks. Streams progress via `onChunk` (called once per
 * chunk with `{ index, total, chunkResults, cumulativeCacheHits }`).
 * Persists cache after each chunk so Ctrl-C is resumable.
 *
 * @param {string[]} candidates  Array of relative file paths
 * @param {string}   cwd         Project root
 * @param {object}   opts
 * @param {number}   opts.chunkSize
 * @param {(evt: { index: number, total: number, chunkResults: object[], cumulativeCacheHits: number, elapsedMs: number }) => void} opts.onChunk
 */
export async function verifyBatch(candidates, cwd, opts = {}) {
  const chunkSize = opts.chunkSize ?? CHUNK_SIZE;
  const onChunk   = opts.onChunk ?? (() => {});

  ensureHaystack(cwd); // warm cache
  const state = _state;
  const startMs = Date.now();
  const all = [];
  let cacheHits = 0;
  const totalChunks = Math.ceil(candidates.length / chunkSize);

  for (let i = 0; i < candidates.length; i += chunkSize) {
    const chunk = candidates.slice(i, i + chunkSize);
    const chunkResults = [];
    for (const c of chunk) {
      const cached = state.cache[c.replaceAll('\\', '/')];
      if (cached) cacheHits++;
      chunkResults.push(verifyReferences(c, cwd));
    }
    all.push(...chunkResults);

    // Persist after each chunk (resumable)
    persistCache();

    // await — onChunk may be async (consumers persist a partial report each
    // chunk, and the report path is shared so two concurrent renames race).
    await onChunk({
      index:               Math.floor(i / chunkSize) + 1,
      total:               totalChunks,
      chunkResults,
      cumulativeCacheHits: cacheHits,
      elapsedMs:           Date.now() - startMs,
    });
  }

  return all;
}

/** Aggregate verifier outputs into the gate-D9 report shape. */
export function summarise(results) {
  const counts = {
    'runtime-referenced':            0,
    'dynamic-referenced':            0,
    'barrel-reexported':             0,
    'type-only-referenced':          0,
    'path-mentioned':                0,
    'route-entrypoint':              0,
    'config-or-framework-entrypoint': 0,
    'runtime-loaded':                0,
    'ambient-types':                 0,
    'test-suite':                    0,
    'true-orphan-candidate':         0,
  };
  const trueOrphans = [];
  for (const r of results) {
    counts[r.classification] = (counts[r.classification] ?? 0) + 1;
    if (r.classification === 'true-orphan-candidate') trueOrphans.push(r.filePath);
  }
  return { counts, trueOrphans };
}

/** Reset internal state — useful in tests. */
export function _resetForTests() {
  _state = null;
}

/** Expose cache stats for telemetry. */
export function getCacheStats() {
  if (!_state) return { primed: false };
  return {
    primed:      true,
    haystackKB:  Math.round(_state.haystack.length / 1024),
    importsKB:   Math.round(_state.importLines.length / 1024),
    hash:        _state.hash,
    cachedKeys:  Object.keys(_state.cache).length,
    cacheFile:   _state.cacheFile,
  };
}
