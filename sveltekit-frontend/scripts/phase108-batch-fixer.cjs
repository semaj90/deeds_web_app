/**
 * Phase 108 Batch Fixer Script - DRY RUN MODE
 *
 * Identifies common syntax patterns that cause svelte-check errors:
 * 1. CSS class comma errors (md: grid-cols-2, → md:grid-cols-2)
 * 2. Import colon errors ({ A: B: C } → { A, B, C })
 * 3. Prop type comma errors (prop?, Type → prop?: Type)
 * 4. Object literal semicolons in Svelte (key: value; → key: value,)
 *
 * Run: node scripts/phase108-batch-fixer.cjs --dry-run
 * Apply: node scripts/phase108-batch-fixer.cjs --apply
 */

const fs = require('fs');
const path = require('path');

const isDryRun = process.argv.includes('--dry-run') || !process.argv.includes('--apply');
const verbose = process.argv.includes('--verbose');

console.log(`\n🔧 Phase 108 Batch Fixer - ${isDryRun ? 'DRY RUN' : 'APPLY MODE'}\n`);

// Patterns to fix
const patterns = [
  {
    name: 'CSS class comma (md: grid-cols)',
    regex: /md:\s+grid-cols-/g,
    replacement: 'md:grid-cols-',
    fileTypes: ['.svelte']
  },
  {
    name: 'CSS class comma (lg, grid-cols)',
    regex: /lg,\s+grid-cols-/g,
    replacement: 'lg:grid-cols-',
    fileTypes: ['.svelte']
  },
  {
    name: 'CSS class comma (focus, ring)',
    regex: /focus,\s+ring-/g,
    replacement: 'focus:ring-',
    fileTypes: ['.svelte']
  },
  {
    name: 'Prop type comma (prop?, Type)',
    regex: /(\w+)\?,\s*(\w+);/g,
    replacement: '$1?: $2;',
    fileTypes: ['.svelte', '.ts']
  },
  {
    name: 'Import colon in destructure',
    regex: /import\s+\{\s*(\w+):\s+(\w+):\s+(\w+)\s*\}/g,
    replacement: 'import { $1, $2, $3 }',
    fileTypes: ['.svelte', '.ts']
  },
  {
    name: '$state with space before generic',
    regex: /\$state\s+</g,
    replacement: '$state<',
    fileTypes: ['.svelte', '.ts']
  },
  {
    name: 'Unused parameter should be used (event -> event)',
    regex: /const\s+handleKeyboard\s*=\s*\(_event:\s*KeyboardEvent\)\s*=>/g,
    replacement: 'const handleKeyboard = (event: KeyboardEvent) =>',
    fileTypes: ['.svelte']
  }
];

// Get all files recursively
function getFiles(dir, extensions) {
  let results = [];
  try {
    const list = fs.readdirSync(dir);
    for (const file of list) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (stat && stat.isDirectory()) {
        // Skip node_modules, .svelte-kit, etc.
        if (!['node_modules', '.svelte-kit', 'build', 'dist', '.git'].includes(file)) {
          results = results.concat(getFiles(filePath, extensions));
        }
      } else {
        const ext = path.extname(file);
        if (extensions.includes(ext)) {
          results.push(filePath);
        }
      }
    }
  } catch (err) {
    // Skip directories we can't read
  }
  return results;
}

// Main processing
const srcDir = path.join(__dirname, '..', 'src');
const allExtensions = ['.svelte', '.ts'];
const allFiles = getFiles(srcDir, allExtensions);

console.log(`📁 Found ${allFiles.length} files to check\n`);

let totalMatches = 0;
let totalFilesAffected = 0;
const affectedFiles = {};

for (const pattern of patterns) {
  const matchingFiles = allFiles.filter(f => pattern.fileTypes.includes(path.extname(f)));

  for (const filePath of matchingFiles) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const matches = content.match(pattern.regex);

      if (matches && matches.length > 0) {
        const relativePath = path.relative(path.join(__dirname, '..'), filePath);

        if (!affectedFiles[relativePath]) {
          affectedFiles[relativePath] = [];
          totalFilesAffected++;
        }

        affectedFiles[relativePath].push({
          pattern: pattern.name,
          count: matches.length
        });

        totalMatches += matches.length;

        if (verbose) {
          console.log(`  📄 ${relativePath}: ${matches.length}x "${pattern.name}"`);
        }

        // Apply fix if not dry run
        if (!isDryRun) {
          const fixed = content.replace(pattern.regex, pattern.replacement);
          fs.writeFileSync(filePath, fixed, 'utf8');
        }
      }
    } catch (err) {
      // Skip files we can't read
    }
  }
}

// Summary
console.log('\n📊 SUMMARY');
console.log('─'.repeat(50));
console.log(`Total matches found: ${totalMatches}`);
console.log(`Files affected: ${totalFilesAffected}`);
console.log('');

// Group by pattern
const patternCounts = {};
for (const [file, issues] of Object.entries(affectedFiles)) {
  for (const issue of issues) {
    if (!patternCounts[issue.pattern]) {
      patternCounts[issue.pattern] = { files: 0, matches: 0 };
    }
    patternCounts[issue.pattern].files++;
    patternCounts[issue.pattern].matches += issue.count;
  }
}

console.log('📈 BY PATTERN:');
for (const [pattern, counts] of Object.entries(patternCounts)) {
  console.log(`  • ${pattern}: ${counts.matches} matches in ${counts.files} files`);
}

console.log('');

// Top 20 files
const sortedFiles = Object.entries(affectedFiles)
  .map(([file, issues]) => ({
    file,
    totalMatches: issues.reduce((sum, i) => sum + i.count, 0),
    issues
  }))
  .sort((a, b) => b.totalMatches - a.totalMatches)
  .slice(0, 20);

if (sortedFiles.length > 0) {
  console.log('📁 TOP 20 FILES:');
  for (const { file, totalMatches, issues } of sortedFiles) {
    console.log(`  ${totalMatches}\t${file}`);
  }
}

console.log('');

if (isDryRun) {
  console.log('ℹ️  This was a DRY RUN. No files were modified.');
  console.log('   To apply fixes, run: node scripts/phase108-batch-fixer.cjs --apply');
} else {
  console.log('✅ Fixes applied!');
  console.log('   Run `npm run check` to verify improvements.');
}

console.log('');
