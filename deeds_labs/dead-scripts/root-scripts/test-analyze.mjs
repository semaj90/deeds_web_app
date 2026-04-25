import fs from 'fs';
import { analyzeFile } from './scripts/redis-error-analyzer-simple.mjs';

const testFile = 'test-errors-validation.svelte';
const content = fs.readFileSync(testFile, 'utf-8');

console.log('🔍 Testing analyzeFile function on:', testFile);
console.log('File size:', content.length, 'characters');

const errors = analyzeFile(testFile, content);
console.log('Errors found by analyzeFile:', errors.length);

errors.slice(0, 5).forEach((error, i) => {
  console.log(`${i+1}. [${error.pattern}] Line ${error.line}: ${error.description}`);
  console.log(`   Match: '${error.match}'`);
  console.log(`   Suggestion: '${error.suggestion}'`);
  console.log('');
});