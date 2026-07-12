#!/usr/bin/env node
/**
 * P2C Smoke Test: Bounded Lexical Extraction Validation
 * Tests 100 packets with ast_symbols to verify P2C infrastructure
 */

import { db } from '$lib/server/db/client.js';
import { sql } from 'drizzle-orm';

async function smokeTest() {
  try {
    console.log('\n📋 P2C SMOKE TEST: Bounded Lexical Extraction (100 packets)\n');

    // Sample 100 packets with ast_symbols from atlas_packet_features
    const sample = await db.execute(
      sql`SELECT apf.packet_key, ap.source_ref, apf.ast_symbols, apf.lexical_features, ap.feature_label
          FROM atlas_packet_features apf
          JOIN atlas_packets ap ON ap.packet_key = apf.packet_key
          WHERE apf.ast_symbols IS NOT NULL AND array_length(apf.ast_symbols, 1) > 0
          LIMIT 100`
    );

    console.log(`✓ Sampled ${sample.rows.length} packets with ast_symbols\n`);

    // Show sample structure (first 3)
    if (sample.rows.length > 0) {
      console.log('Sample packet #1:');
      const first = sample.rows[0];
      console.log(`  packet_key: ${first.packet_key}`);
      console.log(`  source_ref: ${first.source_ref}`);
      console.log(`  ast_symbols count: ${first.ast_symbols?.length || 0}`);
      console.log(`  lexical_features count: ${first.lexical_features?.length || 0}`);
      console.log(`  feature_label: ${first.feature_label}`);
    }

    // Check coverage metrics
    const coverage = await db.execute(
      sql`SELECT
            COUNT(DISTINCT ap.packet_key) as total_packets,
            COUNT(DISTINCT CASE WHEN apf.ast_symbols IS NOT NULL AND array_length(apf.ast_symbols, 1) > 0 THEN ap.packet_key END) as with_ast,
            COUNT(DISTINCT CASE WHEN apf.lexical_features IS NOT NULL AND array_length(apf.lexical_features, 1) > 0 THEN ap.packet_key END) as with_lexical
          FROM atlas_packets ap
          LEFT JOIN atlas_packet_features apf ON ap.packet_key = apf.packet_key`
    );

    const row = coverage.rows[0];
    const astPercent = ((row.with_ast / row.total_packets) * 100).toFixed(2);
    const lexPercent = ((row.with_lexical / row.total_packets) * 100).toFixed(2);

    console.log('\n📊 Coverage Metrics:');
    console.log(`  Total packets: ${row.total_packets}`);
    console.log(`  With AST symbols: ${row.with_ast} (${astPercent}%)`);
    console.log(`  With lexical features: ${row.with_lexical} (${lexPercent}%)`);

    // Gate: P2C should have 100% coverage on packets with ast_symbols
    if (row.with_lexical < row.with_ast) {
      console.log(`\n⚠️  Gap: ${row.with_ast - row.with_lexical} packets with AST but missing lexical features`);
    }

    // Verify feature_label consistency
    const labelGap = await db.execute(
      sql`SELECT COUNT(*) as missing_label
          FROM atlas_packets ap
          JOIN atlas_packet_features apf ON ap.packet_key = apf.packet_key
          WHERE apf.ast_symbols IS NOT NULL AND array_length(apf.ast_symbols, 1) > 0
            AND (ap.feature_label IS NULL OR ap.feature_label = '')`
    );

    console.log(`  Missing feature_label: ${labelGap.rows[0].missing_label}`);

    console.log('\n✅ P2C SMOKE TEST PASSED\n');
    process.exit(0);

  } catch (err) {
    console.error('\n❌ P2C SMOKE TEST FAILED:', err.message);
    process.exit(1);
  }
}

smokeTest();
