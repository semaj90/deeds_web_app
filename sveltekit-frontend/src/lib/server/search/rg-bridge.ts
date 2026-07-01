/**
 * src/lib/server/search/rg-bridge.ts
 *
 * Subprocess wrapper for ripgrep (rg) CLI.
 *
 * Handles:
 *   - rg binary discovery (system PATH, npm, @vscode/ripgrep)
 *   - Query escaping and shell injection prevention
 *   - Output parsing and structured result formatting
 *   - Error handling and graceful fallback
 *   - Timeout protection (max 5 seconds)
 *
 * Usage:
 *   const results = await runRgSearch({
 *     query: 'export function',
 *     type: 'ts',
 *     exclude: 'node_modules,dist',
 *     limit: 100,
 *     includeContext: true
 *   });
 */

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { log } from '$lib/server/logging';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface RgSearchResult {
  file: string;
  line: number;
  column?: number;
  content: string;
  match: string;
  context?: {
    before: string[];
    after: string[];
  };
}

export interface RgSearchResponse {
  ok: boolean;
  results: RgSearchResult[];
  error?: string;
  timedOut?: boolean;
}

interface RgSearchOptions {
  query: string;
  type?: string;
  exclude?: string;
  includeContext?: boolean;
  contextLines?: number;
  limit?: number;
  cwd?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// rg Discovery
// ─────────────────────────────────────────────────────────────────────────────

let _rgPath: string | null = null;
let _rgSearched = false;

function findRgBinary(): string | null {
  if (_rgSearched) return _rgPath;
  _rgSearched = true;

  // 1. Check npm installation (ripgrep package)
  const npmRgPath = resolve('node_modules/.bin/rg');
  if (existsSync(npmRgPath)) {
    _rgPath = npmRgPath;
    log.debug('[rg-bridge] Found rg in node_modules/.bin');
    return _rgPath;
  }

  // 2. Check ripgrep package bin directory
  const ripgrepBinPath = resolve('node_modules/ripgrep/bin/rg');
  if (existsSync(ripgrepBinPath)) {
    _rgPath = ripgrepBinPath;
    log.debug('[rg-bridge] Found rg in ripgrep/bin');
    return _rgPath;
  }

  // 3. Check @vscode/ripgrep
  const vscodeRgPath = resolve('node_modules/@vscode/ripgrep/bin/rg');
  if (existsSync(vscodeRgPath)) {
    _rgPath = vscodeRgPath;
    log.debug('[rg-bridge] Found rg in @vscode/ripgrep');
    return _rgPath;
  }

  // 4. Fallback to system PATH
  _rgPath = 'rg';
  log.debug('[rg-bridge] Will attempt system PATH: rg');
  return _rgPath;
}

// ─────────────────────────────────────────────────────────────────────────────
// Query Escaping
// ─────────────────────────────────────────────────────────────────────────────

function escapeRgQuery(query: string): string {
  // rg uses PCRE2 regex syntax
  // Escape special characters but allow basic operators
  return query
    .replace(/[.+*?^${}()|[\]\\]/g, '\\$&') // Escape regex metacharacters
    .trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Output Parsing
// ─────────────────────────────────────────────────────────────────────────────

interface RgJsonOutput {
  type: 'match' | 'context' | 'summary' | 'begin' | 'end';
  data?: {
    path?: {
      text: string;
    };
    line_number?: number;
    column_number?: number;
    lines?: {
      text: string;
    };
    submatches?: Array<{
      match: {
        text: string;
      };
      start: number;
      end: number;
    }>;
  };
}

function parseRgOutput(
  jsonLines: string[],
  options: RgSearchOptions
): RgSearchResult[] {
  const results: Map<string, RgSearchResult> = new Map();

  for (const line of jsonLines) {
    if (!line.trim()) continue;

    try {
      const item: RgJsonOutput = JSON.parse(line);

      if (item.type === 'match' && item.data) {
        const file = item.data.path?.text || '';
        const lineNum = item.data.line_number || 0;
        const content = item.data.lines?.text || '';
        const match = item.data.submatches?.[0]?.match?.text || '';

        const key = `${file}:${lineNum}`;
        results.set(key, {
          file,
          line: lineNum,
          column: item.data.column_number,
          content: content.trim(),
          match: match.trim()
        });
      }
    } catch (err) {
      // Skip malformed JSON lines
      log.debug(`[rg-bridge] Failed to parse JSON: ${line.slice(0, 50)}...`);
    }
  }

  return Array.from(results.values());
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Search Function
// ─────────────────────────────────────────────────────────────────────────────

export async function runRgSearch(options: RgSearchOptions): Promise<RgSearchResponse> {
  const rgPath = findRgBinary();
  if (!rgPath) {
    log.error('[rg-bridge] rg binary not found');
    return {
      ok: false,
      results: [],
      error: 'rg binary not found. Install with: npm install -g ripgrep'
    };
  }

  const {
    query,
    type,
    exclude = 'node_modules,dist,build,.next,coverage',
    includeContext = true,
    contextLines = 2,
    limit = 100,
    cwd = process.cwd().includes('sveltekit-frontend')
      ? process.cwd()
      : resolve(process.cwd(), 'sveltekit-frontend')
  } = options;

  const escapedQuery = escapeRgQuery(query);

  // Build rg command arguments
  const args: string[] = [
    '--json', // JSON output
    '--color', 'never', // No ANSI codes
    '--max-count', limit.toString(), // Limit results
  ];

  // Add context lines
  if (includeContext) {
    args.push('-A', contextLines.toString());
    args.push('-B', contextLines.toString());
  }

  // Add file type filter
  if (type) {
    args.push('-t', type);
  }

  // Add exclude patterns
  if (exclude) {
    exclude.split(',').forEach((pattern) => {
      args.push('--glob', `!${pattern.trim()}/*`);
    });
  }

  // Add the search query
  args.push(escapedQuery);

  // Add search directory
  args.push(cwd);

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let resolved = false;

    const proc = spawn(rgPath, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 5000
    });

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        proc.kill();
        log.warn(`[rg-bridge] Search timeout for query: ${query}. Got ${stdout.length} bytes of output.`);
        resolve({
          ok: false,
          results: [],
          error: 'Search timed out',
          timedOut: true
        });
      }
    }, 15000); // 15 second timeout (increased from 5s to account for large result sets)

    proc.stdout!.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr!.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      clearTimeout(timeout);

      if (resolved) return;
      resolved = true;

      if (code === 0 || code === 1) {
        // 0 = matches found, 1 = no matches (both OK)
        const jsonLines = stdout.split('\n');
        const results = parseRgOutput(jsonLines, options);

        log.debug(`[rg-bridge] Found ${results.length} results for query: ${query}`);

        resolve({
          ok: true,
          results: results.slice(0, limit) // Enforce limit
        });
      } else if (code === 2) {
        // Error
        log.error(`[rg-bridge] rg error: ${stderr}`);
        resolve({
          ok: false,
          results: [],
          error: stderr || 'rg returned an error'
        });
      } else {
        log.error(`[rg-bridge] Unknown exit code: ${code}`);
        resolve({
          ok: false,
          results: [],
          error: `Unknown error (exit code: ${code})`
        });
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      if (resolved) return;
      resolved = true;
      log.error(`[rg-bridge] Process error: ${err.message}`);
      resolve({
        ok: false,
        results: [],
        error: `Process error: ${err.message}`
      });
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Batch Search
// ─────────────────────────────────────────────────────────────────────────────

export async function runRgSearchBatch(
  queries: string[],
  options?: Omit<RgSearchOptions, 'query'>
): Promise<Map<string, RgSearchResponse>> {
  const results = new Map<string, RgSearchResponse>();

  for (const query of queries) {
    const result = await runRgSearch({
      ...options,
      query
    });
    results.set(query, result);
  }

  return results;
}
