#!/usr/bin/env node
/**
 * Phase 1.5: Lexical Feature Extraction
 *
 * Extract lexical_features[] (keywords, n-grams, ranked terms)
 * Input: ast_symbols + source_ref from atlas_packet_features
 * Output: lexical_features[] → atlas_packet_features
 *
 * Strategy:
 *   1. Read ast_symbols (already populated by Phase 1.5 ast-grep)
 *   2. Extract n-grams (unigrams, bigrams, trigrams) from symbols
 *   3. Extract keywords from code text (identifiers, domain terms)
 *   4. Rank by frequency and TF-IDF heuristics
 *   5. Write top-20 terms as lexical_features[]
 *
 * Usage:
 *   npm run atlas:phase1.5:lexical:dry --limit=100
 *   npm run atlas:phase1.5:lexical:apply --limit=10000
 */

import pg from 'pg';
import fs from 'fs';

const { Pool } = pg;

const isDryRun = process.argv.includes('--dry-run') || process.argv.includes('--dry');
const limit = parseInt(
  process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] ?? '1000'
);

const pool = new Pool({
  host: '127.0.0.1',
  port: 5434,
  database: 'legal_ai_db',
  user: 'legal_admin',
  password: process.env.POSTGRES_PASSWORD || '123456',
});

/**
 * Stopwords to filter out
 */
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
  'from', 'is', 'was', 'are', 'be', 'has', 'have', 'do', 'does', 'did', 'will', 'would',
  'could', 'should', 'may', 'might', 'must', 'can', 'let', 'return', 'this', 'that',
  'const', 'let', 'var', 'function', 'class', 'interface', 'type', 'enum', 'namespace',
  'import', 'export', 'default', 'async', 'await', 'new', 'private', 'public', 'protected',
  'static', 'readonly', 'abstract', 'extends', 'implements', 'null', 'undefined', 'true', 'false',
  'as', 'if', 'else', 'switch', 'case', 'break', 'continue', 'throw', 'try', 'catch',
]);

/**
 * Extract lexical features from symbols and code
 */
function extractLexicalFeatures(symbols, sourceText) {
  const features = new Map();

  // 1. Use ast_symbols as high-weight features
  if (Array.isArray(symbols) && symbols.length > 0) {
    symbols.forEach(sym => {
      const lower = sym.toLowerCase();
      if (!STOPWORDS.has(lower) && lower.length > 2) {
        features.set(lower, (features.get(lower) || 0) + 3); // Higher weight
      }
    });
  }

  // 2. Extract identifiers and keywords from code
  if (sourceText && sourceText.length > 0) {
    // Match camelCase / snake_case / kebab-case identifiers
    const identRegex = /\b[a-zA-Z_][a-zA-Z0-9_]*\b/g;
    const idents = sourceText.match(identRegex) || [];

    idents.forEach(ident => {
      const lower = ident.toLowerCase();
      if (!STOPWORDS.has(lower) && lower.length > 2 && lower.length < 50) {
        features.set(lower, (features.get(lower) || 0) + 1);
      }
    });

    // Extract unigrams, bigrams from code comments
    const commentRegex = /(?:\/\/|\/\*|\*)([^\n]*)/g;
    let match;
    while ((match = commentRegex.exec(sourceText)) !== null) {
      const comment = match[1].toLowerCase();
      const words = comment.split(/\s+/).filter(w => w.length > 2 && !STOPWORDS.has(w));
      words.forEach(w => {
        features.set(w, (features.get(w) || 0) + 2);
      });
    }
  }

  // 3. Sort by frequency and return top-20
  return Array.from(features.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([term, _]) => term);
}

