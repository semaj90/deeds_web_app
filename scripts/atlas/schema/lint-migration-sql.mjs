#!/usr/bin/env node
/**
 * Gate 7 — Migration safety lint.
 *
 * Scans every .sql file in drizzle/ for patterns that indicate:
 *   BLOCK  — destructive or lock-heavy operations requiring explicit review
 *   WARN   — operations that may be dangerous depending on table size
 *   NOTE   — informational flags (e.g. full-text index that holds AccessShareLock)
 *
 * Emits docs/reports/schema/migration-safety-report.json.
 * Exit 0 = no BLOCKs found, exit 1 = BLOCKs present.
 *
 * Usage:
 *   node scripts/atlas/schema/lint-migration-sql.mjs [--verbose] [--only=<tag>]
 */

import { readFileSync, readdirSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import { resolve, join, dirname, relative, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '../../..');
const FRONTEND  = join(ROOT, 'sveltekit-frontend');
const DRIZZLE   = join(FRONTEND, 'drizzle');
const MANUAL    = join(FRONTEND, 'drizzle/manual');
const REPORT_DIR = join(ROOT, 'docs/reports/schema');

const args    = process.argv.slice(2);
const verbose = args.includes('--verbose');
const onlyTag = args.find(a => a.startsWith('--only='))?.split('=')[1];

// ---------------------------------------------------------------------------
// Lint rules
// ---------------------------------------------------------------------------

const RULES = [
    // BLOCK — destructive
    { id: 'DROP_TABLE',     level: 'BLOCK', pattern: /\bDROP\s+TABLE\b/i,   message: 'Drops a table — all data lost' },
    { id: 'DROP_COLUMN',    level: 'BLOCK', pattern: /\bDROP\s+COLUMN\b/i,  message: 'Drops a column — data loss' },
    { id: 'DROP_SCHEMA',    level: 'BLOCK', pattern: /\bDROP\s+SCHEMA\b/i,  message: 'Drops entire schema' },
    { id: 'TRUNCATE',       level: 'BLOCK', pattern: /\bTRUNCATE\b/i,       message: 'Truncates table — all rows deleted' },
    { id: 'TYPE_NARROWING', level: 'BLOCK', pattern: /ALTER\s+COLUMN\s+\S+\s+TYPE\s+(int|smallint|char\(\d+\))/i, message: 'Type narrowing may cause data loss' },
    { id: 'NO_CASCADE_FK',  level: 'BLOCK', pattern: /REFERENCES\s+\S+\s*\([^)]+\)\s*(?!ON\s+(DELETE|UPDATE))/i, message: 'FK without explicit ON DELETE/UPDATE (use NO ACTION or CASCADE deliberately)' },

    // BLOCK — lock heavy
    { id: 'ADD_NOT_NULL',   level: 'BLOCK', pattern: /ALTER\s+COLUMN\s+\S+\s+SET\s+NOT\s+NULL/i, message: 'SET NOT NULL does full-table scan; add check constraint + backfill first' },
    { id: 'VALIDATE_CONSTRAINT', level: 'WARN', pattern: /VALIDATE\s+CONSTRAINT/i, message: 'VALIDATE CONSTRAINT scans the full table; do during low-traffic window' },
    { id: 'CREATE_INDEX_NO_CONCURRENT', level: 'WARN', pattern: /CREATE\s+(?!UNIQUE\s+)?INDEX\s+(?!CONCURRENTLY\b)/i, message: 'Non-CONCURRENT index creation holds AccessShareLock — prefer CREATE INDEX CONCURRENTLY' },
    { id: 'CREATE_UNIQUE_NO_CONCURRENT', level: 'WARN', pattern: /CREATE\s+UNIQUE\s+INDEX\s+(?!CONCURRENTLY\b)/i, message: 'Non-CONCURRENT unique index holds AccessShareLock' },
    { id: 'FULL_TABLE_REWRITE', level: 'BLOCK', pattern: /ALTER\s+TABLE\s+\S+\s+ALTER\s+COLUMN\s+\S+\s+TYPE/i, message: 'Column type change may cause full table rewrite with AccessExclusiveLock' },

    // WARN — potentially unsafe
    { id: 'UNBOUNDED_UPDATE', level: 'WARN', pattern: /UPDATE\s+\S+\s+SET\s+[^;]+(?!WHERE)/i, message: 'UPDATE without WHERE clause — check if intentional full-table update' },
    { id: 'DROP_INDEX',     level: 'WARN', pattern: /DROP\s+INDEX\s+(?!CONCURRENTLY\b)/i, message: 'DROP INDEX without CONCURRENTLY holds AccessExclusiveLock; prefer DROP INDEX CONCURRENTLY' },
    { id: 'ADD_COLUMN_DEFAULT_VOLATILE', level: 'WARN', pattern: /ADD\s+COLUMN\s+\S+\s+[^\s]+\s+(?:NOT\s+NULL\s+)?DEFAULT\s+(now\(\)|CURRENT_TIMESTAMP|random\(\))/i, message: 'ADD COLUMN with volatile default may cause table rewrite in older PG' },
    { id: 'RENAME_TABLE',   level: 'WARN', pattern: /RENAME\s+TO\b/i,       message: 'Table/column rename: verify all FK references and views are updated' },
    { id: 'DROP_ENUM',      level: 'BLOCK', pattern: /DROP\s+TYPE\b/i,       message: 'DROP TYPE (enum) — all columns using this type must be migrated first' },

    // NOTE
    { id: 'LOCK_TABLE',     level: 'NOTE', pattern: /LOCK\s+TABLE/i,         message: 'Explicit LOCK TABLE statement' },
    { id: 'IF_NOT_EXISTS',  level: 'NOTE', pattern: /IF\s+NOT\s+EXISTS/i,    message: 'Idempotent guard (good practice)' },
];

