#!/usr/bin/env node
/**
 * audit-hidden-surfaces.mjs
 *
 * Priority 4: Hidden Surface Inventory
 *
 * Discovers files outside git that contain truth:
 * - .gitignored artifacts (models, caches, build output)
 * - Hidden directories (.opencode, .tmp, etc)
 * - Binary files (node_modules exclusions)
 *
 * Classifies each as:
 * - keep_canonical: live truth, don't archive
 * - convert_to_ndjson: snapshot for offline replay
 * - compress_zstd: compress for storage
 * - move_to_cold: archive to cold storage
 * - delete_if_regenerable: can be rebuilt
 * - index_metadata_only: catalog without storing
 *
 * Result: Atlas Surface Registry
 */

import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveAtlasPaths } from './lib/repo-paths.mjs';

const { __dirname, frontendRoot: FRONTEND_ROOT, repoRoot: REPO_ROOT } = resolveAtlasPaths(import.meta.url);
const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

const REPORT_DIR = resolve(FRONTEND_ROOT, 'docs/reports');
const REPORT_FILE = resolve(REPORT_DIR, 'hidden-surface-audit.json');

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function logVerbose(msg) {
  if (VERBOSE) console.log(`[VERBOSE] ${msg}`);
}

/**
 * Step 1: Find all gitignored files
 */
