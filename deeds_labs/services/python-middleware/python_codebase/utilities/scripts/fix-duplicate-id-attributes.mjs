#!/usr/bin/env node

/**
 * Fix duplicate id attributes created by accessibility script
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

function fixDuplicateIds(content) {
  // Fix duplicate id attributes - pattern: id="something" id="something"
  const duplicateIdPattern = /(<[^>]*?)\s+id="([^"]+)"\s+id="([^"]+)"/g;
  
  return content.replace(duplicateIdPattern, (match, tagStart, firstId, secondId) => {
    // Keep the first id, remove the duplicate
    return `${tagStart} id="${firstId}"`;
  });
}

function processFile(filePath) {
  try {
    const content = readFileSync(filePath, 'utf8');
    const fixedContent = fixDuplicateIds(content);
    
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
  console.log('🔧 Fixing duplicate id attributes...\n');
  
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
    console.log('\n✅ Duplicate id attributes fixed!');
  } else {
    console.log('\n✅ No duplicate id attributes found');
  }
}

main();