// ---------------------------------------------------------------------------
// Scan files
// ---------------------------------------------------------------------------

function getMigrationFiles() {
    const files = [];
    for (const dir of [DRIZZLE, MANUAL]) {
        if (!existsSync(dir)) continue;
        for (const f of readdirSync(dir)) {
            if (!f.endsWith('.sql')) continue;
            if (onlyTag && !f.includes(onlyTag)) continue;
            files.push({ path: join(dir, f), name: f, dir: relative(FRONTEND, dir) });
        }
    }
    return files.sort((a, b) => a.name.localeCompare(b.name));
}

const files = getMigrationFiles();
console.log(`Gate 7 — Migration SQL safety lint`);
console.log(`  Scanning ${files.length} SQL files\n`);

const findings = [];
let blockCount = 0, warnCount = 0, noteCount = 0;

for (const { path, name, dir } of files) {
    const sql = readFileSync(path, 'utf8');
    const lines = sql.split('\n');
    const fileFindigs = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Skip comment lines
        if (line.trim().startsWith('--') || line.trim().startsWith('/*')) continue;

        for (const rule of RULES) {
            if (rule.pattern.test(line)) {
                // Deduplicate same rule in same file
                if (fileFindigs.some(f => f.ruleId === rule.id)) continue;
                fileFindigs.push({
                    ruleId: rule.id,
                    level: rule.level,
                    message: rule.message,
                    line: i + 1,
                    snippet: line.trim().slice(0, 120),
                });
            }
        }
    }

    if (fileFindigs.length > 0) {
        findings.push({ file: join(dir, name), findings: fileFindigs });
        blockCount += fileFindigs.filter(f => f.level === 'BLOCK').length;
        warnCount  += fileFindigs.filter(f => f.level === 'WARN').length;
        noteCount  += fileFindigs.filter(f => f.level === 'NOTE').length;
    }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const pass = blockCount === 0;

const report = {
    status: pass ? 'MIGRATION_SAFETY_VERIFIED' : 'MIGRATION_SAFETY_BLOCKED',
    fileCount: files.length,
    blockCount,
    warnCount,
    noteCount,
    findings,
    generatedAt: new Date().toISOString(),
};

mkdirSync(REPORT_DIR, { recursive: true });
const outPath = join(REPORT_DIR, 'migration-safety-report.json');
writeFileSync(outPath, JSON.stringify(report, null, 2));

// Print
for (const { file, findings: ff } of findings) {
    const hasBlock = ff.some(f => f.level === 'BLOCK');
    if (!verbose && !hasBlock) continue;
    console.log(`  ${file}`);
    for (const f of ff) {
        const sym = f.level === 'BLOCK' ? '✗' : f.level === 'WARN' ? '⚠' : '·';
        console.log(`    ${sym} [${f.level}] ${f.ruleId} (line ${f.line}): ${f.message}`);
        if (verbose) console.log(`      → ${f.snippet}`);
    }
}

console.log('');
console.log(`  BLOCKs : ${blockCount}`);
console.log(`  WARNs  : ${warnCount}`);
console.log(`  NOTEs  : ${noteCount}`);
console.log('');
console.log(`Status: ${pass ? 'MIGRATION_SAFETY_VERIFIED ✓' : 'MIGRATION_SAFETY_BLOCKED ✗ — review BLOCKs before deploying'}`);
console.log(`Report: ${relative(ROOT, outPath)}`);

process.exit(pass ? 0 : 1);
