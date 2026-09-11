#!/usr/bin/env node
/**
 * Semantic-768 authority diagnostic.
 *
 * This is a read-only successor to atlas-embedding-ranking-diagnostic-v1.mjs.
 * It deliberately does not rewrite the historical v1 report semantics.
 * Instead it forces the active Qdrant semantic projection to
 * codebase_chunks_768_v2/content, records PostgreSQL vector TYPE + population
 * independently, verifies the live EmbeddingGemma output width, and refuses to
 * call the result authority-ready while text/revision/identity joins are absent.
 *
 * No database, Qdrant, graph, cache, model, or projection writes are made.
 * The only writes are bounded JSON diagnostic artifacts under .tmp/docs/reports.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import {
  loadRepoEnv,
  resolveDatabaseUrl,
  REPO_ROOT,
} from './connection-config.mjs';

const execFileAsync = promisify(execFile);
const env = loadRepoEnv();
const argv = process.argv.slice(2);
const args = new Map();
for (let index = 0; index < argv.length; index += 1) {
  const value = argv[index];
  const match = value.match(/^--([^=]+)=(.*)$/);
  if (match) args.set(match[1], match[2]);
  else if (value.startsWith('--')) {
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      args.set(value.slice(2), next);
      index += 1;
    } else args.set(value.slice(2), 'true');
  }
}

const CANONICAL_COLLECTION = 'codebase_chunks_768_v2';
const CANONICAL_VECTOR_NAME = 'content';
const CANONICAL_DIMENSION = 768;
const CANONICAL_REPRESENTATION = 'semantic_768';
const QUERY = String(args.get('query') ?? 'ast semantic aware embedding retrieval ranking');
const LIMIT = Math.max(1, Math.min(512, Number(args.get('limit') ?? 128)));
const OUT = path.resolve(
  REPO_ROOT,
  String(args.get('out') ?? 'docs/reports/atlas-embedding-ranking-diagnostic-v2.json'),
);
const TMP = path.resolve(REPO_ROOT, '.tmp', 'atlas-embedding-ranking-diagnostic-v2-base.json');
const V1 = path.resolve(REPO_ROOT, 'scripts', 'atlas', 'atlas-embedding-ranking-diagnostic-v1.mjs');

function loadPg() {
  const roots = [
    path.join(REPO_ROOT, 'sveltekit-frontend', 'node_modules'),
    path.join(REPO_ROOT, 'node_modules'),
  ];
  for (const root of roots) {
    try {
      return createRequire(path.join(root, '_dummy.js'))('pg');
    } catch {}
  }
  throw new Error('pg package not found in workspace node_modules');
}

async function inspectPostgresVectors() {
  const { Pool } = loadPg();
  const pool = new Pool({ connectionString: resolveDatabaseUrl(env), max: 1 });
  try {
    const result = await pool.query(`
      SELECT
        a.attname AS column_name,
        pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type
      FROM pg_catalog.pg_attribute a
      JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'codebase_chunk_index'
        AND a.attnum > 0
        AND NOT a.attisdropped
        AND a.attname = ANY($1::text[])
      ORDER BY a.attname
    `, [[
      'content_embedding',
      'content_embedding_768',
      'summary_embedding',
      'summary_embedding_384',
      'signature_embedding',
      'error_embedding',
    ]]);

    const columns = result.rows.map((row) => ({
      column: row.column_name,
      dataType: row.data_type,
      dimension: Number(String(row.data_type).match(/\((\d+)\)/)?.[1] ?? 0) || null,
    }));

    const names = columns.map((row) => row.column);
    let counts = {};
    if (names.length) {
      const countResult = await pool.query(`
        SELECT ${names
          .map((name) => `COUNT(*) FILTER (WHERE "${name}" IS NOT NULL)::bigint AS "${name}"`)
          .join(', ')}
        FROM codebase_chunk_index
      `);
      counts = countResult.rows[0] ?? {};
    }

    return columns.map((column) => ({
      ...column,
      populatedRows: Number(counts[column.column] ?? 0),
      semantic768Candidate:
        column.dimension === CANONICAL_DIMENSION &&
        ['content_embedding', 'content_embedding_768'].includes(column.column),
      legacy384Artifact: column.dimension === 384 || column.column.endsWith('_384'),
    }));
  } finally {
    await pool.end();
  }
}

function countCoverage(candidates, predicate) {
  const count = candidates.filter(predicate).length;
  return {
    count,
    total: candidates.length,
    ratio: candidates.length ? count / candidates.length : 0,
  };
}

async function runV1() {
  fs.mkdirSync(path.dirname(TMP), { recursive: true });
  const childArgs = [
    V1,
    `--collection=${CANONICAL_COLLECTION}`,
    `--vector-name=${CANONICAL_VECTOR_NAME}`,
    `--query=${QUERY}`,
    `--limit=${LIMIT}`,
    `--out=${TMP}`,
  ];

  for (const passthrough of ['qdrant-url', 'embed-url', 'ollama-url', 'model', 'transport']) {
    if (args.has(passthrough)) childArgs.push(`--${passthrough}=${args.get(passthrough)}`);
  }

  try {
    await execFileAsync(process.execPath, childArgs, {
      cwd: REPO_ROOT,
      windowsHide: true,
      timeout: 180_000,
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch (error) {
    // v1 may exit non-zero on infrastructure failure but still writes a useful
    // report. Preserve that evidence instead of fabricating a successful base.
    if (!fs.existsSync(TMP)) throw error;
  }

  return JSON.parse(fs.readFileSync(TMP, 'utf8'));
}

async function main() {
  const started = Date.now();
  const report = {
    schema: 'atlas.embedding-ranking-diagnostic.v2',
    generatedAt: new Date().toISOString(),
    readOnly: true,
    query: QUERY,
    canonicalContract: {
      representationId: CANONICAL_REPRESENTATION,
      model: 'embeddinggemma:latest',
      nativeDimension: CANONICAL_DIMENSION,
      qdrantCollection: CANONICAL_COLLECTION,
      qdrantVectorName: CANONICAL_VECTOR_NAME,
      allowedMrlReferenceDimensions: [512, 256, 128],
      legacy384Policy: 'MIGRATION_REPLAY_ONLY_NOT_MRL_NOT_CANONICAL',
    },
    baseDiagnostic: null,
    postgresVectorStores: [],
    coverage: {},
    gates: {},
    blockingIssueCodes: [],
    status: 'UNKNOWN',
    elapsedMs: 0,
  };

  try {
    const [base, postgresVectorStores] = await Promise.all([
      runV1(),
      inspectPostgresVectors(),
    ]);
    report.baseDiagnostic = base;
    report.postgresVectorStores = postgresVectorStores;

    const candidates = base.ranking?.candidates ?? [];
    report.coverage = {
      postgresJoin: countCoverage(candidates, (row) => row.postgresMatch === true),
      canonicalPacketJoin: countCoverage(candidates, (row) => row.canonicalPacketMatch === true),
      candidateText: countCoverage(candidates, (row) => Boolean(String(row.candidateText ?? '').trim())),
      sourceRevision: countCoverage(candidates, (row) => Boolean(row.documentRevision)),
      graphRevision: countCoverage(candidates, (row) => Boolean(row.graphRevision)),
      representationRevision: countCoverage(candidates, (row) => row.representationRevision !== null && row.representationRevision !== undefined),
      astEvidence: countCoverage(candidates, (row) => Array.isArray(row.astSymbols) && row.astSymbols.length > 0),
    };

    const semanticStores768 = postgresVectorStores.filter(
      (row) => row.semantic768Candidate && row.populatedRows > 0,
    );
    const legacy384Stores = postgresVectorStores.filter(
      (row) => row.legacy384Artifact && row.populatedRows > 0,
    );

    report.gates = {
      embeddinggemmaNative768: base.embeddinggemma?.available === true && base.embeddinggemma?.dimension === CANONICAL_DIMENSION,
      qdrantCanonicalCollection: base.qdrant?.collection === CANONICAL_COLLECTION,
      qdrantContent768: base.qdrant?.vectorName === CANONICAL_VECTOR_NAME && base.qdrant?.vectorDimension === CANONICAL_DIMENSION,
      postgresHasPopulatedSemantic768: semanticStores768.length > 0,
      postgresIdentityJoinObserved: report.coverage.postgresJoin.count > 0,
      candidateTextObserved: report.coverage.candidateText.count > 0,
      sourceRevisionObserved: report.coverage.sourceRevision.count > 0,
      fullSourceRevisionCoverage:
        report.coverage.sourceRevision.total > 0 &&
        report.coverage.sourceRevision.count === report.coverage.sourceRevision.total,
      astEvidenceObserved: report.coverage.astEvidence.count > 0,
      noActive384AuthorityClaim: true,
    };

    if (!report.gates.embeddinggemmaNative768) report.blockingIssueCodes.push('EMBEDDINGGEMMA_NATIVE_768_NOT_PROVEN');
    if (!report.gates.qdrantCanonicalCollection) report.blockingIssueCodes.push('QDRANT_CANONICAL_768_V2_NOT_SELECTED');
    if (!report.gates.qdrantContent768) report.blockingIssueCodes.push('QDRANT_CONTENT_768_NOT_PROVEN');
    if (!report.gates.postgresHasPopulatedSemantic768) report.blockingIssueCodes.push('POSTGRES_SEMANTIC_768_STORE_NOT_POPULATED');
    if (!report.gates.postgresIdentityJoinObserved) report.blockingIssueCodes.push('POSTGRES_CURRENT_COHORT_JOIN_UNPROVEN');
    if (!report.gates.candidateTextObserved) report.blockingIssueCodes.push('CANDIDATE_TEXT_EVIDENCE_MISSING');
    if (!report.gates.sourceRevisionObserved) report.blockingIssueCodes.push('SOURCE_REVISION_EVIDENCE_MISSING');
    else if (!report.gates.fullSourceRevisionCoverage) report.blockingIssueCodes.push('SOURCE_REVISION_COVERAGE_PARTIAL');
    if (!report.gates.astEvidenceObserved) report.blockingIssueCodes.push('AST_EVIDENCE_JOIN_UNPROVEN');

    report.postgresSemantic768Candidates = semanticStores768;
    report.legacy384Artifacts = legacy384Stores;
    report.status = report.blockingIssueCodes.length === 0
      ? 'SEMANTIC_768_AUTHORITY_DIAGNOSTIC_PASS'
      : report.gates.embeddinggemmaNative768 && report.gates.qdrantContent768 && report.gates.postgresHasPopulatedSemantic768
        ? 'SEMANTIC_768_RUNTIME_PROVEN_LINEAGE_BLOCKED'
        : 'SEMANTIC_768_ALIGNMENT_BLOCKED';
  } catch (error) {
    report.status = 'SEMANTIC_768_DIAGNOSTIC_FAILED';
    report.blockingIssueCodes.push('DIAGNOSTIC_EXECUTION_FAILED');
    report.error = error instanceof Error ? error.message : String(error);
  }

  report.elapsedMs = Date.now() - started;
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    status: report.status,
    gates: report.gates,
    blockingIssueCodes: report.blockingIssueCodes,
    postgresSemantic768Candidates: report.postgresSemantic768Candidates,
    legacy384Artifacts: report.legacy384Artifacts,
    out: OUT,
  }, null, 2));

  if (report.status === 'SEMANTIC_768_DIAGNOSTIC_FAILED') process.exit(1);
}

main();
