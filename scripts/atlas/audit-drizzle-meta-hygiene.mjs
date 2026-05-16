#!/usr/bin/env node
/**
 * Drizzle meta/ hygiene checker.
 *
 * Drizzle Kit treats EVERY file in drizzle/meta as a JSON snapshot.
 * Non-JSON files (LLMS.md, AGENTS.md, *.md) cause parse failures that
 * look like corrupt snapshots and break `drizzle-kit generate` / `migrate`.
 *
 * Usage:
 *   node scripts/atlas/audit-drizzle-meta-hygiene.mjs [--dry-run] [--json] [--fix]
 *
 * --fix  moves non-JSON files to drizzle/meta/archived/ (safe; does not delete)
 */

import { existsSync, mkdirSync, readdirSync, renameSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT } from './_atlas-utils.mjs';

const FRONTEND    = join(REPO_ROOT, 'sveltekit-frontend');
const META_DIR    = join(FRONTEND, 'drizzle/meta');
const ARCHIVE_DIR = join(META_DIR, 'archived');
const REPORTS_DIR = join(REPO_ROOT, 'docs/reports');

const ARGS    = process.argv.slice(2);
const DRY_RUN = ARGS.includes('--dry-run');
const FIX     = ARGS.includes('--fix') && !DRY_RUN;
const JSON_OUT = ARGS.includes('--json');

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', gray: '\x1b[90m',
};

// Allowed file patterns in drizzle/meta:
//   _journal.json
//   0000_snapshot.json … 9999_snapshot.json
const ALLOWED_RE = /^(_journal\.json|\d{4}_snapshot\.json)$/;

function check(metaDir) {
  if (!existsSync(metaDir)) {
    return { exists: false, files: [], violations: [], snapshots: [], journal: false };
  }

  const files = readdirSync(metaDir).filter(f => {
    try { return statSync(join(metaDir, f)).isFile(); } catch { return false; }
  });

  const violations = files.filter(f => !ALLOWED_RE.test(f));
  const snapshots  = files.filter(f => /^\d{4}_snapshot\.json$/.test(f));
  const journal    = files.includes('_journal.json');

  return { exists: true, files, violations, snapshots, journal };
}

function applyFix(metaDir, violations) {
  mkdirSync(ARCHIVE_DIR, { recursive: true });
  const moved = [];
  for (const v of violations) {
    const src = join(metaDir, v);
    const dst = join(ARCHIVE_DIR, v);
    renameSync(src, dst);
    moved.push({ from: relative(REPO_ROOT, src), to: relative(REPO_ROOT, dst) });
  }
  return moved;
}

function main() {
  if (!JSON_OUT) {
    console.log(`\n${C.bold}── Drizzle Meta Hygiene Check ──${C.reset}`);
    console.log(`   ${META_DIR}\n`);
  }

  const result = check(META_DIR);

  if (!result.exists) {
    const out = { status: 'skip', reason: 'drizzle/meta directory not found', metaDir: META_DIR };
    if (JSON_OUT) { console.log(JSON.stringify(out, null, 2)); }
    else { console.log(`  ${C.yellow}SKIP${C.reset}  drizzle/meta not found at expected path`); }
    process.exit(0);
  }

  const report = {
    metaDir: relative(REPO_ROOT, META_DIR),
    totalFiles:  result.files.length,
    snapshots:   result.snapshots.length,
    hasJournal:  result.journal,
    violations:  result.violations,
    status:      result.violations.length === 0 ? 'pass' : 'fail',
    moved:       [],
  };

  if (!JSON_OUT) {
    console.log(`  Journal:   ${result.journal ? `${C.green}✓${C.reset}` : `${C.red}✗ missing${C.reset}`}`);
    console.log(`  Snapshots: ${result.snapshots.length}`);
    console.log(`  Violations (non-JSON files): ${result.violations.length === 0 ? `${C.green}none${C.reset}` : `${C.red}${result.violations.length}${C.reset}`}`);
    for (const v of result.violations) {
      console.log(`    ${C.red}✗${C.reset}  ${v}`);
    }
  }

  if (result.violations.length > 0) {
    if (FIX) {
      report.moved = applyFix(META_DIR, result.violations);
      report.status = 'fixed';
      if (!JSON_OUT) {
        console.log(`\n  ${C.green}Fixed:${C.reset} moved ${report.moved.length} file(s) to drizzle/meta/archived/`);
        for (const m of report.moved) console.log(`    ${C.gray}${m.from} → ${m.to}${C.reset}`);
      }
    } else if (!DRY_RUN) {
      if (!JSON_OUT) {
        console.log(`\n  ${C.yellow}Run with --fix to move violating files to drizzle/meta/archived/${C.reset}`);
        console.log(`  ${C.yellow}Or delete manually: each file listed above.${C.reset}`);
      }
    }
  }

  if (!JSON_OUT) {
    const statusStr = report.status === 'pass' ? `${C.green}PASS${C.reset}` : report.status === 'fixed' ? `${C.green}FIXED${C.reset}` : `${C.red}FAIL${C.reset}`;
    console.log(`\n  Status: ${statusStr}\n`);
  } else {
    console.log(JSON.stringify(report, null, 2));
  }

  process.exit(report.status === 'fail' ? 1 : 0);
}

main();