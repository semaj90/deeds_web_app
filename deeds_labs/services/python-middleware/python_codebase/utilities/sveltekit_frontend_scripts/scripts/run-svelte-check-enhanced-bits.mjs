#!/usr/bin/env node
/**
 * Enhanced Svelte Check with Bits UI Support
 * Runs svelte-check with enhanced error reporting and Bits UI compatibility
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';

console.log('🔍 Running Enhanced Svelte Check with Bits UI Support...\n');

// Check if svelte-check is available
try {
  execSync('npx svelte-check --version', { stdio: 'ignore' });
} catch (error) {
  console.error('❌ svelte-check not found. Installing...');
  execSync('npm install -D @tsconfig/svelte typescript svelte-check', { stdio: 'inherit' });
}

// Enhanced svelte-check with specific configurations
const checkCommand = [
  'npx svelte-check',
  '--tsconfig ./tsconfig.json',
  '--threshold error',
  '--diagnostic-sources js,svelte,ts',
  '--fail-on-warnings false'
].join(' ');

console.log(`Running: ${checkCommand}\n`);

try {
  const output = execSync(checkCommand, {
    encoding: 'utf-8',
    stdio: 'pipe',
    maxBuffer: 1024 * 1024 * 10 // 10MB buffer
  });

  // Parse and enhance output
  const lines = output.split('\n');
  let errorCount = 0;
  let warningCount = 0;
  let bitsUIIssues = 0;

  console.log('📊 Enhanced Svelte Check Results:\n');

  lines.forEach(line => {
    if (line.includes('Error:') || line.includes('error TS')) {
      errorCount++;
      // Highlight Bits UI related errors
      if (line.includes('bits-ui') || line.includes('Popover') || line.includes('Dropdown')) {
        bitsUIIssues++;
        console.log(`🔧 BITS-UI: ${line}`);
      } else {
        console.log(`❌ ${line}`);
      }
    } else if (line.includes('Warning:') || line.includes('warning')) {
      warningCount++;
      console.log(`⚠️  ${line}`);
    } else if (line.trim() && !line.includes('Loading') && !line.includes('Getting')) {
      console.log(`ℹ️  ${line}`);
    }
  });

  // Summary
  console.log('\n📋 SUMMARY:');
  console.log(`✅ Svelte check completed`);
  console.log(`📊 Total errors: ${errorCount}`);
  console.log(`📊 Total warnings: ${warningCount}`);
  console.log(`🔧 Bits UI issues: ${bitsUIIssues}`);

  if (bitsUIIssues > 0) {
    console.log('\n💡 Bits UI Tips:');
    console.log('   • Import Popover as namespace: import * as Popover from "bits-ui/popover"');
    console.log('   • Use Popover.Root, Popover.Trigger, Popover.Content');
    console.log('   • Check melt-ui compatibility with Svelte 5 runes');
  }

  if (errorCount === 0) {
    console.log('\n🎉 No errors found! Your Svelte code is clean.');
    process.exit(0);
  } else {
    console.log(`\n⚠️  Found ${errorCount} errors that need attention.`);
    process.exit(1);
  }

} catch (error) {
  console.error('❌ Svelte check failed:');
  console.error(error.stdout || error.message);

  // Try to provide helpful error context
  if (error.stdout && error.stdout.includes('Cannot find module')) {
    console.log('\n💡 Try running: npm install');
  }

  if (error.stdout && error.stdout.includes('bits-ui')) {
    console.log('\n💡 Bits UI import issue detected. Check import statements.');
  }

  process.exit(1);
}