import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Full Error Count - Comprehensive validation across all components
 */

const COMPONENT_DIRS = [
  'src/lib/components/ui',
  'src/lib/components/ai',
  'src/lib/components/evidence',
  'src/lib/components/cases',
  'src/routes/(app)',
  'src/routes/(auth)',
  'src/routes/api',
];

const ERROR_PATTERNS = {
  // Syntax Errors
  phantomComma: /\{,\s/g,
  missingComma: /:\s*\w+\s+\w+:/g,
  cssSpacing: /(focus|hover|active|disabled|placeholder):\s+[a-z-]/gi,
  templateSpacing: /\$\{\s{2,}\w+\s{2,}\}/g,
  classSpacing: /class=["'].*\{\s+\w+\s+\}/g,

  // bits-ui v1 patterns
  barrelImport: /import.*from\s+['"]bits-ui['"]\s*;/,
  namedBitsImport: /import\s+\{\s*\w+\s*\}\s+from\s+['"]bits-ui['"]/,

  // Svelte 4 patterns
  svelte4Event: /on:(click|change|input|submit|keydown|keyup)=/g,
  exportLet: /export\s+let\s+\w+/g,
  dollarColon: /\$:\s+\w+\s*=/g,

  // Common TypeScript errors
  implicitAny: /:\s*any\s*[,;)]/g,
  unusedImport: /import\s+\{[^}]+\}\s+from\s+['"][^'"]+['"]\s*;\s*\/\/\s*unused/g,
};

function findSvelteAndTSFiles(dir, maxDepth = 5, currentDepth = 0) {
  if (currentDepth > maxDepth) return [];

  const results = [];

  try {
    if (!fs.existsSync(dir)) return results;

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      // Skip node_modules, .svelte-kit, build dirs, backups
      if (entry.name.includes('node_modules') ||
          entry.name.includes('.svelte-kit') ||
          entry.name.includes('build') ||
          entry.name.includes('.backup') ||
          entry.name.includes('_archive') ||
          entry.name.includes('.bak')) {
        continue;
      }

      if (entry.isDirectory()) {
        results.push(...findSvelteAndTSFiles(fullPath, maxDepth, currentDepth + 1));
      } else if (entry.isFile() && (entry.name.endsWith('.svelte') || entry.name.endsWith('.ts'))) {
        results.push(fullPath);
      }
    }
  } catch (err) {
    // Skip inaccessible directories
  }

  return results;
}

function analyzeFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const errors = {};
    let errorCount = 0;

    // Check each pattern
    for (const [name, pattern] of Object.entries(ERROR_PATTERNS)) {
      const matches = content.match(pattern);
      if (matches) {
        errors[name] = matches.length;
        errorCount += matches.length;
      }
    }

    // Additional checks
    const lines = content.split('\n');

    // Check for malformed functions
    let malformedFunctions = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Function with missing comma between parameters
      if (/function\s+\w+\s*\([^)]*\w+:\s*\w+\s+\w+:\s*\w+[^),]/.test(line)) {
        malformedFunctions++;
      }
    }
    if (malformedFunctions > 0) {
      errors.malformedFunctions = malformedFunctions;
      errorCount += malformedFunctions;
    }

    // Check for corrupted arrow functions
    let corruptedArrows = 0;
    for (const line of lines) {
      if (/=>\s*\{[^}]*\}\s*[^;,\n]/.test(line) && !/=>\s*\{[^}]*\}\s*[;,\n]/.test(line)) {
        corruptedArrows++;
      }
    }
    if (corruptedArrows > 0) {
      errors.corruptedArrows = corruptedArrows;
      errorCount += corruptedArrows;
    }

    return { errors, errorCount, hasErrors: errorCount > 0 };
  } catch (err) {
    return { errors: { readError: 1 }, errorCount: 1, hasErrors: true, error: err.message };
  }
}

console.log('🔍 FULL ERROR COUNT - Comprehensive Component Validation\n');
console.log('='.repeat(80) + '\n');

const allFiles = [];
for (const dir of COMPONENT_DIRS) {
  const dirPath = path.join(__dirname, dir);
  const files = findSvelteAndTSFiles(dirPath);
  allFiles.push(...files.map(f => ({ file: f, category: dir })));
}

console.log(`Found ${allFiles.length} files to analyze...\n`);

const results = {
  clean: [],
  withErrors: [],
  totalErrors: 0,
  errorsByCategory: {},
  errorsByPattern: {},
};

let processed = 0;
for (const { file, category } of allFiles) {
  const analysis = analyzeFile(file);
  processed++;

  if (processed % 100 === 0) {
    process.stdout.write(`\rAnalyzed: ${processed}/${allFiles.length} files...`);
  }

  if (analysis.hasErrors) {
    const relativePath = path.relative(__dirname, file);
    results.withErrors.push({ file: relativePath, ...analysis });
    results.totalErrors += analysis.errorCount;

    // Track by category
    if (!results.errorsByCategory[category]) {
      results.errorsByCategory[category] = { files: 0, errors: 0 };
    }
    results.errorsByCategory[category].files++;
    results.errorsByCategory[category].errors += analysis.errorCount;

    // Track by pattern
    for (const [pattern, count] of Object.entries(analysis.errors)) {
      if (!results.errorsByPattern[pattern]) {
        results.errorsByPattern[pattern] = 0;
      }
      results.errorsByPattern[pattern] += count;
    }
  } else {
    results.clean.push(path.relative(__dirname, file));
  }
}

console.log(`\n\n${'='.repeat(80)}\n`);
console.log('📊 FULL ERROR COUNT RESULTS\n');

