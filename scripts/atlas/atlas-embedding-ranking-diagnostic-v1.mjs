#!/usr/bin/env node
/**
 * Read-only EmbeddingGemma semantic_768 + retrieval-ranking diagnostic.
 * Canonical Postgres owner: codebase_chunk_index.content_embedding halfvec(768).
 * content_embedding_768 vector(768) is a legacy/alternate compatibility surface.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const args = new Map();
const argv = process.argv.slice(2);
for (let index = 0; index < argv.length; index += 1) {
  const arg = argv[index];
  const match = arg.match(/^--([^=]+)=(.*)$/);
  if (match) args.set(match[1], match[2]);
  else if (arg.startsWith('--')) {
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) { args.set(arg.slice(2), next); index += 1; }
    else args.set(arg.slice(2), 'true');
  }
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
const QDRANT_TRANSPORT = String(args.get('transport') ?? env.ATLAS_QDRANT_TRANSPORT ?? 'auto').toLowerCase();
const OUT = path.resolve(REPO_ROOT, String(args.get('out') ?? 'docs/reports/atlas-embedding-ranking-diagnostic-v1.json'));

const CANONICAL_VECTOR_COLUMN = 'content_embedding';
const CANONICAL_VECTOR_TYPE = 'halfvec(768)';
const ALTERNATE_VECTOR_COLUMN = 'content_embedding_768';
const AST_COLUMNS = ['ast_symbols', 'ast_nodes', 'symbols'];
const execFileAsync = promisify(execFile);

function loadPg() {
  for (const root of [path.join(REPO_ROOT, 'sveltekit-frontend', 'node_modules'), path.join(REPO_ROOT, 'node_modules')]) {
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

function parseVector(value) {
  if (Array.isArray(value)) return value.map(Number);
  if (typeof value !== 'string') return null;
  const values = value.trim().replace(/^\[|\]$/g, '').split(',').filter(Boolean).map(Number);
  return values.length && values.every(Number.isFinite) ? values : null;
}

function vectorFromPoint(point) {
  if (Array.isArray(point?.vector)) return point.vector.map(Number);
  if (point?.vector && typeof point.vector === 'object') {
    if (Array.isArray(point.vector[VECTOR_NAME])) return point.vector[VECTOR_NAME].map(Number);
    for (const value of Object.values(point.vector)) if (Array.isArray(value)) return value.map(Number);
  }
  return null;
}

function asStrings(value) {
  if (Array.isArray(value)) return value.flatMap(asStrings);
  if (value && typeof value === 'object') return [value.name, value.symbol, value.text, ...Object.values(value).flatMap(asStrings)].filter(Boolean).map(String);
  return typeof value === 'string' ? [value] : [];
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== '') ?? null;
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
  return rows.map((row, ordinal) => ({ ordinal, score: cosine(query.slice(0, dimension), row.vector.slice(0, dimension)) ?? -Infinity }))
    .sort((a, b) => b.score - a.score || a.ordinal - b.ordinal);
}

function benchmarkMrl(query, rows) {
  const oracle = rankByCosine(query, rows, 768);
  const topK = Math.min(10, rows.length);
  const oracleTop = new Set(oracle.slice(0, topK).map((item) => item.ordinal));
  return [512, 256, 128].map((dimension) => {
    const ranked = rankByCosine(query, rows, dimension);
    return {
      representationId: `semantic_mrl_${dimension}`,
      dimension,
      oracleRepresentationId: 'semantic_768',
      metric: 'cosine',
      renormalizationRequiredForProductionProjection: true,
      corpusRows: rows.length,
      topK,
      recallAtKAgainst768: topK ? ranked.slice(0, topK).filter((item) => oracleTop.has(item.ordinal)).length / topK : 0,
      exactOracleTopK: oracle.slice(0, topK).map((item) => rows[item.ordinal]?.pointId ?? null),
      candidateTopK: ranked.slice(0, topK).map((item) => rows[item.ordinal]?.pointId ?? null),
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
      if (Array.isArray(vector)) return { vector: vector.map(Number), endpoint: attempt.url, model: EMBED_MODEL, errors };
      errors.push(`${attempt.url}: no embedding vector`);
    } catch (error) { errors.push(`${attempt.url}: ${error.message}`); }
  }
  return { vector: null, endpoint: null, model: EMBED_MODEL, errors };
}

async function fetchQdrant(transportReceipt) {
  const qdrantPath = `/collections/${COLLECTION}/points/scroll`;
  const requestBody = JSON.stringify({ limit: LIMIT, with_payload: true, with_vector: true });
  let body;
  if (QDRANT_TRANSPORT !== 'docker-internal') {
    try {
      body = await jsonFetch(`${QDRANT_URL}${qdrantPath}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: requestBody });
      transportReceipt.effective = 'HOST_REST'; transportReceipt.endpoint = QDRANT_URL;
    } catch (error) {
      transportReceipt.hostError = error.message;
      if (QDRANT_TRANSPORT === 'host-rest' || process.env.ATLAS_DOCKER_FALLBACK === '0') throw error;
    }
  }
  if (!body) {
    const { stdout } = await execFileAsync('docker', ['exec', 'legal-ai-go-retrieval', 'wget', '-q', '-O', '-', `http://qdrant:6333${qdrantPath}`, '--header=content-type: application/json', `--post-data=${requestBody}`], { timeout: 120_000, windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
    body = JSON.parse(stdout); transportReceipt.effective = 'DOCKER_INTERNAL'; transportReceipt.endpoint = 'http://qdrant:6333';
  }
  return (body?.result?.points ?? []).map((point) => ({
    pointId: String(point.id),
    packetKey: point.payload?.packet_key ?? point.payload?.packetKey ?? null,
    sourceRef: point.payload?.source_ref ?? point.payload?.sourceRef ?? point.payload?.file_path ?? null,
    featureId: point.payload?.feature_id ?? point.payload?.featureId ?? null,
    payload: point.payload ?? {},
    vector: vectorFromPoint(point),
  })).filter((row) => row.vector?.length === 768 && (row.packetKey || row.sourceRef));
}

async function fetchPostgres(sourceRefs = [], pointIds = []) {
  const { Pool } = loadPg();
  const pool = new Pool({ connectionString: resolveDatabaseUrl(env), max: 1 });
  try {
    const schema = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='codebase_chunk_index'`);
    const columns = new Set(schema.rows.map((row) => row.column_name));
    if (!columns.has(CANONICAL_VECTOR_COLUMN)) throw new Error(`CANONICAL_VECTOR_COLUMN_MISSING:${CANONICAL_VECTOR_COLUMN}`);
    const typeResult = await pool.query(`SELECT format_type(a.atttypid,a.atttypmod) AS declared_type FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='codebase_chunk_index' AND a.attname=$1 AND a.attnum>0 AND NOT a.attisdropped`, [CANONICAL_VECTOR_COLUMN]);
    const declaredType = typeResult.rows[0]?.declared_type ?? null;
    const countColumns = [CANONICAL_VECTOR_COLUMN, ALTERNATE_VECTOR_COLUMN].filter((column) => columns.has(column));
    const counts = await pool.query(`SELECT ${countColumns.map((column) => `COUNT(*) FILTER (WHERE "${column}" IS NOT NULL)::bigint AS "${column}"`).join(', ')} FROM codebase_chunk_index`);
    const astColumn = AST_COLUMNS.find((column) => columns.has(column)) ?? null;
    const sourceSet = [...new Set(sourceRefs.filter(Boolean).map(String))].slice(0, LIMIT * 2);
    const pointSet = [...new Set(pointIds.filter(Boolean).map(String))].slice(0, LIMIT * 2);
    const predicates = [];
    const params = [];
    if (pointSet.length && columns.has('qdrant_id')) { params.push(pointSet); predicates.push(`qdrant_id::text=ANY($${params.length}::text[])`); }
    if (sourceSet.length && columns.has('source_ref')) { params.push(sourceSet); predicates.push(`source_ref=ANY($${params.length}::text[])`); }
    const where = predicates.length ? `AND (${predicates.join(' OR ')})` : '';
    const select = [
      'id::text AS id',
      columns.has('qdrant_id') ? 'qdrant_id::text AS qdrant_id' : 'NULL::text AS qdrant_id',
      columns.has('source_ref') ? 'source_ref' : 'NULL::text AS source_ref',
      columns.has('relative_path') ? 'relative_path' : 'NULL::text AS relative_path',
      columns.has('content_hash') ? 'content_hash' : 'NULL::text AS content_hash',
      columns.has('content') ? 'content' : 'NULL::text AS content',
      columns.has('summary') ? 'summary' : 'NULL::text AS summary',
      columns.has('symbol') ? 'symbol' : 'NULL::text AS symbol',
      columns.has('kind') ? 'kind' : 'NULL::text AS kind',
      astColumn ? `${astColumn} AS ast_value` : 'NULL::jsonb AS ast_value',
      `${CANONICAL_VECTOR_COLUMN}::text AS vector_text`,
    ];
    params.push(LIMIT);
    const result = await pool.query(`SELECT ${select.join(', ')} FROM codebase_chunk_index WHERE ${CANONICAL_VECTOR_COLUMN} IS NOT NULL ${where} ORDER BY id LIMIT $${params.length}`, params);
    return {
      table: 'codebase_chunk_index', vectorColumn: CANONICAL_VECTOR_COLUMN, declaredType,
      vectorCounts: counts.rows[0] ?? {}, astColumn, columns: [...columns],
      rows: result.rows.map((row) => ({ ...row, vector: parseVector(row.vector_text), astSymbols: asStrings(row.ast_value) })).filter((row) => row.vector?.length === 768),
    };
  } finally { await pool.end(); }
}

async function fetchCanonicalPackets(sourceRefs = [], packetKeys = []) {
  const { Pool } = loadPg();
  const pool = new Pool({ connectionString: resolveDatabaseUrl(env), max: 1 });
  try {
    const sourceSet = [...new Set(sourceRefs.filter(Boolean).map(String))].slice(0, LIMIT * 2);
    const keySet = [...new Set(packetKeys.filter(Boolean).map(String))].slice(0, LIMIT * 2);
    const params = []; const predicates = [];
    if (keySet.length) { params.push(keySet); predicates.push(`packet_key=ANY($${params.length}::text[])`); }
    if (sourceSet.length) { params.push(sourceSet); predicates.push(`source_ref=ANY($${params.length}::text[])`); }
    if (!predicates.length) return { rows: [] };
    const result = await pool.query(`SELECT packet_key,source_ref,content_hash,source_revision,representation_revision::text,NULL::text AS graph_revision,som_revision,topology FROM atlas_packets WHERE ${predicates.join(' OR ')} LIMIT ${LIMIT * 2}`, params);
    return { rows: result.rows };
  } finally { await pool.end(); }
}

async function turbovecProbe() {
  if (!WITH_TURBOVEC) return { enabled: false, status: 'SKIPPED', note: 'No accelerator mutation in default diagnostic.' };
  try { return { enabled: true, status: 'HEALTH_ONLY', health: await jsonFetch(`${TURBOVEC_URL}/health`, { timeoutMs: 5000 }) }; }
  catch (error) { return { enabled: true, status: 'WARN', error: error.message }; }
}

async function main() {
  const started = Date.now();
  const transport = { requested: QDRANT_TRANSPORT.toUpperCase(), effective: null, endpoint: null, hostError: null };
  const report = { schema: 'atlas.embedding-ranking-diagnostic.v1', generatedAt: new Date().toISOString(), readOnly: true, query: QUERY, qdrant: { url: QDRANT_URL, collection: COLLECTION, vectorName: VECTOR_NAME, transport }, postgres: {}, embeddinggemma: {}, ranking: {}, turbovec: {} };
  try {
    const qdrantRows = await fetchQdrant(transport);
    const [postgres, packets, embedding] = await Promise.all([
      fetchPostgres(qdrantRows.map((row) => row.sourceRef), qdrantRows.map((row) => row.pointId)),
      fetchCanonicalPackets(qdrantRows.map((row) => row.sourceRef), qdrantRows.map((row) => row.packetKey)),
      embedQuery(),
    ]);
    report.postgres = {
      table: postgres.table, vectorColumn: postgres.vectorColumn, vectorCounts: postgres.vectorCounts,
      canonicalVectorColumn: CANONICAL_VECTOR_COLUMN, canonicalVectorType: CANONICAL_VECTOR_TYPE,
      observedCanonicalVectorType: postgres.declaredType,
      canonicalVectorPopulated: Number(postgres.vectorCounts?.[CANONICAL_VECTOR_COLUMN] ?? 0) > 0,
      alternateVectorColumn: ALTERNATE_VECTOR_COLUMN, alternateVectorRole: 'LEGACY_ALTERNATE_NONCANONICAL',
      astColumn: postgres.astColumn, rowsFetched: postgres.rows.length,
      vectorDimension: postgres.rows[0]?.vector?.length ?? null, columns: postgres.columns,
    };
    report.qdrant.rowsFetched = qdrantRows.length;
    report.qdrant.vectorDimension = qdrantRows[0]?.vector?.length ?? null;
    report.qdrant.authority = 'DERIVED_PROJECTION';
    report.embeddinggemma = { endpoint: embedding.endpoint, model: embedding.model, dimension: embedding.vector?.length ?? null, representationId: 'semantic_768', available: Boolean(embedding.vector), errors: embedding.errors ?? [] };

    const pgByQdrant = new Map(postgres.rows.filter((row) => row.qdrant_id).map((row) => [String(row.qdrant_id), row]));
    const pgBySource = new Map(postgres.rows.filter((row) => row.source_ref).map((row) => [String(row.source_ref), row]));
    const packetByKey = new Map(packets.rows.filter((row) => row.packet_key).map((row) => [String(row.packet_key), row]));
    const packetBySource = new Map(packets.rows.filter((row) => row.source_ref).map((row) => [String(row.source_ref), row]));
    const queryTokens = tokens(QUERY);
    const scored = qdrantRows.map((row) => {
      const pg = pgByQdrant.get(row.pointId) ?? pgBySource.get(String(row.sourceRef)) ?? null;
      const packet = packetByKey.get(String(row.packetKey)) ?? packetBySource.get(String(row.sourceRef)) ?? null;
      const semantic = embedding.vector ? cosine(embedding.vector, row.vector) : null;
      const pgSemantic = embedding.vector && pg?.vector ? cosine(embedding.vector, pg.vector) : null;
      const astValues = [...asStrings(row.payload.ast_symbols), ...(pg?.astSymbols ?? []), row.payload.symbol, row.payload.kind].filter(Boolean).map(String);
      const astScore = overlap(queryTokens, astValues);
      const lexicalScore = overlap(queryTokens, [row.packetKey, row.sourceRef, row.featureId, pg?.relative_path, pg?.symbol, pg?.kind].filter(Boolean));
      const blendedScore = (semantic ?? 0) * 0.60 + (pgSemantic ?? semantic ?? 0) * 0.10 + lexicalScore * 0.15 + astScore * 0.15;
      const qdrantHash = firstValue(row.payload.content_hash, row.payload.contentHash);
      const canonicalHash = firstValue(packet?.content_hash, pg?.content_hash);
      const strongContentHashMatch = Boolean(canonicalHash && qdrantHash && canonicalHash === qdrantHash);
      const canonicalPacketMatch = Boolean(packet);
      const integrityScore = (row.sourceRef ? 0.25 : 0) + (pg?.relative_path || row.sourceRef ? 0.15 : 0) + (canonicalPacketMatch ? 0.20 : 0) + (strongContentHashMatch ? 0.40 : 0);
      const integrityStatus = canonicalPacketMatch && row.sourceRef && strongContentHashMatch ? 'INTEGRITY_VERIFIED' : integrityScore >= 0.55 ? 'INTEGRITY_PARTIAL' : 'INTEGRITY_UNVERIFIED';
      return {
        pointId: row.pointId, packetKey: row.packetKey ?? packet?.packet_key ?? null,
        sourceRef: row.sourceRef ?? packet?.source_ref ?? null, filePath: pg?.relative_path ?? row.sourceRef ?? null,
        candidateText: String(pg?.content ?? pg?.summary ?? '').slice(0, 12000),
        documentRevision: firstValue(packet?.source_revision, row.payload.source_revision, row.payload.sourceRevision),
        contentHash: firstValue(canonicalHash, qdrantHash), graphRevision: firstValue(row.payload.graph_revision, row.payload.graphRevision),
        representationRevision: firstValue(packet?.representation_revision, row.payload.representation_revision, row.payload.representationRevision),
        integrityScore: Number(integrityScore.toFixed(4)), integrityStatus, strongContentHashMatch,
        representationIntegrity: row.vector.length === 768 ? 'VERIFIED' : 'MISMATCH',
        postgresMatch: Boolean(pg), canonicalPacketMatch, semanticScore: semantic, postgresSemanticScore: pgSemantic,
        lexicalScore, astScore, astSymbols: astValues.slice(0, 32), blendedScore,
        diagnosticScore: blendedScore * (0.70 + 0.30 * integrityScore), acePromotionEligible: integrityStatus === 'INTEGRITY_VERIFIED',
      };
    }).sort((a, b) => b.diagnosticScore - a.diagnosticScore || String(a.packetKey).localeCompare(String(b.packetKey)));

    report.ranking = {
      diagnosticFormula: 'diagnosticScore = blendedScore * (0.70 + 0.30*documentIntegrityScore) -- DIAGNOSTIC ONLY',
      promotionGate: 'acePromotionEligible = documentIntegrity.status === INTEGRITY_VERIFIED',
      semanticFormula: '0.60*qdrantSemantic + 0.10*postgresSemantic + 0.15*lexical + 0.15*ast',
      candidates: scored.slice(0, LIMIT), joinedPostgres: scored.filter((row) => row.postgresMatch).length,
      joinedCanonicalPackets: scored.filter((row) => row.canonicalPacketMatch).length,
      astAwareCandidates: scored.filter((row) => row.astScore > 0).length,
      mrlAgainst768: embedding.vector?.length === 768 ? benchmarkMrl(embedding.vector, qdrantRows) : [],
    };
    report.turbovec = await turbovecProbe();
    report.gates = {
      qdrantVectors768: qdrantRows.length > 0 && report.qdrant.vectorDimension === 768,
      embeddinggemma768: embedding.vector?.length === 768,
      canonicalPostgresColumnPresent: postgres.columns.includes(CANONICAL_VECTOR_COLUMN),
      canonicalPostgresTypeHalfvec768: postgres.declaredType === CANONICAL_VECTOR_TYPE,
      canonicalPostgresVectorPopulated: report.postgres.canonicalVectorPopulated,
      postgresVectorFetched: postgres.rows.length > 0,
      identityJoinObserved: scored.some((row) => row.postgresMatch || row.canonicalPacketMatch),
    };
    report.status = Object.values(report.gates).every(Boolean) ? 'PASS' : 'WARN';
  } catch (error) {
    report.status = 'FAIL'; report.error = error.message; report.errorStack = error.stack;
  }
  report.elapsedMs = Date.now() - started;
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: report.status, gates: report.gates ?? {}, qdrant: report.qdrant, postgres: report.postgres, embeddinggemma: report.embeddinggemma, out: OUT }, null, 2));
  if (report.status === 'FAIL') process.exitCode = 1;
}

main();
