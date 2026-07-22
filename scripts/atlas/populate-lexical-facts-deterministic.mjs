#!/usr/bin/env node

/**
 * Populate Lexical Facts (Deterministic)
 *
 * Extracts keywords, identifiers, symbols from packet metadata without external deps.
 * Uses: source_ref path tokenization + packet summary word extraction.
 *
 * Input: atlas_packets (source_ref, summary)
 * Output: feature_lexical_facts (keywords, identifiers, symbols)
 *
 * Deterministic: Same input → same output always
 *
 * Usage:
 *   node scripts/atlas/populate-lexical-facts-deterministic.mjs --dry-run
 *   node scripts/atlas/populate-lexical-facts-deterministic.mjs --apply --limit=1000
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../sveltekit-frontend/.env.local') });
dotenv.config({ path: path.join(__dirname, '../../sveltekit-frontend/.env') });

const { Pool } = pg;

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const DRY_RUN = !APPLY;
const VERBOSE = args.includes('--verbose');
const limitArg = args.find(a => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1]) : 1000;
const batchSizeArg = args.find(a => a.startsWith('--batch-size='));
const batchSize = batchSizeArg ? parseInt(batchSizeArg.split('=')[1]) : 50;

const pool = new Pool({
  host: '127.0.0.1',
  port: 5434,
  user: 'legal_admin',
  password: '123456',
  database: 'legal_ai_db',
});

/**
 * Deterministic tokenization from source_ref path
 * Examples:
 *   src/lib/server/auth.ts → ['src', 'lib', 'server', 'auth']
 *   packages/atlas-core/src/index.ts → ['packages', 'atlas', 'core', 'src', 'index']
 */
function tokenizeSourceRef(sourceRef) {
  return sourceRef
    .split(/[\/\\\-_.]+/)
    .filter(t => t.length > 0 && !/^\d+$/.test(t))
    .map(t => t.toLowerCase());
}

/**
 * Extract words from summary text
 * Filters: stop words, numbers, single chars
 */
function extractSummaryWords(summary) {
  if (!summary || typeof summary !== 'string') return [];

  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of',
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
    'do', 'does', 'did', 'will', 'would', 'should', 'could', 'may', 'might',
    'can', 'from', 'by', 'with', 'about', 'as', 'into', 'through', 'during',
    'this', 'that', 'these', 'those', 'it', 'its', 'they', 'them', 'their'
  ]);

  return summary
    .toLowerCase()
    .split(/\W+/)
    .filter(w => w.length > 2 && !stopWords.has(w))
    .slice(0, 50);  // limit to first 50 words
}

/**
 * Extract programming identifiers from source_ref
 * Looks for camelCase, snake_case patterns
 */
function extractIdentifiers(sourceRef) {
  const identifiers = [];

  // camelCase: function names, class names
  const camelMatches = sourceRef.match(/[a-z][a-zA-Z0-9]*(?=[A-Z]|[^a-zA-Z0-9])/g) || [];
  identifiers.push(...camelMatches.map(m => m.toLowerCase()));

  // snake_case: constants, variables
  const snakeMatches = sourceRef.match(/[a-z]+_[a-z0-9_]*/g) || [];
  identifiers.push(...snakeMatches);

  return [...new Set(identifiers)];  // deduplicate
}

/**
 * Build a lexical summary string
 */
function buildLexicalSummary(keywords, identifiers, symbols) {
  const counts = {
    keywords: keywords.length,
    identifiers: identifiers.length,
    symbols: symbols.length,
  };
  return `keywords:${counts.keywords} identifiers:${counts.identifiers} symbols:${counts.symbols}`;
}

/**
 * Fetch packets needing lexical extraction
 */
async function fetchPacketsForExtraction() {
  console.log('\n📚 Fetching packets for lexical extraction...');

  const res = await pool.query(`
    SELECT
      ap.packet_key,
      ap.source_ref,
      COALESCE(ap.summary, '') as summary
    FROM atlas_packets ap
    WHERE ap.packet_key IS NOT NULL
      AND ap.source_ref IS NOT NULL
    ORDER BY ap.packet_key
    LIMIT $1
  `, [limit]);

  console.log(`   ✓ Loaded ${res.rows.length} packets`);
  return res.rows;
}

/**
 * Extract and materialize lexical features
 */
