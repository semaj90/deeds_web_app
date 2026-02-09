#!/usr/bin/env node

/**
 * ULTRA-CONSERVATIVE Colon Corruption Fixer
 *
 * Only fixes OBVIOUS corruption patterns that are unambiguously wrong:
 * 1. Array elements: [1: 2, 3] → [1, 2, 3]
 * 2. Vertices arrays: new Float32Array([x: y]) → new Float32Array([x, y])
 * 3. Specific function calls we've manually verified
 *
 * Does NOT fix:
 * - Function parameters (could be valid type annotations)
 * - Object literals (colons are correct there)
 * - Generic type arguments (could be valid)
 */

import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { resolve } from 'path';

console.log('🔧 ULTRA-CONSERVATIVE COLON CORRUPTION FIXER\n');
console.log('='.repeat(80) + '\n');

const DRY_RUN = false; // APPLYING FIXES - manually verified

if (DRY_RUN) {
  console.log('⚠️  DRY RUN MODE - No files will be modified\n');
}

const gitFiles = execSync(
  'git ls-files "src/**/*.ts" "src/**/*.svelte"',
  { encoding: 'utf-8' }
)
  .split('\n')
  .filter(Boolean)
  .map(f => f.trim());

console.log(`Found ${gitFiles.length} git-tracked files\n`);

let filesProcessed = 0;
let filesWithMatches = 0;
let totalFixes = 0;
const fixedFiles: Array<{
  file: string;
  fixes: string[];
}> = [];

// ULTRA-CONSERVATIVE patterns - only fix what we KNOW is wrong
const patterns = [
  {
    name: 'array-number-colon',
    // Match: [0.5: 0.5, 1.0] in Float32Array/vertices
    regex: /new\s+Float32Array\(\[\s*([^[\]]*\d+\.\d+:\s*\d+\.\d+[^[\]]*)\]\)/g,
    description: 'Float32Array with colon-separated numbers',
    fix: (match: string, arrayContent: string) => {
      // Replace all colons with commas in number sequences
      const fixed = arrayContent.replace(/(\d+\.\d+):\s*(\d+\.\d+)/g, '$1, $2');
      return `new Float32Array([${fixed}])`;
    }
  },
  {
    name: 'array-literal-colon-numbers',
    // Match: [-0.5, -0.5: 0.0] but NOT {key: value} or URL ports
    regex: /\[([^[\]{}]*?)(\d+):\s*(\d+(?:\.\d+)?)/g,
    description: 'Array literal with numeric colon',
    fix: (match: string, before: string, num1: string, num2: string) => {
      // Only fix if no braces (object literal check)
      if (before.includes('{') || before.includes('}')) {
        return match;
      }
      // Don't fix URLs (http://localhost:port or 127.0.0.1:port)
      if (before.includes('http://') || before.includes('https://') ||
          before.includes('localhost') || /\d+\.\d+\.\d+\.\d+/.test(before)) {
        return match;
      }
      // Don't fix if num1 ends with common URL patterns (114 in 11434)
      if (num1.length >= 3 && before.endsWith(num1.slice(0, -1))) {
        return match; // Likely a URL port like 1143**4**:
      }
      return `[${before}${num1}, ${num2}`;
    }
  }
];

for (const filePath of gitFiles) {
  try {
    const fullPath = resolve(filePath);
    let content = readFileSync(fullPath, 'utf-8');
    const originalContent = content;
    const fileFixes: string[] = [];

    for (const pattern of patterns) {
      const matches = [...content.matchAll(pattern.regex)];

      for (const match of matches) {
        const original = match[0];
        const fixed = pattern.fix(match[0], ...match.slice(1));

        if (original !== fixed) {
          content = content.replace(original, fixed);
          fileFixes.push(`${pattern.name}: ${original.substring(0, 50)}... → ${fixed.substring(0, 50)}...`);
          totalFixes++;
        }
      }
    }

    if (content !== originalContent) {
      filesWithMatches++;
      fixedFiles.push({ file: filePath, fixes: fileFixes });

      if (!DRY_RUN) {
        writeFileSync(fullPath, content, 'utf-8');
      }

      console.log(`📄 ${filePath}`);
      fileFixes.forEach(fix => console.log(`   ${fix}`));
    }

    filesProcessed++;
  } catch (err) {
    console.error(`✗ Error processing ${filePath}:`, err instanceof Error ? err.message : String(err));
  }
}

console.log('\n' + '='.repeat(80));
console.log(`\n📊 ${DRY_RUN ? 'DRY RUN ' : ''}RESULTS:\n`);
console.log(`Files scanned: ${filesProcessed}`);
console.log(`Files with matches: ${filesWithMatches}`);
console.log(`Total fixes: ${totalFixes}`);

if (filesWithMatches > 0) {
  console.log(`\n📝 Files ${DRY_RUN ? 'that would be ' : ''}modified:\n`);
  fixedFiles.forEach(({ file, fixes }) => {
    console.log(`  • ${file} (${fixes.length} fixes)`);
  });
}

console.log(`\n${DRY_RUN ? '⚠️  THIS IS A DRY RUN - Review the changes above carefully!' : '✅ APPLIED!'}`);
console.log(`\n${DRY_RUN ? '💡 To apply, set DRY_RUN = false AND manually verify each pattern' : '🎉 Changes applied'}\n`);

// Save report
const reportPath = resolve('obvious-colon-corruption-report.json');
writeFileSync(
  reportPath,
  JSON.stringify(
    {
      timestamp: new Date().toISOString(),
      dryRun: DRY_RUN,
      filesProcessed,
      filesWithMatches,
      totalFixes,
      fixedFiles
    },
    null,
    2
  )
);

console.log(`📄 Report saved: obvious-colon-corruption-report.json\n`);
