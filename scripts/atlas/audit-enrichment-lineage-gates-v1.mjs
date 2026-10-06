#!/usr/bin/env node

import fs from 'node:fs';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const arg = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
};

const workspaceRevision = arg('--workspace-revision');
const executionId = arg('--execution-id');
const outputPath = arg('--output');

if (!/^sha256:[0-9a-f]{64}$/.test(workspaceRevision ?? '')) {
  throw new Error('EXPLICIT_WORKSPACE_REVISION_REQUIRED');
}
if (!/^[0-9a-f-]{36}$/i.test(executionId ?? '')) {
  throw new Error('EXPLICIT_EXECUTION_ID_REQUIRED');
}

const cohortCte = `WITH cohort AS (
  SELECT DISTINCT source_ref, lower(code_source_revision) AS source_revision,
    lower(content_hash) AS content_hash
  FROM public.graphify_execution_file_membership_v2
  WHERE execution_id = $1::uuid
    AND workspace_revision::text = $2
    AND repository_id = 'repo:root'
)`;
const params = [executionId, workspaceRevision];
const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)),
  max: 1,
  connectionTimeoutMillis: 5000,
  statement_timeout: 120000,
});
const client = await pool.connect();
const report = {
  schema: 'atlas.enrichment-lineage-gates.v1',
  mode: 'READ_ONLY',
  writesPerformed: false,
  scope: { workspaceRevision, executionId },
  authority: 'DIAGNOSTIC_ONLY',
  joinPolicy: 'EXACT_SOURCE_REVISION_AND_PACKET_KEY_WHERE_AVAILABLE',
};

async function one(name, sql) {
  const result = await client.query(`${cohortCte} ${sql}`, params);
  report[name] = result.rows[0] ?? {};
}

function coverageGate(matched, expected) {
  const observed = Number(matched ?? 0);
  const required = Number(expected ?? 0);
  const status = required === 0 ? 'NO_EXPECTED_ROWS'
    : observed === required ? 'PASS'
      : observed > 0 ? 'PARTIAL' : 'BLOCKED';
  return { status, observed, required };
}

