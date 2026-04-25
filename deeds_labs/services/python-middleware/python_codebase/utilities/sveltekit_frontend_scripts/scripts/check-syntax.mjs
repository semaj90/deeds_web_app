#!/usr/bin/env node

import { execSync } from 'child_process';
import fg from 'fast-glob';
import { cpus } from 'os';
import path from 'path';

const BATCH_SIZE = 5; // Much smaller batches to avoid command line limits

async function checkSyntax() {
  console.log('🔍 Starting TypeScript syntax validation...\n');

  // Get all TypeScript/JavaScript files
  const files = fg.sync([
    'src/**/*.{ts,tsx,js,jsx,svelte}',
    '!src/**/*.d.ts', // Skip declaration files
    '!src/**/node_modules/**'
  ]);

  console.log(`� Found ${files.length} files to check\n`);

  const errors = [];
  const batches = [];

  // Create smaller batches
  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    batches.push(files.slice(i, i + BATCH_SIZE));
  }

  console.log(`📦 Created ${batches.length} batches of max ${BATCH_SIZE} files each\n`);

  // Process batches sequentially
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    const batchNum = i + 1;

    console.log(`🔍 Checking batch ${batchNum}/${batches.length} (${batch.length} files)...`);

    try {
      const command = `npx tsc --noEmit --skipLibCheck ${batch.join(' ')}`;
      execSync(command, {
        stdio: 'pipe',
        cwd: process.cwd(),
        timeout: 15000 // 15 second timeout per batch
      });
      console.log(`✅ Batch ${batchNum}: No errors\n`);
    } catch (error) {
      const errorOutput = error.stdout?.toString() || error.stderr?.toString() || '';
      const errorCount = (errorOutput.match(/error TS\d+:/g) || []).length;

      console.log(`❌ Batch ${batchNum}: ${errorCount} errors\n`);

      if (errorCount > 0) {
        errors.push({
          batch: batchNum,
          files: batch,
          errorCount,
          errors: errorOutput.slice(0, 1000) // Limit error output
        });
      }
    }
  }

  // Summary
  console.log('📋 SUMMARY:');
  console.log('='.repeat(50));

  if (errors.length === 0) {
    console.log('🎉 No TypeScript errors found!');
    return;
  }

  console.log(`❌ Found errors in ${errors.length} batches:`);

  // Sort by error count descending
  errors.sort((a, b) => b.errorCount - a.errorCount);

  errors.slice(0, 10).forEach((error, index) => {
    console.log(`${index + 1}. Batch ${error.batch}: ${error.errorCount} errors`);
    console.log(`   Files: ${error.files.slice(0, 3).join(', ')}${error.files.length > 3 ? '...' : ''}`);
  });

  const totalErrors = errors.reduce((sum, e) => sum + e.errorCount, 0);
  console.log(`\n💥 Total errors: ${totalErrors}`);

  // Save detailed error report
  const report = {
    timestamp: new Date().toISOString(),
    totalBatches: batches.length,
    errorBatches: errors.length,
    totalErrors,
    topErrorBatches: errors.slice(0, 5).map(e => ({
      batch: e.batch,
      errorCount: e.errorCount,
      files: e.files
    }))
  };

  const fs = await import('fs');
  fs.writeFileSync('syntax-errors-report.json', JSON.stringify(report, null, 2));
  console.log('\n📄 Detailed report saved to: syntax-errors-report.json');
}

checkSyntax().catch(console.error);