import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Automated CSS Pseudo-class Spacing Fixer
 *
 * Fixes patterns like:
 * - focus: outline-none → focus:outline-none
 * - hover: bg-accent → hover:bg-accent
 * - disabled: opacity-50 → disabled:opacity-50
 *
 * Expected impact: 257 errors → 0 across 86 files
 */

const COMPONENT_DIRS = [
  '../src/lib/components',
  '../src/routes',
];

const CSS_PSEUDO_PATTERNS = [
  // Pattern: "focus: " or "hover: " etc with space after colon
  {
    pattern: /\b(focus|hover|active|disabled|placeholder|checked|invalid|valid|required|optional|read-only|read-write|first-child|last-child|first-of-type|last-of-type|nth-child|nth-of-type|only-child|only-of-type|empty|target|enabled|indeterminate|default|visited|link|root|scope|host|defined|autofill|in-range|out-of-range|user-invalid|user-valid|fullscreen|modal|picture-in-picture|popover-open|backdrop|selection|marker|file-selector-button|placeholder-shown):\s+([a-z-])/gi,
    replacement: '$1:$2'
  },
  // Pattern: data-[state]: spacing
  {
    pattern: /\bdata-\[([^\]]+)\]:\s+([a-z-])/gi,
    replacement: 'data-[$1]:$2'
  },
  // Pattern: aria-[attr]: spacing
  {
    pattern: /\baria-\[([^\]]+)\]:\s+([a-z-])/gi,
    replacement: 'aria-[$1]:$2'
  }
];

function findAllFiles(dir, extensions = ['.svelte', '.ts', '.tsx'], results = []) {
  try {
    const fullPath = path.resolve(__dirname, dir);
    if (!fs.existsSync(fullPath)) return results;

    const entries = fs.readdirSync(fullPath, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(fullPath, entry.name);

      // Skip node_modules, build dirs, backups
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

function fixCSSSpacing(content) {
  let fixed = content;
  let changesMade = 0;

  for (const { pattern, replacement } of CSS_PSEUDO_PATTERNS) {
    const matches = fixed.match(pattern);
    if (matches) {
      changesMade += matches.length;
      fixed = fixed.replace(pattern, replacement);
    }
  }

  return { fixed, changesMade };
}

console.log('🔧 CSS PSEUDO-CLASS SPACING FIXER\n');
console.log('='.repeat(80) + '\n');

const allFiles = [];
for (const dir of COMPONENT_DIRS) {
  const files = findAllFiles(dir);
  allFiles.push(...files);
}

console.log(`Found ${allFiles.length} files to process...\n`);

let filesProcessed = 0;
let filesChanged = 0;
let totalChanges = 0;
const changedFiles = [];

for (const filePath of allFiles) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const { fixed, changesMade } = fixCSSSpacing(content);

    if (changesMade > 0) {
      fs.writeFileSync(filePath, fixed, 'utf8');
      filesChanged++;
      totalChanges += changesMade;

      const relativePath = path.relative(path.resolve(__dirname, '..'), filePath);
      changedFiles.push({ file: relativePath, changes: changesMade });

      console.log(`✓ ${relativePath}`);
      console.log(`  Fixed ${changesMade} CSS spacing issue${changesMade > 1 ? 's' : ''}`);
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
console.log('\n📊 RESULTS:\n');
console.log(`Files processed: ${filesProcessed}`);
console.log(`Files modified: ${filesChanged}`);
console.log(`Total fixes applied: ${totalChanges}`);
console.log(`Success rate: ${((filesChanged / filesProcessed) * 100).toFixed(1)}%`);

if (changedFiles.length > 0) {
  console.log('\n📝 TOP 10 FILES WITH MOST FIXES:');
  console.log('-'.repeat(80));

  const sorted = changedFiles.sort((a, b) => b.changes - a.changes).slice(0, 10);
  sorted.forEach((item, index) => {
    console.log(`${index + 1}. ${item.file} (${item.changes} fixes)`);
  });
}

console.log('\n✨ CSS spacing fix complete!');
console.log(`Expected error reduction: ~${totalChanges} errors eliminated\n`);

// Save report
const reportPath = path.resolve(__dirname, '../css-spacing-fix-report.json');
fs.writeFileSync(reportPath, JSON.stringify({
  timestamp: new Date().toISOString(),
  filesProcessed,
  filesChanged,
  totalChanges,
  changedFiles: changedFiles.sort((a, b) => b.changes - a.changes)
}, null, 2));

console.log(`📄 Detailed report saved: ${path.relative(path.resolve(__dirname, '..'), reportPath)}\n`);
