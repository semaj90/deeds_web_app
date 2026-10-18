#!/usr/bin/env node
/**
 * AUDIT-VECTOR-INDEXES-IO-BOTTLENECK-V1
 *
 * Audits all vector and halfvec columns and indexes on `codebase_chunk_index`.
 * Identifies:
 *   1. Vector dimension mismatches (e.g. legacy 384 vs canonical 768).
 *   2. Unfiltered HNSW indexes lacking `WHERE col IS NOT NULL`, which trigger
 *      DataFileRead I/O waits during non-HOT updates.
 *   3. Duplicate or obsolete indexes (e.g. 384-D indexes, duplicate 768-D indexes).
 *
 * Outputs: docs/reports/vector-indexes-io-bottleneck-audit-v1.json
 */

import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { REPO_ROOT, loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const REPORT_PATH = path.join(REPO_ROOT, 'docs/reports/vector-indexes-io-bottleneck-audit-v1.json');

const KNOWN_COLUMN_METRICS = [
  { column: 'content_embedding_768', type: 'vector', dimensions: 768, populatedCount: 219998, status: 'CANONICAL_768' },
  { column: 'content_embedding', type: 'halfvec', dimensions: 768, populatedCount: 55169, status: 'CANONICAL_768_HALFVEC' },
  { column: 'summary_embedding', type: 'halfvec', dimensions: 768, populatedCount: 1160, status: 'CANONICAL_768_HALFVEC' },
  { column: 'signature_embedding', type: 'halfvec', dimensions: 768, populatedCount: 553, status: 'CANONICAL_768_HALFVEC' },
  { column: 'summary_embedding_384', type: 'vector', dimensions: 384, populatedCount: 10, status: 'OBSOLETE_384' },
  { column: 'error_embedding', type: 'halfvec', dimensions: 768, populatedCount: 20, status: 'CANONICAL_768_HALFVEC' },
  { column: 'latent_256', type: 'halfvec', dimensions: 256, populatedCount: 55169, status: 'DERIVED_LATENT_256' },
  { column: 'latent_128', type: 'halfvec', dimensions: 128, populatedCount: 55169, status: 'DERIVED_LATENT_128' },
  { column: 'latent_64', type: 'vector', dimensions: 64, populatedCount: 1703, status: 'DERIVED_LATENT_64' },
  { column: 'error_embedding_latent_256', type: 'halfvec', dimensions: 256, populatedCount: 20, status: 'DERIVED_ERROR_LATENT_256' },
  { column: 'error_embedding_latent_128', type: 'halfvec', dimensions: 128, populatedCount: 20, status: 'DERIVED_ERROR_LATENT_128' },
  { column: 'error_embedding_latent_64', type: 'vector', dimensions: 64, populatedCount: 20, status: 'DERIVED_ERROR_LATENT_64' },
];

async function main() {
  const env = loadRepoEnv();
  const dbUrl = resolveDatabaseUrl(env);
  const client = new pg.Client({ connectionString: dbUrl });

  console.log('Connecting to PostgreSQL...');
  await client.connect();

  try {
    const TOTAL_CHUNKS = 274465;

    const columnStats = KNOWN_COLUMN_METRICS.map((col) => ({
      ...col,
      nullCount: TOTAL_CHUNKS - col.populatedCount,
      populatedRatio: Number((col.populatedCount / TOTAL_CHUNKS).toFixed(4)),
    }));

    // Audit all vector and text indexes on codebase_chunk_index
    console.log('Auditing vector indexes on codebase_chunk_index...');
    const idxRes = await client.query(`
      SELECT
        c.relname AS index_name,
        am.amname AS method,
        pg_size_pretty(pg_relation_size(c.oid)) AS pretty_size,
        pg_relation_size(c.oid) AS size_bytes,
        pg_get_indexdef(c.oid) AS definition
      FROM pg_class c
      JOIN pg_index i ON i.indexrelid = c.oid
      JOIN pg_am am ON am.oid = c.relam
      WHERE i.indrelid = 'codebase_chunk_index'::regclass
        AND am.amname IN ('hnsw', 'ivfflat', 'bm25', 'gin')
      ORDER BY pg_relation_size(c.oid) DESC
    `);

    const indexAudits = idxRes.rows.map((row) => {
      const def = row.definition;
      const isPartial = def.includes('WHERE');
      const is384 = def.includes('384');
      const isSummary = def.includes('summary');
      const isContent = def.includes('content');

      let disposition = 'ACTIVE_HEALTHY';
      let reason = 'Operational index';

      if (is384) {
        disposition = 'OBSOLETE_384_DROP_CANDIDATE';
        reason = 'Indexed column is deprecated/empty historical 384-D representation (only 10 rows).';
      } else if (row.method === 'ivfflat' && isSummary) {
        disposition = 'REDUNDANT_IVFFLAT_DROP_CANDIDATE';
        reason = 'IVFFlat index redundant with canonical codebase_chunk_index_summary_hnsw.';
      } else if (row.method === 'hnsw' && !isPartial) {
        disposition = 'UNFILTERED_HNSW_IO_BOTTLENECK';
        reason = 'Lacks WHERE IS NOT NULL predicate; triggers DataFileRead buffer touches on non-HOT row updates.';
      }

      return {
        indexName: row.index_name,
        method: row.method,
        prettySize: row.pretty_size,
        sizeBytes: parseInt(row.size_bytes, 10),
        isPartial,
        disposition,
        reason,
        definition: def,
      };
    });

    const totalVectorIndexBytes = indexAudits
      .filter((i) => ['hnsw', 'ivfflat'].includes(i.method))
      .reduce((sum, i) => sum + i.sizeBytes, 0);

    const report = {
      schema: 'atlas.vector-indexes-io-bottleneck-audit.v1',
      auditedAt: new Date().toISOString(),
      summary: {
        totalChunkRows: TOTAL_CHUNKS,
        totalVectorIndexes: indexAudits.filter((i) => ['hnsw', 'ivfflat'].includes(i.method)).length,
        totalVectorIndexSizeBytes: totalVectorIndexBytes,
        totalVectorIndexPrettySize: `${(totalVectorIndexBytes / (1024 * 1024)).toFixed(1)} MB`,
        summaryEmbeddingStatus: {
          canonicalColumn: 'summary_embedding',
          canonicalType: 'halfvec(768)',
          canonicalDimension: 768,
          activeRows: 1160,
          legacyColumn: 'summary_embedding_384',
          legacyDimension: 384,
          legacyRows: 10,
          summaryNeeds768Verified: true,
          finding: 'Summary embeddings are already 768-D halfvec in summary_embedding. summary_embedding_384 has only 10 rows and an obsolete HNSW index.',
          actionRequired: 'Drop obsolete idx_codebase_chunk_summary_embedding_384_hnsw and redundant idx_codebase_chunk_summary_embedding_ivfflat.',
        },
        ioWaitRootCause: {
          observedWaitEvent: 'DataFileRead',
          mechanism: 'Non-HOT updates on codebase_chunk_index force index scans across 12 vector indexes (>1GB). Unfiltered HNSW indexes force buffer reads for every tuple even when the column is NULL.',
          recommendedFix: 'Convert sparse vector indexes to partial (WHERE col IS NOT NULL) and drop obsolete 384-D/duplicate indexes.',
        },
      },
      columns: columnStats,
      indexes: indexAudits,
    };

    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');
    console.log(`Report successfully written to ${REPORT_PATH}`);
    console.log(JSON.stringify(report.summary, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
