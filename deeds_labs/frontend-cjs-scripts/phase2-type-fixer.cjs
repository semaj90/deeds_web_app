#!/usr/bin/env node
/**
 * Phase 2 Error Fixer - Type Definitions and Interfaces
 * Targets TS1131 errors (Property or signature expected)
 */

const fs = require('fs');
const glob = require('glob');

console.log('🔧 Phase 2: Type Definition Fixer');
console.log('==================================\n');

let fixCount = 0;

function fixTypeDefinitions(content, filePath) {
  let fixed = content;
  let localFixes = 0;
  
  // Fix 1: Trailing commas in type/interface definitions
  // interface Foo { bar: string, } => interface Foo { bar: string }
  const trailingCommaPattern = /(\w+:\s*[^,\n]+),(\s*[}\]])/g;
  if (trailingCommaPattern.test(content)) {
    fixed = fixed.replace(trailingCommaPattern, '$1$2');
    localFixes++;
  }
  
  // Fix 2: Missing semicolons in interface properties
  // interface Foo { bar: string baz: number } => interface Foo { bar: string; baz: number }
  const missingSemicolonPattern = /(\w+:\s*[^;,\n{}]+)\s+(\w+:)/g;
  if (missingSemicolonPattern.test(content)) {
    fixed = fixed.replace(missingSemicolonPattern, '$1; $2');
    localFixes++;
  }
  
  // Fix 3: Incorrect object literal in type definitions
  // type Foo = { bar: string, => type Foo = { bar: string; 
  fixed = fixed.replace(/(type\s+\w+\s*=\s*{[^}]*\w+:\s*[^,;}\n]+),\s*(\w+:|};)/g, (match, p1, p2) => {
    if (!p1.endsWith(';')) {
      localFixes++;
      return p1 + '; ' + p2;
    }
    return match;
  });
  
  // Fix 4: Misplaced commas in type literals
  // { foo: string\n, bar: number } => { foo: string; bar: number }
  const misplacedCommaPattern = /([a-zA-Z_$][\w$]*:\s*[^,;\n{}]+)\n\s*,\s*([a-zA-Z_$][\w$]*:)/g;
  if (misplacedCommaPattern.test(content)) {
    fixed = fixed.replace(misplacedCommaPattern, '$1;\n  $2');
    localFixes++;
  }
  
  // Fix 5: Double commas
  fixed = fixed.replace(/,,/g, ',');
  
  // Fix 6: Comma followed by closing brace
  fixed = fixed.replace(/,(\s*})/g, '$1');
  
  if (localFixes > 0) {
    console.log(`✅ ${filePath}: ${localFixes} type definition fixes`);
    fixCount += localFixes;
  }
  
  return fixed;
}

function fixInterfaceExports(content, filePath) {
  let fixed = content;
  let localFixes = 0;
  
  // Fix: export interface Foo { => export interface Foo {
  // Ensure proper spacing around braces
  const interfacePattern = /export\s+interface\s+(\w+)\s*{/g;
  if (!interfacePattern.test(content)) {
    // Already correct
    return fixed;
  }
  
  // Check for common issues like missing properties
  const lines = content.split('\n');
  const fixedLines = [];
  let inInterface = false;
  let braceCount = 0;
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    
    // Track interface blocks
    if (line.match(/\b(interface|type)\s+\w+/)) {
      inInterface = true;
    }
    
    if (inInterface) {
      braceCount += (line.match(/{/g) || []).length;
      braceCount -= (line.match(/}/g) || []).length;
      
      // Fix property definitions without semicolons/commas
      if (line.match(/^\s+\w+:\s*[^;,\n{}]+$/) && !line.trim().endsWith(',') && !line.trim().endsWith(';')) {
        line = line + ';';
        localFixes++;
      }
      
      if (braceCount === 0) {
        inInterface = false;
      }
    }
    
    fixedLines.push(line);
  }
  
  if (localFixes > 0) {
    fixed = fixedLines.join('\n');
    console.log(`✅ ${filePath}: ${localFixes} interface property fixes`);
    fixCount += localFixes;
  }
  
  return fixed;
}

function fixFunctionSignatures(content, filePath) {
  let fixed = content;
  let localFixes = 0;
  
  // Fix: function foo(a: string b: number) => function foo(a: string, b: number)
  const missingCommaPattern = /\(([^)]*\w+:\s*[^,)]+)\s+(\w+:)/g;
  if (missingCommaPattern.test(content)) {
    fixed = fixed.replace(missingCommaPattern, '($1, $2');
    localFixes++;
  }
  
  if (localFixes > 0) {
    console.log(`✅ ${filePath}: ${localFixes} function signature fixes`);
    fixCount += localFixes;
  }
  
  return fixed;
}

function processFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    const original = content;
    
    content = fixTypeDefinitions(content, filePath);
    content = fixInterfaceExports(content, filePath);
    content = fixFunctionSignatures(content, filePath);
    
    if (content !== original) {
      fs.writeFileSync(filePath, content, 'utf8');
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`❌ Error processing ${filePath}: ${error.message}`);
    return false;
  }
}

function main() {
  // Focus on TypeScript declaration files and source files
  const patterns = [
    'src/**/*.d.ts',
    'src/**/*.ts',
    '!src/**/*.spec.ts',
    '!node_modules/**',
    '!.svelte-kit/**',
    '!build/**'
  ];
  
  const files = glob.sync(patterns[0], { ignore: patterns.slice(3) })
    .concat(glob.sync(patterns[1], { ignore: patterns.slice(2) }));
  
  console.log(`📁 Found ${files.length} TypeScript files\n`);
  
  let processedCount = 0;
  let modifiedCount = 0;
  
  files.forEach(file => {
    if (processFile(file)) {
      modifiedCount++;
    }
    processedCount++;
    
    if (processedCount % 200 === 0) {
      console.log(`⏳ Processed ${processedCount}/${files.length} files...`);
    }
  });
  
  console.log('\n✅ Phase 2 Complete!');
  console.log('====================');
  console.log(`📊 Files processed: ${processedCount}`);
  console.log(`📝 Files modified: ${modifiedCount}`);
  console.log(`🔧 Total fixes applied: ${fixCount}\n`);
}

main();
