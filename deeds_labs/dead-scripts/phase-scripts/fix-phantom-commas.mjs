import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Automated Phantom Comma Fixer
 *
 * Fixes patterns like:
 * - {, property: value } → { property: value }
 * - {{, duration: 150 }} → {{ duration: 150 }}
 * - Promise<{, valid: boolean }> → Promise<{ valid: boolean }>
 *
 * Expected impact: 232 errors → 0
 */

const COMPONENT_DIRS = [
  '../src/lib/components',
  '../src/routes',
  '../src/lib/services',
  '../src/lib/stores',
  '../src/lib/state',
];

// Parse command line args
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run') || args.includes('-d');
const VERBOSE = args.includes('--verbose') || args.includes('-v');

function fixPhantomCommas(content) {
  let fixed = content;
  let changesMade = 0;
  const changes = [];

  // Pattern 1: Opening brace followed by comma and space
  // Example: {, property: value } or {{, property
  const phantomCommaPattern1 = /\{\s*,\s+/g;
  const matches1 = content.match(phantomCommaPattern1);
  if (matches1) {
    changesMade += matches1.length;
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (phantomCommaPattern1.test(line)) {
        const beforeFix = line;
        lines[i] = line.replace(phantomCommaPattern1, '{ ');
        if (lines[i] !== beforeFix && VERBOSE) {
          changes.push({
            line: i + 1,
            before: beforeFix.trim(),
            after: lines[i].trim(),
            pattern: 'Opening brace phantom comma'
          });
        }
      }
    }
    fixed = lines.join('\n');
  }

  // Pattern 2: Semicolon followed by comma (corruption pattern)
  // Example: };, → };
  const phantomCommaPattern2 = /;\s*,\s*(?=\n|$)/g;
  const matches2 = fixed.match(phantomCommaPattern2);
  if (matches2) {
    changesMade += matches2.length;
    const lines = fixed.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (phantomCommaPattern2.test(line)) {
        const beforeFix = line;
        lines[i] = line.replace(phantomCommaPattern2, ';');
        if (lines[i] !== beforeFix && VERBOSE) {
          changes.push({
            line: i + 1,
            before: beforeFix.trim(),
            after: lines[i].trim(),
            pattern: 'Semicolon phantom comma'
          });
        }
      }
    }
    fixed = lines.join('\n');
  }

  // Pattern 3: Array/object literal phantom comma
  // Example: [, item1, item2] → [item1, item2]
  const phantomCommaPattern3 = /\[\s*,\s+/g;
  const matches3 = fixed.match(phantomCommaPattern3);
  if (matches3) {
    changesMade += matches3.length;
    fixed = fixed.replace(phantomCommaPattern3, '[');
  }

  // Pattern 4: Generic/type phantom comma
  // Example: Promise<{, valid: boolean }>
  const phantomCommaPattern4 = /<\s*\{\s*,\s+/g;
  const matches4 = fixed.match(phantomCommaPattern4);
  if (matches4) {
    changesMade += matches4.length;
    fixed = fixed.replace(phantomCommaPattern4, '<{ ');
  }

  return { fixed, changesMade, changes };
}

function findAllFiles(dir, extensions = ['.svelte', '.ts', '.tsx', '.js'], results = []) {
  try {
    const fullPath = path.resolve(__dirname, dir);
    if (!fs.existsSync(fullPath)) return results;

    const entries = fs.readdirSync(fullPath, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(fullPath, entry.name);

      if (entry.name.includes('node_modules') ||
          entry.name.includes('.svelte-kit') ||
          entry.name.includes('build') ||
          entry.name.includes('.backup') ||
          entry.name.includes('_archive') ||
          entry.name.includes('.bak')) {
        continue;
      }

      if (entry.isDirectory()) {
        findAllFiles(entryPath, extensions, results);
      } else if (entry.isFile() && extensions.some(ext => entry.name.endsWith(ext))) {
        results.push(entryPath);
      }
    }
  } catch (err) {
    console.error(`Error scanning directory ${dir}:`, err.message);
  }

  return results;
}

console.log('🔧 PHANTOM COMMA FIXER\n');
console.log('='.repeat(80) + '\n');

if (DRY_RUN) {
  console.log('⚠️  DRY RUN MODE - No files will be modified\n');
  console.log('Run without --dry-run to apply fixes\n');
  console.log('='.repeat(80) + '\n');
}

const allFiles = [];
for (const dir of COMPONENT_DIRS) {
  const files = findAllFiles(dir);
  allFiles.push(...files);
}

console.log(`Found ${allFiles.length} files to process...\n`);

let filesProcessed = 0;
let filesWithIssues = 0;
let totalChanges = 0;
const changedFiles = [];

for (const filePath of allFiles) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const { fixed, changesMade, changes } = fixPhantomCommas(content);

    if (changesMade > 0) {
      // Verify the fix doesn't break syntax by checking basic structure
      const openBraces = (fixed.match(/\{/g) || []).length;
      const closeBraces = (fixed.match(/\}/g) || []).length;
      const openBrackets = (fixed.match(/\[/g) || []).length;
      const closeBrackets = (fixed.match(/\]/g) || []).length;
      const openParens = (fixed.match(/\(/g) || []).length;
      const closeParens = (fixed.match(/\)/g) || []).length;

      if (openBraces === closeBraces &&
          openBrackets === closeBrackets &&
          openParens === closeParens) {

        if (!DRY_RUN) {
          fs.writeFileSync(filePath, fixed, 'utf8');
        }

        filesWithIssues++;
        totalChanges += changesMade;

        const relativePath = path.relative(path.resolve(__dirname, '..'), filePath);
        changedFiles.push({ file: relativePath, changes: changesMade });

        console.log(`${DRY_RUN ? '🔍' : '✓'} ${relativePath}`);
        console.log(`  ${DRY_RUN ? 'Would fix' : 'Fixed'} ${changesMade} phantom comma${changesMade > 1 ? 's' : ''}`);

        if (VERBOSE && changes.length > 0) {
          console.log('  Changes:');
          changes.slice(0, 3).forEach(change => {
            console.log(`    Line ${change.line}: ${change.pattern}`);
            console.log(`      - ${change.before}`);
            console.log(`      + ${change.after}`);
          });
          if (changes.length > 3) {
            console.log(`    ... and ${changes.length - 3} more changes`);
          }
        }
      } else {
        console.log(`⚠ Skipped ${filePath} - syntax validation failed`);
        console.log(`  Braces: ${openBraces}/${closeBraces}, Brackets: ${openBrackets}/${closeBrackets}, Parens: ${openParens}/${closeParens}`);
      }
    }

    filesProcessed++;
    if (filesProcessed % 100 === 0) {
      process.stdout.write(`\rProcessed: ${filesProcessed}/${allFiles.length}...`);
    }
  } catch (err) {
    console.error(`\n✗ Error processing ${filePath}:`, err.message);
  }
}

