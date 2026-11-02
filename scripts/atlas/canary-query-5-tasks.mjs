import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  const res = await pool.query(`
    SELECT task_id, feature_id, feature_label, lane, status 
    FROM kanban_tasks 
    WHERE feature_id LIKE 'openspec:parent-atlas-agentic-file-compiler%' 
    ORDER BY task_id 
    LIMIT 5
  `);
  console.log(JSON.stringify(res.rows, null, 2));
} finally {
  await pool.end();
}
