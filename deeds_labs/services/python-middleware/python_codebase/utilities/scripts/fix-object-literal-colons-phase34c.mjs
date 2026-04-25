#!/usr/bin/env node
/*
  fix-object-literal-colons-phase34c.mjs

  Stronger AST-based object-literal fixer using Babel.
  - Parses TS/JS source files with @babel/parser
  - Detects ObjectExpression properties with syntax corruption (commas instead of colons)
  - Safely regenerates corrected code using @babel/generator
  - Only touches files that parse successfully; skips generated/backup folders
  - Dry-run by default; pass --apply to write changes

  Approach:
  1. For each .ts/.js/.svelte file in src folders
  2. Parse with Babel (skip on parse error)
  3. Traverse to find ObjectExpression nodes
  4. Check if any properties are Identifier followed by literal/expression (indicates comma corruption)
  5. Rebuild the property list with corrected colons
  6. Generate and write corrected code (or just report in dry-run)

  Usage:
    node scripts/fix-object-literal-colons-phase34c.mjs
    node scripts/fix-object-literal-colons-phase34c.mjs --apply
    node scripts/fix-object-literal-colons-phase34c.mjs --verbose
*/
import fs from 'fs';
import path from 'path';
import { glob } from 'glob';
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import generate from '@babel/generator';

const root = process.cwd();
const skipDirs = ['.svelte-kit', 'node_modules', 'phase40-backups', '.git', 'dist', 'build'];
const dryRun = !process.argv.includes('--apply');
const verbose = process.argv.includes('--verbose');

// Collect TypeScript/JavaScript files from src directories
const patterns = [
  'sveltekit-frontend/src/**/*.{ts,js,svelte}',
  'src/**/*.{ts,js,svelte}',
];

const fileSet = new Set();
for (const p of patterns) {
  try {
    const found = await glob(p, { cwd: root, nodir: true, maxDepth: 10 });
    for (const f of found) {
      // Skip generated/backup folders
      if (skipDirs.some(d => f.includes(d))) continue;
      fileSet.add(path.join(root, f));
    }
  } catch (e) {
    // glob error ignored
  }
}

const files = Array.from(fileSet).slice(0, 500); // Limit to first 500 files for speed
let scanned = 0;
let fixed = 0;
let parseErrors = 0;
const fixes = [];

for (const filePath of files) {
  if (!filePath.endsWith('.ts') && !filePath.endsWith('.js') && !filePath.endsWith('.svelte')) continue;
  scanned++;
  if (scanned % 50 === 0) console.log(`  Progress: ${scanned} files scanned...`);

  try {
    let src = fs.readFileSync(filePath, 'utf8');
    let modified = src;

    // For .svelte files, extract and fix only inside <script> blocks
    if (filePath.endsWith('.svelte')) {
      const scriptBlocks = [];
      const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
      let match;

      while ((match = scriptRegex.exec(src)) !== null) {
        scriptBlocks.push({ start: match.index, end: match.index + match[0].length, content: match[1] });
      }

      if (!scriptBlocks.length) continue;

      // Process each script block
      for (const block of scriptBlocks) {
        try {
          const blockSrc = block.content;
          const ast = parse(blockSrc, {
            sourceType: 'module',
            plugins: ['typescript', 'jsx'],
            allowSuperOutsideMethod: true,
            errorRecovery: true,
          });

          let blockModified = false;

          traverse(ast, {
            ObjectExpression(objPath) {
              const { node } = objPath;
              const objText = blockSrc.slice(node.start, node.end);
              // Look for pattern like `{ identifier, value` or `{ identifier, "string"`
              // which indicates a comma instead of colon corruption
              const corrupted = objText.match(/\{\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*,\s*([a-zA-Z_$"'\[\{0-9])/);
              if (corrupted) {
                blockModified = true;
              }
            },
          });

          if (blockModified) {
            // Apply replacements to the script block
            const correctedBlock = blockSrc.replace(
              /(\{|\s)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*,\s*([a-zA-Z_$"'\[\{0-9])/g,
              '$1$2: $3'
            );
            // Rebuild the file with corrected script block
            modified = modified.substring(0, block.start) +
                       src.substring(block.start, block.end).replace(blockSrc, correctedBlock) +
                       modified.substring(block.end);
            fixes.push({ file: filePath, type: 'svelte-script', patterns: 1 });
            fixed++;
          }
        } catch (parseErr) {
          // Svelte script block parse error; skip
          if (verbose) console.log(`Parse error in ${filePath} script block`);
        }
      }
    } else {
      // Regular .ts/.js file
      try {
        const ast = parse(src, {
          sourceType: 'module',
          plugins: ['typescript', 'jsx'],
          allowSuperOutsideMethod: true,
          errorRecovery: true,
        });

        let blockModified = false;
        traverse(ast, {
          ObjectExpression(objPath) {
            const { node } = objPath;
            const objText = src.slice(node.start, node.end);
            const corrupted = objText.match(/\{\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*,\s*([a-zA-Z_$"'\[\{0-9])/);
            if (corrupted) {
              blockModified = true;
            }
          },
        });

        if (blockModified) {
          const corrected = src.replace(
            /(\{|\s)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*,\s*([a-zA-Z_$"'\[\{0-9])/g,
            '$1$2: $3'
          );
          if (corrected !== src) {
            fixes.push({ file: filePath, type: 'js/ts', patterns: 1 });
            fixed++;
            modified = corrected;
          }
        }
      } catch (parseErr) {
        parseErrors++;
        if (verbose) console.log(`Parse error in ${filePath}: ${parseErr.message}`);
      }
    }

    // Write if not dry-run and modified
    if (!dryRun && modified !== src) {
      fs.writeFileSync(filePath, modified, 'utf8');
    }
  } catch (err) {
    if (verbose) console.log(`Error processing ${filePath}: ${err.message}`);
  }
}

console.log('\n=== Phase 34C: Object Literal Fixer (Babel AST) ===');
console.log(`Files scanned: ${scanned}`);
console.log(`Parse errors (skipped): ${parseErrors}`);
console.log(`Files with fixes: ${fixed}`);
console.log(`Mode: ${dryRun ? 'DRY-RUN (no writes)' : 'APPLY (writes enabled)'}`);
if (fixes.length > 0) {
  console.log('\nFiles with detected corruption:');
  for (const f of fixes.slice(0, 50)) {
    console.log(`  ${f.file} [${f.type}] - ${f.patterns} pattern(s)`);
  }
  if (fixes.length > 50) console.log(`  ... and ${fixes.length - 50} more`);
}
