import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { loadRepoEnv } from '../env.js';

export interface DuckDbAdapter {
  /**
   * Run a DuckDB SQL query via CLI subprocess.
   * Returns rows as parsed JSON.
   */
  query: (sql: string) => DuckDbRow[];
  /**
   * Run multiple SQL statements (semicolon-separated) and return final resultset.
   */
  exec: (sql: string) => DuckDbRow[];
}

export type DuckDbRow = Record<string, string | number | boolean | null>;

export function createDuckDbAdapter(dbPath?: string): DuckDbAdapter {
  const env = loadRepoEnv();
  const db = dbPath ?? env.DUCKDB_PATH ?? ':memory:';
  const cli = env.DUCKDB_CLI ?? 'duckdb';

  function runSql(sql: string): DuckDbRow[] {
    const tmp = resolve(tmpdir(), `atlas-duckdb-${Date.now()}-${Math.random().toString(36).slice(2)}.sql`);
    writeFileSync(tmp, sql, 'utf8');
    try {
      const result = spawnSync(cli, [db, '-json', '-c', sql], {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        timeout: 60_000,
      });

      if (result.status !== 0) {
        throw new Error(`DuckDB error: ${result.stderr || result.error?.message || 'non-zero exit'}`);
      }

      const out = result.stdout.trim();
      if (!out || out === '[]') return [];
      return JSON.parse(out) as DuckDbRow[];
    } finally {
      try { unlinkSync(tmp); } catch {}
    }
  }

  function query(sql: string): DuckDbRow[] {
    return runSql(sql);
  }

  function exec(sql: string): DuckDbRow[] {
    return runSql(sql);
  }

  return { query, exec };
}

/** Check if duckdb CLI is available */
export function isDuckDbAvailable(cliPath = 'duckdb'): boolean {
  const result = spawnSync(cliPath, ['--version'], { encoding: 'utf8', timeout: 5_000 });
  return result.status === 0;
}
