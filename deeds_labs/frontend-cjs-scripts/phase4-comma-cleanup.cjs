#!/usr/bin/env node
/**
 * Phase 4: Final Cleanup - Fix remaining comma issues
 */

const fs = require('fs');
const glob = require('glob');

console.log('🧹 Phase 4: Final Comma Cleanup');
console.log('================================\n');

let totalFixes = 0;

function fixMisplacedCommas(content) {
  let fixed = content;
  let fixes = 0;
  
  // Pattern: string;, word => string; word
  if (content.includes(';,')) {
    fixed = fixed.replace(/;,\s*/g, '; ');
    fixes += (content.match(/;,/g) || []).length;
  }
  
  // Pattern: void;, export => void; export
  if (content.includes('void;,')) {
    fixed = fixed.replace(/void;,\s*/g, 'void; ');
    fixes++;
  }
  
  // Pattern: number;, word => number; word
  if (content.includes('number;,')) {
    fixed = fixed.replace(/number;,\s*/g, 'number; ');
    fixes++;
  }
  
  // Pattern: Blob>;, word => Blob>; word
  if (content.includes('>;,')) {
    fixed = fixed.replace(/>;,\s*/g, '>; ');
    fixes++;
  }
  
  return { fixed, fixes };
}

function processFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const { fixed, fixes } = fixMisplacedCommas(content);
    
    if (fixes > 0) {
      fs.writeFileSync(filePath, fixed, 'utf8');
      console.log(`✅ ${filePath}: ${fixes} comma fixes`);
      totalFixes += fixes;
      return true;
    }
    return false;
  } catch (error) {
    return false;
  }
}

// Process all TypeScript files
const files = glob.sync('src/**/*.{ts,d.ts}', { 
  ignore: ['node_modules/**', '.svelte-kit/**', 'build/**']
});

console.log(`📁 Scanning ${files.length} files...\n`);

let modifiedCount = 0;
files.forEach(file => {
  if (processFile(file)) modifiedCount++;
});

console.log('\n✅ Phase 4 Complete!');
console.log('====================');
console.log(`📝 Files modified: ${modifiedCount}`);
console.log(`🔧 Total comma fixes: ${totalFixes}\n`);
