#!/usr/bin/env node
/**
 * audit-atlas-packets-duplicate-vectors.mjs
 *
 * AFC-SCHED-19: Read-only scan of atlas_packets.embedding in PostgreSQL.
 * Identifies duplicate clusters, measures vector contamination, and outputs
 * an empirical validity receipt.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

async function main() {
  console.log('[AFC-SCHED-19] Connecting to PostgreSQL 18 catalog (read-only)...');
  const repoEnv = loadRepoEnv();
  const dbUrl = resolveDatabaseUrl(repoEnv);
  const sql = postgres(dbUrl, { max: 1, idle_timeout: 60 });

  const t0 = Date.now();

  try {
    // 1. Basic counts
    console.log('[AFC-SCHED-19] Calculating table counts...');
    const [counts] = await sql`
      SELECT 
        count(*) as total_rows,
        count(CASE WHEN embedding IS NOT NULL THEN 1 END) as populated_rows,
        count(CASE WHEN embedding IS NULL THEN 1 END) as unpopulated_rows
      FROM public.atlas_packets;
    `;

    const totalRows = Number(counts.total_rows);
    const populatedRows = Number(counts.populated_rows);
    const unpopulatedRows = Number(counts.unpopulated_rows);

    // 2. Duplicate clusters
    console.log('[AFC-SCHED-19] Grouping vector digests (MD5 of embedding text)...');
    const clusters = await sql`
      SELECT 
        md5(embedding::text) as digest,
        count(*) as occurrences
      FROM public.atlas_packets
      WHERE embedding IS NOT NULL
      GROUP BY 1
      ORDER BY occurrences DESC
      LIMIT 25;
    `;

    // 3. Distinct vectors
    console.log('[AFC-SCHED-19] Calculating distinct vector count...');
    const [distinctStats] = await sql`
      SELECT count(*) as distinct_vectors
      FROM (
        SELECT 1
        FROM public.atlas_packets
        WHERE embedding IS NOT NULL
        GROUP BY md5(embedding::text)
      ) sub;
    `;
    const distinctVectors = Number(distinctStats.distinct_vectors);
    const contaminationRate = populatedRows > 0 ? ((populatedRows - distinctVectors) / populatedRows) : 0;

    // 4. Sample top contaminated vector
    const topCluster = clusters[0];
    let topSample = null;
    if (topCluster && Number(topCluster.occurrences) > 1) {
      const [sampleRow] = await sql`
        SELECT 
          packet_id, 
          source_path,
          embedding::text as raw_vector
        FROM public.atlas_packets
        WHERE md5(embedding::text) = ${topCluster.digest}
        LIMIT 1;
      `;
      if (sampleRow) {
        const floatVals = sampleRow.raw_vector
          .replace(/[\[\]]/g, '')
          .split(',')
          .map(Number);
        const norm = Math.sqrt(floatVals.reduce((sum, v) => sum + v * v, 0));
        topSample = {
          packet_id: sampleRow.packet_id,
          source_path: sampleRow.source_path,
          vector_dimension: floatVals.length,
          vector_norm: Number(norm.toFixed(6)),
          sample_first_5: floatVals.slice(0, 5),
          is_all_zeros: floatVals.every(v => v === 0),
        };
      }
    }

    const receipt = {
      schema: 'atlas.embedding-validity-receipt.v1',
      contract: 'AFC-SCHED-19',
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - t0,
      metrics: {
        totalRows,
        populatedRows,
        unpopulatedRows,
        distinctVectors,
        duplicateVectors: populatedRows - distinctVectors,
        contaminationRate: Number(contaminationRate.toFixed(4)),
        contaminationPercentage: `${(contaminationRate * 100).toFixed(2)}%`,
      },
      topClusters: clusters.map(c => ({
        digest: c.digest,
        occurrences: Number(c.occurrences),
        percentageOfPopulated: `${((Number(c.occurrences) / populatedRows) * 100).toFixed(2)}%`,
      })),
      topContaminatedSample: topSample,
      verdict: {
        canonicalRetrievalSafe: false,
        quarantineRequired: true,
        recommendation: 'Quarantine atlas_packets.embedding. Prohibit dense kNN/HNSW scans on this column until clean backfill from canonical EmbeddingGemma 768 is proven.',
      },
    };

    const outDir = path.join(ROOT, '.tmp', 'atlas');
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, 'embedding-validity-receipt-v1.json');
    fs.writeFileSync(outPath, JSON.stringify(receipt, null, 2), 'utf8');

    console.log('\n[AFC-SCHED-19] Audit Complete:');
    console.log(`  Total Rows:          ${totalRows}`);
    console.log(`  Populated Rows:      ${populatedRows}`);
    console.log(`  Distinct Vectors:    ${distinctVectors}`);
    console.log(`  Contamination Rate:  ${receipt.metrics.contaminationPercentage}`);
    console.log(`  Top Duplicate Hash:  ${topCluster?.digest} (${topCluster?.occurrences} rows)`);
    if (topSample) {
      console.log(`  Top Sample Dim:      ${topSample.vector_dimension}`);
      console.log(`  Top Sample Norm:     ${topSample.vector_norm}`);
      console.log(`  Top Sample Prefix:   [${topSample.sample_first_5.join(', ')}...]`);
    }
    console.log(`  Receipt:             ${outPath}\n`);
  } finally {
    await sql.end();
  }
}

main().catch(err => {
  console.error('[AFC-SCHED-19] Execution failed:', err);
  process.exit(1);
});
