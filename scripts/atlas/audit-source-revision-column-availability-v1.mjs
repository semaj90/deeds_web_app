#!/usr/bin/env node
/** Read-only: do any upstream tables already carry source_revision/workspace_revision
 * data that the 6 legacy Qdrant writers could select from, if rewritten? No writes. */
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
const env = loadRepoEnv(process.env);
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env), statement_timeout: 15000 });
const cols = await pool.query(`
  SELECT table_name, column_name FROM information_schema.columns
  WHERE table_schema='public' AND column_name IN ('workspace_revision','source_revision','representation_revision')
  ORDER BY table_name, column_name
`);
console.log(JSON.stringify(cols.rows, null, 2));
await pool.end();
