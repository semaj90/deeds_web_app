#!/usr/bin/env node
/**
 * Test that the @atlas/duckdb package can be imported and initialized.
 * This verifies the package structure and module resolution.
 */

import {
  resolveDuckDBConfig,
  type AtlasDuckDBConfig
} from '../../../packages/atlas-duckdb/src/index.ts';

async function main() {
  console.log('🧪 Testing @atlas/duckdb package imports...\n');

  // Test 1: Config resolution
  console.log('✓ Test 1: Resolving DuckDB configuration');
  const config = resolveDuckDBConfig();
  console.log(`  Database path: ${config.databasePath}`);
  console.log(`  Threads: ${config.threads}`);
  console.log(`  Memory limit: ${config.memoryLimit}`);
  console.log(`  Temp directory: ${config.tempDirectory}`);
  console.log(`  Read-only: ${config.readOnly}`);

  // Test 2: Config with overrides
  console.log('\n✓ Test 2: Config with environment overrides');
  const configWithOverrides = resolveDuckDBConfig({
    threads: 8,
    memoryLimit: '8GB'
  });
  console.log(`  Threads (override): ${configWithOverrides.threads}`);
  console.log(`  Memory limit (override): ${configWithOverrides.memoryLimit}`);

  // Test 3: Check if duckdb can be required
  console.log('\n✓ Test 3: Verifying duckdb package availability');
  try {
    const Database = await import('duckdb').then(m => m.default);
    console.log(`  ✓ duckdb package loaded successfully`);
  } catch (e) {
    console.error(`  ✗ Failed to load duckdb package:`, (e as Error).message);
    process.exit(1);
  }

  console.log('\n✅ All import tests passed!');
  console.log('\nNext: Run npm run atlas:duckdb:snapshot:verify to build the snapshot');
}

main().catch(err => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
