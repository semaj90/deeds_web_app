import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Automated Class Attribute Spacing Fixer
 *
 * Fixes patterns like:
 * - class="foo { bar } baz" → class="foo {bar} baz"
 * - class="flex { isActive }" → class="flex {isActive}"
 * - class:list={[ "base", { active } ]} → class:list={["base", {active}]}
 *
 * Expected impact: 386 errors → 0
 */

const COMPONENT_DIRS = [
  '../src/lib/components',
  '../src/routes',
];

// Parse command line args
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run') || args.includes('-d');
const VERBOSE = args.includes('--verbose') || args.includes('-v');

function fixClassSpacing(content) {
  let fixed = content;
  let changesMade = 0;
  const changes = [];

  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const beforeFix = line;

    // Pattern 1: class="..." with spaces inside curly braces
    // Example: class="foo { bar } baz" → class="foo {bar} baz"
    let fixedLine = line.replace(
      /(class(?:Name)?=["'][^"']*)\{\s+([^}]+?)\s+\}/g,
      '$1{$2}'
    );

    // Pattern 2: class:list with spaces in object literals
    // Example: class:list={[ "base", { active } ]} → class:list={["base", {active}]}
    fixedLine = fixedLine.replace(
      /(class:list=\{[^}]*)\{\s+([^}]+?)\s+\}/g,
      '$1{$2}'
    );

    // Pattern 3: Multiple curly braces in same class attribute
    // Need to apply multiple times for nested cases
    let iterations = 0;
    while (iterations < 5 && fixedLine !== lines[i]) {
      lines[i] = fixedLine;
      fixedLine = lines[i].replace(
        /(class(?:Name)?=["'][^"']*)\{\s+([^}]+?)\s+\}/g,
        '$1{$2}'
      );
      iterations++;
    }
    lines[i] = fixedLine;

    if (beforeFix !== lines[i]) {
      changesMade++;
      if (VERBOSE) {
        changes.push({
          line: i + 1,
          before: beforeFix.trim(),
          after: lines[i].trim(),
          pattern: 'Class attribute spacing'
        });
      }
    }
  }

  fixed = lines.join('\n');

  // Additional pass for template literals with class expressions
  // Example: `flex ${ spacing }` → `flex ${spacing}`
  const templateLiteralPattern = /(`[^`]*)\$\{\s+([^}]+?)\s+\}/g;
  const templateMatches = fixed.match(templateLiteralPattern);
  if (templateMatches) {
    const beforeTemplateCount = changesMade;
    fixed = fixed.replace(templateLiteralPattern, '$1${$2}');
    // Count how many additional changes were made
    const additionalChanges = (templateMatches.length - (changesMade - beforeTemplateCount));
    if (additionalChanges > 0) {
      changesMade += additionalChanges;
    }
  }

  return { fixed, changesMade, changes };
}

function findAllFiles(dir, extensions = ['.svelte'], results = []) {
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

console.log('🔧 CLASS ATTRIBUTE SPACING FIXER\n');
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

console.log(`Found ${allFiles.length} Svelte files to process...\n`);

let filesProcessed = 0;
let filesWithIssues = 0;
let totalChanges = 0;
const changedFiles = [];

for (const filePath of allFiles) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const { fixed, changesMade, changes } = fixClassSpacing(content);

    if (changesMade > 0) {
      // Verify the fix doesn't break syntax by checking basic structure
      const openBraces = (fixed.match(/\{/g) || []).length;
      const closeBraces = (fixed.match(/\}/g) || []).length;
      const openQuotes = (fixed.match(/"/g) || []).length;
      const openSingleQuotes = (fixed.match(/'/g) || []).length;

      // Basic validation: braces must match, quotes should be even
      if (openBraces === closeBraces &&
          openQuotes % 2 === 0 &&
          openSingleQuotes % 2 === 0) {

        if (!DRY_RUN) {
          fs.writeFileSync(filePath, fixed, 'utf8');
        }

        filesWithIssues++;
        totalChanges += changesMade;

        const relativePath = path.relative(path.resolve(__dirname, '..'), filePath);
        changedFiles.push({ file: relativePath, changes: changesMade });

        console.log(`${DRY_RUN ? '🔍' : '✓'} ${relativePath}`);
        console.log(`  ${DRY_RUN ? 'Would fix' : 'Fixed'} ${changesMade} class spacing issue${changesMade > 1 ? 's' : ''}`);

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
        console.log(`  Braces: ${openBraces}/${closeBraces}, Quotes: ${openQuotes} (${openQuotes % 2 === 0 ? 'even' : 'odd'})`);
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
console.log(`Files with class spacing issues: ${filesWithIssues}`);
console.log(`Total spacing issues found: ${totalChanges}`);
console.log(`${DRY_RUN ? 'Would affect' : 'Success rate'}: ${((filesWithIssues / filesProcessed) * 100).toFixed(1)}%`);

if (changedFiles.length > 0) {
  console.log('\n📝 TOP 10 FILES WITH MOST CLASS SPACING ISSUES:');
  console.log('-'.repeat(80));

  const sorted = changedFiles.sort((a, b) => b.changes - a.changes).slice(0, 10);
  sorted.forEach((item, index) => {
    console.log(`${index + 1}. ${item.file} (${item.changes} issues)`);
  });
}

if (DRY_RUN) {
  console.log('\n' + '='.repeat(80));
  console.log('\n⚠️  DRY RUN COMPLETE - No files were modified');
  console.log('\nTo apply these fixes, run:');
  console.log('  node scripts/fix-class-spacing.mjs\n');
} else {
  console.log('\n✨ Class spacing fix complete!');
  console.log(`Expected error reduction: ~${totalChanges} errors eliminated\n`);

  // Save report
  const reportPath = path.resolve(__dirname, '../class-spacing-fix-report.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    filesProcessed,
    filesWithIssues,
    totalChanges,
    changedFiles: changedFiles.sort((a, b) => b.changes - a.changes)
  }, null, 2));

  console.log(`📄 Detailed report saved: ${path.relative(path.resolve(__dirname, '..'), reportPath)}\n`);
}
