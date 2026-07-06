#!/usr/bin/env node

/**
 * Phase 8F: LangExtract Concept Extraction
 *
 * Extracts legal entities (STATUTE, PERSON, ORG, AMOUNT, LOCATION) from summaries
 * Calls LangExtract service :8095, falls back to regex patterns
 *
 * Usage:
 *   npm run atlas:phase8f:concepts:dry
 *   npm run atlas:phase8f:concepts:apply
 */

import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import { buildCanonicalFeatureEnvelope, reportValidation } from './lib/envelope-builder.mjs';

const { Pool } = pg;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const apply = args.includes('--apply');
const limit = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '50000');
const LANGEXTRACT_URL = process.env.LANGEXTRACT_URL || 'http://127.0.0.1:8095';

const MODE = dryRun ? 'DRY_RUN' : apply ? 'APPLY' : 'DRY_RUN';

const env = loadRepoEnv();
const DATABASE_URL = resolveDatabaseUrl(env);

const pool = new Pool({ connectionString: DATABASE_URL });

/**
 * Extract entities via LangExtract API
 */
async function extractViaLangExtract(text) {
  try {
    const response = await fetch(`${LANGEXTRACT_URL}/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        text, 
        entities: ['STATUTE', 'PERSON', 'ORG', 'AMOUNT', 'LOCATION'] 
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.entities || [];
  } catch (err) {
    return null;
  }
}

/**
 * Fallback: Extract via regex patterns
 */
function extractViaRegex(text) {
  const concepts = [];

  // STATUTE: "§ 123", "Section 123", "U.C.C. § 1-101"
  const statuteMatches = text.matchAll(/(?:§|Section|Article|Chapter|42\s+U\.S\.C\.?|U\.C\.C\.?)\s+(?:[\d\-\.]+(?:\([a-z0-9]+\))?)/gi);
  for (const match of statuteMatches) {
    concepts.push(match[0].trim());
  }

  // PERSON: "John Doe", "J. Smith" (capitalized words)
  const personMatches = text.matchAll(/\b(?:[A-Z][a-z]+\s+)+[A-Z][a-z]+\b/g);
  for (const match of personMatches) {
    if (match[0].length < 50) {
      concepts.push(match[0].trim());
    }
  }

  // AMOUNT: "$1,000", "100.50 dollars", "£250"
  const amountMatches = text.matchAll(/(?:\$|£|€)[\d,]+(?:\.\d{2})?/g);
  for (const match of amountMatches) {
    concepts.push(match[0].trim());
  }

  return concepts;
}

async function extractConcepts() {
  console.log(`\n📚 Phase 8F: LangExtract Concept Extraction [${MODE}]\n`);
  console.log(`   LangExtract: ${LANGEXTRACT_URL}`);
  console.log(`   Limit: ${limit} packets | Mode: ${MODE}\n`);

  try {
    // 1. Query packets missing concept_ids
    console.log('📦 Step 1: Fetch packets missing concept_ids...');
    const packets = await pool.query(`
      SELECT
        id as packet_id,
        packet_key,
        summary
      FROM atlas_packets
      WHERE summary IS NOT NULL
        AND LENGTH(COALESCE(summary, '')) > 20
        AND concept_ids IS NULL
      ORDER BY created_at DESC
      LIMIT $1
    `, [limit]);

    console.log(`  ✓ Fetched ${packets.rows.length} packets without concept_ids\n`);

    if (MODE === 'DRY_RUN') {
      console.log('DRY RUN: Sample entity extraction:');
      for (let i = 0; i < Math.min(3, packets.rows.length); i++) {
        const p = packets.rows[i];
        const entities = await extractViaLangExtract(p.summary) || extractViaRegex(p.summary);
        console.log(`  ${p.packet_key}:`);
        entities.slice(0, 3).forEach((e) => {
          console.log(`    - ${e}`);
        });
        if (entities.length > 3) console.log(`    ... and ${entities.length - 3} more`);
      }
      console.log();
      return;
    }

    // 2. Extract and materialize
    console.log('📝 Step 2: Extract entity concepts...');
    let extracted = 0;
    let skipped = 0;
    let langExtractFails = 0;

    for (let i = 0; i < packets.rows.length; i++) {
      const p = packets.rows[i];

      try {
        // Build and validate canonical envelope
        const { envelope, validation } = buildCanonicalFeatureEnvelope(p);

        // Skip on hard failures
        if (validation.hardFailures.length > 0) {
          skipped++;
          continue;
        }

        // Try LangExtract first
        let concepts = await extractViaLangExtract(p.summary);
        if (!concepts || concepts.length === 0) {
          concepts = extractViaRegex(p.summary);
          langExtractFails++;
        }

        // Deduplicate
        const uniqueConcepts = [...new Set(concepts)];

        // Enrich envelope
        envelope.used_concepts = uniqueConcepts;

        // Update Postgres
        await pool.query(
          `UPDATE atlas_packets
           SET concept_ids = $1, updated_at = NOW()
           WHERE id = $2`,
          [JSON.stringify(uniqueConcepts), p.packet_id]
        );

        extracted++;
        if ((i + 1) % 1000 === 0) {
          console.log(`  ✓ Extracted concepts from ${i + 1}/${packets.rows.length} packets`);
        }

      } catch (err) {
        console.error(`  ❌ Error processing ${p.packet_key}: ${err.message}`);
      }
    }

    console.log(`\n✅ Extraction complete:`);
    console.log(`  Concepts extracted: ${extracted} packets`);
    if (skipped > 0) {
      console.log(`  Skipped: ${skipped} (validation failures)`);
    }
    console.log(`  LangExtract failures (used regex): ${langExtractFails}`);

    // 3. Verify coverage
    console.log('\n📊 Step 3: Verify coverage...');
    const coverage = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN concept_ids IS NOT NULL THEN 1 END) as with_concepts,
        ROUND(100.0 * COUNT(CASE WHEN concept_ids IS NOT NULL THEN 1 END) / COUNT(*), 2) as coverage_pct
      FROM atlas_packets
    `);

    const result = coverage.rows[0];
    console.log(`  Total packets: ${result.total}`);
    console.log(`  With concept_ids: ${result.with_concepts} (${result.coverage_pct}%)`);

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

extractConcepts().catch((err) => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});
