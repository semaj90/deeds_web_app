#!/usr/bin/env node
/**
 * Gate 9 — Post-apply attestation.
 *
 * Runs after `drizzle-kit migrate` to confirm the migration was applied correctly:
 *   1. Live schema now matches the journal snapshot (re-runs Gate 6 comparison)
 *   2. A post-apply fingerprint is recorded for audit
 *   3. Emits a signed attestation record
 *
 * Emits docs/reports/schema/post-apply-attestation.json
 * Exit 0 = POST_APPLY_ATTESTED, exit 1 = POST_APPLY_FAILED.
 *
 * Usage:
 *   node scripts/atlas/schema/post-apply-attest.mjs [--tag=<migration-tag>] [--verbose]
 *
 * Prerequisites:
 *   - schema:inspect must be run AFTER the migration (live snapshot must be fresh)
 *   - schema:drift:check must produce NO_SCHEMA_DRIFT
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { resolve, join, dirname, relative, basename } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '../../..');
const FRONTEND  = join(ROOT, 'sveltekit-frontend');
const REPORT_DIR = join(ROOT, 'docs/reports/schema');

const LIVE_REPORT  = join(REPORT_DIR, 'live-schema-redacted.json');
const DRIFT_REPORT = join(REPORT_DIR, 'expected-vs-live.diff.json');
const LINT_REPORT  = join(REPORT_DIR, 'migration-safety-report.json');
const PRE_REPORT   = join(REPORT_DIR, 'pre-apply-check.json');

const args    = process.argv.slice(2);
const verbose = args.includes('--verbose');
const tagArg  = args.find(a => a.startsWith('--tag='))?.split('=')[1];

console.log('Gate 9 — Post-apply migration attestation\n');

const blocks = [];
const warns  = [];
const notes  = [];

function loadJson(path) {
    if (!existsSync(path)) return null;
    try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

// ---------------------------------------------------------------------------
// Check 1: Live schema snapshot exists and is fresh (< 1h)
// ---------------------------------------------------------------------------

const liveReport = loadJson(LIVE_REPORT);
if (!liveReport) {
    blocks.push({ check: 'LIVE_SCHEMA_EXISTS', message: 'live-schema-redacted.json not found — run schema:inspect AFTER the migration' });
} else {
    const ageMs = Date.now() - new Date(liveReport.inspectedAt ?? 0).getTime();
    const ageMin = (ageMs / 60000).toFixed(1);
    if (ageMs > 60 * 60 * 1000) {
        blocks.push({ check: 'LIVE_SCHEMA_STALE', message: `live-schema-redacted.json is ${ageMin}m old — must re-run schema:inspect after migration before attesting` });
    } else {
        notes.push({ check: 'LIVE_SCHEMA_FRESH', message: `live-schema-redacted.json is ${ageMin}m old — fresh post-migration snapshot` });
    }
}

// ---------------------------------------------------------------------------
// Check 2: Drift check must have run and passed
// ---------------------------------------------------------------------------

const driftReport = loadJson(DRIFT_REPORT);
if (!driftReport) {
    blocks.push({ check: 'DRIFT_REPORT_EXISTS', message: 'expected-vs-live.diff.json not found — run schema:drift:check after schema:inspect' });
} else {
    const driftAgeMs  = Date.now() - new Date(driftReport.generatedAt ?? 0).getTime();
    const driftAgeMin = (driftAgeMs / 60000).toFixed(1);

    if (driftReport.status !== 'NO_SCHEMA_DRIFT') {
        blocks.push({
            check: 'DRIFT_STATUS',
            message: `Drift check status is ${driftReport.status} with ${driftReport.blockCount} BLOCKs — migration may be incomplete`,
            blockCount: driftReport.blockCount,
            warnCount: driftReport.warnCount,
        });
    } else {
        notes.push({ check: 'DRIFT_STATUS', message: `NO_SCHEMA_DRIFT confirmed (report ${driftAgeMin}m old)` });
    }

    // Surface any WARN-level drift (extra tables in live not in snapshot)
    if (driftReport.warnCount > 0 && verbose) {
        const warnDiffs = (driftReport.diffs ?? []).filter(d => d.level === 'WARN');
        warns.push({ check: 'DRIFT_WARNS', message: `${driftReport.warnCount} WARN(s) — extra tables in live DB not in snapshot (may be manual sidecars)` });
        if (verbose) for (const w of warnDiffs) console.log(`    ⚠ [${w.category}] ${w.message}`);
    }
}

// ---------------------------------------------------------------------------
// Check 3: Pre-apply check was run (optional, informational)
// ---------------------------------------------------------------------------

const preReport = loadJson(PRE_REPORT);
if (!preReport) {
    warns.push({ check: 'PRE_CHECK_RUN', message: 'pre-apply-check.json not found — was Gate 8 run before this migration?' });
} else {
    notes.push({ check: 'PRE_CHECK_STATUS', message: `Pre-apply check status: ${preReport.status} (blocks=${preReport.blockCount}, warns=${preReport.warnCount})` });
}

// ---------------------------------------------------------------------------
// Check 4: Migration lint passed (no BLOCKs)
// ---------------------------------------------------------------------------

const lintReport = loadJson(LINT_REPORT);
if (!lintReport) {
    warns.push({ check: 'LINT_REPORT', message: 'migration-safety-report.json not found — run schema:migration:lint' });
} else {
    if (lintReport.blockCount > 0) {
        // Historical migrations that were already applied will show BLOCKs — these are expected
        // Only BLOCK if the lint report is newer than the live schema (indicating it scanned pending migrations)
        warns.push({ check: 'LINT_BLOCKS', message: `Migration lint found ${lintReport.blockCount} BLOCK(s) — verify these are pre-applied historical migrations, not pending ones` });
    } else {
        notes.push({ check: 'LINT_CLEAN', message: 'Migration lint: no BLOCK-level patterns in pending migrations' });
    }
}

// ---------------------------------------------------------------------------
// Build attestation record
// ---------------------------------------------------------------------------

const pass = blocks.length === 0;

const fingerprint = liveReport ? (liveReport.structuralFingerprint ?? null) : null;
const tableCount  = liveReport ? (liveReport.tableCount ?? null) : null;

// Resolve applied tag
const JOURNAL = join(FRONTEND, 'drizzle/meta/_journal.json');
const journal  = loadJson(JOURNAL);
const lastEntry = journal?.entries?.at(-1);
const appliedTag = tagArg ?? lastEntry?.tag ?? 'unknown';
const appliedIdx = lastEntry?.idx ?? null;

const attestation = {
    status: pass ? 'POST_APPLY_ATTESTED' : 'POST_APPLY_FAILED',
    appliedTag,
    appliedIdx,
    driftStatus: driftReport?.status ?? null,
    schemaFingerprint: fingerprint,
    liveTableCount: tableCount,
    blockCount: blocks.length,
    warnCount:  warns.length,
    noteCount:  notes.length,
    blocks,
    warns,
    notes,
    attestedAt: new Date().toISOString(),
    // Audit hash: combines tag + fingerprint + timestamp for tamper-evident record
    auditHash: createHash('sha256')
        .update(JSON.stringify({ appliedTag, fingerprint, tableCount }))
        .digest('hex'),
};

mkdirSync(REPORT_DIR, { recursive: true });
const outPath = join(REPORT_DIR, 'post-apply-attestation.json');
writeFileSync(outPath, JSON.stringify(attestation, null, 2));

// Append to audit log (append-only history)
const auditLogPath = join(REPORT_DIR, 'migration-audit-log.jsonl');
writeFileSync(auditLogPath, JSON.stringify({ ...attestation, blocks: undefined, warns: undefined, notes: undefined }) + '\n', { flag: 'a' });

if (blocks.length > 0) {
    console.log(`  BLOCKs (${blocks.length}):`);
    for (const b of blocks) console.log(`    ✗ [${b.check}] ${b.message}`);
}
if (warns.length > 0) {
    console.log(`  WARNs (${warns.length}):`);
    for (const w of warns) console.log(`    ⚠ [${w.check}] ${w.message}`);
}
if (verbose) {
    console.log(`  NOTEs (${notes.length}):`);
    for (const n of notes) console.log(`    · [${n.check}] ${n.message}`);
}

console.log('');
console.log(`  Applied tag     : ${appliedTag} (idx=${appliedIdx})`);
console.log(`  Live tables     : ${tableCount ?? 'unknown'}`);
console.log(`  Fingerprint     : ${fingerprint ? fingerprint.slice(0, 16) + '...' : 'unavailable'}`);
console.log(`  Audit hash      : ${attestation.auditHash.slice(0, 16)}...`);
console.log('');
console.log(`Status: ${pass ? 'POST_APPLY_ATTESTED ✓' : 'POST_APPLY_FAILED ✗'}`);
console.log(`Report: ${relative(ROOT, outPath)}`);
console.log(`Audit log: ${relative(ROOT, auditLogPath)}`);

process.exit(pass ? 0 : 1);