try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');

  await one('cohort', `SELECT count(*)::int AS source_rows,
    count(DISTINCT source_ref)::int AS distinct_source_refs,
    count(*) FILTER (WHERE source_revision IS NOT NULL AND source_revision <> '')::int AS revision_qualified_sources,
    count(*) FILTER (WHERE content_hash IS NOT NULL AND content_hash <> '')::int AS content_hashed_sources
    FROM cohort`);

  await one('semanticRepresentation', `SELECT representation_id, upstream_model_id, upstream_revision,
    artifact_digest, native_dimensions, output_dimensions, dimension_method, normalization,
    lifecycle_status, verification_status
    FROM public.atlas_representations WHERE representation_id = 'semantic_768'`);

  await one('packets', `, matched AS (
    SELECT c.source_ref AS cohort_source_ref, c.source_revision AS admitted_source_revision,
      p.packet_key, p.source_revision, p.workspace_revision_key, p.canonical
    FROM cohort c JOIN public.atlas_packets p ON p.source_ref = c.source_ref
  ) SELECT count(*)::int AS rows,
    count(DISTINCT cohort_source_ref)::int AS sources_with_packet,
    count(DISTINCT packet_key)::int AS distinct_packet_keys,
    count(*) FILTER (WHERE source_revision IS NOT NULL AND lower(source_revision) = admitted_source_revision)::int AS exact_source_revision_rows,
    count(*) FILTER (WHERE workspace_revision_key = $2)::int AS exact_workspace_revision_rows,
    count(*) FILTER (WHERE source_revision IS NOT NULL AND lower(source_revision) = admitted_source_revision AND workspace_revision_key = $2)::int AS exact_source_and_workspace_rows,
    count(*) FILTER (WHERE canonical IS TRUE)::int AS canonical_flag_rows
    FROM matched`);

  await one('treeNodes', `, matched AS (
    SELECT n.node_id, n.packet_key, n.node_type, n.ledger_type, p.source_ref,
      p.source_revision, p.workspace_revision_key
    FROM cohort c JOIN public.atlas_packets p ON p.source_ref = c.source_ref
      AND lower(p.source_revision) = c.source_revision AND p.workspace_revision_key = $2
    JOIN public.atlas_tree_nodes n ON n.packet_key = p.packet_key
  ) SELECT count(*)::int AS rows,
    count(DISTINCT packet_key)::int AS packet_keys_with_tree_nodes,
    count(*) FILTER (WHERE ledger_type = 'canonical')::int AS canonical_ledger_rows,
    count(*) FILTER (WHERE node_type = 'chunk')::int AS chunk_nodes,
    count(*) FILTER (WHERE node_type = 'document')::int AS document_nodes,
    count(*) FILTER (WHERE source_revision IS NOT NULL AND workspace_revision_key = $2)::int AS lineage_inherited_from_exact_packet
    FROM matched`);

  await one('workspaceSourceBindings', `, matched AS (
    SELECT c.source_ref, c.source_revision AS admitted_source_revision, c.content_hash AS admitted_content_hash,
      b.source_revision, b.content_digest, b.binding_checksum, b.producer_revision
    FROM cohort c JOIN public.atlas_workspace_source_bindings b
      ON lower(regexp_replace(regexp_replace(btrim(b.canonical_source_ref), '\\\\', '/', 'g'), '^\\./', ''))
       = lower(regexp_replace(regexp_replace(btrim(c.source_ref), '\\\\', '/', 'g'), '^\\./', ''))
      AND b.workspace_revision = $2
  ) SELECT count(*)::int AS candidate_binding_rows,
    count(DISTINCT source_ref)::int AS sources_with_binding,
    count(*) FILTER (WHERE lower(source_revision) = admitted_source_revision
      AND lower(content_digest) = admitted_content_hash
      AND binding_checksum IS NOT NULL AND producer_revision IS NOT NULL)::int AS exact_revision_digest_provenance_rows,
    count(*) FILTER (WHERE lower(source_revision) <> admitted_source_revision
      OR lower(content_digest) <> admitted_content_hash)::int AS revision_or_digest_conflicts
    FROM matched`);

  await one('astNodes', `, matched AS (
    SELECT a.tree_node_id, a.source_revision, a.source_content_hash, a.source_ref_key,
      c.source_ref AS cohort_source_ref, c.source_revision AS admitted_source_revision
    FROM cohort c JOIN public.atlas_ast_nodes a
      ON lower(regexp_replace(regexp_replace(btrim(a.relative_path), '\\\\', '/', 'g'), '^\\./', ''))
       = lower(regexp_replace(regexp_replace(btrim(c.source_ref), '\\\\', '/', 'g'), '^\\./', ''))
  ) SELECT count(*)::int AS path_join_rows,
    count(*) FILTER (WHERE source_revision IS NOT NULL AND lower(source_revision) = admitted_source_revision)::int AS exact_source_revision_rows,
    count(*) FILTER (WHERE source_content_hash IS NOT NULL AND source_content_hash <> '')::int AS content_hashed_rows,
    count(DISTINCT tree_node_id)::int AS distinct_tree_node_ids,
    count(*) FILTER (WHERE source_revision IS NULL OR lower(source_revision) <> admitted_source_revision)::int AS revision_mismatch_or_missing_rows,
    'relative_path + exact source_revision; source_ref_key is symbol-qualified, not a file key'::text AS join_semantics
    FROM matched`);

  await one('featureRows', `, packets AS (
    SELECT c.source_ref, c.source_revision, p.packet_key
    FROM cohort c JOIN public.atlas_packets p ON p.source_ref = c.source_ref
      AND lower(p.source_revision) = c.source_revision AND p.workspace_revision_key = $2
  ), matched AS (
    SELECT f.* FROM packets p JOIN public.atlas_observation_feature_rows f
      ON f.packet_key = p.packet_key AND f.source_ref = p.source_ref
  ) SELECT count(*)::int AS rows,
    count(*) FILTER (WHERE workspace_revision = $2)::int AS exact_workspace_revision_rows,
    count(*) FILTER (WHERE representation_id = 'semantic_768' AND representation_revision IS NOT NULL AND btrim(representation_revision) <> '')::int AS semantic_768_revision_bound_rows,
    count(*) FILTER (WHERE tree_node_id IS NOT NULL)::int AS tree_node_bound_rows,
    count(*) FILTER (WHERE cardinality(evidence_refs) > 0)::int AS evidence_linked_rows,
    count(*) FILTER (WHERE kmeans_cluster_id IS NOT NULL)::int AS kmeans_cluster_rows,
    count(*) FILTER (WHERE som_row IS NOT NULL AND som_col IS NOT NULL)::int AS som_coordinate_rows,
    count(*) FILTER (WHERE cardinality(ontology_classes) > 0)::int AS ontology_class_rows,
    count(*) FILTER (WHERE cardinality(langextract_classes) > 0)::int AS langextract_class_rows
    FROM matched`);

  await one('analysisPassResults', `, packets AS (
    SELECT c.source_ref, c.source_revision, p.packet_key
    FROM cohort c JOIN public.atlas_packets p ON p.source_ref = c.source_ref
      AND lower(p.source_revision) = c.source_revision AND p.workspace_revision_key = $2
  ), matched AS (
    SELECT r.* FROM packets p JOIN public.analysis_pass_results r
      ON r.packet_key = p.packet_key AND r.source_revision = p.source_revision
  ) SELECT count(*)::int AS rows,
    count(*) FILTER (WHERE pass_revision IS NOT NULL AND btrim(pass_revision) <> '')::int AS pass_revision_bound_rows,
    count(*) FILTER (WHERE pass_identity_hash IS NOT NULL AND btrim(pass_identity_hash) <> '')::int AS identity_hash_rows,
    count(*) FILTER (WHERE lower(status) IN ('succeeded', 'success', 'complete', 'completed'))::int AS succeeded_rows,
    count(DISTINCT pass_type)::int AS pass_types,
    (SELECT coalesce(jsonb_object_agg(status, row_count), '{}'::jsonb)
      FROM (SELECT status, count(*)::int AS row_count FROM matched GROUP BY status) status_counts) AS status_counts
    FROM matched`);

  await one('summaryLayers', `, packets AS (
    SELECT c.source_ref, c.source_revision, p.packet_key
    FROM cohort c JOIN public.atlas_packets p ON p.source_ref = c.source_ref
      AND lower(p.source_revision) = c.source_revision AND p.workspace_revision_key = $2
  ), matched AS (
    SELECT p.source_revision AS admitted_source_revision, p.source_ref AS admitted_source_ref, s.*
    FROM packets p JOIN public.atlas_summary_layers s
      ON s.packet_key = p.packet_key AND (s.source_ref IS NULL OR s.source_ref = p.source_ref)
  ) SELECT count(*)::int AS rows,
    count(*) FILTER (WHERE summary IS NOT NULL AND btrim(summary) <> '')::int AS populated_summaries,
    count(*) FILTER (WHERE metadata ? 'source_revision' AND metadata->>'source_revision' = admitted_source_revision)::int AS source_revision_metadata_matches,
    count(*) FILTER (WHERE metadata ? 'workspace_revision' AND metadata->>'workspace_revision' = $2)::int AS workspace_revision_metadata_matches,
    count(*) FILTER (WHERE metadata ? 'representation_revision' AND btrim(metadata->>'representation_revision') <> '')::int AS representation_revision_metadata_rows
    FROM matched`);

  await one('packetChunkLineage', `, packets AS (
    SELECT c.source_ref, c.source_revision, p.packet_key
    FROM cohort c JOIN public.atlas_packets p ON p.source_ref = c.source_ref
      AND lower(p.source_revision) = c.source_revision AND p.workspace_revision_key = $2
  ), matched AS (
    SELECT l.*, p.source_ref AS admitted_source_ref, p.source_revision AS admitted_source_revision,
      p.packet_key AS admitted_packet_key, c.id AS physical_chunk_row_id,
      c.chunk_id AS physical_chunk_id
    FROM cohort m JOIN public.atlas_packet_chunk_lineage l
      ON lower(regexp_replace(regexp_replace(btrim(l.source_ref), '\\\\', '/', 'g'), '^\\./', ''))
       = lower(regexp_replace(regexp_replace(btrim(m.source_ref), '\\\\', '/', 'g'), '^\\./', ''))
      AND lower(l.source_revision) = m.source_revision AND l.revision_status = 'PROVEN'
    JOIN packets p ON p.packet_key = l.packet_key AND p.source_ref = m.source_ref
      AND lower(p.source_revision) = m.source_revision
    LEFT JOIN public.codebase_chunk_index c ON c.id = l.chunk_row_id
  ) SELECT count(*)::int AS exact_lineage_rows,
    count(*) FILTER (WHERE physical_chunk_row_id IS NOT NULL)::int AS physical_chunk_rows,
    count(*) FILTER (WHERE physical_chunk_id IS NOT NULL AND canonical_chunk_id = physical_chunk_id)::int AS canonical_chunk_id_matches,
    count(*) FILTER (WHERE cardinality(evidence_refs) > 0)::int AS evidence_linked_rows,
    count(*) FILTER (WHERE lineage_producer_revision IS NOT NULL AND btrim(lineage_producer_revision) <> '')::int AS producer_revision_rows
    FROM matched`);

  await one('chunkIndex', `, packets AS (
    SELECT c.source_ref, c.source_revision, p.packet_key, p.workspace_revision_key
    FROM cohort c JOIN public.atlas_packets p ON p.source_ref = c.source_ref
      AND lower(p.source_revision) = c.source_revision AND p.workspace_revision_key = $2
  ), matched AS (
    SELECT i.*, l.source_revision AS lineage_source_revision,
      p.workspace_revision_key AS admitted_workspace_revision
    FROM packets p JOIN public.atlas_packet_chunk_lineage l
      ON l.packet_key = p.packet_key AND l.source_ref = p.source_ref
      AND lower(l.source_revision) = lower(p.source_revision) AND l.revision_status = 'PROVEN'
    JOIN public.codebase_chunk_index i ON i.id = l.chunk_row_id
      AND i.chunk_id = l.canonical_chunk_id
  ) SELECT count(*)::int AS bridged_chunk_rows,
    count(*) FILTER (WHERE workspace_revision = admitted_workspace_revision AND workspace_revision = $2)::int AS workspace_revision_matches,
    count(*) FILTER (WHERE source_revision IS NOT NULL AND btrim(source_revision) <> '')::int AS source_revision_rows,
    count(*) FILTER (WHERE source_revision = lineage_source_revision)::int AS exact_source_revision_matches,
    count(*) FILTER (WHERE representation_revision IS NOT NULL AND btrim(representation_revision) <> '')::int AS representation_revision_rows,
    count(*) FILTER (WHERE content_embedding_768 IS NOT NULL)::int AS semantic_768_vectors,
    count(*) FILTER (WHERE content_embedding_768 IS NOT NULL
      AND (representation_revision IS NULL OR btrim(representation_revision) = ''))::int AS semantic_vectors_without_representation_revision,
    count(*) FILTER (WHERE summary_text IS NOT NULL AND btrim(summary_text) <> '')::int AS summary_text_rows,
    count(*) FILTER (WHERE summary_provenance #>> '{admission,status}' = 'ADMITTED')::int AS admitted_summary_rows,
    count(*) FILTER (WHERE summary_provenance->>'sourceRevision' = lineage_source_revision
      AND summary_provenance->>'workspaceRevision' = admitted_workspace_revision)::int AS exact_summary_revision_provenance_rows
    FROM matched`);

  await client.query('ROLLBACK');
} catch (error) {
  try { await client.query('ROLLBACK'); } catch {}
  throw error;
} finally {
  client.release();
  await pool.end();
}