function findGitignoredFiles() {
  logVerbose('Scanning for gitignored files...');

  try {
    // Use git check-ignore to find all ignored files
    const output = execSync(
      'git status --porcelain=v1 --untracked-files=all 2>/dev/null | grep "^?" | awk "{print $2}" | while read f; do git check-ignore "$f" >/dev/null 2>&1 && echo "$f"; done',
      { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
    );

    const files = output.trim().split('\n').filter(f => f.length > 0);
    logVerbose(`Found ${files.length} gitignored files`);
    return files;
  } catch (err) {
    logVerbose(`Git scan error (fallback): ${err.message}`);
    return [];
  }
}

/**
 * Step 2: Find hidden directories
 */
function findHiddenDirectories() {
  logVerbose('Scanning for hidden directories...');

  try {
    const output = execSync(
      'find . -maxdepth 2 -type d -name ".*" -not -name ".git" 2>/dev/null',
      { cwd: resolve(__dirname, '../../'), encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
    );

    const dirs = output.trim().split('\n').filter(f => f.length > 1);
    logVerbose(`Found ${dirs.length} hidden directories`);
    return dirs;
  } catch (err) {
    logVerbose(`Hidden dir scan error: ${err.message}`);
    return [];
  }
}

/**
 * Step 3: Classify files by purpose
 */
function classifyFiles(files, hiddenDirs) {
  logVerbose('Classifying files...');

  const classifications = {
    keep_canonical: [],        // Live truth (models, embeddings, indices)
    convert_to_ndjson: [],     // Snapshots for replay
    compress_zstd: [],         // Large binaries
    move_to_cold: [],          // Archivable
    delete_if_regenerable: [], // Can rebuild
    index_metadata_only: [],   // Catalog only
  };

  const allItems = [...files, ...hiddenDirs];

  for (const item of allItems) {
    const lower = item.toLowerCase();

    // Keep canonical
    if (
      lower.includes('models/') ||
      lower.includes('embeddinggemma') ||
      lower.includes('granite-docling') ||
      lower.includes('qdrant') ||
      lower.includes('redis') ||
      lower.includes('.opencode')
    ) {
      classifications.keep_canonical.push(item);
    }
    // Convert to NDJSON
    else if (lower.includes('reports/') || lower.includes('exports/')) {
      classifications.convert_to_ndjson.push(item);
    }
    // Compress
    else if (lower.includes('.zip') || lower.includes('.tar') || lower.includes('.wasm')) {
      classifications.compress_zstd.push(item);
    }
    // Archive
    else if (
      lower.includes('node_modules') ||
      lower.includes('build/') ||
      lower.includes('dist/') ||
      lower.includes('.next/')
    ) {
      classifications.move_to_cold.push(item);
    }
    // Delete if regenerable
    else if (
      lower.includes('package-lock.json') ||
      lower.includes('yarn.lock') ||
      lower.includes('.cache') ||
      lower.includes('tmp/')
    ) {
      classifications.delete_if_regenerable.push(item);
    }
    // Index only
    else {
      classifications.index_metadata_only.push(item);
    }
  }

  return classifications;
}

/**
 * Step 4: Generate registry
 */
function generateRegistry(classifications) {
  const registry = {
    generatedAt: new Date().toISOString(),
    summary: {
      total_items: Object.values(classifications).reduce((sum, arr) => sum + arr.length, 0),
      keep_canonical: classifications.keep_canonical.length,
      convert_to_ndjson: classifications.convert_to_ndjson.length,
      compress_zstd: classifications.compress_zstd.length,
      move_to_cold: classifications.move_to_cold.length,
      delete_if_regenerable: classifications.delete_if_regenerable.length,
      index_metadata_only: classifications.index_metadata_only.length,
    },
    classifications,
    policies: {
      keep_canonical: 'Live truth — never delete, always available',
      convert_to_ndjson: 'Snapshot into structured format for offline replay',
      compress_zstd: 'Compress with zstd, store in cold tier',
      move_to_cold: 'Archive to cold storage, keep metadata index',
      delete_if_regenerable: 'Safe to delete, can rebuild from source',
      index_metadata_only: 'Catalog metadata only, full content not stored',
    },
    recommendations: [
      `Keep ${classifications.keep_canonical.length} canonical surfaces live`,
      `Convert ${classifications.convert_to_ndjson.length} reports to NDJSON for replay`,
      `Compress ${classifications.compress_zstd.length} binaries with zstd`,
      `Archive ${classifications.move_to_cold.length} items to cold storage`,
      `Safe to delete ${classifications.delete_if_regenerable.length} regenerable items`,
      `Index ${classifications.index_metadata_only.length} items by metadata`,
    ],
    status: {
      audit_complete: true,
      action_required: true,
    },
    timestamp: new Date().toISOString(),
  };

  return registry;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  log('='.repeat(70));
  log('Priority 4: Hidden Surface Inventory');
  log('='.repeat(70));

  try {
    // Step 1: Find gitignored files
    const gitignoredFiles = findGitignoredFiles();

    // Step 2: Find hidden dirs
    const hiddenDirs = findHiddenDirectories();

    // Step 3: Classify
    const classifications = classifyFiles(gitignoredFiles, hiddenDirs);

    // Step 4: Generate registry
    const registry = generateRegistry(classifications);

    // Write report
    mkdirSync(dirname(REPORT_FILE), { recursive: true });
    writeFileSync(REPORT_FILE, JSON.stringify(registry, null, 2));

    log('');
    log('Hidden Surface Registry:');
    log(`  Total items: ${registry.summary.total_items}`);
    log(`  Keep canonical: ${registry.summary.keep_canonical}`);
    log(`  Convert to NDJSON: ${registry.summary.convert_to_ndjson}`);
    log(`  Compress (zstd): ${registry.summary.compress_zstd}`);
    log(`  Move to cold: ${registry.summary.move_to_cold}`);
    log(`  Delete if regenerable: ${registry.summary.delete_if_regenerable}`);
    log(`  Index metadata only: ${registry.summary.index_metadata_only}`);
    log('');
    log('Recommendations:');
    registry.recommendations.forEach(rec => log(`  • ${rec}`));
    log('');
    log(`✓ Report: ${REPORT_FILE}`);
    log('✓ Priority 4 Complete');
  } catch (err) {
    log(`❌ Error: ${err.message}`);
    if (VERBOSE) console.error(err);
    process.exit(1);
  }
}

main();
