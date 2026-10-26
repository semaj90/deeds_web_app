import pg from 'pg';

const DATABASE_URL = 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const { rows } = await pool.query(`
    SELECT
      count(*) as total,
      count(content_hash) as count_content_hash,
      count(sha256) as count_sha256,
      count(source_revision) as count_source_revision,
      count(workspace_revision_key) as count_workspace_revision_key
    FROM atlas_packets;
  `);
  console.log("Counts:", rows[0]);

  const execId = '74d50c86-8194-45ea-8c3d-61aab737ef83';
  const wsRev = 'sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc';

  const matches = await pool.query(`
    SELECT
      m.source_ref,
      m.content_hash AS member_hash,
      m.code_source_revision,
      p.packet_key,
      p.content_hash AS packet_hash,
      p.sha256 AS packet_sha256,
      p.source_revision AS packet_source_rev,
      p.workspace_revision_key,
      (SELECT count(*) FROM codebase_chunk_index c WHERE c.source_ref = m.source_ref) AS chunk_count
    FROM graphify_execution_file_membership_v2 m
    LEFT JOIN atlas_packets p ON lower(regexp_replace(regexp_replace(btrim(p.source_ref), '\\\\', '/', 'g'), '^\\./', ''))
                               = lower(regexp_replace(regexp_replace(btrim(m.source_ref), '\\\\', '/', 'g'), '^\\./', ''))
    WHERE m.execution_id = $1
      AND m.workspace_revision = $2
      AND (p.content_hash IS NOT NULL OR p.sha256 IS NOT NULL)
    LIMIT 10;
  `, [execId, wsRev]);
  console.log("Matched rows with non-null packet hashes:");
  console.log(matches.rows);
  await pool.end();
}

main().catch(console.error);
