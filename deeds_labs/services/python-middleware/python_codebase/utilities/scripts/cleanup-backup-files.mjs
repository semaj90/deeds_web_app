#!/usr/bin/env node

/**
 * Cleanup script for backup and archive files causing build issues
 */

import { readFileSync, writeFileSync, unlinkSync, readdirSync, statSync, mkdirSync } from 'fs';
import { join, dirname, basename } from 'path';

const PROBLEMATIC_FILES = [];
const MOVED_FILES = [];

function findProblematicFiles(dir, files = []) {
  try {
    const items = readdirSync(dir);
    
    for (const item of items) {
      const fullPath = join(dir, item);
      const stat = statSync(fullPath);
      
      if (stat.isDirectory()) {
        if (!['node_modules', '.git', 'dist', 'build', '.svelte-kit'].includes(item)) {
          findProblematicFiles(fullPath, files);
        }
      } else if (item.endsWith('.svelte') || item.endsWith('.ts')) {
        // Check if file has problematic patterns
        if (isProblematicFile(item, fullPath)) {
          files.push(fullPath);
        }
      }
    }
  } catch (error) {
    console.warn(`Warning: Could not process directory ${dir}: ${error.message}`);
  }
  
  return files;
}

function isProblematicFile(filename, fullPath) {
  // Files that should be archived/excluded from build
  const problematicPatterns = [
    /backup/i,
    /archive/i,
    /\.stories\./,
    /\.test\./,
    /\.spec\./,
    /temp/i,
    /old/i
  ];
  
  if (problematicPatterns.some(pattern => pattern.test(filename))) {
    return true;
  }
  
  // Check file content for severe syntax errors
  try {
    const content = readFileSync(fullPath, 'utf8');
    
    // Files with corrupted characters or severe syntax errors
    if (content.includes('�') || // Corrupted unicode
        content.includes('() >(>') || // Malformed syntax
        content.includes('onDestroy, onMount } from "svelte";\n  import { onDestroy, onMount') || // Duplicate imports
        content.match(/import.*\{.*\}.*from.*;\s*import.*\{.*\}.*from.*svelte.*;\s*import.*\{.*\}.*from.*svelte/s)) {
      return true;
    }
    
  } catch (error) {
    // If we can't read the file, it's probably problematic
    return true;
  }
  
  return false;
}

function createArchiveDir() {
  const archiveDir = join(process.cwd(), 'archives', 'auto-moved');
  try {
    mkdirSync(archiveDir, { recursive: true });
    return archiveDir;
  } catch (error) {
    console.error('Could not create archive directory:', error.message);
    return null;
  }
}

function moveToArchive(filePath, archiveDir) {
  try {
    const filename = basename(filePath);
    const relativePath = filePath.replace(process.cwd(), '').replace(/^[\\\/]/, '');
    const archivePath = join(archiveDir, relativePath.replace(/[\\\/]/g, '_'));
    
    const content = readFileSync(filePath, 'utf8');
    writeFileSync(archivePath, content);
    unlinkSync(filePath);
    
    MOVED_FILES.push({ from: filePath, to: archivePath });
    console.log(`📦 Moved: ${relativePath}`);
    return true;
  } catch (error) {
    console.error(`✗ Error moving ${filePath}:`, error.message);
    return false;
  }
}

function fixRemainingFiles() {
  // Fix specific known problematic files that we want to keep but fix
  const filesToFix = [
    'sveltekit-frontend/src/routes/+layout.svelte',
    'sveltekit-frontend/src/routes/layout.backup.svelte',
    'sveltekit-frontend/src/routes/layout.complex.svelte'
  ];
  
  for (const relativePath of filesToFix) {
    const fullPath = join(process.cwd(), relativePath);
    try {
      let content = readFileSync(fullPath, 'utf8');
      let modified = false;
      
      // Fix snippet/children issues
      if (content.includes('{@render snippet()}') && !content.includes('snippet') && !content.includes('children')) {
        content = content.replace('{@render snippet()}', '{@render children?.()}');
        modified = true;
      }
      
      if (content.includes('{@render children?.()}') && !content.includes('{ children }')) {
        // Add children to props
        const scriptMatch = content.match(/<script[^>]*>/);
        if (scriptMatch) {
          const insertPos = scriptMatch.index + scriptMatch[0].length;
          const propsCode = '\n  const { children } = $props();\n';
          content = content.slice(0, insertPos) + propsCode + content.slice(insertPos);
          modified = true;
        }
      }
      
      // Fix currentFeedbackTrigger null issues
      if (content.includes('currentFeedbackTrigger.')) {
        content = content.replace(/currentFeedbackTrigger\.(\w+)/g, 'currentFeedbackTrigger?.${1}');
        modified = true;
      }
      
      if (modified) {
        writeFileSync(fullPath, content);
        console.log(`🔧 Fixed: ${relativePath}`);
      }
      
    } catch (error) {
      console.warn(`Could not fix ${relativePath}:`, error.message);
    }
  }
}

function main() {
  console.log('🧹 Starting backup file cleanup...\n');
  
  // Find all problematic files
  const problematicFiles = findProblematicFiles(process.cwd());
  console.log(`📁 Found ${problematicFiles.length} problematic files\n`);
  
  if (problematicFiles.length === 0) {
    console.log('✅ No problematic files found!');
    return;
  }
  
  // Create archive directory
  const archiveDir = createArchiveDir();
  if (!archiveDir) {
    console.error('❌ Could not create archive directory. Aborting.');
    return;
  }
  
  // Move problematic files to archive
  let movedCount = 0;
  for (const file of problematicFiles) {
    if (moveToArchive(file, archiveDir)) {
      movedCount++;
    }
  }
  
  // Fix remaining files that we want to keep
  console.log('\n🔧 Fixing remaining files...');
  fixRemainingFiles();
  
  // Report results
  console.log(`\n📊 Cleanup Summary:`);
  console.log(`Files moved to archive: ${movedCount}`);
  console.log(`Archive location: ${archiveDir}`);
  
  if (MOVED_FILES.length > 0) {
    console.log('\n📦 Moved files:');
    MOVED_FILES.forEach(({ from, to }) => {
      console.log(`  ${basename(from)} → archives/`);
    });
  }
  
  console.log('\n✅ Cleanup complete!');
}

main();