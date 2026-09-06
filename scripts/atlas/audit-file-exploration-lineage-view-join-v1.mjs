import pg from 'pg';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const reportPath = path.resolve(root, 'docs/reports/file-exploration-lineage-view-join-v1.json');
const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const pool = new pg.Pool({ connectionString: databaseUrl, max: 1, statement_timeout: 20_000 });

try {
  const relationResult = await pool.query(
    `SELECT to_regclass('public.codebase_chunk_index') IS NOT NULL AS chunks_present,
            to_regclass('public.atlas_workspace_source_bindings') IS NOT NULL AS bindings_present`,
  );
  const relations = relationResult.rows[0];
  let counts = null;
  let sample = [];
  if (relations.chunks_present && relations.bindings_present) {
    counts = (await pool.query(
      `SELECT COUNT(*)::int AS chunk_rows,
              COUNT(*) FILTER (WHERE c.source_ref IS NOT NULL)::int AS chunk_source_rows,
              COUNT(*) FILTER (WHERE b.canonical_source_ref IS NOT NULL)::int AS source_ref_join_rows,
              COUNT(*) FILTER (WHERE b.canonical_source_ref IS NOT NULL AND lower(c.content_hash) = lower(b.content_digest))::int AS exact_content_join_rows,
              COUNT(*) FILTER (WHERE b.workspace_revision IS NOT NULL)::int AS workspace_revision_join_rows,
              COUNT(*) FILTER (WHERE b.source_revision IS NOT NULL)::int AS source_revision_join_rows
         FROM public.codebase_chunk_index c
         LEFT JOIN public.atlas_workspace_source_bindings b
           ON b.canonical_source_ref = c.source_ref`,
    )).rows[0];
    sample = (await pool.query(
      `SELECT c.source_ref, c.content_hash, b.workspace_revision, b.source_revision,
              b.content_digest, b.binding_checksum
         FROM public.codebase_chunk_index c
         LEFT JOIN public.atlas_workspace_source_bindings b
           ON b.canonical_source_ref = c.source_ref
        WHERE c.source_ref IS NOT NULL
        ORDER BY c.id
        LIMIT 5`,
    )).rows;
  }
  const exactJoinRows = Number(counts?.exact_content_join_rows ?? 0);
  const sourceRows = Number(counts?.chunk_source_rows ?? 0);
  const report = {
    schema: 'atlas.file-exploration-lineage-view-join.v1',
    gate: 'ATLAS-FILE-EXPLORATION-INDEX-07',
    status: !relations.chunks_present || !relations.bindings_present
      ? 'LINEAGE_VIEW_OWNER_MISSING'
      : exactJoinRows > 0
        ? 'EXACT_CONTENT_JOIN_CANDIDATES_FOUND_BOUNDED_PROOF_REQUIRED'
        : 'SOURCE_REF_ONLY_JOIN_INSUFFICIENT_FOR_LINEAGE',
    relations,
    counts,
    exactJoinCoverage: sourceRows === 0 ? 0 : exactJoinRows / sourceRows,
    sample,
    rule: 'source_ref-only joins cannot supply sourceRevision; exact content identity is required',
    canonicalAuthority: false,
    readOnly: true,
    writesPerformed: false,
  };
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: report.status, counts, report: reportPath }, null, 2));
} finally {
  await pool.end();
}
