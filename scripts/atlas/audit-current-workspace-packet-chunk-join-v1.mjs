#!/usr/bin/env node

/** Read-only census of current workspace bindings through Graphify, packets, and chunks. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';
import { classifyPacketChunkIdentityV1, summarizePacketChunkIdentityClassificationsV1 } from './lib/packet-chunk-identity-classification-v1.mjs';

const root = REPO_ROOT;
const defaultReportPath = path.join(root, 'docs/reports/current-workspace-packet-chunk-join-v1.json');
const outputArg = process.argv.slice(2).find((value) => value.startsWith('--output='));
const reportPath = outputArg ? path.resolve(root, outputArg.slice('--output='.length)) : defaultReportPath;
if (outputArg) {
  const relativeOutputPath = path.relative(root, reportPath);
  if (!relativeOutputPath.startsWith(`.tmp${path.sep}`)) {
    throw new Error('CUSTOM_AUDIT_OUTPUT_MUST_BE_UNDER_TMP');
  }
}
const env = loadRepoEnv(process.env);
const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(env),
  max: 1,
  connectionTimeoutMillis: 5000,
  query_timeout: 135000, // must exceed statement_timeout so the handled server-side 57014 fires first
  lock_timeout: 5000,
  statement_timeout: 120000,
});
const revisionArgIndex = process.argv.indexOf('--workspace-revision');
const explicitWorkspaceRevision = revisionArgIndex >= 0 ? process.argv[revisionArgIndex + 1] : null;
const executionArgIndex = process.argv.indexOf('--execution-id');
const explicitExecutionId = executionArgIndex >= 0 ? process.argv[executionArgIndex + 1] : null;
const limitArgIndex = process.argv.indexOf('--limit');
const requestedLimit = limitArgIndex >= 0 ? Number(process.argv[limitArgIndex + 1]) : null;
if (requestedLimit != null && (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 5000)) {
  throw new Error('INVALID_PACKET_CHUNK_AUDIT_LIMIT');
}
const auditLimit = requestedLimit ?? null;
if (!explicitWorkspaceRevision) {
  throw new Error('ADMITTED_WORKSPACE_REVISION_REQUIRED');
}
if (!/^sha256:[0-9a-f]{64}$/i.test(explicitWorkspaceRevision)) {
  throw new Error('INVALID_EXPLICIT_WORKSPACE_REVISION');
}
if (!explicitExecutionId) throw new Error('CURRENT_GRAPHIFY_EXECUTION_ID_REQUIRED');

const client = await pool.connect();
try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const result = await client.query(`
    WITH bindings AS (
      SELECT lower(regexp_replace(regexp_replace(btrim(canonical_source_ref), '\\\\', '/', 'g'), '^\\./', '')) AS source_ref,
             workspace_revision::text AS workspace_revision,
             lower(source_revision::text) AS source_revision,
             lower(content_digest::text) AS content_digest
      FROM public.atlas_workspace_source_bindings
      WHERE repo_id = 'deeds-web-app'
        AND workspace_revision::text = lower($1::text)
        AND workspace_revision::text = $1
      ORDER BY lower(regexp_replace(regexp_replace(btrim(canonical_source_ref), '\\\\', '/', 'g'), '^\\./', '')),
               lower(source_revision::text), lower(content_digest::text)
      ${auditLimit == null ? '' : 'LIMIT $3'}
    ), current_members AS (
      SELECT lower(regexp_replace(regexp_replace(btrim(source_ref), '\\\\', '/', 'g'), '^\\./', '')) AS source_ref,
             workspace_revision::text AS workspace_revision,
             lower(code_source_revision::text) AS source_revision,
             lower(content_hash::text) AS content_digest
      FROM public.graphify_execution_file_membership_v2
      WHERE execution_id = $2::uuid
        AND repository_id = 'repo:root'
        AND workspace_revision::text = lower($1::text)
        ${auditLimit == null ? '' : "AND lower(regexp_replace(regexp_replace(btrim(source_ref), '\\\\', '/', 'g'), '^\\./', '')) IN (SELECT source_ref FROM bindings)"}
    ), graphify_exact AS (
      SELECT b.source_ref, b.workspace_revision, b.source_revision, b.content_digest
      FROM bindings b
      JOIN current_members g
        ON g.source_ref = b.source_ref
       AND g.workspace_revision = b.workspace_revision
       AND g.source_revision = b.source_revision
       AND g.content_digest = b.content_digest
      GROUP BY b.source_ref, b.workspace_revision, b.source_revision, b.content_digest
      HAVING count(*) = 1
    ), packet_candidates AS (
      SELECT DISTINCT g.source_ref, g.source_revision, g.workspace_revision,
             g.content_digest, p.packet_key, p.source_revision AS packet_source_revision,
             p.content_hash AS packet_content_hash,
             p.lineage_binding_checksum AS packet_lineage_binding_checksum,
             p.lineage_producer_revision AS packet_lineage_producer_revision
      FROM graphify_exact g
      LEFT JOIN public.atlas_packets p
        ON lower(regexp_replace(regexp_replace(btrim(p.source_ref), '\\\\', '/', 'g'), '^\\./', '')) = g.source_ref
    ), source_revision_lineage AS (
      SELECT DISTINCT g.source_ref, g.content_digest, l.packet_key, l.chunk_row_id,
             g.source_revision, c.file_content_hash
      FROM graphify_exact g
      JOIN public.atlas_packet_chunk_lineage l
        ON lower(regexp_replace(regexp_replace(btrim(l.source_ref), '\\\\', '/', 'g'), '^\\./', '')) = g.source_ref
       AND lower(btrim(l.source_revision::text)) = g.source_revision
       AND l.revision_status = 'PROVEN'
      JOIN public.codebase_chunk_index c ON c.id = l.chunk_row_id
    ), packet_key_counts AS (
      SELECT source_ref, count(DISTINCT packet_key::text)::integer AS packet_key_count
      FROM packet_candidates
      WHERE packet_key IS NOT NULL
      GROUP BY source_ref
    ), qualified_packet_bindings AS (
      SELECT pc.source_ref, pc.source_revision, min(pc.packet_key::text) AS packet_key
      FROM packet_candidates pc
      JOIN packet_key_counts pk USING (source_ref)
      WHERE pk.packet_key_count = 1 AND pc.packet_key IS NOT NULL
      GROUP BY pc.source_ref, pc.source_revision
      HAVING bool_or(
        lower(pc.packet_source_revision) = pc.source_revision
        AND pc.packet_lineage_binding_checksum IS NOT NULL
        AND pc.packet_lineage_producer_revision IS NOT NULL
      )
    ), proven_lineage AS (
      SELECT DISTINCT sl.source_ref, sl.content_digest, sl.packet_key,
             sl.chunk_row_id, sl.file_content_hash
      FROM source_revision_lineage sl
      JOIN qualified_packet_bindings qp
        ON qp.source_ref = sl.source_ref
       AND qp.source_revision = sl.source_revision
       AND qp.packet_key = sl.packet_key::text
    )
    SELECT
      (SELECT count(*) FROM bindings)::integer AS binding_rows,
      (SELECT count(DISTINCT source_ref) FROM bindings)::integer AS binding_sources,
      (SELECT count(*) FROM graphify_exact)::integer AS graphify_exact_sources,
      (SELECT count(DISTINCT source_ref) FROM source_revision_lineage)::integer AS binding_proven_lineage_sources,
      (SELECT count(DISTINCT source_ref) FROM proven_lineage)::integer AS packet_chunk_exact_sources,
      (SELECT count(DISTINCT source_ref) FROM packet_candidates WHERE packet_key IS NOT NULL)::integer AS packet_source_rows,
      (SELECT count(DISTINCT source_ref) FROM packet_candidates WHERE packet_key IS NOT NULL AND lower(packet_source_revision) = source_revision)::integer AS packet_revision_matches,
      (SELECT count(*) FROM (
        SELECT source_ref
        FROM packet_candidates
        WHERE packet_key IS NOT NULL
        GROUP BY source_ref
        HAVING count(DISTINCT packet_key) = 1
          AND count(DISTINCT source_revision) = 1
          AND bool_or(
            lower(packet_source_revision) = source_revision
            AND packet_lineage_binding_checksum IS NOT NULL
            AND packet_lineage_producer_revision IS NOT NULL
          )
      ) exact_revision_qualified)::integer AS packet_revision_workspace_binding_matches,
      (SELECT count(*) FROM (
        SELECT source_ref
        FROM packet_candidates
        WHERE packet_key IS NOT NULL
        GROUP BY source_ref
        HAVING count(DISTINCT packet_key) = 1
          AND count(DISTINCT source_revision) = 1
          AND bool_or(
            lower(packet_source_revision) = source_revision
            AND packet_lineage_binding_checksum IS NOT NULL
            AND packet_lineage_producer_revision IS NOT NULL
          )
      ) exact_full_canonical)::integer AS packet_full_canonical_identity_matches,
      (SELECT count(DISTINCT source_ref) FROM packet_candidates WHERE packet_key IS NOT NULL AND lower(packet_source_revision) = source_revision AND lower(packet_content_hash) = content_digest)::integer AS packet_full_identity_matches,
      -- PACKET_AUDIT_SEMANTICS: canonical identity is source_revision; content_hash is legacy diagnostic evidence only.
      -- Named metrics (packet_revision_matches and packet_revision_workspace_binding_matches above keep their legacy keys).
      (SELECT count(DISTINCT source_ref) FROM packet_candidates WHERE packet_key IS NOT NULL AND lower(packet_source_revision) = source_revision)::integer AS packet_revision_identity_matches,
      (SELECT count(DISTINCT source_ref) FROM packet_candidates WHERE packet_key IS NOT NULL AND packet_lineage_binding_checksum IS NOT NULL AND packet_lineage_producer_revision IS NOT NULL)::integer AS packet_workspace_binding_matches,
      (SELECT count(DISTINCT source_ref) FROM packet_candidates WHERE packet_key IS NOT NULL AND lower(btrim(packet_content_hash)) = content_digest)::integer AS packet_legacy_content_hash_matches,
      (SELECT count(*) FROM (SELECT source_ref FROM packet_candidates WHERE packet_key IS NOT NULL GROUP BY source_ref HAVING count(DISTINCT packet_key) > 1) ambiguous)::integer AS packet_ambiguous_sources,
      (SELECT count(DISTINCT p.source_ref) FROM graphify_exact g JOIN public.atlas_packets p ON lower(regexp_replace(regexp_replace(btrim(p.source_ref), '\\\\', '/', 'g'), '^\\./', '')) = g.source_ref AND lower(btrim(p.content_hash)) = g.content_digest)::integer AS packet_content_matches,
      (SELECT count(DISTINCT source_ref) FROM source_revision_lineage WHERE file_content_hash IS NOT NULL AND lower(btrim(file_content_hash)) = content_digest)::integer AS chunk_file_content_matches
  `, auditLimit == null ? [explicitWorkspaceRevision, explicitExecutionId] : [explicitWorkspaceRevision, explicitExecutionId, auditLimit]);
  let identityClassifications = [];
  let identityClassificationSummary = null;
  let identityClassificationStatus = 'NOT_RUN_FULL_SCOPE';
  if (auditLimit != null) {
    const identityRows = await client.query(`
      WITH bindings AS (
        SELECT lower(regexp_replace(regexp_replace(btrim(canonical_source_ref), '\\\\', '/', 'g'), '^\\./', '')) AS source_ref,
               workspace_revision::text AS workspace_revision,
               lower(source_revision::text) AS source_revision,
               lower(content_digest::text) AS content_digest
        FROM public.atlas_workspace_source_bindings
        WHERE repo_id = 'deeds-web-app' AND workspace_revision::text = $1
        ORDER BY lower(regexp_replace(regexp_replace(btrim(canonical_source_ref), '\\\\', '/', 'g'), '^\\./', '')),
                 lower(source_revision::text), lower(content_digest::text)
        LIMIT $3
      ), graphify AS (
        SELECT lower(regexp_replace(regexp_replace(btrim(source_ref), '\\\\', '/', 'g'), '^\\./', '')) AS source_ref,
               workspace_revision::text AS workspace_revision,
               lower(code_source_revision::text) AS source_revision,
               lower(content_hash::text) AS content_digest
        FROM public.graphify_execution_file_membership_v2
        WHERE execution_id = $2::uuid AND repository_id = 'repo:root' AND workspace_revision::text = $1
      ), exact_members AS (
        SELECT b.source_ref, b.workspace_revision, b.source_revision, b.content_digest
        FROM bindings b
        JOIN graphify g USING (source_ref, workspace_revision, source_revision, content_digest)
        GROUP BY b.source_ref, b.workspace_revision, b.source_revision, b.content_digest
        HAVING count(*) = 1
      ), selected AS MATERIALIZED (
        SELECT * FROM exact_members
        ORDER BY source_ref, source_revision, content_digest
        LIMIT $3
      ), packet_data AS MATERIALIZED (
        SELECT s.source_ref,
          jsonb_agg(jsonb_build_object(
            'packet_key', p.packet_key::text,
            'source_revision', lower(p.source_revision::text),
            'content_hash', lower(p.content_hash::text),
            'legacy_sha256', lower(p.sha256::text),
            'lineage_binding_checksum', p.lineage_binding_checksum,
            'lineage_producer_revision', p.lineage_producer_revision
          ) ORDER BY p.packet_key::text) AS packet_rows
        FROM selected s
        JOIN public.atlas_packets p
          ON lower(regexp_replace(regexp_replace(btrim(p.source_ref), '\\\\', '/', 'g'), '^\\./', '')) = s.source_ref
        GROUP BY s.source_ref
      ), lineage_data AS MATERIALIZED (
        SELECT s.source_ref,
          jsonb_agg(jsonb_build_object(
            'packet_key', l.packet_key::text,
            'source_revision', lower(l.source_revision::text),
            'revision_status', l.revision_status,
            'chunk_row_exists', c.id IS NOT NULL
          ) ORDER BY l.packet_key::text, l.chunk_row_id::text) AS lineage_rows
        FROM selected s
        JOIN public.atlas_packet_chunk_lineage l
          ON lower(regexp_replace(regexp_replace(btrim(l.source_ref), '\\\\', '/', 'g'), '^\\./', '')) = s.source_ref
         AND lower(l.source_revision::text) = s.source_revision
         AND l.revision_status = 'PROVEN'
        LEFT JOIN public.codebase_chunk_index c ON c.id = l.chunk_row_id
        GROUP BY s.source_ref
      ), packet_keys AS MATERIALIZED (
        SELECT DISTINCT s.source_ref, p.packet_key::text AS packet_key
        FROM selected s
        JOIN public.atlas_packets p
          ON lower(regexp_replace(regexp_replace(btrim(p.source_ref), '\\\\', '/', 'g'), '^\\./', '')) = s.source_ref
        WHERE p.packet_key IS NOT NULL
      ), packet_lineage_data AS MATERIALIZED (
        SELECT pk.source_ref,
          jsonb_agg(jsonb_build_object(
            'packet_key', l.packet_key::text,
            'lineage_source_ref', lower(regexp_replace(regexp_replace(btrim(l.source_ref), '\\\\', '/', 'g'), '^\\./', '')),
            'source_revision', lower(l.source_revision::text),
            'revision_status', l.revision_status,
            'chunk_row_exists', c.id IS NOT NULL
          ) ORDER BY l.packet_key::text, l.source_revision::text, l.chunk_row_id::text) AS packet_lineage_rows
        FROM packet_keys pk
        JOIN public.atlas_packet_chunk_lineage l ON l.packet_key::text = pk.packet_key
        LEFT JOIN public.codebase_chunk_index c ON c.id = l.chunk_row_id
        GROUP BY pk.source_ref
      ), source_chunk_diagnostic AS MATERIALIZED (
        SELECT s.source_ref,
          count(c.id)::integer AS exact_source_ref_chunk_count
        FROM selected s
        LEFT JOIN public.codebase_chunk_index c ON c.source_ref::text = s.source_ref
        GROUP BY s.source_ref
      )
      SELECT s.source_ref, s.workspace_revision, s.source_revision, s.content_digest,
        COALESCE(packet_data.packet_rows, '[]'::jsonb) AS packet_rows,
        COALESCE(lineage_data.lineage_rows, '[]'::jsonb) AS lineage_rows,
        COALESCE(packet_lineage_data.packet_lineage_rows, '[]'::jsonb) AS packet_lineage_rows,
        jsonb_build_object(
          'exactSourceRefChunkCount', source_chunk_diagnostic.exact_source_ref_chunk_count,
          'revisionQualified', false,
          'reason', 'CODEBASE_CHUNK_INDEX_SOURCE_REVISION_COLUMN_UNAVAILABLE'
        ) AS source_chunk_diagnostic
      FROM selected s
      LEFT JOIN packet_data ON packet_data.source_ref = s.source_ref
      LEFT JOIN lineage_data ON lineage_data.source_ref = s.source_ref
      LEFT JOIN packet_lineage_data ON packet_lineage_data.source_ref = s.source_ref
      LEFT JOIN source_chunk_diagnostic ON source_chunk_diagnostic.source_ref = s.source_ref
      ORDER BY s.source_ref, s.source_revision, s.content_digest
    `, [explicitWorkspaceRevision, explicitExecutionId, auditLimit]);
    identityClassifications = identityRows.rows.map(classifyPacketChunkIdentityV1);
    identityClassificationSummary = summarizePacketChunkIdentityClassificationsV1(identityClassifications);
    identityClassificationStatus = identityClassificationSummary.rowCount === auditLimit
      ? 'DETERMINISTIC_EXACT_GRAPHIFY_COHORT_CLASSIFIED'
      : 'DETERMINISTIC_COHORT_INCOMPLETE';
  }
  const identitySelectionRule = auditLimit == null
    ? null
    : 'exact source/workspace/content bindings joined to the explicit Graphify execution; sorted by normalized source_ref, source_revision, content_digest; bounded by --limit';
  const identityClassificationChecksum = identityClassificationSummary == null
    ? null
    : `sha256:${createHash('sha256').update(JSON.stringify({
      schema: 'atlas.current-packet-chunk-identity-classification.v1',
      workspaceRevision: explicitWorkspaceRevision,
      executionId: explicitExecutionId,
      selectionRule: identitySelectionRule,
      rows: identityClassifications,
    }), 'utf8').digest('hex')}`;
  const lineageSamples = await client.query(`
    WITH current_members AS (
      SELECT lower(regexp_replace(regexp_replace(btrim(source_ref), '\\\\', '/', 'g'), '^\\./', '')) AS source_ref,
             lower(code_source_revision::text) AS source_revision,
             lower(content_hash::text) AS content_digest
      FROM public.graphify_execution_file_membership_v2
      WHERE execution_id = $2::uuid
        AND repository_id = 'repo:root'
        AND workspace_revision::text = lower($1::text)
        ${auditLimit == null ? '' : 'LIMIT $3'}
    )
    SELECT DISTINCT
      m.source_ref,
      l.packet_key::text AS packet_key,
      l.canonical_chunk_id::text AS canonical_chunk_id,
      l.chunk_row_id::text AS chunk_row_id,
      l.source_revision::text AS lineage_source_revision,
      l.revision_status,
      p.content_hash AS packet_content_hash,
      c.file_content_hash AS chunk_file_content_hash,
      m.content_digest AS source_content_digest,
      (p.content_hash IS NOT NULL AND lower(btrim(p.content_hash)) = m.content_digest) AS packet_content_match,
      (c.file_content_hash IS NOT NULL AND lower(btrim(c.file_content_hash)) = m.content_digest) AS chunk_file_content_match
    FROM current_members m
    JOIN public.atlas_packet_chunk_lineage l
      ON lower(regexp_replace(regexp_replace(btrim(l.source_ref), '\\\\', '/', 'g'), '^\\./', '')) = m.source_ref
     AND lower(btrim(l.source_revision::text)) = m.source_revision
     AND l.revision_status = 'PROVEN'
    JOIN public.codebase_chunk_index c ON c.id = l.chunk_row_id
    LEFT JOIN public.atlas_packets p ON p.packet_key = l.packet_key
    ORDER BY m.source_ref, l.packet_key::text, l.canonical_chunk_id::text
    LIMIT 128
  `, auditLimit == null
    ? [explicitWorkspaceRevision, explicitExecutionId]
    : [explicitWorkspaceRevision, explicitExecutionId, auditLimit]);
  const inventory = await client.query(`
    SELECT
      count(*)::integer AS chunk_rows,
      count(*) FILTER (WHERE source_ref IS NOT NULL)::integer AS chunks_with_source_ref,
      count(*) FILTER (WHERE relative_path IS NOT NULL)::integer AS chunks_with_relative_path,
      count(*) FILTER (WHERE content_hash IS NOT NULL)::integer AS chunks_with_content_hash,
      count(DISTINCT relative_path) FILTER (WHERE relative_path IS NOT NULL)::integer AS indexed_relative_paths,
      count(DISTINCT source_ref) FILTER (WHERE source_ref IS NOT NULL)::integer AS indexed_source_refs
    FROM public.codebase_chunk_index
  `);
  let mismatchDiagnostics;
  await client.query('SAVEPOINT mismatch_diagnostics');
  try {
    mismatchDiagnostics = await client.query(`
    WITH bindings AS (
      SELECT lower(regexp_replace(regexp_replace(btrim(canonical_source_ref), '\\\\', '/', 'g'), '^\\./', '')) AS source_ref,
             lower(btrim(source_revision::text)) AS source_revision,
             lower(btrim(content_digest::text)) AS content_digest
      FROM public.atlas_workspace_source_bindings
      WHERE repo_id = 'deeds-web-app'
        AND workspace_revision::text = lower($1::text)
      ${auditLimit == null ? '' : 'LIMIT $3'}
    ), graphify AS (
      SELECT lower(regexp_replace(regexp_replace(btrim(source_ref), '\\\\', '/', 'g'), '^\\./', '')) AS source_ref,
             lower(btrim(code_source_revision::text)) AS source_revision,
             lower(btrim(content_hash::text)) AS content_hash,
             lower(btrim(workspace_revision::text)) AS workspace_revision
      FROM public.graphify_execution_file_membership_v2
      WHERE execution_id = $2::uuid
        AND repository_id = 'repo:root'
        AND workspace_revision::text = lower($1::text)
    ), joined AS (
      SELECT b.source_ref, b.source_revision, b.content_digest,
             count(g.source_ref) > 0 AS source_match,
             bool_or(g.source_revision = b.source_revision) AS revision_match,
             bool_or(g.source_revision = b.source_revision AND g.content_hash = b.content_digest) AS content_match,
             bool_or(g.source_revision = b.source_revision AND g.content_hash = b.content_digest
               AND g.workspace_revision = lower($1::text)) AS workspace_match
      FROM bindings b
      LEFT JOIN graphify g ON g.source_ref = b.source_ref
      GROUP BY b.source_ref, b.source_revision, b.content_digest
    )
    SELECT count(*)::integer AS binding_rows,
      count(*) FILTER (WHERE source_match)::integer AS normalized_source_matches,
      count(*) FILTER (WHERE revision_match)::integer AS normalized_revision_matches,
      count(*) FILTER (WHERE content_match)::integer AS normalized_content_matches,
      count(*) FILTER (WHERE workspace_match)::integer AS normalized_workspace_matches,
      count(*) FILTER (WHERE content_match AND NOT workspace_match)::integer AS workspace_mismatch_rows,
      count(*) FILTER (WHERE NOT source_match)::integer AS missing_source_rows,
      count(*) FILTER (WHERE source_match AND NOT revision_match)::integer AS revision_mismatch_rows,
      count(*) FILTER (WHERE revision_match AND NOT content_match)::integer AS content_mismatch_rows
    FROM joined
  `, auditLimit == null ? [explicitWorkspaceRevision, explicitExecutionId] : [explicitWorkspaceRevision, explicitExecutionId, auditLimit]);
  } catch (error) {
    if (error?.code !== '57014') throw error;
    await client.query('ROLLBACK TO SAVEPOINT mismatch_diagnostics');
    mismatchDiagnostics = {
      rows: [{
        status: 'NOT_RUN_STATEMENT_TIMEOUT',
        binding_rows: null,
        normalized_source_matches: null,
        normalized_revision_matches: null,
        normalized_content_matches: null,
        normalized_workspace_matches: null,
        workspace_mismatch_rows: null,
        missing_source_rows: null,
        revision_mismatch_rows: null,
        content_mismatch_rows: null,
      }],
    };
  }
  let pathCoverage;
  await client.query('SAVEPOINT path_coverage');
  try {
    pathCoverage = await client.query(`
    WITH bindings AS (
      SELECT DISTINCT lower(regexp_replace(regexp_replace(btrim(canonical_source_ref), '\\\\', '/', 'g'), '^\\./', '')) AS source_ref
      FROM public.atlas_workspace_source_bindings
      WHERE repo_id = 'deeds-web-app'
        AND workspace_revision::text = lower($1::text)
      ${auditLimit == null ? '' : 'LIMIT $2'}
    )
    SELECT
      count(*)::integer AS binding_sources,
      count(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM public.codebase_chunk_index c
        WHERE lower(regexp_replace(regexp_replace(btrim(c.relative_path), '\\\\', '/', 'g'), '^\\./', '')) = bindings.source_ref
      ))::integer AS bindings_with_relative_path_chunks,
      count(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM public.codebase_chunk_index c
        WHERE lower(regexp_replace(regexp_replace(btrim(c.source_ref), '\\\\', '/', 'g'), '^\\./', '')) = bindings.source_ref
      ))::integer AS bindings_with_source_ref_chunks
    FROM bindings
  `, auditLimit == null ? [explicitWorkspaceRevision] : [explicitWorkspaceRevision, auditLimit]);
  } catch (error) {
    if (error?.code !== '57014') throw error;
    await client.query('ROLLBACK TO SAVEPOINT path_coverage');
    pathCoverage = {
      rows: [{
        status: 'NOT_RUN_STATEMENT_TIMEOUT',
        binding_sources: null,
        bindings_with_relative_path_chunks: null,
        bindings_with_source_ref_chunks: null,
      }],
    };
  }
  const revisionResult = await client.query(`SELECT DISTINCT workspace_revision::text AS workspace_revision FROM public.atlas_workspace_source_bindings WHERE repo_id = 'deeds-web-app' ORDER BY workspace_revision::text`);
  const report = {
    schema: 'atlas.current-workspace-packet-chunk-join.v1',
    observedAt: new Date().toISOString(),
    mode: 'READ_ONLY_CENSUS',
    executionId: explicitExecutionId,
    workspaceRevisionInput: explicitWorkspaceRevision,
    scope: auditLimit == null ? 'FULL' : 'BOUNDED_SAMPLE',
    sampleLimit: auditLimit,
    workspaceRevisions: revisionResult.rows.map((row) => row.workspace_revision),
    counts: result.rows[0],
    identityClassification: {
      status: identityClassificationStatus,
      selectionRule: identitySelectionRule,
      summary: identityClassificationSummary,
      checksum: identityClassificationChecksum,
      representativeness: auditLimit == null ? 'NOT_APPLICABLE' : 'BOUNDED_DETERMINISTIC_SAMPLE_NOT_A_POPULATION_ESTIMATE',
      rows: identityClassifications,
    },
    lineageSamples: lineageSamples.rows,
    chunkInventory: inventory.rows[0],
    pathCoverage: pathCoverage.rows[0],
    mismatchDiagnostics: mismatchDiagnostics.rows[0],
    currentGraphifyEvidenceOwner: 'graphify_execution_file_membership_v2; explicit execution only',
    workspaceRevisionAuthority: 'atlas_workspace_source_bindings; packet workspace columns are not used for qualification',
    legacyGraphifyEvidenceExcludedFromCurrentJoin: true,
    mismatchDiagnosticScope: 'explicit admitted workspace revision and execution only; historical rows are not used for current-gate promotion',
    mismatchDiagnosticNote: mismatchDiagnostics.rows[0]?.status === 'NOT_RUN_STATEMENT_TIMEOUT'
      ? 'Secondary normalized-detail query exceeded the read-only statement timeout; primary join counts remain authoritative.'
      : null,
    hashGrain: {
      bindingContentDigest: 'whole-source digest; exact Graphify file content hash',
      graphifyContentHash: 'whole-source digest',
      codebaseChunkIndexContentHash: 'per-chunk digest; not equal to a whole-source digest for multi-chunk files',
      exactJoinAllowedOnlyWhen: 'a separately proven packet/chunk binding supplies the exact chunk digest',
  },
    writes: { postgres: false, graphify: false, qdrant: false, neo4j: false, valkey: false },
    canonicalAuthority: false,
    status: Number(result.rows[0].packet_chunk_exact_sources) === Number(result.rows[0].binding_sources)
      && Number(result.rows[0].binding_sources) > 0
      ? 'CURRENT_PACKET_CHUNK_JOIN_COMPLETE'
      : Number(result.rows[0].packet_chunk_exact_sources) > 0
        ? 'CURRENT_PACKET_CHUNK_JOIN_PARTIAL'
        : 'CURRENT_PACKET_CHUNK_JOIN_MISSING',
    nextGate: Number(result.rows[0].packet_chunk_exact_sources) === Number(result.rows[0].binding_sources)
      && Number(result.rows[0].binding_sources) > 0
      ? 'CURRENT_CANDIDATE_MAP_REPLAY'
      : 'CURRENT_PACKET_CHUNK_IDENTITY_RECONCILIATION',
  };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: report.status, workspaceRevisions: report.workspaceRevisions, counts: report.counts, reportPath: path.relative(root, reportPath) }, null, 2));
} finally {
  await client.query('ROLLBACK').catch(() => undefined);
  client.release();
  await pool.end();
}
