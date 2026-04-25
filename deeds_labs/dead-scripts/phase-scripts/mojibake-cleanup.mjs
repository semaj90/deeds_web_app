#!/usr/bin/env node
/**
 * Mojibake Cleanup - Deterministic Pattern Fix
 *
 * Targets UTF-8 encoding issues, invalid characters, and common mojibake patterns.
 * Safe, fast, deterministic - no AI/LLM needed.
 *
 * Usage:
 *   node scripts/mojibake-cleanup.mjs --scan      # Analyze only
 *   node scripts/mojibake-cleanup.mjs --apply     # Fix files
 *   node scripts/mojibake-cleanup.mjs --verify    # Verify fixes
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FLAGS = {
  SCAN: process.argv.includes('--scan'),
  APPLY: process.argv.includes('--apply'),
  VERIFY: process.argv.includes('--verify'),
  VERBOSE: process.argv.includes('--verbose')
};

// Mojibake patterns to fix
const MOJIBAKE_PATTERNS = [
  // Common UTF-8 encoding issues
  { pattern: /â€"/g, replacement: '—', name: 'em-dash' },
  { pattern: /â€"/g, replacement: '–', name: 'en-dash' },
  { pattern: /â€œ/g, replacement: '"', name: 'left-quote' },
  { pattern: /â€�/g, replacement: '"', name: 'right-quote' },
  { pattern: /â€™/g, replacement: "'", name: 'apostrophe' },
  { pattern: /â€¢/g, replacement: '•', name: 'bullet' },
  { pattern: /Â /g, replacement: ' ', name: 'nbsp' },
  { pattern: /Ã©/g, replacement: 'é', name: 'e-acute' },
  { pattern: /Ã¨/g, replacement: 'è', name: 'e-grave' },
  { pattern: /Ã /g, replacement: 'à', name: 'a-grave' },

  // Invalid control characters (preserve newlines/tabs)
  { pattern: /[\x00-\x08\x0B-\x0C\x0E-\x1F]/g, replacement: '', name: 'control-chars' },

  // Zero-width characters (except ZWSP in specific contexts)
  { pattern: /[\u200B-\u200D\uFEFF]/g, replacement: '', name: 'zero-width' },

  // Invalid Unicode sequences
  { pattern: /\uFFFD/g, replacement: '', name: 'replacement-char' },

  // Duplicate spaces
  { pattern: /  +/g, replacement: ' ', name: 'duplicate-spaces' },

  // Trailing whitespace (preserve intentional indentation)
  { pattern: / +$/gm, replacement: '', name: 'trailing-whitespace' }
];

// File patterns to process
const INCLUDE_PATTERNS = [
  '.ts', '.tsx', '.js', '.jsx', '.svelte', '.json',
  '.md', '.html', '.css', '.scss'
];

const EXCLUDE_PATTERNS = [
  'node_modules', '.git', 'dist', 'build', '.svelte-kit',
  'reports', 'backups', 'coverage', '.next'
];

/**
 * Recursively find files to process
 */
function findFiles(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    // Skip excluded directories
    if (entry.isDirectory()) {
      if (EXCLUDE_PATTERNS.some(p => entry.name.includes(p))) {
        continue;
      }
      findFiles(fullPath, files);
    } else {
      // Include matching file extensions
      const ext = path.extname(entry.name);
      if (INCLUDE_PATTERNS.includes(ext)) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

/**
 * Scan file for mojibake patterns
 */
function scanFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const issues = [];

    for (const { pattern, name } of MOJIBAKE_PATTERNS) {
      const matches = content.match(pattern);
      if (matches) {
        issues.push({
          pattern: name,
          count: matches.length,
          examples: matches.slice(0, 3)
        });
      }
    }

    return { filePath, issues, hasIssues: issues.length > 0 };
  } catch (error) {
    if (FLAGS.VERBOSE) {
      console.warn(`⚠️  Failed to read ${filePath}: ${error.message}`);
    }
    return { filePath, issues: [], hasIssues: false, error: error.message };
  }
}

/**
 * Fix mojibake in file
 */
function fixFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf-8');
    let modified = false;
    const applied = [];

    for (const { pattern, replacement, name } of MOJIBAKE_PATTERNS) {
      const before = content;
      content = content.replace(pattern, replacement);

      if (content !== before) {
        modified = true;
        const count = (before.match(pattern) || []).length;
        applied.push({ pattern: name, count });
      }
    }

    if (modified) {
      // Create backup
      const backupPath = `${filePath}.mojibake-backup`;
      fs.copyFileSync(filePath, backupPath);

      // Write fixed content
      fs.writeFileSync(filePath, content, 'utf-8');

      return { filePath, applied, success: true, backup: backupPath };
    }

    return { filePath, applied: [], success: true, unchanged: true };
  } catch (error) {
    return { filePath, success: false, error: error.message };
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  Phase 72: Mojibake Cleanup - Deterministic Pattern Fix      ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  if (!FLAGS.SCAN && !FLAGS.APPLY && !FLAGS.VERIFY) {
    console.error('❌ Error: Must specify --scan, --apply, or --verify');
    console.log('\nUsage:');
    console.log('  node scripts/mojibake-cleanup.mjs --scan      # Analyze only');
    console.log('  node scripts/mojibake-cleanup.mjs --apply     # Fix files');
    console.log('  node scripts/mojibake-cleanup.mjs --verify    # Verify fixes');
    process.exit(1);
  }

  const srcDir = path.resolve(__dirname, '../src');
  console.log(`📂 Scanning directory: ${srcDir}\n`);

  const files = findFiles(srcDir);
  console.log(`✅ Found ${files.length} files to process\n`);

  if (FLAGS.SCAN) {
    console.log('🔍 Scanning for mojibake patterns...\n');

    const results = [];
    let totalIssues = 0;

    for (const file of files) {
      const result = scanFile(file);
      if (result.hasIssues) {
        results.push(result);
        totalIssues += result.issues.reduce((sum, i) => sum + i.count, 0);
      }
    }

    console.log('══════════════════════════════════════════════════════════════\n');
    console.log(`📊 Scan Results: ${results.length} files with issues, ${totalIssues} total patterns found\n`);

    if (results.length > 0) {
      console.log('Top 20 files by issue count:\n');

      results
        .sort((a, b) => {
          const aCount = a.issues.reduce((sum, i) => sum + i.count, 0);
          const bCount = b.issues.reduce((sum, i) => sum + i.count, 0);
          return bCount - aCount;
        })
        .slice(0, 20)
        .forEach(({ filePath, issues }) => {
          const count = issues.reduce((sum, i) => sum + i.count, 0);
          const rel = path.relative(srcDir, filePath);
          console.log(`  ${count.toString().padStart(4)} issues  ${rel}`);

          if (FLAGS.VERBOSE) {
            issues.forEach(({ pattern, count }) => {
              console.log(`         - ${pattern}: ${count}`);
            });
          }
        });

      console.log('\n💡 Run with --apply to fix these issues');
    } else {
      console.log('✅ No mojibake patterns found!');
    }
  }

  if (FLAGS.APPLY) {
    console.log('🔧 Applying mojibake fixes...\n');

    let fixed = 0;
    let unchanged = 0;
    let failed = 0;
    const fixedFiles = [];

    for (const file of files) {
      const result = fixFile(file);

      if (result.success) {
        if (result.unchanged) {
          unchanged++;
        } else {
          fixed++;
          fixedFiles.push(result);

          const rel = path.relative(srcDir, file);
          const totalFixed = result.applied.reduce((sum, a) => sum + a.count, 0);
          console.log(`✅ ${rel} (${totalFixed} fixes)`);

          if (FLAGS.VERBOSE) {
            result.applied.forEach(({ pattern, count }) => {
              console.log(`     - ${pattern}: ${count}`);
            });
          }
        }
      } else {
        failed++;
        console.error(`❌ ${file}: ${result.error}`);
      }
    }

    console.log('\n══════════════════════════════════════════════════════════════');
    console.log('📊 Fix Results\n');
    console.log(`  Fixed: ${fixed} files`);
    console.log(`  Unchanged: ${unchanged} files`);
    console.log(`  Failed: ${failed} files`);

    if (fixedFiles.length > 0) {
      const totalPatterns = fixedFiles.reduce(
        (sum, f) => sum + f.applied.reduce((s, a) => s + a.count, 0),
        0
      );
      console.log(`  Total patterns fixed: ${totalPatterns}`);

      console.log('\n💾 Backups created with .mojibake-backup extension');
      console.log('💡 Run --verify to check fixes');
    }
  }

  if (FLAGS.VERIFY) {
    console.log('✓ Verifying mojibake fixes...\n');

    const results = [];
    let remaining = 0;

    for (const file of files) {
      const result = scanFile(file);
      if (result.hasIssues) {
        results.push(result);
        remaining += result.issues.reduce((sum, i) => sum + i.count, 0);
      }
    }

    console.log('══════════════════════════════════════════════════════════════\n');

    if (results.length === 0) {
      console.log('✅ Verification passed! No mojibake patterns detected.');
    } else {
      console.log(`⚠️  ${remaining} mojibake patterns still remain in ${results.length} files\n`);

      results.slice(0, 10).forEach(({ filePath, issues }) => {
        const count = issues.reduce((sum, i) => sum + i.count, 0);
        const rel = path.relative(srcDir, filePath);
        console.log(`  ${count} issues  ${rel}`);
      });

      console.log('\n💡 Run --apply again or inspect files manually');
    }
  }

  console.log('\n✅ Complete');
}

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
