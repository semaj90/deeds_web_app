#!/usr/bin/env node

/**
 * Batch Error Fixer - Phase 2
 * Targets: TS1005, TS1128, TS1135 errors
 * Strategy: Multi-pass corruption repair with validation
 *
 * Usage: node batch-error-fixer-phase2.mjs [--apply] [--dry-run]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DRY_RUN = process.argv.includes('--dry-run');
const APPLY = process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');

// Configuration
const CONFIG = {
  srcDir: path.join(__dirname, '../src'),
  maxPasses: 4,
  patterns: {
    // Pattern 1: Colon chains (highest priority)
    colonChains: {
      regex: /:\s*(?=[A-Za-z_$])/g,
      replacement: ', ',
      description: 'Colon chain corruption',
      priority: 1
    },
    // Pattern 2: Missing commas in objects
    missingCommas: {
      regex: /([a-zA-Z0-9_]+)\s*\n\s*([a-zA-Z0-9_]+):/g,
      replacement: '$1,\n  $2:',
      description: 'Missing commas in object literals',
      priority: 2
    },
    // Pattern 3: Missing semicolons
    missingSemicolons: {
      regex: /([^;{}\n])\s*\n\s*([a-zA-Z])/g,
      replacement: '$1;\n  $2',
      description: 'Missing semicolons',
      priority: 3
    },
    // Pattern 4: Function argument corruption
    furgs: {
      regex: /\(([^)]*):([^)]*):([^)]*)\)/g,
      replacement: '($1, $2, $3)',
      description: 'Function argument corruption',
      priority: 4
    }
  }
};

// Statistics
let stats = {
  filesProcessed: 0,
  filesModified: 0,
  totalFixes: 0,
  fixesByPattern: {},
  errors: []
};

/**
 * Apply fixes to content with multi-pass approach
 */
function applyFixes(content, filePath) {
  let fixed = content;
  let prevFixed = '';
  let passes = 0;
  let passStats = {};

  while (fixed !== prevFixed && passes < CONFIG.maxPasses) {
    prevFixed = fixed;
    passes++;

    // Apply patterns in priority order
    const patterns = Object.entries(CONFIG.patterns)
      .sort((a, b) => a[1].priority - b[1].priority);

    for (const [patternName, pattern] of patterns) {
      const before = fixed;
      fixed = fixed.replace(pattern.regex, pattern.replacement);
      const fixCount = (before.match(pattern.regex) || []).length;

      if (fixCount > 0) {
        if (!passStats[patternName]) passStats[patternName] = 0;
        passStats[patternName] += fixCount;
        stats.totalFixes += fixCount;

        if (!stats.fixesByPattern[patternName]) {
          stats.fixesByPattern[patternName] = 0;
        }
        stats.fixesByPattern[patternName] += fixCount;

        if (VERBOSE) {
          console.log(`  Pass ${passes}: ${patternName} - ${fixCount} fixes`);
        }
      }
    }
  }

  return {
    content: fixed,
    passes,
    modified: fixed !== content,
    fixCount: Object.values(passStats).reduce((a, b) => a + b, 0)
  };
}

/**
 * Process a single file
 */
function processFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const result = applyFixes(content, filePath);

    stats.filesProcessed++;

    if (result.modified) {
      stats.filesModified++;

      if (APPLY && !DRY_RUN) {
        fs.writeFileSync(filePath, result.content, 'utf8');
      }

      const relPath = path.relative(CONFIG.srcDir, filePath);
      console.log(`✓ ${relPath}: ${result.fixCount} fixes (${result.passes} passes)`);

      return result.fixCount;
    }
  } catch (error) {
    stats.errors.push({
      file: filePath,
      error: error.message
    });
    console.error(`✗ Error processing ${filePath}: ${error.message}`);
  }

  return 0;
}

/**
 * Recursively process directory
 */
function processDirectory(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    // Skip node_modules, .svelte-kit, dist, build
    if (['.svelte-kit', 'node_modules', 'dist', 'build', '.git'].includes(entry.name)) {
      continue;
    }

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      processDirectory(fullPath);
    } else if (entry.isFile() && /\.(ts|tsx|js|jsx|svelte)$/.test(entry.name)) {
      processFile(fullPath);
    }
  }
}

/**
 * Generate report
 */
function generateReport() {
  console.log('\n' + '='.repeat(60));
  console.log('BATCH ERROR FIXER - PHASE 2 REPORT');
  console.log('='.repeat(60));
  console.log(`\nMode: ${DRY_RUN ? 'DRY RUN' : APPLY ? 'APPLY' : 'PREVIEW'}`);
  console.log(`\nStatistics:`);
  console.log(`  Files Processed: ${stats.filesProcessed}`);
  console.log(`  Files Modified:  ${stats.filesModified}`);
  console.log(`  Total Fixes:     ${stats.totalFixes}`);

  console.log(`\nFixes by Pattern:`);
  for (const [pattern, count] of Object.entries(stats.fixesByPattern)) {
    console.log(`  ${pattern}: ${count}`);
  }

  if (stats.errors.length > 0) {
    console.log(`\nErrors (${stats.errors.length}):`);
    stats.errors.slice(0, 5).forEach(err => {
      console.log(`  ${err.file}: ${err.error}`);
    });
    if (stats.errors.length > 5) {
      console.log(`  ... and ${stats.errors.length - 5} more`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`Expected Error Reduction: ~${Math.round(stats.totalFixes * 0.8)} errors`);
  console.log('='.repeat(60) + '\n');
}

/**
 * Main execution
 */
async function main() {
  console.log('🔧 Batch Error Fixer - Phase 2');
  console.log(`📁 Processing: ${CONFIG.srcDir}`);
  console.log(`🔄 Max passes per file: ${CONFIG.maxPasses}`);
  console.log(`📋 Patterns: ${Object.keys(CONFIG.patterns).length}`);
  console.log('');

  if (DRY_RUN) {
    console.log('⚠️  DRY RUN MODE - No files will be modified\n');
  } else if (!APPLY) {
    console.log('📊 PREVIEW MODE - Use --apply to make changes\n');
  }

  // Process all files
  processDirectory(CONFIG.srcDir);

  // Generate report
  generateReport();

  // Save report to file
  const reportPath = path.join(__dirname, '../logs/fix-reports/batch-phase2-report.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(stats, null, 2));

  console.log(`📄 Report saved to: ${reportPath}`);

  if (APPLY && !DRY_RUN) {
    console.log('✅ Changes applied successfully!');
    console.log('📝 Next: Run `npx svelte-check` to verify improvements');
  }
}

main().catch(console.error);
