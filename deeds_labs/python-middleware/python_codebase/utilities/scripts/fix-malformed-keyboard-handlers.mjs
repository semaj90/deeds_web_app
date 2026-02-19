#!/usr/bin/env node

/**
 * Quick fix for malformed keyboard handlers created by accessibility script
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

function findSvelteFiles(dir, files = []) {
  const items = readdirSync(dir);
  
  for (const item of items) {
    const fullPath = join(dir, item);
    const stat = statSync(fullPath);
    
    if (stat.isDirectory()) {
      if (!['node_modules', '.git', 'dist', 'build', '.svelte-kit'].includes(item)) {
        findSvelteFiles(fullPath, files);
      }
    } else if (item.endsWith('.svelte')) {
      files.push(fullPath);
    }
  }
  
  return files;
}

function fixMalformedHandlers(content) {
  let fixesApplied = 0;
  
  // Fix malformed onkeydown handlers that were improperly added
  const onkeydownPatterns = [
    // Pattern: } onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { function_call; } }}
    /} onkeydown=\{\(e\) => \{ if \(e\.key === 'Enter' \|\| e\.key === ' '\) \{ [^}]+; \} \}\}/g,
    // Pattern: } onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { () => function_call; } }}
    /} onkeydown=\{\(e\) => \{ if \(e\.key === 'Enter' \|\| e\.key === ' '\) \{ \(\) => [^}]+; \} \}\}/g,
    // Pattern: } onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { (e) => { ... ; } }}
    /} onkeydown=\{\(e\) => \{ if \(e\.key === 'Enter' \|\| e\.key === ' '\) \{ \(e\) => \{[^}]+;\s*\}\s*\}\s*\}\s*\}/g
  ];
  
  onkeydownPatterns.forEach(pattern => {
    const before = content;
    content = content.replace(pattern, '}');
    if (content !== before) fixesApplied++;
  });
  
  // Fix malformed onclick handlers: tabindex="0"{function} -> tabindex="0" onclick={function}
  const onclickPattern = /(\s+role="button"\s+tabindex="[0-9]+")\{([^}]+)\}/g;
  content = content.replace(onclickPattern, (match, tabindexPart, functionPart) => {
    fixesApplied++;
    return `${tabindexPart}\n                onclick={${functionPart}}`;
  });
  
  console.log(`Fixed ${fixesApplied} malformed handlers in this file`);
  return content;
}

function processFile(filePath) {
  try {
    const content = readFileSync(filePath, 'utf8');
    const fixedContent = fixMalformedHandlers(content);
    
    if (content !== fixedContent) {
      writeFileSync(filePath, fixedContent);
      console.log(`✓ Fixed: ${filePath}`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`✗ Error processing ${filePath}:`, error.message);
    return false;
  }
}

function main() {
  console.log('🔧 Fixing malformed keyboard handlers...\n');
  
  const svelteFiles = findSvelteFiles('sveltekit-frontend/src');
  console.log(`📁 Found ${svelteFiles.length} Svelte files to process\n`);
  
  let fixedCount = 0;
  
  for (const file of svelteFiles) {
    if (processFile(file)) {
      fixedCount++;
    }
  }
  
  console.log(`\n📊 Results:`);
  console.log(`Files processed: ${svelteFiles.length}`);
  console.log(`Files fixed: ${fixedCount}`);
  
  if (fixedCount > 0) {
    console.log('\n✅ Malformed keyboard handlers fixed!');
  } else {
    console.log('\n✅ No malformed handlers found');
  }
}

main();