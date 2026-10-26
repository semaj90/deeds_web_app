#!/usr/bin/env node
/**
 * scripts/atlas/plan-candidate-lineage-backfill-v1.mjs
 *
 * Prepares and audits the candidate cohort cryptographic lineage backfill plan:
 * Joins codebase_chunk_index.file_content_hash to graphify_files.content_hash
 * to populate:
 * - source_revision
 * - workspace_revision
 * - representation_revision (when content_embedding_768 IS NOT NULL)
 * - lineage_producer_revision
 * - lineage_binding_checksum
 *
 * Safety & Invariants:
 * - BEGIN READ ONLY mode.
 * - Zero database writes (writesPerformed: false, canonicalAuthority: false).
 * - Safe operator review gate: PLAN_PROVEN_READY_FOR_OPERATOR_REVIEW.
 * - Writes receipt to docs/reports/candidate-lineage-backfill-plan-v1.json.
 */

import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPORT_PATH = resolve(ROOT, 'docs', 'reports', 'candidate-lineage-backfill-plan-v1.json');

async function main() {
  console.log('\n═══ Parent Atlas Candidate Lineage Backfill Plan (v1) ═══\n');

  const env = loadRepoEnv();
  const dbUrl = resolveDatabaseUrl(env);
  const pool = new pg.Pool({ connectionString: dbUrl, max: 1 });
  const client = await pool.connect();

  const report = {
    schema: 'atlas.candidate-lineage-backfill-plan.v1',
    generatedAt: new Date().toISOString(),
    readOnly: true,
    writesPerformed: false,
    canonicalAuthority: false,
    diagnosticOnly: true,
    status: 'INITIALIZING',
    metrics: {},
    cohortSamples: [],
    proposedSqlPlan: {},
    rollbackRecipe: {},
    nextGate: 'OPERATOR_REVIEW',
  };

  try {
    await client.query('BEGIN READ ONLY');
    await client.query("SET LOCAL statement_timeout = '60s'");

    // 1. Total chunk index metrics
    const totalChunksRes = await client.query('SELECT count(*)::int AS count FROM codebase_chunk_index');
    const totalChunks = totalChunksRes.rows[0].count;

    const unpopulatedRevisionsRes = await client.query(
      'SELECT count(*)::int AS count FROM codebase_chunk_index WHERE source_revision IS NULL'
    );
    const unpopulatedRevisions = unpopulatedRevisionsRes.rows[0].count;

    // 2. Cryptographic join metrics with graphify_files
    const joinRes = await client.query(`
      SELECT 
        count(DISTINCT c.source_ref)::int AS matched_files,
        count(c.id)::int AS matched_chunks,
        count(CASE WHEN c.content_embedding_768 IS NOT NULL THEN 1 END)::int AS chunks_with_embedding,
        count(CASE WHEN c.content_embedding_768 IS NULL THEN 1 END)::int AS chunks_without_embedding
      FROM codebase_chunk_index c
      JOIN graphify_files g ON c.file_content_hash = g.content_hash
      WHERE c.file_content_hash IS NOT NULL
    `);
    const joinMetrics = joinRes.rows[0];

    // 3. Inspect unique workspace revisions from graphify_files
    const wsRes = await client.query(`
      SELECT g.workspace_revision, count(*)::int AS file_count
      FROM graphify_files g
      GROUP BY g.workspace_revision
      ORDER BY file_count DESC
    `);
    const workspaceRevisions = wsRes.rows;

    // 4. Sample diverse candidate records from the join
    const sampleRes = await client.query(`
      SELECT 
        c.id::text AS chunk_id,
        c.source_ref,
        c.file_content_hash,
        g.source_revision AS proposed_source_revision,
        g.workspace_revision AS proposed_workspace_revision,
        (c.content_embedding_768 IS NOT NULL) AS has_canonical_embedding,
        CASE 
          WHEN c.content_embedding_768 IS NOT NULL THEN 'semantic_768:canonical:v1'
          ELSE NULL
        END AS proposed_representation_revision
      FROM codebase_chunk_index c
      JOIN graphify_files g ON c.file_content_hash = g.content_hash
      WHERE c.file_content_hash IS NOT NULL
      ORDER BY c.id
      LIMIT 10
    `);

    const cohortSamples = sampleRes.rows.map((row) => ({
      chunkId: row.chunk_id,
      sourceRef: row.source_ref,
      fileContentHash: row.file_content_hash,
      proposedSourceRevision: row.proposed_source_revision,
      proposedWorkspaceRevision: row.proposed_workspace_revision,
      proposedRepresentationRevision: row.proposed_representation_revision,
      hasCanonicalEmbedding: row.has_canonical_embedding,
    }));

    await client.query('COMMIT');

    report.metrics = {
      totalCodebaseChunks: totalChunks,
      unpopulatedSourceRevisions: unpopulatedRevisions,
      matchedFilesCount: joinMetrics.matched_files,
      matchedChunksCount: joinMetrics.matched_chunks,
      matchedChunksWith768Embedding: joinMetrics.chunks_with_embedding,
      matchedChunksWithout768Embedding: joinMetrics.chunks_without_embedding,
      workspaceRevisions,
    };

    report.cohortSamples = cohortSamples;

    report.proposedSqlPlan = {
      strategy: 'BATCHED_TEMPORARY_STAGING_JOIN',
      batchSize: 25000,
      producerRevision: 'producer:graphify-lineage-join:v1',
      sqlTemplate: `
UPDATE codebase_chunk_index c
SET 
  source_revision = g.source_revision,
  workspace_revision = g.workspace_revision,
  representation_revision = CASE WHEN c.content_embedding_768 IS NOT NULL THEN 'semantic_768:canonical:v1' ELSE NULL END,
  lineage_producer_revision = 'producer:graphify-lineage-join:v1',
  lineage_binding_checksum = encode(sha256(concat_ws(':', c.source_ref, c.file_content_hash, g.source_revision, g.workspace_revision)::bytea), 'hex')
FROM graphify_files g
WHERE c.file_content_hash = g.content_hash
  AND c.source_revision IS NULL;
      `.trim(),
    };

    report.rollbackRecipe = {
      command: `
UPDATE codebase_chunk_index
SET 
  source_revision = NULL,
  workspace_revision = NULL,
  representation_revision = NULL,
  lineage_producer_revision = NULL,
  lineage_binding_checksum = NULL
WHERE lineage_producer_revision = 'producer:graphify-lineage-join:v1';
      `.trim(),
      verification: 'SELECT count(*) FROM codebase_chunk_index WHERE lineage_producer_revision = \'producer:graphify-lineage-join:v1\'; -- Expected: 0',
    };

    report.status = 'PLAN_PROVEN_READY_FOR_OPERATOR_REVIEW';

    console.log(`✅ Total Chunks in DB:              ${totalChunks}`);
    console.log(`✅ Unpopulated Source Revisions:     ${unpopulatedRevisions}`);
    console.log(`✅ Matched Files in Join:           ${joinMetrics.matched_files}`);
    console.log(`✅ Matched Chunks in Join:          ${joinMetrics.matched_chunks}`);
    console.log(`✅ Chunks with 768 Dense Vector:    ${joinMetrics.chunks_with_embedding}`);
    console.log(`✅ Chunks without Dense Vector:     ${joinMetrics.chunks_without_embedding}`);
    console.log(`\nSample Candidate (1 of ${cohortSamples.length}):`);
    console.log(`  Source Ref:             ${cohortSamples[0]?.sourceRef}`);
    console.log(`  File Hash:              ${cohortSamples[0]?.fileContentHash}`);
    console.log(`  Proposed Source Rev:    ${cohortSamples[0]?.proposedSourceRevision}`);
    console.log(`  Proposed Workspace Rev: ${cohortSamples[0]?.proposedWorkspaceRevision}`);
    console.log(`  Proposed Rep Rev:       ${cohortSamples[0]?.proposedRepresentationRevision}`);
    console.log('\nStatus: PLAN_PROVEN_READY_FOR_OPERATOR_REVIEW');
  } catch (err) {
    report.status = 'FAILED';
    report.error = err.message;
    console.error('❌ Lineage backfill planning failed:', err);
  } finally {
    client.release();
    await pool.end();
  }

  writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');
  console.log(`\nReceipt persisted: ${REPORT_PATH}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