// Summary
console.log('SUMMARY:');
console.log('-'.repeat(80));
console.log(`Total files analyzed: ${allFiles.length}`);
console.log(`Files with errors: ${results.withErrors.length} (${((results.withErrors.length / allFiles.length) * 100).toFixed(1)}%)`);
console.log(`Clean files: ${results.clean.length} (${((results.clean.length / allFiles.length) * 100).toFixed(1)}%)`);
console.log(`Total errors found: ${results.totalErrors}`);
console.log();

// Errors by category
console.log('\nERRORS BY CATEGORY:');
console.log('-'.repeat(80));
const sortedCategories = Object.entries(results.errorsByCategory)
  .sort((a, b) => b[1].errors - a[1].errors);

for (const [category, data] of sortedCategories) {
  console.log(`${category}`);
  console.log(`  Files with errors: ${data.files}`);
  console.log(`  Total errors: ${data.errors}`);
  console.log(`  Avg errors/file: ${(data.errors / data.files).toFixed(1)}`);
  console.log();
}

// Errors by pattern
console.log('\nERRORS BY PATTERN (Top 10):');
console.log('-'.repeat(80));
const sortedPatterns = Object.entries(results.errorsByPattern)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10);

const patternNames = {
  phantomComma: 'Phantom comma in objects',
  missingComma: 'Missing comma in parameters',
  cssSpacing: 'CSS pseudo-class spacing',
  templateSpacing: 'Template literal spacing',
  classSpacing: 'Class attribute spacing',
  barrelImport: 'bits-ui barrel import',
  namedBitsImport: 'bits-ui named import',
  svelte4Event: 'Svelte 4 event syntax',
  exportLet: 'Svelte 4 export let',
  dollarColon: 'Svelte 4 reactive statement',
  malformedFunctions: 'Malformed function parameters',
  corruptedArrows: 'Corrupted arrow functions',
  implicitAny: 'Implicit any types',
  unusedImport: 'Unused imports',
};

for (const [pattern, count] of sortedPatterns) {
  const name = patternNames[pattern] || pattern;
  console.log(`${name}: ${count}`);
}
console.log();

// Top 20 files with most errors
console.log('\nTOP 20 FILES WITH MOST ERRORS:');
console.log('-'.repeat(80));
const sortedFiles = results.withErrors
  .sort((a, b) => b.errorCount - a.errorCount)
  .slice(0, 20);

for (let i = 0; i < sortedFiles.length; i++) {
  const { file, errorCount, errors } = sortedFiles[i];
  console.log(`${i + 1}. ${file}`);
  console.log(`   Total errors: ${errorCount}`);
  const topErrors = Object.entries(errors)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([pattern, count]) => `${patternNames[pattern] || pattern} (${count})`)
    .join(', ');
  console.log(`   Top issues: ${topErrors}`);
  console.log();
}

// Generate fix priority list
console.log('\n🎯 FIX PRIORITY RECOMMENDATIONS:');
console.log('-'.repeat(80));

const priorities = [];

// Priority 1: High-impact patterns with many occurrences
if (results.errorsByPattern.cssSpacing > 50) {
  priorities.push({
    priority: 1,
    name: 'CSS pseudo-class spacing fix',
    impact: `Will fix ${results.errorsByPattern.cssSpacing} errors across ${Math.ceil(results.errorsByPattern.cssSpacing / 3)} files`,
    command: 'Run automated CSS spacing fixer'
  });
}

if (results.errorsByPattern.missingComma > 20) {
  priorities.push({
    priority: 1,
    name: 'Missing comma in parameters',
    impact: `Will fix ${results.errorsByPattern.missingComma} errors`,
    command: 'Run parameter comma fixer'
  });
}

// Priority 2: Svelte 4 → 5 migration
const svelte4Errors = (results.errorsByPattern.svelte4Event || 0) +
                     (results.errorsByPattern.exportLet || 0) +
                     (results.errorsByPattern.dollarColon || 0);
if (svelte4Errors > 0) {
  priorities.push({
    priority: 2,
    name: 'Svelte 4 → 5 migration',
    impact: `Will fix ${svelte4Errors} Svelte 4 patterns`,
    command: 'Run Svelte 5 migration script'
  });
}

// Priority 3: bits-ui v2 migration
const bitsUIErrors = (results.errorsByPattern.barrelImport || 0) +
                     (results.errorsByPattern.namedBitsImport || 0);
if (bitsUIErrors > 0) {
  priorities.push({
    priority: 3,
    name: 'bits-ui v2 migration',
    impact: `Will fix ${bitsUIErrors} import patterns`,
    command: 'Apply bits-ui v2 namespace imports'
  });
}

priorities.sort((a, b) => a.priority - b.priority);

for (const { priority, name, impact, command } of priorities) {
  console.log(`\nPriority ${priority}: ${name}`);
  console.log(`  Impact: ${impact}`);
  console.log(`  Action: ${command}`);
}

console.log('\n' + '='.repeat(80));
console.log(`\n✨ Analysis complete! Found ${results.totalErrors} errors across ${results.withErrors.length} files.`);
console.log(`   Clean files: ${results.clean.length}/${allFiles.length} (${((results.clean.length / allFiles.length) * 100).toFixed(1)}%)\n`);

// Save detailed results
const outputPath = path.join(__dirname, 'error-count-results.json');
fs.writeFileSync(outputPath, JSON.stringify({
  summary: {
    totalFiles: allFiles.length,
    filesWithErrors: results.withErrors.length,
    cleanFiles: results.clean.length,
    totalErrors: results.totalErrors,
  },
  errorsByCategory: results.errorsByCategory,
  errorsByPattern: results.errorsByPattern,
  topFiles: sortedFiles.slice(0, 50),
  timestamp: new Date().toISOString(),
}, null, 2));

console.log(`📝 Detailed results saved to: ${path.relative(__dirname, outputPath)}\n`);
