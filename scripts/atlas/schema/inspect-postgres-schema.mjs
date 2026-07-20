#!/usr/bin/env node
/**
 * Gate 5 — Live PostgreSQL schema inspection.
 *
 * Queries pg_catalog to extract a normalized, deterministic snapshot of the
 * live database schema. Output is suitable for hashing and diff comparison.
 *
 * Emits:
 *   docs/reports/schema/live-schema-redacted.json   (redacted — no data)
 *
 * Usage:
 *   node scripts/atlas/schema/inspect-postgres-schema.mjs [--schema public] [--verbose]
 *
 * Env: DATABASE_URL or DATABASE_URL_MIGRATOR (from .env)
 */

import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'fs';
import { resolve, join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT  = resolve(__dirname, '../../..');
const REPORT_DIR = join(ROOT, 'docs/reports/schema');

const args = process.argv.slice(2);
const verbose  = args.includes('--verbose');
const schemaArg = args.find(a => a.startsWith('--schema='))?.split('=')[1] ?? 'public';

// Load .env
function loadEnv() {
    const paths = [join(ROOT, '.env'), join(ROOT, 'sveltekit-frontend/.env'), join(ROOT, '.env.local')];
    const env = {};
    for (const p of paths) {
        if (!existsSync(p)) continue;
        for (const line of readFileSync(p, 'utf8').split('\n')) {
            if (!line.includes('=') || line.startsWith('#')) continue;
            const [k, ...rest] = line.split('=');
            const key = k.trim();
            const val = rest.join('=').trim().replace(/^["']|["']$/g, '');
            if (key && val && !env[key]) env[key] = val;
        }
    }
    return env;
}

const envVars = loadEnv();
const DATABASE_URL = envVars.DATABASE_URL_MIGRATOR || envVars.DATABASE_URL || process.env.DATABASE_URL_MIGRATOR || process.env.DATABASE_URL;

if (!DATABASE_URL) {
    console.error('ERROR: DATABASE_URL or DATABASE_URL_MIGRATOR not set');
    process.exit(1);
}

// Dynamic import of pg (avoid top-level await bundler issues)
let pg;
try {
    pg = (await import('pg')).default;
} catch {
    console.error('ERROR: pg package not found. Run: npm install pg');
    process.exit(1);
}

const client = new pg.Client({ connectionString: DATABASE_URL });

try {
    await client.connect();
    console.log('Gate 5 — Live PostgreSQL schema inspection');
    console.log(`  Schema: ${schemaArg}\n`);

    // -- Tables and columns
    const { rows: columns } = await client.query(`
        SELECT
            t.table_name,
            c.column_name,
            c.ordinal_position,
            c.column_default,
            c.is_nullable,
            c.data_type,
            c.udt_name,
            c.character_maximum_length,
            c.numeric_precision,
            c.numeric_scale,
            c.is_identity,
            c.identity_generation
        FROM information_schema.tables t
        JOIN information_schema.columns c
          ON c.table_schema = t.table_schema AND c.table_name = t.table_name
        WHERE t.table_schema = $1
          AND t.table_type = 'BASE TABLE'
        ORDER BY t.table_name, c.ordinal_position
    `, [schemaArg]);

    // -- Constraints
    const { rows: constraints } = await client.query(`
        SELECT
            tc.table_name,
            tc.constraint_name,
            tc.constraint_type,
            kcu.column_name,
            ccu.table_name  AS foreign_table_name,
            ccu.column_name AS foreign_column_name,
            rc.update_rule,
            rc.delete_rule
        FROM information_schema.table_constraints tc
        LEFT JOIN information_schema.key_column_usage kcu
          ON kcu.constraint_name = tc.constraint_name AND kcu.constraint_schema = tc.constraint_schema
        LEFT JOIN information_schema.referential_constraints rc
          ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.constraint_schema
        LEFT JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name AND ccu.constraint_schema = tc.constraint_schema
        WHERE tc.table_schema = $1
        ORDER BY tc.table_name, tc.constraint_name, kcu.ordinal_position
    `, [schemaArg]);

    // -- Indexes
    const { rows: indexes } = await client.query(`
        SELECT
            t.relname   AS table_name,
            i.relname   AS index_name,
            ix.indisunique,
            ix.indisprimary,
            ix.indisvalid,
            am.amname   AS index_type,
            array_agg(a.attname ORDER BY ka.n) AS columns,
            pg_get_indexdef(ix.indexrelid) AS definition
        FROM pg_index ix
        JOIN pg_class t  ON t.oid = ix.indrelid
        JOIN pg_class i  ON i.oid = ix.indexrelid
        JOIN pg_am    am ON am.oid = i.relam
        JOIN pg_namespace ns ON ns.oid = t.relnamespace
        JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS ka(attnum, n) ON true
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ka.attnum
        WHERE ns.nspname = $1
          AND t.relkind = 'r'
        GROUP BY t.relname, i.relname, ix.indisunique, ix.indisprimary, ix.indisvalid, am.amname, ix.indexrelid
        ORDER BY t.relname, i.relname
    `, [schemaArg]);

    // -- Enums
    const { rows: enums } = await client.query(`
        SELECT
            t.typname   AS enum_name,
            e.enumlabel AS enum_value,
            e.enumsortorder
        FROM pg_type t
        JOIN pg_enum e ON e.enumtypid = t.oid
        JOIN pg_namespace ns ON ns.oid = t.typnamespace
        WHERE ns.nspname = $1
        ORDER BY t.typname, e.enumsortorder
    `, [schemaArg]);

    // -- Views
    const { rows: views } = await client.query(`
        SELECT table_name AS view_name, view_definition
        FROM information_schema.views
        WHERE table_schema = $1
        ORDER BY table_name
    `, [schemaArg]);

    // -- Sequences
    const { rows: sequences } = await client.query(`
        SELECT sequence_name, data_type, start_value, minimum_value, maximum_value, increment
        FROM information_schema.sequences
        WHERE sequence_schema = $1
        ORDER BY sequence_name
    `, [schemaArg]);

    await client.end();

    // -- Build normalized structure
    const tableMap = {};
    for (const col of columns) {
        if (!tableMap[col.table_name]) tableMap[col.table_name] = { columns: [], constraints: [], indexes: [] };
        tableMap[col.table_name].columns.push({
            name: col.column_name,
            position: col.ordinal_position,
            type: col.udt_name || col.data_type,
            dataType: col.data_type,
            nullable: col.is_nullable === 'YES',
            default: col.column_default,
            maxLength: col.character_maximum_length,
            precision: col.numeric_precision,
            scale: col.numeric_scale,
            isIdentity: col.is_identity === 'YES',
            identityGeneration: col.identity_generation,
        });
    }
    for (const con of constraints) {
        if (!tableMap[con.table_name]) continue;
        const existing = tableMap[con.table_name].constraints.find(c => c.name === con.constraint_name);
        if (existing) {
            if (con.column_name && !existing.columns.includes(con.column_name)) existing.columns.push(con.column_name);
        } else {
            tableMap[con.table_name].constraints.push({
                name: con.constraint_name,
                type: con.constraint_type,
                columns: con.column_name ? [con.column_name] : [],
                foreignTable: con.foreign_table_name,
                foreignColumn: con.foreign_column_name,
                updateRule: con.update_rule,
                deleteRule: con.delete_rule,
            });
        }
    }
    for (const idx of indexes) {
        if (!tableMap[idx.table_name]) continue;
        tableMap[idx.table_name].indexes.push({
            name: idx.index_name,
            unique: idx.indisunique,
            primary: idx.indisprimary,
            valid: idx.indisvalid,
            type: idx.index_type,
            columns: idx.columns,
            definition: idx.definition,
        });
    }

    const enumMap = {};
    for (const e of enums) {
        if (!enumMap[e.enum_name]) enumMap[e.enum_name] = [];
        enumMap[e.enum_name].push(e.enum_value);
    }

    const schema = {
        inspectedAt: new Date().toISOString(),
        pgSchema: schemaArg,
        tableCount: Object.keys(tableMap).length,
        enumCount: Object.keys(enumMap).length,
        viewCount: views.length,
        sequenceCount: sequences.length,
        tables: tableMap,
        enums: enumMap,
        views: Object.fromEntries(views.map(v => [v.view_name, { definition: v.view_definition }])),
        sequences: Object.fromEntries(sequences.map(s => [s.sequence_name, s])),
    };

    // Fingerprint: hash the structural shape (not timestamps)
    const fingerprint = createHash('sha256')
        .update(JSON.stringify({ tables: Object.keys(tableMap).sort(), enums: Object.keys(enumMap).sort() }))
        .digest('hex');
    schema.structuralFingerprint = fingerprint;

    mkdirSync(REPORT_DIR, { recursive: true });
    const outPath = join(REPORT_DIR, 'live-schema-redacted.json');
    writeFileSync(outPath, JSON.stringify(schema, null, 2));

    console.log(`  Tables  : ${Object.keys(tableMap).length}`);
    console.log(`  Enums   : ${Object.keys(enumMap).length}`);
    console.log(`  Views   : ${views.length}`);
    console.log(`  Sequences: ${sequences.length}`);
    console.log(`  Fingerprint: ${fingerprint.slice(0, 16)}...`);
    console.log('');
    console.log(`Status: LIVE_SCHEMA_INSPECTED ✓`);
    console.log(`Report: ${relative(ROOT, outPath)}`);

} catch (err) {
    await client.end().catch(() => {});
    console.error('ERROR inspecting PostgreSQL schema:', err.message);
    if (verbose) console.error(err.stack);
    process.exit(1);
}
