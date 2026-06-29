#!/usr/bin/env node
/**
 * Phase B Pass 2: Entity Extraction & Keywords
 *
 * Extracts named entities and keywords from packet summaries using:
 * - LangExtract (for semantic entity extraction)
 * - TF-IDF keyword ranking (for importance scoring)
 * - Error pattern detection (regex + heuristics)
 *
 * Output: Populates atlas_packets.{extracted_entities, keywords, error_pattern}
 *
 * Usage:
 *   node scripts/atlas/phase-b2-langextract-entities.mjs [--dry-run] [--apply] [--batch=500] [--verbose]
 */

import pg from 'pg';
import https from 'https';
import { readFileSync } from 'fs';

const { Pool } = pg;

const DRY_RUN = process.argv.includes('--dry-run');
const APPLY = process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');
const BATCH_SIZE = parseInt(process.argv.find(arg => arg.startsWith('--batch='))?.split('=')[1] || '100');

// Connection from .env
const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5434'),
  database: process.env.POSTGRES_DB || 'legal_ai_db',
  user: process.env.POSTGRES_USER || 'legal_admin',
  password: process.env.POSTGRES_PASSWORD || '123456',
});

const LANGEXTRACT_ENDPOINT = 'http://127.0.0.1:8091'; // LangExtract service
const GEMMA4_ENDPOINT = 'http://127.0.0.1:8090'; // For error pattern classification

// Common error keywords for pattern detection
const ERROR_PATTERNS = {
  'timeout': /(?:timeout|timed out|took too long)/i,
  'connection': /(?:connection (?:failed|refused|lost|reset)|ECONNREFUSED|ECONNRESET)/i,
  'authentication': /(?:auth|login|credentials|unauthorized|forbidden|403|401)/i,
  'validation': /(?:validation (?:failed|error)|invalid (?:input|format)|schema)/i,
  'memory': /(?:out of memory|OOM|memory leak|heap|ENOMEM)/i,
  'parsing': /(?:parse error|malformed|invalid JSON|syntax error)/i,
  'database': /(?:database (?:error|connection)|constraint violation|foreign key)/i,
  'permission': /(?:permission (?:denied|error)|access denied|no such file)/i,
  'network': /(?:network (?:error|timeout)|unreachable|DNS|ENOTFOUND)/i,
};

// Entity types to extract
const ENTITY_TYPES = ['function', 'file', 'variable', 'class', 'error_type', 'service', 'external_api'];

