#!/usr/bin/env node
/**
 * Batch Summarize Packets (P4.1 Critical Blocker)
 *
 * Generates Gemma4 summaries for individual atlas_packets where summary IS NULL.
 * Unlike cluster summaries, packet summaries capture semantic intent of single code entities.
 * Required for SOM semantic training (without packet semantics, SOM is geometry-only).
 *
 * Pipeline:
 * 1. Query atlas_packets where summary IS NULL OR summary = ''
 * 2. For each packet: fetch content chunk + metadata
 * 3. Build context: function_symbol + file_path + chunk content snippet
 * 4. Stream to Gemma4 (1-2 concurrent, safe for RTX 3060 Ti 8GB)
 * 5. Upsert summary + confidence to atlas_packets
 * 6. Invalidate Redis/BitFrost cache and emit events
 * 7. Track coverage: COUNT(summary) / COUNT(*)
 *
 * Usage:
 *   npm run atlas:summaries:packets:dry      # Preview: 100 packets, no write
 *   npm run atlas:summaries:packets:apply    # Production: all missing, write to DB
 *   npm run atlas:summaries:packets:apply --batch=200 --concurrency=8
 *
 * Time estimate:
 *   - 100 packets @ 2s per packet = 3-5 min (6 concurrent)
 *   - 3,251 total = 10-15 min full run
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import Redis from 'ioredis';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

// CLI args
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const apply = !dryRun && args.includes('--apply');
const verbose = args.includes('--verbose');
function cliValue(name) {
  const direct = args.find((a) => a.startsWith(`--${name}=`));
  if (direct) return direct.split('=')[1];
  const envKey = `npm_config_${name.replace(/-/g, '_')}`;
  const envValue = process.env[envKey];
  return envValue !== undefined && String(envValue).length > 0 ? String(envValue) : null;
}
// Cap concurrency to 2 for RTX 3060 Ti 8GB safety (default: 2, max: 2)
const concurrency = Math.min(
  parseInt(cliValue('concurrency') ?? '2', 10),
  2
);
const batchSize = parseInt(cliValue('batch') ?? '100', 10);
const maxTokens = 80; // Shorter than cluster summaries
const temperature = 0.1; // Low variance

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db',
  max: 10,
});

// llama-server (TurboQuant Gemma4) — NOT Ollama (embedding-only)
// Ollama is embeddinggemma only; batch LLM work uses llama-server @ :8090
const LLAMA_SERVER_URL = process.env.LLAMA_SERVER_URL || 'http://127.0.0.1:8090';
const MODEL = 'gemma4-legal-iq4xs-direct.gguf';

/**
 * Validate packet has required identity fields
 */
function validatePacket(packet) {
  const errors = [];
  if (!packet.packetKey) errors.push('missing packet_key');
  if (!packet.sourceRef) errors.push('missing source_ref');
  if (!packet.featureId) errors.push('missing feature_id');
  return errors;
}

/**
 * Invalidate Redis/BitFrost cache after Postgres write
 */
async function invalidateRedisCache(packetKeys, sourceRefs) {
  const redis = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || 'redis',
    lazyConnect: true
  });

  try {
    await redis.connect();
    const keysToDelete = [];

    for (const pk of packetKeys) {
      keysToDelete.push(`bitfrost:packet:${pk}`);
      keysToDelete.push(`bitfrost:trace:${pk}`);
    }

    for (const sr of sourceRefs) {
      keysToDelete.push(`bitfrost:source:${sr}`);
    }

    if (keysToDelete.length > 0) {
      const deleted = await redis.del(...keysToDelete);
      if (verbose) console.log(`✓ Invalidated ${deleted} Redis keys`);
    }
  } catch (err) {
    console.warn(`⚠️  Failed to invalidate Redis cache: ${err.message}`);
  } finally {
    await redis.quit();
  }
}

/**
 * Fetch packets needing summaries
 */
