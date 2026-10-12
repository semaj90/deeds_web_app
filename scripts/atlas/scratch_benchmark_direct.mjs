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
  const start = Date.now();
  // Fast query testing:
  const q = `
    WITH bound AS (
      SELECT
        canonical_source_ref::text AS source_ref,
        source_revision::text AS source_revision,
        workspace_revision::text AS workspace_revision
      FROM public.atlas_workspace_source_bindings
      WHERE workspace_revision::text = $1
    ),
    lineage_bound AS (
      SELECT
        l.chunk_row_id::text AS chunk_row_id,
        min(l.canonical_chunk_id::text) AS canonical_chunk_id,
        min(l.packet_key::text) AS packet_key,
        l.source_ref::text AS source_ref,
        l.source_revision::text AS source_revision,
        b.workspace_revision
      FROM bound b
      JOIN public.atlas_packet_chunk_lineage l
        ON l.source_ref = b.source_ref
       AND l.source_revision = b.source_revision
      WHERE l.revision_status = 'PROVEN'
        AND l.canonical_chunk_id IS NOT NULL
        AND l.packet_key IS NOT NULL
      GROUP BY l.chunk_row_id, l.source_ref, l.source_revision, b.workspace_revision
      HAVING count(*) = 1
    )
    SELECT
      lb.chunk_row_id,
      lb.canonical_chunk_id,
      lb.packet_key,
      lb.source_ref,
      lb.source_revision,
      lb.workspace_revision
    FROM lineage_bound lb
    ORDER BY lb.source_ref, lb.canonical_chunk_id, lb.chunk_row_id
    LIMIT 100
  `;
  const res = await pool.query(q, [ws]);
  console.log(`Direct lineage query took ${Date.now() - start}ms, returned ${res.rows.length} rows.`);
  if (res.rows.length > 0) {
    console.log('Sample row:', res.rows[0]);
  }
  await pool.end();
}
run();
