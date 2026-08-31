#!/usr/bin/env node
/**
 * Gate 8 — Pre-apply migration safety check.
 *
 * Runs before `drizzle-kit migrate` to confirm:
 *   1. No BLOCK-level issues in pending migration SQL (Gate 7 subset)
 *   2. The journal's next migration has a corresponding .sql file
 *   3. tablesFilter excludes all known DB-only tables (no surprise DROPs)
 *   4. A live-schema snapshot exists and is recent (< 24h) — drift check can run
 *
 * Emits docs/reports/schema/pre-apply-check.json
 * Exit 0 = PRE_APPLY_CLEAR, exit 1 = PRE_APPLY_BLOCKED.
 *
 * Usage:
 *   node scripts/atlas/schema/pre-apply-check.mjs [--tag=<migration-tag>] [--verbose]
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { resolve, join, dirname, relative, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '../../..');
const FRONTEND  = join(ROOT, 'sveltekit-frontend');
const DRIZZLE   = join(FRONTEND, 'drizzle');
const JOURNAL   = join(FRONTEND, 'drizzle/meta/_journal.json');
const SNAPSHOTS = join(FRONTEND, 'drizzle/meta');
const CONFIG    = join(FRONTEND, 'drizzle.config.ts');
const REPORT_DIR = join(ROOT, 'docs/reports/schema');
const LIVE_REPORT = join(REPORT_DIR, 'live-schema-redacted.json');

const args    = process.argv.slice(2);
const verbose = args.includes('--verbose');
const tagArg  = args.find(a => a.startsWith('--tag='))?.split('=')[1];

console.log('Gate 8 — Pre-apply migration safety check\n');

const blocks  = [];
const warns   = [];
const notes   = [];

function loadRepoEnv() {
    const merged = {};
    for (const path of [join(ROOT, '.env'), join(FRONTEND, '.env'), join(ROOT, '.env.local')]) {
        if (!existsSync(path)) continue;
        for (const line of readFileSync(path, 'utf8').split('\n')) {
            if (!line.includes('=') || line.trimStart().startsWith('#')) continue;
            const [keyPart, ...valueParts] = line.split('=');
            const key = keyPart.trim();
            const value = valueParts.join('=').trim().replace(/^['"]|['"]$/g, '');
            if (key && value && !merged[key]) merged[key] = value;
        }
    }
    return merged;
}

// A live database with schema objects but an empty Drizzle ledger cannot be
// safely migrated: replaying the journal may duplicate already-applied
// sidecars or historical DDL. This check is intentionally read-only.
async function checkMigrationLedgerReconciliation() {
    const repoEnv = loadRepoEnv();
    const databaseUrl = process.env.DATABASE_URL_MIGRATOR || process.env.DATABASE_URL || repoEnv.DATABASE_URL_MIGRATOR || repoEnv.DATABASE_URL;
    if (!databaseUrl) {
        blocks.push({ check: 'MIGRATION_LEDGER_CONNECTION', message: 'DATABASE_URL or DATABASE_URL_MIGRATOR is not set; live migration ledger cannot be verified' });
        return;
    }
    let pool;
    try {
        const pg = (await import('pg')).default;
        pool = new pg.Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 5000, statement_timeout: 5000 });
        const ledger = await pool.query('SELECT COUNT(*)::int AS count FROM drizzle.__drizzle_migrations');
        const live = await pool.query(`
            SELECT COUNT(*)::int AS count
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name IN ('graphify_files', 'atlas_callable_search', 'atlas_symbol_registry', 'kanban_tasks', 'feature_registry')
        `);
        const ledgerCount = Number(ledger.rows[0]?.count ?? 0);
        const liveCount = Number(live.rows[0]?.count ?? 0);
        if (ledgerCount === 0 && liveCount > 0) {
            blocks.push({
                check: 'MIGRATION_LEDGER_UNRECONCILED',
                message: `Drizzle ledger is empty while ${liveCount} known public schema objects exist; reconcile migration ownership before migrate`,
                details: { ledgerCount, liveKnownObjectCount: liveCount },
            });
        } else {
            notes.push({ check: 'MIGRATION_LEDGER_RECONCILED', message: `ledger rows=${ledgerCount}, known live objects=${liveCount}` });
        }
    } catch (error) {
        blocks.push({ check: 'MIGRATION_LEDGER_CONNECTION', message: `Could not verify live migration ledger: ${error instanceof Error ? error.message : String(error)}` });
    } finally {
        await pool?.end().catch(() => {});
    }
}

function loadJson(path) {
    if (!existsSync(path)) return null;
    try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

// ---------------------------------------------------------------------------
// Check 1: Journal integrity
// ---------------------------------------------------------------------------

const journal = loadJson(JOURNAL);
if (!journal) {
    blocks.push({ check: 'JOURNAL_EXISTS', message: 'drizzle/meta/_journal.json not found or unparseable' });
} else {
    const entries = journal.entries ?? [];
    const lastEntry = entries.at(-1);
    if (!lastEntry) {
        warns.push({ check: 'JOURNAL_ENTRIES', message: 'Journal has no entries — nothing to apply' });
    } else {
        const lastIdx  = lastEntry.idx ?? 0;
        const lastTag  = lastEntry.tag ?? '';
        const snapPath = join(SNAPSHOTS, `${String(lastIdx).padStart(4, '0')}_snapshot.json`);
        const idxPrefix = String(lastIdx).padStart(4, '0');
        // Journal tags commonly already contain the numeric prefix
        // (for example `0040_kanban_task_lifecycle`). Avoid constructing
        // the impossible `0040_0040_kanban_task_lifecycle.sql` path.
        const sqlCandidates = [
            join(DRIZZLE, `${lastTag}.sql`),
            join(DRIZZLE, `${idxPrefix}_${lastTag}.sql`),
        ];

        notes.push({ check: 'JOURNAL_LAST', message: `Last journal entry: idx=${lastIdx} tag=${lastTag}` });

        if (!existsSync(snapPath)) {
            blocks.push({ check: 'SNAPSHOT_EXISTS', message: `Missing snapshot for last journal entry: ${relative(FRONTEND, snapPath)}` });
        }
        if (!sqlCandidates.some(existsSync)) {
            warns.push({
                check: 'MIGRATION_SQL_EXISTS',
                message: `SQL file for last journal entry not found; checked ${sqlCandidates.map((candidate) => relative(FRONTEND, candidate)).join(' and ')} (may have been applied externally)`,
            });
        }

        // If --tag specified, verify it matches a real journal entry
        if (tagArg) {
            const tagEntry = entries.find(e => e.tag === tagArg);
            if (!tagEntry) {
                blocks.push({ check: 'TAG_IN_JOURNAL', message: `--tag="${tagArg}" not found in journal entries` });
            } else {
                notes.push({ check: 'TAG_FOUND', message: `Tag "${tagArg}" is journal entry idx=${tagEntry.idx}` });
            }
        }
    }
}

await checkMigrationLedgerReconciliation();

// ---------------------------------------------------------------------------
// Check 2: tablesFilter configured
// ---------------------------------------------------------------------------

if (!existsSync(CONFIG)) {
    warns.push({ check: 'DRIZZLE_CONFIG', message: 'drizzle.config.ts not found — cannot verify tablesFilter' });
} else {
    const configContent = readFileSync(CONFIG, 'utf8');
    const hasTablesFilter = configContent.includes('tablesFilter');
    if (!hasTablesFilter) {
        blocks.push({ check: 'TABLES_FILTER', message: 'drizzle.config.ts has no tablesFilter — applying migrations may DROP DB-only tables' });
    } else {
        // Count exclusion patterns
        const exclusions = (configContent.match(/['"]![^'"]+['"]/g) ?? []).length;
        notes.push({ check: 'TABLES_FILTER', message: `tablesFilter present with ~${exclusions} exclusion patterns` });

        // Check for known risky tables that should be excluded
        const protectedByConfig = (table) => {
            if (configContent.includes(`'!${table}'`) || configContent.includes(`"!${table}"`)) return true;
            const wildcardPrefixes = new Set([
                table.endsWith('_') ? table : `${table}_`,
                table.includes('_') ? `${table.split('_', 1)[0]}_` : table,
            ]);
            return [...wildcardPrefixes].some((prefix) =>
                configContent.includes(`'!${prefix}*'`) || configContent.includes(`"!${prefix}*"`));
        };
        const riskyTables = ['kg_nodes', 'kg_edges', 'phase89_', 'warden_', 'ace_chunks', 'embedded_summaries'];
        const missing = riskyTables.filter(t => !protectedByConfig(t));
        if (missing.length > 0) {
            warns.push({ check: 'TABLES_FILTER_RISKY', message: `tablesFilter may be missing protections for: ${missing.join(', ')}` });
        }
    }
}

// ---------------------------------------------------------------------------
// Check 3: Live schema freshness
// ---------------------------------------------------------------------------

if (!existsSync(LIVE_REPORT)) {
    warns.push({ check: 'LIVE_SCHEMA', message: 'live-schema-redacted.json not found — run schema:inspect before applying migrations (drift check unavailable)' });
} else {
    const liveReport = loadJson(LIVE_REPORT);
    if (!liveReport?.inspectedAt) {
        warns.push({ check: 'LIVE_SCHEMA_TIMESTAMP', message: 'live-schema-redacted.json has no inspectedAt timestamp' });
    } else {
        const ageMs = Date.now() - new Date(liveReport.inspectedAt).getTime();
        const ageH  = (ageMs / 3600000).toFixed(1);
        if (ageMs > 24 * 3600 * 1000) {
            warns.push({ check: 'LIVE_SCHEMA_STALE', message: `live-schema-redacted.json is ${ageH}h old — re-run schema:inspect for accurate drift check` });
        } else {
            notes.push({ check: 'LIVE_SCHEMA_FRESH', message: `live-schema-redacted.json is ${ageH}h old (fresh)` });
        }
    }
}

// ---------------------------------------------------------------------------
// Check 4: Pending migration SQL lint (subset — BLOCKs only)
// ---------------------------------------------------------------------------

// Find SQL files that are in the journal but haven't been applied yet
// (We don't track apply state here — we lint the most recent SQL file as a proxy)
if (journal?.entries?.length) {
    const lastEntry = journal.entries.at(-1);
    const lastIdx   = lastEntry?.idx ?? 0;
    const lastTag   = lastEntry?.tag ?? '';
    const sqlPath   = join(DRIZZLE, `${String(lastIdx).padStart(4, '0')}_${lastTag}.sql`);

    if (existsSync(sqlPath)) {
        const sql   = readFileSync(sqlPath, 'utf8');
        const lines = sql.split('\n');

        const BLOCK_PATTERNS = [
            { id: 'DROP_TABLE',    pattern: /\bDROP\s+TABLE\b/i,   message: 'Drops a table — all data lost' },
            { id: 'DROP_COLUMN',   pattern: /\bDROP\s+COLUMN\b/i,  message: 'Drops a column — data loss' },
            { id: 'TRUNCATE',      pattern: /\bTRUNCATE\b/i,       message: 'Truncates table — all rows deleted' },
            { id: 'ADD_NOT_NULL',  pattern: /ALTER\s+COLUMN\s+\S+\s+SET\s+NOT\s+NULL/i, message: 'SET NOT NULL does full-table scan' },
            { id: 'FULL_REWRITE',  pattern: /ALTER\s+TABLE\s+\S+\s+ALTER\s+COLUMN\s+\S+\s+TYPE/i, message: 'Type change may cause full table rewrite' },
            { id: 'DROP_ENUM',     pattern: /DROP\s+TYPE\b/i,       message: 'DROP TYPE (enum) — migrate columns first' },
        ];

        const lintHits = [];
        const seen     = new Set();
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.trim().startsWith('--') || line.trim().startsWith('/*')) continue;
            for (const rule of BLOCK_PATTERNS) {
                const key = rule.id;
                if (!seen.has(key) && rule.pattern.test(line)) {
                    seen.add(key);
                    lintHits.push({ ruleId: rule.id, line: i + 1, message: rule.message, snippet: line.trim().slice(0, 100) });
                }
            }
        }

        if (lintHits.length > 0) {
            blocks.push({
                check: 'PENDING_MIGRATION_LINT',
                message: `${lintHits.length} BLOCK-level pattern(s) in ${relative(FRONTEND, sqlPath)}`,
                details: lintHits,
            });
            if (verbose) {
                for (const h of lintHits) console.log(`  ✗ [BLOCK] ${h.ruleId} (line ${h.line}): ${h.message}\n     → ${h.snippet}`);
            }
        } else {
            notes.push({ check: 'PENDING_MIGRATION_LINT', message: `No BLOCK patterns in ${relative(FRONTEND, sqlPath)}` });
        }
    }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const pass = blocks.length === 0;

const report = {
    status: pass ? 'PRE_APPLY_CLEAR' : 'PRE_APPLY_BLOCKED',
    blockCount: blocks.length,
    warnCount:  warns.length,
    noteCount:  notes.length,
    blocks,
    warns,
    notes,
    generatedAt: new Date().toISOString(),
};

mkdirSync(REPORT_DIR, { recursive: true });
const outPath = join(REPORT_DIR, 'pre-apply-check.json');
writeFileSync(outPath, JSON.stringify(report, null, 2));

if (verbose || blocks.length > 0 || warns.length > 0) {
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
}

console.log('');
console.log(`  BLOCKs: ${blocks.length}  WARNs: ${warns.length}  NOTEs: ${notes.length}`);
console.log('');
console.log(`Status: ${pass ? 'PRE_APPLY_CLEAR ✓' : 'PRE_APPLY_BLOCKED ✗ — resolve BLOCKs before running drizzle-kit migrate'}`);
console.log(`Report: ${relative(ROOT, outPath)}`);

process.exit(pass ? 0 : 1);
