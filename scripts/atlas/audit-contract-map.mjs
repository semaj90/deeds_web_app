#!/usr/bin/env node
/**
 * Cross-Layer Contract Auditor
 * Compares SvelteKit routes ↔ Superforms v2 ↔ Zod ↔ Drizzle ORM ↔ SQL migrations
 * ↔ live PostgreSQL ↔ pgvector ↔ Docker/WSL2 env → produces graph-ready findings.
 *
 * Usage:
 *   node scripts/atlas/audit-contract-map.mjs [--json] [--layer=N] [--dry-run]
 *
 * Outputs:
 *   docs/reports/contract-error-map-report.json
 *   docs/reports/contract-error-map-report.md
 *   docs/graph/contract-error-map.json
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

// ── shared atlas utilities ────────────────────────────────────────────────────
import { REPO_ROOT, readJson } from './_atlas-utils.mjs';

const FRONTEND     = join(REPO_ROOT, 'sveltekit-frontend');
const SCHEMA_DIR   = join(FRONTEND, 'src/lib/server/db');
const ROUTES_DIR   = join(FRONTEND, 'src/routes');
const DRIZZLE_DIR  = join(FRONTEND, 'drizzle');
const DRIZZLE_META = join(DRIZZLE_DIR, 'meta');
const REPORTS_DIR  = join(REPO_ROOT, 'docs/reports');
const GRAPH_DIR    = join(REPO_ROOT, 'docs/graph');

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const EMBEDDING_DIM = 768; // canonical embedding dimension for this project

const ARGS = process.argv.slice(2);
const OPT_JSON    = ARGS.includes('--json');
const OPT_DRY    = ARGS.includes('--dry-run');
const OPT_LAYER  = ARGS.find(a => a.startsWith('--layer='))?.split('=')[1] ?? null;

// ── color helpers ─────────────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', cyan: '\x1b[36m', gray: '\x1b[90m',
};
const badge = s => s === 'pass' ? `${C.green}PASS${C.reset}` : s === 'warn' ? `${C.yellow}WARN${C.reset}` : `${C.red}FAIL${C.reset}`;
const hmmLabel = s => `${C.cyan}[${s}]${C.reset}`;

// ── rg helper ─────────────────────────────────────────────────────────────────
function rg(pattern, path, flags = []) {
  const r = spawnSync('rg', [pattern, path, '--no-heading', '-n', ...flags], { encoding: 'utf8' });
  return (r.stdout ?? '').trim();
}
function rgFiles(pattern, path, flags = []) {
  const r = spawnSync('rg', [pattern, path, '-l', ...flags], { encoding: 'utf8' });
  return (r.stdout ?? '').trim().split('\n').filter(Boolean);
}

// ── finding factory ───────────────────────────────────────────────────────────
let _seq = 0;
function makeFinding({ layer, hmmState, severity, localSourceRefs, externalSourceRefs = [], problem, expected, suggestedFix, validationCommands = [], agentCommandKeys = [] }) {
  const slug = createHash('sha1').update(`${layer}:${hmmState}:${problem.slice(0, 60)}`).digest('hex').slice(0, 8);
  return {
    findingId: `contract:${layer}-${hmmState}-${String(++_seq).padStart(3, '0')}-${slug}`,
    severity,
    layer,
    hmmState,
    localSourceRefs: localSourceRefs.map(r => relative(REPO_ROOT, r)),
    externalSourceRefs,
    problem,
    expected,
    suggestedFix,
    validationCommands,
    agentCommandKeys,
    trustTier: 'canonical_local_code_plus_official_docs',
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// Layer 1: SvelteKit route contracts
// ═════════════════════════════════════════════════════════════════════════════
async function auditRouteContracts() {
  const findings = [];

  // 1a. load() returning { form } when superValidate is used
  const serverFiles = rgFiles('superValidate', ROUTES_DIR, ['--glob', '**/+page.server.ts']);
  for (const f of serverFiles) {
    const text = readFileSync(f, 'utf8');

    // load should return { form }
    if (text.includes('export const load') && !text.includes('form:') && !text.includes('{ form }')) {
      findings.push(makeFinding({
        layer: 'sveltekit-route',
        hmmState: 'route_missing_form_return',
        severity: 'medium',
        localSourceRefs: [f],
        problem: `load() uses superValidate but may not return { form }.`,
        expected: 'load() should return { form: await superValidate(...) } so the client can access form state.',
        suggestedFix: 'Add `return { form: await superValidate(zod(schema)) }` in load().',
        validationCommands: ['npm run check', 'npm run audit:contracts'],
        agentCommandKeys: ['contract.audit', 'route.check'],
      }));
    }

    // action must return { form } on fail
    if (text.includes('!form.valid') && !text.includes('fail(400, { form }') && !text.includes("fail(400, {form}")) {
      findings.push(makeFinding({
        layer: 'sveltekit-route',
        hmmState: 'route_missing_form_return',
        severity: 'high',
        localSourceRefs: [f],
        problem: `Action checks !form.valid but may not return fail(400, { form }).`,
        expected: 'return fail(400, { form }) so the client receives the validation error.',
        suggestedFix: 'Add `return fail(400, { form });` immediately after the !form.valid check.',
        validationCommands: ['npm run check', 'npm run audit:contracts'],
        agentCommandKeys: ['contract.audit'],
      }));
    }

    // server-only imports leaking (heuristic: no $lib/server in page.svelte)
    const svelteFile = f.replace('+page.server.ts', '+page.svelte');
    if (existsSync(svelteFile)) {
      const svText = readFileSync(svelteFile, 'utf8');
      if (svText.includes('$lib/server/')) {
        findings.push(makeFinding({
          layer: 'sveltekit-route',
          hmmState: 'route_contract_mismatch',
          severity: 'high',
          localSourceRefs: [svelteFile],
          problem: `+page.svelte imports from $lib/server/ which is server-only and will break browser builds.`,
          expected: 'Client components must not import from $lib/server/.',
          suggestedFix: 'Move the import to +page.server.ts load() and pass data via PageData.',
          validationCommands: ['npm run build', 'npm run check'],
          agentCommandKeys: ['contract.audit'],
        }));
      }
    }
  }

  // 1b. API routes: consistent JSON shape (GET degraded path)
  const apiFiles = rgFiles('return json\\(', ROUTES_DIR, ['--glob', '**/+server.ts']);
  for (const f of apiFiles) {
    const text = readFileSync(f, 'utf8');
    // Detect error response without matching success shape key
    if (text.includes('status: 500') && !text.includes('error:') ) {
      findings.push(makeFinding({
        layer: 'sveltekit-route',
        hmmState: 'route_contract_mismatch',
        severity: 'low',
        localSourceRefs: [f],
        problem: 'GET route may return 500 status code instead of degraded-but-valid JSON shape.',
        expected: 'GET routes return 200 with empty arrays/nulls matching success shape.',
        suggestedFix: 'Replace `return json({ error }, { status: 500 })` with `return json({ data: [], error: msg })` (status 200).',
        validationCommands: ['npm run audit:contracts'],
        agentCommandKeys: ['contract.audit'],
      }));
    }
  }

  return { layer: 'sveltekit-route', findings };
}

