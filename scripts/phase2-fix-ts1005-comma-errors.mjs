#!/usr/bin/env node

/**
 * Phase 2: Fix TS1005 Comma Errors
 *
 * Targets 26,725 TS1005 errors (59.5% of all TypeScript errors)
 *
 * Patterns Fixed:
 * 1. Import type syntax: `{ Name: Name }` → `{ Name }`
 * 2. Object literal shorthand with comma: `prop, value ||` → `prop: value ||`
 * 3. Expression with comma: `Date.now() -, startTime` → `Date.now() - startTime`
 * 4. Malformed object properties
 *
 * Usage: node scripts/phase2-fix-ts1005-comma-errors.mjs [--dry-run] [--verbose]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

// Statistics
const stats = {
  filesScanned: 0,
  filesModified: 0,
  patternsFixed: {
    importTypeSyntax: 0,
    objectShorthandComma: 0,
    expressionComma: 0,
    malformedProperties: 0,
  },
  totalFixes: 0,
};

/**
 * Fix patterns in a single file
 */
function fixFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  let modified = content;
  let fileChanged = false;

  // Pattern 1: Import type with colon instead of 'as'
  // Example: `import type { Session: Session }` → `import type { Session }`
  const importTypePattern = /import\s+type\s+\{\s*(\w+):\s*\1\s*\}/g;
  const importTypeMatches = [...content.matchAll(importTypePattern)];
  if (importTypeMatches.length > 0) {
    modified = modified.replace(importTypePattern, 'import type { $1 }');
    stats.patternsFixed.importTypeSyntax += importTypeMatches.length;
    fileChanged = true;
    if (VERBOSE) {
      console.log(`  Fixed ${importTypeMatches.length} import type syntax errors`);
    }
  }

  // Pattern 2: Expression with comma instead of operator
  // Example: `Date.now() -, startTime` → `Date.now() - startTime`
  const expressionCommaPattern = /(\w+\(\))\s*-,\s*(\w+)/g;
  const expressionMatches = [...modified.matchAll(expressionCommaPattern)];
  if (expressionMatches.length > 0) {
    modified = modified.replace(expressionCommaPattern, '$1 - $2');
    stats.patternsFixed.expressionComma += expressionMatches.length;
    fileChanged = true;
    if (VERBOSE) {
      console.log(`  Fixed ${expressionMatches.length} expression comma errors`);
    }
  }

  // Pattern 3: Object shorthand with comma instead of colon (in object literals only)
  // Example: `embedding, doc.embedding ||` → `embedding: doc.embedding ||`
  // Only fix if we're inside an object literal context
  const contentLines = modified.split('\n');
  let inObjectLiteral = 0;
  let fixedObjectShorthand = false;

  for (let i = 0; i < contentLines.length; i++) {
    const line = contentLines[i];

    // Track object literal depth (simple heuristic)
    const openBraces = (line.match(/\{/g) || []).length;
    const closeBraces = (line.match(/\}/g) || []).length;
    inObjectLiteral += openBraces - closeBraces;

    // Only fix if inside object literal and not in function parameters
    if (inObjectLiteral > 0 && !line.includes('constructor') && !line.includes('function')) {
      const objectShorthandPattern = /(\w+),\s*(\w+\.\w+)\s*(\|\||&&)/g;
      const matches = [...line.matchAll(objectShorthandPattern)];

      if (matches.length > 0) {
        contentLines[i] = line.replace(objectShorthandPattern, '$1: $2 $3');
        stats.patternsFixed.objectShorthandComma += matches.length;
        fixedObjectShorthand = true;
      }
    }
  }

  if (fixedObjectShorthand) {
    modified = contentLines.join('\n');
    fileChanged = true;
    if (VERBOSE) {
      console.log(`  Fixed object shorthand comma errors`);
    }
  }

  // Pattern 4: Malformed object properties with leading comma
  // Example: `input.documentId, input.caseId,` → `documentId: input.documentId, caseId: input.caseId,`
  const modifiedLines = modified.split('\n');
  let inObjectLiteral2 = 0;
  let fixedMalformed = false;

  for (let i = 0; i < modifiedLines.length; i++) {
    const line = modifiedLines[i];

    // Track object literal depth
    inObjectLiteral2 += (line.match(/\{/g) || []).length;
    inObjectLiteral2 -= (line.match(/\}/g) || []).length;

    if (inObjectLiteral2 > 0) {
      // Fix pattern: `input.prop,` → `prop: input.prop,`
      const fixedLine = line.replace(/(\w+)\.(\w+),/g, (match, obj, prop) => {
        // Check if this looks like a malformed property
        if (line.includes(`${obj}.${prop},`) && !line.includes(`${prop}:`)) {
          stats.patternsFixed.malformedProperties++;
          fixedMalformed = true;
          return `${prop}: ${obj}.${prop},`;
        }
        return match;
      });

      if (fixedLine !== line) {
        modifiedLines[i] = fixedLine;
      }
    }
  }

  if (fixedMalformed) {
    modified = modifiedLines.join('\n');
    fileChanged = true;
    if (VERBOSE) {
      console.log(`  Fixed malformed object properties`);
    }
  }

  if (fileChanged) {
    stats.filesModified++;
    stats.totalFixes += Object.values(stats.patternsFixed).reduce((a, b) => a + b, 0);

    if (!DRY_RUN) {
      fs.writeFileSync(filePath, modified, 'utf8');
    }

    return true;
  }

  return false;
}

