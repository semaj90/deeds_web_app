#!/usr/bin/env node

/** Read-only census of current workspace bindings through Graphify, packets, and chunks. */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const root = REPO_ROOT;
const reportPath = path.join(root, 'docs/reports/current-workspace-packet-chunk-join-v1.json');
const env = loadRepoEnv(process.env);
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env), max: 1, statement_timeout: 120000 });

try {
  const result = await pool.query(`
    WITH bindings AS (
      SELECT canonical_source_ref AS source_ref,
             workspace_revision::text AS workspace_revision,
             lower(source_revision::text) AS source_revision,
             lower(content_digest::text) AS content_digest
      FROM public.atlas_workspace_source_bindings
      WHERE repo_id = 'deeds-web-app'
    ), graphify_exact AS (
      SELECT b.source_ref, b.workspace_revision, b.source_revision, b.content_digest
      FROM bindings b
      JOIN public.graphify_files g
        ON g.source_ref = b.source_ref
       AND g.workspace_revision::text = b.workspace_revision
       AND lower(g.code_source_revision::text) = b.source_revision
       AND lower(g.content_hash::text) = b.content_digest
      GROUP BY b.source_ref, b.workspace_revision, b.source_revision, b.content_digest
      HAVING count(*) = 1
    ), chunks AS (
      SELECT source_ref, lower(content_hash::text) AS content_hash
      FROM public.codebase_chunk_index
      GROUP BY source_ref, lower(content_hash::text)
    ), packet_matches AS (
      SELECT DISTINCT g.source_ref, g.content_digest
      FROM graphify_exact g
      JOIN public.atlas_packets p ON p.source_ref = g.source_ref
        AND lower(btrim(p.content_hash)) = g.content_digest
      JOIN chunks c ON c.source_ref = g.source_ref AND c.content_hash = g.content_digest
    )
    SELECT
      (SELECT count(*) FROM bindings)::integer AS binding_rows,
      (SELECT count(DISTINCT source_ref) FROM bindings)::integer AS binding_sources,
      (SELECT count(*) FROM graphify_exact)::integer AS graphify_exact_sources,
      (SELECT count(*) FROM chunks c JOIN bindings b ON b.source_ref = c.source_ref AND b.content_digest = c.content_hash)::integer AS binding_chunk_content_matches,
      (SELECT count(*) FROM packet_matches)::integer AS packet_chunk_exact_sources,
      (SELECT count(DISTINCT p.source_ref) FROM graphify_exact g JOIN public.atlas_packets p ON p.source_ref = g.source_ref AND lower(btrim(p.content_hash)) = g.content_digest)::integer AS packet_content_matches
  `);
  const inventory = await pool.query(`
    SELECT
      count(*)::integer AS chunk_rows,
      count(*) FILTER (WHERE source_ref IS NOT NULL)::integer AS chunks_with_source_ref,
      count(*) FILTER (WHERE relative_path IS NOT NULL)::integer AS chunks_with_relative_path,
      count(*) FILTER (WHERE content_hash IS NOT NULL)::integer AS chunks_with_content_hash,
      count(DISTINCT relative_path) FILTER (WHERE relative_path IS NOT NULL)::integer AS indexed_relative_paths,
      count(DISTINCT source_ref) FILTER (WHERE source_ref IS NOT NULL)::integer AS indexed_source_refs
    FROM public.codebase_chunk_index
  `);
  const pathCoverage = await pool.query(`
    WITH bindings AS (
      SELECT DISTINCT canonical_source_ref AS source_ref
      FROM public.atlas_workspace_source_bindings
      WHERE repo_id = 'deeds-web-app'
    )
    SELECT
      count(*)::integer AS binding_sources,
      count(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM public.codebase_chunk_index c
        WHERE c.relative_path = bindings.source_ref
      ))::integer AS bindings_with_relative_path_chunks,
      count(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM public.codebase_chunk_index c
        WHERE c.source_ref = bindings.source_ref
      ))::integer AS bindings_with_source_ref_chunks
    FROM bindings
  `);
  const revisionResult = await pool.query(`SELECT DISTINCT workspace_revision::text AS workspace_revision FROM public.atlas_workspace_source_bindings WHERE repo_id = 'deeds-web-app' ORDER BY workspace_revision::text`);
  const report = {
    schema: 'atlas.current-workspace-packet-chunk-join.v1',
    mode: 'READ_ONLY_CENSUS',
    workspaceRevisions: revisionResult.rows.map((row) => row.workspace_revision),
    counts: result.rows[0],
    chunkInventory: inventory.rows[0],
    pathCoverage: pathCoverage.rows[0],
    hashGrain: {
      bindingContentDigest: 'whole-source digest; exact Graphify file content hash',
      graphifyContentHash: 'whole-source digest',
      codebaseChunkIndexContentHash: 'per-chunk digest; not equal to a whole-source digest for multi-chunk files',
      exactJoinAllowedOnlyWhen: 'a separately proven packet/chunk binding supplies the exact chunk digest',
    },
    writes: { postgres: false, graphify: false, qdrant: false, neo4j: false, valkey: false },
    canonicalAuthority: false,
    status: Number(result.rows[0].packet_chunk_exact_sources) > 0 ? 'CURRENT_PACKET_CHUNK_JOIN_PRESENT' : 'CURRENT_PACKET_CHUNK_JOIN_MISSING',
    nextGate: Number(result.rows[0].packet_chunk_exact_sources) > 0 ? 'CURRENT_CANDIDATE_MAP_REPLAY' : 'CURRENT_PACKET_CHUNK_IDENTITY_RECONCILIATION',
  };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: report.status, workspaceRevisions: report.workspaceRevisions, counts: report.counts, reportPath: path.relative(root, reportPath) }, null, 2));
} finally {
  await pool.end();
}
