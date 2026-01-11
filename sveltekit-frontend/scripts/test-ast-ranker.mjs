#!/usr/bin/env node
/**
 * Quick test of Phase 78 AST-Aware Ranking System
 * Validates that the system can parse errors and generate rankings
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m'
};

function log(msg, color = colors.reset) {
  console.log(`${color}${msg}${colors.reset}`);
}

async function runTest() {
  log('\n🧪 Testing Phase 78 AST-Aware Ranking System\n', colors.cyan);

  // Test 1: Check if svelte-check log exists
  log('1. Checking svelte-check log...', colors.yellow);
  const logPath = path.join(projectRoot, 'logs', 'svelte-check.log');

  if (!fs.existsSync(logPath)) {
    log('   ⚠️  Log not found, generating...', colors.yellow);
    try {
      execSync('npx svelte-check > logs/svelte-check.log 2>&1', {
        cwd: projectRoot,
        stdio: 'ignore'
      });
      log('   ✅ Generated svelte-check.log', colors.green);
    } catch (err) {
      // svelte-check exits with error code when errors found - this is expected
      log('   ✅ Generated svelte-check.log (with errors, expected)', colors.green);
    }
  } else {
    log('   ✅ Found existing log', colors.green);
  }

  // Test 2: Run AST ranker on top 10 files
  log('\n2. Running AST ranker (top 10 files)...', colors.yellow);
  try {
    execSync('npx tsx scripts/phase78-ast-aware-ranker.mts --top=10', {
      cwd: projectRoot,
      stdio: 'inherit'
    });
    log('   ✅ AST ranker completed', colors.green);
  } catch (err) {
    log('   ❌ AST ranker failed', colors.red);
    throw err;
  }

  // Test 3: Verify output file exists
  log('\n3. Verifying output...', colors.yellow);
  const outputPath = path.join(projectRoot, 'svelte-check-errors-index', 'ast-ranked-errors.json');

  if (!fs.existsSync(outputPath)) {
    log('   ❌ Output file not found', colors.red);
    throw new Error('ast-ranked-errors.json not generated');
  }

  const output = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));

  log(`   ✅ Output file exists`, colors.green);
  log(`   📊 Files analyzed: ${output.metadata.totalFiles}`, colors.cyan);
  log(`   📊 Total errors: ${output.metadata.totalErrors}`, colors.cyan);
  log(`   📊 Error clusters: ${output.metadata.totalClusters}`, colors.cyan);

  // Test 4: Validate data structure
  log('\n4. Validating data structure...', colors.yellow);

  if (!output.rankedErrors || output.rankedErrors.length === 0) {
    log('   ❌ No ranked errors found', colors.red);
    throw new Error('rankedErrors array is empty');
  }

  const sampleError = output.rankedErrors[0];
  const requiredFields = ['file', 'line', 'message', 'priorityScore', 'astContext', 'dependencyImpact', 'fixComplexity'];

  for (const field of requiredFields) {
    if (!(field in sampleError)) {
      log(`   ❌ Missing field: ${field}`, colors.red);
      throw new Error(`Required field missing: ${field}`);
    }
  }

  log('   ✅ All required fields present', colors.green);
  log(`   📊 Top priority error: ${sampleError.file}:${sampleError.line}`, colors.cyan);
  log(`   📊 Priority score: ${sampleError.priorityScore.toFixed(1)}`, colors.cyan);
  log(`   📊 Fix difficulty: ${sampleError.fixComplexity.difficulty}`, colors.cyan);

  // Test 5: Validate clusters
  log('\n5. Validating clusters...', colors.yellow);

  if (!output.clusters || output.clusters.length === 0) {
    log('   ⚠️  No clusters generated (might be ok if errors are diverse)', colors.yellow);
  } else {
    log(`   ✅ Generated ${output.clusters.length} clusters`, colors.green);
    const topCluster = output.clusters[0];
    log(`   📊 Largest cluster: ${topCluster.count} errors`, colors.cyan);
    log(`   📊 Average priority: ${topCluster.averagePriority.toFixed(1)}`, colors.cyan);
  }

  // Success summary
  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.green);
  log('✅ ALL TESTS PASSED', colors.green);
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', colors.green);

  log('\n📋 Next steps:', colors.cyan);
  log('  1. Review rankings: cat svelte-check-errors-index/ast-ranked-errors.json | jq', colors.reset);
  log('  2. Run full pipeline: npm run phase78:full', colors.reset);
  log('  3. Start fixing: Focus on errors with priority score > 90', colors.reset);
}

runTest().catch(err => {
  log(`\n❌ Test failed: ${err.message}`, colors.red);
  process.exit(1);
});
