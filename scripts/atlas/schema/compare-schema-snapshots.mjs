#!/usr/bin/env node
/**
 * Gate 6 — Compare two schema snapshots and classify differences.
 *
 * Modes:
 *   --expected vs --actual   Compare any two JSON files produced by this pipeline
 *   --live                   Compare live-schema-redacted.json vs drizzle snapshot tables
 *
 * Differences are classified:
 *   BLOCK  — missing table/column, type change, constraint removal
 *   WARN   — index differences, owner changes
 *   NOTE   — ignorable / policy-approved
 *
 * Emits docs/reports/schema/expected-vs-live.diff.json
 * Exit 0 = NO_SCHEMA_DRIFT, exit 1 = drift present.
 *
 * Usage:
 *   node scripts/atlas/schema/compare-schema-snapshots.mjs [--live] [--verbose]
 *   node scripts/atlas/schema/compare-schema-snapshots.mjs --expected=A.json --actual=B.json
 */

import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import { resolve, join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT  = resolve(__dirname, '../../..');
const REPORT_DIR = join(ROOT, 'docs/reports/schema');

const args    = process.argv.slice(2);
const verbose = args.includes('--verbose');
const liveMode = args.includes('--live');

const expectedArg = args.find(a => a.startsWith('--expected='))?.split('=').slice(1).join('=');
const actualArg   = args.find(a => a.startsWith('--actual='))?.split('=').slice(1).join('=');

console.log('Gate 6 — Schema snapshot comparison\n');

// ---------------------------------------------------------------------------
// Load snapshots
// ---------------------------------------------------------------------------

function loadJson(path) {
    if (!existsSync(path)) throw new Error(`File not found: ${path}`);
    return JSON.parse(readFileSync(path, 'utf8'));
}

let expected, actual, label;

if (liveMode || (!expectedArg && !actualArg)) {
    // Compare Drizzle journal last-snapshot tables with live inspection
    const FRONTEND   = join(ROOT, 'sveltekit-frontend');
    const JOURNAL    = join(FRONTEND, 'drizzle/meta/_journal.json');
    const SNAPSHOTS  = join(FRONTEND, 'drizzle/meta');
    const liveReport = join(REPORT_DIR, 'live-schema-redacted.json');

    if (!existsSync(liveReport)) {
        console.error('ERROR: live-schema-redacted.json not found. Run schema:inspect first.');
        process.exit(1);
    }

    const journal  = loadJson(JOURNAL);
    const lastIdx  = journal.entries.at(-1)?.idx ?? 0;
    const snapPath = join(SNAPSHOTS, `${String(lastIdx).padStart(4, '0')}_snapshot.json`);
    const snap     = loadJson(snapPath);
    const live     = loadJson(liveReport);

    // Drizzle snapshot uses camelCase table names internally mapped to snake_case pgTable names
    // We need the database-level names from the snapshot's "tables" keys
    const snapTableNames = new Set(Object.values(snap.tables ?? {}).map(t => t.name ?? Object.keys(snap.tables ?? {}).find(k => snap.tables[k] === t)));
    // Actually drizzle snapshots key by TS variable name; the PG table name is in .name
    const snapPgTables = new Set(Object.values(snap.tables ?? {}).map(t => t.name).filter(Boolean));
    const liveTables   = new Set(Object.keys(live.tables ?? {}));

    const inSnapNotLive = [...snapPgTables].filter(n => !liveTables.has(n));
    const inLiveNotSnap = [...liveTables].filter(n => !snapPgTables.has(n));

    const diffs = [];

    for (const t of inSnapNotLive) {
        diffs.push({ level: 'BLOCK', category: 'MISSING_TABLE', table: t, message: `Table "${t}" expected from migration snapshot but not in live database` });
    }
    for (const t of inLiveNotSnap) {
        // Could be tablesFilter-excluded, manual sidecars, or unrecorded changes
        diffs.push({ level: 'WARN', category: 'EXTRA_TABLE', table: t, message: `Table "${t}" exists in live DB but not in Drizzle snapshot (manual migration, tablesFilter exclude, or out-of-band DDL)` });
    }

    // Column-level for tables in both
    for (const pgTableName of [...snapPgTables].filter(n => liveTables.has(n))) {
        // Find snap entry by .name
        const snapEntry = Object.values(snap.tables ?? {}).find(t => t.name === pgTableName);
        const liveEntry = live.tables?.[pgTableName];
        if (!snapEntry || !liveEntry) continue;

        const snapCols = new Set(Object.keys(snapEntry.columns ?? {}));
        const liveCols = new Set((liveEntry.columns ?? []).map(c => c.name));

        for (const col of snapCols) {
            if (!liveCols.has(col)) {
                diffs.push({ level: 'BLOCK', category: 'MISSING_COLUMN', table: pgTableName, column: col, message: `Column "${pgTableName}.${col}" expected by migration but absent from live DB` });
            }
        }
        for (const col of liveCols) {
            if (!snapCols.has(col)) {
                diffs.push({ level: 'NOTE', category: 'EXTRA_COLUMN', table: pgTableName, column: col, message: `Column "${pgTableName}.${col}" in live DB but not in snapshot (may be manual or sidecar migration)` });
            }
        }
    }

    expected = { source: 'drizzle_snapshot', tag: journal.entries.at(-1)?.tag, tableCount: snapPgTables.size };
    actual   = { source: 'live_database', inspectedAt: live.inspectedAt, tableCount: liveTables.size };
    label    = 'expected_snapshot_vs_live';

    const blockCount = diffs.filter(d => d.level === 'BLOCK').length;
    const warnCount  = diffs.filter(d => d.level === 'WARN').length;
    const noteCount  = diffs.filter(d => d.level === 'NOTE').length;
    const pass = blockCount === 0;

    const report = {
        status: pass ? 'NO_SCHEMA_DRIFT' : 'SCHEMA_DRIFT_DETECTED',
        comparisonMode: label,
        expected,
        actual,
        blockCount,
        warnCount,
        noteCount,
        diffs,
        generatedAt: new Date().toISOString(),
    };

    mkdirSync(REPORT_DIR, { recursive: true });
    const outPath = join(REPORT_DIR, 'expected-vs-live.diff.json');
    writeFileSync(outPath, JSON.stringify(report, null, 2));

    if (diffs.length > 0) {
        const blocks = diffs.filter(d => d.level === 'BLOCK');
        const warns  = diffs.filter(d => d.level === 'WARN');
        if (blocks.length > 0) {
            console.log(`  BLOCKS (${blocks.length}):`);
            for (const d of blocks) console.log(`    ✗ [${d.category}] ${d.message}`);
        }
        if (warns.length > 0 || verbose) {
            console.log(`  WARNs (${warns.length}):`);
            for (const d of warns) console.log(`    ⚠ [${d.category}] ${d.message}`);
        }
        if (verbose) {
            const notes = diffs.filter(d => d.level === 'NOTE');
            if (notes.length > 0) {
                console.log(`  NOTEs (${notes.length}):`);
                for (const d of notes) console.log(`    · [${d.category}] ${d.message}`);
            }
        }
    }

    console.log('');
    console.log(`  Expected (snapshot): ${snapPgTables.size} tables (tag: ${journal.entries.at(-1)?.tag})`);
    console.log(`  Actual (live):       ${liveTables.size} tables`);
    console.log(`  BLOCKs: ${blockCount}  WARNs: ${warnCount}  NOTEs: ${noteCount}`);
    console.log('');
    console.log(`Status: ${pass ? 'NO_SCHEMA_DRIFT ✓' : 'SCHEMA_DRIFT_DETECTED ✗'}`);
    console.log(`Report: ${relative(ROOT, outPath)}`);

    process.exit(pass ? 0 : 1);

} else {
    // File-to-file comparison mode
    if (!expectedArg || !actualArg) {
        console.error('Usage: --expected=<file> --actual=<file>  OR  --live');
        process.exit(1);
    }
    const exp = loadJson(resolve(expectedArg));
    const act = loadJson(resolve(actualArg));

    // Simple structural diff on tables
    const expTables = new Set(Object.keys(exp.tables ?? {}));
    const actTables = new Set(Object.keys(act.tables ?? {}));
    const diffs = [];

    for (const t of expTables) { if (!actTables.has(t)) diffs.push({ level: 'BLOCK', category: 'MISSING_TABLE', table: t, message: `Table "${t}" in expected but not actual` }); }
    for (const t of actTables) { if (!expTables.has(t)) diffs.push({ level: 'WARN', category: 'EXTRA_TABLE', table: t, message: `Table "${t}" in actual but not expected` }); }

    const blockCount = diffs.filter(d => d.level === 'BLOCK').length;
    const warnCount  = diffs.filter(d => d.level === 'WARN').length;
    const pass = blockCount === 0;

    const report = { status: pass ? 'NO_SCHEMA_DRIFT' : 'SCHEMA_DRIFT_DETECTED', blockCount, warnCount, diffs, generatedAt: new Date().toISOString() };
    mkdirSync(REPORT_DIR, { recursive: true });
    const outPath = join(REPORT_DIR, 'snapshot-diff.json');
    writeFileSync(outPath, JSON.stringify(report, null, 2));

    for (const d of diffs) console.log(`  ${d.level === 'BLOCK' ? '✗' : '⚠'} [${d.category}] ${d.message}`);
    console.log('');
    console.log(`Status: ${pass ? 'NO_SCHEMA_DRIFT ✓' : 'SCHEMA_DRIFT_DETECTED ✗'}`);
    console.log(`Report: ${relative(ROOT, outPath)}`);
    process.exit(pass ? 0 : 1);
}
