#!/usr/bin/env node
/**
 * Gate 1 — Drizzle schema export coverage audit.
 *
 * Walks the configured schema entrypoint (drizzle.config.ts → schema.ts)
 * and all re-exported files, collecting every pgTable / pgEnum / pgView /
 * pgMaterializedView / pgSequence call. Cross-references against the last
 * Drizzle Kit journal snapshot to surface:
 *
 *   - Tables declared in TypeScript but absent from the journal snapshot
 *   - Tables in the journal snapshot but not reachable from the schema entrypoint
 *   - Duplicate PG object names
 *   - Schema files that exist in src/lib/server/db/ but are not reachable
 *     from the configured entrypoint
 *
 * Emits docs/reports/schema/desired-schema-export-audit.json.
 * Exit 0 = PASS, exit 1 = FAIL (unreachable definitions or duplicates).
 *
 * Usage:
 *   node scripts/atlas/schema/audit-drizzle-schema-exports.mjs [--fix-summary]
 */

import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { resolve, join, relative, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '../../..');
const FRONTEND  = join(ROOT, 'sveltekit-frontend');
const SCHEMA_EP = join(FRONTEND, 'src/lib/server/db/schema.ts');
const DB_DIR    = join(FRONTEND, 'src/lib/server/db');
const JOURNAL   = join(FRONTEND, 'drizzle/meta/_journal.json');
const SNAPSHOTS = join(FRONTEND, 'drizzle/meta');
const REPORT_DIR = join(ROOT, 'docs/reports/schema');

const args = process.argv.slice(2);
const verbose = args.includes('--verbose');

// ---------------------------------------------------------------------------
// 1. Parse schema files reachable from the entrypoint
// ---------------------------------------------------------------------------

function resolveSchemaImport(importPath, fromFile) {
    const fromDir = dirname(fromFile);
    // Handle $lib alias
    const normalized = importPath.replace(/^\$lib\//, join(FRONTEND, 'src/lib/') + '/').replace('//', '/');
    const candidates = [
        resolve(fromDir, importPath),
        resolve(fromDir, importPath + '.ts'),
        resolve(fromDir, importPath + '.js'),
        resolve(fromDir, importPath + '/index.ts'),
    ];
    // Also try stripping .js extensions (bundler pattern)
    const noExt = importPath.replace(/\.js$/, '');
    candidates.push(resolve(fromDir, noExt + '.ts'));

    for (const c of candidates) {
        if (existsSync(c)) return c;
    }
    return null;
}

function extractImports(content, filePath) {
    const imports = [];
    // export * from '...'
    const reExportRe = /export\s+\*\s+(?:as\s+\w+\s+)?from\s+['"]([^'"]+)['"]/g;
    // export { ... } from '...'
    const namedExportRe = /export\s+\{[^}]*\}\s+from\s+['"]([^'"]+)['"]/gm;
    for (const re of [reExportRe, namedExportRe]) {
        let m;
        while ((m = re.exec(content)) !== null) {
            const resolved = resolveSchemaImport(m[1], filePath);
            if (resolved) imports.push(resolved);
        }
    }
    return [...new Set(imports)];
}

