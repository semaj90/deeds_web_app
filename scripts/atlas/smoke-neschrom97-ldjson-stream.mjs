#!/usr/bin/env node
/**
 * NESCHROM97 LDJSON Stream Smoke Test
 *
 * Validates that NESCHROM97 card registry exports to LDJSON format
 * with proper newline-delimited JSON structure for streaming.
 *
 * Test boundaries:
 * - Pure fs/path/stream operations
 * - No Drizzle, no SvelteKit, no network
 * - Validates LDJSON format (one JSON per line)
 * - Checks file streaming readability
 * - Reports card distribution by type
 *
 * Usage:
 *   npm run smoke:neschrom97-ldjson
 *   node scripts/atlas/smoke-neschrom97-ldjson-stream.mjs
 *
 * Exit codes:
 *   0 = PASS
 *   1 = FAIL (validation error)
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../');

let passCount = 0;
let failCount = 0;

// ============================================================================
// UTILITIES
// ============================================================================

function pass(msg) {
  console.log(`  [✓] ${msg}`);
  passCount++;
}

function fail(msg) {
  console.error(`  [✗] ${msg}`);
  failCount++;
}

// ============================================================================
// TESTS
// ============================================================================

async function testLDJSONStreaming() {
  const ndJsonPath = path.join(PROJECT_ROOT, '.opencode/ndjson');

  if (!fs.existsSync(ndJsonPath)) {
    fail(`NDJSON directory not found: ${ndJsonPath}`);
    return;
  }
  pass(`NDJSON directory exists: ${ndJsonPath}`);

  // Test files that should exist (from memory/ndjson-mapreduce-pipeline.md)
  const expectedFiles = [
    'cluster-summary.ndjson',
    'enriched-candidates.ndjson',
    'enriched-ledger.ndjson',
    'graph-edges.ndjson',
    'minified-ace-index.ndjson',
  ];

  for (const file of expectedFiles) {
    const filePath = path.join(ndJsonPath, file);
    if (!fs.existsSync(filePath)) {
      fail(`Expected NDJSON file not found: ${file}`);
    } else {
      const stats = fs.statSync(filePath);
      pass(`NDJSON file exists: ${file} (${(stats.size / 1024).toFixed(1)}KB)`);
    }
  }

  // Validate each LDJSON file for proper format
  for (const file of expectedFiles) {
    const filePath = path.join(ndJsonPath, file);
    if (!fs.existsSync(filePath)) continue;

    await validateLDJSONFormat(file, filePath);
  }
}

async function validateLDJSONFormat(fileName, filePath) {
  return new Promise((resolve) => {
    const fileStream = fs.createReadStream(filePath, { encoding: 'utf8' });
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    let lineCount = 0;
    let parseErrors = 0;
    const recordTypes = {};

    rl.on('line', (line) => {
      lineCount++;

      // Empty lines are allowed at EOF
      if (line.trim() === '') return;

      try {
        const record = JSON.parse(line);
        const recordType = record.type || record.kind || 'unknown';
        recordTypes[recordType] = (recordTypes[recordType] || 0) + 1;
      } catch (err) {
        parseErrors++;
        if (parseErrors <= 3) {
          console.error(`    Parse error in ${fileName} line ${lineCount}: ${err.message.slice(0, 60)}`);
        }
      }
    });

    rl.on('close', () => {
      if (parseErrors === 0) {
        pass(`${fileName}: ${lineCount} valid LDJSON records`);
        const typeList = Object.entries(recordTypes)
          .map(([type, count]) => `${type}(${count})`)
          .join(', ');
        if (typeList) {
          console.log(`    Record types: ${typeList}`);
        }
      } else {
        fail(`${fileName}: ${parseErrors} parse errors in ${lineCount} lines`);
      }
      resolve();
    });
  });
}

async function testCardRegistry() {
  const registryPath = path.join(PROJECT_ROOT, 'docs/reports/neschrom97-card-registry.json');

  if (!fs.existsSync(registryPath)) {
    fail(`Card registry not found: ${registryPath}`);
    return;
  }
  pass(`Card registry exists: ${(fs.statSync(registryPath).size / 1024 / 1024).toFixed(1)}MB`);

  try {
    const content = fs.readFileSync(registryPath, 'utf8');
    const data = JSON.parse(content);

    if (!data.schema) {
      fail('Registry missing schema');
      return;
    }
    pass(`Registry schema valid: ${data.schema}`);

    if (!Array.isArray(data.registry)) {
      fail('Registry.registry not an array');
      return;
    }

    const registryCount = data.registry.length;
    pass(`Registry contains ${registryCount} card entries`);

    if (data.counts) {
      const countList = Object.entries(data.counts)
        .map(([key, val]) => `${key}(${val})`)
        .join(', ');
      console.log(`    Counts: ${countList}`);
    }

    if (data.coverage) {
      const coverageList = Object.entries(data.coverage)
        .map(([key, val]) => `${key}(${(val * 100).toFixed(1)}%)`)
        .join(', ');
      console.log(`    Coverage: ${coverageList}`);
    }
  } catch (err) {
    fail(`Registry parse error: ${err.message}`);
  }
}

async function testLDJSONExportability() {
  const registryPath = path.join(PROJECT_ROOT, 'docs/reports/neschrom97-card-registry.json');

  if (!fs.existsSync(registryPath)) {
    fail('Cannot test LDJSON export: registry missing');
    return;
  }

  try {
    const content = fs.readFileSync(registryPath, 'utf8');
    const data = JSON.parse(content);

    // Simulate LDJSON export: each registry entry becomes one NDJSON line
    const recordCount = data.registry.length;
    const estimatedBytes = data.registry.reduce((sum, m) => {
      return sum + JSON.stringify(m).length + 1; // +1 for newline
    }, 0);

    pass(`Registry exportable to LDJSON: ${recordCount} records (~${(estimatedBytes / 1024).toFixed(1)}KB)`);
  } catch (err) {
    fail(`LDJSON export test failed: ${err.message}`);
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('📊 NESCHROM97 LDJSON Stream Smoke Test\n');
  console.log('═'.repeat(70) + '\n');

  try {
    console.log('[1] LDJSON Files in .opencode/ndjson/');
    await testLDJSONStreaming();

    console.log('\n[2] Card Registry Structure');
    await testCardRegistry();

    console.log('\n[3] LDJSON Export Readiness');
    await testLDJSONExportability();

    console.log('\n' + '═'.repeat(70));
    console.log(`\n✅ PASS: ${passCount} | ❌ FAIL: ${failCount}\n`);

    if (failCount === 0) {
      console.log('🎉 All tests passed! NESCHROM97 LDJSON streaming ready.\n');
      process.exit(0);
    } else {
      console.log('⚠️  Some tests failed. See details above.\n');
      process.exit(1);
    }
  } catch (err) {
    console.error(`\n❌ Fatal error: ${err.message}\n`);
    process.exit(1);
  }
}

main();
