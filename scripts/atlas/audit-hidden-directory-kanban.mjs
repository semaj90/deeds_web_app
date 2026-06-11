#!/usr/bin/env node
/**
 * Audit Hidden Directory Kanban
 *
 * Splits hidden directory tasks into ACTIVE vs SUPPRESSED buckets.
 *
 * ACTIVE (human planning, should appear in OpenCode):
 * - docs/reports stale md/json summaries
 * - .tmp human planning files (TODO, REPO-NOTE, JSON-MAPPING)
 * - .tmp/engram-cache index/manifest files
 * - scripts/atlas and scripts/packets audit scripts
 * - root TODO, REPO-NOTE, KANBAN docs
 *
 * SUPPRESSED (generated cache, evidence only):
 * - generated cache payloads
 * - per-card embeddings
 * - .opencode/cards, .opencode/embeddings
 * - bulk JSON result dumps
 * - duplicate archived reports
 *
 * Output:
 * - reports/hidden_directory_kanban.json (summary with active/suppressed split)
 * - .tmp/hidden_directory_tasks.jsonl (active tasks only)
 * - sveltekit-frontend/.tmp/hidden_directory_suppressed.jsonl (suppressed evidence)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { globSync } from 'glob';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '../../sveltekit-frontend');

// Threshold patterns
const ACTIVE_PATTERNS = [
  // Root planning docs only
  /^(TODO|REPO-NOTE|KANBAN)\.md$/,
  // Human-authored planning in .tmp
  /\.tmp\/(TODO|REPO-NOTE|JSON-MAPPING|PLANNING|kanban)/i,
  // .tmp engram cache index/manifest (not payloads)
  /\.tmp\/engram.*\.(manifest|index)\.json$/i,
  // Audit/checker scripts in scripts/atlas or scripts/packets
  /scripts\/(atlas|packets)\/(audit|check|validate|verify).*\.mjs$/,
];

const SUPPRESSED_PATTERNS = [
  // Generated reports (docs/reports is auto-generated, not planning)
  /docs\/reports\//,
  // OpenCode generated caches
  /\.opencode\/cards\//,
  /\.opencode\/embeddings\//,
  /\.opencode\/.*\.(json|jsonl|ndjson)$/,
  // Generated payloads and embeddings
  /\.tmp\/.*embedding/i,
  /\.tmp\/.*payload/i,
  /\.tmp\/.*cache.*\.(json|jsonl)/i,
  /\.tmp\/.*result/i,
  // Archive and backups
  /archive\//,
  /backup\//,
  /\.backup\//,
];

// ============================================================================
// CLASSIFICATION
// ============================================================================

function classifyPath(filePath) {
  const normalized = filePath.replace(/\\/g, '/');

  // Check suppressed first (more specific)
  for (const pattern of SUPPRESSED_PATTERNS) {
    if (pattern.test(normalized)) {
      return 'suppressed';
    }
  }

  // Check active
  for (const pattern of ACTIVE_PATTERNS) {
    if (pattern.test(normalized)) {
      return 'active';
    }
  }

  // Default: suppressed (generated artifact unless proven otherwise)
  return 'suppressed';
}

// ============================================================================
// SCAN
// ============================================================================

function scanHiddenDirectories() {
  console.log('🔍 Scanning hidden directories for tasks...\n');

  const globs = [
    'docs/reports/**/*.{md,json}',
    '.tmp/**/*',
    '.opencode/**/*',
    'archive/**/*',
    'scripts/atlas/*audit*.mjs',
    'scripts/packets/*audit*.mjs',
    'TODO.md',
    'REPO-NOTE.md',
    'KANBAN.md',
  ];

  const all = [];

  for (const glob of globs) {
    try {
      const files = globSync(glob, { cwd: ROOT, nodir: true });
      for (const file of files) {
        all.push({
          path: file,
          classification: classifyPath(file),
        });
      }
    } catch (err) {
      // Skip glob errors (e.g., directory not found)
    }
  }

  return all;
}

