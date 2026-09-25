#!/usr/bin/env node

/**
 * Read-only census: how much of the current admitted source cohort already has
 * packet / summary / embedding / classification enrichment in PostgreSQL.
 * Exact source_ref joins only. No normalization, path fallback, or writes.
 * summary present != revision-qualified; embedding present != identity.
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const arg = (name) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : null; };
const workspaceRevision = arg('--workspace-revision');
const executionId = arg('--execution-id');
if (!/^sha256:[0-9a-f]{64}$/.test(workspaceRevision ?? '')) throw new Error('EXPLICIT_WORKSPACE_REVISION_REQUIRED');
if (!/^[0-9a-f-]{36}$/.test(executionId ?? '')) throw new Error('EXPLICIT_EXECUTION_ID_REQUIRED');

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, connectionTimeoutMillis: 5000, statement_timeout: 120000 });
const client = await pool.connect();
const out = {};
try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const cohortCte = `WITH m AS (
      SELECT DISTINCT source_ref, lower(code_source_revision) AS rev, lower(content_hash) AS chash
      FROM public.graphify_execution_file_membership_v2
      WHERE execution_id = $1::uuid AND workspace_revision::text = $2 AND repository_id = 'repo:root')`;
  const args = [executionId, workspaceRevision];

  out.cohort = (await client.query(`${cohortCte} SELECT count(*)::int AS identities, count(DISTINCT source_ref)::int AS distinct_source_refs FROM m`, args)).rows[0];

  // atlas_packets side, exact source_ref
  out.atlasPackets = (await client.query(`${cohortCte},
    p AS (SELECT m.source_ref AS cohort_ref, m.rev, m.chash, ap.* FROM m JOIN public.atlas_packets ap ON ap.source_ref = m.source_ref)
    SELECT count(DISTINCT cohort_ref)::int AS cohort_refs_with_packet,
           count(*)::int AS packet_rows,
           count(*) FILTER (WHERE packet_key IS NULL OR packet_key = '')::int AS missing_packet_key,
           count(DISTINCT packet_key)::int AS distinct_packet_keys,
           count(*) FILTER (WHERE summary IS NOT NULL AND btrim(summary) <> '')::int AS with_summary,
           count(*) FILTER (WHERE source_revision IS NOT NULL)::int AS with_source_revision,
           count(*) FILTER (WHERE lower(source_revision) = rev)::int AS source_revision_equals_admitted,
           count(*) FILTER (WHERE source_revision IS NOT NULL AND lower(source_revision) <> rev)::int AS source_revision_conflict,
           count(*) FILTER (WHERE summary IS NOT NULL AND btrim(summary) <> '' AND source_revision IS NULL)::int AS summary_without_revision,
           count(*) FILTER (WHERE domain_class IS NOT NULL OR primary_domain IS NOT NULL)::int AS with_domain,
           count(*) FILTER (WHERE community_id IS NOT NULL)::int AS with_community,
           count(*) FILTER (WHERE kmeans_cluster IS NOT NULL OR kmeans_cluster_id IS NOT NULL)::int AS with_kmeans,
           count(*) FILTER (WHERE som_cell_x IS NOT NULL AND som_cell_y IS NOT NULL)::int AS with_som_cell,
           count(*) FILTER (WHERE embedding IS NOT NULL)::int AS with_embedding,
           count(*) FILTER (WHERE pagerank_raw IS NOT NULL OR pagerank_score IS NOT NULL)::int AS with_pagerank
    FROM p`, args)).rows[0];

  // codebase_chunk_index side, exact source_ref
  out.codebaseChunks = (await client.query(`${cohortCte},
    c AS (SELECT m.source_ref AS cohort_ref, m.rev, m.chash, cc.* FROM m JOIN public.codebase_chunk_index cc ON cc.source_ref = m.source_ref)
    SELECT count(DISTINCT cohort_ref)::int AS cohort_refs_with_chunks,
           count(*)::int AS chunk_rows,
           count(*) FILTER (WHERE summary IS NOT NULL AND btrim(summary) <> '')::int AS with_summary,
           count(*) FILTER (WHERE content_embedding IS NOT NULL)::int AS with_semantic_768,
           count(*) FILTER (WHERE latent_256 IS NOT NULL)::int AS with_latent_256,
           count(*) FILTER (WHERE source_revision IS NOT NULL)::int AS with_source_revision,
           count(*) FILTER (WHERE lower(source_revision) = rev)::int AS source_revision_equals_admitted,
           count(*) FILTER (WHERE source_revision IS NOT NULL AND lower(source_revision) <> rev)::int AS source_revision_conflict,
           count(*) FILTER (WHERE workspace_revision = $2)::int AS workspace_revision_equals_scope,
           count(*) FILTER (WHERE summary IS NOT NULL AND btrim(summary) <> '' AND source_revision IS NULL)::int AS summary_without_revision,
           count(*) FILTER (WHERE domain IS NOT NULL)::int AS with_domain,
           count(*) FILTER (WHERE kmeans_cluster IS NOT NULL)::int AS with_kmeans,
           count(*) FILTER (WHERE som_bmu_row IS NOT NULL AND som_bmu_col IS NOT NULL)::int AS with_som_bmu,
           count(*) FILTER (WHERE ast_facts_at IS NOT NULL)::int AS with_ast_facts
    FROM c`, args)).rows[0];

  // Sample shapes so a zero-join is diagnosable without fuzzy matching
  out.sampleRefs = {
    cohort: (await client.query(`${cohortCte} SELECT source_ref FROM m ORDER BY source_ref LIMIT 3`, args)).rows.map((r) => r.source_ref),
    atlasPackets: (await client.query(`SELECT source_ref FROM public.atlas_packets WHERE source_ref IS NOT NULL ORDER BY source_ref LIMIT 3`)).rows.map((r) => r.source_ref),
    codebaseChunks: (await client.query(`SELECT source_ref FROM public.codebase_chunk_index WHERE source_ref IS NOT NULL ORDER BY source_ref LIMIT 3`)).rows.map((r) => r.source_ref),
  };
  await client.query('ROLLBACK');
} catch (error) {
  try { await client.query('ROLLBACK'); } catch { /* already closed */ }
  throw error;
} finally {
  client.release();
  await pool.end();
}

const report = {
  schema: 'atlas.current-packet-summary-enrichment-census.v1', mode: 'READ_ONLY', writesPerformed: false,
  scope: { workspaceRevision, executionId },
  joinBasis: 'BYTE_EXACT_source_ref_ONLY_NOT_CANONICAL_IDENTITY', normalizationUsed: false, pathFallbackUsed: false,
  ...out,
  rules: ['summary present != revision-qualified', 'embedding present != canonical identity', 'AST absent != indexing failure', 'cluster present != identity'],
  generatedAt: new Date().toISOString(),
};
const outPath = path.join(REPO_ROOT, 'docs/reports/current-packet-summary-enrichment-census-v1.json');
fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