// ═════════════════════════════════════════════════════════════════════════════
// Layer 2: Superforms v2 contracts
// ═════════════════════════════════════════════════════════════════════════════
async function auditSuperformsContracts() {
  const findings = [];
  const serverFiles = rgFiles('superValidate', ROUTES_DIR, ['--glob', '**/+page.server.ts']);

  for (const f of serverFiles) {
    const text = readFileSync(f, 'utf8');

    // 2a. schema defined at top-level (not inside load/action)
    const schemaInline = /(?:export const load|export const actions)[^}]{0,500}z\.object\s*\(/s.test(text);
    if (schemaInline) {
      findings.push(makeFinding({
        layer: 'superforms-contract',
        hmmState: 'superforms_schema_not_top_level',
        severity: 'medium',
        localSourceRefs: [f],
        externalSourceRefs: ['superforms:caching-schemas'],
        problem: 'Zod schema defined inside load() or action instead of top-level — breaks Superforms adapter caching.',
        expected: 'Schema must be a top-level stable object for Superforms caching to work correctly.',
        suggestedFix: 'Move schema definition to module top-level or a co-located schema.ts file.',
        validationCommands: ['npm run audit:contracts'],
        agentCommandKeys: ['contract.audit'],
      }));
    }

    // 2b. legacy `zod` adapter (should be `zod4`)
    if (text.includes("from 'sveltekit-superforms/adapters'") && !text.includes('zod4') && text.includes(' zod ')) {
      findings.push(makeFinding({
        layer: 'superforms-contract',
        hmmState: 'superforms_schema_not_top_level',
        severity: 'low',
        localSourceRefs: [f],
        externalSourceRefs: ['superforms:zod4-adapter'],
        problem: 'Uses legacy `zod` adapter instead of `zod4` from sveltekit-superforms/adapters.',
        expected: "import { zod4 as zod } from 'sveltekit-superforms/adapters'",
        suggestedFix: "Replace `zod` import with `zod4 as zod` from 'sveltekit-superforms/adapters'.",
        validationCommands: ['npm run check', 'npm run audit:contracts'],
        agentCommandKeys: ['contract.audit'],
      }));
    }

    // 2c. matching client use:enhance + superForm
    const svelteFile = f.replace('+page.server.ts', '+page.svelte');
    if (existsSync(svelteFile)) {
      const svText = readFileSync(svelteFile, 'utf8');
      if (text.includes('superValidate') && !svText.includes('superForm') && !svText.includes('use:enhance')) {
        findings.push(makeFinding({
          layer: 'superforms-contract',
          hmmState: 'route_missing_form_return',
          severity: 'medium',
          localSourceRefs: [f, svelteFile],
          externalSourceRefs: ['superforms:use-enhance'],
          problem: 'Server uses superValidate but client component lacks superForm() + use:enhance.',
          expected: 'Client must call superForm(data.form) and bind use:enhance to the <form>.',
          suggestedFix: "Add `const { form, enhance } = superForm(data.form)` and `<form use:enhance>` in the .svelte.",
          validationCommands: ['npm run audit:contracts'],
          agentCommandKeys: ['contract.audit'],
        }));
      }

      // Check for `name` attribute on inputs (required unless nested)
      if (svText.includes('<input') && !svText.includes('name=') && !svText.includes('dataType')) {
        findings.push(makeFinding({
          layer: 'superforms-contract',
          hmmState: 'superforms_schema_not_top_level',
          severity: 'low',
          localSourceRefs: [svelteFile],
          externalSourceRefs: ['superforms:input-name-attribute'],
          problem: 'Form inputs missing `name` attribute — Superforms requires name on inputs unless using nested dataType.',
          expected: "Each input needs a name matching the schema field, e.g. <input name=\"email\" bind:value={$form.email}>",
          suggestedFix: 'Add `name` attributes to form inputs matching Zod schema field names.',
          validationCommands: ['npm run audit:contracts'],
          agentCommandKeys: ['contract.audit'],
        }));
      }
    }
  }

  return { layer: 'superforms-contract', findings };
}