async function materializeLexicalFeatures(packets) {
  console.log(`\n📝 Extracting lexical features from ${packets.length} packets...\n`);

  if (DRY_RUN) {
    console.log(`   ⚠️  DRY RUN: Would extract and store lexical features for ${packets.length} packets`);
    console.log(`   Sample extraction (first 3 packets):\n`);

    for (let i = 0; i < Math.min(3, packets.length); i++) {
      const packet = packets[i];
      const pathTokens = tokenizeSourceRef(packet.source_ref);
      const summaryWords = extractSummaryWords(packet.summary);
      const identifiers = extractIdentifiers(packet.source_ref);
      const keywords = [...new Set([...pathTokens, ...summaryWords])];

      console.log(`     Packet: ${packet.packet_key}`);
      console.log(`       Path tokens: ${pathTokens.join(', ')}`);
      console.log(`       Summary words: ${summaryWords.slice(0, 5).join(', ')}`);
      console.log(`       Identifiers: ${identifiers.slice(0, 3).join(', ')}`);
      console.log(`       Keywords total: ${keywords.length}\n`);
    }

    console.log(`   To apply, run with --apply flag.\n`);
    return { extracted: 0, errors: 0 };
  }

  let extracted = 0;
  let errors = 0;

  // Process in batches
  for (let i = 0; i < packets.length; i += batchSize) {
    const batch = packets.slice(i, i + batchSize);

    for (const packet of batch) {
      try {
        // Extract lexical features
        const pathTokens = tokenizeSourceRef(packet.source_ref);
        const summaryWords = extractSummaryWords(packet.summary);
        const identifiers = extractIdentifiers(packet.source_ref);
        const keywords = [...new Set([...pathTokens, ...summaryWords])];
        const symbols = pathTokens;  // symbols from path structure

        const contentHash = crypto
          .createHash('sha256')
          .update(packet.summary || '')
          .digest('hex');

        const lexicalSummary = buildLexicalSummary(keywords, identifiers, symbols);

        await pool.query(
          `
          INSERT INTO feature_lexical_facts
          (packet_key, source_ref, keywords, identifiers, symbols,
           lexical_summary, content_hash, extractor_version, metadata)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (packet_key, extractor_version, content_hash) DO UPDATE SET
            keywords = $3,
            identifiers = $4,
            symbols = $5,
            lexical_summary = $6,
            metadata = $9
          `,
          [
            packet.packet_key,
            packet.source_ref,
            keywords,
            identifiers,
            symbols,
            lexicalSummary,
            contentHash,
            'deterministic-v1',
            { extracted_at: new Date().toISOString(), path_based: true }
          ]
        );

        extracted++;
      } catch (err) {
        if (VERBOSE) {
          console.error(`   ❌ Error extracting ${packet.packet_key}: ${err.message}`);
        }
        errors++;
      }
    }

    // Progress indicator
    const progress = Math.min(i + batchSize, packets.length);
    console.log(`   Progress: ${progress} / ${packets.length}`);
  }

  console.log(`\n   ✓ Extracted: ${extracted}, Errors: ${errors}\n`);
  return { extracted, errors };
}

/**
 * Verify materialization
 */
async function verifyLexicalMaterialization() {
  console.log('✅ Verifying lexical feature materialization...');

  const res = await pool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN keywords IS NOT NULL AND array_length(keywords, 1) > 0 THEN 1 END) as with_keywords,
      COUNT(CASE WHEN identifiers IS NOT NULL AND array_length(identifiers, 1) > 0 THEN 1 END) as with_identifiers,
      COUNT(CASE WHEN symbols IS NOT NULL AND array_length(symbols, 1) > 0 THEN 1 END) as with_symbols
    FROM feature_lexical_facts
  `);

  const stats = res.rows[0];
  console.log(`   Total extracted: ${stats.total}`);
  console.log(`   With keywords: ${stats.with_keywords}`);
  console.log(`   With identifiers: ${stats.with_identifiers}`);
  console.log(`   With symbols: ${stats.with_symbols}\n`);

  return stats;
}

/**
 * Main execution
 */
async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  Extract Lexical Features (Deterministic Path Analysis)    ║');
  console.log(`║  Mode: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'.padEnd(56)}║`);
  console.log(`║  Limit: ${limit}, Batch Size: ${batchSize}`.padEnd(61) + '║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  try {
    // Fetch packets
    const packets = await fetchPacketsForExtraction();

    if (packets.length === 0) {
      console.log('\n❌ No packets found.');
      process.exit(1);
    }

    // Extract and materialize
    const result = await materializeLexicalFeatures(packets);

    // Verify
    if (!DRY_RUN) {
      await verifyLexicalMaterialization();
    }

    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ Lexical feature extraction complete!');
    if (!DRY_RUN) {
      console.log(`   Extracted: ${result.extracted} packets`);
    }
    console.log('   Next: Add structural (AST) and semantic (embedding) signals\n');

    await pool.end();
  } catch (err) {
    console.error('\n❌ Error:', err.message);
    if (VERBOSE) console.error(err.stack);
    await pool.end();
    process.exit(1);
  }
}

main();
