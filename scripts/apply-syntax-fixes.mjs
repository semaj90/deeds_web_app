#!/usr/bin/env node
/**
 * Apply Syntax Fixes Script
 *
 * Runs the syntax repair patterns against the codebase to fix common errors.
 * This script applies the patterns created in the svelte5-comprehensive-testing-remediation spec.
 *
 * Usage:
 *   node scripts/apply-syntax-fixes.mjs [--dry-run] [--verbose] [--pattern <name>]
 */

import { readFile, writeFile, readdir, stat, copyFile } from 'fs/promises';
import { join, extname, dirname } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');
const srcDir = join(rootDir, 'sveltekit-frontend', 'src');

// Parse command line arguments
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const verbose = args.includes('--verbose');
const patternIndex = args.indexOf('--pattern');
const selectedPattern = patternIndex !== -1 ? args[patternIndex + 1] : null;

console.log('='.repeat(60));
console.log('Syntax Fix Application Script');
console.log('='.repeat(60));
console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE (will modify files)'}`);
console.log(`Verbose: ${verbose}`);
if (selectedPattern) console.log(`Pattern: ${selectedPattern}`);
console.log('');

// Pattern definitions (simplified versions that work in plain JS)
const patterns = [
  {
    name: 'import-type-inline',
    description: 'Fix inline type imports: import { type X } -> import type { X }',
    fileTypes: ['.ts', '.svelte'],
    regex: /import\s*\{\s*type\s+(\w+)\s*\}/g,
    replace: 'import type { $1 }',
  },
  {
    name: 'import-type-mixed',
    description: 'Fix mixed imports with type keyword',
    fileTypes: ['.ts', '.svelte'],
    regex: /import\s*\{\s*(\w+),\s*type\s+(\w+)\s*\}/g,
    replace: 'import { $1 } from',
  },
  {
    name: 'onclick-handler',
    description: 'Convert on:click to onclick for Svelte 5',
    fileTypes: ['.svelte'],
    regex: /on:click=/g,
    replace: 'onclick=',
  },
  {
    name: 'onchange-handler',
    description: 'Convert on:change to onchange for Svelte 5',
    fileTypes: ['.svelte'],
    regex: /on:change=/g,
    replace: 'onchange=',
  },
  {
    name: 'oninput-handler',
    description: 'Convert on:input to oninput for Svelte 5',
    fileTypes: ['.svelte'],
    regex: /on:input=/g,
    replace: 'oninput=',
  },
  {
    name: 'onsubmit-handler',
    description: 'Convert on:submit to onsubmit for Svelte 5',
    fileTypes: ['.svelte'],
    regex: /on:submit=/g,
    replace: 'onsubmit=',
  },
  {
    name: 'onkeydown-handler',
    description: 'Convert on:keydown to onkeydown for Svelte 5',
    fileTypes: ['.svelte'],
    regex: /on:keydown=/g,
    replace: 'onkeydown=',
  },
  {
    name: 'onmouseover-handler',
    description: 'Convert on:mouseover to onmouseover for Svelte 5',
    fileTypes: ['.svelte'],
    regex: /on:mouseover=/g,
    replace: 'onmouseover=',
  },
  {
    name: 'onmouseout-handler',
    description: 'Convert on:mouseout to onmouseout for Svelte 5',
    fileTypes: ['.svelte'],
    regex: /on:mouseout=/g,
    replace: 'onmouseout=',
  },
  {
    name: 'onfocus-handler',
    description: 'Convert on:focus to onfocus for Svelte 5',
    fileTypes: ['.svelte'],
    regex: /on:focus=/g,
    replace: 'onfocus=',
  },
  {
    name: 'onblur-handler',
    description: 'Convert on:blur to onblur for Svelte 5',
    fileTypes: ['.svelte'],
    regex: /on:blur=/g,
    replace: 'onblur=',
  },
  {
    name: 'colon-chain-simple',
    description: 'Fix simple colon chain corruption: key: value: -> key: value,',
    fileTypes: ['.ts', '.svelte'],
    regex: /(\w+):\s*(\w+):\s*(?=\w+:)/g,
    replace: '$1: $2,\n  ',
  },
  {
    name: 'double-colon',
    description: 'Fix double colon syntax: :: -> :',
    fileTypes: ['.ts', '.svelte'],
    regex: /::/g,
    replace: ':',
  },
  // DISABLED: Too aggressive, causes corruption
  // {
  //   name: 'trailing-comma-object',
  //   description: 'Add missing trailing comma before closing brace',
  //   fileTypes: ['.ts', '.svelte'],
  //   regex: /(\w+)\s*\n\s*\}/g,
  //   replace: '$1,\n}',
  // },
];

