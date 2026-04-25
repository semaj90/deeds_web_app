#!/usr/bin/env node
/**
 * SIMPLE TYPESCRIPT COMPILER-BASED FIXER
 * 
 * Uses TypeScript's built-in compiler API (already installed)
 * No external dependencies needed
 * Focuses on high-value, safe fixes only
 */

const fs = require('fs');
const path = require('path');
const ts = require('typescript');

console.log('\n╔══════════════════════════════════════════════════════════════════╗');
console.log('║         TypeScript Compiler API - Safe Fixer                    ║');
console.log('╚══════════════════════════════════════════════════════════════════╝\n');

const stats = {
  filesProcessed: 0,
  filesFixed: 0,
  fixesApplied: 0
};

/**
 * Fix a single TypeScript file using compiler API
 */
function fixTypeScriptFile(filePath) {
  const sourceText = fs.readFileSync(filePath, 'utf8');
  
  // Create source file
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true
  );

  let modified = false;
  const fixes = [];

  /**
   * Visit each node in the AST
   */
  function visit(node) {
    // Fix 1: Missing semicolons in interfaces
    if (ts.isPropertySignature(node)) {
      const text = sourceText.substring(node.pos, node.end);
      if (!text.trim().endsWith(';') && !text.trim().endsWith(',')) {
        fixes.push({
          pos: node.end,
          text: ';',
          description: 'Add semicolon to property signature'
        });
      }
    }

    // Fix 2: Generic type parameters missing commas
    if (ts.isTypeReferenceNode(node) && node.typeArguments && node.typeArguments.length > 1) {
      // TypeScript AST handles this automatically
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  // Apply fixes (in reverse order to maintain positions)
  if (fixes.length > 0) {
    let newText = sourceText;
    fixes.reverse().forEach(fix => {
      newText = newText.slice(0, fix.pos) + fix.text + newText.slice(fix.pos);
      stats.fixesApplied++;
    });

    fs.writeFileSync(filePath, newText);
    modified = true;
  }

  stats.filesProcessed++;
  if (modified) {
    stats.filesFixed++;
    console.log(`✅ Fixed: ${filePath} (${fixes.length} changes)`);
  }
}

// Find all TypeScript files
const glob = require('glob');
const files = glob.sync('src/**/*.{ts,tsx}', {
  ignore: ['**/node_modules/**', '**/.svelte-kit/**', '**/build/**']
});

console.log(`📁 Found ${files.length} TypeScript files\n`);
console.log('🔧 Processing files...\n');

// Process ALL files
const isDryRun = process.argv.includes('--dry-run');

if (isDryRun) {
  console.log('🔍 DRY RUN MODE - No files will be modified\n');
}

files.forEach((file, index) => {
  try {
    if (!isDryRun) {
      fixTypeScriptFile(file);
    }
    
    // Progress indicator every 100 files
    if ((index + 1) % 100 === 0) {
      console.log(`   Processed ${index + 1}/${files.length} files...`);
    }
  } catch (error) {
    console.log(`⚠️  Skipped ${file}: ${error.message}`);
  }
});

console.log('\n' + '='.repeat(70));
console.log(`✅ Complete!`);
console.log('='.repeat(70));
console.log(`📊 Files processed: ${stats.filesProcessed}`);
console.log(`📝 Files fixed: ${stats.filesFixed}`);
console.log(`🔧 Total fixes applied: ${stats.fixesApplied}\n`);

if (!isDryRun && stats.fixesApplied > 0) {
  console.log('📋 Next steps:');
  console.log('   1. Run: npx tsc --noEmit --skipLibCheck > logs/after-ts-fixer.log');
  console.log('   2. Compare error count');
  console.log('   3. Commit if improved\n');
}
