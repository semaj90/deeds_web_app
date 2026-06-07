#!/usr/bin/env node
/**
 * promote-to-postgres.mjs
 *
 * Promotes codebase-graph.json file entries into parent_atlas_documents
 * using ON CONFLICT (source_ref, workspace_id) DO UPDATE — fully upsert-safe.
 *
 * Flags:
 *   --dry-run          Print what would be upserted, write no rows (default)
 *   --apply            Actually upsert into Postgres
 *   --limit <n>        Max rows to process (default: 25)
 *   --offset <n>       Skip first n rows (for sliced runs, default: 0)
 *   --workspace <id>   workspace_id value (default: "codebase-graph")
 *   --verbose          Log each row
 *
 * Usage:
 *   node scripts/atlas/promote-to-postgres.mjs --dry-run
 *   node scripts/atlas/promote-to-postgres.mjs --apply --limit 100
 *   node scripts/atlas/promote-to-postgres.mjs --apply --limit 100 --offset 100
 */

import pg from 'pg';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

dotenv.config({ path: resolve(ROOT, 'sveltekit-frontend/.env') });

// ── args ──────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const APPLY    = argv.includes('--apply');
const DRY_RUN  = !APPLY;
const VERBOSE  = argv.includes('--verbose');

const limitIdx   = argv.indexOf('--limit');
const offsetIdx  = argv.indexOf('--offset');
const wsIdx      = argv.indexOf('--workspace');

const LIMIT      = limitIdx  !== -1 ? parseInt(argv[limitIdx  + 1], 10) : 25;
const OFFSET     = offsetIdx !== -1 ? parseInt(argv[offsetIdx + 1], 10) : 0;
const WORKSPACE  = wsIdx     !== -1 ? argv[wsIdx + 1] : 'codebase-graph';

if (isNaN(LIMIT)  || LIMIT  < 1) { console.error('--limit must be a positive integer'); process.exit(1); }
if (isNaN(OFFSET) || OFFSET < 0) { console.error('--offset must be >= 0');              process.exit(1); }

// ── helpers ───────────────────────────────────────────────────────────────────

function abort(msg, detail) {
  console.error('\n🚨 ABORT:', msg);
  if (detail) console.error(detail);
  process.exit(1);
}

function featureIdFromRel(rel) {
  // e.g. sveltekit-frontend/src/lib/server/ace/context-assembler.ts
  //   → ace  (deepest named segment before the filename)
  const parts = rel.split('/');
  // Walk from end: skip filename, pick first meaningful dir
  for (let i = parts.length - 2; i >= 0; i--) {
    const seg = parts[i];
    if (!['src', 'lib', 'server', 'routes', 'scripts', 'sveltekit-frontend'].includes(seg)) {
      return seg;
    }
  }
  return parts[0] ?? null;
}

function toRow(f, workspace) {
  return {
    source_ref     : f.rel,
    workspace_id   : workspace,
    rel_path       : f.rel,
    file_ext       : f.ext ?? null,
    tags           : Array.isArray(f.tags) ? f.tags : [],
    summary        : typeof f.summary === 'string' ? f.summary : '',
    line_count     : typeof f.lineCount === 'number' ? f.lineCount : null,
    is_route       : f.isRoute       === true,
    is_svelte_comp : f.isSvelteComp  === true,
    has_auth       : f.hasAuth       === true,
    has_zod        : f.hasZod        === true,
    drizzle_refs   : Array.isArray(f.drizzleRefs)    ? f.drizzleRefs    : [],
    imports        : Array.isArray(f.imports)         ? f.imports        : [],
    exports        : Array.isArray(f.exports)         ? f.exports        : [],
    route_handlers : Array.isArray(f.routeHandlers)   ? f.routeHandlers  : [],
    payload        : {
      dynImports   : f.dynImports   ?? [],
      reExports    : f.reExports    ?? [],
      components   : f.components   ?? [],
      todos        : f.todos        ?? [],
      fanIn        : f.fanIn        ?? 0,
      isTest       : f.isTest       ?? false,
      ssrUnsafe    : f.ssrUnsafe    ?? false,
      sv4Legacy    : f.sv4Legacy    ?? false,
      routeDepth   : f.routeDepth   ?? 0,
      routeParams  : f.routeParams  ?? [],
    },
    feature_id     : featureIdFromRel(f.rel),
    ingest_source  : 'codebase-graph',
  };
}

