import fs from 'fs';
import { ERROR_PATTERNS } from './scripts/redis-error-analyzer-simple.mjs';

const testFile = 'test-errors-validation.svelte';
const content = fs.readFileSync(testFile, 'utf-8');

console.log('🔍 Testing error detection on:', testFile);
console.log('='.repeat(50));

let totalErrors = 0;

for (const [patternId, pattern] of Object.entries(ERROR_PATTERNS)) {
  const fileExt = '.svelte';
  if (pattern.fileTypes && !pattern.fileTypes.includes(fileExt)) {
    continue;
  }

  const matches = content.match(pattern.regex);
  if (matches) {
    console.log(`${patternId}: ${pattern.name}`);
    console.log(`  Found ${matches.length} matches`);
    console.log(`  Severity: ${pattern.severity}`);
    matches.slice(0, 2).forEach((match, i) => {
      const index = content.indexOf(match);
      const line = content.substring(0, index).split('\n').length;
      console.log(`    ${i+1}. Line ${line}: '${match.trim()}'`);
    });
    console.log('');
    totalErrors += matches.length;
  }
}

console.log(`🎯 Total errors detected: ${totalErrors}`);