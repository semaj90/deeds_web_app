#!/usr/bin/env node
/**
 * Fix Import Colon Corruption Script
 * Fixes corrupted `import type { A: B }` patterns to `import type { A, B }`
 * Also fixes Map<string: Type> to Map<string, Type>
 *
 * Usage:
 *   node scripts/fix-import-colon-corruption.mjs --dry-run    # Preview changes
 *   node scripts/fix-import-colon-corruption.mjs --apply      # Apply fixes
 */

import fs from 'fs';
import path from 'path';
import { glob } from 'glob';

// Configuration
const BASE_DIR = path.resolve(process.cwd(), 'src');
const DRY_RUN = process.argv.includes('--dry-run');
const APPLY = process.argv.includes('--apply');

if (!DRY_RUN && !APPLY) {
  console.log('Usage:');
  console.log('  node scripts/fix-import-colon-corruption.mjs --dry-run    # Preview changes');
  console.log('  node scripts/fix-import-colon-corruption.mjs --apply      # Apply fixes');
  process.exit(1);
}

// Stats
let filesScanned = 0;
let filesModified = 0;
let totalFixes = 0;

/**
 * Fix patterns in file content
 * @param {string} content File content
 * @param {string} filePath File path for logging
 * @returns {{ content: string, fixes: number }}
 */
function fixPatterns(content, filePath) {
  let fixes = 0;
  let result = content;

  // Pattern 1: import type { A: B } => import type { A, B }
  // Matches: import type { Word: Word, ...} or import type { Word: Word }
  const importTypeColonRegex = /import\s+type\s*\{([^}]+)\}/g;

  result = result.replace(importTypeColonRegex, (match, inner) => {
    // Check if inner has colons that should be commas (between identifiers)
    // Pattern: identifier: identifier (not identifier: string or identifier?: type)
    const fixedInner = inner.replace(/(\w+)\s*:\s*(\w+)(?=\s*[,}])/g, (m, a, b) => {
      // Skip if it looks like a type annotation (e.g., foo: string, bar: number)
      const typeAnnotationKeywords = [
        'string', 'number', 'boolean', 'any', 'unknown', 'void', 'null',
        'undefined', 'never', 'object', 'symbol', 'bigint', 'true', 'false'
      ];
      if (typeAnnotationKeywords.includes(b.toLowerCase())) {
        return m; // Don't fix - this is a valid type annotation
      }
      // If both are PascalCase or camelCase identifiers, likely a corrupted import
      if (/^[A-Z]/.test(a) && /^[A-Z]/.test(b)) {
        fixes++;
        return `${a}, ${b}`;
      }
      if (/^[a-z]/.test(a) && /^[a-z]/.test(b)) {
        // Could be two identifiers like { foo: bar } - less confident
        // Skip for safety
        return m;
      }
      return m;
    });

    if (fixedInner !== inner) {
      return `import type { ${fixedInner} }`;
    }
    return match;
  });

  // Pattern 2: Map<string: Type> => Map<string, Type>
  const mapGenericRegex = /Map<(\w+)\s*:\s*(\w+)/g;
  result = result.replace(mapGenericRegex, (match, keyType, valueType) => {
    fixes++;
    return `Map<${keyType}, ${valueType}`;
  });

  // Pattern 3: export type { A: B } => export type { A, B }
  const exportTypeColonRegex = /export\s+type\s*\{([^}]+)\}/g;
  result = result.replace(exportTypeColonRegex, (match, inner) => {
    const fixedInner = inner.replace(/(\w+)\s*:\s*(\w+)(?=\s*[,}])/g, (m, a, b) => {
      const typeAnnotationKeywords = [
        'string', 'number', 'boolean', 'any', 'unknown', 'void', 'null',
        'undefined', 'never', 'object', 'symbol', 'bigint', 'true', 'false'
      ];
      if (typeAnnotationKeywords.includes(b.toLowerCase())) {
        return m;
      }
      if (/^[A-Z]/.test(a) && /^[A-Z]/.test(b)) {
        fixes++;
        return `${a}, ${b}`;
      }
      return m;
    });
    if (fixedInner !== inner) {
      return `export type { ${fixedInner} }`;
    }
    return match;
  });

  return { content: result, fixes };
}

async function main() {
  console.log(`\n🔧 Import Colon Corruption Fixer`);
  console.log(`   Mode: ${DRY_RUN ? 'DRY RUN (preview only)' : 'APPLY FIXES'}`);
  console.log(`   Base directory: ${BASE_DIR}\n`);

  // Find all TypeScript and Svelte files
  const patterns = [
    'src/**/*.ts',
    'src/**/*.svelte'
  ];

  const files = await glob(patterns, {
    cwd: process.cwd(),
    ignore: ['**/node_modules/**', '**/*.d.ts.backup', '**/.backup/**']
  });

  console.log(`📂 Found ${files.length} files to scan\n`);

  const changes = [];

  for (const file of files) {
    filesScanned++;
    const filePath = path.resolve(process.cwd(), file);

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const { content: fixed, fixes } = fixPatterns(content, file);

      if (fixes > 0) {
        changes.push({
          file,
          fixes,
          before: content.substring(0, 500),
          after: fixed.substring(0, 500)
        });
        totalFixes += fixes;

        if (APPLY) {
          fs.writeFileSync(filePath, fixed, 'utf-8');
          filesModified++;
          console.log(`✅ Fixed ${file} (${fixes} fixes)`);
        } else {
          console.log(`📋 Would fix ${file} (${fixes} fixes)`);
        }
      }
    } catch (err) {
      console.error(`❌ Error processing ${file}:`, err.message);
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Files scanned: ${filesScanned}`);
  console.log(`   Files with issues: ${changes.length}`);
  console.log(`   Total fixes: ${totalFixes}`);

  if (DRY_RUN && changes.length > 0) {
    console.log(`\n⚠️  Run with --apply to apply these fixes`);
  } else if (APPLY && filesModified > 0) {
    console.log(`   Files modified: ${filesModified}`);
    console.log(`\n✅ Fixes applied successfully!`);
  }
}

main().catch(console.error);
