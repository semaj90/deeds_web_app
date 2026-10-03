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
const DEFAULT_REPORT_PATH = path.join(ROOT, 'docs', 'reports', 'semantic-768-writer-ownership-v1.json');
const args = new Map(process.argv.slice(2).map((arg) => {
  const index = arg.indexOf('=');
  return index < 0 ? [arg, true] : [arg.slice(0, index), arg.slice(index + 1)];
}));
const STATIC_ONLY = args.has('--static-only');
const requestedOutput = args.get('--output');
const REPORT_PATH = requestedOutput
  ? path.resolve(ROOT, String(requestedOutput))
  : DEFAULT_REPORT_PATH;
if (REPORT_PATH !== ROOT && !REPORT_PATH.startsWith(`${ROOT}${path.sep}`)) {
  throw new Error('REPORT_OUTPUT_MUST_REMAIN_WITHIN_REPOSITORY');
}
// Cover every first-party runtime surface that can own embedding production,
// not only the Node/Svelte paths. Omitting Python, service, worker, native, or
// nested SvelteKit scripts can turn an incomplete census into false uniqueness.
const SCAN_ROOTS = [
  'scripts',
  'packages',
  'src',
  'python',
  'python-workers',
  'services',
  'cmd',
  'crates',
  'native',
  'workers',
  'go-retrieval-classifier',
  'sveltekit-frontend/src',
  'sveltekit-frontend/scripts',
  'docker',
  'infra',
  'drizzle',
  'migrations',
  'sql',
  'sveltekit-frontend/package.json',
  'package.json',
];
const TARGETS = [
  { surface: 'codebase_chunk_index.content_embedding_768', role: 'CANONICAL_CONTRACT_TARGET_OWNER_UNPROVEN', patterns: [/content_embedding_768\s*=/i, /INSERT INTO codebase_chunk_index[\s\S]{0,1200}content_embedding_768/i] },
  { surface: 'codebase_chunk_index.content_embedding', role: 'HISTORICAL_OR_TRANSITIONAL_SURFACE', patterns: [/UPDATE\s+codebase_chunk_index[\s\S]{0,500}(?<!_)content_embedding\s*=/i, /INSERT INTO codebase_chunk_index[\s\S]{0,1200}(?<!_)content_embedding\b/i] },
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
  if (/\.(?:test|spec)\.(?:mjs|mts|ts|sql)$/i.test(relative)) return null;
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
    const { rows: codebaseColumns } = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'codebase_chunk_index'
      ORDER BY ordinal_position`);
    const columnTypes = new Map(codebaseColumns.map((row) => [row.column_name, row.data_type]));
    let canonical768ProvenanceCensus = { available: false, reason: 'CANONICAL_768_COLUMN_ABSENT' };
    if (columnTypes.has('content_embedding_768')) {
      const scalarFields = [
        'source_revision', 'workspace_revision', 'representation_revision',
        'lineage_producer_revision', 'content_hash', 'embedding_model',
        'embedding_version', 'embedding_dimension', 'embedding_normalized',
        'embedding_created_at', 'encoder_id',
      ].filter((name) => columnTypes.has(name));
      const jsonFields = ['metadata', 'output_meta', 'summary_provenance']
        .filter((name) => columnTypes.get(name) === 'jsonb');
      const quoteIdentifier = (name) => `"${name.replaceAll('"', '""')}"`;
      const selectParts = [
        'COUNT(*)::int AS total',
        ...scalarFields.map((name) =>
          `COUNT(*) FILTER (WHERE ${quoteIdentifier(name)} IS NOT NULL)::int AS ${quoteIdentifier(`${name}_present`)}`),
        ...jsonFields.flatMap((column) => [
          'source_revision', 'workspace_revision', 'representation_revision',
          'embedding_model_revision', 'tokenizer_revision', 'input_digest',
          'vector_digest', 'producer_revision',
        ].map((key) =>
          `COUNT(*) FILTER (WHERE NULLIF(${quoteIdentifier(column)}->>'${key}', '') IS NOT NULL)::int AS ${quoteIdentifier(`${column}_${key}_present`)}`)),
      ];
      const { rows: [provenance] } = await pool.query(`
        SELECT ${selectParts.join(',\n               ')}
        FROM public.codebase_chunk_index
        WHERE content_embedding_768 IS NOT NULL`);
      const { rows: modelDistribution } = columnTypes.has('embedding_model')
        ? await pool.query(`
          SELECT embedding_model, COUNT(*)::int AS rows
          FROM public.codebase_chunk_index
          WHERE content_embedding_768 IS NOT NULL
          GROUP BY embedding_model
          ORDER BY COUNT(*) DESC, embedding_model NULLS LAST
          LIMIT 10`)
        : { rows: [] };
      canonical768ProvenanceCensus = {
        available: true,
        target: 'codebase_chunk_index.content_embedding_768',
        rowCount: provenance.total,
        populatedFields: provenance,
        modelDistribution,
        interpretation: 'Presence of metadata/output_meta does not imply nested provenance; field counts are measured only on rows with the canonical 768-D vector populated.',
      };
    }
    return { reachable: true, counts, canonical768ProvenanceCensus };
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
  const live = STATIC_ONLY
    ? { reachable: false, reason: 'SKIPPED_BY_STATIC_ONLY_MODE' }
    : await liveCensus();
  const mutationWriters = writers.filter((writer) => writer.kind === 'MUTATION_WRITER');
  const writersBySurface = Object.fromEntries(TARGETS.map(({ surface }) => [
    surface,
    mutationWriters.filter((writer) => writer.surface === surface).map((writer) => writer.path),
  ]));
  const canonicalTargetWriterPaths = writersBySurface['codebase_chunk_index.content_embedding_768'];
  const legacySurfaceWriterPaths = [
    ...writersBySurface['codebase_chunk_index.content_embedding'],
    ...writersBySurface['atlas_packets.embedding'],
  ];
  const report = {
    schema: 'atlas.semantic-768-writer-ownership.v1',
    generatedAt: new Date().toISOString(),
    scannedRoots: SCAN_ROOTS,
    readOnly: true,
    canonicalAuthority: 'postgres',
    canonicalRepresentationSurface: 'codebase_chunk_index.content_embedding_768',
    writerOwnerStatus: 'UNRESOLVED_NOT_PROMOTED',
    writersBySurface,
    ownershipComparison: {
      canonicalTargetWriterCandidates: canonicalTargetWriterPaths,
      legacySurfaceWriterCandidates: [...new Set(legacySurfaceWriterPaths)].sort(),
      historicalEvidence: 'scripts/atlas/sem768-corpus-bundle-01.mts',
      decision: canonicalTargetWriterPaths.length === 1
        ? 'SINGLE_STATIC_CANONICAL_TARGET_CANDIDATE_NOT_PROMOTED'
        : canonicalTargetWriterPaths.length === 0
          ? 'NO_STATIC_CANONICAL_TARGET_WRITER_FOUND'
          : 'MULTIPLE_STATIC_CANONICAL_TARGET_WRITERS_UNRESOLVED',
      reason: canonicalTargetWriterPaths.length === 1
        ? 'The daily operator path and historical corpus producer target the legacy content_embedding surface, not content_embedding_768. One bounded writer statically targets the canonical column, but its 15-row scope and incomplete per-row provenance/readback do not establish it as the general canonical owner.'
        : 'Classify writers by exact physical column. Legacy content_embedding and atlas_packets.embedding writers do not establish ownership of content_embedding_768; canonical-target candidates require revision-qualified provenance and independent readback.',
    },
    writers,
    mutationWriters,
    physicalOwnerMutationWriters,
    fullyQualifiedPhysicalWriters,
    operatorEntrypoints: [
      { command: 'npm run atlas:graphify:embedding:daily:apply', target: 'codebase_chunk_index.content_embedding', status: 'HISTORICAL_SURFACE_REQUIRES_OWNER_REVIEW' },
    ],
    projectionExecutors: [
      { command: 'npm run atlas:index:full-repo', target: 'Qdrant codebase_chunks_768/content', postgresSemanticWrite: false },
      { command: 'POST /api/codebase-index/index-stream', target: 'Qdrant content vector + PostgreSQL metadata/auxiliary vectors', postgresSemanticWrite: false },
    ],
    ownerDecision: {
      selectedWriter: null,
      status: 'OWNER_NOT_PROVEN',
      reason: 'No general semantic writer is promoted: the remaining guarded writer is a 15-row lineage-qualified backfill, while historical surfaces and full-corpus provenance/readback remain unresolved.',
    },
    live,
    verdict: 'OWNER_NOT_PROVEN',
    admissionBlockers: [
      'multiple 768 surfaces remain populated or referenced',
      'the guarded backfill is cohort-specific and does not prove a general revision-qualified semantic owner',
      'representation ledger and independent Qdrant readback remain open',
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
  const reportTempPath = `${REPORT_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(reportTempPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.renameSync(reportTempPath, REPORT_PATH);
  console.log(JSON.stringify({ reportPath: REPORT_PATH, verdict: report.verdict, writerCount: writers.length, live }, null, 2));
}

main().catch((error) => { console.error(error?.stack || error); process.exitCode = 1; });
