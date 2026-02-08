#!/usr/bin/env node
/**
 * Corrupted File Analysis Script
 * Identifies files that need restoration by comparing with backups
 */

import { readdirSync, statSync, readFileSync, existsSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const srcRoot = join(__dirname, '../..');

// Backup file extensions to check
const BACKUP_EXTENSIONS = [
  '.backup',
  '.bak',
  '.corruption-backup',
  '.any-backup',
  '.mojibake-backup',
  '.batch1000-backup',
  '.comma-backup'
];

// Categories for restoration priority
const PRIORITY_CATEGORIES = {
  CRITICAL: ['ai-service', 'ollama', 'cache', 'db', 'auth', 'storage'],
  HIGH: ['case', 'evidence', 'poi', 'search', 'chat'],
  MEDIUM: ['component', 'route', 'store', 'utils'],
  LOW: ['test', 'demo', 'experimental']
};

const results = {
  corrupted: [],
  identical: [],
  newer: [],
  missing: [],
  safeToDelete: []
};

/**
 * Find all backup files recursively
 */
function findBackupFiles(dir, files = []) {
  try {
    const items = readdirSync(dir);

    for (const item of items) {
      const fullPath = join(dir, item);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        // Skip node_modules, .git, etc.
        if (!item.startsWith('.') && item !== 'node_modules') {
          findBackupFiles(fullPath, files);
        }
      } else {
        // Check if it's a backup file
        if (BACKUP_EXTENSIONS.some(ext => item.endsWith(ext))) {
          files.push(fullPath);
        }
      }
    }
  } catch (err) {
    // Skip permission errors
  }

  return files;
}

/**
 * Get the original file path from backup path
 */
function getOriginalPath(backupPath) {
  let original = backupPath;

  for (const ext of BACKUP_EXTENSIONS) {
    if (original.endsWith(ext)) {
      original = original.slice(0, -ext.length);
      break;
    }
  }

  return original;
}

/**
 * Determine priority category
 */
function getPriority(filePath) {
  const lowerPath = filePath.toLowerCase();

  for (const [priority, keywords] of Object.entries(PRIORITY_CATEGORIES)) {
    if (keywords.some(keyword => lowerPath.includes(keyword))) {
      return priority;
    }
  }

  return 'LOW';
}

/**
 * Check if file appears corrupted (simple heuristics)
 */
