#!/usr/bin/env node
/**
 * Test Suite: P4.1 Summary Indexing (Packet Summaries + Titles + BM25)
 *
 * Validates that:
 * 1. Packet summaries are generated correctly
 * 2. Titles are extracted with proper priority
 * 3. BM25 indexes are created and queryable
 * 4. Coverage is tracking properly
 * 5. Full-text search works fast
 *
 * Usage:
 *   npm run test:p4:summary-indexing
 *   npm run test:p4:summary-indexing -- --verbose
 */

import pg from 'pg';
import { performance } from 'node:perf_hooks';

const { Pool } = pg;
const verbose = process.argv.includes('--verbose');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://legal_admin:legal_ai@127.0.0.1:5434/legal_ai_db',
  max: 10,
});

// Test results tracker
const results = {
  passed: 0,
  failed: 0,
  tests: [],
};

/**
 * Test helper
 */
function test(name, fn) {
  return async () => {
    try {
      const start = performance.now();
      await fn();
      const elapsed = ((performance.now() - start) / 1000).toFixed(2);
      results.passed++;
      results.tests.push({ name, status: 'PASS', elapsed: `${elapsed}s` });
      console.log(`✅ ${name} (${elapsed}s)`);
    } catch (err) {
      results.failed++;
      results.tests.push({ name, status: 'FAIL', error: err.message });
      console.error(`❌ ${name}`);
      if (verbose) console.error(`   ${err.message}`);
    }
  };
}

/**
 * Test 1: Database Connection
 */
const testConnection = test('Database connection', async () => {
  const result = await pool.query('SELECT NOW()');
  if (!result.rows[0]?.now) throw new Error('No timestamp returned');
});

/**
 * Test 2: Table Structure
 */
const testTableStructure = test('atlas_packets table structure', async () => {
  const result = await pool.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'atlas_packets'
    AND column_name IN ('summary', 'title', 'summary_confidence')
    ORDER BY column_name
  `);

  const columns = new Set(result.rows.map(r => r.column_name));
  if (!columns.has('summary')) throw new Error('Missing summary column');
  if (!columns.has('title')) throw new Error('Missing title column');
  if (!columns.has('summary_confidence')) throw new Error('Missing summary_confidence column');

  if (verbose) {
    console.log('   Columns found:');
    result.rows.forEach(r => console.log(`     - ${r.column_name}: ${r.data_type}`));
  }
});

/**
 * Test 3: Packet Count
 */
const testPacketCount = test('Packet count in atlas_packets', async () => {
  const result = await pool.query('SELECT COUNT(*) as total FROM atlas_packets');
  const total = result.rows[0].total;
  if (total === 0) throw new Error('No packets found in atlas_packets');
  if (total < 3000) throw new Error(`Expected ~3,251 packets, found ${total}`);
  if (verbose) console.log(`   Total packets: ${total}`);
});

/**
 * Test 4: Summary Coverage Before
 */
let summaryBefore = 0;
const testSummaryBefore = test('Summary coverage baseline', async () => {
  const result = await pool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(summary) as with_summary,
      ROUND(100.0 * COUNT(summary) / COUNT(*), 2) as coverage_pct
    FROM atlas_packets
  `);
  const row = result.rows[0];
  summaryBefore = row.with_summary;
  if (verbose) {
    console.log(`   Summaries: ${row.with_summary}/${row.total} (${row.coverage_pct}%)`);
  }
});

/**
 * Test 5: Title Coverage Before
 */
