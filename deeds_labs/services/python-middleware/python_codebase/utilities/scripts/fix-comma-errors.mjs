#!/usr/bin/env node
/**
 * Automated TypeScript Comma Error Fixer
 *
 * Fixes TS1005 "comma expected" errors by parsing TypeScript files and
 * inserting missing commas in object literals, function parameters, etc.
 *
 * Usage:
 *   node scripts/fix-comma-errors.mjs --dry-run    # Preview changes
 *   node scripts/fix-comma-errors.mjs --fix         # Apply fixes
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const srcDir = path.join(rootDir, 'sveltekit-frontend', 'src');

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const shouldFix = args.includes('--fix');

if (!isDryRun && !shouldFix) {
  console.log('Usage: node fix-comma-errors.mjs [--dry-run | --fix]');
  console.log('  --dry-run  : Show what would be fixed without making changes');
  console.log('  --fix      : Apply fixes to files');
  process.exit(1);
}

console.log(`🔧 TypeScript Comma Error Fixer`);
console.log(`Mode: ${isDryRun ? 'DRY RUN' : 'FIXING FILES'}`);
console.log('='.repeat(60));

/**
 * Get all TypeScript errors from tsc
 */
async function getTypeScriptErrors() {
  try {
    const { stdout } = await execAsync(
      'npx tsc --noEmit --skipLibCheck 2>&1',
      { cwd: path.join(rootDir, 'sveltekit-frontend'), maxBuffer: 50 * 1024 * 1024 }
    );
    return stdout;
  } catch (error) {
    // tsc returns non-zero exit code when there are errors
    return error.stdout || '';
  }
}

/**
 * Parse TS1005 errors from tsc output
 */
function parseCommaErrors(tscOutput) {
  const errors = [];
  const lines = tscOutput.split('\n');

  for (const line of lines) {
    // Match: src/lib/file.ts(123,45): error TS1005: ',' expected.
    const match = line.match(/^(.+?)\((\d+),(\d+)\):\s*error TS1005:/);
    if (match) {
      const [, filePath, lineNum, colNum] = match;
      errors.push({
        file: filePath.replace(/\\/g, '/'),
        line: parseInt(lineNum, 10),
        column: parseInt(colNum, 10),
        message: line
      });
    }
  }

  return errors;
}

/**
 * Group errors by file
 */
function groupErrorsByFile(errors) {
  const byFile = new Map();

  for (const error of errors) {
    if (!byFile.has(error.file)) {
      byFile.set(error.file, []);
    }
    byFile.get(error.file).push(error);
  }

  return byFile;
}

/**
 * Fix missing commas in a file
 */
async function fixFileCommas(filePath, errors) {
  const fullPath = path.join(rootDir, 'sveltekit-frontend', filePath);

  try {
    const content = await fs.readFile(fullPath, 'utf-8');
    const lines = content.split('\n');

    // Sort errors by line number (descending) to fix from bottom to top
    // This prevents line number shifts from affecting subsequent fixes
    const sortedErrors = errors.sort((a, b) => b.line - a.line);

    let fixCount = 0;

    for (const error of sortedErrors) {
      const lineIndex = error.line - 1;
      if (lineIndex < 0 || lineIndex >= lines.length) continue;

      const line = lines[lineIndex];
      const beforeComma = line.slice(0, error.column - 1);
      const afterComma = line.slice(error.column - 1);

      // Heuristic: Insert comma if line doesn't already have one at the expected position
      // and if it looks like an object property or parameter
      if (!beforeComma.trimEnd().endsWith(',') &&
          !afterComma.trimStart().startsWith(',')) {

        // Check if this looks like a place where comma should go
        const trimmed = beforeComma.trimEnd();
        if (trimmed.length > 0) {
          // Insert comma at the end of the trimmed content
          lines[lineIndex] = trimmed + ',' + line.slice(trimmed.length);
          fixCount++;
        }
      }
    }

    if (fixCount > 0) {
      if (!isDryRun) {
        await fs.writeFile(fullPath, lines.join('\n'), 'utf-8');
      }
      return { fixed: fixCount, total: errors.length };
    }

    return { fixed: 0, total: errors.length };
  } catch (err) {
    console.error(`❌ Error processing ${filePath}:`, err.message);
    return { fixed: 0, total: errors.length, error: err.message };
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('\n📊 Step 1: Analyzing TypeScript errors...\n');

  const tscOutput = await getTypeScriptErrors();
  const commaErrors = parseCommaErrors(tscOutput);

  console.log(`Found ${commaErrors.length} TS1005 comma errors\n`);

  const errorsByFile = groupErrorsByFile(commaErrors);
  console.log(`Errors spread across ${errorsByFile.size} files\n`);

  console.log('\n🔨 Step 2: Fixing comma errors...\n');

  let totalFixed = 0;
  let filesModified = 0;

  for (const [file, errors] of errorsByFile) {
    const result = await fixFileCommas(file, errors);

    if (result.fixed > 0) {
      filesModified++;
      totalFixed += result.fixed;
      console.log(`✅ ${file}: Fixed ${result.fixed}/${result.total} errors`);
    } else if (result.error) {
      console.log(`❌ ${file}: ${result.error}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`\n📈 Summary:`);
  console.log(`   Files processed: ${errorsByFile.size}`);
  console.log(`   Files modified:  ${filesModified}`);
  console.log(`   Errors fixed:    ${totalFixed}/${commaErrors.length}`);
  console.log(`   Mode:            ${isDryRun ? 'DRY RUN (no changes made)' : 'FIXED'}`);

  if (isDryRun) {
    console.log(`\n💡 Run with --fix to apply these changes`);
  } else {
    console.log(`\n✨ Changes applied! Run TypeScript compiler to verify.`);
  }
}

main().catch(console.error);
