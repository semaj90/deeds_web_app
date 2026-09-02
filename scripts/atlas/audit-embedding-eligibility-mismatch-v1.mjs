#!/usr/bin/env node
/**
 * Read-only follow-up for the QDRANT-POINT-MISSING population.
 * Characterizes rows with a stored semantic vector while embedding_eligible=false.
 * It does not change eligibility, embeddings, PostgreSQL, or Qdrant.
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const root = process.cwd();
const missingReport = JSON.parse(fs.readFileSync(path.resolve(root, 'docs/reports/qdrant-point-missing-population-01-v1.json'), 'utf8'));
const dry = JSON.parse(fs.readFileSync(path.resolve(root, 'docs/reports/bridge-recon-dry-04-v1.json'), 'utf8'));
const missingIds = dry.classifications
  .filter((row) => row.classification === 'QDRANT_POINT_MISSING')
  .map((row) => row.canonicalChunkRowId);
const reportPath = path.resolve(root, 'docs/reports/embedding-eligibility-mismatch-v1.json');
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1 });

const { rows } = await pool.query(`
  SELECT id::text AS id, relative_path, source_ref, content_hash,
         embedding_eligible, embedding_model, embedding_version,
         embedding_dimension, embedding_normalized, embedding_dtype,
         encoder_id, embedding_created_at, indexed_at, enriched_at, updated_at,
         vector_dims(content_embedding::vector) AS content_embedding_dimensions,
         content_embedding IS NOT NULL AS has_content_embedding,
         content_embedding_768 IS NOT NULL AS has_content_embedding_768
    FROM public.codebase_chunk_index
   WHERE id = ANY($1::uuid[])
     AND embedding_eligible = false
     AND content_embedding IS NOT NULL
   ORDER BY relative_path, id`, [missingIds]);
await pool.end();

const byModel = new Map();
const byRelativePath = new Map();
for (const row of rows) {
  const key = `${row.embedding_model ?? 'NULL'}|${row.embedding_version ?? 'NULL'}|${row.embedding_dimension ?? 'NULL'}|${row.content_embedding_dimensions ?? 'NULL'}`;
  byModel.set(key, (byModel.get(key) ?? 0) + 1);
  const pathKey = row.relative_path ?? 'NULL';
  byRelativePath.set(pathKey, (byRelativePath.get(pathKey) ?? 0) + 1);
}

const report = {
  schema: 'atlas.embedding-eligibility-mismatch.v1',
  task: 'PKT-LINEAGE-14',
  mode: 'READ_ONLY',
  inputMissingPopulation: missingReport.missingRowCount,
  mismatchCount: rows.length,
  nonMismatchMissingCount: missingReport.missingRowCount - rows.length,
  identityReadiness: {
    missingSourceRefCount: rows.filter((row) => row.source_ref == null).length,
    distinctRelativePathCount: byRelativePath.size,
    repeatedRelativePathGroups: [...byRelativePath.entries()]
      .filter(([, count]) => count > 1)
      .map(([relativePath, count]) => ({ relativePath, count })),
  },
  mismatchRows: rows,
  groupedByEmbeddingMetadata: [...byModel.entries()].map(([key, count]) => ({ key, count })),
  producerTrace: {
    currentGuardedWriter: 'scripts/atlas/backfill-graphify-file-embeddings-768.mjs',
    currentWriterPredicate: 'content_embedding IS NULL AND embedding_eligible = true',
    historicalWriterEvidence: [{
      path: 'scripts/atlas/backfill-graphify-file-embeddings-768.mjs',
      commit: 'ee807652571',
      originalPredicate: 'content_embedding IS NULL AND updated_at >= NOW() - interval',
      omittedGuard: 'embedding_eligible = true',
    }],
    conclusion: 'HISTORICAL_WRITER_OMITTED_ELIGIBILITY_GUARD',
  },
  verdict: rows.length > 0
    ? 'ELIGIBILITY_VECTOR_STATE_MISMATCH_REQUIRES_POLICY_AUDIT'
    : 'NO_VECTOR_ELIGIBILITY_MISMATCH_FOUND',
  mutationPolicy: {
    eligibilityUpdates: false,
    embeddingUpdates: false,
    qdrantWrites: false,
    databaseWrites: false,
    canonicalAuthority: false,
  },
  nextAction: rows.length > 0
    ? 'Trace the writer and eligibility-policy decision that produced these rows; do not backfill or project them from this receipt.'
    : 'No mismatch writer audit required for this population.',
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ verdict: report.verdict, mismatchCount: report.mismatchCount, reportPath }, null, 2));