async function getPacketsNeedingSummaries(limit) {
  const query = `
    SELECT
      packet_id as "packetId",
      packet_key as "packetKey",
      source_ref as "sourceRef",
      file_path as "filePath",
      function_symbol as "functionSymbol",
      feature_id as "featureId",
      feature_label as "featureLabel",
      summary
    FROM atlas_packets
    WHERE summary IS NULL OR summary = ''
    ORDER BY feature_id ASC, packet_key ASC
    LIMIT $1
  `;

  const result = await pool.query(query, [limit]);
  return result.rows;
}

/**
 * Fetch chunk content for context
 */
async function fetchChunkContent(pool, sourceRef) {
  // Try codebase_chunks first (for code packets)
  const query = `
    SELECT
      content,
      language,
      chunk_index as "chunkIndex"
    FROM codebase_chunks
    WHERE source_ref = $1 OR relative_path = $1
    ORDER BY chunk_index ASC
    LIMIT 1
  `;

  try {
    const result = await pool.query(query, [sourceRef]);
    return result.rows[0];
  } catch {
    return null;
  }
}

/**
 * Build context for packet summarization
 */
function buildPacketContext(packet, chunk) {
  const lines = [];

  if (packet.functionSymbol) {
    lines.push(`Function: ${packet.functionSymbol}`);
  }
  if (packet.filePath) {
    lines.push(`File: ${packet.filePath}`);
  }
  if (packet.featureLabel) {
    lines.push(`Feature: ${packet.featureLabel}`);
  }

  if (chunk?.content) {
    const preview = chunk.content.slice(0, 300);
    lines.push(`\nContent Preview:\n${preview}`);
  }

  return lines.join('\n');
}

/**
 * Generate packet summary via llama-server (TurboQuant Gemma4)
 * Uses streaming for better handling of long responses
 */