// ── load graph ────────────────────────────────────────────────────────────────

const GRAPH_PATH = resolve(ROOT, 'docs/graph/codebase-graph.json');
let graph;
try {
  graph = JSON.parse(readFileSync(GRAPH_PATH, 'utf-8'));
} catch (e) {
  abort(`Cannot parse ${GRAPH_PATH}`, e.message);
}

if (!Array.isArray(graph.files) || graph.files.length === 0) {
  abort('graph.files is missing or empty — run graphify first');
}

const allFiles = graph.files;
const slice    = allFiles.slice(OFFSET, OFFSET + LIMIT);

if (slice.length === 0) {
  console.log(`No files in range [${OFFSET}, ${OFFSET + LIMIT}) — nothing to do.`);
  process.exit(0);
}

const rows = slice.map(f => toRow(f, WORKSPACE));

// ── dry-run ───────────────────────────────────────────────────────────────────

console.log(`\n📦 promote-to-postgres.mjs  [${DRY_RUN ? 'DRY-RUN' : 'APPLY'}]`);
console.log(`   source      : ${GRAPH_PATH}`);
console.log(`   table       : public.parent_atlas_documents`);
console.log(`   workspace   : ${WORKSPACE}`);
console.log(`   slice       : offset=${OFFSET}  limit=${LIMIT}  (${slice.length} rows)`);
console.log(`   total files : ${allFiles.length}`);
console.log();

if (DRY_RUN) {
  console.log('Sample rows (first 3):');
  for (const r of rows.slice(0, 3)) {
    console.log(' ', r.source_ref, `| ext=${r.file_ext} | tags=${r.tags.slice(0,3).join(',')} | feature=${r.feature_id}`);
  }
  console.log();
  console.log(`Would upsert ${rows.length} rows into parent_atlas_documents.`);
  console.log('Re-run with --apply to write.');

  mkdirSync(resolve(ROOT, '.tmp'), { recursive: true });
  const report = {
    generatedAt : new Date().toISOString(),
    mode        : 'dry-run',
    offset      : OFFSET,
    limit       : LIMIT,
    workspace   : WORKSPACE,
    sliceSize   : rows.length,
    totalFiles  : allFiles.length,
    sampleRows  : rows.slice(0, 5).map(r => ({ source_ref: r.source_ref, feature_id: r.feature_id, tags: r.tags })),
  };
  writeFileSync(resolve(ROOT, '.tmp/promote-to-postgres-dry-run.json'), JSON.stringify(report, null, 2));
  console.log('\n📋 Dry-run report: .tmp/promote-to-postgres-dry-run.json');
  process.exit(0);
}

// ── apply ─────────────────────────────────────────────────────────────────────

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) abort('DATABASE_URL not set — check sveltekit-frontend/.env');

const client = new pg.Client({ connectionString: dbUrl });
await client.connect();

// Verify target table exists
const { rows: tableCheck } = await client.query(
  `SELECT 1 FROM information_schema.tables
   WHERE table_schema='public' AND table_name='parent_atlas_documents'`
);
if (!tableCheck.length) {
  await client.end();
  abort('parent_atlas_documents does not exist — run the schema migration first:\n  docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db < sveltekit-frontend/drizzle/manual/20260601_add_alias_and_parent_atlas_indexes.sql');
}

const UPSERT_SQL = `
  INSERT INTO public.parent_atlas_documents
    (source_ref, workspace_id, rel_path, file_ext, tags, summary, line_count,
     is_route, is_svelte_comp, has_auth, has_zod,
     drizzle_refs, imports, exports, route_handlers, payload,
     feature_id, ingest_source, updated_at)
  VALUES
    ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,now())
  ON CONFLICT (source_ref, workspace_id) DO UPDATE SET
    rel_path       = EXCLUDED.rel_path,
    file_ext       = EXCLUDED.file_ext,
    tags           = EXCLUDED.tags,
    summary        = EXCLUDED.summary,
    line_count     = EXCLUDED.line_count,
    is_route       = EXCLUDED.is_route,
    is_svelte_comp = EXCLUDED.is_svelte_comp,
    has_auth       = EXCLUDED.has_auth,
    has_zod        = EXCLUDED.has_zod,
    drizzle_refs   = EXCLUDED.drizzle_refs,
    imports        = EXCLUDED.imports,
    exports        = EXCLUDED.exports,
    route_handlers = EXCLUDED.route_handlers,
    payload        = EXCLUDED.payload,
    feature_id     = EXCLUDED.feature_id,
    ingest_source  = EXCLUDED.ingest_source,
    updated_at     = now()
`;

