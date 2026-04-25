#!/usr/bin/env node
/**
 * fix-double-opacity.mjs
 *
 * Fixes corrupted UnoCSS double opacity modifiers across .svelte files.
 * Pattern: `bg-info/20/20` → `bg-info/20` (keeps second value)
 *
 * Usage:
 *   node scripts/fix-double-opacity.mjs              # dry-run (preview changes)
 *   node scripts/fix-double-opacity.mjs --apply       # apply changes
 *   node scripts/fix-double-opacity.mjs --verbose      # dry-run with full diffs
 *   node scripts/fix-double-opacity.mjs --apply --verbose  # apply + show diffs
 *   node scripts/fix-double-opacity.mjs --path src/lib/components/yorha  # target specific dir
 */
import { readFileSync, writeFileSync } from 'fs';
import { globSync } from 'glob';
import { resolve, relative } from 'path';

const ROOT = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const dryRun = !args.includes('--apply');
const verbose = args.includes('--verbose');
const pathArg = args.find((_, i) => args[i - 1] === '--path');

// UnoCSS utility prefixes that can have opacity modifiers
const UTILITY_PREFIXES = [
  'bg', 'text', 'border', 'divide', 'ring', 'shadow',
  'from', 'via', 'to', 'outline', 'decoration',
  'placeholder', 'caret', 'accent', 'fill', 'stroke'
];

// Svelte/CSS pseudo-class prefixes
const PSEUDO_PREFIXES = [
  'hover:', 'focus:', 'active:', 'disabled:', 'dark:',
  'group-hover:', 'peer-hover:', 'first:', 'last:',
  'dark:hover:', 'dark:focus:', 'hover:dark:'
];

// Build regex dynamically
const utilityPattern = UTILITY_PREFIXES.join('|');
const pseudoPattern = PSEUDO_PREFIXES.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
const mainRegex = new RegExp(
  `((?:${pseudoPattern})?(?:${utilityPattern})[-\\w]*)\\/(\\d+)\\/(\\d+)`,
  'g'
);

// Determine scan path
const scanGlob = pathArg
  ? `${pathArg}/**/*.svelte`
  : 'src/{lib/components,routes/(app),lib/client}/**/*.svelte';

const files = globSync(scanGlob, { cwd: ROOT }).map(f => resolve(ROOT, f));

let totalFixed = 0;
let filesFixed = 0;
let filesScanned = 0;
const fileChanges = [];

for (const file of files) {
  filesScanned++;
  let content = readFileSync(file, 'utf8');
  const original = content;
  const replacements = [];

  content = content.replace(mainRegex, (match, base, first, second) => {
    const fixed = `${base}/${second}`;
    replacements.push({ from: match, to: fixed, first, second });
    totalFixed++;
    return fixed;
  });

  if (content !== original) {
    filesFixed++;
    const relPath = relative(ROOT, file);
    fileChanges.push({ path: relPath, count: replacements.length, replacements });

    if (!dryRun) {
      writeFileSync(file, content, 'utf8');
    }
  }
}

// Output results
const mode = dryRun ? 'DRY RUN' : 'APPLIED';
console.log(`\n--- fix-double-opacity [${mode}] ---`);
console.log(`Scanned: ${filesScanned} files`);
console.log(`Affected: ${filesFixed} files`);
console.log(`Replacements: ${totalFixed}`);

if (fileChanges.length > 0) {
  console.log(`\nChanged files:`);
  for (const { path, count, replacements } of fileChanges) {
    console.log(`  ${path} (${count} fix${count > 1 ? 'es' : ''})`);
    if (verbose) {
      for (const r of replacements) {
        console.log(`    - ${r.from} → ${r.to}`);
      }
    }
  }
}

if (dryRun && totalFixed > 0) {
  console.log(`\nRun with --apply to write changes.`);
}

console.log('');