#!/usr/bin/env node
/**
 * Read-only embedding and retrieval ranking diagnostic.
 *
 * Owners:
 *   Postgres  : canonical pgvector/halfvec and AST metadata
 *   Qdrant    : semantic projection and bounded vector fetch
 *   TurboVec  : optional accelerator probe over the fetched Qdrant vectors
 *   EmbeddingGemma : query embedding only
 *
 * This script never writes Postgres or Qdrant. TurboVec indexing is opt-in
 * because /build changes accelerator state, even though it does not change
 * canonical application data.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const args = new Map();
for (const arg of process.argv.slice(2)) {
  const match = arg.match(/^--([^=]+)=(.*)$/);
  if (match) args.set(match[1], match[2]);
  else if (arg.startsWith('--')) args.set(arg.slice(2), 'true');
}

const env = loadRepoEnv();
const LIMIT = Math.max(1, Math.min(512, Number(args.get('limit') ?? 128)));
const QUERY = String(args.get('query') ?? 'ast semantic aware embedding retrieval ranking');
const QDRANT_URL = String(args.get('qdrant-url') ?? env.QDRANT_URL ?? 'http://127.0.0.1:6333').replace(/\/+$/, '');
const COLLECTION = String(args.get('collection') ?? env.QDRANT_CODE_COLLECTION ?? 'codebase_chunks_768');
const VECTOR_NAME = String(args.get('vector-name') ?? env.QDRANT_CODE_VECTOR_NAME ?? 'content');
const EMBED_URL = String(args.get('embed-url') ?? env.EMBED_SERVER_URL ?? env.EMBEDDING_URL ?? env.OLLAMA_URL ?? 'http://127.0.0.1:11434').replace(/\/+$/, '');
const OLLAMA_URL = String(args.get('ollama-url') ?? env.OLLAMA_URL ?? 'http://127.0.0.1:11434').replace(/\/+$/, '');
const EMBED_MODEL = String(args.get('model') ?? env.EMBEDDINGGEMMA_MODEL ?? env.EMBEDDING_GEMMA_MODEL ?? 'embeddinggemma:latest');
const TURBOVEC_URL = String(args.get('turbovec-http') ?? env.TURBOVEC_PYTHON_URL ?? 'http://127.0.0.1:8791').replace(/\/+$/, '');
const WITH_TURBOVEC = args.get('with-turbovec') === 'true';
const OUT = path.resolve(REPO_ROOT, String(args.get('out') ?? 'docs/reports/atlas-embedding-ranking-diagnostic-v1.json'));

const VECTOR_COLUMNS = ['content_embedding_768', 'content_embedding', 'embedding_768', 'embedding'];
const AST_COLUMNS = ['ast_symbols', 'ast_nodes', 'symbols'];
const execFileAsync = promisify(execFile);

function loadPg() {
  const roots = [path.join(REPO_ROOT, 'sveltekit-frontend', 'node_modules'), path.join(REPO_ROOT, 'node_modules')];
  for (const root of roots) {
    try { return createRequire(path.join(root, '_dummy.js'))('pg'); } catch {}
  }
  throw new Error('pg package not found in workspace node_modules');
}

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(options.timeoutMs ?? 30_000) });
  const text = await response.text();
  let body = {};
  try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 300) }; }
  if (!response.ok) throw new Error(`${url} HTTP ${response.status}: ${text.slice(0, 300)}`);
  return body;
}

function vectorFromPoint(point) {
  if (Array.isArray(point?.vector)) return point.vector.map(Number);
  if (point?.vector && typeof point.vector === 'object') {
    if (Array.isArray(point.vector[VECTOR_NAME])) return point.vector[VECTOR_NAME].map(Number);
    for (const value of Object.values(point.vector)) if (Array.isArray(value)) return value.map(Number);
  }
  return null;
}

function parseVector(value) {
  if (Array.isArray(value)) return value.map(Number);
  if (typeof value !== 'string') return null;
  const text = value.trim().replace(/^\[|\]$/g, '');
  if (!text) return null;
  const values = text.split(',').map(Number);
  return values.every(Number.isFinite) ? values : null;
}

function asStrings(value) {
  if (Array.isArray(value)) return value.flatMap((item) => {
    if (typeof item === 'string') return [item];
    if (item && typeof item === 'object') return [item.name, item.symbol, item.text].filter(Boolean).map(String);
    return [];
  });
  if (value && typeof value === 'object') return Object.values(value).flatMap(asStrings);
  return typeof value === 'string' ? [value] : [];
}

function tokens(value) {
  return new Set(String(value ?? '').toLowerCase().split(/[^a-z0-9_$]+/).filter((token) => token.length >= 2));
}

function overlap(queryTokens, values) {
  const candidateTokens = tokens(values.join(' '));
  if (!queryTokens.size || !candidateTokens.size) return 0;
  let hits = 0;
  for (const token of queryTokens) if (candidateTokens.has(token)) hits += 1;
  return hits / queryTokens.size;
}

function cosine(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) return null;
  let dot = 0; let an = 0; let bn = 0;
  for (let i = 0; i < a.length; i += 1) { dot += a[i] * b[i]; an += a[i] ** 2; bn += b[i] ** 2; }
  return an && bn ? dot / Math.sqrt(an * bn) : null;
}

function rankByCosine(query, rows, dimension) {
  const queryPrefix = query.slice(0, dimension);
  return rows
    .map((row, ordinal) => ({ ordinal, score: cosine(queryPrefix, row.vector.slice(0, dimension)) ?? -Infinity }))
    .sort((a, b) => b.score - a.score || a.ordinal - b.ordinal);
}

function ndcgAgainstOracle(oracle, candidate, k) {
  const oracleRanks = new Map(oracle.slice(0, k).map((item, index) => [item.ordinal, index + 1]));
  const dcg = candidate.slice(0, k).reduce((sum, item, index) => {
    const oracleRank = oracleRanks.get(item.ordinal);
    return sum + (oracleRank ? (1 / Math.log2(oracleRank + 1)) / Math.log2(index + 2) : 0);
  }, 0);
  const ideal = oracle.slice(0, k).reduce((sum, _item, index) => sum + (1 / Math.log2(index + 2)) ** 2, 0);
  return ideal > 0 ? dcg / ideal : 0;
}

function benchmarkMrl(query, rows) {
  const dimensions = [512, 256, 128];
  const topK = Math.min(10, rows.length);
  const oracle = rankByCosine(query, rows, 768);
  return dimensions.map((dimension) => {
    const candidate = rankByCosine(query, rows, dimension);
    const oracleTop = new Set(oracle.slice(0, topK).map((item) => item.ordinal));
    const overlap = candidate.slice(0, topK).filter((item) => oracleTop.has(item.ordinal)).length / topK;
    return {
      representationId: `semantic_mrl_${dimension}`,
      dimension,
      oracleRepresentationId: 'semantic_768',
      queryEncoderRole: 'QUERY',
      candidateEncoderRole: 'DOCUMENT',
      metric: 'cosine',
      renormalizedAfterPrefix: true,
      corpusRows: rows.length,
      topK,
      recallAtKAgainst768: overlap,
      ndcgAtKAgainst768: ndcgAgainstOracle(oracle, candidate, topK),
      exactOracleTopK: oracle.slice(0, topK).map((item) => rows[item.ordinal]?.pointId ?? null),
      candidateTopK: candidate.slice(0, topK).map((item) => rows[item.ordinal]?.pointId ?? null),
    };
  });
}

async function embedQuery() {
  const attempts = [
    { url: EMBED_URL.includes('/v1/') ? EMBED_URL : `${EMBED_URL}/v1/embeddings`, body: { model: EMBED_MODEL, input: QUERY } },
    { url: `${EMBED_URL}/api/embed`, body: { model: EMBED_MODEL, input: QUERY } },
    { url: `${OLLAMA_URL}/api/embeddings`, body: { model: EMBED_MODEL, prompt: QUERY } },
  ];
  const errors = [];
  for (const attempt of attempts) {
    try {
      const body = await jsonFetch(attempt.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(attempt.body), timeoutMs: 20_000 });
      const vector = body?.data?.[0]?.embedding ?? body?.embeddings?.[0] ?? body?.embedding;
      if (Array.isArray(vector)) return { vector: vector.map(Number), endpoint: attempt.url, model: EMBED_MODEL };
      errors.push(`${attempt.url}: no embedding vector`);
    } catch (error) { errors.push(`${attempt.url}: ${error.message}`); }
  }
  return { vector: null, endpoint: null, model: EMBED_MODEL, errors };
}

async function fetchQdrant() {
  const qdrantPath = `/collections/${COLLECTION}/points/scroll`;
  const requestBody = JSON.stringify({ limit: LIMIT, with_payload: true, with_vector: true });
  let body;
  try {
    body = await jsonFetch(`${QDRANT_URL}${qdrantPath}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: requestBody,
    });
  } catch (hostError) {
    if (process.env.ATLAS_DOCKER_FALLBACK === '0') throw hostError;
    const { stdout } = await execFileAsync('docker', [
      'exec', 'legal-ai-go-retrieval', 'wget', '-q', '-O', '-',
      `http://qdrant:6333${qdrantPath}`,
      '--header=content-type: application/json',
      `--post-data=${requestBody}`,
    ], { timeout: 120_000, windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
    body = JSON.parse(stdout);
  }
  return (body?.result?.points ?? []).map((point) => {
    const payload = point.payload ?? {};
    return {
      pointId: String(point.id),
      packetKey: payload.packet_key ?? payload.packetKey ?? null,
      sourceRef: payload.source_ref ?? payload.sourceRef ?? payload.file_path ?? null,
      featureId: payload.feature_id ?? payload.featureId ?? null,
      payload,
      vector: vectorFromPoint(point),
    };
  }).filter((row) => row.vector?.length === 768 && (row.packetKey || row.sourceRef));
}

async function fetchPostgres(sourceRefs = [], pointIds = []) {
  const { Pool } = loadPg();
  const pool = new Pool({ connectionString: resolveDatabaseUrl(env), max: 1 });
  try {
    const columnsResult = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'codebase_chunk_index'
    `);
    const columns = new Set(columnsResult.rows.map((row) => row.column_name));
    const vectorCandidates = VECTOR_COLUMNS.filter((column) => columns.has(column));
    const vectorCounts = vectorCandidates.length
      ? await pool.query(`SELECT ${vectorCandidates.map((column) => `COUNT(*) FILTER (WHERE "${column}" IS NOT NULL)::bigint AS "${column}"`).join(', ')} FROM codebase_chunk_index`)
      : { rows: [{}] };
    const populatedVectorColumns = vectorCandidates.filter((column) => Number(vectorCounts.rows[0]?.[column] ?? 0) > 0);
    const vectorColumn = populatedVectorColumns[0] ?? vectorCandidates[0] ?? null;
    const astColumn = AST_COLUMNS.find((column) => columns.has(column)) ?? null;
    if (!vectorColumn) return { table: 'codebase_chunk_index', vectorColumn: null, vectorCounts: {}, rows: [], columns: [...columns] };
    const select = [
      'id::text AS id',
      columns.has('qdrant_id') ? 'qdrant_id' : 'NULL::text AS qdrant_id',
      columns.has('source_ref') ? 'source_ref' : 'NULL::text AS source_ref',
      columns.has('relative_path') ? 'relative_path' : 'NULL::text AS relative_path',
      columns.has('symbol') ? 'symbol' : 'NULL::text AS symbol',
      columns.has('kind') ? 'kind' : 'NULL::text AS kind',
      astColumn ? `${astColumn} AS ast_value` : 'NULL::jsonb AS ast_value',
      `${vectorColumn}::text AS vector_text`,
    ];
    const boundedSourceRefs = [...new Set(sourceRefs.filter(Boolean).map(String))].slice(0, LIMIT * 2);
    const boundedPointIds = [...new Set(pointIds.filter(Boolean).map(String))].slice(0, LIMIT * 2);
    const predicates = [];
    const params = [LIMIT];
    if (boundedPointIds.length) { params.push(boundedPointIds); predicates.push(`qdrant_id = ANY($${params.length}::text[])`); }
    if (boundedSourceRefs.length) { params.push(boundedSourceRefs); predicates.push(`source_ref = ANY($${params.length}::text[])`); }
    const identityPredicate = predicates.length ? `AND (${predicates.join(' OR ')})` : '';
    const result = await pool.query(`
      SELECT ${select.join(', ')}
      FROM codebase_chunk_index
      WHERE ${vectorColumn} IS NOT NULL
        ${identityPredicate}
      ORDER BY id
      LIMIT $1
    `, params);
    return {
      table: 'codebase_chunk_index', vectorColumn, vectorCounts: vectorCounts.rows[0], astColumn, columns: [...columns],
      rows: result.rows.map((row) => ({ ...row, vector: parseVector(row.vector_text), astSymbols: asStrings(row.ast_value) })).filter((row) => row.vector?.length === 768),
    };
  } finally { await pool.end(); }
}

async function turbovecProbe(rows) {
  const result = { enabled: WITH_TURBOVEC, url: TURBOVEC_URL, status: 'SKIPPED', indexed: null, note: 'Use --with-turbovec to build the accelerator index from fetched Qdrant vectors.' };
  if (!WITH_TURBOVEC) return result;
  try {
    const health = await jsonFetch(`${TURBOVEC_URL}/health`, { timeoutMs: 5_000 });
    const build = await jsonFetch(`${TURBOVEC_URL}/build`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ candidates: rows.map((row) => ({ id: row.packetKey ?? row.pointId, vector: row.vector, cluster: 0 })) }), timeoutMs: 120_000,
    });
    return { ...result, status: 'PASS', health, build, indexed: Number(build.indexed ?? health.indexed ?? 0), note: 'TurboVec received Qdrant vectors; it remains an accelerator projection.' };
  } catch (error) { return { ...result, status: 'WARN', error: error.message }; }
}

async function main() {
  const started = Date.now();
  const report = { schema: 'atlas.embedding-ranking-diagnostic.v1', generatedAt: new Date().toISOString(), readOnly: true, query: QUERY, qdrant: { url: QDRANT_URL, collection: COLLECTION, vectorName: VECTOR_NAME }, postgres: {}, embeddinggemma: {}, ranking: {}, turbovec: {} };
  try {
    const qdrantRows = await fetchQdrant();
    const [postgresResult, embedding] = await Promise.all([
      fetchPostgres(qdrantRows.map((row) => row.sourceRef), qdrantRows.map((row) => row.pointId))
        .catch((error) => ({ table: 'codebase_chunk_index', vectorColumn: null, vectorCounts: {}, rows: [], columns: [], error: error.message })),
      embedQuery(),
    ]);
    const postgres = postgresResult;
    report.postgres = {
      table: postgres.table,
      vectorColumn: postgres.vectorColumn,
      vectorCounts: postgres.vectorCounts ?? {},
      canonicalVectorColumn: 'content_embedding_768',
      canonicalVectorPopulated: Number(postgres.vectorCounts?.content_embedding_768 ?? 0) > 0,
      astColumn: postgres.astColumn,
      rowsFetched: postgres.rows.length,
      error: postgres.error ?? null,
      vectorDimension: postgres.rows[0]?.vector?.length ?? null,
      columns: postgres.columns,
    };
    report.qdrant.rowsFetched = qdrantRows.length;
    report.qdrant.vectorDimension = qdrantRows[0]?.vector?.length ?? null;
    report.embeddinggemma = { endpoint: embedding.endpoint, model: embedding.model, dimension: embedding.vector?.length ?? null, available: Boolean(embedding.vector), errors: embedding.errors ?? [] };

    const pgByQdrant = new Map(postgres.rows.filter((row) => row.qdrant_id).map((row) => [String(row.qdrant_id), row]));
    const pgBySource = new Map(postgres.rows.filter((row) => row.source_ref).map((row) => [String(row.source_ref), row]));
    const queryTokens = tokens(QUERY);
    const scored = qdrantRows.map((row) => {
      const pg = pgByQdrant.get(row.pointId) ?? pgBySource.get(String(row.sourceRef)) ?? null;
      const astValues = [...asStrings(row.payload.ast_symbols), ...(pg?.astSymbols ?? []), row.payload.symbol, row.payload.kind].filter(Boolean).map(String);
      const semantic = embedding.vector ? cosine(embedding.vector, row.vector) : null;
      const pgSemantic = embedding.vector && pg?.vector ? cosine(embedding.vector, pg.vector) : null;
      const ast = overlap(queryTokens, astValues);
      const lexical = overlap(queryTokens, [row.packetKey, row.sourceRef, row.featureId, pg?.relative_path, pg?.symbol, pg?.kind].filter(Boolean));
      const blended = (semantic ?? 0) * 0.60 + (pgSemantic ?? semantic ?? 0) * 0.10 + lexical * 0.15 + ast * 0.15;
      return { pointId: row.pointId, packetKey: row.packetKey, sourceRef: row.sourceRef, postgresMatch: Boolean(pg), semanticScore: semantic, postgresSemanticScore: pgSemantic, lexicalScore: lexical, astScore: ast, astSymbols: astValues.slice(0, 32), blendedScore: blended };
    }).sort((a, b) => b.blendedScore - a.blendedScore || String(a.packetKey).localeCompare(String(b.packetKey)));
    report.ranking = { formula: '0.60*qdrantSemantic + 0.10*postgresSemantic + 0.15*lexical + 0.15*ast', candidates: scored.slice(0, LIMIT), joinedPostgres: scored.filter((row) => row.postgresMatch).length, astAwareCandidates: scored.filter((row) => row.astScore > 0).length, mrlAgainst768: embedding.vector?.length === 768 ? benchmarkMrl(embedding.vector, qdrantRows) : [] };
    report.turbovec = await turbovecProbe(qdrantRows);
    report.gates = {
      qdrantVectors: qdrantRows.length > 0,
      embeddinggemma768: embedding.vector?.length === 768,
      postgresVectorFetched: postgres.rows.length > 0,
      canonicalPostgres768: report.postgres.canonicalVectorPopulated,
      astRankingComputed: scored.some((row) => row.astSymbols.length > 0),
      identityJoinObserved: scored.some((row) => row.postgresMatch),
      turbovecCollectionAligned: !WITH_TURBOVEC || report.turbovec.health?.collection === COLLECTION,
    };
    report.status = Object.values(report.gates).every(Boolean) ? 'PASS' : 'WARN';
  } catch (error) { report.status = 'FAIL'; report.error = error.message; }
  report.elapsedMs = Date.now() - started;
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify({ status: report.status, gates: report.gates ?? {}, qdrant: report.qdrant, postgres: report.postgres, embeddinggemma: report.embeddinggemma, turbovec: report.turbovec, out: OUT }, null, 2));
  if (report.status === 'FAIL') process.exit(1);
}

main();