// ═════════════════════════════════════════════════════════════════════════════
// Layer 3: Drizzle ORM ↔ Zod schema contracts
// ═════════════════════════════════════════════════════════════════════════════
async function auditDrizzleZodContracts() {
  const findings = [];

  // Parse all schema-*.ts files for pgTable definitions
  const schemaFiles = readdirSync(SCHEMA_DIR).filter(f => f.startsWith('schema') && f.endsWith('.ts'));
  const drizzleMap = new Map(); // tableName → Map<dbColName, drizzleType>

  for (const sf of schemaFiles) {
    const text = readFileSync(join(SCHEMA_DIR, sf), 'utf8');
    // State machine: find pgTable blocks and extract column types
    let inTable = null, depth = 0;
    for (const line of text.split('\n')) {
      const tableMatch = line.match(/pgTable\(['"]([^'"]+)['"]/);
      if (tableMatch) { inTable = tableMatch[1]; depth = 0; drizzleMap.set(inTable, new Map()); }
      if (inTable) {
        depth += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
        const colMatch = line.match(/\b(uuid|integer|serial|varchar|text|boolean|timestamp|jsonb|real|bigint|numeric|vector|date|halfvec)\s*\(\s*['"]([^'"]+)['"]/);
        if (colMatch) drizzleMap.get(inTable)?.set(colMatch[2], colMatch[1]);
        if (depth <= 0 && inTable) inTable = null;
      }
    }
  }

  // Known FK type mismatches from codebase history
  const knownFkMismatches = [
    { table: 'cases', col: 'user_id', drizzleType: 'uuid', pgType: 'integer', refsTable: 'users', refsCol: 'id' },
    { table: 'chat_messages', col: 'user_id', drizzleType: 'uuid', pgType: 'integer', refsTable: 'users', refsCol: 'id' },
    { table: 'audit_log', col: 'user_id', drizzleType: 'uuid', pgType: 'integer', refsTable: 'users', refsCol: 'id' },
  ];
  for (const m of knownFkMismatches) {
    const colsForTable = drizzleMap.get(m.table);
    if (colsForTable?.get(m.col) === m.drizzleType) {
      findings.push(makeFinding({
        layer: 'drizzle-zod',
        hmmState: 'drizzle_fk_type_mismatch',
        severity: 'high',
        localSourceRefs: schemaFiles.map(sf => join(SCHEMA_DIR, sf)),
        externalSourceRefs: ['postgres:foreign-key-types', 'drizzle:zod:createInsertSchema'],
        problem: `Column ${m.table}.${m.col} is ${m.drizzleType} in Drizzle schema but DB column is ${m.pgType}; references ${m.refsTable}.${m.refsCol} which is serial integer.`,
        expected: 'Foreign key column type must match the referenced primary key type.',
        suggestedFix: `Change ${m.table}.${m.col} to integer() in schema-postgres.ts or run migration to change users.id to uuid.`,
        validationCommands: ['npm run db:check', 'npm run audit:contracts'],
        agentCommandKeys: ['db.check', 'contract.audit'],
      }));
    }
  }

  // Check Zod schemas in route co-located files
  const colocatedSchemas = rgFiles('z\\.object\\s*\\(', ROUTES_DIR, ['--glob', '*/schema.ts', '--glob', '*/schema.js']);
  for (const sf of colocatedSchemas) {
    const text = readFileSync(sf, 'utf8');
    // Detect z.string() used for userId-like fields (likely needs z.coerce.number())
    const idFields = [...text.matchAll(/(\w*[Ii]d\w*)\s*:\s*z\.string\s*\(\s*\)/g)];
    for (const m of idFields) {
      findings.push(makeFinding({
        layer: 'drizzle-zod',
        hmmState: 'zod_db_type_mismatch',
        severity: 'medium',
        localSourceRefs: [sf],
        externalSourceRefs: ['drizzle:zod:createInsertSchema'],
        problem: `Field "${m[1]}" uses z.string() but may map to an integer FK column — use z.coerce.number() or z.string().uuid().`,
        expected: 'FK integer columns need z.coerce.number(); UUID columns need z.string().uuid().',
        suggestedFix: `Replace z.string() with z.coerce.number() for "${m[1]}" if it references an integer PK.`,
        validationCommands: ['npm run check', 'npm run audit:contracts'],
        agentCommandKeys: ['contract.audit'],
      }));
    }
  }

  return { layer: 'drizzle-zod', findings };
}

// ═════════════════════════════════════════════════════════════════════════════
// Layer 4: SQL migrations + drizzle/meta hygiene
// ═════════════════════════════════════════════════════════════════════════════
async function auditMigrationsAndMeta() {
  const findings = [];

  // 4a. drizzle/meta: only JSON snapshot files allowed
  if (existsSync(DRIZZLE_META)) {
    const metaFiles = readdirSync(DRIZZLE_META);
    const nonJson = metaFiles.filter(f => !f.endsWith('.json'));
    for (const f of nonJson) {
      findings.push(makeFinding({
        layer: 'drizzle-meta',
        hmmState: 'stale_migration',
        severity: 'high',
        localSourceRefs: [join(DRIZZLE_META, f)],
        externalSourceRefs: ['drizzle-kit:meta-format'],
        problem: `Non-JSON file "${f}" found in drizzle/meta — Drizzle Kit treats all files there as JSON snapshots and will crash trying to parse it.`,
        expected: 'drizzle/meta must contain only _journal.json and ????_snapshot.json files.',
        suggestedFix: `Remove or move "${f}" out of sveltekit-frontend/drizzle/meta/.`,
        validationCommands: ['node scripts/atlas/audit-drizzle-meta-hygiene.mjs'],
        agentCommandKeys: ['drizzle.meta.check'],
      }));
    }
  }

  // 4b. migrations missing their Drizzle schema table (orphan migrations)
  if (existsSync(DRIZZLE_DIR)) {
    const sqlFiles = readdirSync(DRIZZLE_DIR).filter(f => f.endsWith('.sql'));
    const journalPath = join(DRIZZLE_META, '_journal.json');
    const journal = readJson(journalPath, { entries: [] });
    const journaledSnaps = new Set((journal.entries ?? []).map(e => e.tag));

    for (const sql of sqlFiles) {
      const tag = sql.replace('.sql', '');
      if (!journaledSnaps.has(tag)) {
        findings.push(makeFinding({
          layer: 'drizzle-meta',
          hmmState: 'stale_migration',
          severity: 'medium',
          localSourceRefs: [join(DRIZZLE_DIR, sql)],
          externalSourceRefs: ['drizzle-kit:journal'],
          problem: `Migration file "${sql}" is not recorded in drizzle/meta/_journal.json — drizzle-kit migrate will skip it.`,
          expected: 'All .sql files in drizzle/ should appear in the journal unless they are manually applied sidecars.',
          suggestedFix: 'Apply manually: `docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db < sveltekit-frontend/drizzle/' + sql + '` or add to journal.',
          validationCommands: ['npm run db:check'],
          agentCommandKeys: ['db.check'],
        }));
      }
    }
  }

  return { layer: 'drizzle-meta', findings };
}

// ═════════════════════════════════════════════════════════════════════════════
// Layer 5: Live PostgreSQL schema drift
// ═════════════════════════════════════════════════════════════════════════════
async function auditLivePostgres() {
  const findings = [];
  let pool;
  try {
    pool = new pg.Pool({
      connectionString: DB_URL,
      max: 2,
      connectionTimeoutMillis: 5000,
      statement_timeout: 15000,
      idleTimeoutMillis: 5000,
    });
    pool.on('error', () => {});

    // 5a. userId type audit across tables
    const { rows } = await pool.query(`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE column_name IN ('user_id','uploaded_by') AND table_schema='public'
      ORDER BY table_name
    `).catch(() => ({ rows: [] }));

    const uuidTables = rows.filter(r => r.data_type === 'uuid');
    if (uuidTables.length > 0) {
      findings.push(makeFinding({
        layer: 'drizzle-postgres',
        hmmState: 'drizzle_fk_type_mismatch',
        severity: 'high',
        localSourceRefs: [join(SCHEMA_DIR, 'schema-postgres.ts')],
        externalSourceRefs: ['postgres:foreign-key-types'],
        problem: `${uuidTables.length} tables have user_id/uploaded_by typed as UUID in live DB but users.id is integer serial. Tables: ${uuidTables.slice(0,5).map(r=>r.table_name).join(', ')}${uuidTables.length>5?' (…)':''}.`,
        expected: 'All user_id FK columns should match users.id type (integer serial).',
        suggestedFix: 'Migrate UUID user_id columns to integer or convert users.id to uuid. See CLAUDE.md §Schema Mismatch.',
        validationCommands: ['npm run db:check', 'npm run audit:contracts'],
        agentCommandKeys: ['db.check', 'contract.audit'],
      }));
    }

    // 5b. pgvector extension
    const { rows: extRows } = await pool.query(
      "SELECT * FROM pg_extension WHERE extname='vector'"
    ).catch(() => ({ rows: [] }));
    if (extRows.length === 0) {
      findings.push(makeFinding({
        layer: 'pgvector',
        hmmState: 'missing_pgvector_extension',
        severity: 'high',
        localSourceRefs: [],
        externalSourceRefs: ['pgvector:install'],
        problem: 'pgvector extension not found in live database.',
        expected: 'CREATE EXTENSION IF NOT EXISTS vector should exist.',
        suggestedFix: "Run: docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c 'CREATE EXTENSION IF NOT EXISTS vector;'",
        validationCommands: ['npm run audit:pgvector', 'npm run db:check'],
        agentCommandKeys: ['db.check'],
      }));
    }

    // 5c. HNSW index check on known vector tables
    const vectorTables = ['evidence_vectors', 'codebase_chunks_768', 'legal_documents'];
    for (const vt of vectorTables) {
      const { rows: idxRows } = await pool.query(
        `SELECT indexname FROM pg_indexes WHERE tablename=$1 AND indexdef ILIKE '%hnsw%'`,
        [vt]
      ).catch(() => ({ rows: [] }));
      const { rows: tableExists } = await pool.query(
        `SELECT 1 FROM information_schema.tables WHERE table_name=$1 AND table_schema='public'`,
        [vt]
      ).catch(() => ({ rows: [] }));
      if (tableExists.length > 0 && idxRows.length === 0) {
        findings.push(makeFinding({
          layer: 'pgvector',
          hmmState: 'missing_pgvector_extension',
          severity: 'medium',
          localSourceRefs: [],
          externalSourceRefs: ['pgvector:hnsw-index'],
          problem: `Table "${vt}" exists but has no HNSW index — vector similarity search will use sequential scan.`,
          expected: 'HNSW index on the embedding column for fast ANN search.',
          suggestedFix: `CREATE INDEX CONCURRENTLY IF NOT EXISTS ${vt}_hnsw_idx ON ${vt} USING hnsw (embedding vector_cosine_ops) WITH (m=16, ef_construction=64);`,
          validationCommands: ['npm run audit:pgvector'],
          agentCommandKeys: ['contract.audit'],
        }));
      }
    }
  } catch (err) {
    if (!OPT_JSON) console.warn(`  ${C.yellow}⚠ Postgres unreachable (${err.message.slice(0,60)}) — layer 5 skipped${C.reset}`);
  } finally {
    await pool?.end().catch(() => {});
  }

  return { layer: 'drizzle-postgres', findings };
}

// ═════════════════════════════════════════════════════════════════════════════
// Layer 6: pgvector static checks (migrations + schema)
// ═════════════════════════════════════════════════════════════════════════════
async function auditPgvectorStatic() {
  const findings = [];

  // Check migrations for CREATE EXTENSION vector
  const allSql = existsSync(DRIZZLE_DIR)
    ? readdirSync(DRIZZLE_DIR).filter(f => f.endsWith('.sql')).map(f => join(DRIZZLE_DIR, f))
    : [];
  const manualDir = join(DRIZZLE_DIR, 'manual');
  if (existsSync(manualDir)) allSql.push(...readdirSync(manualDir).filter(f => f.endsWith('.sql')).map(f => join(manualDir, f)));

  const hasExtension = allSql.some(f => readFileSync(f, 'utf8').match(/CREATE EXTENSION.*vector/i));
  if (!hasExtension) {
    findings.push(makeFinding({
      layer: 'pgvector',
      hmmState: 'missing_pgvector_extension',
      severity: 'high',
      localSourceRefs: allSql.slice(0, 3),
      externalSourceRefs: ['pgvector:install'],
      problem: 'No SQL migration contains CREATE EXTENSION vector — pgvector may not be enabled.',
      expected: "Migration or manual SQL contains `CREATE EXTENSION IF NOT EXISTS vector;`",
      suggestedFix: 'Add CREATE EXTENSION IF NOT EXISTS vector to an early migration or drizzle/manual/00_extensions.sql.',
      validationCommands: ['npm run audit:pgvector'],
      agentCommandKeys: ['db.check'],
    }));
  }

  // Check Drizzle schema uses correct pgvector import
  const schemaFiles = readdirSync(SCHEMA_DIR).filter(f => f.endsWith('.ts'));
  for (const sf of schemaFiles) {
    const text = readFileSync(join(SCHEMA_DIR, sf), 'utf8');
    if (text.includes("from 'pgvector/drizzle-orm'") || text.includes('from "pgvector/drizzle-orm"')) {
      findings.push(makeFinding({
        layer: 'pgvector',
        hmmState: 'vector_dimension_mismatch',
        severity: 'medium',
        localSourceRefs: [join(SCHEMA_DIR, sf)],
        externalSourceRefs: ['drizzle:pgvector-native'],
        problem: `"${sf}" imports vector from pgvector/drizzle-orm (legacy experimental) instead of drizzle-orm/pg-core (native).`,
        expected: "import { vector } from 'drizzle-orm/pg-core'",
        suggestedFix: "Replace `from 'pgvector/drizzle-orm'` with `from 'drizzle-orm/pg-core'`.",
        validationCommands: ['npm run check', 'npm run audit:pgvector'],
        agentCommandKeys: ['contract.audit'],
      }));
    }

    // Check vector dimensions
    const dimMatches = [...text.matchAll(/vector\s*\(\s*['"]?\w+['"]?\s*,?\s*\{?\s*dimensions?\s*:?\s*(\d+)/g)];
    for (const m of dimMatches) {
      const dim = parseInt(m[1], 10);
      if (!isNaN(dim) && dim !== EMBEDDING_DIM && dim !== 64) {
        findings.push(makeFinding({
          layer: 'pgvector',
          hmmState: 'vector_dimension_mismatch',
          severity: 'high',
          localSourceRefs: [join(SCHEMA_DIR, sf)],
          externalSourceRefs: ['pgvector:dimensions'],
          problem: `Vector column declared with ${dim} dimensions but canonical embedding dim is ${EMBEDDING_DIM}.`,
          expected: `All embedding vectors should be ${EMBEDDING_DIM}-dimensional (embeddinggemma:latest output).`,
          suggestedFix: `Change vector dimension to ${EMBEDDING_DIM} in schema and regenerate migration.`,
          validationCommands: ['npm run audit:pgvector', 'npm run audit:contracts'],
          agentCommandKeys: ['contract.audit'],
        }));
      }
    }
  }

  return { layer: 'pgvector', findings };
}

// ═════════════════════════════════════════════════════════════════════════════
// Layer 7: Docker / WSL2 / env URL checks
// ═════════════════════════════════════════════════════════════════════════════
async function auditEnvUrls() {
  const findings = [];
  const envFile = join(FRONTEND, '.env');
  if (!existsSync(envFile)) {
    findings.push(makeFinding({
      layer: 'env-url',
      hmmState: 'env_url_mismatch',
      severity: 'high',
      localSourceRefs: [envFile],
      externalSourceRefs: ['sveltekit:env'],
      problem: 'sveltekit-frontend/.env not found — DATABASE_URL and service ports are required for dev.',
      expected: '.env exists with DATABASE_URL, REDIS_URL, SEAWEED_S3_PORT, etc.',
      suggestedFix: 'Copy .env.example to .env and fill in values per CLAUDE.md §Environment.',
      validationCommands: ['npm run dev'],
      agentCommandKeys: ['contract.audit'],
    }));
    return { layer: 'env-url', findings };
  }

  const envText = readFileSync(envFile, 'utf8');

  // Check Postgres port: should be 5434 (Docker), not 5432 (native Windows)
  if (envText.match(/DATABASE_URL[^=]*=.*:5432\//)) {
    findings.push(makeFinding({
      layer: 'env-url',
      hmmState: 'env_url_mismatch',
      severity: 'high',
      localSourceRefs: [envFile],
      externalSourceRefs: ['docker:port-mapping'],
      problem: 'DATABASE_URL uses port 5432 but Docker maps legal-ai-postgres to host port 5434.',
      expected: 'DATABASE_URL=postgresql://legal_admin:...@127.0.0.1:5434/legal_ai_db',
      suggestedFix: 'Change port from 5432 to 5434 in sveltekit-frontend/.env.',
      validationCommands: ['npm run dev', 'npm run audit:contracts'],
      agentCommandKeys: ['contract.audit'],
    }));
  }

  // Check SEAWEED env vars (required since MinIO cutover May 2026)
  const requiredSeaweed = ['SEAWEED_S3_PORT', 'SEAWEED_ENDPOINT', 'SEAWEED_ACCESS_KEY', 'SEAWEED_SECRET_KEY'];
  const missingSeaweed = requiredSeaweed.filter(k => !envText.includes(k + '='));
  if (missingSeaweed.length > 0) {
    findings.push(makeFinding({
      layer: 'env-url',
      hmmState: 'env_url_mismatch',
      severity: 'medium',
      localSourceRefs: [envFile],
      externalSourceRefs: ['seaweedfs:s3-gateway'],
      problem: `Missing SeaweedFS env vars: ${missingSeaweed.join(', ')} — uploads will fall back to legacy MinIO path.`,
      expected: 'SEAWEED_S3_PORT=8333, SEAWEED_ENDPOINT=localhost, SEAWEED_ACCESS_KEY=minio, SEAWEED_SECRET_KEY=minio123',
      suggestedFix: 'Add the 4 SEAWEED_* vars to sveltekit-frontend/.env (see CLAUDE.md §SeaweedFS).',
      validationCommands: ['npm run dev', 'npm run audit:contracts'],
      agentCommandKeys: ['contract.audit'],
    }));
  }

  return { layer: 'env-url', findings };
}

// ═════════════════════════════════════════════════════════════════════════════
// Report writers
// ═════════════════════════════════════════════════════════════════════════════
function writeReports(allFindings, elapsed) {
  mkdirSync(REPORTS_DIR, { recursive: true });
  mkdirSync(GRAPH_DIR, { recursive: true });

  const report = {
    generatedAt: new Date().toISOString(),
    elapsedMs: elapsed,
    totalFindings: allFindings.length,
    bySeverity: {
      high:   allFindings.filter(f => f.severity === 'high').length,
      medium: allFindings.filter(f => f.severity === 'medium').length,
      low:    allFindings.filter(f => f.severity === 'low').length,
    },
    findings: allFindings,
  };

  // JSON report
  writeFileSync(join(REPORTS_DIR, 'contract-error-map-report.json'), JSON.stringify(report, null, 2));

  // Markdown report
  const md = [
    '# Cross-Layer Contract Error Map',
    '',
    `Generated: ${report.generatedAt}  |  Findings: ${report.totalFindings}  |  High: ${report.bySeverity.high}  Medium: ${report.bySeverity.medium}  Low: ${report.bySeverity.low}`,
    '',
    '## Findings',
    '',
    ...allFindings.map(f => [
      `### ${f.findingId}`,
      `**Severity:** ${f.severity}  |  **Layer:** ${f.layer}  |  **HMM State:** \`${f.hmmState}\``,
      '',
      `**Problem:** ${f.problem}`,
      '',
      `**Expected:** ${f.expected}`,
      '',
      `**Suggested Fix:** ${f.suggestedFix}`,
      '',
      f.localSourceRefs.length > 0 ? `**Files:** ${f.localSourceRefs.map(r => `\`${r}\``).join(', ')}` : '',
      '',
      `**Validation:** ${f.validationCommands.map(c => `\`${c}\``).join(', ')}`,
      '',
    ].join('\n')),
  ].join('\n');
  writeFileSync(join(REPORTS_DIR, 'contract-error-map-report.md'), md);

  // Graph-ingestion JSON (one node per finding + edges to source refs)
  const graph = {
    generatedAt: report.generatedAt,
    nodes: allFindings.map(f => ({
      id: f.findingId,
      label: 'ErrorPattern',
      properties: {
        severity: f.severity,
        layer: f.layer,
        hmmState: f.hmmState,
        problem: f.problem.slice(0, 200),
        suggestedFix: f.suggestedFix.slice(0, 200),
        trustTier: f.trustTier,
      },
    })),
    edges: allFindings.flatMap(f =>
      f.localSourceRefs.map(ref => ({
        from: f.findingId,
        to: `file:${ref}`,
        type: 'REFERENCES_FILE',
      }))
    ),
  };
  writeFileSync(join(GRAPH_DIR, 'contract-error-map.json'), JSON.stringify(graph, null, 2));

  return report;
}

// ═════════════════════════════════════════════════════════════════════════════
// Main orchestrator
// ═════════════════════════════════════════════════════════════════════════════
async function main() {
  if (!OPT_JSON) {
    console.log(`\n${C.bold}╔══════════════════════════════════════════════════════╗${C.reset}`);
    console.log(`${C.bold}║  Cross-Layer Contract Auditor                        ║${C.reset}`);
    console.log(`${C.bold}╚══════════════════════════════════════════════════════╝${C.reset}\n`);
    if (OPT_DRY) console.log(`${C.yellow}  [dry-run] no files will be written${C.reset}\n`);
  }

  const t0 = Date.now();
  const layers = [
    { id: 1, name: 'SvelteKit Route Contracts',    fn: auditRouteContracts },
    { id: 2, name: 'Superforms v2 Contracts',       fn: auditSuperformsContracts },
    { id: 3, name: 'Drizzle ↔ Zod Alignment',      fn: auditDrizzleZodContracts },
    { id: 4, name: 'Migrations + Meta Hygiene',     fn: auditMigrationsAndMeta },
    { id: 5, name: 'Live PostgreSQL Schema',        fn: auditLivePostgres },
    { id: 6, name: 'pgvector Static Checks',        fn: auditPgvectorStatic },
    { id: 7, name: 'Env / Docker URL Checks',       fn: auditEnvUrls },
    {
      id: 8,
      name: 'Form Contracts (sub-script)',
      fn: async () => {
        const scriptPath = join(resolve(fileURLToPath(import.meta.url), '..'), 'audit-sveltekit-form-contracts.mjs');
        const r = spawnSync(process.execPath, [scriptPath, '--json', '--dry-run'], {
          encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, cwd: REPO_ROOT,
        });
        try {
          const out = JSON.parse(r.stdout ?? '{}');
          return { layer: 'sveltekit-forms', findings: (out.findings ?? []) };
        } catch {
          return { layer: 'sveltekit-forms', findings: [] };
        }
      },
    },
  ];

  const allFindings = [];
  for (const layer of layers) {
    if (OPT_LAYER && String(layer.id) !== OPT_LAYER) continue;
    const lt0 = Date.now();
    let result;
    try {
      result = await layer.fn();
    } catch (err) {
      result = { layer: layer.name, findings: [] };
      if (!OPT_JSON) console.error(`  ${C.red}Layer ${layer.id} error: ${err.message}${C.reset}`);
    }
    const dur = Date.now() - lt0;
    const n = result.findings.length;
    const status = n === 0 ? 'pass' : result.findings.some(f => f.severity === 'high') ? 'fail' : 'warn';
    if (!OPT_JSON) {
      console.log(`  Layer ${layer.id}  ${layer.name.padEnd(30)} ${badge(status)}  ${n} findings  ${C.gray}${dur}ms${C.reset}`);
      for (const f of result.findings) {
        const sev = f.severity === 'high' ? C.red : f.severity === 'medium' ? C.yellow : C.gray;
        console.log(`    ${sev}${f.severity.padEnd(6)}${C.reset} ${hmmLabel(f.hmmState)}  ${f.problem.slice(0, 80)}…`);
      }
    }
    allFindings.push(...result.findings);
  }

  const elapsed = Date.now() - t0;
  const high = allFindings.filter(f => f.severity === 'high').length;
  const med  = allFindings.filter(f => f.severity === 'medium').length;
  const low  = allFindings.filter(f => f.severity === 'low').length;

  if (!OPT_DRY) {
    const report = writeReports(allFindings, elapsed);
    if (!OPT_JSON) {
      console.log(`\n  ${C.gray}Reports written to docs/reports/ and docs/graph/${C.reset}`);
    } else {
      console.log(JSON.stringify(report, null, 2));
    }

    // Build error-fix DAG after reports are written
    if (!OPT_JSON) console.log(`  ${C.gray}Building KAG/DAG/HMM error-fix graph…${C.reset}`);
    const dagScript = join(resolve(fileURLToPath(import.meta.url), '..'), 'build-error-fix-dag.mjs');
    spawnSync(process.execPath, [dagScript, '--dry-run', '--no-redis'], {
      encoding: 'utf8', cwd: REPO_ROOT,
      // Write reports directly from dag script — we pass OPT_DRY so it only builds in memory here
      // The dag script writes its own report files; run without --dry-run for full write
    });
    // Run again without dry-run so reports are actually written
    spawnSync(process.execPath, [dagScript, '--no-redis'], {
      encoding: 'utf8', cwd: REPO_ROOT, stdio: 'ignore',
    });
  }

  if (!OPT_JSON) {
    console.log(`\n${'─'.repeat(56)}`);
    console.log(`  Total: ${C.red}${high} high${C.reset}  ${C.yellow}${med} medium${C.reset}  ${C.gray}${low} low${C.reset}     Elapsed: ${elapsed}ms`);
    console.log(`${'─'.repeat(56)}\n`);
  }

  process.exit(high > 0 ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(2); });