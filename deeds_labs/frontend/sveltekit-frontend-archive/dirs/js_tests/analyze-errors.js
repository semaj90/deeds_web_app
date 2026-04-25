#!/usr/bin/env node

// Find all errors in the project
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔍 Comprehensive Error Analysis Starting...\n');

try {
  // Run svelte-check and capture output
  const result = execSync('npx svelte-check', {
    encoding: 'utf8',
    cwd: process.cwd(),
    maxBuffer: 1024 * 1024 * 10, // 10MB buffer
  });
  console.log('✅ No errors found!');
} catch (error) {
  const output = error.stdout || error.stderr || '';
  console.log('📊 Error Analysis Results:\n');

  // Parse the output
  const lines = output.split('\n');
  const errorSummary = {};
  const fileCounts = {};

  for (const line of lines) {
    if (line.includes('Error:')) {
      // Extract error type
      const errorMatch = line.match(/Error: (.+?)(?:\s|$)/);
      if (errorMatch) {
        const errorType = errorMatch[1];
        errorSummary[errorType] = (errorSummary[errorType] || 0) + 1;
      }
    }

    // Count files with errors
    const fileMatch = line.match(/^([^:]+\.svelte):/);
    if (fileMatch) {
      const file = fileMatch[1];
      const shortFile = file.replace(/.*sveltekit-frontend[\/\\]/, '');
      fileCounts[shortFile] = (fileCounts[shortFile] || 0) + 1;
    }
  }

  console.log('📈 Error Types:');
  Object.entries(errorSummary)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .forEach(([type, count]) => {
      console.log(`  ${count}x ${type}`);
    });

  console.log('\n📁 Most Problematic Files:');
  Object.entries(fileCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 15)
    .forEach(([file, count]) => {
      console.log(`  ${count}x ${file}`);
    });

  console.log('\n📝 Full Output Summary:');
  const totalErrors = Object.values(errorSummary).reduce((a, b) => a + b, 0);
  const totalFiles = Object.keys(fileCounts).length;
  console.log(`  Total Errors: ${totalErrors}`);
  console.log(`  Files with Errors: ${totalFiles}`);

  // Extract final summary line
  const summaryLine = lines.find((line) => line.includes('svelte-check found'));
  if (summaryLine) {
    console.log(`  ${summaryLine}`);
  }
}
