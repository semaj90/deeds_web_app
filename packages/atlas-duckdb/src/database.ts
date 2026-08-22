import fs from 'node:fs/promises';
import path from 'node:path';

import {
  resolveDuckDBConfig,
  type AtlasDuckDBConfig
} from './config.js';

export interface AtlasDuckDB {
  db: any;
  connection: {
    run(sql: string): Promise<void>;
    query(sql: string): Promise<Array<Record<string, unknown>>>;
    close(): Promise<void>;
  };
  config: AtlasDuckDBConfig;
  close(): Promise<void>;
}

export async function createAtlasDuckDB(
  overrides: Partial<AtlasDuckDBConfig> = {}
): Promise<AtlasDuckDB> {
  const config = resolveDuckDBConfig(overrides);
  if (config.databasePath !== ':memory:') {
    await fs.mkdir(path.dirname(config.databasePath), { recursive: true });
  }

  // Dynamically import duckdb to avoid startup dependency
  const duckdbModule = await import('duckdb');
  const Database = (duckdbModule.default as any)?.Database || (duckdbModule as any).Database;

  if (!Database) {
    throw new Error('Database class unavailable from duckdb');
  }

  const db = new Database(config.databasePath === ':memory:' ? ':memory:' : config.databasePath);
  const rawConnection = db.connect();

  const connection = {
    run(sql: string): Promise<void> {
      return new Promise((resolve, reject) => {
        rawConnection.run(sql, (err: any) => {
          if (err) reject(err);
          else resolve();
        });
      });
    },
    query(sql: string): Promise<Array<Record<string, unknown>>> {
      return new Promise((resolve, reject) => {
        rawConnection.all(sql, (err: any, rows: any) => {
          if (err) reject(err);
          else resolve(rows ?? []);
        });
      });
    },
    close(): Promise<void> {
      return new Promise((resolve) => {
        try {
          rawConnection.close();
          resolve();
        } catch {
          resolve();
        }
      });
    },
  };

  await connection.run(`
    SET threads = ${config.threads};
    SET memory_limit = '${escapeSqlLiteral(
      config.memoryLimit
    )}';
    SET temp_directory = '${escapeSqlLiteral(
      config.tempDirectory
    )}';
  `);

  return {
    db,
    connection,
    config,

    async close() {
      try {
        await connection.close();
      } catch {
        // Ignore close errors during teardown.
      }

      try {
        if ('close' in db && typeof db.close === 'function') {
          await db.close();
        } else if ('finalize' in db && typeof db.finalize === 'function') {
          await db.finalize();
        }
      } catch {
        // Ignore close errors during teardown.
      }
    }
  };
}

function escapeSqlLiteral(value: string): string {
  return value.replaceAll("'", "''");
}
