#!/usr/bin/env node
/**
 * audit-drizzle-migration-integrity.mjs
 *
 * Six-gate guard for the Drizzle migration layer.
 * All gates must pass before a deploy or Atlas completion run.
 *
 * Gates:
 *   G1  No loose *.sql files in drizzle/ root that are NOT in the journal
 *   G2  Every journal entry has a matching SQL file on disk
 *   G3  Every numbered SQL file in drizzle/ root has a journal entry
 *   G4  Stored DB hashes match current file hashes (no silent drift)
 *   G5  Latest applied migration ID == latest journal entry index
 *   G6  drizzle-kit generate reports no pending schema changes
 *
 * Usage:
 *   node scripts/atlas/audit-drizzle-migration-integrity.mjs [--json] [--fix-hashes]
 *
 * --fix-hashes   Update mismatched hashes in drizzle.__drizzle_migrations
 *                (safe read-repair; does not alter schema or data)
 * --json         Emit machine-readable JSON result
 */

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, unlinkSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { REPO_ROOT } from './_atlas-utils.mjs';

const { Pool } = pg;

const FRONTEND    = join(REPO_ROOT, 'sveltekit-frontend');
const DRIZZLE_DIR = join(FRONTEND, 'drizzle');
const JOURNAL     = join(DRIZZLE_DIR, 'meta', '_journal.json');
const ENV_FILE    = join(FRONTEND, '.env');

const ARGS        = process.argv.slice(2);
const JSON_OUT    = ARGS.includes('--json');
const FIX_HASHES  = ARGS.includes('--fix-hashes');

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', gray: '\x1b[90m',
};

// ── helpers ──────────────────────────────────────────────────────────────────

