import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: 'sveltekit-frontend/.env' });
dotenv.config({ path: 'sveltekit-frontend/.env.local', override: true });

const pool = new pg.Pool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 5434),
  database: 'legal_ai_db',
  user: 'legal_admin',
  password: process.env.DB_PASSWORD,
  max: 1
});

async function run() {
  const ws = 'sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc';
  const res = await pool.query(`
    SELECT count(*)::int AS count
    FROM public.atlas_workspace_source_bindings
    WHERE workspace_revision::text = $1
  `, [ws]);
  console.log('workspace bindings count:', res.rows[0]);

  const distinctSources = await pool.query(`
    SELECT DISTINCT workspace_revision, count(*)::int as cnt
    FROM public.atlas_workspace_source_bindings
    GROUP BY workspace_revision
  `);
  console.log('all workspace revisions in bindings:', distinctSources.rows);
  await pool.end();
}
run();
