#!/usr/bin/env node
/** Read-only exact-cohort reevaluation for the applied PKT-LINEAGE-REFRESH-01 tag. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const PRODUCER = 'PKT-LINEAGE-REFRESH-01:v1';
const ADMITTED_WORKSPACE_REVISION = 'sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc';
const ADMITTED_EXECUTION_ID = '74d50c86-8194-45ea-8c3d-61aab737ef83';
const SOURCE_INVENTORY_SNAPSHOT_ID = 'sha256:6288726b73626ae58905b5ebdea42e709cb1af67b3e16186bcd8b2b88a89d98b';
const EXPECTED_PACKETS = 196;
const EXPECTED_LINEAGE_ROWS = 3502;
const reportPath = path.join(REPO_ROOT, 'docs/reports/graphify-file-rev-reeval-01.json');
const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
const safeSourcePath = (sourceRef) => {
  const resolved = path.resolve(REPO_ROOT, String(sourceRef).replaceAll('\\', '/'));
  return resolved.startsWith(`${REPO_ROOT}${path.sep}`) ? resolved : null;
};

const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)),
  max: 1,
  statement_timeout: 20_000,
  application_name: 'graphify-file-rev-reeval-01-read-only',
});

let client;
try {
  client = await pool.connect();
  await client.query('BEGIN READ ONLY');
  await client.query("SET LOCAL statement_timeout = '20s'");
  const { rows } = await client.query(`
    WITH targets AS (
      SELECT DISTINCT p.packet_key, p.source_ref, p.source_revision,
             p.workspace_revision_key::text AS packet_workspace_revision
        FROM public.atlas_packets p
        JOIN public.atlas_packet_chunk_lineage l ON l.packet_key = p.packet_key
       WHERE l.lineage_producer_revision = $1
    )
    SELECT t.packet_key, t.source_ref, t.source_revision,
           t.packet_workspace_revision,
           lineage.lineage_rows, lineage.proven_rows,
           lineage.lineage_revision_matches,
           lineage.chunk_source_refs,
           lineage.chunk_rows_present,
           lineage.chunk_source_ref_null_rows,
           lineage.chunk_source_ref_conflict_rows,
           lineage.chunk_source_ref_matches,
           lineage.chunk_source_revision_matches,
           lineage.chunk_file_hash_matches_packet,
           lineage.chunk_file_hash_matches_lineage,
           lineage.chunk_examples,
           graphify.admitted_rows, graphify.historical_digest_matches,
           graphify.graphify_revisions, graphify.graphify_workspaces,
           graphify.graphify_run_ids, graphify.graphify_evidence,
           membership.membership_rows, membership.exact_revision_rows,
           membership.exact_content_hash_rows, membership.membership_evidence
      FROM targets t
      CROSS JOIN LATERAL (
        SELECT count(*)::int AS lineage_rows,
               count(*) FILTER (WHERE l.revision_status = 'PROVEN')::int AS proven_rows,
               count(*) FILTER (
                 WHERE l.source_revision = t.source_revision
               )::int AS lineage_revision_matches,
               coalesce(array_agg(DISTINCT c.source_ref)
                 FILTER (WHERE c.source_ref IS NOT NULL), ARRAY[]::text[]) AS chunk_source_refs,
               count(*) FILTER (WHERE c.id IS NOT NULL)::int AS chunk_rows_present,
               count(*) FILTER (WHERE c.id IS NOT NULL AND c.source_ref IS NULL)::int AS chunk_source_ref_null_rows,
               count(*) FILTER (WHERE c.id IS NOT NULL AND c.source_ref IS NOT NULL AND c.source_ref <> t.source_ref)::int AS chunk_source_ref_conflict_rows,
               count(*) FILTER (WHERE c.source_ref = t.source_ref)::int AS chunk_source_ref_matches,
               count(*) FILTER (WHERE c.source_revision = t.source_revision)::int AS chunk_source_revision_matches,
               count(*) FILTER (
                 WHERE lower(regexp_replace(c.file_content_hash::text, '^sha256:', ''))
                     = lower(regexp_replace(t.source_revision::text, '^sha256:', ''))
               )::int AS chunk_file_hash_matches_packet,
               count(*) FILTER (
                 WHERE lower(regexp_replace(c.file_content_hash::text, '^sha256:', ''))
                     = lower(regexp_replace(l.source_revision::text, '^sha256:', ''))
               )::int AS chunk_file_hash_matches_lineage,
               (SELECT coalesce(json_agg(example), '[]'::json)
                  FROM (
                    SELECT json_build_object(
                      'canonicalChunkId', l2.canonical_chunk_id,
                      'chunkRowId', l2.chunk_row_id,
                      'lineageSourceRevision', l2.source_revision,
                      'chunkSourceRevision', c2.source_revision,
                      'chunkFileContentHash', c2.file_content_hash,
                      'chunkWorkspaceRevision', c2.workspace_revision
                    ) AS example
                      FROM public.atlas_packet_chunk_lineage l2
                      LEFT JOIN public.codebase_chunk_index c2 ON c2.id = l2.chunk_row_id
                     WHERE l2.packet_key = t.packet_key
                       AND l2.lineage_producer_revision = $1
                     ORDER BY l2.canonical_chunk_id
                     LIMIT 2
                  ) samples
               ) AS chunk_examples
          FROM public.atlas_packet_chunk_lineage l
          LEFT JOIN public.codebase_chunk_index c ON c.id = l.chunk_row_id
         WHERE l.packet_key = t.packet_key
           AND l.lineage_producer_revision = $1
      ) lineage
      CROSS JOIN LATERAL (
        SELECT count(*) FILTER (
                 WHERE g.workspace_revision = $2
               )::int AS admitted_rows,
               count(*) FILTER (
                 WHERE g.code_source_revision = t.source_revision
               )::int AS historical_digest_matches,
               coalesce(array_agg(DISTINCT g.code_source_revision)
                 FILTER (WHERE g.code_source_revision IS NOT NULL), ARRAY[]::text[]) AS graphify_revisions,
               coalesce(array_agg(DISTINCT g.workspace_revision)
                 FILTER (WHERE g.workspace_revision IS NOT NULL), ARRAY[]::text[]) AS graphify_workspaces,
               coalesce(array_agg(DISTINCT g.last_seen_run_id::text)
                 FILTER (WHERE g.last_seen_run_id IS NOT NULL), ARRAY[]::text[]) AS graphify_run_ids,
               coalesce(json_agg(json_build_object(
                 'workspaceRevision', g.workspace_revision,
                 'sourceRevision', g.source_revision,
                 'codeSourceRevision', g.code_source_revision,
                 'contentHash', g.content_hash,
                 'byteLength', g.byte_length,
                 'lastSeenRunId', g.last_seen_run_id::text
               ) ORDER BY g.workspace_revision, g.last_seen_run_id)
                 FILTER (WHERE g.source_ref IS NOT NULL), '[]'::json) AS graphify_evidence
          FROM public.graphify_files g
         WHERE g.source_ref = t.source_ref
      ) graphify
      CROSS JOIN LATERAL (
        SELECT count(*)::int AS membership_rows,
               count(*) FILTER (WHERE m.code_source_revision = t.source_revision)::int AS exact_revision_rows,
               count(*) FILTER (
                 WHERE lower(regexp_replace(m.content_hash::text, '^sha256:', ''))
                     = lower(regexp_replace(t.source_revision::text, '^sha256:', ''))
               )::int AS exact_content_hash_rows,
               coalesce(json_agg(json_build_object(
                 'repositoryId', m.repository_id,
                 'workspaceRevision', m.workspace_revision,
                 'sourceRef', m.source_ref,
                 'codeSourceRevision', m.code_source_revision,
                 'contentHash', m.content_hash,
                 'byteLength', m.byte_length
               ) ORDER BY m.repository_relative_path)
                 FILTER (WHERE m.source_ref IS NOT NULL), '[]'::json) AS membership_evidence
          FROM public.graphify_execution_file_membership_v2 m
         WHERE m.execution_id = $3::uuid
           AND m.repository_id = 'repo:root'
           AND m.workspace_revision = $2
           AND m.source_ref = t.source_ref
      ) membership
     ORDER BY t.source_ref, t.packet_key
  `, [PRODUCER, ADMITTED_WORKSPACE_REVISION, ADMITTED_EXECUTION_ID]);

  const exactRows = rows.map((row) => {
    const absolutePath = safeSourcePath(row.source_ref);
    let recomputedSourceRevision = null;
    let sourceStatus = 'SOURCE_UNAVAILABLE';
    if (absolutePath && fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile()) {
      recomputedSourceRevision = sha256(fs.readFileSync(absolutePath));
      sourceStatus = recomputedSourceRevision === row.source_revision ? 'CURRENT_BYTES_MATCH_PACKET' : 'CURRENT_BYTES_MISMATCH_PACKET';
    } else if (!absolutePath) {
      sourceStatus = 'SOURCE_REF_OUTSIDE_REPOSITORY';
    }
    return {
      packetKey: row.packet_key,
      sourceRef: row.source_ref,
      sourceRevision: row.source_revision,
      packetWorkspaceRevision: row.packet_workspace_revision,
      lineageRows: row.lineage_rows,
      provenRows: row.proven_rows,
      lineageRevisionMatches: row.lineage_revision_matches,
      chunkSourceRefs: row.chunk_source_refs,
      chunkRowsPresent: row.chunk_rows_present,
      chunkSourceRefNullRows: row.chunk_source_ref_null_rows,
      chunkSourceRefConflictRows: row.chunk_source_ref_conflict_rows,
      chunkSourceRefMatches: row.chunk_source_ref_matches,
      chunkSourceRevisionMatches: row.chunk_source_revision_matches,
      chunkFileHashMatchesPacket: row.chunk_file_hash_matches_packet,
      chunkFileHashMatchesLineage: row.chunk_file_hash_matches_lineage,
      chunkExamples: row.chunk_examples,
      admittedGraphifyRows: row.admitted_rows,
      historicalDigestMatches: row.historical_digest_matches,
      graphifyRevisions: row.graphify_revisions,
      graphifyWorkspaces: row.graphify_workspaces,
      graphifyRunIds: row.graphify_run_ids,
      graphifyEvidence: row.graphify_evidence,
      admittedMembershipRows: row.membership_rows,
      admittedMembershipExactRevisionRows: row.exact_revision_rows,
      admittedMembershipExactContentHashRows: row.exact_content_hash_rows,
      admittedMembershipEvidence: row.membership_evidence,
      recomputedSourceRevision,
      sourceStatus,
      classification: row.packet_workspace_revision === ADMITTED_WORKSPACE_REVISION
        && row.membership_rows === 1
        && row.exact_revision_rows === 1
        && row.exact_content_hash_rows === 1
        && row.source_revision === recomputedSourceRevision
        && row.admitted_rows === 0
          ? 'ADMITTED_BINDING_AND_CURRENT_BYTES_MATCH_PACKET_GRAPHIFY_ROW_MISSING'
          : row.packet_workspace_revision === ADMITTED_WORKSPACE_REVISION
            && row.membership_rows === 1
            && row.exact_revision_rows === 1
            && row.exact_content_hash_rows === 1
            && row.source_revision !== recomputedSourceRevision
              ? 'ADMITTED_BINDING_MATCHES_PACKET_BUT_WORKTREE_BYTES_DRIFTED'
              : 'SOURCE_OR_ADMITTED_BINDING_REQUIRES_REVIEW',
    };
  });

  const canonicalManifest = exactRows.map(({ packetKey, sourceRef, sourceRevision, packetWorkspaceRevision }) =>
    [packetKey, sourceRef, sourceRevision, packetWorkspaceRevision].join('\t')).join('\n');
  const report = {
    schema: 'atlas.graphify-file-rev-reeval.v1',
    status: exactRows.length === EXPECTED_PACKETS ? 'TARGET_SET_RECOVERED_READ_ONLY' : 'TARGET_SET_COUNT_MISMATCH',
    generatedAt: new Date().toISOString(),
    writesPerformed: false,
    producerRevision: PRODUCER,
    admittedWorkspaceRevision: ADMITTED_WORKSPACE_REVISION,
    expected: { packetKeys: EXPECTED_PACKETS, lineageRows: EXPECTED_LINEAGE_ROWS },
    admittedExecutionId: ADMITTED_EXECUTION_ID,
    sourceInventorySnapshotId: SOURCE_INVENTORY_SNAPSHOT_ID,
    observed: {
      packetKeys: exactRows.length,
      distinctSourceRefs: new Set(exactRows.map((row) => row.sourceRef)).size,
      lineageRows: exactRows.reduce((sum, row) => sum + row.lineageRows, 0),
      packetWorkspaceRevisionMatches: exactRows.filter((row) => row.packetWorkspaceRevision === ADMITTED_WORKSPACE_REVISION).length,
      fullyProvenLineageGroups: exactRows.filter((row) => row.provenRows === row.lineageRows && row.lineageRows > 0).length,
      lineageRevisionParityGroups: exactRows.filter((row) => row.lineageRevisionMatches === row.lineageRows && row.lineageRows > 0).length,
      chunkSourceRefParityGroups: exactRows.filter((row) => row.chunkSourceRefMatches === row.lineageRows && row.lineageRows > 0).length,
      chunkSourceRevisionParityGroups: exactRows.filter((row) => row.chunkSourceRevisionMatches === row.lineageRows && row.lineageRows > 0).length,
      chunkFileHashPacketParityGroups: exactRows.filter((row) => row.chunkFileHashMatchesPacket === row.lineageRows && row.lineageRows > 0).length,
      chunkFileHashLineageParityGroups: exactRows.filter((row) => row.chunkFileHashMatchesLineage === row.lineageRows && row.lineageRows > 0).length,
      sourcesWithAdmittedGraphifyRows: exactRows.filter((row) => row.admittedGraphifyRows > 0).length,
      sourcesWithAdmittedMembershipRows: exactRows.filter((row) => row.admittedMembershipRows > 0).length,
      sourcesWithExactAdmittedMembershipRevision: exactRows.filter((row) => row.admittedMembershipExactRevisionRows > 0).length,
      sourcesWithExactAdmittedMembershipContentHash: exactRows.filter((row) => row.admittedMembershipExactContentHashRows > 0).length,
      sourcesWithHistoricalDigestMatches: exactRows.filter((row) => row.historicalDigestMatches > 0).length,
      sourcesWithoutHistoricalDigestMatch: exactRows.filter((row) => row.historicalDigestMatches === 0).length,
      currentSourceBytesMatchPacket: exactRows.filter((row) => row.sourceStatus === 'CURRENT_BYTES_MATCH_PACKET').length,
      currentSourceBytesMismatchPacket: exactRows.filter((row) => row.sourceStatus === 'CURRENT_BYTES_MISMATCH_PACKET').length,
      currentSourceUnavailable: exactRows.filter((row) => row.sourceStatus === 'SOURCE_UNAVAILABLE').length,
      outsideRepositoryRefs: exactRows.filter((row) => row.sourceStatus === 'SOURCE_REF_OUTSIDE_REPOSITORY').length,
    },
    targetManifestChecksum: sha256(canonicalManifest),
    rows: exactRows,
    limitations: [
      'This receipt proves the producer-tagged target set and read-only comparisons only.',
      'The admitted execution membership binds source revision, content hash, and byte length; current filesystem bytes match that binding for only 192 of 196 targets, so the other four historical byte payloads need exact-snapshot retrieval for byte-level revalidation.',
      'A missing admitted-workspace graphify_files row is not permission to synthesize or refresh one.',
      'No Graphify writer, lineage writer, ordinal materializer, or projection/cache writer was invoked.',
    ],
  };

  await client.query('ROLLBACK');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ schema: report.schema, status: report.status, reportPath, observed: report.observed, targetManifestChecksum: report.targetManifestChecksum }, null, 2));
} catch (error) {
  if (client) {
    try { await client.query('ROLLBACK'); } catch { /* preserve original diagnostic */ }
  }
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
} finally {
  client?.release();
  await pool.end();
}
