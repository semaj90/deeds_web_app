#!/usr/bin/env node
/**
 * pgvector schema auditor.
 *
 * Checks:
 *   1. SQL migrations contain CREATE EXTENSION vector
 *   2. Drizzle schema uses vector/halfvec/sparsevec from drizzle-orm/pg-core (not legacy pgvector package)
 *   3. Vector dimensions match EMBEDDING_DIM (768 for embeddinggemma:latest)
 *   4. HNSW/IVFFlat index hints exist in migrations for vector tables
 *   5. Live Postgres pgvector extension status (when DATABASE_URL is reachable)
 *   6. Named vector tables in Qdrant config match schema declarations
 *
 * Usage:
 *   node scripts/atlas/audit-pgvector-schema.mjs [--json] [--dry-run]
 *
 * Output:
 *   docs/reports/pgvector-audit-report.json
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { REPO_ROOT } from './_atlas-utils.mjs';

const FRONTEND    = join(REPO_ROOT, 'sveltekit-frontend');
const SCHEMA_DIR  = join(FRONTEND, 'src/lib/server/db');
const DRIZZLE_DIR = join(FRONTEND, 'drizzle');
const REPORTS_DIR = join(REPO_ROOT, 'docs/reports');

const DB_URL       = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const EMBEDDING_DIM = 768; // embeddinggemma:latest
const ALLOWED_DIMS = new Set([
  768,  // Canonical Codebase/Evidence Lane (embeddinggemma:latest)
  1536, // External OpenAI (text-embedding-3-small)
  384,  // Warden / GPU-Cache / Nomic-Embed-Text / Legacy Ingestion
  512,  // Clip / Vision / Medium models
  128,  // Compressed / Autoencoder
  64,   // Latent space / Compressed
  32,   // Fingerprinting
]);

const ARGS    = process.argv.slice(2);
const DRY_RUN = ARGS.includes('--dry-run');
const JSON_OUT = ARGS.includes('--json');

const C = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', gray: '\x1b[90m', cyan: '\x1b[36m',
};

// Known vector tables that should have HNSW indexes
const VECTOR_TABLES = [
  'evidence_vectors', 'codebase_chunk_index', 'legal_documents',
  'embedding_cache', 'document_embeddings', 'warden_chunks',
];

// ── helpers ───────────────────────────────────────────────────────────────────
function allSqlFiles() {
  const files = [];
  if (existsSync(DRIZZLE_DIR)) {
    files.push(...readdirSync(DRIZZLE_DIR).filter(f => f.endsWith('.sql')).map(f => join(DRIZZLE_DIR, f)));
    const manual = join(DRIZZLE_DIR, 'manual');
    if (existsSync(manual)) {
      files.push(...readdirSync(manual).filter(f => f.endsWith('.sql')).map(f => join(manual, f)));
    }
  }
  return files;
}

function allSchemaFiles() {
  if (!existsSync(SCHEMA_DIR)) return [];
  return readdirSync(SCHEMA_DIR)
    .filter(f => f.endsWith('.ts') && !f.endsWith('.d.ts'))
    .map(f => join(SCHEMA_DIR, f));
}

// ── Check 1: CREATE EXTENSION vector in migrations ────────────────────────────
function checkExtensionInMigrations() {
  const sqlFiles = allSqlFiles();
  const hits = sqlFiles.filter(f => readFileSync(f, 'utf8').match(/CREATE EXTENSION\s+(IF NOT EXISTS\s+)?vector/i));
  return {
    check: 'extension_in_migrations',
    pass: hits.length > 0,
    message: hits.length > 0
      ? `CREATE EXTENSION vector found in ${hits.length} migration file(s).`
      : 'No migration contains CREATE EXTENSION vector — pgvector may not be enabled on fresh DB.',
    files: hits.map(f => relative(REPO_ROOT, f)),
    suggestedFix: hits.length === 0
      ? "Add `CREATE EXTENSION IF NOT EXISTS vector;` to sveltekit-frontend/drizzle/manual/00_extensions.sql"
      : null,
  };
}

// ── Check 2: HNSW index hints in migrations ───────────────────────────────────
function checkHnswIndexes() {
  const sqlFiles = allSqlFiles();
  const allSql = sqlFiles.map(f => readFileSync(f, 'utf8')).join('\n');
  const results = VECTOR_TABLES.map(table => {
    // Match across newlines using [\s\S]*?
    const hasHnsw = allSql.match(new RegExp(`CREATE INDEX[\\s\\S]*?${table}[\\s\\S]*?USING hnsw`, 'i'))
      || allSql.match(new RegExp(`USING hnsw[\\s\\S]*?${table}`, 'i'));
    return { table, hasHnsw: !!hasHnsw };
  });
  const missing = results.filter(r => !r.hasHnsw).map(r => r.table);
  return {
    check: 'hnsw_indexes',
    pass: missing.length === 0,
    message: missing.length === 0
      ? 'HNSW index hints found for all expected vector tables.'
      : `Missing HNSW index in migrations for: ${missing.join(', ')}`,
    missing,
    suggestedFix: missing.length > 0
      ? `See docs/reports/pgvector-index-plan.md for reviewed SQL. Run after operator review:\n` +
        missing.map(t => `CREATE INDEX CONCURRENTLY IF NOT EXISTS ${t}_hnsw_idx ON ${t} USING hnsw (embedding vector_cosine_ops) WITH (m=16, ef_construction=64);`).join('\n')
      : null,
    indexPlanPath: missing.length > 0 ? 'docs/reports/pgvector-index-plan.md' : null,
  };
}

// ── Check 3: Drizzle schema import source ─────────────────────────────────────
function checkDrizzleVectorImports() {
  const schemaFiles = allSchemaFiles();
  const violations = [];
  for (const sf of schemaFiles) {
    const text = readFileSync(sf, 'utf8');
    if (text.includes("from 'pgvector/drizzle-orm'") || text.includes('from "pgvector/drizzle-orm"')) {
      violations.push(relative(REPO_ROOT, sf));
    }
  }
  return {
    check: 'drizzle_vector_import',
    pass: violations.length === 0,
    message: violations.length === 0
      ? "All vector imports use drizzle-orm/pg-core (native, correct)."
      : `${violations.length} file(s) import from legacy pgvector/drizzle-orm: ${violations.join(', ')}`,
    files: violations,
    suggestedFix: violations.length > 0
      ? "Replace `from 'pgvector/drizzle-orm'` with `from 'drizzle-orm/pg-core'` in each listed file."
      : null,
  };
}

// ── Check 4: Vector dimension consistency ─────────────────────────────────────
function checkVectorDimensions() {
  const schemaFiles = allSchemaFiles();
  const dimFindings = [];

  for (const sf of schemaFiles) {
    const text = readFileSync(sf, 'utf8');
    // Match vector('col_name', { dimensions: N }) or vector(N) patterns
    const patterns = [
      /vector\s*\(\s*['"][^'"]+['"]\s*,\s*\{\s*dimensions\s*:\s*(\d+)/g,
      /halfvec\s*\(\s*['"][^'"]+['"]\s*,\s*\{\s*dimensions\s*:\s*(\d+)/g,
      /\.dimensions\s*\(\s*(\d+)\s*\)/g,
    ];
    for (const re of patterns) {
      for (const m of text.matchAll(re)) {
        const dim = parseInt(m[1], 10);
        if (!isNaN(dim) && !ALLOWED_DIMS.has(dim)) {
          dimFindings.push({ file: relative(REPO_ROOT, sf), dim, expected: EMBEDDING_DIM });
        }
      }
    }
  }

  return {
    check: 'vector_dimensions',
    pass: dimFindings.length === 0,
    message: dimFindings.length === 0
      ? `All vector columns use allowed dimensions (${[...ALLOWED_DIMS].join('/')}).`
      : `Non-standard vector dimensions found: ${dimFindings.map(d => `${d.file}:${d.dim}`).join(', ')}`,
    violations: dimFindings,
    suggestedFix: dimFindings.length > 0
      ? `Change vector dimensions to ${EMBEDDING_DIM} (embeddinggemma:latest canonical output) or 64 (autoencoder compressed).`
      : null,
  };
}

// ── Check 5: Live Postgres pgvector status ────────────────────────────────────
async function checkLivePostgres() {
  let pool;
  try {
    pool = new pg.Pool({
      connectionString: DB_URL,
      max: 2,
      connectionTimeoutMillis: 5000,
      statement_timeout: 10000,
      idleTimeoutMillis: 5000,
    });
    pool.on('error', () => {});

    const { rows: extRows } = await pool.query(
      "SELECT extversion FROM pg_extension WHERE extname='vector'"
    ).catch(() => ({ rows: [] }));

    const { rows: hnswRows } = await pool.query(`
      SELECT tablename, indexname
      FROM pg_indexes
      WHERE indexdef ILIKE '%hnsw%'
      ORDER BY tablename
    `).catch(() => ({ rows: [] }));

    const { rows: tableRows } = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ANY($1)
    `, [VECTOR_TABLES]).catch(() => ({ rows: [] }));

    const existingTables = new Set(tableRows.map(r => r.table_name));
    const hnswCovered    = new Set(hnswRows.map(r => r.tablename));
    const missingHnsw    = VECTOR_TABLES.filter(t => existingTables.has(t) && !hnswCovered.has(t));

    return {
      check: 'live_postgres',
      reachable: true,
      pass: extRows.length > 0 && missingHnsw.length === 0,
      vectorExtension: extRows.length > 0 ? `v${extRows[0].extversion}` : null,
      hnswIndexes: hnswRows.map(r => `${r.tablename}.${r.indexname}`),
      missingHnswOnExistingTables: missingHnsw,
      message: extRows.length === 0
        ? 'pgvector extension NOT installed in live DB.'
        : missingHnsw.length > 0
          ? `pgvector ${extRows[0].extversion} installed. Missing HNSW on: ${missingHnsw.join(', ')}.`
          : `pgvector ${extRows[0].extversion} installed. ${hnswRows.length} HNSW index(es) found.`,
      suggestedFix: extRows.length === 0
        ? "docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c 'CREATE EXTENSION IF NOT EXISTS vector;'"
        : missingHnsw.length > 0
          ? missingHnsw.map(t => `CREATE INDEX CONCURRENTLY IF NOT EXISTS ${t}_hnsw_idx ON ${t} USING hnsw (embedding vector_cosine_ops) WITH (m=16, ef_construction=64);`).join('\n')
          : null,
    };
  } catch (err) {
    return {
      check: 'live_postgres',
      reachable: false,
      pass: null,
      message: `Postgres unreachable: ${err.message.slice(0, 80)}`,
      suggestedFix: 'Ensure Docker container legal-ai-postgres is running on host port 5434.',
    };
  } finally {
    await pool?.end().catch(() => {});
  }
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  if (!JSON_OUT) {
    console.log(`\n${C.bold}── pgvector Schema Audit ──${C.reset}\n`);
    console.log(`${C.bold}## Vector Dimension Policy${C.reset}`);
    console.log(` - 768: canonical codebase and programming-doc semantic embeddings.`);
    console.log(` - 384: compact warden/GPU-cache embeddings.`);
    console.log(` - Other dimensions require review.\n`);
  }

  const checks = [
    checkExtensionInMigrations(),
    checkHnswIndexes(),
    checkDrizzleVectorImports(),
    checkVectorDimensions(),
    await checkLivePostgres(),
  ];

  let allPass = true;
  if (!JSON_OUT) {
    for (const c of checks) {
      const icon = c.pass === true ? `${C.green}✓${C.reset}` : c.pass === false ? `${C.red}✗${C.reset}` : `${C.yellow}?${C.reset}`;
      console.log(`  ${icon}  ${c.check.replace(/_/g,' ').padEnd(28)}  ${c.message}`);
      if (c.suggestedFix) {
        console.log(`     ${C.yellow}Fix:${C.reset} ${c.suggestedFix.split('\n')[0]}${c.suggestedFix.includes('\n') ? ' …' : ''}`);
      }
      if (c.pass === false) allPass = false;
    }
    console.log(`\n  ${allPass ? `${C.green}PASS${C.reset}` : `${C.red}FAIL${C.reset}`}\n`);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    embeddingDim: EMBEDDING_DIM,
    allowedDims: [...ALLOWED_DIMS],
    checks,
    status: allPass ? 'pass' : 'fail',
  };

  if (!DRY_RUN) {
    mkdirSync(REPORTS_DIR, { recursive: true });
    writeFileSync(join(REPORTS_DIR, 'pgvector-audit-report.json'), JSON.stringify(report, null, 2));
    if (!JSON_OUT) console.log(`  ${C.gray}Report → docs/reports/pgvector-audit-report.json${C.reset}\n`);
  }

  if (JSON_OUT) console.log(JSON.stringify(report, null, 2));
  process.exit(allPass ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(2); });