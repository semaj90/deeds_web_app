#!/usr/bin/env node
/**
 * PHASE 6: Advanced TS1005 Fixer - Missing Commas/Semicolons
 * Targets the 59,031 TS1005 errors with intelligent context-aware fixes
 */

const fs = require('fs');
const glob = require('glob');

console.log('🎯 Phase 6: Advanced TS1005 Comma/Semicolon Fixer');
console.log('==================================================\n');

let totalFixes = 0;
const fixedFiles = new Set();

function fixTS1005Errors(content, filePath) {
  let fixed = content;
  let fixes = 0;
  const lines = content.split('\n');
  const fixedLines = [];
  
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    const nextLine = lines[i + 1] || '';
    const prevLine = lines[i - 1] || '';
    
    // Context detection
    const inInterface = prevLine.match(/\b(interface|type)\s+\w+/) || content.substring(0, content.indexOf(line)).match(/\b(interface|type)\s+\w+\s*{[^}]*$/);
    const inObject = prevLine.includes('{') && !prevLine.includes('}');
    const inArray = prevLine.includes('[') && !prevLine.includes(']');
    const inFunction = prevLine.match(/function\s+\w+\s*\(/);
    
    // Rule 1: Interface/Type properties need semicolons
    if (inInterface && line.match(/^\s+\w+[?]?:\s*[^;,{}\n]+$/) && nextLine.match(/^\s+\w+:/)) {
      if (!line.trim().endsWith(';') && !line.trim().endsWith(',')) {
        line = line + ';';
        fixes++;
      }
    }
    
    // Rule 2: Object properties need commas (unless last)
    else if (inObject && line.match(/^\s+\w+:\s*[^,;{}\n]+$/) && nextLine.match(/^\s+\w+:/)) {
      if (!line.trim().endsWith(',') && !line.trim().endsWith(';')) {
        line = line + ',';
        fixes++;
      }
    }
    
    // Rule 3: Array elements need commas
    else if (inArray && line.match(/^\s+[^,\[\]]+$/) && nextLine.trim() && !nextLine.trim().startsWith(']')) {
      if (!line.trim().endsWith(',')) {
        line = line + ',';
        fixes++;
      }
    }
    
    // Rule 4: Function parameters missing commas
    // Detect: (a: string b: number)
    if (line.includes('(') && line.match(/\(([^)]*\w+:\s*[^,)]+)\s+(\w+:)/)) {
      const originalLine = line;
      line = line.replace(/(\w+:\s*[^,)]+)\s+(\w+:)/g, '$1, $2');
      if (line !== originalLine) fixes++;
    }
    
    // Rule 5: Import/Export statements
    if ((line.includes('import {') || line.includes('export {')) && line.match(/{\s*(\w+)\s+(\w+)/)) {
      const originalLine = line;
      line = line.replace(/{\s*(\w+)\s+(\w+)/g, '{ $1, $2');
      if (line !== originalLine) fixes++;
    }
    
    // Rule 6: Type parameters
    if (line.match(/<([^<>]*\w+)\s+(\w+)/) && !line.includes('|') && !line.includes('&')) {
      const originalLine = line;
      line = line.replace(/<([^<>]*\w+)\s+(\w+)/g, '<$1, $2');
      if (line !== originalLine) fixes++;
    }
    
    fixedLines.push(line);
  }
  
  if (fixes > 0) {
    fixed = fixedLines.join('\n');
    totalFixes += fixes;
    fixedFiles.add(filePath);
  }
  
  return { fixed, fixes };
}

function processFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const { fixed, fixes } = fixTS1005Errors(content, filePath);
    
    if (fixes > 0) {
      fs.writeFileSync(filePath, fixed, 'utf8');
      console.log(`✅ ${filePath}: ${fixes} TS1005 fixes`);
      return fixes;
    }
    return 0;
  } catch (error) {
    return 0;
  }
}

// Process all TypeScript and Svelte files
const files = glob.sync('src/**/*.{ts,tsx,svelte}', {
  ignore: ['node_modules/**', '.svelte-kit/**', 'build/**']
});

console.log(`📁 Processing ${files.length} files...\n`);

let processedCount = 0;
files.forEach(file => {
  processFile(file);
  processedCount++;
  if (processedCount % 500 === 0) {
    console.log(`⏳ Processed ${processedCount}/${files.length}...`);
  }
});

console.log('\n✅ Phase 6 Complete!');
console.log('====================');
console.log(`📝 Files modified: ${fixedFiles.size}`);
console.log(`🔧 Total TS1005 fixes: ${totalFixes}\n`);