// Directories to exclude
const excludeDirs = ['node_modules', '.svelte-kit', 'dist', 'build', '.git', 'syntax-repair'];

// Stats tracking
let totalFiles = 0;
let filesModified = 0;
let totalFixes = 0;
const fixesByPattern = new Map();

/**
 * Recursively find all files
 */
async function findFiles(dir, extensions) {
  const files = [];

  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!excludeDirs.includes(entry.name)) {
          const subFiles = await findFiles(fullPath, extensions);
          files.push(...subFiles);
        }
      } else if (entry.isFile()) {
        const ext = extname(entry.name);
        if (extensions.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dir}:`, error.message);
  }

  return files;
}

/**
 * Apply patterns to a single file
 */
async function processFile(filePath) {
  try {
    let content = await readFile(filePath, 'utf-8');
    const originalContent = content;
    let fileFixCount = 0;
    const ext = extname(filePath);

    for (const pattern of patterns) {
      // Skip if pattern doesn't apply to this file type
      if (!pattern.fileTypes.includes(ext)) continue;

      // Skip if a specific pattern was requested and this isn't it
      if (selectedPattern && pattern.name !== selectedPattern) continue;

      // Count matches before replacement
      const matches = content.match(pattern.regex);
      const matchCount = matches ? matches.length : 0;

      if (matchCount > 0) {
        // Apply the fix
        content = content.replace(pattern.regex, pattern.replace);
        fileFixCount += matchCount;

        // Track stats
        const current = fixesByPattern.get(pattern.name) || 0;
        fixesByPattern.set(pattern.name, current + matchCount);

        if (verbose) {
          console.log(`  [${pattern.name}] ${matchCount} fixes in ${filePath}`);
        }
      }
    }

    // If content changed, write it back
    if (content !== originalContent) {
      if (!dryRun) {
        // Create backup
        const backupPath = `${filePath}.backup`;
        await copyFile(filePath, backupPath);

        // Write fixed content
        await writeFile(filePath, content, 'utf-8');
      }

      filesModified++;
      totalFixes += fileFixCount;

      if (verbose || fileFixCount > 5) {
        console.log(`${dryRun ? '[DRY RUN] Would fix' : 'Fixed'} ${fileFixCount} issues in ${filePath.replace(rootDir, '')}`);
      }
    }

    return true;
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error.message);
    return false;
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('Finding files to process...');

  const files = await findFiles(srcDir, ['.ts', '.svelte']);
  totalFiles = files.length;

  console.log(`Found ${totalFiles} files to process\n`);
  console.log('Applying fixes...\n');

  let processed = 0;
  for (const file of files) {
    await processFile(file);
    processed++;

    // Progress indicator every 100 files
    if (processed % 100 === 0) {
      process.stdout.write(`\rProcessed ${processed}/${totalFiles} files...`);
    }
  }

  console.log('\n');
  console.log('='.repeat(60));
  console.log('RESULTS');
  console.log('='.repeat(60));
  console.log(`Total files scanned: ${totalFiles}`);
  console.log(`Files modified: ${filesModified}`);
  console.log(`Total fixes applied: ${totalFixes}`);
  console.log('');

  if (fixesByPattern.size > 0) {
    console.log('Fixes by pattern:');
    for (const [pattern, count] of fixesByPattern.entries()) {
      console.log(`  ${pattern}: ${count}`);
    }
  }

  if (dryRun) {
    console.log('\n[DRY RUN] No files were actually modified.');
    console.log('Run without --dry-run to apply fixes.');
  } else if (filesModified > 0) {
    console.log('\nBackup files created with .backup extension.');
    console.log('Run svelte-check to verify error reduction.');
  }
}

main().catch(console.error);
