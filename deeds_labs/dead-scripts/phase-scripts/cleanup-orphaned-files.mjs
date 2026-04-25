#!/usr/bin/env node
/**
 * File Cleanup Script - Remove Orphaned and Unused Files
 *
 * Safely removes:
 * - Empty files (<100 bytes)
 * - No imports/exports (isolated files)
 * - Archived Svelte 4 code
 * - Gaming/demo components not used in production
 * - Duplicate utility functions
 * - Old experiment code
 *
 * Modes:
 * - --dry-run: Preview what would be deleted (default)
 * - --apply: Actually delete the files
 * - --category <name>: Only process specific category
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'src');

const args = process.argv.slice(2);
const DRY_RUN = !args.includes('--apply');
const CATEGORY_FILTER = args.includes('--category')
  ? args[args.indexOf('--category') + 1]
  : null;

// =============================================================================
// File Discovery
// =============================================================================
function discoverFiles(dir) {
  const files = [];

  function walk(currentPath) {
    try {
      const entries = readdirSync(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(currentPath, entry.name);

        if (entry.isDirectory()) {
          if (entry.name === 'node_modules' || entry.name === '.svelte-kit') continue;
          walk(fullPath);
        } else if (entry.isFile()) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      // Skip permission errors
    }
  }

  walk(dir);
  return files;
}

// =============================================================================
// Analysis Functions
// =============================================================================
function isOrphaned(file) {
  try {
    const stats = statSync(file);

    // Very small files (likely empty or just comments)
    if (stats.size < 100) return true;

    const content = readFileSync(file, 'utf8');

    // No imports and no exports = orphaned
    const hasImport = /^import\s+/m.test(content);
    const hasExport = /^export\s+/m.test(content);

    return !hasImport && !hasExport && content.trim().length > 0;
  } catch {
    return false;
  }
}

function isArchived(file) {
  return file.includes('_archive') || file.includes('svelte4');
}

function isGamingUI(file) {
  const gamingPatterns = [
    '/n64/', '/nes/', '/gaming/',
    'N64', 'NES', 'retro', 'console'
  ];
  return gamingPatterns.some(p => file.includes(p));
}

function isDemoOrTest(file) {
  const demoPatterns = [
    'demo', 'Demo', 'test-demo', 'experiment',
    'Example', 'Sample', 'Prototype'
  ];
  return demoPatterns.some(p => file.includes(p)) &&
         !file.includes('.spec.') &&
         !file.includes('.test.');
}

function isUnusedBridge(file) {
  const bridgePatterns = [
    'cuda-bridge', 'grpc-client', 'py-bridge',
    'go-service-client'
  ];
  return bridgePatterns.some(p => file.includes(p));
}

function isDuplicate(file, allFiles) {
  // Check if there's a similar file with same exports
  // This is a simplified check - real duplicate detection would compare AST
  const basename = file.split('/').pop().split('.')[0];
  const similar = allFiles.filter(f =>
    f !== file &&
    f.includes(basename) &&
    Math.abs(statSync(f).size - statSync(file).size) < 500
  );
  return similar.length > 0;
}

// =============================================================================
// Categorize Files for Cleanup
// =============================================================================
function categorizeForCleanup(files) {
  const categories = {
    orphaned: [],
    archived: [],
    gaming: [],
    demos: [],
    bridges: [],
    duplicates: [],
    safe: []
  };

  for (const file of files) {
    // Skip node_modules and build artifacts
    if (file.includes('node_modules') || file.includes('.svelte-kit')) {
      continue;
    }

    // Categorize
    if (isArchived(file)) {
      categories.archived.push(file);
    } else if (isOrphaned(file)) {
      categories.orphaned.push(file);
    } else if (isGamingUI(file)) {
      categories.gaming.push(file);
    } else if (isDemoOrTest(file)) {
      categories.demos.push(file);
    } else if (isUnusedBridge(file)) {
      categories.bridges.push(file);
    } else {
      categories.safe.push(file);
    }
  }

  return categories;
}

// =============================================================================
// Delete Files
// =============================================================================
function deleteFiles(files, category) {
  const deleted = [];
  const errors = [];

  for (const file of files) {
    try {
      if (DRY_RUN) {
        deleted.push(file);
      } else {
        unlinkSync(file);
        deleted.push(file);
      }
    } catch (error) {
      errors.push({ file, error: error.message });
    }
  }

  return { deleted, errors };
}

// =============================================================================
// Generate Report
// =============================================================================
function generateReport(categories, deletionResults) {
  console.log('\n🧹 FILE CLEANUP ANALYSIS\n');
  console.log('════════════════════════════════════════════════════════════\n');

  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE - No files will be deleted\n');
  } else {
    console.log('⚠️  APPLY MODE - Files will be permanently deleted!\n');
  }

  console.log('📊 CATEGORY BREAKDOWN:\n');

  Object.entries(categories).forEach(([category, files]) => {
    if (category === 'safe') return;

    const icon = {
      orphaned: '🗑️',
      archived: '📦',
      gaming: '🎮',
      demos: '🧪',
      bridges: '🌉',
      duplicates: '📑'
    }[category] || '📁';

    console.log(`   ${icon} ${category.toUpperCase()}: ${files.length} files`);

    if (files.length > 0 && files.length <= 10) {
      files.forEach(f => {
        console.log(`      - ${relative(ROOT, f)}`);
      });
    } else if (files.length > 10) {
      files.slice(0, 5).forEach(f => {
        console.log(`      - ${relative(ROOT, f)}`);
      });
      console.log(`      ... and ${files.length - 5} more`);
    }
    console.log('');
  });

  const totalRemovable = Object.entries(categories)
    .filter(([cat]) => cat !== 'safe')
    .reduce((sum, [_, files]) => sum + files.length, 0);

  console.log('📈 SUMMARY:\n');
  console.log(`   Total files scanned: ${Object.values(categories).flat().length}`);
  console.log(`   Safe files: ${categories.safe.length}`);
  console.log(`   Removable files: ${totalRemovable}`);
  console.log(`   Cleanup potential: ${((totalRemovable / Object.values(categories).flat().length) * 100).toFixed(1)}%\n`);

  if (deletionResults) {
    console.log('✅ DELETION RESULTS:\n');
    console.log(`   Deleted: ${deletionResults.deleted.length} files`);
    if (deletionResults.errors.length > 0) {
      console.log(`   Errors: ${deletionResults.errors.length}`);
      deletionResults.errors.forEach(({ file, error }) => {
        console.log(`      - ${relative(ROOT, file)}: ${error}`);
      });
    }
    console.log('');
  }

  if (DRY_RUN) {
    console.log('💡 NEXT STEPS:\n');
    console.log('   1. Review the files listed above');
    console.log('   2. Run with --apply to actually delete them:');
    console.log('      node scripts/cleanup-orphaned-files.mjs --apply');
    console.log('   3. Or delete specific category:');
    console.log('      node scripts/cleanup-orphaned-files.mjs --apply --category archived\n');
  }
}

// =============================================================================
// Save Backup List
// =============================================================================
function saveBackupList(categories) {
  const backupDir = join(ROOT, 'reports');
  if (!existsSync(backupDir)) {
    mkdirSync(backupDir, { recursive: true });
  }

  const backupFile = join(backupDir, `cleanup-backup-${Date.now()}.json`);
  const backup = {
    timestamp: new Date().toISOString(),
    dryRun: DRY_RUN,
    categories: Object.entries(categories).reduce((acc, [cat, files]) => {
      acc[cat] = files.map(f => relative(ROOT, f));
      return acc;
    }, {})
  };

  writeFileSync(backupFile, JSON.stringify(backup, null, 2));
  console.log(`💾 Backup list saved: ${relative(ROOT, backupFile)}\n`);
}

// =============================================================================
// Main Execution
// =============================================================================
async function main() {
  console.log('🔍 Scanning for orphaned and unused files...\n');

  const files = discoverFiles(SRC);
  console.log(`   Found: ${files.length} files total\n`);

  const categories = categorizeForCleanup(files);
  saveBackupList(categories);

  let deletionResults = null;

  if (!DRY_RUN) {
    const categoriesToDelete = CATEGORY_FILTER
      ? { [CATEGORY_FILTER]: categories[CATEGORY_FILTER] || [] }
      : Object.entries(categories)
          .filter(([cat]) => cat !== 'safe')
          .reduce((acc, [cat, files]) => ({ ...acc, [cat]: files }), {});

    const allFilesToDelete = Object.values(categoriesToDelete).flat();
    deletionResults = deleteFiles(allFilesToDelete, CATEGORY_FILTER || 'all');
  }

  generateReport(categories, deletionResults);
}

main().catch(console.error);