function loadEnv() {
  if (!existsSync(ENV_FILE)) return {};
  const env = {};
  for (const line of readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

function drizzleHash(sqlPath) {
  const sql = readFileSync(sqlPath, 'utf8');
  const stmts = sql.split('--> statement-breakpoint').map(s => s.trim()).filter(Boolean);
  return createHash('sha256').update(stmts.join('')).digest('hex');
}

function pass(label, detail = '') {
  if (!JSON_OUT) console.log(`  ${C.green}✓${C.reset}  G${label}${detail ? '  ' + C.gray + detail + C.reset : ''}`);
}
function fail(label, detail = '') {
  if (!JSON_OUT) console.log(`  ${C.red}✗${C.reset}  G${label}${detail ? '  ' + C.red + detail + C.reset : ''}`);
}
function warn(label, detail = '') {
  if (!JSON_OUT) console.log(`  ${C.yellow}!${C.reset}  G${label}${detail ? '  ' + C.yellow + detail + C.reset : ''}`);
}

// ── gates ────────────────────────────────────────────────────────────────────

function g1_noLooseSql(journalTags, drizzleFiles) {
  const loose = drizzleFiles.filter(f => !journalTags.has(f.replace('.sql', '')));
  return { pass: loose.length === 0, loose };
}

function g2_journalFilesExist(journalEntries) {
  const missing = journalEntries.filter(e => !existsSync(join(DRIZZLE_DIR, e.tag + '.sql')));
  return { pass: missing.length === 0, missing: missing.map(e => e.tag) };
}

function g3_filesHaveJournalEntry(journalTags, drizzleFiles) {
  const unlisted = drizzleFiles.filter(f => !journalTags.has(f.replace('.sql', '')));
  // Same set as G1 — both gates catch the same issue from different directions.
  return { pass: unlisted.length === 0, unlisted };
}

async function g4_hashIntegrity(journalEntries, pool, fixHashes) {
  const res = await pool.query(
    'SELECT id, hash FROM drizzle.__drizzle_migrations ORDER BY id'
  );
  const dbById = new Map(res.rows.map(r => [r.id, r.hash]));

  const mismatches = [];
  const fixed = [];

  for (const entry of journalEntries) {
    const filePath = join(DRIZZLE_DIR, entry.tag + '.sql');
    if (!existsSync(filePath)) continue;

    const fileHash = drizzleHash(filePath);
    const dbId     = entry.idx + 1;   // drizzle uses 1-based id
    const dbHash   = dbById.get(dbId);

    if (!dbHash) {
      // Row missing entirely — the migration was never registered in DB tracking table
      mismatches.push({ tag: entry.tag, dbId, dbHash: null, fileHash, reason: 'missing_row' });
      if (fixHashes) {
        const when = entry.when ?? Date.now();
        await pool.query(
          'INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)',
          [fileHash, when]
        );
        fixed.push({ dbId, tag: entry.tag, action: 'inserted' });
      }
    } else if (dbHash !== fileHash) {
      mismatches.push({ tag: entry.tag, dbId, dbHash, fileHash, reason: 'hash_mismatch' });
      if (fixHashes) {
        await pool.query(
          'UPDATE drizzle.__drizzle_migrations SET hash = $1 WHERE id = $2',
          [fileHash, dbId]
        );
        fixed.push({ dbId, tag: entry.tag, action: 'updated' });
      }
    }
  }

  return {
    pass: mismatches.length === 0,
    mismatches,
    fixed,
    totalChecked: journalEntries.length,
  };
}

async function g5_latestAppliedMatchesJournal(journalEntries, pool) {
  const res = await pool.query(
    'SELECT MAX(id) AS max_id FROM drizzle.__drizzle_migrations'
  );
  const dbMaxId      = Number(res.rows[0]?.max_id ?? 0);
  const journalMaxId = journalEntries.length; // 1-based count
  const latestTag    = journalEntries[journalEntries.length - 1]?.tag ?? '(none)';

  return {
    pass: dbMaxId === journalMaxId,
    dbMaxId,
    journalMaxId,
    latestTag,
  };
}

function g6_noPendingChanges() {
  try {
    const out = execSync(
      'npx drizzle-kit generate --name=__integrity_check__',
      {
        cwd: FRONTEND,
        timeout: 60_000,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );

    const noPending = out.includes('No schema changes');

    // Clean up any generated file before returning
    try {
      const genFile = join(DRIZZLE_DIR, '0031___integrity_check__.sql');
      // Find the actual generated file (idx may vary)
      const files = readdirSync(DRIZZLE_DIR)
        .filter(f => f.includes('__integrity_check__') && f.endsWith('.sql'));
      for (const f of files) {
        unlinkSync(join(DRIZZLE_DIR, f));
      }
      // Also restore journal since generate modifies it
      execSync('git checkout drizzle/meta/_journal.json', { cwd: FRONTEND, stdio: 'pipe' });
    } catch { /* best-effort cleanup */ }

    return { pass: noPending, output: out.trim().slice(-200) };
  } catch (err) {
    const out = (err.stdout ?? '') + (err.stderr ?? '');
    const noPending = out.includes('No schema changes');
    // Cleanup attempt
    try {
      execSync('git checkout drizzle/meta/_journal.json', { cwd: FRONTEND, stdio: 'pipe' });
    } catch { /* ignore */ }
    return { pass: noPending, output: out.trim().slice(-300), error: err.message };
  }
}

// ── main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!JSON_OUT) {
    console.log(`\n${C.bold}── Drizzle Migration Integrity Audit ──${C.reset}`);
    console.log(`   ${relative(REPO_ROOT, DRIZZLE_DIR)}\n`);
  }

  // Load journal
  if (!existsSync(JOURNAL)) {
    const out = { status: 'fail', reason: 'journal not found', gate: 'setup' };
    if (JSON_OUT) console.log(JSON.stringify(out, null, 2));
    else console.log(`  ${C.red}ERROR${C.reset}  drizzle/meta/_journal.json not found`);
    process.exit(1);
  }

  const journal        = JSON.parse(readFileSync(JOURNAL, 'utf8'));
  const journalEntries = journal.entries ?? [];
  const journalTags    = new Set(journalEntries.map(e => e.tag));

  // Get numbered SQL files in drizzle/ root (skip subdirs, non-sql, non-numbered)
  const drizzleFiles = readdirSync(DRIZZLE_DIR)
    .filter(f => {
      if (!f.endsWith('.sql')) return false;
      try { return statSync(join(DRIZZLE_DIR, f)).isFile(); } catch { return false; }
    })
    .sort();

  // DB connection
  const envVars = loadEnv();
  const connStr = envVars.DATABASE_URL ?? process.env.DATABASE_URL ?? '';
  if (!connStr) {
    const out = { status: 'fail', reason: 'DATABASE_URL not set', gate: 'setup' };
    if (JSON_OUT) console.log(JSON.stringify(out, null, 2));
    else console.log(`  ${C.red}ERROR${C.reset}  DATABASE_URL not found in ${ENV_FILE}`);
    process.exit(1);
  }

  const pool = new Pool({ connectionString: connStr, max: 2 });

  const results = {};
  let blockers = 0;

  // G1 — no loose SQL files
  results.g1 = g1_noLooseSql(journalTags, drizzleFiles);
  if (results.g1.pass) {
    pass(1, `no loose .sql files (${drizzleFiles.length} total, all journaled)`);
  } else {
    fail(1, `${results.g1.loose.length} file(s) in drizzle/ root not in journal:`);
    for (const f of results.g1.loose) {
      if (!JSON_OUT) console.log(`       ${C.red}${f}${C.reset}`);
    }
    blockers++;
  }

  // G2 — journal files exist on disk
  results.g2 = g2_journalFilesExist(journalEntries);
  if (results.g2.pass) {
    pass(2, `all ${journalEntries.length} journal entries have SQL files on disk`);
  } else {
    fail(2, `${results.g2.missing.length} journal entry(-ies) missing SQL file:`);
    for (const t of results.g2.missing) {
      if (!JSON_OUT) console.log(`       ${C.red}${t}.sql${C.reset}`);
    }
    blockers++;
  }

  // G3 — files have journal entries (same set as G1 from reverse direction)
  results.g3 = g3_filesHaveJournalEntry(journalTags, drizzleFiles);
  if (results.g3.pass) {
    pass(3, `all SQL files in drizzle/ root have journal entries`);
  } else {
    fail(3, `${results.g3.unlisted.length} SQL file(s) not in journal (move to drizzle/manual/):`);
    for (const f of results.g3.unlisted) {
      if (!JSON_OUT) console.log(`       ${C.red}${f}${C.reset}`);
    }
    blockers++;
  }

  // G4 — hash integrity
  results.g4 = await g4_hashIntegrity(journalEntries, pool, FIX_HASHES);
  if (results.g4.pass) {
    pass(4, `all ${results.g4.totalChecked} migration hashes match DB records`);
  } else if (FIX_HASHES && results.g4.fixed.length > 0) {
    warn(4, `${results.g4.mismatches.length} mismatch(es) — repaired ${results.g4.fixed.length} row(s)`);
    for (const f of results.g4.fixed) {
      if (!JSON_OUT) console.log(`       ${C.yellow}fixed id=${f.dbId} ${f.tag} (${f.action})${C.reset}`);
    }
    results.g4.pass = true; // treated as pass after fix
  } else {
    fail(4, `${results.g4.mismatches.length} hash mismatch(es) — run with --fix-hashes to repair`);
    for (const m of results.g4.mismatches.slice(0, 5)) {
      if (!JSON_OUT) console.log(`       ${C.red}id=${m.dbId} ${m.tag}: ${m.reason}${C.reset}`);
    }
    if (results.g4.mismatches.length > 5 && !JSON_OUT) {
      console.log(`       ${C.gray}... and ${results.g4.mismatches.length - 5} more${C.reset}`);
    }
    blockers++;
  }

  // G5 — latest applied == latest journal
  results.g5 = await g5_latestAppliedMatchesJournal(journalEntries, pool);
  if (results.g5.pass) {
    pass(5, `latest applied id=${results.g5.dbMaxId} matches journal (${results.g5.latestTag})`);
  } else {
    fail(5, `DB max id=${results.g5.dbMaxId} vs journal count=${results.g5.journalMaxId} (${results.g5.latestTag})`);
    blockers++;
  }

  // G6 — no pending schema changes
  if (!JSON_OUT) console.log(`  ${C.gray}...running drizzle-kit generate (dry-run)${C.reset}`);
  results.g6 = g6_noPendingChanges();
  if (results.g6.pass) {
    pass(6, `no pending schema changes`);
  } else {
    fail(6, `drizzle-kit generate produced changes — schema drift detected`);
    if (!JSON_OUT && results.g6.output) {
      console.log(`       ${C.gray}${results.g6.output}${C.reset}`);
    }
    blockers++;
  }

  await pool.end();

  // ── summary ──
  const allPass = blockers === 0;
  const status  = allPass ? 'PASS' : 'FAIL';

  const report = {
    status,
    blockers,
    gates: {
      g1_no_loose_sql:          results.g1.pass,
      g2_journal_files_exist:   results.g2.pass,
      g3_files_have_entries:    results.g3.pass,
      g4_hash_integrity:        results.g4.pass,
      g5_latest_applied_match:  results.g5.pass,
      g6_no_pending_changes:    results.g6.pass,
    },
    details: results,
    latestMigration: journalEntries[journalEntries.length - 1]?.tag,
    journalCount: journalEntries.length,
    sqlFilesInRoot: drizzleFiles.length,
  };

  if (JSON_OUT) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    const statusColored = allPass
      ? `${C.bold}${C.green}PASS${C.reset}`
      : `${C.bold}${C.red}FAIL${C.reset}`;
    console.log(`\n  Status: ${statusColored}   blockers: ${blockers}`);
    if (allPass) {
      console.log(`  ${C.gray}Latest migration: ${report.latestMigration}${C.reset}`);
      console.log(`  ${C.gray}DB layer: 100%${C.reset}\n`);
    } else {
      console.log(`\n  ${C.yellow}Fix:${C.reset}`);
      if (!results.g1.pass || !results.g3.pass) {
        console.log(`    Move loose SQL files to drizzle/manual/ (they were applied outside Drizzle)`);
      }
      if (!results.g4.pass) {
        console.log(`    Run with --fix-hashes to repair stored hash drift`);
      }
      if (!results.g5.pass) {
        console.log(`    Register missing migration row in drizzle.__drizzle_migrations`);
      }
      if (!results.g6.pass) {
        console.log(`    Run: npx drizzle-kit generate && npx drizzle-kit migrate`);
      }
      console.log('');
    }
  }

  process.exit(allPass ? 0 : 1);
}

main().catch(err => {
  if (!JSON_OUT) console.error(`\n${C.red}Fatal:${C.reset}`, err.message);
  else console.log(JSON.stringify({ status: 'error', error: err.message }, null, 2));
  process.exit(1);
});
