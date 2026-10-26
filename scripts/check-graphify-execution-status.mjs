import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './atlas/connection-config.mjs';

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1 });

try {
  const res = await pool.query("SELECT execution_id, status, error_details, completed_at FROM graphify_executions WHERE execution_id = '0dba1c0d-2cf7-4f35-a61b-c77956f60d3d'");
  console.log('Target row:', res.rows[0]);
  const recent = await pool.query("SELECT execution_id, status, created_at, completed_at FROM graphify_executions ORDER BY created_at DESC LIMIT 3");
  console.log('Recent executions:', recent.rows);
} catch (error) {
  console.error('Check failed:', error.message);
} finally {
  await pool.end();
}
