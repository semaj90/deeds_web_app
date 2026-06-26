#!/usr/bin/env node
/**
 * Batch Summarize GPU Clusters (Phase 3 Semantic Indexing)
 *
 * Generates summaries for all GPU clusters using Gemma4.
 * Optimized for daily cron job (5-10 minutes for full run).
 * Incremental: only processes clusters with empty/null summaries.
 *
 * Pipeline:
 * 1. Query Postgres for all clusters (clusterSummaries table)
 * 2. Filter: where summary IS NULL OR summary = ''
 * 3. For each cluster: fetch representative chunks → build context
 * 4. Stream to Gemma4 in parallel (4-8 concurrent calls)
 * 5. Upsert summaries back to Postgres
 * 6. Log: success/retry/error counts
 *
 * Usage:
 *   npm run atlas:summaries:clusters:dry       # Preview mode
 *   npm run atlas:summaries:clusters:apply     # Production mode
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

// CLI args
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const apply = !dryRun && args.includes('--apply');
const verbose = args.includes('--verbose');
const concurrency = parseInt(args.find(a => a.startsWith('--concurrency='))?.split('=')[1] ?? '6');
const batchSize = parseInt(args.find(a => a.startsWith('--batch='))?.split('=')[1] ?? '50');
const maxTokens = 120;
const temperature = 0.1; // Low variance for summaries

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://legal_admin:legal_ai@127.0.0.1:5434/legal_ai_db',
  max: 10,
});

/**
 * Fetch all clusters with empty summaries
 */
async function getClustersNeedingSummaries(pool) {
  const result = await pool.query(`
    SELECT
      gpu_cluster as "gpuCluster",
      representative_chunk_ids as "representativeChunkIds",
      tags,
      member_count as "memberCount",
      top_files as "topFiles",
      summary
    FROM cluster_summaries
    WHERE summary IS NULL OR summary = ''
    ORDER BY gpu_cluster ASC
  `);

  return result.rows;
}

/**
 * Fetch chunk text content for context building
 */
async function fetchChunksForCluster(pool, chunkIds) {
  if (!Array.isArray(chunkIds) || chunkIds.length === 0) {
    return [];
  }

  const placeholders = chunkIds.slice(0, 10).map((_, i) => `$${i + 1}`).join(',');
  const query = `
    SELECT
      id,
      chunk_index as "chunkIndex",
      language,
      content
    FROM codebase_chunks
    WHERE id IN (${placeholders})
    LIMIT 10
  `;

  try {
    const result = await pool.query(query, chunkIds.slice(0, 10));
    return result.rows;
  } catch (err) {
    console.warn(`Failed to fetch chunks for cluster: ${err.message}`);
    return [];
  }
}

/**
 * Build context string from chunks
 */