report.generatedAt = new Date().toISOString();
report.gates = {
  packetRevisionBinding: coverageGate(report.packets?.exact_source_and_workspace_rows, report.cohort?.source_rows),
  packetKeyBoundTreeNodes: coverageGate(report.treeNodes?.packet_keys_with_tree_nodes, report.packets?.exact_source_and_workspace_rows),
  astSourceRevision: coverageGate(report.astNodes?.exact_source_revision_rows, report.astNodes?.path_join_rows),
  workspaceSourceBinding: {
    ...coverageGate(report.workspaceSourceBindings?.exact_revision_digest_provenance_rows, report.cohort?.source_rows),
    conflicts: Number(report.workspaceSourceBindings?.revision_or_digest_conflicts ?? 0),
  },
  featureWorkspaceBinding: coverageGate(report.featureRows?.exact_workspace_revision_rows, report.featureRows?.rows),
  succeededRevisionQualifiedPassRecord: coverageGate(
    Math.min(Number(report.analysisPassResults?.succeeded_rows ?? 0), Number(report.analysisPassResults?.pass_revision_bound_rows ?? 0)),
    report.analysisPassResults?.rows,
  ),
  summaryRevisionMetadata: coverageGate(
    Math.min(Number(report.summaryLayers?.source_revision_metadata_matches ?? 0), Number(report.summaryLayers?.workspace_revision_metadata_matches ?? 0)),
    report.summaryLayers?.populated_summaries,
  ),
  chunkPacketLineage: {
    ...coverageGate(report.packetChunkLineage?.canonical_chunk_id_matches, report.packetChunkLineage?.exact_lineage_rows),
    evidenceLinkedRows: Number(report.packetChunkLineage?.evidence_linked_rows ?? 0),
    source: 'atlas_packet_chunk_lineage; measured rows only, not whole-cohort coverage',
  },
  canonicalSemanticRepresentation: {
    status: Number(report.chunkIndex?.semantic_768_vectors ?? 0) > 0
      && Number(report.chunkIndex?.exact_source_revision_matches ?? 0) > 0
      && Number(report.chunkIndex?.workspace_revision_matches ?? 0) > 0
      && Number(report.chunkIndex?.representation_revision_rows ?? 0) > 0
      && report.semanticRepresentation?.lifecycle_status === 'ADMITTED'
      && report.semanticRepresentation?.verification_status === 'VERIFIED'
      && report.semanticRepresentation?.upstream_model_id === 'google/embeddinggemma-300m'
      && typeof report.semanticRepresentation?.upstream_revision === 'string'
      && report.semanticRepresentation.upstream_revision.trim() !== ''
      && report.semanticRepresentation.upstream_revision !== 'unknown'
      && typeof report.semanticRepresentation?.artifact_digest === 'string'
      && report.semanticRepresentation.artifact_digest.trim() !== ''
      && report.semanticRepresentation.artifact_digest !== 'unknown' ? 'PASS' : 'BLOCKED',
    vectorRows: Number(report.chunkIndex?.semantic_768_vectors ?? 0),
    rowsMissingRepresentationRevision: Number(report.chunkIndex?.semantic_vectors_without_representation_revision ?? 0),
    registryLifecycle: report.semanticRepresentation?.lifecycle_status ?? 'MISSING',
    registryVerification: report.semanticRepresentation?.verification_status ?? 'MISSING',
  },
  persistenceAuthorized: { status: 'NO', writesPermitted: false },
  overall: 'DIAGNOSTIC_ONLY_NO_PERSISTENCE',
};

const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (outputPath) fs.writeFileSync(outputPath, serialized, { encoding: 'utf8', flag: 'wx' });
console.log(serialized);