// ============================================================================
// REPORT
// ============================================================================

function generateReport(items) {
  const active = items.filter(i => i.classification === 'active');
  const suppressed = items.filter(i => i.classification === 'suppressed');

  console.log('═══════════════════════════════════════════════════════════\n');
  console.log('   Hidden Directory Kanban Audit\n');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log('📊 Classification Results:');
  console.log(`  Active (human-facing): ${active.length}`);
  console.log(`  Suppressed (generated): ${suppressed.length}`);
  console.log(`  Total: ${items.length}\n`);

  if (active.length > 0 && active.length <= 25) {
    console.log('Active Tasks:');
    for (const item of active) {
      console.log(`  ✓ ${item.path}`);
    }
    console.log();
  } else if (active.length > 25) {
    console.log('Active Tasks (showing first 10 of %d):', active.length);
    for (const item of active.slice(0, 10)) {
      console.log(`  ✓ ${item.path}`);
    }
    console.log(`  ... and ${active.length - 10} more\n`);
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (active.length > 50) {
    console.log('⚠️  Active tasks still too high (>50)');
    console.log('   Recommend refining ACTIVE_PATTERNS to exclude more generated outputs\n');
  } else if (active.length > 20) {
    console.log('⚠️  Active tasks elevated (20-50)');
    console.log('   OpenCode will see these on startup — ensure they are truly actionable\n');
  } else {
    console.log('✅ Active task count is healthy (<20)\n');
  }

  return { active, suppressed };
}

// ============================================================================
// OUTPUT
// ============================================================================

function writeOutput(active, suppressed) {
  const reportDir = path.join(__dirname, '../../reports');
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  // Summary JSON
  const summary = {
    timestamp: new Date().toISOString(),
    hiddenDirectoryTasks: {
      active: active.length,
      suppressed: suppressed.length,
      total: active.length + suppressed.length,
    },
    activePatterns: ACTIVE_PATTERNS.map(p => p.source),
    suppressedPatterns: SUPPRESSED_PATTERNS.map(p => p.source),
  };

  fs.writeFileSync(
    path.join(reportDir, 'hidden_directory_kanban.json'),
    JSON.stringify(summary, null, 2)
  );
  console.log(`✓ Wrote ${reportDir}/hidden_directory_kanban.json`);

  // Active tasks JSONL
  const tmpDir = path.join(__dirname, '../../.tmp');
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  const activeTasks = active.map(a => ({
    path: a.path,
    type: 'hidden_directory_active',
    discovered_at: new Date().toISOString(),
  }));

  fs.writeFileSync(
    path.join(tmpDir, 'hidden_directory_tasks.jsonl'),
    activeTasks.map(t => JSON.stringify(t)).join('\n')
  );
  console.log(`✓ Wrote ${tmpDir}/hidden_directory_tasks.jsonl (${activeTasks.length} lines)`);

  // Suppressed evidence JSONL
  const svelteDir = path.join(__dirname, '../../sveltekit-frontend/.tmp');
  if (!fs.existsSync(svelteDir)) {
    fs.mkdirSync(svelteDir, { recursive: true });
  }

  const suppressedTasks = suppressed.map(s => ({
    path: s.path,
    type: 'hidden_directory_suppressed',
    discovered_at: new Date().toISOString(),
  }));

  fs.writeFileSync(
    path.join(svelteDir, 'hidden_directory_suppressed.jsonl'),
    suppressedTasks.map(t => JSON.stringify(t)).join('\n')
  );
  console.log(`✓ Wrote ${svelteDir}/hidden_directory_suppressed.jsonl (${suppressedTasks.length} lines)`);

  console.log();
}

// ============================================================================
// MAIN
// ============================================================================

function main() {
  try {
    const items = scanHiddenDirectories();
    const { active, suppressed } = generateReport(items);
    writeOutput(active, suppressed);

    process.exit(active.length > 100 ? 1 : 0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

main();