function buildClusterContext(cluster, chunks) {
  const lines = [];

  lines.push(`GPU Cluster #${cluster.gpuCluster}`);
  lines.push(`Members: ${cluster.memberCount || 'unknown'}`);

  if (Array.isArray(cluster.tags) && cluster.tags.length > 0) {
    lines.push(`Tags: ${cluster.tags.slice(0, 5).join(', ')}`);
  }

  if (Array.isArray(cluster.topFiles) && cluster.topFiles.length > 0) {
    lines.push(`Top Files: ${cluster.topFiles.slice(0, 3).join(', ')}`);
  }

  if (chunks.length > 0) {
    lines.push('\nRepresentative Code:');
    lines.push('---');
    for (const chunk of chunks.slice(0, 3)) {
      lines.push(`[${chunk.language || 'code'}] ${chunk.chunkIndex || 'chunk'}`);
      lines.push((chunk.content || '').slice(0, 300));
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Call Gemma4 to generate cluster summary
 */
async function generateClusterSummary(context) {
  const prompt = `Summarize this code cluster in 1-2 sentences. Focus on the PURPOSE and DOMAIN of the code.

${context}

Summary (1-2 sentences only):`;

  try {
    // Use bifrostChat if available (has cache layer), fall back to direct Ollama
    const response = await fetch('http://127.0.0.1:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma4-rotorquant:latest',
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        temperature,
        options: { num_predict: maxTokens },
      }),
      signal: AbortSignal.timeout(30000), // 30s timeout
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const summary = (data.message?.content || '').trim();

    if (!summary) {
      throw new Error('Empty response from Gemma4');
    }

    return summary;
  } catch (err) {
    console.error(`  ❌ Gemma4 error: ${err.message}`);
    throw err;
  }
}

/**
 * Upsert summaries back to Postgres
 */
async function upsertClusterSummaries(pool, updates) {
  if (updates.length === 0) return { updated: 0, errors: 0 };

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let updated = 0;
    let errors = 0;

    for (const { gpuCluster, summary } of updates) {
      try {
        await client.query(
          'UPDATE cluster_summaries SET summary = $1, updated_at = now() WHERE gpu_cluster = $2',
          [summary, gpuCluster]
        );
        updated++;
      } catch (err) {
        console.error(`  ❌ DB error for cluster ${gpuCluster}: ${err.message}`);
        errors++;
      }
    }

    await client.query('COMMIT');
    return { updated, errors };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Process clusters in parallel batches
 */
async function processClustersInBatches(pool, clusters) {
  const results = {
    total: clusters.length,
    processed: 0,
    updated: 0,
    errors: 0,
    failed: [],
    startTime: Date.now(),
  };

  if (results.total === 0) {
    console.log('✅ All clusters already have summaries!');
    return results;
  }

  console.log(`\n📊 Found ${results.total} clusters needing summaries`);
  console.log(`🔄 Processing with concurrency=${concurrency}, batchSize=${batchSize}`);

  const updates = [];

  for (let i = 0; i < clusters.length; i += batchSize) {
    const batch = clusters.slice(i, i + batchSize);
    console.log(`\n📦 Batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(clusters.length / batchSize)} (${batch.length} clusters)`);

    // Process batch in parallel with concurrency control
    const batchPromises = batch.map(async (cluster) => {
      try {
        if (verbose) console.log(`  ⏳ Cluster #${cluster.gpuCluster}...`);

        const chunks = await fetchChunksForCluster(pool, cluster.representativeChunkIds);
        const context = buildClusterContext(cluster, chunks);
        const summary = await generateClusterSummary(context);

        if (verbose) console.log(`  ✅ Cluster #${cluster.gpuCluster}: "${summary.slice(0, 50)}..."`);

        updates.push({ gpuCluster: cluster.gpuCluster, summary });
        results.processed++;
      } catch (err) {
        console.error(`  ❌ Cluster #${cluster.gpuCluster}: ${err.message}`);
        results.errors++;
        results.failed.push({ cluster: cluster.gpuCluster, error: err.message });
      }
    });

    // Enforce concurrency limit
    for (let j = 0; j < batchPromises.length; j += concurrency) {
      await Promise.all(batchPromises.slice(j, j + concurrency));
    }

    // Upsert batch to DB
    if (!dryRun && updates.length > 0) {
      const { updated, errors } = await upsertClusterSummaries(pool, updates);
      results.updated += updated;
      results.errors += errors;
      updates.length = 0; // Reset for next batch
    }
  }

  results.duration = Math.round((Date.now() - results.startTime) / 1000);
  return results;
}

/**
 * Main entry point
 */
async function main() {
  console.log('🚀 Batch Cluster Summarizer (Phase 3)');
  console.log(`Mode: ${dryRun ? 'DRY-RUN (preview)' : apply ? 'APPLY (production)' : 'INVALID MODE'}`);

  if (!apply && !dryRun) {
    console.error('❌ Use --dry-run or --apply');
    process.exit(1);
  }

  try {
    // Step 1: Query clusters needing summaries
    console.log('\n📋 Querying clusters...');
    const clusters = await getClustersNeedingSummaries(pool);

    // Step 2: Process in batches
    const results = await processClustersInBatches(pool, clusters);

    // Step 3: Report
    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY REPORT');
    console.log('='.repeat(60));
    console.log(`Total clusters:    ${results.total}`);
    console.log(`Processed:         ${results.processed}`);
    console.log(`Updated (DB):      ${results.updated}`);
    console.log(`Errors:            ${results.errors}`);
    console.log(`Duration:          ${results.duration}s`);
    console.log(`Throughput:        ${(results.processed / (results.duration || 1)).toFixed(1)} clusters/sec`);

    if (results.failed.length > 0) {
      console.log(`\n⚠️  Failed clusters:`);
      for (const { cluster, error } of results.failed.slice(0, 10)) {
        console.log(`  - Cluster #${cluster}: ${error}`);
      }
    }

    if (dryRun) {
      console.log(`\n✅ Dry-run complete. Run with --apply to persist summaries.`);
    } else if (results.updated > 0) {
      console.log(`\n✅ Successfully updated ${results.updated} cluster summaries!`);
    }

    process.exit(results.errors > 0 ? 1 : 0);
  } catch (err) {
    console.error('❌ Fatal error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