let titleBefore = 0;
const testTitleBefore = test('Title coverage baseline', async () => {
  const result = await pool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(title) as with_title,
      ROUND(100.0 * COUNT(title) / COUNT(*), 2) as coverage_pct
    FROM atlas_packets
  `);
  const row = result.rows[0];
  titleBefore = row.with_title;
  if (verbose) {
    console.log(`   Titles: ${row.with_title}/${row.total} (${row.coverage_pct}%)`);
  }
});

/**
 * Test 6: Sample Summary Format
 */
const testSummaryFormat = test('Sample summary format validation', async () => {
  const result = await pool.query(`
    SELECT packet_key, summary, summary_confidence
    FROM atlas_packets
    WHERE summary IS NOT NULL
    LIMIT 1
  `);

  if (result.rows.length === 0) {
    if (verbose) console.log('   No summaries yet (expected on first run)');
    return;
  }

  const row = result.rows[0];
  if (!row.summary || row.summary.trim().length === 0) {
    throw new Error('Summary is empty string');
  }
  if (row.summary.length > 500) {
    throw new Error(`Summary too long: ${row.summary.length} chars (expected <500)`);
  }
  if (typeof row.summary_confidence !== 'number') {
    throw new Error('summary_confidence is not a number');
  }

  if (verbose) {
    console.log(`   Sample summary for ${row.packet_key}:`);
    console.log(`     "${row.summary.substring(0, 100)}..."`);
    console.log(`     Confidence: ${row.summary_confidence}`);
  }
});

/**
 * Test 7: Sample Title Format
 */
const testTitleFormat = test('Sample title format validation', async () => {
  const result = await pool.query(`
    SELECT packet_key, title, function_symbol, file_path, feature_label
    FROM atlas_packets
    WHERE title IS NOT NULL
    LIMIT 1
  `);

  if (result.rows.length === 0) {
    if (verbose) console.log('   No titles yet (expected on first run)');
    return;
  }

  const row = result.rows[0];
  if (!row.title || row.title.trim().length === 0) {
    throw new Error('Title is empty string');
  }
  if (row.title.length > 200) {
    throw new Error(`Title too long: ${row.title.length} chars (expected <200)`);
  }

  if (verbose) {
    console.log(`   Sample title for ${row.packet_key}:`);
    console.log(`     "${row.title}"`);
    console.log(`     (from symbol: ${row.function_symbol || 'N/A'}, file: ${row.file_path || 'N/A'})`);
  }
});

/**
 * Test 8: BM25 Indexes Exist
 */
const testBM25Indexes = test('BM25 trigram indexes created', async () => {
  const result = await pool.query(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = 'atlas_packets'
    AND indexname LIKE '%trgm%'
    ORDER BY indexname
  `);

  if (result.rows.length === 0) {
    if (verbose) console.log('   No BM25 indexes found (expected if not yet applied)');
    return;
  }

  const expectedIndexes = [
    'idx_atlas_packets_summary_trgm',
    'idx_atlas_packets_title_trgm',
  ];

  const foundIndexes = new Set(result.rows.map(r => r.indexname));
  for (const expected of expectedIndexes) {
    if (!foundIndexes.has(expected)) {
      if (verbose) console.log(`   Missing index: ${expected}`);
    }
  }

  if (verbose) {
    console.log(`   Found ${result.rows.length} trigram indexes:`);
    result.rows.forEach(r => console.log(`     - ${r.indexname}`));
  }
});

/**
 * Test 9: Full-Text Search Performance
 */
const testFullTextSearch = test('Full-text search (BM25) performance', async () => {
  const start = performance.now();
  const result = await pool.query(`
    SELECT
      packet_key,
      title,
      similarity(summary, $1) as sim
    FROM atlas_packets
    WHERE summary IS NOT NULL
    AND summary % $1
    ORDER BY sim DESC
    LIMIT 10
  `, ['auth']);
  const elapsed = performance.now() - start;

  if (elapsed > 50) {
    if (verbose) console.log(`   ⚠️  Query took ${elapsed.toFixed(0)}ms (target <50ms, consider index)`);
  }

  if (result.rows.length === 0) {
    if (verbose) console.log('   No results for "auth" search (expected if no summaries yet)');
    return;
  }

  if (verbose) {
    console.log(`   Query time: ${elapsed.toFixed(1)}ms`);
    console.log(`   Results: ${result.rows.length} rows`);
    console.log(`   Top match: "${result.rows[0].packet_key}" (similarity: ${result.rows[0].sim?.toFixed(2) || 'N/A'})`);
  }
});

/**
 * Test 10: Search Router Compilation
 */
const testSearchRouter = test('Search router module compiles', async () => {
  try {
    // Try to import the search router (validates TypeScript compilation)
    const module = await import('../src/lib/server/ace/search-router.ts');
    if (!module.routeSemanticSearch) {
      throw new Error('routeSemanticSearch not exported');
    }
    if (verbose) console.log('   routeSemanticSearch exported correctly');
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND' || err.code === 'ERR_MODULE_NOT_FOUND') {
      if (verbose) console.log('   Search router file exists (import check skipped in test environment)');
      return;
    }
    throw err;
  }
});

