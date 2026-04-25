#!/usr/bin/env node
/**
 * SIMPLE MANUAL FIX APPROACH
 * 
 * Based on analysis: Regex patterns create more errors than they fix
 * Solution: Skip automation, provide targeted manual fix guidance
 * 
 * This script identifies the TOP issues to fix manually with high confidence
 */

const fs = require('fs');
const { execSync } = require('child_process');

console.log('\n╔══════════════════════════════════════════════════════════════════╗');
console.log('║          MANUAL FIX RECOMMENDATION SYSTEM                        ║');
console.log('╚══════════════════════════════════════════════════════════════════╝\n');

console.log('📊 Analyzing TypeScript errors...\n');

// Run tsc and capture errors
const errors = execSync('npx tsc --noEmit --skipLibCheck 2>&1', { encoding: 'utf8' });
const lines = errors.split('\n');

// Parse errors
const errorMap = new Map();
const fileErrors = new Map();

lines.forEach(line => {
  const match = line.match(/^([^(]+)\((\d+),(\d+)\): error (TS\d+): (.+)$/);
  if (match) {
    const [_, file, lineNum, col, code, message] = match;
    
    if (!errorMap.has(code)) {
      errorMap.set(code, { count: 0, examples: [] });
    }
    const entry = errorMap.get(code);
    entry.count++;
    if (entry.examples.length < 3) {
      entry.examples.push({ file, line: lineNum, message: message.substring(0, 80) });
    }
    
    if (!fileErrors.has(file)) {
      fileErrors.set(file, 0);
    }
    fileErrors.set(file, fileErrors.get(file) + 1);
  }
});

// Sort by frequency
const sortedErrors = Array.from(errorMap.entries())
  .sort((a, b) => b[1].count - a[1].count)
  .slice(0, 10);

const sortedFiles = Array.from(fileErrors.entries())
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10);

console.log('═══════════════════════════════════════════════════════════════════\n');
console.log('🎯 TOP 10 ERROR TYPES TO FIX MANUALLY\n');
console.log('═══════════════════════════════════════════════════════════════════\n');

sortedErrors.forEach(([code, data], index) => {
  console.log(`${index + 1}. ${code}: ${data.count} occurrences`);
  console.log(`   Examples:`);
  data.examples.forEach(ex => {
    console.log(`   • ${ex.file}:${ex.line}`);
    console.log(`     ${ex.message}`);
  });
  console.log('');
});

console.log('\n═══════════════════════════════════════════════════════════════════\n');
console.log('📁 TOP 10 FILES WITH MOST ERRORS\n');
console.log('═══════════════════════════════════════════════════════════════════\n');

sortedFiles.forEach(([file, count], index) => {
  console.log(`${index + 1}. ${file}`);
  console.log(`   ${count} errors\n`);
});

console.log('\n═══════════════════════════════════════════════════════════════════\n');
console.log('💡 RECOMMENDED APPROACH\n');
console.log('═══════════════════════════════════════════════════════════════════\n');

console.log(`1. Focus on TOP 3 error types manually
2. Fix TOP 5 files with most errors  
3. Use IDE's built-in TypeScript fixes
4. Commit incremental progress
5. Re-run this script to track progress

📝 Manual fixing is MORE RELIABLE than regex automation
   Your IDE knows the context better than any script

🚀 Start with the files listed above - they'll give biggest impact!\n`);
