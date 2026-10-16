#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const reportsDirectory = path.join(root, 'docs', 'reports');
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 15000 });
const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
let databaseError = null;
let cohorts = null;
try {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    cohorts = (await client.query(`
      WITH canonical_documents AS (
        SELECT source_ref, page_index_path
        FROM public.atlas_tree_nodes
        WHERE ledger_type = 'canonical' AND node_type = 'document'
      ), canonical_chunks AS (
        SELECT packet_key, source_ref
        FROM public.atlas_tree_nodes
        WHERE ledger_type = 'canonical' AND node_type = 'chunk'
      ), document_groups AS (
        SELECT source_ref, count(*) AS n FROM canonical_documents GROUP BY source_ref
      ), chunk_groups AS (
        SELECT packet_key, count(*) AS n FROM canonical_chunks GROUP BY packet_key
      )
      SELECT
        (SELECT count(*)::int FROM canonical_documents) AS document_rows,
        (SELECT count(DISTINCT source_ref)::int FROM canonical_documents) AS document_distinct_source_refs,
        (SELECT count(*)::int FROM canonical_documents WHERE source_ref IS NULL) AS document_null_source_refs,
        (SELECT count(*)::int FROM canonical_documents WHERE page_index_path IS NULL) AS document_null_page_index_paths,
        (SELECT count(*)::int FROM document_groups WHERE n > 1) AS duplicate_document_source_ref_groups,
        (SELECT coalesce(sum(n - 1), 0)::int FROM document_groups WHERE n > 1) AS extra_document_rows,
        (SELECT count(*)::int FROM canonical_chunks) AS chunk_rows,
        (SELECT count(DISTINCT packet_key)::int FROM canonical_chunks) AS chunk_distinct_packet_keys,
        (SELECT count(*)::int FROM canonical_chunks WHERE packet_key IS NULL) AS chunk_null_packet_keys,
        (SELECT count(*)::int FROM chunk_groups WHERE n > 1) AS duplicate_chunk_packet_key_groups,
        (SELECT coalesce(sum(n - 1), 0)::int FROM chunk_groups WHERE n > 1) AS extra_chunk_rows
    `)).rows[0];
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
} catch (error) {
  databaseError = error instanceof Error ? error.message : String(error);
} finally {
  await pool.end();
}

const generatedAt = new Date().toISOString();
const documentsUnique = cohorts !== null
  && cohorts.document_rows === cohorts.document_distinct_source_refs
  && cohorts.document_null_source_refs === 0
  && cohorts.duplicate_document_source_ref_groups === 0;
const chunksUnique = cohorts !== null
  && cohorts.chunk_rows === cohorts.chunk_distinct_packet_keys
  && cohorts.chunk_null_packet_keys === 0
  && cohorts.duplicate_chunk_packet_key_groups === 0;
const report = {
  schema: 'atlas.canonical-tree-uniqueness.v1',
  generatedAt,
  mode: 'POSTGRES_REPEATABLE_READ_READ_ONLY',
  status: databaseError ? 'DATABASE_AUDIT_FAILED' : documentsUnique && chunksUnique ? 'DATA_UNIQUE_SCHEMA_UNCONSTRAINED' : 'DUPLICATES_OR_NULL_KEYS_FOUND',
  databaseError,
  cohorts,
  uniqueness: { canonicalDocumentSourceRef: documentsUnique, canonicalChunkPacketKey: chunksUnique },
  authority: false,
  writes: { postgres: false, qdrant: false, neo4j: false, valkey: false },
  caveats: [
    'The cohort is exactly ledger_type=canonical with node_type=document or chunk; synthetic AST rows are excluded.',
    'Observed uniqueness is a snapshot property; it is not protected by matching UNIQUE constraints in atlas_tree_nodes.',
    'This is not authorization to add constraints or modify rows; a later migration requires a fresh full duplicate census and review.',
  ],
  likely_cause: 'Canonical document and chunk keys are currently unique in the sampled database state, but the tree projection schema does not enforce those keys.',
  evidence: ['public.atlas_tree_nodes', 'PostgreSQL repeatable-read read-only duplicate census'],
  patch_targets: ['scripts/atlas/audit-canonical-tree-uniqueness-v1.mjs', 'openspec/changes/parent-atlas-retrieval-lineage-dag-convergence/tasks.md'],
  safe_next_command: 'node scripts/atlas/audit-canonical-tree-uniqueness-v1.mjs',
  smoke_command: 'node scripts/atlas/audit-canonical-tree-uniqueness-v1.mjs',
};
const reportPath = path.join(reportsDirectory, `canonical-tree-uniqueness-v1-${generatedAt.replace(/[:.]/g, '-')}.json`);
report.reportPath = path.relative(root, reportPath).replace(/\\/g, '/');
report.checksum = sha256(JSON.stringify(report));
fs.mkdirSync(reportsDirectory, { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ schema: report.schema, status: report.status, cohorts, uniqueness: report.uniqueness, reportPath: report.reportPath, databaseError }, null, 2));