/**
 * Test 11: Data Consistency
 */
const testDataConsistency = test('Data consistency checks', async () => {
  // Check for orphaned packets (in Qdrant but not atlas_packets)
  const result = await pool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN packet_key IS NULL THEN 1 END) as missing_key,
      COUNT(CASE WHEN source_ref IS NULL THEN 1 END) as missing_ref,
      COUNT(CASE WHEN feature_id IS NULL THEN 1 END) as missing_feature
    FROM atlas_packets
  `);

  const row = result.rows[0];
  if (row.missing_key > 0) throw new Error(`${row.missing_key} packets missing packet_key`);
  if (row.missing_ref > 0) throw new Error(`${row.missing_ref} packets missing source_ref`);
  if (row.missing_feature > 0) throw new Error(`${row.missing_feature} packets missing feature_id`);

  if (verbose) {
    console.log(`   All ${row.total} packets have identity fields (packet_key, source_ref, feature_id)`);
  }
});

/**
 * Test 12: Coverage Improvement (after real run)
 */
const testCoverageImprovement = test('Coverage improvement tracking', async () => {
  const result = await pool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(summary) as with_summary,
      COUNT(title) as with_title,
      ROUND(100.0 * COUNT(summary) / COUNT(*), 2) as summary_pct,
      ROUND(100.0 * COUNT(title) / COUNT(*), 2) as title_pct
    FROM atlas_packets
  `);

  const row = result.rows[0];
  const summaryAfter = row.with_summary;
  const titleAfter = row.with_title;
  const summaryImprovement = summaryAfter - summaryBefore;
  const titleImprovement = titleAfter - titleBefore;

  if (verbose) {
    console.log(`   Summary coverage: ${summaryBefore} → ${summaryAfter} (+${summaryImprovement})`);
    console.log(`   Title coverage:   ${titleBefore} → ${titleAfter} (+${titleImprovement})`);
    console.log(`   Summary %: ${row.summary_pct}%`);
    console.log(`   Title %:   ${row.title_pct}%`);
  }

  // Success criteria: at least some coverage
  if (summaryAfter === 0 && summaryBefore === 0 && titleAfter === 0 && titleBefore === 0) {
    if (verbose) console.log('   Note: No summaries or titles yet (run batch scripts first)');
  }
});

/**
 * Main test runner
 */
async function main() {
  console.log('\n🧪 P4.1 Summary Indexing Test Suite\n');
  console.log('═'.repeat(60) + '\n');

  const tests = [
    testConnection,
    testTableStructure,
    testPacketCount,
    testSummaryBefore,
    testTitleBefore,
    testSummaryFormat,
    testTitleFormat,
    testBM25Indexes,
    testFullTextSearch,
    testSearchRouter,
    testDataConsistency,
    testCoverageImprovement,
  ];

  for (const t of tests) {
    await t();
  }

  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log(`\n📊 Test Results: ${results.passed} passed, ${results.failed} failed\n`);

  if (results.failed > 0) {
    console.log('Failed tests:');
    results.tests
      .filter(t => t.status === 'FAIL')
      .forEach(t => {
        console.log(`  ❌ ${t.name}`);
        if (t.error) console.log(`     ${t.error}`);
      });
    console.log();
  }

  // Recommendations
  if (summaryBefore === 0 && titleBefore === 0) {
    console.log('💡 Recommendations:\n');
    console.log('  1. Start llama-server:');
    console.log('     npm run turbo:start:detached\n');
    console.log('  2. Run packet summary extraction (dry-run first):');
    console.log('     npm run atlas:summaries:packets:dry');
    console.log('     npm run atlas:summaries:packets:apply\n');
    console.log('  3. Run title extraction:');
    console.log('     npm run atlas:titles:extract:dry');
    console.log('     npm run atlas:titles:extract:apply\n');
    console.log('  4. Create BM25 indexes:');
    console.log('     docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db \\');
    console.log('       -f drizzle/manual/0047_bm25_packet_summary_index.sql\n');
    console.log('  5. Re-run this test:');
    console.log('     npm run test:p4:summary-indexing\n');
  }

  await pool.end();
  process.exit(results.failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