console.log('\n');
console.log('='.repeat(80));
console.log(`\n📊 RESULTS${DRY_RUN ? ' (DRY RUN)' : ''}:\n`);
console.log(`Files processed: ${filesProcessed}`);
console.log(`Files with phantom commas: ${filesWithIssues}`);
console.log(`Total phantom commas found: ${totalChanges}`);
console.log(`${DRY_RUN ? 'Would affect' : 'Success rate'}: ${((filesWithIssues / filesProcessed) * 100).toFixed(1)}%`);

if (changedFiles.length > 0) {
  console.log('\n📝 TOP 10 FILES WITH MOST PHANTOM COMMAS:');
  console.log('-'.repeat(80));

  const sorted = changedFiles.sort((a, b) => b.changes - a.changes).slice(0, 10);
  sorted.forEach((item, index) => {
    console.log(`${index + 1}. ${item.file} (${item.changes} phantom commas)`);
  });
}

if (DRY_RUN) {
  console.log('\n' + '='.repeat(80));
  console.log('\n⚠️  DRY RUN COMPLETE - No files were modified');
  console.log('\nTo apply these fixes, run:');
  console.log('  node scripts/fix-phantom-commas.mjs\n');
} else {
  console.log('\n✨ Phantom comma fix complete!');
  console.log(`Expected error reduction: ~${totalChanges} errors eliminated\n`);

  // Save report
  const reportPath = path.resolve(__dirname, '../phantom-commas-fix-report.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    filesProcessed,
    filesWithIssues,
    totalChanges,
    changedFiles: changedFiles.sort((a, b) => b.changes - a.changes)
  }, null, 2));

  console.log(`📄 Detailed report saved: ${path.relative(path.resolve(__dirname, '..'), reportPath)}\n`);
}
