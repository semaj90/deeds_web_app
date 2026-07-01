/**
 * src/lib/server/search/rg-pool.ts
 *
 * Worker pool for ripgrep (rg) subprocess management.
 *
 * Prevents:
 * - Process explosion (max 5 concurrent rg processes)
 * - Zombie processes (cleanup on error)
 * - Queue buildup (FIFO task ordering)
 *
 * Usage:
 *   const pool = getRgPool();
 *   const results = await pool.search({
 *     query: 'export function',
 *     type: 'ts',
 *     limit: 100
 *   });
 */

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { log } from '$lib/server/logging';

export interface RgSearchOptions {
  query: string;
  type?: string;
  exclude?: string;
  includeContext?: boolean;
  contextLines?: number;
  limit?: number;
  cwd?: string;
}

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

export interface RgPoolStats {
  queued: number;
  active: number;
  completed: number;
  failed: number;
}

class RgPool {
  private maxConcurrency = 5;
  private activeProcesses = new Set<NodeJS.Process>();
  private queue: Array<{
    options: RgSearchOptions;
    resolve: (value: RgSearchResult[]) => void;
    reject: (error: Error) => void;
  }> = [];

  private stats = {
    queued: 0,
    active: 0,
    completed: 0,
    failed: 0
  };

  private rgPath: string | null = null;

  constructor() {
    this.rgPath = this.findRgBinary();
  }

  private findRgBinary(): string | null {
    const candidates = [
      resolve('node_modules/.bin/rg'),
      resolve('node_modules/ripgrep/bin/rg'),
      '/usr/bin/rg',
      '/usr/local/bin/rg',
      'rg'
    ];

    for (const candidate of candidates) {
      if (existsSync(candidate) || candidate === 'rg') {
        log.debug(`[rg-pool] Found rg binary: ${candidate}`);
        return candidate;
      }
    }

    log.warn('[rg-pool] No rg binary found');
    return null;
  }

  async search(options: RgSearchOptions): Promise<RgSearchResult[]> {
    if (!this.rgPath) {
      throw new Error('rg binary not found');
    }

    return new Promise((resolve, reject) => {
      this.stats.queued++;
      this.queue.push({ options, resolve, reject });
      this.processQueue();
    });
  }

  private processQueue(): void {
    while (
      this.queue.length > 0 &&
      this.activeProcesses.size < this.maxConcurrency
    ) {
      const task = this.queue.shift();
      if (task) {
        this.stats.queued--;
        this.stats.active++;
        this.executeSearch(task.options, task.resolve, task.reject);
      }
    }
  }

  private executeSearch(
    options: RgSearchOptions,
    resolve: (value: RgSearchResult[]) => void,
    reject: (error: Error) => void
  ): void {
    const args: string[] = [];

    // Query (literal string)
    args.push('--literal');
    args.push(options.query);

    // File type filter
    if (options.type) {
      args.push('--type', options.type);
    }

    // Exclude patterns
    if (options.exclude) {
      for (const pattern of options.exclude.split(',')) {
        args.push('--glob', `!${pattern.trim()}`);
      }
    }

    // Context lines
    if (options.includeContext) {
      const ctx = options.contextLines ?? 2;
      args.push('-C', String(ctx));
    }

    // Result limit
    if (options.limit) {
      args.push('--max-count', String(options.limit));
    }

    // JSON output
    args.push('--json');

    // Add current directory (default to cwd)
    const searchDir = options.cwd || process.cwd();
    args.push(searchDir);

    let output = '';
    let errorOutput = '';

    const proc = spawn(this.rgPath!, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 5000 // 5-second timeout
    });

    this.activeProcesses.add(proc);

    const timeoutHandle = setTimeout(() => {
      if (proc.pid) {
        proc.kill('SIGTERM');
      }
    }, 5000);

    proc.stdout.on('data', (chunk) => {
      output += chunk.toString();
    });

    proc.stderr.on('data', (chunk) => {
      errorOutput += chunk.toString();
    });

    proc.on('error', (err) => {
      clearTimeout(timeoutHandle);
      this.activeProcesses.delete(proc);
      this.stats.active--;
      this.stats.failed++;
      log.error('[rg-pool] Spawn error:', err);
      reject(new Error(`rg process failed: ${err.message}`));
      this.processQueue();
    });

    proc.on('exit', (code) => {
      clearTimeout(timeoutHandle);
      this.activeProcesses.delete(proc);
      this.stats.active--;

      if (code === 0 || code === 1) {
        // 0 = matches found, 1 = no matches found (both OK)
        try {
          const results: RgSearchResult[] = [];
          for (const line of output.split('\n')) {
            if (!line) continue;
            const json = JSON.parse(line);

            if (json.type === 'match') {
              const match = json.data;
              results.push({
                file: match.path.text,
                line: match.line_number,
                column: match.submatches?.[0]?.start,
                content: match.lines.text,
                match: match.submatches?.[0]?.match?.text || match.lines.text,
                context: options.includeContext
                  ? {
                      before: match.submatches?.[0]?.context_before ? [match.submatches[0].context_before] : [],
                      after: match.submatches?.[0]?.context_after ? [match.submatches[0].context_after] : []
                    }
                  : undefined
              });
            }
          }

          this.stats.completed++;
          resolve(results);
        } catch (err) {
          this.stats.failed++;
          reject(
            new Error(
              `Failed to parse rg output: ${err instanceof Error ? err.message : String(err)}`
            )
          );
        }
      } else {
        this.stats.failed++;
        reject(
          new Error(
            `rg exited with code ${code}: ${errorOutput || 'unknown error'}`
          )
        );
      }

      this.processQueue();
    });
  }

  getStats(): RgPoolStats {
    return { ...this.stats };
  }

  async drain(): Promise<void> {
    // Wait for all active processes to complete
    while (this.activeProcesses.size > 0 || this.queue.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  terminate(): void {
    // Kill all active processes
    for (const proc of this.activeProcesses) {
      if (proc.pid) {
        proc.kill('SIGKILL');
      }
    }
    this.activeProcesses.clear();
    this.queue = [];
  }
}

let _pool: RgPool | null = null;

export function getRgPool(): RgPool {
  if (!_pool) {
    _pool = new RgPool();
  }
  return _pool;
}

export async function searchRg(options: RgSearchOptions): Promise<RgSearchResult[]> {
  return getRgPool().search(options);
}
