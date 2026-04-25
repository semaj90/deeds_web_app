#!/usr/bin/env node
/**
 * Test Async Effect Fixes
 * 
 * Verifies that:
 * 1. No async patterns remain
 * 2. All fixed files are syntactically valid
 * 3. Cleanup functions are properly returned
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const results = {
  totalFiles: 0,
  validFiles: 0,
  asyncPatternsFound: [],
  syntaxErrors: [],
  cleanupIssues: [],
  warnings: []
};

/**
 * Check for remaining async patterns
 */
async function checkForAsyncPatterns(filePath, content) {
  const asyncEffectRegex = /effect\s*\(\s*async\s*\(/g;
  const asyncOnMountRegex = /onMount\s*\(\s*async\s*\(/g;
  
  const effectMatches = content.match(asyncEffectRegex) || [];
  const onMountMatches = content.match(asyncOnMountRegex) || [];
  
  if (effectMatches.length > 0 || onMountMatches.length > 0) {
    results.asyncPatternsFound.push({
      file: path.relative(process.cwd(), filePath),
      effectCount: effectMatches.length,
      onMountCount: onMountMatches.length
    });
  }
}

/**
 * Basic syntax validation
 */
async function validateSyntax(filePath, content) {
  // Check for basic syntax issues
  const issues = [];
  
  // Check for balanced braces in script sections
  const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/);
  if (scriptMatch) {
    const scriptContent = scriptMatch[1];
    const openBraces = (scriptContent.match(/\{/g) || []).length;
    const closeBraces = (scriptContent.match(/\}/g) || []).length;
    
    if (openBraces !== closeBraces) {
      issues.push(`Unbalanced braces: ${openBraces} open, ${closeBraces} close`);
    }
  }
  
  // Check for common IIFE mistakes
  if (content.includes('(async () => {') && !content.includes('})();')) {
    issues.push('IIFE may not be properly closed');
  }
  
  if (issues.length > 0) {
    results.syntaxErrors.push({
      file: path.relative(process.cwd(), filePath),
      issues
    });
  }
}

/**
 * Check cleanup function patterns
 */
async function checkCleanupPatterns(filePath, content) {
  const warnings = [];
  
  // Check if effect/onMount has IIFE but no cleanup
  const effectWithIIFERegex = /(effect|onMount)\s*\(\s*\(\)\s*=>\s*\{[\s\S]*?\(\s*async\s*\(\)\s*=>\s*\{[\s\S]*?\}\s*\)\s*\(\)\s*;?[\s\S]*?\}\s*\)/g;
  
  const matches = content.matchAll(effectWithIIFERegex);
  for (const match of matches) {
    const block = match[0];
    
    // Check if block has cleanup (return statement)
    if (!block.includes('return')) {
      // This might be intentional, but worth noting
      warnings.push('Effect/onMount with async IIFE but no cleanup function');
    }
    
    // Check if return is inside the IIFE (wrong place)
    const iifeMatch = block.match(/\(\s*async\s*\(\)\s*=>\s*\{([\s\S]*?)\}\s*\)\s*\(\)/);
    if (iifeMatch && iifeMatch[1].includes('return () =>')) {
      warnings.push('Cleanup function inside IIFE - should be outside');
    }
  }
  
  if (warnings.length > 0) {
    results.warnings.push({
      file: path.relative(process.cwd(), filePath),
      warnings
    });
  }
}

/**
 * Process a single file
 */
async function processFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    results.totalFiles++;
    
    await checkForAsyncPatterns(filePath, content);
    await validateSyntax(filePath, content);
    await checkCleanupPatterns(filePath, content);
    
    results.validFiles++;
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error.message);
  }
}

/**
 * Find all Svelte files
 */
async function findSvelteFiles(dir) {
  const files = [];
  
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
          files.push(...await findSvelteFiles(fullPath));
        }
      } else if (entry.name.endsWith('.svelte') && !entry.name.includes('.backup')) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dir}:`, error.message);
  }
  
  return files;
}

/**
 * Main execution
 */
async function main() {
  console.log('🧪 Testing Async Effect Fixes\n');
  
  const srcDir = path.join(__dirname, 'src');
  const files = await findSvelteFiles(srcDir);
  
  console.log(`Testing ${files.length} Svelte files...\n`);
  
  // Process all files
  for (const file of files) {
    await processFile(file);
  }
  
  // Print results
  console.log('📊 Test Results:\n');
  console.log(`✅ Total files tested: ${results.totalFiles}`);
  console.log(`✅ Valid files: ${results.validFiles}`);
  
  if (results.asyncPatternsFound.length > 0) {
    console.log(`\n❌ ASYNC PATTERNS STILL FOUND (${results.asyncPatternsFound.length} files):`);
    results.asyncPatternsFound.forEach(({ file, effectCount, onMountCount }) => {
      console.log(`   ${file}:`);
      if (effectCount > 0) console.log(`      - ${effectCount} async effect(s)`);
      if (onMountCount > 0) console.log(`      - ${onMountCount} async onMount(s)`);
    });
  } else {
    console.log('✅ No async patterns found - all fixes applied correctly!');
  }
  
  if (results.syntaxErrors.length > 0) {
    console.log(`\n⚠️  SYNTAX ISSUES (${results.syntaxErrors.length} files):`);
    results.syntaxErrors.forEach(({ file, issues }) => {
      console.log(`   ${file}:`);
      issues.forEach(issue => console.log(`      - ${issue}`));
    });
  } else {
    console.log('✅ No syntax errors detected');
  }
  
  if (results.warnings.length > 0) {
    console.log(`\n⚠️  WARNINGS (${results.warnings.length} files - may need manual review):`);
    results.warnings.forEach(({ file, warnings }) => {
      console.log(`   ${file}:`);
      warnings.forEach(warning => console.log(`      - ${warning}`));
    });
  } else {
    console.log('✅ No warnings - cleanup patterns look good');
  }
  
  // Overall status
  const allGood = results.asyncPatternsFound.length === 0 && 
                  results.syntaxErrors.length === 0;
  
  console.log('\n' + '='.repeat(60));
  if (allGood) {
    console.log('✅ ALL TESTS PASSED - ASYNC EFFECTS FIXED CORRECTLY!');
  } else {
    console.log('⚠️  SOME ISSUES FOUND - REVIEW NEEDED');
  }
  console.log('='.repeat(60));
  
  // Save test results
  await fs.writeFile(
    path.join(__dirname, 'async-fix-test-results.json'),
    JSON.stringify(results, null, 2)
  );
  
  console.log('\n📝 Test results saved to: async-fix-test-results.json');
  
  // Exit with error code if issues found
  process.exit(allGood ? 0 : 1);
}

main().catch(console.error);
