/**
 * DB Schema Inspection Tools for ACE Context
 * 
 * Provides structural metadata about PostgreSQL tables for LLM reasoning.
 */

import { Pool } from 'pg';
import { ENV } from '$lib/server/env.server.js';

export interface DbSchemaContext {
  tableName: string;
  columns: Array<{ name: string; type: string; nullable: string }>;
  content: string;
}

/**
 * Fetches database schema for specific tables and formats it for ACE context.
 */
export async function fetchDbSchemaContext(tableNames: string[]): Promise<DbSchemaContext[]> {
  const pool = new Pool({ connectionString: ENV.DATABASE_URL });
  try {
    const results = await Promise.all(tableNames.map(async (t) => {
      const { rows } = await pool.query(
        `SELECT column_name, data_type, is_nullable 
         FROM information_schema.columns
         WHERE table_name = $1 AND table_schema = 'public' 
         ORDER BY ordinal_position`, [t]
      );

      const columns = rows.map(r => ({
        name: r.column_name,
        type: r.data_type,
        nullable: r.is_nullable
      }));

      const content = `Table: ${t}\n${columns.map(c => `  ${c.name} ${c.type}`).join('\n')}`;

      return {
        tableName: t,
        columns,
        content
      };
    }));
    return results;
  } finally {
    await pool.end();
  }
}
