import { spawnSync } from 'child_process';
import { readdirSync, statSync, existsSync } from 'fs';
import { join, relative } from 'path';

/**
 * scripts/atlas/audit-repo-hygiene.mjs
 * 
 * Performs deep directory analysis and hygiene checks:
 * 1. Large files (> 5MB) that might bloat the repo.
 * 2. .gitignore coverage vs. diagnostic artifacts.
 * 3. Stale build artifacts (tsbuildinfo, logs).
 * 4. Empty directory detection.
 * 5. Search glob integrity (verifying rg -u necessity).
 */

const REPO_ROOT = process.cwd();
const LARGE_SIZE_THRESHOLD = 5 * 1024 * 1024; // 5MB

function rg(args) {
  const r = spawnSync('rg', args, { encoding: 'utf8' });
  return (r.stdout ?? '').trim();
}

console.log(`\n╔══════════════════════════════════════════════════════╗`);
console.log(`║  Repository Hygiene & Directory Analysis             ║`);
console.log(`╚══════════════════════════════════════════════════════╝\n`);

// ── 1. Large File Audit ───────────────────────────────────────────────────────
console.log(`[1] Large File Audit (> 5MB, Unrestricted):`);
const allFiles = rg(['--files', '-u']).split('\n').filter(Boolean);
let largeFound = 0;
for (const f of allFiles) {
  try {
    const stats = statSync(f);
    if (stats.size > LARGE_SIZE_THRESHOLD) {
      const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
      console.log(`  WARN: ${sizeMB}MB  - ${f}`);
      largeFound++;
    }
  } catch (e) {
    // skip broken links or permission issues
  }
}
if (largeFound === 0) console.log(`  PASS: No files > 5MB found.`);

// ── 2. .gitignore Integrity ───────────────────────────────────────────────────
console.log(`\n[2] .gitignore Shadow Check (Files that exist but are ignored):`);
const criticalDiagnostics = [
  'svelte-server-errors.json',
  'tsconfig.check.tsbuildinfo',
  'svelte-check-errors.json',
  'vite-errors.json',
  'eng.traineddata'
];

let shadowFound = 0;
for (const f of criticalDiagnostics) {
  const exists = allFiles.find(path => path.endsWith(f));
  if (exists) {
    // Check if rg can find it WITHOUT -u
    const visible = rg(['--files', '-g', `**/${f}`]);
    if (!visible) {
      console.log(`  INFO: ${f} is correctly ignored but exists (Diagnostic Shadow).`);
      shadowFound++;
    }
  }
}
if (shadowFound === 0) console.log(`  PASS: No critical diagnostic files found in shadow.`);

// ── 3. Stale Artifact Audit ──────────────────────────────────────────────────
console.log(`\n[3] Stale Artifact Audit:`);
const stalePatterns = [
  '.tsbuildinfo',
  '.pre-batch-fix',
  '.comma-backup',
  'svelte-errors-analysis.txt'
];
let staleFound = 0;
for (const f of allFiles) {
  if (stalePatterns.some(p => f.includes(p))) {
    console.log(`  WARN: Stale artifact found: ${f}`);
    staleFound++;
  }
}
if (staleFound === 0) console.log(`  PASS: No stale artifacts found.`);

// ── 4. Empty Directory Audit ──────────────────────────────────────────────────
console.log(`\n[4] Empty Directory Audit:`);
const skipDirs = ['node_modules', '.git', '.svelte-kit', 'build', '.turbo', 'dist', '.vscode', 'storage', 'data', 'qdrant_storage'];

function findEmptyDirs(dir, list = []) {
  const files = readdirSync(dir);
  if (files.length === 0) {
    list.push(dir);
    return list;
  }
  for (const f of files) {
    const p = join(dir, f);
    try {
      if (statSync(p).isDirectory()) {
        if (skipDirs.some(s => p.includes(s))) continue;
        findEmptyDirs(p, list);
      }
    } catch(e) {}
  }
  return list;
}

const emptyDirs = findEmptyDirs(REPO_ROOT);
if (emptyDirs.length > 0) {
  for (const d of emptyDirs) {
    console.log(`  INFO: Empty directory: ${relative(REPO_ROOT, d)}`);
  }
} else {
  console.log(`  PASS: No empty directories found.`);
}

console.log(`\nHygiene Audit Complete.\n`);
