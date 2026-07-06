#!/usr/bin/env node
/**
 * Populate atlas_packet_features from atlas_packets
 *
 * Safe population of extraction layer:
 * - used_concepts from atlas_packets.concept_ids
 * - lexical_features from keywords + ngrams (if available)
 * - ast_symbols from metadata.structural or function_symbol
 * - concept_coverage metric
 *
 * Uses ON CONFLICT (packet_key) DO UPDATE for idempotency
 * Never mutates atlas_packets identity fields
 */

import pg from 'pg';

const { Pool } = pg;

const isDryRun = process.argv.includes('--dry-run') || process.argv.includes('--dry');
const isApply = process.argv.includes('--apply');
const limit = parseInt(process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] ?? '58365');
const batchSize = parseInt(process.argv.find(arg => arg.startsWith('--batch-size='))?.split('=')[1] ?? '1000');

const pool = new Pool({
  host: '127.0.0.1',
  port: 5434,
  database: 'legal_ai_db',
  user: 'legal_admin',
  password: process.env.POSTGRES_PASSWORD || '123456',
});

async function fetchPackets(client, limit) {
  console.log(`📦 Fetching ${limit} packets from atlas_packets...`);

  const result = await client.query(`
    SELECT
      ap.packet_key,
      ap.concept_ids,
      ap.keywords,
      ap.function_symbol,
      ap.source_kind,
      ap.metadata
    FROM atlas_packets ap
    WHERE ap.packet_key IS NOT NULL
    ORDER BY ap.packet_key
    LIMIT $1
  `, [limit]);

  console.log(`  ✓ Fetched ${result.rows.length} packets\n`);
  return result.rows;
}

function extractLexicalFeatures(packet) {
  // Collect lexical features from keywords, function_symbol, source_kind
  const features = new Set();

  // Keywords array
  if (packet.keywords && Array.isArray(packet.keywords)) {
    packet.keywords.forEach(k => features.add(k));
  }

  // Function symbol and source kind as lexical hints
  if (packet.function_symbol) {
    features.add(packet.function_symbol.toLowerCase());
  }
  if (packet.source_kind) {
    features.add(packet.source_kind.toLowerCase());
  }

  return Array.from(features);
}

function extractAstSymbols(packet) {
  // Extract AST symbols from metadata.structural or function_symbol
  const symbols = new Set();

  // Structural metadata
  if (packet.metadata && typeof packet.metadata === 'object') {
    if (packet.metadata.structural && Array.isArray(packet.metadata.structural)) {
      packet.metadata.structural.forEach(s => symbols.add(s));
    }
  }

  // Function symbol as primary AST node
  if (packet.function_symbol) {
    symbols.add(packet.function_symbol);
  }

  return Array.from(symbols);
}

function calculateConceptCoverage(packet) {
  // Coverage is ratio of non-empty semantic fields to expected fields
  const fields = [
    packet.concept_ids?.length > 0 ? 1 : 0,
    packet.keywords?.length > 0 ? 1 : 0,
    packet.function_symbol ? 1 : 0,
    packet.source_kind ? 1 : 0,
  ];

  const populated = fields.filter(f => f === 1).length;
  return populated / fields.length;
}

async function populateBatch(client, packets, batchNum, isDryRun) {
  console.log(`\n🔄 Batch ${batchNum}: Processing ${packets.length} packets...`);

  const insertQuery = `
    INSERT INTO atlas_packet_features (
      packet_key,
      used_concepts,
      lexical_features,
      ast_symbols,
      concept_coverage,
      created_at,
      updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, NOW(), NOW()
    )
    ON CONFLICT (packet_key) DO UPDATE
    SET
      used_concepts = EXCLUDED.used_concepts,
      lexical_features = EXCLUDED.lexical_features,
      ast_symbols = EXCLUDED.ast_symbols,
      concept_coverage = EXCLUDED.concept_coverage,
      updated_at = NOW()
    WHERE atlas_packet_features.packet_key = EXCLUDED.packet_key
  `;

  let successCount = 0;
  let errorCount = 0;

  for (const packet of packets) {
    try {
      const usedConcepts = packet.concept_ids || [];
      const lexicalFeatures = extractLexicalFeatures(packet);
      const astSymbols = extractAstSymbols(packet);
      const conceptCoverage = calculateConceptCoverage(packet);

      if (!isDryRun) {
        await client.query(insertQuery, [
          packet.packet_key,
          usedConcepts,
          lexicalFeatures,
          astSymbols,
          conceptCoverage,
        ]);
      }

      successCount++;
    } catch (err) {
      console.error(`  ❌ Error inserting ${packet.packet_key}: ${err.message}`);
      errorCount++;
    }
  }

  console.log(`  ✓ ${successCount} inserted, ${errorCount} failed`);
  return { successCount, errorCount };
}

async function main() {
  console.log(`\n🔄 Populate atlas_packet_features [${isDryRun ? 'DRY-RUN' : 'APPLY'}]\n`);

  const client = await pool.connect();

  try {
    // Fetch all packets
    const packets = await fetchPackets(client, limit);

    if (packets.length === 0) {
      console.log('⚠️  No packets to populate.\n');
      process.exit(0);
    }

    // Process in batches
    let totalSuccess = 0;
    let totalError = 0;

    for (let i = 0; i < packets.length; i += batchSize) {
      const batch = packets.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;

      const { successCount, errorCount } = await populateBatch(
        client,
        batch,
        batchNum,
        isDryRun
      );

      totalSuccess += successCount;
      totalError += errorCount;
    }

    // Summary
    console.log(`\n✅ Population Complete\n`);
    console.log(`📊 Summary:`);
    console.log(`  Total packets: ${packets.length}`);
    console.log(`  Successfully processed: ${totalSuccess}`);
    console.log(`  Errors: ${totalError}`);
    console.log(`  Success rate: ${((totalSuccess / packets.length) * 100).toFixed(1)}%\n`);

    if (isDryRun) {
      console.log('🔍 Dry-run complete. Use --apply to execute.\n');
      process.exit(0);
    }

    // Verify coverage
    console.log('📈 Verifying coverage...\n');
    const coverageResult = await client.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN used_concepts IS NOT NULL AND array_length(used_concepts, 1) > 0 THEN 1 END) as used_concepts_populated,
        COUNT(CASE WHEN lexical_features IS NOT NULL AND array_length(lexical_features, 1) > 0 THEN 1 END) as lexical_populated,
        COUNT(CASE WHEN ast_symbols IS NOT NULL AND array_length(ast_symbols, 1) > 0 THEN 1 END) as ast_populated,
        ROUND(AVG(concept_coverage) * 100, 1) as avg_coverage_pct
      FROM atlas_packet_features
    `);

    const { total, used_concepts_populated, lexical_populated, ast_populated, avg_coverage_pct } = coverageResult.rows[0];

    console.log(`  Total rows: ${total}`);
    console.log(`  used_concepts: ${used_concepts_populated} / ${total} (${((used_concepts_populated / total) * 100).toFixed(1)}%)`);
    console.log(`  lexical_features: ${lexical_populated} / ${total} (${((lexical_populated / total) * 100).toFixed(1)}%)`);
    console.log(`  ast_symbols: ${ast_populated} / ${total} (${((ast_populated / total) * 100).toFixed(1)}%)`);
    console.log(`  avg concept_coverage: ${avg_coverage_pct}%\n`);

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
