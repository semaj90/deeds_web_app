#!/usr/bin/env node
/**
 * PHASE 8: Unterminated String/Template Literal Fixer
 * Targets remaining TS1002 and TS1160 errors
 */

const fs = require('fs');
const glob = require('glob');

console.log('📝 Phase 8: String & Template Literal Fixer');
console.log('============================================\n');

let totalFixes = 0;

function fixUnterminatedStrings(content) {
  let fixed = content;
  let fixes = 0;
  const lines = content.split('\n');
  const fixedLines = [];
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    
    // Check for unterminated strings
    const singleQuotes = (line.match(/'/g) || []).length;
    const doubleQuotes = (line.match(/"/g) || []).length;
    const backticks = (line.match(/`/g) || []).length;
    
    // Odd number indicates unterminated
    if (singleQuotes % 2 !== 0 && !line.includes('\\\'')) {
      // Add closing quote at end if missing
      if (!line.trimEnd().endsWith("'")) {
        line = line.trimEnd() + "'";
        fixes++;
      }
    }
    
    if (doubleQuotes % 2 !== 0 && !line.includes('\\"')) {
      if (!line.trimEnd().endsWith('"')) {
        line = line.trimEnd() + '"';
        fixes++;
      }
    }
    
    if (backticks % 2 !== 0) {
      if (!line.trimEnd().endsWith('`')) {
        line = line.trimEnd() + '`';
        fixes++;
      }
    }
    
    // Fix common patterns: error: 'message
    if (line.match(/error:\s*'[^']*$/)) {
      line = line + "'";
      fixes++;
    }
    
    if (line.match(/error:\s*"[^"]*$/)) {
      line = line + '"';
      fixes++;
    }
    
    if (line.match(/error:\s*`[^`]*$/)) {
      line = line + '`';
      fixes++;
    }
    
    fixedLines.push(line);
  }
  
  if (fixes > 0) {
    fixed = fixedLines.join('\n');
    totalFixes += fixes;
  }
  
  return { fixed, fixes };
}

function processFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const { fixed, fixes } = fixUnterminatedStrings(content);
    
    if (fixes > 0) {
      fs.writeFileSync(filePath, fixed, 'utf8');
      console.log(`✅ ${filePath}: ${fixes} string fixes`);
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

console.log('\n✅ Phase 8 Complete!');
console.log('====================');
console.log(`📝 Files modified: ${modifiedCount}`);
console.log(`🔧 Total string fixes: ${totalFixes}\n`);