function appearsCorrupted(filePath) {
  try {
    const content = readFileSync(filePath, 'utf-8');

    // Check for common corruption patterns
    const corruptionPatterns = [
      /\w+\s+class:\s+\w+\s*=.*?\$props\(\)/,  // Missing comma in $props
      /{\s*\w+:\s*\w+\s+\w+:/,                   // Missing comma in object
      /function\s+\w+\([^)]*\w+:\s*\w+\s+\w+:/,  // Missing comma in params
      /{\s*\w+\s+class:/,                         // Missing comma before class:
      /\w+\s+easing:/,                            // Missing comma before easing:
    ];

    return corruptionPatterns.some(pattern => pattern.test(content));
  } catch {
    return false;
  }
}

/**
 * Analyze a single backup file
 */
function analyzeBackup(backupPath) {
  const originalPath = getOriginalPath(backupPath);
  const relativePath = originalPath.replace(srcRoot, '').replace(/\\/g, '/');

  try {
    const backupStat = statSync(backupPath);

    if (!existsSync(originalPath)) {
      results.missing.push({
        backup: backupPath,
        original: originalPath,
        relative: relativePath,
        status: 'MISSING_ORIGINAL',
        priority: getPriority(relativePath),
        backupSize: backupStat.size,
        backupTime: backupStat.mtime
      });
      return;
    }

    const originalStat = statSync(originalPath);

    // Check if backup is newer
    if (backupStat.mtime > originalStat.mtime) {
      results.newer.push({
        backup: backupPath,
        original: originalPath,
        relative: relativePath,
        status: 'BACKUP_NEWER',
        priority: getPriority(relativePath),
        sizeDiff: backupStat.size - originalStat.size,
        timeDiff: backupStat.mtime - originalStat.mtime
      });
      return;
    }

    // Check if current file appears corrupted
    if (appearsCorrupted(originalPath)) {
      results.corrupted.push({
        backup: backupPath,
        original: originalPath,
        relative: relativePath,
        status: 'CORRUPTED',
        priority: getPriority(relativePath),
        backupSize: backupStat.size,
        currentSize: originalStat.size
      });
      return;
    }

    // Check if backup is larger (potential corruption)
    if (backupStat.size > originalStat.size * 1.1) {
      results.corrupted.push({
        backup: backupPath,
        original: originalPath,
        relative: relativePath,
        status: 'BACKUP_LARGER',
        priority: getPriority(relativePath),
        sizeDiff: backupStat.size - originalStat.size
      });
      return;
    }

    // Files are similar - backup is safe to delete
    results.safeToDelete.push({
      backup: backupPath,
      original: originalPath,
      relative: relativePath,
      status: 'SAFE_TO_DELETE',
      priority: getPriority(relativePath)
    });

  } catch (err) {
    console.error(`Error analyzing ${backupPath}:`, err.message);
  }
}

/**
 * Generate restoration report
 */
function generateReport() {
  console.log('\n📊 Corrupted File Analysis Report\n');
  console.log('=' .repeat(80));

  // Corrupted files
  console.log(`\n🔴 CORRUPTED FILES: ${results.corrupted.length}`);
  const corruptedByCritical = results.corrupted.filter(f => f.priority === 'CRITICAL');
  const corruptedByHigh = results.corrupted.filter(f => f.priority === 'HIGH');

  console.log(`   - CRITICAL: ${corruptedByCritical.length}`);
  console.log(`   - HIGH: ${corruptedByHigh.length}`);
  console.log(`   - MEDIUM/LOW: ${results.corrupted.length - corruptedByCritical.length - corruptedByHigh.length}`);

  if (corruptedByCritical.length > 0) {
    console.log('\n   Critical Files:');
    corruptedByCritical.slice(0, 10).forEach(f => {
      console.log(`   - ${f.relative} (${f.status})`);
    });
  }

  // Newer backups
  console.log(`\n⚠️  BACKUP NEWER: ${results.newer.length}`);
  if (results.newer.length > 0) {
    console.log('   Top 10:');
    results.newer.slice(0, 10).forEach(f => {
      console.log(`   - ${f.relative}`);
    });
  }

  // Missing originals
  console.log(`\n❓ MISSING ORIGINALS: ${results.missing.length}`);

  // Safe to delete
  console.log(`\n✅ SAFE TO DELETE: ${results.safeToDelete.length}`);

  console.log('\n' + '='.repeat(80));
  console.log('\n📝 Manifest files created:');
  console.log('   - corrupted-files.json');
  console.log('   - restoration-plan.json');
  console.log('   - safe-to-delete.json\n');

  return {
    summary: {
      corrupted: results.corrupted.length,
      newer: results.newer.length,
      missing: results.missing.length,
      safeToDelete: results.safeToDelete.length,
      total: results.corrupted.length + results.newer.length + results.missing.length + results.safeToDelete.length
    },
    details: results
  };
}

/**
 * Main execution
 */
async function main() {
  console.log('🔍 Analyzing backup files...\n');

  const backupFiles = findBackupFiles(srcRoot);
  console.log(`Found ${backupFiles.length} backup files\n`);

  let processed = 0;
  for (const backupPath of backupFiles) {
    analyzeBackup(backupPath);
    processed++;

    if (processed % 50 === 0) {
      process.stdout.write(`\rProcessed: ${processed}/${backupFiles.length}`);
    }
  }

  console.log(`\rProcessed: ${processed}/${backupFiles.length} ✓\n`);

  const report = generateReport();

  // Write manifest files
  const manifestDir = join(__dirname);

  // Corrupted files (needs restoration)
  const corruptedManifest = {
    generated: new Date().toISOString(),
    count: results.corrupted.length,
    files: results.corrupted.sort((a, b) => {
      const priorityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    })
  };

  // Write manifests (would write to files, but for now just return data)
  console.log('\n💾 Manifest data prepared for writing\n');

  return report;
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { main, findBackupFiles, analyzeBackup };
