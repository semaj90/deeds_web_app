#!/usr/bin/env node
/**
 * Extract and analyze svelte-check errors
 * Works standalone or with SIMD service
 */

import { execSync } from 'child_process';
import { writeFileSync } from 'fs';

console.log('🔍 Extracting svelte-check errors...\n');

try {
  // Run svelte-check and capture errors
  const output = execSync('npx svelte-check --threshold error --output machine', {
    encoding: 'utf-8',
    maxBuffer: 50 * 1024 * 1024, // 50MB buffer
    cwd: process.cwd()
  });

  // Parse machine-readable output
  const lines = output.split('\n').filter(line => line.trim());
  const errors = [];
  const errorCounts = new Map();

  for (const line of lines) {
    // Format: file:line:col: error TS#### message
    const match = line.match(/^(.+?):(\d+):(\d+):\s+(error|warning)\s+(.+?):\s+(.+)$/);
    if (match) {
      const [, file, line, col, severity, code, message] = match;

      if (severity === 'error') {
        errors.push({
          file: file.replace(/\\/g, '/'),
          line: parseInt(line),
          col: parseInt(col),
          code,
          message: message.trim(),
          type: categorizeError(code, message)
        });

        // Count error patterns
        const pattern = `${code}: ${message.split(' ').slice(0, 5).join(' ')}...`;
        errorCounts.set(pattern, (errorCounts.get(pattern) || 0) + 1);
      }
    }
  }

  // Sort error counts
  const topErrors = Array.from(errorCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  // Generate report
  const report = {
    timestamp: new Date().toISOString(),
    totalErrors: errors.length,
    errorsByType: groupByType(errors),
    topPatterns: topErrors.map(([pattern, count]) => ({ pattern, count })),
    errors: errors
  };

  // Save report
  writeFileSync('svelte-errors.json', JSON.stringify(report, null, 2));

  // Print summary
  console.log(`✅ Extracted ${errors.length} errors`);
  console.log(`\n📊 Top Error Patterns:\n`);
  topErrors.slice(0, 10).forEach(([pattern, count], i) => {
    console.log(`${i + 1}. [${count}x] ${pattern}`);
  });

  console.log(`\n📁 Full report saved to: svelte-errors.json`);
  console.log(`\n🎯 Error Categories:`);
  for (const [type, count] of Object.entries(report.errorsByType)) {
    console.log(`   ${type}: ${count} errors`);
  }

  // Check if SIMD service is available
  try {
    const simdResponse = await fetch('http://localhost:8096/health');
    if (simdResponse.ok) {
      console.log('\n✅ SIMD service available - sending errors for optimization...');

      const simdResult = await fetch('http://localhost:8096/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report)
      });

      if (simdResult.ok) {
        const optimized = await simdResult.json();
        writeFileSync('svelte-errors-optimized.json', JSON.stringify(optimized, null, 2));
        console.log('✅ Optimized report saved to: svelte-errors-optimized.json');
      }
    }
  } catch (e) {
    console.log('\nℹ️  SIMD service not available - using standard parsing');
  }

} catch (error) {
  if (error.stdout) {
    // svelte-check succeeded but had errors
    console.log('✅ svelte-check completed with errors');
  } else {
    console.error('❌ Failed to run svelte-check:', error.message);
    process.exit(1);
  }
}

function categorizeError(code, message) {
  if (code.startsWith('TS')) {
    if (message.includes('expected')) return 'syntax';
    if (message.includes('Cannot find')) return 'import';
    if (message.includes('Type')) return 'type';
    if (message.includes('Property')) return 'property';
    return 'typescript';
  }
  return 'other';
}

function groupByType(errors) {
  const groups = {};
  for (const error of errors) {
    groups[error.type] = (groups[error.type] || 0) + 1;
  }
  return groups;
}