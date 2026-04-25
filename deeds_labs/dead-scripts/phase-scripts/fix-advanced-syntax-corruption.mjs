#!/usr/bin/env node
/**
 * Fix Advanced Syntax Corruption Script
 * Catches additional corruption patterns beyond simple import type fixes:
 * 1. Record<A: B> patterns in generics
 * 2. Tuple types [A: B] instead of [A, B]
 * 3. Function call arguments with colons instead of commas
 * 4. Object properties with missing commas
 *
 * Usage:
 *   node scripts/fix-advanced-syntax-corruption.mjs --dry-run    # Preview changes
 *   node scripts/fix-advanced-syntax-corruption.mjs --apply      # Apply fixes
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
  console.log('  node scripts/fix-advanced-syntax-corruption.mjs --dry-run    # Preview changes');
  console.log('  node scripts/fix-advanced-syntax-corruption.mjs --apply      # Apply fixes');
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
 * @returns {{ content: string, fixes: { pattern: string, count: number }[] }}
 */
function fixPatterns(content, filePath) {
  const fixes = [];
  let result = content;

  // Pattern 1: Record<A: B> => Record<A, B>
  // Also works for Map<A: B>, Set<A: B>, etc.
  const recordGenericRegex = /(\b(?:Record|Map|WeakMap|Set|WeakSet|Array|Promise|Partial|Required|Readonly|Pick|Omit|Exclude|Extract))\s*<\s*(\w+)\s*:\s*(\w+)/g;
  const matches1 = result.match(recordGenericRegex);
  if (matches1) {
    result = result.replace(recordGenericRegex, '$1<$2, $3');
    fixes.push({ pattern: 'Generic<A: B>', count: matches1.length });
  }

  // Pattern 2: Fixed tuple syntax [number: number] => [number, number]
  const tupleRegex = /\[\s*(number|string|boolean|any|unknown)\s*:\s*(number|string|boolean|any|unknown)\s*\]/g;
  const matches2 = result.match(tupleRegex);
  if (matches2) {
    result = result.replace(tupleRegex, '[$1, $2]');
    fixes.push({ pattern: 'Tuple [A: B]', count: matches2.length });
  }

  // Pattern 3: Omit<T: K> & Partial<> patterns
  const omitPartialRegex = /(Omit|Pick|Exclude|Extract)\s*<\s*(\w+)\s*:\s*(\w+)\s*>/g;
  const matches3 = result.match(omitPartialRegex);
  if (matches3) {
    result = result.replace(omitPartialRegex, '$1<$2, $3>');
    fixes.push({ pattern: 'Utility<T: K>', count: matches3.length });
  }

  // Pattern 4: ActorRef<Snapshot: Event> => ActorRef<Snapshot, Event>
  const actorRefRegex = /ActorRef\s*<\s*(\w+)\s*:\s*(\w+)\s*>/g;
  const matches4 = result.match(actorRefRegex);
  if (matches4) {
    result = result.replace(actorRefRegex, 'ActorRef<$1, $2>');
    fixes.push({ pattern: 'ActorRef<A: B>', count: matches4.length });
  }

  // Pattern 5: Math.max(0: Math.min(...)) => Math.max(0, Math.min(...))
  // Matches function calls where first arg has colon instead of comma
  const mathCallRegex = /(Math\.\w+)\s*\(\s*(\d+)\s*:\s*(Math\.\w+)/g;
  const matches5 = result.match(mathCallRegex);
  if (matches5) {
    result = result.replace(mathCallRegex, '$1($2, $3');
    fixes.push({ pattern: 'Math.fn(a: b)', count: matches5.length });
  }

  // Pattern 6: { durable, true } => { durable: true } (wrong comma instead of colon for object property)
  // This is the reverse pattern - comma where colon should be
  const objPropCommaRegex = /\{\s*(\w+),\s*(true|false)\s*\}/g;
  const matches6 = result.match(objPropCommaRegex);
  if (matches6) {
    result = result.replace(objPropCommaRegex, '{ $1: $2 }');
    fixes.push({ pattern: '{ prop, value }', count: matches6.length });
  }

  return { content: result, fixes };
}

async function main() {
  console.log(`\n🔧 Advanced Syntax Corruption Fixer`);
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
  const patternStats = {};

  for (const file of files) {
    filesScanned++;
    const filePath = path.resolve(process.cwd(), file);

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const { content: fixed, fixes } = fixPatterns(content, file);

      if (fixes.length > 0) {
        const totalForFile = fixes.reduce((sum, f) => sum + f.count, 0);
        changes.push({ file, fixes, totalFixes: totalForFile });
        totalFixes += totalForFile;

        // Track pattern stats
        for (const fix of fixes) {
          patternStats[fix.pattern] = (patternStats[fix.pattern] || 0) + fix.count;
        }

        if (APPLY) {
          fs.writeFileSync(filePath, fixed, 'utf-8');
          filesModified++;
          console.log(`✅ Fixed ${file} (${totalForFile} fixes)`);
        } else {
          console.log(`📋 Would fix ${file} (${totalForFile} fixes)`);
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

  if (Object.keys(patternStats).length > 0) {
    console.log(`\n📈 Pattern breakdown:`);
    for (const [pattern, count] of Object.entries(patternStats)) {
      console.log(`   ${pattern}: ${count} fixes`);
    }
  }

  if (DRY_RUN && changes.length > 0) {
    console.log(`\n⚠️  Run with --apply to apply these fixes`);
  } else if (APPLY && filesModified > 0) {
    console.log(`   Files modified: ${filesModified}`);
    console.log(`\n✅ Fixes applied successfully!`);
  }
}

main().catch(console.error);