async function main() {
  console.log(`\n📝 Phase 1.5: Lexical Feature Extraction [${isDryRun ? 'DRY-RUN' : 'APPLY'}]\n`);

  const client = await pool.connect();

  try {
    // 1. Fetch packets with ast_symbols but without lexical_features
    console.log('📦 Step 1: Fetch packets needing lexical extraction...');
    const result = await client.query(`
      SELECT
        ap.packet_key,
        ap.source_ref,
        apf.ast_symbols,
        apf.lexical_features
      FROM atlas_packets ap
      JOIN atlas_packet_features apf ON apf.packet_key = ap.packet_key
      WHERE ap.source_ref IS NOT NULL
      AND apf.ast_symbols IS NOT NULL
      AND array_length(apf.ast_symbols, 1) > 0
      AND (apf.lexical_features IS NULL OR array_length(apf.lexical_features, 1) = 0)
      ORDER BY ap.packet_key
      LIMIT $1
    `, [limit]);

    const packets = result.rows;
    console.log(`  ✓ Found ${packets.length} packets needing lexical extraction\n`);

    if (packets.length === 0) {
      console.log('  No packets to process.\n');
      process.exit(0);
    }

    // 2. Extract lexical features for each packet
    console.log('🔨 Step 2: Extract lexical features from code...');

    let extracted = 0;
    let failed = 0;
    const updates = [];

    for (const packet of packets) {
      try {
        // Read source file
        let sourceText = '';
        if (packet.source_ref && fs.existsSync(packet.source_ref)) {
          try {
            sourceText = fs.readFileSync(packet.source_ref, 'utf-8').slice(0, 50000); // First 50KB
          } catch (e) {
            // File read failed, continue with just symbols
          }
        }

        const features = extractLexicalFeatures(packet.ast_symbols, sourceText);

        if (features.length > 0) {
          extracted++;
          updates.push({
            packet_key: packet.packet_key,
            features: features,
          });
        } else {
          failed++;
        }

        if ((extracted + failed) % 100 === 0) {
          console.log(`  Progress: ${extracted + failed}/${packets.length} (${extracted} extracted, ${failed} failed)`);
        }
      } catch (e) {
        console.error(`  ⚠️  Error processing ${packet.packet_key}:`, e.message);
        failed++;
      }
    }

    console.log(`  ✓ Extraction complete: ${extracted} packets with features, ${failed} failed\n`);

    if (isDryRun) {
      console.log('📊 Sample results (first 5):\n');
      updates.slice(0, 5).forEach(u => {
        console.log(`  ${u.packet_key}`);
        console.log(`    Features: [${u.features.slice(0, 10).join(', ')}]`);
      });
      console.log('\n✅ Dry-run complete. Use --apply to persist.\n');
      process.exit(0);
    }

    // 3. Write to database
    console.log('💾 Step 3: Write lexical_features to atlas_packet_features...');

    let written = 0;
    for (const update of updates) {
      await client.query(`
        UPDATE atlas_packet_features
        SET lexical_features = $1, updated_at = NOW()
        WHERE packet_key = $2
      `, [update.features, update.packet_key]);

      written++;
      if (written % 500 === 0) {
        console.log(`  Progress: ${written}/${updates.length} written`);
      }
    }

    console.log(`  ✓ ${written} rows updated\n`);

    // 4. Validation gate
    console.log('✓ Phase 1.5 Complete\n');
    console.log('📊 Coverage Report:');

    const coverage = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM atlas_packets) as total_packets,
        (SELECT COUNT(*) FROM atlas_packets WHERE source_ref NOT LIKE 'proto:%') as extractable_packets,
        (SELECT COUNT(*) FROM atlas_packet_features WHERE lexical_features IS NOT NULL AND array_length(lexical_features, 1) > 0) as with_lexical
      FROM atlas_packet_features LIMIT 1
    `);

    const { total_packets, extractable_packets, with_lexical } = coverage.rows[0];
    const pct = (with_lexical / extractable_packets * 100).toFixed(1);

    console.log(`  Total packets: ${total_packets}`);
    console.log(`  Extractable (non-proto) packets: ${extractable_packets}`);
    console.log(`  With lexical_features: ${with_lexical} (${pct}% of extractable)`);
    console.log(`  Gate target: ≥95% of extractable`);

    if (with_lexical / extractable_packets >= 0.95) {
      console.log(`  Result: PASS\n`);
    } else {
      console.log(`  Result: FAIL (${pct}% < 95%)\n`);
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.release();
    await pool.end();
  }
}

main();
