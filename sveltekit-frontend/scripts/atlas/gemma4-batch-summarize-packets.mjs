#!/usr/bin/env node
/**
 * Gemma4 Batch Summarizer for Atlas Packets
 *
 * Purpose: Backfill atlas_packets.summary for all packets missing summaries.
 * Uses Gemma4 at :8090 (TurboQuant) for efficient batch processing.
 *
 * Flow:
 *   1. Query packets WHERE summary IS NULL
 *   2. Batch into 10-packet chunks
 *   3. Call Gemma4 with source_ref + feature_id context
 *   4. Parse response for summary text
 *   5. Write back to atlas_packets (upsert)
 *   6. Emit telemetry: successes, failures, tokens used, latency
 *
 * Usage:
 *   npm run gemma4:batch:summarize-packets                  # Dry-run (preview)
 *   npm run gemma4:batch:summarize-packets -- --apply       # Apply summaries
 */

import pg from 'pg';
import Redis from 'ioredis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const isDryRun = !process.argv.includes('--apply');
const BATCH_SIZE = 10;
const CONCURRENCY = 2; // Max parallel batches

const report = {
  timestamp: new Date().toISOString(),
  phase: 'gemma4-batch-summarize',
  mode: isDryRun ? 'dry-run' : 'apply',
  stats: {
    packetsQueried: 0,
    packetsProcessed: 0,
    summariesGenerated: 0,
    summariesFailed: 0,
    tokensUsed: 0,
    latencyMs: 0,
    averageSummaryLength: 0
  },
  issues: [],
  warnings: [],
  status: 'PASS'
};

async function callGemma4Summarize(sourceRef, featureId, redis) {
  try {
    const t0 = Date.now();
    const prompt = `Generate a concise 1-2 sentence summary of this code/feature for search indexing.
Source: ${sourceRef}
Feature: ${featureId}

Respond with ONLY the summary, no additional text.`;

    // Try to get from cache first
    const cacheKey = `gemma4:summary:${sourceRef}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return { summary: cached, fromCache: true, latency: 0 };
    }

    // Call Gemma4 at :8090
    const response = await fetch('http://127.0.0.1:8090/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma4-rotorquant:latest',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 100,
        temperature: 0.3,
        stream: false
      }),
      signal: AbortSignal.timeout(30000)
    });

    if (!response.ok) {
      return { error: `HTTP ${response.status}`, summary: null };
    }

    const data = await response.json();
    const summary = (data.choices?.[0]?.message?.content || '').trim();

    if (summary) {
      // Cache for future use
      await redis.setex(cacheKey, 86400, summary);
    }

    const latency = Date.now() - t0;
    return { summary, latency, tokens: data.usage?.total_tokens || 0 };
  } catch (err) {
    return { error: err.message, summary: null };
  }
}

async function processBatch(packets, pool, redis) {
  const results = [];

  for (const packet of packets) {
    const { summary, error, latency, tokens } = await callGemma4Summarize(
      packet.source_ref,
      packet.feature_id,
      redis
    );

    if (error) {
      report.stats.summariesFailed++;
      report.warnings.push(`Summary failed for ${packet.packet_key}: ${error}`);
      results.push({ ...packet, summary: null, success: false });
    } else {
      report.stats.summariesGenerated++;
      report.stats.tokensUsed += tokens || 0;
      report.stats.latencyMs += latency || 0;
      report.stats.averageSummaryLength = results.length > 0
        ? ((report.stats.averageSummaryLength * (results.length - 1) + (summary?.length || 0)) / results.length)
        : (summary?.length || 0);
      results.push({ ...packet, summary, success: true });
    }
  }

  // Write results to DB if not dry-run
  if (!isDryRun) {
    for (const result of results) {
      if (result.success && result.summary) {
        try {
          await pool.query(
            `UPDATE atlas_packets SET summary = $1, updated_at = NOW() WHERE packet_key = $2`,
            [result.summary, result.packet_key]
          );
        } catch (err) {
          report.issues.push(`Failed to update ${result.packet_key}: ${err.message}`);
          report.stats.summariesFailed++;
        }
      }
    }
  }

  return results;
}

async function main() {
  console.log(`\n📝 Gemma4 Batch Summarizer (${isDryRun ? 'DRY-RUN' : 'APPLY MODE'})\n`);

  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'
  });

  const redis = new Redis(process.env.REDIS_URL || {
    host: '127.0.0.1',
    port: 6379,
    password: 'redis',
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null
  });

  try {
    await redis.connect();

    // Query packets without summaries
    const result = await pool.query(`
      SELECT packet_key, source_ref, feature_id, file_path
      FROM atlas_packets
      WHERE summary IS NULL OR summary = ''
      LIMIT 1000
    `);

    report.stats.packetsQueried = result.rows.length;
    console.log(`📦 Found ${result.rows.length} packets needing summaries`);

    if (result.rows.length === 0) {
      console.log('✅ All packets have summaries!');
      process.exit(0);
    }

    // Process in batches with concurrency control
    let processed = 0;
    for (let i = 0; i < result.rows.length; i += BATCH_SIZE) {
      const batch = result.rows.slice(i, i + BATCH_SIZE);
      console.log(`\n🔄 Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(result.rows.length / BATCH_SIZE)}`);

      try {
        const batchResults = await processBatch(batch, pool, redis);
        processed += batchResults.length;
        report.stats.packetsProcessed += batchResults.length;

        const successes = batchResults.filter(r => r.success).length;
        console.log(`   ✅ ${successes}/${batch.length} summaries generated`);

        // Rate limit to avoid Gemma4 overload
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (err) {
        report.issues.push(`Batch processing failed: ${err.message}`);
      }
    }

    // Final report
    const successRate = report.stats.summariesGenerated / report.stats.packetsProcessed * 100;
    console.log(`\n📊 Summary:`);
    console.log(`  Packets processed: ${report.stats.packetsProcessed}`);
    console.log(`  Summaries generated: ${report.stats.summariesGenerated}`);
    console.log(`  Failures: ${report.stats.summariesFailed}`);
    console.log(`  Success rate: ${successRate.toFixed(1)}%`);
    console.log(`  Avg summary length: ${report.stats.averageSummaryLength.toFixed(0)} chars`);
    console.log(`  Tokens used: ${report.stats.tokensUsed}`);
    console.log(`  Total latency: ${report.stats.latencyMs}ms`);

    if (isDryRun) {
      console.log('\n  🔍 DRY-RUN mode — no summaries written');
      console.log('  Run with --apply flag to persist summaries');
    } else {
      console.log('\n  ✅ Summaries written to atlas_packets');
    }

    // Write report
    const reportPath = path.join(ROOT, '.tmp', 'gemma4-batch-summarize.json');
    if (!fs.existsSync(path.dirname(reportPath))) {
      fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    }
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`  Report: ${reportPath}`);

    if (report.issues.length > 0) {
      console.log('\n❌ Issues:');
      report.issues.forEach(i => console.log(`   • ${i}`));
    }

    if (report.warnings.length > 0) {
      console.log('\n⚠️ Warnings:');
      report.warnings.forEach(w => console.log(`   • ${w}`));
    }

    process.exit(report.issues.length > 0 ? 1 : 0);
  } catch (err) {
    console.error('❌ Fatal error:', err.message);
    process.exit(1);
  } finally {
    await redis.quit();
    await pool.end();
  }
}

main();