function extractPgObjects(content, filePath) {
    const objects = { tables: [], enums: [], views: [], sequences: [] };
    // pgTable('name', ...) or pgTable("name", ...)
    const tableRe = /\bpgTable\s*\(\s*['"]([^'"]+)['"]/g;
    const enumRe  = /\bpgEnum\s*\(\s*['"]([^'"]+)['"]/g;
    const viewRe  = /\bpgView\s*\(\s*['"]([^'"]+)['"]/g;
    const matViewRe = /\bpgMaterializedView\s*\(\s*['"]([^'"]+)['"]/g;
    const seqRe   = /\bpgSequence\s*\(\s*['"]([^'"]+)['"]/g;

    const run = (re, arr) => { let m; while ((m = re.exec(content)) !== null) arr.push({ name: m[1], file: relative(FRONTEND, filePath) }); };
    run(tableRe, objects.tables);
    run(enumRe, objects.enums);
    run(viewRe, objects.views);
    run(matViewRe, objects.views);
    run(seqRe, objects.sequences);
    return objects;
}

const visited = new Set();
const allObjects = { tables: [], enums: [], views: [], sequences: [] };
const reachableFiles = new Set();

function walkSchema(filePath) {
    if (visited.has(filePath) || !existsSync(filePath)) return;
    visited.add(filePath);
    reachableFiles.add(relative(FRONTEND, filePath));

    const content = readFileSync(filePath, 'utf8');
    const { tables, enums, views, sequences } = extractPgObjects(content, filePath);
    allObjects.tables.push(...tables);
    allObjects.enums.push(...enums);
    allObjects.views.push(...views);
    allObjects.sequences.push(...sequences);

    for (const imp of extractImports(content, filePath)) {
        walkSchema(imp);
    }
}

console.log('Gate 1 — Drizzle schema export coverage audit');
console.log(`  Entrypoint: ${relative(FRONTEND, SCHEMA_EP)}\n`);

if (!existsSync(SCHEMA_EP)) {
    console.error(`ERROR: Schema entrypoint not found: ${SCHEMA_EP}`);
    process.exit(1);
}

walkSchema(SCHEMA_EP);

// ---------------------------------------------------------------------------
// 2. Detect duplicates
// ---------------------------------------------------------------------------

function findDuplicates(items) {
    const seen = new Map();
    const dups = [];
    for (const item of items) {
        const key = item.name;
        if (seen.has(key)) {
            dups.push({ name: key, files: [seen.get(key).file, item.file] });
        } else {
            seen.set(key, item);
        }
    }
    return dups;
}

const duplicateTables = findDuplicates(allObjects.tables);
const duplicateEnums  = findDuplicates(allObjects.enums);

// ---------------------------------------------------------------------------
// 3. Compare with last Drizzle journal snapshot
// ---------------------------------------------------------------------------

let snapshotTables = [];
let snapshotEnums  = [];

if (existsSync(JOURNAL)) {
    try {
        const journal = JSON.parse(readFileSync(JOURNAL, 'utf8'));
        const lastIdx = journal.entries.at(-1)?.idx ?? 0;
        const snapPath = join(SNAPSHOTS, `${String(lastIdx).padStart(4, '0')}_snapshot.json`);
        if (existsSync(snapPath)) {
            const snap = JSON.parse(readFileSync(snapPath, 'utf8'));
            snapshotTables = Object.keys(snap.tables ?? {});
            snapshotEnums  = Object.keys(snap.enums ?? {});
            if (verbose) console.log(`  Last snapshot: ${relative(FRONTEND, snapPath)} (${snapshotTables.length} tables, ${snapshotEnums.length} enums)`);
        }
    } catch (e) {
        console.warn(`  WARNING: Could not parse Drizzle journal: ${e.message}`);
    }
}

const declaredTableNames = [...new Set(allObjects.tables.map(t => t.name))];
const declaredEnumNames  = [...new Set(allObjects.enums.map(e => e.name))];

const inSnapNotDecl_tables = snapshotTables.filter(n => !declaredTableNames.includes(n));
const declNotInSnap_tables = declaredTableNames.filter(n => !snapshotTables.includes(n) && snapshotTables.length > 0);

// ---------------------------------------------------------------------------
// 4. Scan db/ for unreachable schema files
// ---------------------------------------------------------------------------

function scanDir(dir, ext = ['.ts']) {
    const files = [];
    try {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const full = join(dir, entry.name);
            if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
                files.push(...scanDir(full, ext));
            } else if (entry.isFile() && ext.some(e => entry.name.endsWith(e))) {
                files.push(full);
            }
        }
    } catch { /* skip unreadable dirs */ }
    return files;
}

const allDbFiles = scanDir(DB_DIR);
const unreachableDbFiles = allDbFiles
    .map(f => relative(FRONTEND, f))
    .filter(f => !reachableFiles.has(f))
    .filter(f => {
        // Exclude known non-schema files
        const base = f.split('/').at(-1) ?? '';
        const nonSchema = [
            'client.ts', 'client.js', 'connection.ts', 'connections.ts',
            'drizzle.ts', 'migrate.ts', 'health-check.ts', 'seed-',
            'setup-', 'verify-', 'queries.ts', 'query-utils.ts',
            'utils.ts', 'relations.ts', 'index.ts', 'pg.ts',
            'drizzle-cache.ts', 'mirror-query.ts', 'neo4j-',
            'qdrant-', 'postgres-', 'pgvector-', 'vector-', 'workspace-',
            'legacy-', 'unified-', 'zod-', 'seed.', 'index-',
            'error_analysis', 'packet-topology',
            '.d.ts', '.bak', '.temp', '.sql', 'AGENTS', 'LLMS', '.md',
        ];
        return !nonSchema.some(ns => base.startsWith(ns) || f.includes(ns) || base === ns);
    });

// Specifically flag schema-*.ts files that look like they should be included
const possiblyMissingSchemas = unreachableDbFiles.filter(f => {
    const base = f.split('/').at(-1) ?? '';
    return base.startsWith('schema-') || base === 'warden-schema.ts';
});

// ---------------------------------------------------------------------------
// 5. Build report
// ---------------------------------------------------------------------------

const pass = duplicateTables.length === 0 &&
             duplicateEnums.length === 0 &&
             possiblyMissingSchemas.length === 0;

const report = {
    status: pass ? 'PASS' : 'FAIL',
    configuredSchemaEntrypoint: relative(FRONTEND, SCHEMA_EP),
    reachableFileCount: reachableFiles.size,
    tableCount: declaredTableNames.length,
    enumCount: declaredEnumNames.length,
    viewCount: allObjects.views.length,
    sequenceCount: allObjects.sequences.length,
    duplicateDatabaseNames: {
        tables: duplicateTables,
        enums: duplicateEnums,
    },
    snapshotComparison: {
        lastSnapshotTableCount: snapshotTables.length,
        inSnapshotNotDeclared: inSnapNotDecl_tables,
        declaredNotInSnapshot: declNotInSnap_tables,
        note: 'inSnapshotNotDeclared may include tablesFilter-excluded tables — verify against drizzle.config.ts',
    },
    unreachableSchemaFiles: {
        possiblyMissing: possiblyMissingSchemas,
        allUnreachable: unreachableDbFiles,
    },
    reachableFiles: [...reachableFiles].sort(),
    generatedAt: new Date().toISOString(),
};

mkdirSync(REPORT_DIR, { recursive: true });
const outPath = join(REPORT_DIR, 'desired-schema-export-audit.json');
writeFileSync(outPath, JSON.stringify(report, null, 2));

// ---------------------------------------------------------------------------
// 6. Print summary
// ---------------------------------------------------------------------------

const tick = s => `  ✓ ${s}`;
const warn = s => `  ⚠ ${s}`;
const fail = s => `  ✗ ${s}`;

console.log(`  Reachable files  : ${reachableFiles.size}`);
console.log(`  Tables declared  : ${declaredTableNames.length}`);
console.log(`  Enums declared   : ${declaredEnumNames.length}`);
console.log(`  Views declared   : ${allObjects.views.length}`);
console.log(`  Sequences        : ${allObjects.sequences.length}`);
console.log('');

if (duplicateTables.length > 0) {
    console.log(fail(`Duplicate table names (${duplicateTables.length}):`));
    for (const d of duplicateTables) console.log(`      "${d.name}" defined in: ${d.files.join(', ')}`);
} else {
    console.log(tick('No duplicate table names'));
}

if (duplicateEnums.length > 0) {
    console.log(fail(`Duplicate enum names (${duplicateEnums.length}):`));
    for (const d of duplicateEnums) console.log(`      "${d.name}" defined in: ${d.files.join(', ')}`);
} else {
    console.log(tick('No duplicate enum names'));
}

if (possiblyMissingSchemas.length > 0) {
    console.log(warn(`schema-*.ts files not reachable from entrypoint (${possiblyMissingSchemas.length}):`));
    for (const f of possiblyMissingSchemas) console.log(`      ${f}`);
    console.log(`      → Add exports to ${relative(FRONTEND, SCHEMA_EP)} or verify intentionally excluded`);
} else {
    console.log(tick('All schema-*.ts files reachable from entrypoint'));
}

if (inSnapNotDecl_tables.length > 0) {
    console.log(warn(`In last snapshot but not declared (${inSnapNotDecl_tables.length}) — likely tablesFilter-excluded:`));
    if (verbose) for (const t of inSnapNotDecl_tables) console.log(`      ${t}`);
    else console.log(`      (run with --verbose to list; ${inSnapNotDecl_tables.length} items)`);
}

if (declNotInSnap_tables.length > 0) {
    console.log(warn(`Declared but not in last snapshot (${declNotInSnap_tables.length}) — needs migration generation:`));
    for (const t of declNotInSnap_tables) console.log(`      ${t}`);
}

console.log('');
console.log(`Status: ${pass ? 'PASS ✓' : 'FAIL ✗'}`);
console.log(`Report: ${relative(ROOT, outPath)}`);

process.exit(pass ? 0 : 1);
