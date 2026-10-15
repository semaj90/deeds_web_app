#!/usr/bin/env node
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const revisionArg = process.argv.find((arg) => arg.startsWith('--workspace-revision='));
const workspaceRevision = revisionArg?.slice('--workspace-revision='.length).trim();
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = Number(limitArg?.slice('--limit='.length) ?? 500);

if (!workspaceRevision || !Number.isInteger(limit) || limit < 1 || limit > 2000) {
  console.error('Usage: node scripts/atlas/audit-callable-search-lineage-v1.mjs --workspace-revision=<revision> [--limit=1..2000]');
  process.exit(2);
}

const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)),
  max: 1,
  connectionTimeoutMillis: 5000,
  statement_timeout: 12000,
  application_name: 'atlas-callable-search-lineage-audit-v1',
});

const client = await pool.connect();
try {
  await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await client.query("SET LOCAL statement_timeout = '12000ms'");
  const result = await client.query(`
    WITH projection AS (
      SELECT c.symbol_version_id, c.packet_key AS projection_packet_key,
        c.source_ref AS projection_source_ref, c.source_revision AS projection_source_revision,
        c.workspace_revision AS projection_workspace_revision, c.tree_node_id AS projection_tree_node_id,
        sv.packet_key, sv.source_ref, sv.source_revision, sv.workspace_revision,
        sv.upstream_node_id, sv.qualified_name AS symbol_qualified_name,
        sv.byte_start, sv.byte_end
      FROM public.atlas_callable_search c
      LEFT JOIN public.atlas_symbol_versions sv USING (symbol_version_id)
      WHERE c.workspace_revision = $1
      ORDER BY c.symbol_version_id
      LIMIT $2
    ), evidence AS (
      SELECT p.*,
        COALESCE(packet.packet_rows, 0) AS packet_rows,
        COALESCE(packet.exact_packet_rows, 0) AS exact_packet_rows,
        COALESCE(packet.projection_packet_rows, 0) AS projection_packet_rows,
        COALESCE(packet.projection_exact_packet_rows, 0) AS projection_exact_packet_rows,
        COALESCE(binding.binding_rows, 0) AS binding_rows,
        COALESCE(binding.projection_binding_rows, 0) AS projection_binding_rows,
        COALESCE(binding.source_repo_key, '') AS source_repo_key,
        COALESCE(repo_mapping.mapping_rows, 0) AS repo_mapping_rows,
        COALESCE(ast.projection_node_rows, 0) AS projection_node_rows,
        COALESCE(ast.ast_path_rows, 0) AS ast_path_rows,
        COALESCE(ast.ast_revision_rows, 0) AS ast_revision_rows,
        COALESCE(ast.ast_hash_rows, 0) AS ast_hash_rows,
        COALESCE(ast.ast_symbol_rows, 0) AS ast_symbol_rows,
        COALESCE(ast.canonical_node_rows, 0) AS canonical_node_rows
      FROM projection p
      LEFT JOIN LATERAL (
        SELECT count(*) AS packet_rows,
          count(*) FILTER (WHERE a.source_ref = p.source_ref
            AND a.source_revision = p.source_revision
            AND a.workspace_revision_key = p.workspace_revision) AS exact_packet_rows,
          count(*) FILTER (WHERE a.packet_key = p.projection_packet_key) AS projection_packet_rows,
          count(*) FILTER (WHERE a.packet_key = p.projection_packet_key
            AND a.source_ref = p.projection_source_ref
            AND a.source_revision = p.projection_source_revision
            AND a.workspace_revision_key = p.projection_workspace_revision) AS projection_exact_packet_rows
        FROM public.atlas_packets a
        WHERE a.packet_key IN (p.packet_key, p.projection_packet_key)
      ) packet ON true
      LEFT JOIN LATERAL (
        SELECT count(*) FILTER (WHERE b.canonical_source_ref = p.source_ref
          AND b.source_revision = p.source_revision
          AND b.workspace_revision = p.workspace_revision) AS binding_rows,
          count(*) FILTER (WHERE b.canonical_source_ref = p.projection_source_ref
          AND b.source_revision = p.projection_source_revision
          AND b.workspace_revision = p.projection_workspace_revision) AS projection_binding_rows,
          max(b.repo_id) FILTER (WHERE b.canonical_source_ref = p.source_ref
          AND b.source_revision = p.source_revision
          AND b.workspace_revision = p.workspace_revision) AS source_repo_key
        FROM public.atlas_workspace_source_bindings b
        WHERE (b.canonical_source_ref = p.source_ref
            AND b.source_revision = p.source_revision
            AND b.workspace_revision = p.workspace_revision)
          OR (b.canonical_source_ref = p.projection_source_ref
            AND b.source_revision = p.projection_source_revision
            AND b.workspace_revision = p.projection_workspace_revision)
      ) binding ON true
      LEFT JOIN LATERAL (
        SELECT count(*) AS mapping_rows
        FROM public.code_repos cr
        WHERE cr.name = binding.source_repo_key
      ) repo_mapping ON true
      LEFT JOIN LATERAL (
        SELECT count(*) FILTER (WHERE n.tree_node_id = p.projection_tree_node_id) AS projection_node_rows,
          count(*) FILTER (WHERE cr.repo_id = n.repo_id
            AND n.relative_path = regexp_replace(replace(p.source_ref, '\\', '/'), '^sveltekit-frontend/', '')) AS ast_path_rows,
          count(*) FILTER (WHERE cr.repo_id = n.repo_id
            AND n.relative_path = regexp_replace(replace(p.source_ref, '\\', '/'), '^sveltekit-frontend/', '')
            AND n.source_revision = p.source_revision) AS ast_revision_rows,
          count(*) FILTER (WHERE cr.repo_id = n.repo_id
            AND n.relative_path = regexp_replace(replace(p.source_ref, '\\', '/'), '^sveltekit-frontend/', '')
            AND n.source_revision = p.source_revision
            AND n.source_content_hash IN (b.content_digest, regexp_replace(b.content_digest, '^sha256:', ''))) AS ast_hash_rows,
          count(*) FILTER (WHERE cr.repo_id = n.repo_id
            AND n.relative_path = regexp_replace(replace(p.source_ref, '\\', '/'), '^sveltekit-frontend/', '')
            AND n.source_revision = p.source_revision
            AND n.source_content_hash IN (b.content_digest, regexp_replace(b.content_digest, '^sha256:', ''))
            AND n.qualified_symbol = p.symbol_qualified_name) AS ast_symbol_rows,
          count(*) FILTER (WHERE cr.repo_id = n.repo_id
            AND n.relative_path = regexp_replace(replace(p.source_ref, '\\', '/'), '^sveltekit-frontend/', '')
            AND n.source_revision = p.source_revision
            AND n.source_content_hash IN (b.content_digest, regexp_replace(b.content_digest, '^sha256:', ''))
            AND n.qualified_symbol = p.symbol_qualified_name
            AND n.start_byte = p.byte_start
            AND n.end_byte = p.byte_end) AS canonical_node_rows
        FROM public.atlas_ast_nodes n
        LEFT JOIN public.atlas_workspace_source_bindings b
          ON b.canonical_source_ref = p.source_ref
          AND b.source_revision = p.source_revision
          AND b.workspace_revision = p.workspace_revision
        LEFT JOIN public.code_repos cr ON cr.name = b.repo_id AND cr.repo_id = n.repo_id
        WHERE n.tree_node_id = p.projection_tree_node_id
           OR (cr.repo_id = n.repo_id
             AND n.relative_path = regexp_replace(replace(p.source_ref, '\\', '/'), '^sveltekit-frontend/', ''))
      ) ast ON true
    )
    SELECT count(*) AS rows,
      count(*) FILTER (WHERE packet_key IS NULL) AS missing_symbol,
      count(*) FILTER (WHERE source_revision IS DISTINCT FROM projection_source_revision) AS source_revision_mismatch,
      count(*) FILTER (WHERE workspace_revision IS DISTINCT FROM projection_workspace_revision) AS workspace_revision_mismatch,
      count(*) FILTER (WHERE projection_packet_key IS DISTINCT FROM packet_key) AS projection_packet_key_mismatch,
      count(*) FILTER (WHERE packet_rows = 0) AS packet_missing,
      count(*) FILTER (WHERE packet_rows > 1) AS packet_ambiguous,
      count(*) FILTER (WHERE exact_packet_rows = 1) AS exact_packet_match,
      count(*) FILTER (WHERE projection_packet_rows = 0) AS projection_packet_missing,
      count(*) FILTER (WHERE projection_packet_rows > 1) AS projection_packet_ambiguous,
      count(*) FILTER (WHERE projection_exact_packet_rows = 1) AS projection_exact_packet_match,
      count(*) FILTER (WHERE binding_rows = 0) AS source_binding_missing,
      count(*) FILTER (WHERE binding_rows = 1) AS unique_source_binding,
      count(*) FILTER (WHERE projection_binding_rows = 0) AS projection_source_binding_missing,
      count(*) FILTER (WHERE projection_binding_rows = 1) AS unique_projection_source_binding,
      count(*) FILTER (WHERE repo_mapping_rows = 0) AS repository_uuid_mapping_missing,
      count(*) FILTER (WHERE repo_mapping_rows = 1) AS unique_repository_uuid_mapping,
      count(*) FILTER (WHERE repo_mapping_rows > 1) AS ambiguous_repository_uuid_mapping,
      count(*) FILTER (WHERE projection_tree_node_id IS NULL) AS projection_tree_node_missing,
      count(*) FILTER (WHERE projection_node_rows = 0) AS projection_tree_node_unresolved,
      count(*) FILTER (WHERE ast_path_rows > 0) AS ast_path_candidate_rows,
      count(*) FILTER (WHERE ast_revision_rows > 0) AS ast_revision_candidate_rows,
      count(*) FILTER (WHERE ast_hash_rows > 0) AS ast_hash_candidate_rows,
      count(*) FILTER (WHERE ast_symbol_rows > 0) AS ast_symbol_candidate_rows,
      count(*) FILTER (WHERE canonical_node_rows = 1) AS unique_canonical_ast_match,
      count(*) FILTER (WHERE canonical_node_rows > 1) AS ambiguous_canonical_ast_match,
      (SELECT jsonb_agg(jsonb_build_object(
        'symbolVersionId', sample.symbol_version_id,
        'projectionSourceRef', sample.projection_source_ref,
        'symbolSourceRef', sample.source_ref,
        'symbolQualifiedName', sample.symbol_qualified_name,
        'byteStart', sample.byte_start,
        'byteEnd', sample.byte_end,
        'upstreamNodeId', sample.upstream_node_id,
        'projectionTreeNodeId', sample.projection_tree_node_id,
        'repoId', (SELECT b.repo_id FROM public.atlas_workspace_source_bindings b
          WHERE b.canonical_source_ref = sample.source_ref
            AND b.source_revision = sample.source_revision
            AND b.workspace_revision = sample.workspace_revision LIMIT 1),
        'astRepoUuids', (SELECT jsonb_agg(cr.repo_id::text ORDER BY cr.repo_id)
          FROM public.code_repos cr WHERE cr.name = (SELECT b.repo_id
            FROM public.atlas_workspace_source_bindings b
            WHERE b.canonical_source_ref = sample.source_ref
              AND b.source_revision = sample.source_revision
              AND b.workspace_revision = sample.workspace_revision LIMIT 1)),
        'astRelativePathExamples', (SELECT jsonb_agg(paths.relative_path) FROM (
          SELECT DISTINCT n.relative_path FROM public.atlas_ast_nodes n
          WHERE n.qualified_symbol = sample.symbol_qualified_name LIMIT 5
        ) paths)
      ) ORDER BY sample.symbol_version_id)
      FROM (SELECT * FROM evidence ORDER BY symbol_version_id LIMIT 3) sample) AS diagnostic_samples
    FROM evidence
  `, [workspaceRevision, limit]);
  const repoInventory = await client.query(`
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'repoUuid', repo_id::text, 'repoName', name, 'astNodeRows', ast_node_rows
    ) ORDER BY name, repo_id), '[]'::jsonb) AS rows
    FROM (
      SELECT cr.repo_id, cr.name, count(n.tree_node_id) AS ast_node_rows
      FROM public.code_repos cr
      LEFT JOIN public.atlas_ast_nodes n ON n.repo_id = cr.repo_id
      GROUP BY cr.repo_id, cr.name
    ) inventory
  `);
  await client.query('ROLLBACK');
  console.log(JSON.stringify({
    schema: 'atlas.callable-search-lineage-census.v1',
    workspaceRevision,
    limit,
    ...result.rows[0],
    codeRepoInventory: repoInventory.rows[0].rows,
    databaseWrites: false,
    authority: 'diagnostic_only',
  }, null, 2));
} catch (error) {
  await client.query('ROLLBACK').catch(() => undefined);
  console.error(JSON.stringify({ status: 'ERROR', message: String(error.message ?? error).slice(0, 240), databaseWrites: false }));
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
