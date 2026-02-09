#!/usr/bin/env node

import { execSync } from 'child_process';
import { writeFileSync } from 'fs';

console.log('🔍 Running svelte-check and analyzing errors...\n');

try {
  // Run svelte-check and capture output
  const output = execSync('npm run check', {
    cwd: './sveltekit-frontend',
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024, // 50MB buffer
    stdio: ['pipe', 'pipe', 'pipe']
  }).toString();

  analyzeErrors(output);
} catch (error) {
  // svelte-check exits with non-zero when errors found
  if (error.stdout || error.stderr) {
    const output = (error.stdout || '') + (error.stderr || '');
    analyzeErrors(output);
  } else {
    console.error('Failed to run svelte-check:', error.message);
    process.exit(1);
  }
}

function analyzeErrors(output) {
  const lines = output.split('\n');

  // Storage
  const errorsByType = new Map();
  const errorsByFile = new Map();
  const errorDetails = [];

  let currentFile = '';
  let currentError = null;

  // Parse output
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Extract file path: path/file.svelte:line:col
    const fileMatch = line.match(/([a-zA-Z]:[^\s]+\.(svelte|ts|js)):(\d+):(\d+)/);
    if (fileMatch) {
      currentFile = fileMatch[1];
      const lineNum = fileMatch[3];
      const colNum = fileMatch[4];

      // Next line usually has Error: or Warn:
      if (i + 1 < lines.length) {
        const nextLine = lines[i + 1];
        const errorMatch = nextLine.match(/^\s*(Error|Warn):\s*(.+?)(?:\s+\(|$)/);

        if (errorMatch) {
          const severity = errorMatch[1];
          const message = errorMatch[2].trim();

          if (severity === 'Error') {
            // Count by type
            errorsByType.set(message, (errorsByType.get(message) || 0) + 1);

            // Count by file
            errorsByFile.set(currentFile, (errorsByFile.get(currentFile) || 0) + 1);

            // Store detail
            errorDetails.push({
              file: currentFile,
              line: lineNum,
              col: colNum,
              message: message
            });
          }
        }
      }
    }
  }

  // Extract summary
  const summaryMatch = output.match(/found (\d+) errors and (\d+) warnings in (\d+) files/);
  const totalErrors = summaryMatch ? parseInt(summaryMatch[1]) : errorDetails.length;
  const totalWarnings = summaryMatch ? parseInt(summaryMatch[2]) : 0;
  const totalFiles = summaryMatch ? parseInt(summaryMatch[3]) : errorsByFile.size;

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  SVELTE-CHECK ERROR ANALYSIS');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log(`📊 SUMMARY:`);
  console.log(`   Total Errors:   ${totalErrors}`);
  console.log(`   Total Warnings: ${totalWarnings}`);
  console.log(`   Affected Files: ${totalFiles}\n`);

  // Top error patterns
  console.log('🔥 TOP 30 ERROR PATTERNS:\n');
  const sortedPatterns = Array.from(errorsByType.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30);

  sortedPatterns.forEach(([pattern, count], i) => {
    const pct = ((count / totalErrors) * 100).toFixed(1);
    console.log(`${String(i + 1).padStart(2)}. [${String(count).padStart(4)}x] ${pct.padStart(5)}% │ ${pattern}`);
  });

  // Top error files
  console.log('\n\n📁 TOP 30 FILES BY ERROR COUNT:\n');
  const sortedFiles = Array.from(errorsByFile.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30);

  sortedFiles.forEach(([file, count], i) => {
    const fileName = file.split(/[\\/]/).pop();
    const shortPath = file.replace(/^.*?sveltekit-frontend[\\/]/, '');
    console.log(`${String(i + 1).padStart(2)}. [${String(count).padStart(3)}x] ${fileName}`);
    console.log(`    ${shortPath}`);
  });

  // Category breakdown
  console.log('\n\n📋 ERROR CATEGORIES:\n');

  const categories = {
    'Import/Export': ['Cannot find', 'Module', 'has no exported', 'is not a module'],
    'Type Errors': ['Type ', 'not assignable', 'does not exist', 'Property'],
    'Svelte 5 Migration': ['export let', '$props', '$state', 'rune'],
    'Syntax': ['expected', 'Unexpected', 'Missing'],
    'XState v5': ['assign', 'createMachine', 'Actor', 'Snapshot']
  };

  for (const [category, keywords] of Object.entries(categories)) {
    let count = 0;
    for (const [pattern, cnt] of errorsByType.entries()) {
      if (keywords.some(kw => pattern.includes(kw))) {
        count += cnt;
      }
    }
    if (count > 0) {
      const pct = ((count / totalErrors) * 100).toFixed(1);
      console.log(`   ${category.padEnd(20)} ${String(count).padStart(4)} errors (${pct}%)`);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════\n');

  // Save detailed results
  const results = {
    summary: { totalErrors, totalWarnings, totalFiles },
    topPatterns: sortedPatterns.slice(0, 50),
    topFiles: sortedFiles.slice(0, 50),
    allErrors: errorDetails.slice(0, 500) // First 500 errors
  };

  writeFileSync('error-analysis.json', JSON.stringify(results, null, 2));
  console.log('✅ Detailed analysis saved to error-analysis.json\n');
}
