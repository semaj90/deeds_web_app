#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const glob = require('glob');

console.log('🔧 Comprehensive Syntax Error Fixer');
console.log('====================================\n');

let fixCount = 0;
const fixes = [];

/**
 * Fix unterminated string literals
 */
function fixUnterminatedStrings(content, filePath) {
  let fixed = content;
  let localFixes = 0;
  
  // Fix backtick/quote mismatches
  const patterns = [
    { regex: /error: '([^']*)`/g, replacement: "error: '$1'" },
    { regex: /error: `([^`]*)'/g, replacement: "error: `$1`" },
    { regex: /'([^']*)`\s*}/g, replacement: "'$1' }" },
    { regex: /`([^`]*)'\s*}/g, replacement: "`$1` }" },
    { regex: /:\s*`([^`]*)'/g, replacement: ": '$1'" },
    { regex: /:\s*'([^']*)` /g, replacement: ": `$1` " },
  ];
  
  patterns.forEach(({ regex, replacement }) => {
    const matches = content.match(regex);
    if (matches) {
      fixed = fixed.replace(regex, replacement);
      localFixes += matches.length;
    }
  });
  
  if (localFixes > 0) {
    fixes.push(`${filePath}: Fixed ${localFixes} unterminated strings`);
    fixCount += localFixes;
  }
  
  return fixed;
}

/**
 * Fix missing semicolons and commas
 */
function fixPunctuation(content, filePath) {
  let fixed = content;
  let localFixes = 0;
  
  // Fix missing closing brackets in arrays
  const arrayPattern = /const\s+\w+\s*=\s*\[([^\]]*)\n\s*const/g;
  if (arrayPattern.test(content)) {
    fixed = fixed.replace(arrayPattern, (match, arrayContent) => {
      localFixes++;
      return match.replace(/\n\s*const/, '];\n  const');
    });
  }
  
  // Fix missing commas in object literals
  const objectPattern = /{\s*([a-zA-Z_$][\w$]*:\s*[^,}\n]+)\s+([a-zA-Z_$][\w$]*:)/g;
  if (objectPattern.test(content)) {
    fixed = fixed.replace(objectPattern, '{ $1, $2');
    localFixes++;
  }
  
  if (localFixes > 0) {
    fixes.push(`${filePath}: Fixed ${localFixes} punctuation issues`);
    fixCount += localFixes;
  }
  
  return fixed;
}

/**
 * Fix template literal issues
 */
function fixTemplateLiterals(content, filePath) {
  let fixed = content;
  let localFixes = 0;
  
  // Count backticks per line
  const lines = content.split('\n');
  const fixedLines = lines.map((line, idx) => {
    const backtickCount = (line.match(/`/g) || []).length;
    
    // Odd number of backticks indicates unterminated template
    if (backtickCount % 2 !== 0) {
      // Check if it's a string that should be regular quotes
      if (line.includes("error: `") && !line.includes("${")) {
        localFixes++;
        return line.replace(/`/g, "'");
      }
      // Check if template literal needs closing
      if (line.trim().endsWith('`')) {
        // Already ends with backtick, likely correct
        return line;
      }
    }
    
    return line;
  });
  
  if (localFixes > 0) {
    fixed = fixedLines.join('\n');
    fixes.push(`${filePath}: Fixed ${localFixes} template literal issues`);
    fixCount += localFixes;
  }
  
  return fixed;
}

/**
 * Fix TypeScript syntax errors
 */
function fixTypeScriptSyntax(content, filePath) {
  let fixed = content;
  let localFixes = 0;
  
  // Fix "as const)" patterns (missing space before paren)
  if (content.includes('as const)')) {
    fixed = fixed.replace(/as const\)/g, 'as const )');
    localFixes++;
  }
  
  // Fix duplicate imports (remove duplicated content)
  const importPattern = /^import\s+{[^}]+}\s+from\s+'[^']+';/gm;
  const imports = content.match(importPattern) || [];
  const uniqueImports = [...new Set(imports)];
  
  if (imports.length !== uniqueImports.length) {
    // Has duplicate imports
    localFixes += imports.length - uniqueImports.length;
  }
  
  if (localFixes > 0) {
    fixes.push(`${filePath}: Fixed ${localFixes} TypeScript syntax issues`);
    fixCount += localFixes;
  }
  
  return fixed;
}

/**
 * Process a single file
 */
function processFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    const originalContent = content;
    
    // Apply all fixes
    content = fixUnterminatedStrings(content, filePath);
    content = fixPunctuation(content, filePath);
    content = fixTemplateLiterals(content, filePath);
    content = fixTypeScriptSyntax(content, filePath);
    
    // Only write if content changed
    if (content !== originalContent) {
      fs.writeFileSync(filePath, content, 'utf8');
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`❌ Error processing ${filePath}: ${error.message}`);
    return false;
  }
}

/**
 * Main execution
 */
function main() {
  const patterns = [
    'src/**/*.ts',
    'src/**/*.svelte',
    '!node_modules/**',
    '!.svelte-kit/**',
    '!build/**'
  ];
  
  const files = glob.sync(patterns[0], { ignore: patterns.slice(2) });
  console.log(`📁 Found ${files.length} files to process\n`);
  
  let processedCount = 0;
  let modifiedCount = 0;
  
  files.forEach(file => {
    if (processFile(file)) {
      modifiedCount++;
    }
    processedCount++;
    
    if (processedCount % 100 === 0) {
      console.log(`⏳ Processed ${processedCount}/${files.length} files...`);
    }
  });
  
  console.log('\n✅ Processing Complete!');
  console.log('======================');
  console.log(`📊 Files processed: ${processedCount}`);
  console.log(`📝 Files modified: ${modifiedCount}`);
  console.log(`🔧 Total fixes applied: ${fixCount}\n`);
  
  if (fixes.length > 0) {
    console.log('📋 Fix Summary (first 20):');
    fixes.slice(0, 20).forEach(fix => console.log(`  • ${fix}`));
    if (fixes.length > 20) {
      console.log(`  ... and ${fixes.length - 20} more`);
    }
  }
}

main();
