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

// IMPORTANT: content_embedding must be matched as a whole SQL identifier. The
// previous census treated content_embedding_768 as content_embedding because
// the regex stopped at the shared prefix, inflating current-writer counts.
const TARGETS = [
  {
    surface: 'codebase_chunk_index.content_embedding',
    role: 'ACTIVE_CANONICAL_CANDIDATE',
    patterns: [
      /UPDATE\s+(?:public\.)?codebase_chunk_index[\s\S]{0,1800}\bcontent_embedding\b(?!_768)\s*=/i,
      /INSERT\s+INTO\s+(?:public\.)?codebase_chunk_index[\s\S]{0,1800}\bcontent_embedding\b(?!_768)/i,
    ],
  },
  {
    surface: 'codebase_chunk_index.content_embedding_768',
    role: 'LEGACY_OR_TRANSITIONAL',
    patterns: [
      /\bcontent_embedding_768\b\s*=/i,
      /INSERT\s+INTO\s+(?:public\.)?codebase_chunk_index[\s\S]{0,1800}\bcontent_embedding_768\b/i,
    ],
  },
  {
    surface: 'atlas_packets.embedding',
    role: 'SECONDARY_768_SURFACE_UNRESOLVED',
    patterns: [
      /UPDATE\s+(?:public\.)?atlas_packets[\s\S]{0,800}\bembedding\b\s*=/i,
      /INSERT\s+INTO\s+(?:public\.)?atlas_packets[\s\S]{0,1800}\bembedding\b/i,
    ],
  },
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

function exactMutationForTarget(source, target) {
  if (target.surface === 'atlas_packets.embedding') {
    return /\b(?:INSERT\s+INTO|UPDATE)\s+(?:public\.)?atlas_packets\b/i.test(source)
      && /\bembedding\b\s*=/i.test(source);
  }
  if (target.surface === 'codebase_chunk_index.content_embedding_768') {
    return /\b(?:INSERT\s+INTO|UPDATE)\s+(?:public\.)?codebase_chunk_index\b/i.test(source)
      && /\bcontent_embedding_768\b/i.test(source);
  }
  return /\b(?:INSERT\s+INTO|UPDATE)\s+(?:public\.)?codebase_chunk_index\b/i.test(source)
    && /\bcontent_embedding\b(?!_768)\s*=/i.test(source);
}

function classify(relative, source, target) {
  if (relative.endsWith('audit-semantic-768-writer-ownership-v1.mjs')) return null;
  const applies = target.patterns.some((pattern) => pattern.test(source));
  if (!applies) return null;

  const mutation = exactMutationForTarget(source, target);
  const revisionQualified = /source_revision|sourceRevision/i.test(source)
    && /workspace_revision|workspaceRevision/i.test(source);
  const guarded = /WHERE[\s\S]{0,2400}(source_revision|sourceRevision)[\s\S]{0,2400}(workspace_revision|workspaceRevision)/i.test(source)
    || /EXISTS\s*\([\s\S]{0,2400}(source_revision|sourceRevision)[\s\S]{0,2400}(workspace_revision|workspaceRevision)/i.test(source);
  const canonicalLineageQualified = /atlas_packet_chunk_lineage/i.test(source)
    && /canonical_chunk_id|canonicalChunkId/i.test(source)
    && /packet_key|packetKey/i.test(source)
    && /revision_status\s*=\s*['"]PROVEN['"]/i.test(source);
  const independentReadback = /readback/i.test(source)
    && /vector_dims\s*\(|dimensions/i.test(source)
    && /embedding_version|representationRevision/i.test(source);
  const dryRun = /dry[-_ ]?run|read[-_ ]only|DRY_RUN/i.test(source);
  const entrypoint = /package\.json$|startup|route|worker|daemon|index-stream/i.test(relative);
  const explicitApply = /--apply|\bAPPLY\b|ATLAS_AUTHORIZE_SEMANTIC_768_BACKFILL|EXPLICIT_SEMANTIC_768_BACKFILL_AUTHORIZATION_REQUIRED/i.test(source);

  return {
    path: relative,
    surface: target.surface,
    role: target.role,
    kind: mutation ? 'MUTATION_WRITER' : 'READER_OR_DIAGNOSTIC',
    revisionQualified,
    guarded,
    canonicalLineageQualified,
    independentReadback,
    explicitApply,
    dryRun,
    productionReachableCandidate: entrypoint,
  };
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
  const physicalOwnerMutationWriters = mutationWriters.filter((writer) => writer.surface === 'codebase_chunk_index.content_embedding');
  const fullyQualifiedPhysicalWriters = physicalOwnerMutationWriters.filter((writer) =>
    writer.revisionQualified
    && writer.guarded
    && writer.canonicalLineageQualified
    && writer.independentReadback
    && writer.explicitApply);

  const report = {
    schema: 'atlas.semantic-768-writer-ownership.v1',
    generatedAt: new Date().toISOString(),
    readOnly: true,
    canonicalAuthority: 'postgres',
    activeCandidate: 'codebase_chunk_index.content_embedding',
    physicalOwner: {
      table: 'codebase_chunk_index',
      column: 'content_embedding',
      representationId: 'semantic_768',
      dimensions: 768,
    },
    ownershipComparison: {
      historicalDominantProducer: 'scripts/atlas/reembed-corpus-document-prefix-v1.mjs',
      operatorReachableCandidate: 'scripts/atlas/backfill-graphify-file-embeddings-768.mjs',
      historicalEvidence: 'scripts/atlas/sem768-corpus-bundle-01.mts',
      decision: fullyQualifiedPhysicalWriters.length === 1
        ? 'ONE_REVISION_QUALIFIED_CURRENT_WRITER_CANDIDATE'
        : 'UNRESOLVED_WRITER_SPLIT',
      reason: fullyQualifiedPhysicalWriters.length === 1
        ? 'Exactly one physical-owner writer exposes canonical packet/chunk lineage, source/workspace guards, explicit apply authorization, and independent readback. Historical migration writers remain separately classified by the adjudication gate.'
        : 'Current physical-owner mutation paths have not converged to exactly one fully revision-qualified canonical writer candidate.',
    },
    writers,
    mutationWriters,
    physicalOwnerMutationWriters,
    fullyQualifiedPhysicalWriters,
    operatorEntrypoints: [
      { command: 'npm run atlas:graphify:embedding:daily:apply', target: 'codebase_chunk_index.content_embedding', status: 'CANONICAL_WRITER_CANDIDATE_REQUIRES_OWNER_GATE' },
      { command: 'npm run atlas:index:full-repo', target: 'codebase_chunk_index.content_embedding_768', status: 'LEGACY_APPLY_PATH' },
      { command: 'POST /api/codebase-index/index-stream', target: 'codebase_chunk_index.content_embedding_768', status: 'REACHABLE_LEGACY_SURFACE' },
    ],
    ownerDecision: {
      selectedWriter: null,
      status: 'OWNER_NOT_PROVEN',
      reason: 'The census identifies candidates only. Final owner admission belongs to SEMANTIC-768-PHYSICAL-OWNER-01 and requires exactly one current writer after migration/historical surfaces are classified.',
    },
    live,
    verdict: 'OWNER_NOT_PROVEN',
    admissionBlockers: [
      'current writer adjudication has not yet been replayed after the exact-column census correction',
      'historical content_embedding migration writers still require explicit non-current classification',
      'canonical current corpus admission remains separate from physical writer ownership',
    ],
    writesPerformed: false,
  };
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    reportPath: REPORT_PATH,
    verdict: report.verdict,
    writerCount: writers.length,
    physicalOwnerMutationWriterCount: physicalOwnerMutationWriters.length,
    fullyQualifiedPhysicalWriterCount: fullyQualifiedPhysicalWriters.length,
    live,
  }, null, 2));
}

main().catch((error) => { console.error(error?.stack || error); process.exitCode = 1; });