async function fetchEntitiesFromLangExtract(summary) {
  if (!summary || summary.length < 20) return [];

  try {
    const response = await fetch(`${LANGEXTRACT_ENDPOINT}/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: summary,
        entity_types: ENTITY_TYPES,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return [];
    const data = await response.json();
    return data.entities || [];
  } catch (error) {
    if (VERBOSE) console.log(`  ⚠️  LangExtract error: ${error.message}`);
    return [];
  }
}

async function extractKeywords(summary) {
  if (!summary || summary.length < 50) return [];

  // Simple TF-IDF-like keyword extraction
  const words = summary
    .toLowerCase()
    .split(/[\s\W]+/)
    .filter(w => w.length > 3);

  // Count frequencies
  const freq = {};
  const stopwords = new Set(['that', 'this', 'from', 'with', 'into', 'have', 'been', 'were', 'when', 'error', 'check']);

  for (const word of words) {
    if (!stopwords.has(word) && word.length > 3) {
      freq[word] = (freq[word] || 0) + 1;
    }
  }

  // Sort by frequency and return top N
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word]) => word);
}

function detectErrorPattern(summary) {
  if (!summary) return null;

  for (const [patternName, regex] of Object.entries(ERROR_PATTERNS)) {
    if (regex.test(summary)) {
      return patternName;
    }
  }
  return null;
}

async function processBatch(packets) {
  const results = [];

  for (const packet of packets) {
    if (!packet.summary) {
      results.push({ ...packet, extracted_entities: [], keywords: [], error_pattern: null });
      continue;
    }

    // Parallel extraction
    const [entities, keywords] = await Promise.all([
      fetchEntitiesFromLangExtract(packet.summary),
      extractKeywords(packet.summary),
    ]);

    const errorPattern = detectErrorPattern(packet.summary);

    results.push({
      ...packet,
      extracted_entities: entities,
      keywords,
      error_pattern: errorPattern,
    });

    if (VERBOSE) {
      console.log(`   ✅ Processed ${packet.packet_key}: ${entities.length} entities, ${keywords.length} keywords, error_pattern=${errorPattern}`);
    }
  }

  return results;
}

async function writeToPostgres(packets) {
  const updateQueries = packets.map((packet) => ({
    text: `
      UPDATE atlas_packets
      SET
        extracted_entities = $2,
        keywords = $3,
        error_pattern = $4,
        updated_at = NOW()
      WHERE packet_key = $1
    `,
    values: [
      packet.packet_key,
      JSON.stringify(packet.extracted_entities),
      packet.keywords,
      packet.error_pattern,
    ],
  }));

  if (DRY_RUN) {
    console.log(`\n📋 Dry-run: Would write ${packets.length} packets`);
    if (VERBOSE) {
      console.log(`   Sample query: ${updateQueries[0].text.replace(/\s+/g, ' ')}`);
    }
    return true;
  }

  try {
    for (const query of updateQueries) {
      await pool.query(query.text, query.values);
    }
    console.log(`   ✅ Wrote ${packets.length} packets to Postgres`);
    return true;
  } catch (error) {
    console.error(`   ❌ Write error: ${error.message}`);
    return false;
  }
}

const startTime = Date.now();

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Phase B Pass 2: Entity Extraction & Keywords                  ║');
  console.log('║  LangExtract + TF-IDF + Error Pattern Detection                ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  if (DRY_RUN) console.log('⚠️  DRY-RUN MODE\n');

  // Step 1: Query packets needing entity extraction
  try {
    const result = await pool.query(`
      SELECT
        packet_key,
        summary,
        extracted_entities,
        keywords,
        error_pattern
      FROM atlas_packets
      WHERE summary IS NOT NULL
        AND (extracted_entities = '[]'::jsonb OR extracted_entities IS NULL)
      ORDER BY created_at DESC
      LIMIT 10000
    `);

    const packets = result.rows;
    console.log(`📦 Found ${packets.length} packets needing entity extraction\n`);

    let processed = 0;
    let failed = 0;

    // Process in batches
    for (let i = 0; i < packets.length; i += BATCH_SIZE) {
      const batch = packets.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(packets.length / BATCH_SIZE);

      console.log(`🔄 Processing batch ${batchNum}/${totalBatches}`);

      try {
        const enriched = await processBatch(batch);
        const success = await writeToPostgres(enriched);

        if (success) {
          processed += batch.length;
        } else {
          failed += batch.length;
        }
      } catch (error) {
        console.error(`   ❌ Batch error: ${error.message}`);
        failed += batch.length;
      }
    }

    // Summary
    console.log(`\n✅ Entity Extraction Complete`);
    console.log(`   Processed: ${processed}`);
    console.log(`   Failed: ${failed}`);
    console.log(`   Total Duration: ${((Date.now() - startTime) / 1000).toFixed(1)}s\n`);

    // Verification query
    if (!DRY_RUN) {
      const verifyResult = await pool.query(`
        SELECT
          COUNT(*) as total,
          COUNT(CASE WHEN extracted_entities != '[]'::jsonb THEN 1 END) as with_entities,
          COUNT(CASE WHEN keywords IS NOT NULL AND array_length(keywords, 1) > 0 THEN 1 END) as with_keywords,
          COUNT(CASE WHEN error_pattern IS NOT NULL THEN 1 END) as with_error_pattern
        FROM atlas_packets
      `);

      console.log('📊 Verification:');
      const v = verifyResult.rows[0];
      console.log(`   Total packets: ${v.total}`);
      console.log(`   With entities: ${v.with_entities} (${(100 * v.with_entities / v.total).toFixed(1)}%)`);
      console.log(`   With keywords: ${v.with_keywords} (${(100 * v.with_keywords / v.total).toFixed(1)}%)`);
      console.log(`   With error pattern: ${v.with_error_pattern} (${(100 * v.with_error_pattern / v.total).toFixed(1)}%)\n`);
    }
  } catch (error) {
    console.error(`Fatal error: ${error.message}`);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();