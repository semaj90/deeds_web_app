#!/usr/bin/env node

/**
 * Read-only census of semantic 768 writers and live population surfaces.
 * This inventories source paths and PostgreSQL counts; it never executes a
 * writer, changes schema, or mutates a projection.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPORT_PATH = path.join(ROOT, 'docs', 'reports', 'semantic-768-writer-ownership-v1.json');
const SCAN_ROOTS = ['scripts', 'packages', 'sveltekit-frontend/src', 'sveltekit-frontend/package.json', 'package.json', 'drizzle'];
const TARGETS = [
  { surface: 'codebase_chunk_index.content_embedding', role: 'ACTIVE_CANONICAL_CANDIDATE', patterns: [/UPDATE\s+codebase_chunk_index[\s\S]{0,500}content_embedding\s*=/i, /INSERT INTO codebase_chunk_index[\s\S]{0,1200}content_embedding/i] },
  { surface: 'codebase_chunk_index.content_embedding_768', role: 'LEGACY_OR_TRANSITIONAL', patterns: [/content_embedding_768\s*=/i, /INSERT INTO codebase_chunk_index[\s\S]{0,1200}content_embedding_768/i] },
  { surface: 'atlas_packets.embedding', role: 'SECONDARY_768_SURFACE_UNRESOLVED', patterns: [/UPDATE\s+atlas_packets[\s\S]{0,500}\bembedding\s*=/i, /INSERT INTO atlas_packets[\s\S]{0,1200}\bembedding/i] },
];

function listFiles() {
  try {
    return execFileSync('rg', [
      '--files', ...SCAN_ROOTS,
      '--glob', '*.mjs', '--glob', '*.mts', '--glob', '*.ts', '--glob', '*.sql',
      '--glob', 'package.json', '--glob', '!**/node_modules/**', '--glob', '!**/backup/**',
    ], { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
      .split(/\r?\n/).map((file) => file.trim()).filter(Boolean);
  } catch { return []; }
}

function read(relative) {
  try {
    const absolute = path.join(ROOT, relative);
    if (fs.statSync(absolute).size > 3 * 1024 * 1024) return '';
    return fs.readFileSync(absolute, 'utf8');
  } catch { return ''; }
}

function classify(relative, source, target) {
  if (relative.endsWith('audit-semantic-768-writer-ownership-v1.mjs')) return null;
  const applies = target.patterns.some((pattern) => pattern.test(source));
  if (!applies) return null;
  const mutation = /\b(?:INSERT\s+INTO|UPDATE)\s+(?:public\.)?(?:codebase_chunk_index|atlas_packets)\b/i.test(source)
    && (target.surface === 'atlas_packets.embedding'
      ? /\bembedding\s*=/i.test(source)
      : new RegExp(target.surface.split('.')[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*=', 'i').test(source)
        || new RegExp('INSERT INTO[\\s\\S]{0,1200}' + target.surface.split('.')[1], 'i').test(source));
  const revisionQualified = /source_revision|sourceRevision/i.test(source)
    && /workspace_revision|workspaceRevision/i.test(source);
  const guarded = /WHERE[\s\S]{0,800}(source_revision|sourceRevision)[\s\S]{0,800}(workspace_revision|workspaceRevision)/i.test(source);
  const dryRun = /dry[-_ ]?run|read[-_ ]only/i.test(source);
  const entrypoint = /package\.json$|startup|route|worker|daemon|index-stream/i.test(relative);
  return { path: relative, role: target.role, kind: mutation ? 'MUTATION_WRITER' : 'READER_OR_DIAGNOSTIC', revisionQualified, guarded, dryRun, productionReachableCandidate: entrypoint };
}

async function liveCensus() {
  const databaseUrl = resolveDatabaseUrl(loadRepoEnv());
  if (!databaseUrl) return { reachable: false, reason: 'DATABASE_URL_UNAVAILABLE' };
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const { rows } = await pool.query(`
      SELECT table_name, column_name, udt_name
      FROM information_schema.columns
      WHERE (table_name = 'codebase_chunk_index' AND column_name IN ('content_embedding', 'content_embedding_768'))
         OR (table_name = 'atlas_packets' AND column_name = 'embedding')
      ORDER BY table_name, column_name`);
    const counts = {};
    for (const row of rows) {
      const table = `${row.table_name}.${row.column_name}`;
      const count = await pool.query(`SELECT COUNT(*)::int AS total, COUNT(${row.column_name})::int AS populated FROM public.${row.table_name}`);
      counts[table] = { type: row.udt_name, total: count.rows[0].total, populated: count.rows[0].populated };
    }
    return { reachable: true, counts };
  } finally { await pool.end(); }
}

async function main() {
  const files = listFiles();
  const writers = [];
  for (const file of files) {
    const source = read(file);
    if (!source) continue;
    for (const target of TARGETS) {
      const result = classify(file, source, target);
      if (result) writers.push(result);
    }
  }
  const live = await liveCensus();
  const mutationWriters = writers.filter((writer) => writer.kind === 'MUTATION_WRITER');
  const report = {
    schema: 'atlas.semantic-768-writer-ownership.v1',
    generatedAt: new Date().toISOString(),
    readOnly: true,
    canonicalAuthority: 'postgres',
    activeCandidate: 'codebase_chunk_index.content_embedding',
    ownershipComparison: {
      historicalDominantProducer: 'scripts/atlas/reembed-corpus-document-prefix-v1.mjs',
      operatorReachableCandidate: 'scripts/atlas/backfill-graphify-file-embeddings-768.mjs',
      historicalEvidence: 'scripts/atlas/sem768-corpus-bundle-01.mts',
      decision: 'UNRESOLVED_WRITER_SPLIT',
      reason: 'The historical dominant producer and the daily operator path are different files; neither is promoted without one revision-qualified contract and independent readback.',
    },
    writers,
    mutationWriters,
    operatorEntrypoints: [
      { command: 'npm run atlas:graphify:embedding:daily:apply', target: 'codebase_chunk_index.content_embedding', status: 'EXPLICIT_APPLY_PATH_REQUIRES_REVIEW' },
      { command: 'npm run atlas:index:full-repo', target: 'codebase_chunk_index.content_embedding_768', status: 'LEGACY_APPLY_PATH' },
      { command: 'POST /api/codebase-index/index-stream', target: 'codebase_chunk_index.content_embedding_768', status: 'REACHABLE_LEGACY_SURFACE' },
    ],
    ownerDecision: {
      selectedWriter: null,
      status: 'OWNER_NOT_PROVEN',
      reason: 'Multiple mutation-capable paths remain and at least one active candidate lacks both source and workspace revision guards.',
    },
    live,
    verdict: 'OWNER_NOT_PROVEN',
    admissionBlockers: [
      'multiple 768 surfaces remain populated or referenced',
      'active writer census does not prove one revision-qualified owner',
      'representation ledger and independent Qdrant readback remain open',
    ],
    writesPerformed: false,
  };
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ reportPath: REPORT_PATH, verdict: report.verdict, writerCount: writers.length, live }, null, 2));
}

main().catch((error) => { console.error(error?.stack || error); process.exitCode = 1; });
