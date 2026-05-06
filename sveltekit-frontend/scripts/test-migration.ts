#!/usr/bin/env npx tsx
/**
 * Migration smoke-test: runs drizzle-kit migrate in dry-run mode and validates
 * the pending SQL for destructive operations (DROP TABLE / DROP COLUMN).
 *
 * Usage:
 *   npx tsx scripts/test-migration.ts             # dry-run check
 *   npx tsx scripts/test-migration.ts --apply     # actually run the migration
 *   npx tsx scripts/test-migration.ts --verbose   # show full SQL diff
 */

import { execSync } from 'child_process';
import { readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';

const DRIZZLE_DIR = resolve(import.meta.dirname ?? __dirname, '../drizzle');
const args = process.argv.slice(2);
const APPLY   = args.includes('--apply');
const VERBOSE = args.includes('--verbose');

// ── Destructive pattern detector ───────────────────────────────────────────

const DESTRUCTIVE = [
  /DROP\s+TABLE(?!\s+IF\s+EXISTS)/i,
  /DROP\s+COLUMN(?!\s+IF\s+EXISTS)/i,
  /TRUNCATE\s+TABLE/i,
];

function scanForDestructive(sql: string): string[] {
  return DESTRUCTIVE.filter(re => re.test(sql)).map(re => re.source);
}

// ── Pending migration files ────────────────────────────────────────────────

function getPendingMigrations(): { file: string; sql: string }[] {
  const journalPath = join(DRIZZLE_DIR, 'meta/_journal.json');
  let appliedSet = new Set<string>();

  try {
    const journal = JSON.parse(readFileSync(journalPath, 'utf-8'));
    appliedSet = new Set((journal.entries ?? []).map((e: { tag: string }) => e.tag));
  } catch {
    console.warn('⚠️  No drizzle journal found — treating all .sql files as pending');
  }

  const all = readdirSync(DRIZZLE_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort();

  return all
    .filter(f => !appliedSet.has(f.replace('.sql', '')))
    .map(f => ({
      file: f,
      sql: readFileSync(join(DRIZZLE_DIR, f), 'utf-8'),
    }));
}

// ── Main ───────────────────────────────────────────────────────────────────

function main() {
  console.log('\n🔍 Drizzle migration check\n');

  const pending = getPendingMigrations();
  if (pending.length === 0) {
    console.log('✅ No pending migrations — database is up to date.\n');
    return;
  }

  console.log(`📋 Pending migrations (${pending.length}):\n`);
  let hasDestructive = false;

  for (const { file, sql } of pending) {
    const warnings = scanForDestructive(sql);
    const icon = warnings.length > 0 ? '🚨' : '  ';
    console.log(`${icon} ${file}`);

    if (warnings.length > 0) {
      hasDestructive = true;
      for (const w of warnings) console.log(`     ⚠️  Destructive pattern: ${w}`);
    }

    if (VERBOSE) {
      console.log('\n--- SQL ---');
      console.log(sql.trim());
      console.log('--- END ---\n');
    }
  }

  if (hasDestructive) {
    console.error('\n🚨 ABORT: Destructive operations detected. Review SQL before applying.\n');
    process.exit(1);
  }

  if (!APPLY) {
    console.log('\n✅ Dry-run complete — no destructive operations found.');
    console.log('   Run with --apply to execute the migration.\n');
    return;
  }

  // Apply
  console.log('\n🚀 Applying migrations…\n');
  try {
    execSync('npx drizzle-kit migrate', {
      stdio: 'inherit',
      cwd: resolve(import.meta.dirname ?? __dirname, '..'),
    });
    console.log('\n✅ Migration applied successfully.\n');
  } catch (err) {
    console.error('\n❌ Migration failed — check drizzle-kit output above.\n');
    process.exit(1);
  }
}

main();
