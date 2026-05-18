/**
 * rg-search-matrix.ts
 *
 * Server-side service that bridges rg (ripgrep) exact-path/symbol search
 * with the ACE Feature Context Matrix.
 *
 * Provides:
 *   - rgSearch(terms, opts) — runs rg via child_process, returns file paths
 *   - buildSearchMatrix(query) — derive search terms from a query and run rg
 *   - cacheRgMatrix(key, paths) — store rg results in Redis ace:rg:{hash}
 *   - getCachedRgMatrix(key) — retrieve a previously cached rg result set
 *
 * This service runs SERVER-SIDE ONLY. It must not be imported in browser code.
 * rg is the CPU/exact-match lane in the ACE retrieval hierarchy — it runs
 * before Qdrant ANN when the query contains known identifiers or file stems.
 */

import { execSync }    from 'node:child_process';
import crypto          from 'node:crypto';
import path            from 'node:path';
import { fileURLToPath } from 'node:url';
import { getRedis }    from '$lib/server/redis.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RgSearchOptions {
  /** Absolute or repo-relative root directory to search */
  root?:       string;
  /** Additional glob patterns to include (e.g. ['*.ts', '*.svelte']) */
  globs?:      string[];
  /** Max results to return */
  limit?:      number;
  /** Case-insensitive search */
  ignoreCase?: boolean;
  /** File types to filter ('ts' | 'svelte' | 'js' | ...) */
  fileType?:   string;
}

export interface RgSearchResult {
  terms:      string[];
  pattern:    string;
  paths:      string[];
  cached:     boolean;
  source:     'rg' | 'redis_cache' | 'fallback';
  elapsed_ms: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const __dir     = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dir, '../../../..');

const RG_CACHE_TTL    = 300;   // 5 minutes — rg results are exact, stable within a session
const RG_CACHE_PREFIX = 'ace:rg';
const DEFAULT_GLOBS   = ['*.ts', '*.svelte', '*.mjs', '*.js', '*.sql'];

// ── rg availability ───────────────────────────────────────────────────────────

let rgAvailable: boolean | null = null;

function isRgAvailable(): boolean {
  if (rgAvailable !== null) return rgAvailable;
  try {
    execSync('rg --version', { stdio: 'ignore' });
    rgAvailable = true;
  } catch {
    rgAvailable = false;
  }
  return rgAvailable;
}

// ── Term extraction (matches build-rg-search-matrix.mjs logic) ───────────────

const STOP_WORDS = new Set([
  'the','a','an','is','are','was','were','be','been','have','has','do','does',
  'not','and','or','but','for','in','on','at','to','from','with','by','as','of',
  'that','this','it','they','we','you','i','me',
]);

export function extractSearchTerms(query: string): string[] {
  const tokens = new Set<string>();

  // TypeScript error codes
  for (const m of query.matchAll(/TS\d{4}/g))          tokens.add(m[0]);
  // camelCase / PascalCase symbols (≥6 chars)
  for (const m of query.matchAll(/\b[A-Z][a-zA-Z]{5,}\b|\b[a-z][a-zA-Z]{5,}[A-Z]\w*\b/g))
    tokens.add(m[0]);
  // kebab-case identifiers (≥8 chars)
  for (const m of query.matchAll(/\b[a-z]+-[a-z]+(?:-[a-z]+)*\b/g))
    if (m[0].length >= 8) tokens.add(m[0]);
  // Explicit file stems
  for (const m of query.matchAll(/\b([\w\-]+)\.(ts|js|svelte|mjs|sql)\b/gi))
    tokens.add(m[1]);

  return [...tokens]
    .filter(t => t.length >= 5 && !STOP_WORDS.has(t.toLowerCase()))
    .slice(0, 8);
}

// ── rg execution ──────────────────────────────────────────────────────────────

function buildRgCommand(terms: string[], opts: RgSearchOptions): string {
  const root   = opts.root ?? path.join(REPO_ROOT, 'src');
  const limit  = opts.limit ?? 50;
  const icase  = opts.ignoreCase ? '-i ' : '';
  const globs  = (opts.globs ?? DEFAULT_GLOBS).map(g => `--glob "${g}"`).join(' ');
  const type   = opts.fileType ? `--type ${opts.fileType} ` : '';
  const pattern = terms
    .map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');

  return [
    'rg', '--files-with-matches', icase + type, globs,
    '--no-ignore-vcs', '--max-count', '1',
    '-e', `"${pattern}"`,
    `"${root}"`,
  ].join(' ');
}

export async function rgSearch(terms: string[], opts: RgSearchOptions = {}): Promise<RgSearchResult> {
  const start   = Date.now();
  const pattern = terms.join('|');

  if (!terms.length) {
    return { terms, pattern: '', paths: [], cached: false, source: 'rg', elapsed_ms: 0 };
  }

  const redis  = getRedis();
  const cacheKey = `${RG_CACHE_PREFIX}:${crypto.createHash('sha256').update(pattern + (opts.root ?? '')).digest('hex').slice(0, 16)}`;

  // Check Redis cache
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return {
        terms, pattern,
        paths:      JSON.parse(cached) as string[],
        cached:     true,
        source:     'redis_cache',
        elapsed_ms: Date.now() - start,
      };
    }
  } catch { /* cache miss, proceed */ }

  // rg or fallback
  let paths: string[] = [];
  let source: RgSearchResult['source'] = 'rg';

  if (isRgAvailable()) {
    try {
      const cmd = buildRgCommand(terms, opts);
      const out = execSync(cmd, {
        encoding: 'utf8',
        maxBuffer: 1024 * 1024 * 4,
        timeout: 10000,
      });
      paths = out.trim().split('\n')
        .filter(Boolean)
        .map(p => path.relative(REPO_ROOT, p).replace(/\\/g, '/'))
        .slice(0, opts.limit ?? 50);
    } catch { /* empty result or rg error */ }
  } else {
    source = 'fallback';
    // No-op: JS fallback is too slow for server hot-path; return empty
  }

  // Cache result
  try {
    await redis.setex(cacheKey, RG_CACHE_TTL, JSON.stringify(paths));
  } catch { /* non-fatal */ }

  return { terms, pattern, paths, cached: false, source, elapsed_ms: Date.now() - start };
}

/**
 * High-level helper: extract terms from a natural language query
 * and run rg to find related source files.
 */
export async function buildSearchMatrix(query: string, opts: RgSearchOptions = {}): Promise<RgSearchResult> {
  const terms = extractSearchTerms(query);
  return rgSearch(terms, opts);
}

/**
 * Store an arbitrary rg result in Redis for later retrieval.
 * The key is the queryHash (any stable string you choose).
 */
export async function cacheRgMatrix(queryHash: string, paths: string[]): Promise<void> {
  const redis = getRedis();
  try {
    await redis.setex(`${RG_CACHE_PREFIX}:${queryHash}`, RG_CACHE_TTL, JSON.stringify(paths));
  } catch { /* non-fatal */ }
}

/**
 * Retrieve a previously cached rg result by query hash.
 */
export async function getCachedRgMatrix(queryHash: string): Promise<string[] | null> {
  const redis = getRedis();
  try {
    const raw = await redis.get(`${RG_CACHE_PREFIX}:${queryHash}`);
    return raw ? (JSON.parse(raw) as string[]) : null;
  } catch {
    return null;
  }
}