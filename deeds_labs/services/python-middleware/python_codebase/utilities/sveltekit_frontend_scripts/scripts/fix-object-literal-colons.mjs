#!/usr/bin/env node
/**
 * Phase 34C: Object Literal Colon Recovery (Enhanced AST Transformer)
 * Detects and repairs corrupted object literals: { key, value } -> { key: value }
 * Uses Babel parser for safety (no regex replacements).
 * 
 * Corruption pattern from Phase 34B:
 *   const report = { estimated_fixes, 12 }  // WRONG
 *   const report = { estimated_fixes: 12 }  // CORRECT
 * 
 * Usage: 
 *   node fix-object-literal-colons.mjs           # Dry-run mode (no changes)
 *   node fix-object-literal-colons.mjs --apply   # Apply fixes
 *   node fix-object-literal-colons.mjs --verbose # Show detailed output
 */

import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import parser from '@babel/parser';
import _traverse from '@babel/traverse';
import _generate from '@babel/generator';
import * as t from '@babel/types';

// Handle ESM/CJS interop
const traverse = _traverse.default || _traverse;
const generate = _generate.default || _generate;

// Parse command line arguments
const apply = process.argv.includes('--apply');
const verbose = process.argv.includes('--verbose');
const dryRun = !apply;

const stats = {
  filesScanned: 0,
  filesFixed: 0,
  literalsRepaired: 0,
  errors: []
};

console.log('\n🔧 Phase 34C: Object Literal Colon Recovery');
console.log(`Mode: ${apply ? '✏️ APPLY (will modify files)' : '👁️ DRY-RUN (read-only)'}`);
console.log('='.repeat(70));

const startTime = Date.now();

// Scan TypeScript and Svelte files
const patterns = ['src/**/*.ts', 'src/**/*.svelte', 'src/**/*.js'];
let allFiles = [];

for (const pattern of patterns) {
  try {
    const files = await glob(pattern, { ignore: ['**/node_modules/**', '**/.svelte-kit/**'] });
    allFiles = allFiles.concat(files);
  } catch (err) {
    console.error(`⚠️  Pattern ${pattern} failed:`, err.message);
  }
}

console.log(`\n📁 Found ${allFiles.length} files to scan\n`);