async function generatePacketSummary(context) {
  const prompt = `Summarize this code entity in 1-2 sentences:

${context}

Summary:`;

  try {
    const response = await fetch(`${LLAMA_SERVER_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature,
        stream: false,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      throw new Error(`llama-server error: ${response.statusText}`);
    }

    const data = await response.json();
    const summary = data.choices?.[0]?.message?.content?.trim();

    return {
      summary: summary || null,
      confidence: summary ? 0.8 : 0.0,
      error: null,
    };
  } catch (err) {
    return {
      summary: null,
      confidence: 0.0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Upsert packet summary
 */
async function upsertPacketSummary(pool, packetId, summary, confidence) {
  const query = `
    UPDATE atlas_packets
    SET
      summary = $1,
      updated_at = NOW()
    WHERE packet_key = $2
  `;

  try {
    await pool.query(query, [summary, packetId]);
    return true;
  } catch (err) {
    console.error(`Failed to upsert packet ${packetId}:`, err.message);
    return false;
  }
}

/**
 * Process batch of packets
 */
async function processBatch(packets, pool) {
  const results = {
    success: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    packetKeysUpdated: [],
    sourceRefsUpdated: new Set(),
  };

  // Process in parallel with concurrency limit
  const semaphore = [];
  for (let i = 0; i < concurrency; i++) {
    semaphore.push(Promise.resolve());
  }

  for (const packet of packets) {
    // Wait for a slot to free up
    await Promise.race(semaphore);

    // Process packet asynchronously
    const promise = (async () => {
      try {
        // Validate packet identity
        const validationErrors = validatePacket(packet);
        if (validationErrors.length > 0) {
          results.failed++;
          results.errors.push({ packetKey: packet.packetKey, error: validationErrors.join('; ') });
          console.warn(`✗ [${packet.packetKey}] ${validationErrors.join('; ')}`);
          return;
        }

        // Skip if already has summary
        if (packet.summary) {
          results.skipped++;
          if (verbose) console.log(`✓ [${packet.packetKey}] already has summary`);
          return;
        }

        // Fetch content
        const chunk = await fetchChunkContent(pool, packet.sourceRef);
        const context = buildPacketContext(packet, chunk);

        // Generate summary
        const { summary, confidence, error } = await generatePacketSummary(context);

        if (error) {
          results.failed++;
          results.errors.push({ packetKey: packet.packetKey, error });
          console.warn(`✗ [${packet.packetKey}] ${error}`);
          return;
        }

        // Write to DB if not dry-run
        if (apply) {
          const success = await upsertPacketSummary(pool, packet.packetKey, summary, confidence);
          if (success) {
            results.success++;
            results.packetKeysUpdated.push(packet.packetKey);
            results.sourceRefsUpdated.add(packet.sourceRef);
            if (verbose) console.log(`✓ [${packet.packetKey}] ${summary?.substring(0, 50)}...`);
          } else {
            results.failed++;
          }
        } else {
          results.success++;
          if (verbose) console.log(`[DRY] [${packet.packetKey}] ${summary?.substring(0, 50)}...`);
        }
      } catch (err) {
        results.failed++;
        results.errors.push({
          packetKey: packet.packetKey,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    })();

    // Add promise to semaphore, removing it when done
    semaphore.push(promise.then(() => semaphore.shift()));
  }

  // Wait for all to complete
  await Promise.all(semaphore);
  return results;
}

/**
 * Get coverage stats
 */
async function getCoverageStats(pool) {
  const query = `
    SELECT
      COUNT(*) as total,
      COUNT(summary) as with_summary,
      ROUND(100.0 * COUNT(summary) / COUNT(*), 2) as coverage_pct
    FROM atlas_packets
  `;

  const result = await pool.query(query);
  return result.rows[0];
}

/**
 * Main execution
 */
async function main() {
  console.log(`\n📦 Batch Summarize Packets (P4.1 Critical Blocker)`);
  console.log(`Mode: ${apply ? 'APPLY' : dryRun ? 'DRY-RUN' : 'DRY-RUN (default)'}`);
  console.log(`Batch size: ${batchSize}, Concurrency: ${concurrency}\n`);

  try {
    // Check database connection
    const connTest = await pool.query('SELECT NOW()');
    console.log(`✓ Database connected: ${connTest.rows[0].now}\n`);

    // Get packets needing summaries
    const packets = await getPacketsNeedingSummaries(batchSize);
    console.log(`📋 Found ${packets.length} packets needing summaries\n`);

    if (packets.length === 0) {
      console.log('✓ All packets have summaries!\n');
      const stats = await getCoverageStats(pool);
      console.log(`Coverage: ${stats.with_summary}/${stats.total} (${stats.coverage_pct}%)\n`);
      return;
    }

    // Process batch
    console.log(`⏳ Processing ${packets.length} packets...\n`);
    const startTime = Date.now();
    const results = await processBatch(packets, pool);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    // Invalidate Redis/BitFrost cache after successful writes (canonical flow)
    if (apply && results.packetKeysUpdated.length > 0) {
      console.log(`\n🔄 Invalidating Redis cache for ${results.packetKeysUpdated.length} packets...`);
      await invalidateRedisCache(results.packetKeysUpdated, Array.from(results.sourceRefsUpdated));
    }

    // Report results
    console.log(`\n📊 Results (${elapsed}s):`);
    console.log(`  ✓ Success:   ${results.success}`);
    console.log(`  ⊘ Skipped:  ${results.skipped}`);
    console.log(`  ✗ Failed:   ${results.failed}`);

    if (results.errors.length > 0 && verbose) {
      console.log(`\n🔴 Errors:`);
      results.errors.forEach(e => {
        console.log(`  [${e.packetKey}] ${e.error}`);
      });
    }

    // Coverage stats
    const stats = await getCoverageStats(pool);
    console.log(`\n📈 Coverage: ${stats.with_summary}/${stats.total} (${stats.coverage_pct}%)\n`);

    if (!apply) {
      console.log(`💡 To apply changes, run with: npm run atlas:summaries:packets:apply\n`);
    }
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
