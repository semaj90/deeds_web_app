#!/usr/bin/env node
/**
 * Phase 3A: Targeted Error Fixes
 * Only fix errors identified by svelte-check at specific locations
 */

import { readFileSync, writeFileSync } from 'fs';

console.log('🔧 Phase 3A: Targeted Error Fixes\n');

// Parse svelte-check-clean.log to get exact error locations
const logContent = readFileSync('svelte-check-clean.log', 'utf-8');
const lines = logContent.split('\n');

const errors = [];
let currentFile = '';
let currentLine = 0;
let currentMessage = '';

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];

  // Match file:line:col
  const fileMatch = line.match(/^(.+\.svelte):(\d+):(\d+)$/);
  if (fileMatch) {
    currentFile = fileMatch[1];
    currentLine = parseInt(fileMatch[2]);
    continue;
  }

  // Match "Error: message"
  const errorMatch = line.match(/^Error:\s+(.+)$/);
  if (errorMatch && currentFile) {
    currentMessage = errorMatch[1];
    errors.push({
      file: currentFile,
      line: currentLine,
      message: currentMessage
    });
    currentFile = '';
  }
}

console.log(`📊 Found ${errors.length} errors to fix\n`);

// Group by error type
const errorTypes = {
  'comma': errors.filter(e => e.message.includes("',' expected")),
  'brace': errors.filter(e => e.message.includes('Expected token }')),
  'semicolon': errors.filter(e => e.message.includes('semi-colon expected')),
  'cssSpacing': errors.filter(e => e.file.includes('.svelte'))
};

console.log('🎯 Error breakdown:');
console.log(`   ',' expected: ${errorTypes.comma.length}`);
console.log(`   Expected }: ${errorTypes.brace.length}`);
console.log(`   Semicolon: ${errorTypes.semicolon.length}`);
console.log(`   Other: ${errors.length - errorTypes.comma.length - errorTypes.brace.length - errorTypes.semicolon.length}\n`);

// For now, just report what we'd fix
console.log('📝 Sample errors to fix:\n');

// Show top files with errors
const fileErrorCounts = {};
for (const error of errors) {
  fileErrorCounts[error.file] = (fileErrorCounts[error.file] || 0) + 1;
}

const topFiles = Object.entries(fileErrorCounts)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10);

console.log('Top 10 files with errors:');
for (const [file, count] of topFiles) {
  console.log(`   ${count}x ${file.replace(/^.*sveltekit-frontend[\\/]/, '')}`);
}

console.log('\n✅ Analysis complete');
console.log('   Identified specific errors to fix');
console.log('   Ready for manual targeted fixes');
console.log('\n💡 Recommendation: Fix high-error files manually first');
console.log('   Start with files that have 10+ errors');