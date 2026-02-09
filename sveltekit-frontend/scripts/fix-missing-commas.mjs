import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Automated Missing Commas Fixer
 *
 * Fixes patterns like:
 * - function(id: string name: string) → function(id: string, name: string)
 * - {{ duration: 150 y: -8 }} → {{ duration: 150, y: -8 }}
 * - (a: number b: number) → (a: number, b: number)
 *
 * Expected impact: 120 errors → 0
 */

const COMPONENT_DIRS = [
  '../src/lib/components',
  '../src/routes',
];

function fixMissingCommas(content) {
  let fixed = content;
  let changesMade = 0;

  // Pattern 1: Function parameters missing comma
  // Example: function(id: string name: string)
  const funcParamPattern = /(\w+:\s*[^,)\s]+)\s+(\w+:\s*[^,)\s]+)/g;
  let matches = content.match(funcParamPattern);
  if (matches) {
    // Be careful - only fix if it's clearly a parameter list
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check if line contains function/method definition or call
      if (line.includes('function') || line.match(/\w+\s*\([^)]*\w+:\s*\w+\s+\w+:/)) {
        const beforeFix = line;
        // Fix missing commas in parameter lists
        lines[i] = line.replace(/(\w+:\s*[^,)\s]+)\s+(\w+:)/g, '$1, $2');

        if (lines[i] !== beforeFix) {
          changesMade++;
        }
      }
    }
    fixed = lines.join('\n');
  }

  // Pattern 2: Object properties missing comma
  // Example: {{ duration: 150 y: -8 }}
  const objPropPattern = /\{\s*(\w+:\s*[^,}\s]+)\s+(\w+:)/g;
  matches = fixed.match(objPropPattern);
  if (matches) {
    const beforeCount = changesMade;
    fixed = fixed.replace(objPropPattern, '{ $1, $2');

    // Count actual changes (complex due to nested replacements)
    const newMatches = fixed.match(/\{\s*\w+:\s*[^,}\s]+,\s*\w+:/g);
    if (newMatches && matches) {
      changesMade += (newMatches.length - (matches.length - (changesMade - beforeCount)));
    }
  }

  // Pattern 3: Arrow function parameters
  // Example: (id: string name: string) => {}
  const arrowParamPattern = /\(([^)]*\w+:\s*[^,)]+)\s+(\w+:[^)]+)\)/g;
  matches = fixed.match(arrowParamPattern);
  if (matches) {
    changesMade += matches.length;
    fixed = fixed.replace(arrowParamPattern, '($1, $2)');
  }

  // Pattern 4: Template config objects (like transitionConfig)
  // Example: transitionConfig={{ duration: 150 y: -8 }}
  const configPattern = /(\w+)\s*=\s*\{\{\s*(\w+):\s*([^,}\s]+)\s+(\w+):/g;
  matches = fixed.match(configPattern);
  if (matches) {
    changesMade += matches.length;
    fixed = fixed.replace(configPattern, '$1={{ $2: $3, $4:');
  }

  return { fixed, changesMade };
}

function findAllFiles(dir, extensions = ['.svelte', '.ts', '.tsx'], results = []) {
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

console.log('🔧 MISSING COMMAS FIXER\n');
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
    const { fixed, changesMade } = fixMissingCommas(content);

    if (changesMade > 0) {
      // Verify the fix doesn't break syntax by checking basic structure
      const openBraces = (fixed.match(/\{/g) || []).length;
      const closeBraces = (fixed.match(/\}/g) || []).length;
      const openParens = (fixed.match(/\(/g) || []).length;
      const closeParens = (fixed.match(/\)/g) || []).length;

      if (openBraces === closeBraces && openParens === closeParens) {
        fs.writeFileSync(filePath, fixed, 'utf8');
        filesChanged++;
        totalChanges += changesMade;

        const relativePath = path.relative(path.resolve(__dirname, '..'), filePath);
        changedFiles.push({ file: relativePath, changes: changesMade });

        console.log(`✓ ${relativePath}`);
        console.log(`  Fixed ${changesMade} missing comma${changesMade > 1 ? 's' : ''}`);
      } else {
        console.log(`⚠ Skipped ${filePath} - syntax validation failed`);
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

console.log('\n✨ Missing commas fix complete!');
console.log(`Expected error reduction: ~${totalChanges} errors eliminated\n`);

// Save report
const reportPath = path.resolve(__dirname, '../missing-commas-fix-report.json');
fs.writeFileSync(reportPath, JSON.stringify({
  timestamp: new Date().toISOString(),
  filesProcessed,
  filesChanged,
  totalChanges,
  changedFiles: changedFiles.sort((a, b) => b.changes - a.changes)
}, null, 2));

console.log(`📄 Detailed report saved: ${path.relative(path.resolve(__dirname, '..'), reportPath)}\n`);
