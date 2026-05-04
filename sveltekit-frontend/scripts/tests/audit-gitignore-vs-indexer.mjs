#!/usr/bin/env node
/**
 * audit-gitignore-vs-indexer.mjs
 *
 * Audit .gitignore vs the fast AST indexer's exclude list.
 *
 * Goal: ensure no source file the indexer wants to tag is being silently dropped
 * because git refuses to track it. Three failure modes we check:
 *
 *   1. Indexer walks a directory that's gitignored  →  inconsistent state
 *   2. Indexer skips a directory that git tracks    →  blind spots in KAG
 *   3. Source files (.ts, .svelte) under src/ that are gitignored  →  red flag
 *
 * Outputs a sorted report. Exit 0 if no critical conflicts, 1 if action needed.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND  = path.resolve(__dirname, '../..');
const REPO_ROOT = path.resolve(FRONTEND, '..');
const SRC_DIR   = path.join(FRONTEND, 'src');

const c = {
  green:  s => `\x1b[32m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`,
  red:    s => `\x1b[31m${s}\x1b[0m`,
  cyan:   s => `\x1b[36m${s}\x1b[0m`,
  bold:   s => `\x1b[1m${s}\x1b[0m`,
  dim:    s => `\x1b[2m${s}\x1b[0m`,
};

// ── 1. Read indexer exclusions (canonical source of truth) ──────────────────

const indexerSrc = readFileSync(path.join(FRONTEND, 'scripts/index-codebase-fast.mjs'), 'utf8');
const excludeMatch = indexerSrc.match(/EXCLUDE_DIRS\s*=\s*new\s+Set\(\[([^\]]+)\]/);
const INDEXER_EXCLUDES = new Set(
  excludeMatch
    ? excludeMatch[1].split(',').map(s => s.trim().replace(/['"`]/g, '')).filter(Boolean)
    : []
);
const extMatch = indexerSrc.match(/EXTENSIONS\s*=\s*new\s+Set\(\[([^\]]+)\]/);
const INDEXER_EXTS = new Set(
  extMatch
    ? extMatch[1].split(',').map(s => s.trim().replace(/['"`]/g, '')).filter(Boolean)
    : []
);

console.log(c.bold('\n=== .gitignore vs fast AST indexer audit ===\n'));
console.log(c.dim(`indexer EXCLUDE_DIRS: ${[...INDEXER_EXCLUDES].join(', ')}`));
console.log(c.dim(`indexer EXTENSIONS:   ${[...INDEXER_EXTS].join(', ')}\n`));

// ── 2. Resolve which src/ files git would actually track ────────────────────

console.log(c.cyan('▶ Walking src/ — comparing indexer view vs git view...'));

let indexerCount = 0;
let gitCount     = 0;
const indexerOnly = [];
const gitOnly     = [];
const both        = [];

function walkIndexer(dir, rel = '') {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (INDEXER_EXCLUDES.has(entry.name)) continue;
    const full   = path.join(dir, entry.name);
    const relPath = path.posix.join(rel, entry.name);
    if (entry.isDirectory()) {
      walkIndexer(full, relPath);
    } else if (INDEXER_EXTS.has(path.extname(entry.name))) {
      indexerCount++;
      // Check if git ignores this file
      const result = spawnSync('git', ['check-ignore', '-q', full], { cwd: REPO_ROOT });
      // exit 0 = ignored, 1 = not ignored, 128 = error
      if (result.status === 0) {
        indexerOnly.push(relPath);
      } else {
        both.push(relPath);
      }
    }
  }
}

walkIndexer(SRC_DIR, 'src');

// 3. Files git tracks but indexer skips (only check src/__tests__ etc since other excludes are universal)
const gitFiles = spawnSync('git', ['ls-files', 'sveltekit-frontend/src/'], { cwd: REPO_ROOT, encoding: 'utf8' });
const tracked = (gitFiles.stdout ?? '').split('\n').filter(Boolean).map(f => f.replace(/^sveltekit-frontend\//, ''));
gitCount = tracked.length;

const trackedSet = new Set(tracked);
const indexerSet = new Set([...both, ...indexerOnly]);

for (const f of tracked) {
  if (!indexerSet.has(f) && INDEXER_EXTS.has(path.extname(f))) {
    // File git tracks, has indexer-relevant extension, but indexer didn't visit
    gitOnly.push(f);
  }
}

// ── 3. Report ───────────────────────────────────────────────────────────────

console.log(`\n${c.bold('Coverage')}:`);
console.log(`  ${c.green('✓')} Indexed AND tracked:    ${c.green(both.length.toLocaleString())}`);
console.log(`  ${both.length === 0 ? c.green('✓') : c.red('✗')} Indexed but gitignored: ${indexerOnly.length === 0 ? c.green(0) : c.red(indexerOnly.length)}`);
console.log(`  ${c.dim('○')} Tracked but not indexed: ${gitOnly.length.toLocaleString()} ${c.dim('(test/mock files in __tests__/__mocks__)')}`);

// Classify ignored files: archived backups (acceptable) vs real source (critical)
const ARCHIVE_PATTERNS = [
  /\/\.phase\d*-backup\//,    // .phase105-backup, .phase79-backup, etc.
  /\/_archived\//,            // explicit archive dirs
  /\/deeds_labs\//,           // staged-for-deletion
  /\.bak$/,                   // .bak suffix
  /\.backup\./,               // .backup. infix
];
const archivedIgnored = indexerOnly.filter(f => ARCHIVE_PATTERNS.some(re => re.test(f)));
const criticalIgnored = indexerOnly.filter(f => !ARCHIVE_PATTERNS.some(re => re.test(f)));

if (archivedIgnored.length > 0) {
  console.log(c.dim(`\n  ${archivedIgnored.length} archived/backup file(s) ignored (acceptable, not counted as critical)`));
}

if (criticalIgnored.length > 0) {
  console.log(c.red('\n⚠ CRITICAL — files indexer reads but git ignores (KAG will tag files no one can review):'));
  for (const f of criticalIgnored.slice(0, 20)) {
    console.log(`    ${c.red('•')} ${f}`);
  }
  if (criticalIgnored.length > 20) console.log(c.dim(`    ... ${criticalIgnored.length - 20} more`));
}

if (gitOnly.length > 0) {
  // Group by top-level subdir for readability
  const byDir = new Map();
  for (const f of gitOnly) {
    const parts = f.split('/');
    const key = parts.slice(0, 4).join('/');
    byDir.set(key, (byDir.get(key) ?? 0) + 1);
  }
  const sorted = [...byDir.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  console.log(c.yellow('\n○ Top dirs git tracks but indexer skips (mostly intentional — tests/mocks):'));
  for (const [dir, n] of sorted) {
    console.log(`    ${c.dim('·')} ${dir}  ${c.dim(`(${n} files)`)}`);
  }
}

// ── 4. Check excluded dirs are actually all gitignored too (consistency) ────

console.log(c.bold('\nIndexer EXCLUDE_DIRS gitignore status:'));
for (const ex of INDEXER_EXCLUDES) {
  // Test against a typical path
  const testPath = path.join(FRONTEND, ex);
  if (!existsSync(testPath)) {
    console.log(`  ${c.dim('·')} ${ex}  ${c.dim('(does not exist on disk)')}`);
    continue;
  }
  const result = spawnSync('git', ['check-ignore', '-q', testPath], { cwd: REPO_ROOT });
  if (result.status === 0) {
    console.log(`  ${c.green('✓')} ${ex}  ${c.dim('— ignored by git (consistent)')}`);
  } else if (ex === '__tests__' || ex === '__mocks__') {
    console.log(`  ${c.yellow('○')} ${ex}  ${c.yellow('— TRACKED by git (intentional: tests live in repo)')}`);
  } else {
    console.log(`  ${c.red('✗')} ${ex}  ${c.red('— NOT gitignored — inconsistent!')}`);
  }
}

// ── 5. Verdict ───────────────────────────────────────────────────────────────

console.log(`\n${c.bold('Summary:')} ${c.green(`${both.length.toLocaleString()} files`)} are both tracked and indexed (KAG-safe).`);
if (criticalIgnored.length > 0) {
  console.log(c.red(`Critical: ${criticalIgnored.length} non-archive file(s) would receive Gemma4 tags but cannot be reviewed via git. Fix .gitignore.`));
  process.exit(1);
} else if (archivedIgnored.length > 0) {
  console.log(c.green(`No critical conflicts. ${archivedIgnored.length} archive file(s) ignored as expected. Safe to run codebase-wide Gemma4 tagging.\n`));
  process.exit(0);
} else {
  console.log(c.green('No conflicts. Safe to run codebase-wide Gemma4 tagging.\n'));
  process.exit(0);
}