for (const file of allFiles) {
  stats.filesScanned++;
  
  if (stats.filesScanned % 100 === 0) {
    process.stdout.write(`\r⏳ Progress: ${stats.filesScanned}/${allFiles.length} files...`);
  }
  
  let code;
  try {
    code = fs.readFileSync(file, 'utf8');
  } catch (err) {
    stats.errors.push({ file, error: 'Read error', message: err.message });
    continue;
  }
  
  // Quick pre-check: skip files without suspicious patterns
  if (!code.match(/\{[^}]*,\s*\d+/) && !code.match(/\{[^}]*,\s*['"`]/)) {
    continue;
  }
  
  // Extract script content from Svelte files
  let scriptContent = code;
  let isScriptExtraction = false;
  if (file.endsWith('.svelte')) {
    const scriptMatch = code.match(/<script[^>]*>([\s\S]*?)<\/script>/);
    if (scriptMatch) {
      scriptContent = scriptMatch[1];
      isScriptExtraction = true;
    } else {
      continue; // No script content
    }
  }
  
  let ast;
  try {
    ast = parser.parse(scriptContent, {
      sourceType: 'module',
      plugins: [
        'typescript',
        'jsx',
        'decorators-legacy',
        'classProperties',
        'objectRestSpread',
        'optionalChaining',
        'nullishCoalescingOperator'
      ],
      errorRecovery: true
    });
  } catch (err) {
    // Skip files that can't be parsed
    continue;
  }
  
  let fileChanged = false;
  let fileRepairCount = 0;
  
  try {
    traverse(ast, {
      ObjectExpression(nodePath) {
        try {
          const props = nodePath.node.properties;
          
          for (let i = 0; i < props.length; i++) {
            const prop = props[i];
            
            // Look for pattern: ObjectProperty with shorthand that has a literal value
            // This indicates { key, value } corruption where it should be { key: value }
            if (t.isObjectProperty(prop) && prop.shorthand) {
              // Shorthand should only be { key } not { key, value }
              // If we have a comma-separated value after, it's corruption
              const nextProp = props[i + 1];
              
              // Check if current prop looks like identifier and next is a literal
              if (nextProp && 
                  t.isIdentifier(prop.key) && 
                  t.isIdentifier(prop.value) &&
                  prop.key.name === prop.value.name) {
                
                // This is legitimate shorthand like { foo } meaning { foo: foo }
                continue;
              }
            }
            
            // Detect pattern: two sequential properties where first has no value
            // indicating { identifier , literal } corruption
            if (t.isObjectProperty(prop) && i < props.length - 1) {
              const nextProp = props[i + 1];
              
              // Pattern: { key: key, literal } where key is duplicated
              if (t.isIdentifier(prop.key) &&
                  t.isIdentifier(prop.value) &&
                  prop.key.name === prop.value.name &&
                  nextProp &&
                  (t.isNumericLiteral(nextProp.key) || 
                   t.isStringLiteral(nextProp.key) ||
                   t.isBooleanLiteral(nextProp.key))) {
                
                // Fix: Make first property use the literal as value
                prop.value = nextProp.key;
                prop.shorthand = false;
                
                // Remove the next property (it was the value, not a separate property)
                props.splice(i + 1, 1);
                
                fileChanged = true;
                fileRepairCount++;
                stats.literalsRepaired++;
              }
            }
          }
        } catch (err) {
          // Skip problematic nodes within traverse
        }
      }
    });
  } catch (err) {
    // Babel traverse error - skip this file
    stats.errors.push({ file, error: 'Traverse error', message: err.message.split('\n')[0] });
    continue;
  }
  
  if (fileChanged) {
    const relativePath = path.relative(process.cwd(), file);
    
    if (apply) {
      try {
        let output;
        if (isScriptExtraction) {
          // Regenerate just the script section
          const newScript = generate(ast, {
            retainLines: true,
            compact: false
          }).code;
          
          // Replace script content in original file
          output = code.replace(
            /<script[^>]*>[\s\S]*?<\/script>/,
            match => {
              const scriptTag = match.match(/<script[^>]*>/)[0];
              return `${scriptTag}\n${newScript}\n</script>`;
            }
          );
        } else {
          output = generate(ast, {
            retainLines: true,
            compact: false
          }).code;
        }
        
        fs.writeFileSync(file, output, 'utf8');
        stats.filesFixed++;
        
        if (verbose) {
          console.log(`\r✅ Fixed ${fileRepairCount} literals → ${relativePath}`);
        }
      } catch (err) {
        stats.errors.push({ file, error: 'Write error', message: err.message });
      }
    } else {
      // Dry-run mode: just report what would be fixed
      stats.filesFixed++;
      if (verbose) {
        console.log(`\r🔍 Would fix ${fileRepairCount} literals → ${relativePath}`);
      }
    }
  }
}

const duration = ((Date.now() - startTime) / 1000).toFixed(2);

console.log('\n\n' + '='.repeat(70));
console.log('📊 Phase 34C Summary');
console.log('='.repeat(70));
console.log(`\nFiles scanned:      ${stats.filesScanned.toLocaleString()}`);
console.log(`Files fixed:        ${stats.filesFixed.toLocaleString()}`);
console.log(`Literals repaired:  ${stats.literalsRepaired.toLocaleString()}`);
console.log(`Processing time:    ${duration}s`);
console.log(`Errors encountered: ${stats.errors.length}`);

if (stats.errors.length > 0 && stats.errors.length <= 10) {
  console.log('\n⚠️  Errors:');
  stats.errors.forEach(e => {
    console.log(`   ${e.file}: ${e.error} - ${e.message}`);
  });
}

console.log('\n' + '='.repeat(70));

if (stats.filesFixed > 0) {
  if (apply) {
    console.log('✅ Object literal recovery complete!');
    console.log('\nNext steps:');
    console.log('  1. npx tsc --noEmit (verify syntax)');
    console.log('  2. npx svelte-check --threshold error');
    console.log('  3. npm run build (test production build)');
  } else {
    console.log(`🔍 Dry-run complete - ${stats.filesFixed} files would be modified`);
    console.log('\n💡 To apply fixes, run:');
    console.log('   node scripts/fix-object-literal-colons.mjs --apply');
  }
} else {
  console.log('✅ No corrupted object literals found');
}

console.log('\n');

process.exit(stats.errors.length > 0 ? 1 : 0);