/**
 * Recursively scan directory for TypeScript/Svelte files
 */
function scanDirectory(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip node_modules, .svelte-kit, build, dist
      if (!['node_modules', '.svelte-kit', 'build', 'dist', '.git'].includes(entry.name)) {
        scanDirectory(fullPath, files);
      }
    } else if (entry.isFile()) {
      // Only process .ts, .svelte files (not .d.ts)
      if (/\.(ts|svelte)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

/**
 * Main execution
 */
async function main() {
  console.log('🔧 Phase 2: Fix TS1005 Comma Errors');
  console.log('=====================================\n');

  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE - No files will be modified\n');
  }

  const startTime = Date.now();
  const srcDir = path.join(__dirname, '..', 'sveltekit-frontend', 'src');

  console.log(`📂 Scanning: ${srcDir}\n`);

  const files = scanDirectory(srcDir);
  console.log(`📄 Found ${files.length} TypeScript/Svelte files\n`);

  console.log('🔨 Processing files...\n');

  for (const file of files) {
    stats.filesScanned++;

    try {
      const changed = fixFile(file);

      if (changed && VERBOSE) {
        console.log(`✅ ${path.relative(srcDir, file)}`);
      }
    } catch (error) {
      console.error(`❌ Error processing ${file}:`, error.message);
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log('\n📊 Summary');
  console.log('==========');
  console.log(`Files scanned: ${stats.filesScanned}`);
  console.log(`Files modified: ${stats.filesModified}`);
  console.log(`\nFixes by pattern:`);
  console.log(`  Import type syntax: ${stats.patternsFixed.importTypeSyntax}`);
  console.log(`  Object shorthand comma: ${stats.patternsFixed.objectShorthandComma}`);
  console.log(`  Expression comma: ${stats.patternsFixed.expressionComma}`);
  console.log(`  Malformed properties: ${stats.patternsFixed.malformedProperties}`);
  console.log(`\nTotal fixes: ${stats.totalFixes}`);
  console.log(`Duration: ${duration}s`);

  if (DRY_RUN) {
    console.log('\n⚠️  DRY RUN - No files were actually modified');
    console.log('Run without --dry-run to apply changes');
  } else {
    console.log('\n✅ Changes applied successfully');
    console.log('\nNext steps:');
    console.log('1. Run: npx tsc --noEmit > tsc-errors-after-phase2.txt');
    console.log('2. Compare error counts');
    console.log('3. Commit changes if successful');
  }
}

main().catch(console.error);
