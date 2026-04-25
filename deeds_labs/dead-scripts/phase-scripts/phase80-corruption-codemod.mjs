#!/usr/bin/env node

/**
 * Phase 80: Automated Colon-Comma Corruption Codemod
 *
 * Fixes the widespread pattern where colons (:) replace commas (,) in:
 * - Object properties
 * - Function parameters
 * - Type unions
 * - Interface declarations
 *
 * Usage:
 *   node scripts/phase80-corruption-codemod.mjs --file <path>
 *   node scripts/phase80-corruption-codemod.mjs --pattern all --dry-run
 *   node scripts/phase80-corruption-codemod.mjs --dir src/lib/config --apply
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { extname, join } from 'path';

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const shouldApply = args.includes('--apply');
const fileArg = args.find(a => a.startsWith('--file='))?.split('=')[1];
const dirArg = args.find(a => a.startsWith('--dir='))?.split('=')[1];
const patternArg = args.find(a => a.startsWith('--pattern='))?.split('=')[1] || 'all';

console.log('🔧 Phase 80: Colon-Comma Corruption Codemod\\n');

const CORRUPTION_PATTERNS = [
  {
    name: 'object-property-colon',
    description: 'Fix object properties with colon instead of comma',
    // Match: property: value: nextProperty
    regex: /(\w+):\s*([^:,{}\n]+):\s*(\w+):/g,
    replacement: '$1: $2,\n  $3:',
    examples: ['email: attributes.email: firstName:', 'id: session.id: userId:']
  },
  {
    name: 'union-type-colon',
    description: 'Fix type unions with colon instead of pipe',
    // Match: Type: null (should be Type | null)
    regex: /:\s*([A-Z]\w+(?:<[^>]+>)?)\s*:\s*null/g,
    replacement: ': $1 | null',
    examples: ['session: Session: null', 'data: MyType<T>: null']
  },
  {
    name: 'function-param-colon',
    description: 'Fix function parameters with colons',
    // Match: param: type: nextParam, type
    regex: /\(([^)]+):\s*([^:,)]+):\s*(\w+),\s*([^:)]+):/g,
    replacement: '($1: $2, $3: $4:',
    examples: ['(message: unknown: originalMessage, unknown:', '(cookies: Cookies: sessionId: string,']
  },
  {
    name: 'duplicate-property',
    description: 'Remove duplicate property assignments',
    // Match: property, property: value
    regex: /(\w+),\s*\1:\s*/g,
    replacement: '$1: ',
    examples: ['attributes, attributes:', 'session, session:']
  },
  {
    name: 'comma-expected',
    description: 'Fix missing commas in object literals',
    // Match: property: value<newline>property2:
    regex: /(\w+):\s*([^:,{}\n]+)\s+(?!\/)\s*(\w+):/g,
    replacement: '$1: $2,\n  $3:',
    examples: ['enabled: true\n  fallback:', 'count: 5\n  max:']
  }
];

function applyFixes(content, patterns = CORRUPTION_PATTERNS) {
  let fixed = content;
  let totalFixes = 0;
  const appliedFixes = [];

  for (const pattern of patterns) {
    const matches = [...fixed.matchAll(pattern.regex)];
    if (matches.length > 0) {
      fixed = fixed.replace(pattern.regex, pattern.replacement);
      totalFixes += matches.length;
      appliedFixes.push({
        pattern: pattern.name,
        count: matches.length,
        description: pattern.description
      });
    }
  }

  return { fixed, totalFixes, appliedFixes };
}

function processFile(filePath) {
  try {
    const content = readFileSync(filePath, 'utf8');
    const result = applyFixes(content);

    if (result.totalFixes > 0) {
      console.log(`\\n📝 ${filePath}`);
      console.log(`   Fixes applied: ${result.totalFixes}`);

      result.appliedFixes.forEach(fix => {
        console.log(`   - ${fix.pattern}: ${fix.count} fixes`);
      });

      if (!isDryRun && shouldApply) {
        writeFileSync(filePath, result.fixed, 'utf8');
        console.log(`   ✅ File updated`);
      } else if (isDryRun) {
        console.log(`   🔍 Dry run - no changes made`);
      }

      return result.totalFixes;
    }

    return 0;
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
    return 0;
  }
}

function processDirectory(dirPath) {
  let totalFixes = 0;
  const files = readdirSync(dirPath);

  for (const file of files) {
    const fullPath = join(dirPath, file);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      totalFixes += processDirectory(fullPath);
    } else if (['.ts', '.svelte.ts', '.mjs', '.js'].includes(extname(file))) {
      totalFixes += processFile(fullPath);
    }
  }

  return totalFixes;
}

// Main execution
if (fileArg) {
  console.log(`Processing single file: ${fileArg}\\n`);
  const fixes = processFile(fileArg);
  console.log(`\\n✅ Total fixes: ${fixes}`);
} else if (dirArg) {
  console.log(`Processing directory: ${dirArg}\\n`);
  const fixes = processDirectory(dirArg);
  console.log(`\\n✅ Total fixes: ${fixes}`);
} else {
  console.error('❌ Usage: node phase80-corruption-codemod.mjs --file <path> | --dir <path>');
  console.error('   Options: --dry-run, --apply, --pattern <name>');
  process.exit(1);
}

if (isDryRun) {
  console.log('\\n🔍 Dry run complete - no files were modified');
  console.log('   Run with --apply to write changes');
} else if (shouldApply) {
  console.log('\\n✅ Files updated successfully');
}
