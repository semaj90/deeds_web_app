#!/usr/bin/env node
/**
 * PHASE 7: Structural Error Fixer - TS1128, TS1131, TS1136
 * Fixes declaration, property, and assignment errors
 */

const fs = require('fs');
const glob = require('glob');

console.log('🔧 Phase 7: Structural Error Fixer');
console.log('===================================\n');

let totalFixes = 0;

function fixStructuralErrors(content) {
  let fixed = content;
  let fixes = 0;
  
  // Fix 1: Orphaned closing braces (TS1128)
  // Remove standalone closing braces that don't match
  const lines = content.split('\n');
  const fixedLines = [];
  let braceStack = 0;
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    
    // Count braces on this line
    const openBraces = (line.match(/{/g) || []).length;
    const closeBraces = (line.match(/}/g) || []).length;
    
    // Skip lines that are just a closing brace with negative stack
    if (line.trim() === '}' && braceStack <= 0) {
      fixes++;
      continue; // Skip this orphaned brace
    }
    
    braceStack += openBraces - closeBraces;
    fixedLines.push(line);
  }
  
  if (fixes > 0) {
    fixed = fixedLines.join('\n');
  }
  
  // Fix 2: TS1131 - Property or signature expected
  // Often caused by trailing commas or misplaced keywords
  fixed = fixed.replace(/,(\s*})/g, '$1'); // Remove trailing commas before }
  const trailingCommaFixes = (content.match(/,(\s*})/g) || []).length;
  fixes += trailingCommaFixes;
  
  // Fix 3: TS1136 - Property assignment expected
  // Fix object shorthand issues
  fixed = fixed.replace(/{\s*(\w+)\s*}/g, '{ $1 }'); // Normalize spacing
  
  // Fix 4: Duplicate semicolons
  const beforeSemicolons = (fixed.match(/;;/g) || []).length;
  fixed = fixed.replace(/;;+/g, ';');
  fixes += beforeSemicolons;
  
  // Fix 5: Space before colon in types
  fixed = fixed.replace(/\s+:/g, ':');
  
  // Fix 6: Multiple spaces
  fixed = fixed.replace(/([^"'\s])\s{2,}([^"'\s])/g, '$1 $2');
  
  return { fixed, fixes };
}

function processFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const { fixed, fixes } = fixStructuralErrors(content);
    
    if (fixes > 0 && fixed !== content) {
      fs.writeFileSync(filePath, fixed, 'utf8');
      console.log(`✅ ${filePath}: ${fixes} structural fixes`);
      totalFixes += fixes;
      return true;
    }
    return false;
  } catch (error) {
    return false;
  }
}

const files = glob.sync('src/**/*.{ts,tsx,svelte}', {
  ignore: ['node_modules/**', '.svelte-kit/**', 'build/**']
});

console.log(`📁 Processing ${files.length} files...\n`);

let modifiedCount = 0;
files.forEach(file => {
  if (processFile(file)) modifiedCount++;
});

console.log('\n✅ Phase 7 Complete!');
console.log('====================');
console.log(`📝 Files modified: ${modifiedCount}`);
console.log(`🔧 Total structural fixes: ${totalFixes}\n`);