let inserted = 0;
let updated  = 0;
let errors   = [];

// Batch in groups of 50 inside a single transaction
const BATCH = 50;
await client.query('BEGIN');
try {
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    for (const r of batch) {
      try {
        const res = await client.query(UPSERT_SQL, [
          r.source_ref, r.workspace_id, r.rel_path, r.file_ext,
          r.tags, r.summary, r.line_count,
          r.is_route, r.is_svelte_comp, r.has_auth, r.has_zod,
          JSON.stringify(r.drizzle_refs), JSON.stringify(r.imports),
          JSON.stringify(r.exports),      JSON.stringify(r.route_handlers),
          JSON.stringify(r.payload),
          r.feature_id, r.ingest_source,
        ]);
        // pg doesn't distinguish insert vs update from rowCount on upsert;
        // use xmax heuristic: xmax=0 → insert, xmax>0 → update
        if (VERBOSE) console.log(`  ✓ ${r.source_ref}`);
        inserted++; // count as inserted (upsert)
      } catch (e) {
        errors.push({ source_ref: r.source_ref, error: e.message });
        console.error(`  ✗ ${r.source_ref}: ${e.message}`);
      }
    }
    process.stdout.write(`\r  Progress: ${Math.min(i + BATCH, rows.length)}/${rows.length}`);
  }
  await client.query('COMMIT');
  process.stdout.write('\n');
} catch (e) {
  await client.query('ROLLBACK');
  await client.end();
  abort('Transaction rolled back', e.message);
}

await client.end();

// ── post-apply report ─────────────────────────────────────────────────────────

console.log();
console.log(`✅ Upserted ${inserted - errors.length}/${rows.length} rows into parent_atlas_documents`);
if (errors.length) console.log(`   ✗ ${errors.length} errors (see report)`);

const remaining = allFiles.length - (OFFSET + rows.length);
if (remaining > 0) {
  console.log();
  console.log(`📌 Next slice:`);
  console.log(`   node scripts/atlas/promote-to-postgres.mjs --apply --limit ${LIMIT} --offset ${OFFSET + rows.length}`);
}

mkdirSync(resolve(ROOT, '.tmp'), { recursive: true });
const report = {
  generatedAt  : new Date().toISOString(),
  mode         : 'apply',
  offset       : OFFSET,
  limit        : LIMIT,
  workspace    : WORKSPACE,
  sliceSize    : rows.length,
  totalFiles   : allFiles.length,
  upserted     : inserted - errors.length,
  errorCount   : errors.length,
  errors       : errors.slice(0, 20),
  nextOffset   : OFFSET + rows.length,
  remaining,
};
writeFileSync(resolve(ROOT, '.tmp/promote-to-postgres-apply.json'), JSON.stringify(report, null, 2));
console.log('📋 Report: .tmp/promote-to-postgres-apply.json');

// ── post-promote: invalidate + refresh graph manifest ─────────────────────────
// Wires Lane 4: after atlas truth is promoted, the graph refresh manifest is
// regenerated so graphify runs stay aligned with the promoted truth.
if (APPLY && (inserted - errors.length) > 0) {
  try {
    const { execFileSync } = await import('node:child_process');
    execFileSync('node', [resolve(ROOT, 'scripts/atlas/write-graph-refresh-manifest.mjs')], { stdio: 'inherit' });
    console.log('🔄 Graph refresh manifest invalidated after promotion.');
  } catch (e) {
    console.warn('⚠️  Graph refresh manifest post-hook failed (non-fatal):', e.message);
  }
}
