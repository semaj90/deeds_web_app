#!/usr/bin/env node
/**
 * Simple svelte-check error parser
 * Works with actual terminal output format
 */

import { execSync } from 'child_process';
import { writeFileSync } from 'fs';

console.log('🔍 Running svelte-check and parsing errors...\n');

try {
  const output = execSync('npx svelte-check --threshold error', {
    encoding: 'utf-8',
    maxBuffer: 50 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe']
  });
} catch (error) {
  // svelte-check exits with code 1 when there are errors
  const output = error.stdout || error.message;
  parseErrors(output);
}

function parseErrors(output) {
  const lines = output.split('\n');
  const errors = [];
  const errorCounts = new Map();

  let currentFile = '';
  let currentLine = 0;
  let currentCol = 0;
  let currentMessage = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Match file:line:col pattern
    const fileMatch = line.match(/^(.+\.svelte):(\d+):(\d+)$/);
    if (fileMatch) {
      currentFile = fileMatch[1].replace(/\\/g, '/');
      currentLine = parseInt(fileMatch[2]);
      currentCol = parseInt(fileMatch[3]);
      continue;
    }

    // Match "Error: message (ts)" pattern
    const errorMatch = line.match(/Error:\s+(.+?)\s+\((ts|svelte)\)/);
    if (errorMatch && currentFile) {
      currentMessage = errorMatch[1].trim();
      const type = errorMatch[2];

      const error = {
        file: currentFile,
        line: currentLine,
        col: currentCol,
        message: currentMessage,
        type: categorizeError(currentMessage),
        sourceType: type
      };

      errors.push(error);

      // Count patterns
      const pattern = currentMessage.split(' ').slice(0, 6).join(' ') + '...';
      errorCounts.set(pattern, (errorCounts.get(pattern) || 0) + 1);

      // Reset
      currentFile = '';
      continue;
    }
  }

  // Generate report
  const errorsByType = {};
  for (const error of errors) {
    errorsByType[error.type] = (errorsByType[error.type] || 0) + 1;
  }

  const topPatterns = Array.from(errorCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30);

  const report = {
    timestamp: new Date().toISOString(),
    totalErrors: errors.length,
    errorsByType,
    topPatterns: topPatterns.map(([pattern, count]) => ({ pattern, count })),
    errors: errors.slice(0, 100) // First 100 for review
  };

  // Save report
  writeFileSync('svelte-errors.json', JSON.stringify(report, null, 2));

  // Print summary
  console.log(`✅ Extracted ${errors.length} errors\n`);
  console.log(`📊 Top Error Patterns:\n`);
  topPatterns.slice(0, 15).forEach(([pattern, count], i) => {
    console.log(`  ${i + 1}. [${count}x] ${pattern}`);
  });

  console.log(`\n🎯 Error Categories:`);
  for (const [type, count] of Object.entries(errorsByType)) {
    console.log(`   ${type.padEnd(15)}: ${count} errors`);
  }

  console.log(`\n📁 Full report: svelte-errors.json`);
  console.log(`📝 Total analyzed: ${errors.length} errors`);
}

function categorizeError(message) {
  const lower = message.toLowerCase();

  if (lower.includes('cannot find name')) return 'missing-var';
  if (lower.includes('expected')) return 'syntax';
  if (lower.includes('type') && lower.includes('not assignable')) return 'type-mismatch';
  if (lower.includes('property') && lower.includes('does not exist')) return 'missing-prop';
  if (lower.includes('import')) return 'import';
  if (lower.includes('duplicate')) return 'duplicate';
  if (lower.includes('$state') || lower.includes('$derived') || lower.includes('$props')) return 'svelte-5';
  if (lower.includes('not declared')) return 'not-declared';

  return 'other';
}
