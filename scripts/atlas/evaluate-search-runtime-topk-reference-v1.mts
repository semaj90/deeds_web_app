#!/usr/bin/env npx tsx
/**
 * Read-only, standalone SearchRuntime reference replay for Domain 10 / RF6.
 *
 * The bundled fixture is deterministic replay data, not human relevance gold.
 * Reported metrics are reference-set agreement only and must not be presented
 * as retrieval relevance or production quality.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { SearchResult } from '../../sveltekit-frontend/src/lib/server/retrieval/search-runtime.js';

type ReferenceFixture = {
  schema: string;
  fixtureType: string;
  queryId: string;
  query: string;
  topK: number;
  workspaceRevision?: string;
  candidateSnapshotRevision?: string;
  ordinalMapChecksum?: string;
  expectedCanonicalIds: string[];
  humanRelevanceJudgments: boolean;
  canonicalWrites: boolean;
};

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const fixturePath = path.join(repoRoot, 'scripts/atlas/fixtures/golden-retrieval-stability-v1.json');
const runtimeSourcePath = path.join(repoRoot, 'sveltekit-frontend/src/lib/server/retrieval/search-runtime.ts');
const producerPath = fileURLToPath(import.meta.url);
const eg1Collection = 'codebase_chunks_768';
const eg2Collection = 'codebase_chunks_eg2_768_q8';
const eg2ModelId = 'onnx-community/embeddinggemma2-q8:onnx/model_quantized.onnx';
const eg2Dimensions = [768, 512, 256, 128];

function sha256(bytes: Buffer | string): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function uniqueNonEmpty(values: unknown, label: string): string[] {
  if (!Array.isArray(values) || values.length === 0 || values.some((value) => typeof value !== 'string' || !value.trim())) {
    throw new Error(`${label}_MUST_BE_NONEMPTY_STRING_ARRAY`);
  }
  const ids = values.map((value) => value.trim());
  if (new Set(ids).size !== ids.length) throw new Error(`${label}_DUPLICATE_ID`);
  return ids;
}

function extractCanonicalIds(packets: unknown): string[] {
  if (!Array.isArray(packets)) throw new Error('SEARCH_RUNTIME_PACKETS_NOT_ARRAY');
  const ids = packets.map((packet, index) => {
    if (!packet || typeof packet !== 'object') throw new Error(`PACKET_${index}_INVALID`);
    const id = (packet as Record<string, unknown>).packet_key;
    if (typeof id !== 'string' || !id.trim()) throw new Error(`PACKET_${index}_MISSING_CANONICAL_PACKET_KEY`);
    return id.trim();
  });
  if (new Set(ids).size !== ids.length) throw new Error('SEARCH_RUNTIME_DUPLICATE_PACKET_KEY');
  return ids;
}

function metricSet(expectedIds: string[], actualIds: string[], k: number) {
  const relevant = new Set(uniqueNonEmpty(expectedIds, 'REFERENCE_IDS'));
  const ranked = uniqueNonEmpty(actualIds, 'ACTUAL_IDS').slice(0, k);
  const hits = ranked.filter((id) => relevant.has(id)).length;
  const dcg10 = ranked.slice(0, 10).reduce((sum, id, index) =>
    sum + (relevant.has(id) ? 1 / Math.log2(index + 2) : 0), 0);
  const idcg10 = Array.from({ length: Math.min(10, relevant.size) }, (_, index) => 1 / Math.log2(index + 2))
    .reduce((sum, value) => sum + value, 0);
  const firstRelevantRank = ranked.findIndex((id) => relevant.has(id));
  return {
    recallAtK: hits / relevant.size,
    ndcgAt10: idcg10 === 0 ? 0 : dcg10 / idcg10,
    mrr: firstRelevantRank < 0 ? 0 : 1 / (firstRelevantRank + 1),
    hitsAtK: hits,
    relevantReferenceCount: relevant.size,
    returnedAtK: ranked.length,
  };
}

/**
 * A non-empty packet_key string is not proof of identity: it must exist in
 * atlas_packets, and the harness's own inputs must not appear as results.
 * Nothing is filtered out; any violation blocks the metrics.
 */
function assessReturnedPackets(
  packets: unknown,
  knownPacketKeys: ReadonlySet<string>,
  evaluationSourceRefs: ReadonlySet<string>,
) {
  const ids = extractCanonicalIds(packets);
  const unresolvedPacketKeys = ids.filter((id) => !knownPacketKeys.has(id));
  const selfReferences = (packets as Array<Record<string, unknown>>).flatMap((packet, index) => {
    const sourceRef = typeof packet.source_ref === 'string' ? packet.source_ref.replace(/\\/g, '/') : '';
    return evaluationSourceRefs.has(sourceRef) ? [{ packetKey: ids[index], sourceRef }] : [];
  });
  const blockedStatus = selfReferences.length > 0
    ? 'BLOCKED_EVALUATION_SELF_REFERENCE'
    : unresolvedPacketKeys.length > 0
      ? 'BLOCKED_NONCANONICAL_PACKET_KEY'
      : null;
  return { unresolvedPacketKeys, selfReferences, blockedStatus };
}

function runAdversarialProbes() {
  let duplicateReferenceIdsRejected = false;
  try { uniqueNonEmpty(['packet:a', 'packet:a'], 'REFERENCE_IDS'); }
  catch (error) { duplicateReferenceIdsRejected = String(error).includes('DUPLICATE_ID'); }

  let missingCanonicalIdentityRejected = false;
  try { extractCanonicalIds([{ chunk_id: 'chunk-without-packet-key' }]); }
  catch (error) { missingCanonicalIdentityRejected = String(error).includes('MISSING_CANONICAL_PACKET_KEY'); }

  const unknownKeyRejected = assessReturnedPackets(
    [{ packet_key: '00000000-0000-4000-8000-000000000000', source_ref: 'src/a.ts' }],
    new Set(['packet:a']),
    new Set(['fixture.json']),
  ).blockedStatus === 'BLOCKED_NONCANONICAL_PACKET_KEY';
  const selfReferenceRejected = assessReturnedPackets(
    [{ packet_key: 'packet:a', source_ref: 'fixture.json' }],
    new Set(['packet:a']),
    new Set(['fixture.json']),
  ).blockedStatus === 'BLOCKED_EVALUATION_SELF_REFERENCE';
  const knownKeyAccepted = assessReturnedPackets(
    [{ packet_key: 'packet:a', source_ref: 'src/a.ts' }],
    new Set(['packet:a']),
    new Set(['fixture.json']),
  ).blockedStatus === null;

  const checks = {
    duplicateReferenceIdsRejected,
    missingCanonicalIdentityRejected,
    unknownKeyRejected,
    selfReferenceRejected,
    knownKeyAccepted,
  };
  if (Object.values(checks).some((passed) => !passed)) {
    throw new Error('EVALUATOR_ADVERSARIAL_GUARD_FAILED');
  }
  return checks;
}

function describeError(error: unknown): string {
  const parts: string[] = [];
  for (let item = error as { message?: unknown; code?: unknown; cause?: unknown } | undefined; item; item = item.cause as typeof item) {
    parts.push(`${typeof item.code === 'string' ? `${item.code} ` : ''}${String(item.message ?? item)}`.slice(0, 200));
  }
  return parts.join(' <- ');
}

async function postJson(url: string, body: unknown): Promise<any> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) throw new Error(`HTTP_${response.status}:${url}`);
  return response.json();
}

type ArmHit = { packetKey: string | null; sourceRef: string | null };
type ServiceArm = 'eg1' | 'go' | 'eg2';
type ReadPool = { query: (sql: string, values: unknown[]) => Promise<{ rows: any[] }> };

function requireUnitVector(value: unknown, dimensions: number): number[] {
  if (!Array.isArray(value) || value.length !== dimensions
    || value.some((entry) => typeof entry !== 'number' || !Number.isFinite(entry))) {
    throw new Error(`INVALID_EMBEDDING_VECTOR_${dimensions}`);
  }
  const norm = Math.sqrt(value.reduce((sum, entry) => sum + entry * entry, 0));
  if (Math.abs(norm - 1) > 0.01) throw new Error(`INVALID_EMBEDDING_NORM_${dimensions}`);
  return value;
}

function readEg2Vectors(body: any): number[][] {
  if (body?.model_id !== eg2ModelId) throw new Error('EG2_MODEL_ID_MISMATCH');
  return eg2Dimensions.map((dim) => {
    const batch = (body.embeddings ?? body.vectors)?.[String(dim)];
    if (!Array.isArray(batch) || batch.length !== 1) throw new Error(`EG2_BATCH_INVALID_${dim}`);
    return requireUnitVector(batch[0], dim);
  });
}

function requireGoChunks(body: any): any[] {
  if (body?.representation_used !== 'semantic_768'
    || body.query_stage_trace?.qdrant_collection !== eg1Collection) {
    throw new Error('GO_RETRIEVAL_REPRESENTATION_OR_COLLECTION_UNVERIFIED');
  }
  // The HTTP route can return 200 with an empty list on an internal embed/search failure.
  if (!Array.isArray(body.chunks) || !body.chunks.length) {
    throw new Error('GO_RETRIEVAL_EMPTY_OR_FAILED');
  }
  return body.chunks;
}

function requireQdrantPoints(body: any): any[] {
  if (body?.status !== 'ok' || !Array.isArray(body.result?.points)) {
    throw new Error('QDRANT_RESPONSE_UNVERIFIED');
  }
  return body.result.points;
}

function hasExactEg1ChunkBinding(point: any, row: any): boolean {
  return !!row && typeof row.content === 'string' && !!row.content.trim()
    && String(point.id) === row.qdrant_id
    && point.payload?.chunk_id === row.chunk_id
    && point.payload?.source_ref === row.source_ref
    && point.payload?.content_hash === row.content_hash
    && typeof row.content_hash === 'string'
    && /^(?:sha256:)?[0-9a-f]{64}$/.test(row.content_hash)
    && sha256(row.content).endsWith(row.content_hash.replace(/^sha256:/, ''));
}

async function observeEg1Parity(pool: ReadPool, qdrantUrl: string, goEmbedUrl: string) {
  const threshold = 0.999;
  const sampleSize = 8;
  const { rows } = await pool.query(
    `SELECT qdrant_id, chunk_id::text, source_ref, content_hash, content, content_embedding_768::text
       FROM codebase_chunk_index
      WHERE qdrant_id IS NOT NULL AND content_embedding_768 IS NOT NULL
      ORDER BY qdrant_id LIMIT $1`,
    [64],
  );
  const ids = rows.flatMap((row): Array<number | string> => {
    const id = row.qdrant_id as string;
    if (/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) return [id];
    if (/^(?:0|[1-9][0-9]*)$/.test(id) && Number.isSafeInteger(Number(id))) return [Number(id)];
    return [];
  });
  const body = ids.length ? await postJson(`${qdrantUrl}/collections/${eg1Collection}/points`, {
    ids, with_vector: ['content'],
    with_payload: ['chunk_id', 'content_hash', 'source_ref'],
  }) : { status: 'ok', result: [] };
  if (body?.status !== 'ok' || !Array.isArray(body.result)) {
    throw new Error('QDRANT_EG1_POINT_READBACK_UNVERIFIED');
  }
  const byPoint = new Map(rows.map((row) => [row.qdrant_id, row]));
  const matches = body.result.flatMap((point: any) => {
    const row = byPoint.get(String(point.id));
    return hasExactEg1ChunkBinding(point, row) ? [{ point, row }] : [];
  });
  const counts = {
    threshold, sampleSize, postgresRowsExamined: rows.length, projectionIdsRequested: ids.length,
    projectionRowsFound: body.result.length, exactChunkMatches: matches.length,
  };
  if (matches.length < sampleSize) {
    return { ...counts, status: 'BLOCKED_EXACT_EG1_CHUNK_SAMPLE_UNAVAILABLE' };
  }
  const sample = matches.slice(0, sampleSize);
  const result = await postJson(`${goEmbedUrl}/embed`, {
    texts: sample.map(({ row }) => row.content), model: 'embeddinggemma:latest',
  });
  if (!Array.isArray(result?.embeddings) || result.embeddings.length !== sample.length) {
    throw new Error('EG1_PARITY_BATCH_INVALID');
  }
  const similarities = sample.map(({ point, row }, index) => {
    const actual = requireUnitVector(result.embeddings[index], 768);
    const pg = requireUnitVector(JSON.parse(row.content_embedding_768), 768);
    const qdrant = requireUnitVector(point.vector?.content, 768);
    const cosine = (expected: number[]) => actual.reduce((sum, value, i) => sum + value * expected[i], 0)
      / Math.sqrt(actual.reduce((sum, value) => sum + value * value, 0)
        * expected.reduce((sum, value) => sum + value * value, 0));
    return { chunkId: row.chunk_id, contentHash: row.content_hash, postgresCosine: cosine(pg), qdrantCosine: cosine(qdrant) };
  });
  const status = similarities.every((row) => row.postgresCosine >= threshold && row.qdrantCosine >= threshold)
    ? 'DOCUMENT_SAMPLE_PARITY_PASSED'
    : 'BLOCKED_EG1_DOCUMENT_VECTOR_PARITY_MISMATCH';
  return { ...counts, status, similarities };
}

function runServiceArmProbes() {
  const mustReject = (probe: () => unknown, code: string) => {
    try { probe(); } catch (error) { if (String(error).includes(code)) return true; }
    throw new Error(`SERVICE_ARM_GUARD_FAILED:${code}`);
  };
  const vectors = Object.fromEntries(eg2Dimensions.map((dim) => [
    dim, [Array.from({ length: dim }, (_, i) => i === 0 ? 1 : 0)],
  ]));
  const { 512: _omitted, ...missing512 } = vectors;
  const contentHash = sha256('sample');
  const row = { qdrant_id: '1', chunk_id: 'chunk:a', source_ref: 'a.ts', content_hash: contentHash, content: 'sample' };
  const point = { id: 1, payload: { chunk_id: 'chunk:a', source_ref: 'a.ts', content_hash: contentHash } };
  const identityChecks = {
    exactEg1ChunkBindingAccepted: hasExactEg1ChunkBinding(point, row),
    alteredEg1SourceBodyRejected: !hasExactEg1ChunkBinding(point, { ...row, content: 'changed' }),
    swappedEg1ChunkIdentityRejected: !hasExactEg1ChunkBinding(point, { ...row, chunk_id: 'chunk:b' }),
  };
  if (Object.values(identityChecks).some((passed) => !passed)) throw new Error('EG1_CHUNK_BINDING_PROBE_FAILED');
  return {
    mrlWidthsAccepted: readEg2Vectors({ model_id: eg2ModelId, embeddings: vectors }).map((vector) => vector.length),
    missingMrlWidthRejected: mustReject(() => readEg2Vectors({ model_id: eg2ModelId, embeddings: missing512 }), 'EG2_BATCH_INVALID_512'),
    wrongModelRejected: mustReject(() => readEg2Vectors({ model_id: 'embeddinggemma:latest', embeddings: vectors }), 'EG2_MODEL_ID_MISMATCH'),
    nonFiniteVectorRejected: mustReject(() => requireUnitVector([NaN], 1), 'INVALID_EMBEDDING_VECTOR'),
    emptyGoResponseRejected: mustReject(() => requireGoChunks({
      representation_used: 'semantic_768', query_stage_trace: { qdrant_collection: eg1Collection }, chunks: [],
    }), 'GO_RETRIEVAL_EMPTY_OR_FAILED'),
    malformedQdrantResponseRejected: mustReject(() => requireQdrantPoints({ status: 'error', result: { points: [] } }), 'QDRANT_RESPONSE_UNVERIFIED'),
    ...identityChecks,
  };
}

/**
 * Optional side-by-side probes of :8097, :8100 and :8094. They never change the
 * run status or the SearchRuntime metrics. The EG1 services can write TTL
 * cache entries, so those probes run only when explicitly selected.
 */
async function runServiceArms(
  pool: ReadPool,
  query: string,
  expectedIds: string[],
  topK: number,
  evaluationSourceRefs: ReadonlySet<string>,
  selectedArms: ReadonlySet<ServiceArm>,
) {
  const referenceRows = await pool.query(
    'SELECT packet_key, source_ref FROM atlas_packets WHERE packet_key = ANY($1::text[])',
    [expectedIds],
  );
  const normalize = (value: unknown) => (typeof value === 'string' ? value.split('\\').join('/') : null);
  const referenceKeys = new Set(expectedIds);
  const referenceSources = new Set<string>(referenceRows.rows.map((row) => normalize(row.source_ref) ?? ''));

  const summarize = (hits: ArmHit[]) => ({
    returned: hits.length,
    referenceKeyHits: new Set(hits.map((hit) => hit.packetKey).filter((key) => key && referenceKeys.has(key))).size,
    referenceSourceHits: new Set(hits.map((hit) => hit.sourceRef).filter((ref) => ref && referenceSources.has(ref))).size,
    evaluationSelfReferences: hits.filter((hit) => hit.sourceRef && evaluationSourceRefs.has(hit.sourceRef)).length,
    top: hits.slice(0, 5),
  });
  const run = async (arm: ServiceArm, meta: Record<string, string>, search: () => Promise<{ hits: ArmHit[]; observation?: unknown; blockedStatus?: string }>) => {
    if (!selectedArms.has(arm)) return { ...meta, status: 'NOT_REQUESTED', metrics: null };
    const started = Date.now();
    try {
      const { hits, observation, blockedStatus } = await search();
      if (blockedStatus) return { ...meta, status: blockedStatus, observation, metrics: null, durationMs: Date.now() - started };
      const missingPacketKeys = hits.filter((hit) => !hit.packetKey).length;
      const status = missingPacketKeys > 0 ? 'UNRESOLVED_PACKET_IDENTITY' : 'OBSERVATION_COMPLETED';
      // A projection payload's packet key is a hint. Preserve source-level
      // diagnostics while withholding comparable metrics across unlike corpora.
      return { ...meta, status, missingPacketKeys, observation, metrics: null,
        ...summarize(hits), durationMs: Date.now() - started };
    } catch (error) {
      return { ...meta, status: 'FAILED', metrics: null, error: describeError(error), durationMs: Date.now() - started };
    }
  };

  const goEmbedUrl = process.env.ATLAS_EVAL_GO_EMBED_URL ?? 'http://127.0.0.1:8097';
  const goRetrievalUrl = process.env.ATLAS_EVAL_GO_RETRIEVAL_URL ?? 'http://127.0.0.1:8100';
  const eg2Url = process.env.ATLAS_EVAL_EG2_URL ?? 'http://127.0.0.1:8094';
  const qdrantUrl = process.env.ATLAS_EVAL_QDRANT_URL ?? 'http://127.0.0.1:6333';

  return {
    countsTowardMetrics: false,
    evaluationKind: 'PROJECTION_DIAGNOSTICS_DIFFERENT_CORPORA',
    backendCacheWritesPossible: selectedArms.has('eg1') || selectedArms.has('go'),
    eg1Via8097: await run('eg1', {
      embedder: ':8097 /embed (embeddinggemma:latest)',
      store: `${eg1Collection}:content`,
      parity: 'Query recipe and stored-vector provenance require independent qualification.',
    }, async () => {
      const observation = await observeEg1Parity(pool, qdrantUrl, goEmbedUrl);
      if (observation.status !== 'DOCUMENT_SAMPLE_PARITY_PASSED') {
        return { hits: [], observation, blockedStatus: observation.status };
      }
      const body = await postJson(`${goEmbedUrl}/embed`, { texts: [query], model: 'embeddinggemma:latest' });
      if (!Array.isArray(body?.embeddings) || body.embeddings.length !== 1) throw new Error('EG1_BATCH_INVALID');
      const vector = requireUnitVector(body.embeddings[0], 768);
      const result = await postJson(`${qdrantUrl}/collections/${eg1Collection}/points/query`, {
        query: vector, using: 'content', limit: topK, with_payload: ['packet_key', 'source_ref'],
      });
      return { observation, hits: requireQdrantPoints(result).map((point) => ({
        packetKey: point.payload?.packet_key || null, sourceRef: normalize(point.payload?.source_ref),
      })) };
    }),
    goRetrieval8100: await run('go', {
      embedder: 'Go retrieval internal strict embedding service',
      store: ':8100 /search/codebase',
    }, async () => {
      const body = await postJson(`${goRetrievalUrl}/search/codebase`, { query, limit: topK, representation_id: 'semantic_768' });
      return { hits: requireGoChunks(body).map((chunk) => ({
        packetKey: chunk.packet_key || null,
        sourceRef: normalize(chunk.source_ref || chunk.file_path),
      })) };
    }),
    eg2Via8094: await run('eg2', {
      embedder: ':8094 /embed (EmbeddingGemma 2 ONNX Q8, experiment)',
      store: eg2Collection,
      parity: 'Partial projection. Corpus-wide document recipe and lineage are unverified.',
    }, async () => {
      const config = JSON.parse(readFileSync(path.join(repoRoot, 'models/embeddinggemma2/onnx-q8/config_sentence_transformers.json'), 'utf8'));
      const prefix = config.prompts?.CodeRetrieval;
      if (typeof prefix !== 'string' || !prefix.trim()) throw new Error('EG2_CODE_RETRIEVAL_RECIPE_MISSING');
      const vectors = readEg2Vectors(await postJson(`${eg2Url}/embed`, {
        texts: [prefix + query.trim()], dims: eg2Dimensions,
      }));
      const body = await postJson(`${qdrantUrl}/collections/${eg2Collection}/points/query`, {
        query: vectors[0],
        limit: topK,
        with_payload: ['packet_key', 'source_ref'],
        filter: { must: [
          { key: 'model_id', match: { value: eg2ModelId } },
          { key: 'encoder_profile', match: { value: 'eg2-onnx-q8-mrl-768' } },
        ] },
      });
      return { observation: { modelId: eg2ModelId, mrlWidths: vectors.map((vector) => vector.length),
        searchedWidth: 768, queryPrefixChecksum: sha256(prefix) },
      hits: requireQdrantPoints(body).map((point) => ({
        packetKey: point.payload?.packet_key || null, sourceRef: normalize(point.payload?.source_ref),
      })) };
    }),
  };
}

async function main() {
  const armArgs = process.argv.slice(2).filter((arg) => arg === '--service-arms' || arg.startsWith('--service-arms='));
  if (armArgs.length > 1) throw new Error('SELECT_SERVICE_ARMS_ONCE');
  const requestedArms = armArgs[0] === '--service-arms'
    ? ['eg1', 'go', 'eg2']
    : armArgs[0]?.slice('--service-arms='.length).split(',') ?? [];
  if (requestedArms.some((arm) => arm !== 'eg1' && arm !== 'go' && arm !== 'eg2')) {
    throw new Error('UNKNOWN_SERVICE_ARM: use eg1, go, eg2');
  }
  const selectedArms = new Set(requestedArms as ServiceArm[]);
  const serviceArmsOnly = process.argv.includes('--service-arms-only');
  if (serviceArmsOnly && !selectedArms.size) throw new Error('SELECT_SERVICE_ARMS_FOR_PROBE_ONLY_MODE');
  const reportPath = path.join(repoRoot, '.tmp/atlas', serviceArmsOnly
    ? 'search-runtime-domain10-service-arms-v1.json'
    : 'search-runtime-domain10-reference-eval-v1.json');
  const fixtureBytes = readFileSync(fixturePath);
  const runtimeSourceBytes = readFileSync(runtimeSourcePath);
  const producerBytes = readFileSync(producerPath);
  const fixture = JSON.parse(fixtureBytes.toString('utf8')) as ReferenceFixture;
  if (fixture.schema !== 'atlas.golden-retrieval-stability-fixture.v1'
    || fixture.fixtureType !== 'DETERMINISTIC_REPLAY_NOT_HUMAN_RELEVANCE'
    || fixture.humanRelevanceJudgments !== false
    || fixture.canonicalWrites !== false) {
    throw new Error('REFERENCE_FIXTURE_CONTRACT_MISMATCH');
  }
  const expectedIds = uniqueNonEmpty(fixture.expectedCanonicalIds, 'REFERENCE_IDS');
  const adversarialChecks = runAdversarialProbes();
  const runtimeDiagnostics: Array<{ level: 'warn' | 'error'; message: string; codes: string[] }> = [];

  const report: Record<string, unknown> = {
    schema: 'atlas.search-runtime-domain10-reference-eval.v1',
    status: 'RUNNING',
    generatedAt: new Date().toISOString(),
    mode: serviceArmsOnly ? 'SERVICE_ARM_OBSERVATIONS_ONLY' : 'READ_ONLY_SEARCH_RUNTIME_REPLAY',
    gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim(),
    inputs: {
      fixturePath: path.relative(repoRoot, fixturePath).replace(/\\/g, '/'),
      fixtureChecksum: sha256(fixtureBytes),
      fixtureType: fixture.fixtureType,
      queryId: fixture.queryId,
      queryChecksum: sha256(fixture.query),
      expectedCanonicalIdsChecksum: sha256(JSON.stringify(expectedIds)),
      workspaceRevision: fixture.workspaceRevision ?? null,
      candidateSnapshotRevision: fixture.candidateSnapshotRevision ?? null,
      ordinalMapChecksum: fixture.ordinalMapChecksum ?? null,
      expectedReferenceCount: expectedIds.length,
      searchRuntimeSourceChecksum: sha256(runtimeSourceBytes),
      harnessSourceChecksum: sha256(producerBytes),
    },
    evaluation: {
      kind: 'TRACE_REFERENCE_AGREEMENT_NOT_HUMAN_RELEVANCE',
      humanRelevanceJudgments: false,
      metricsInterpretation: 'Agreement with a deterministic historical Top-K reference set; not relevance quality or promotion evidence.',
      adversarialChecks,
      serviceArmChecks: runServiceArmProbes(),
    },
    writesPerformed: false,
    backendCacheWritesPossible: selectedArms.has('eg1') || selectedArms.has('go'),
    canonicalAuthority: false,
    runtime: null,
    error: null,
  };

  try {
    const { loadRuntimeEnv } = await import(pathToFileURL(path.join(repoRoot, 'sveltekit-frontend/src/lib/server/config/load-runtime-env.js')).href);
    loadRuntimeEnv({ cwd: repoRoot, mode: 'development' });
    if (selectedArms.size) {
      const { pool } = await import('../../sveltekit-frontend/src/lib/server/db/client.js');
      report.serviceArms = await runServiceArms(
        pool,
        fixture.query,
        expectedIds,
        fixture.topK,
        new Set([fixturePath, producerPath].map((file) => path.relative(repoRoot, file).split(path.sep).join('/'))),
        selectedArms,
      );
    }
    if (serviceArmsOnly) report.status = 'SERVICE_ARM_OBSERVATIONS_RECORDED';
  } catch (error) {
    report.status = 'BLOCKED_EVAL_SETUP';
    report.error = describeError(error);
  }

  if (report.status === 'RUNNING') try {
    const { createSearchRuntime, initializeSearchRuntime } = await import(pathToFileURL(path.join(repoRoot, 'sveltekit-frontend/src/lib/server/retrieval/search-runtime.ts')).href);
    const originalWarn = console.warn;
    const originalError = console.error;
    const captureDiagnostic = (level: 'warn' | 'error', args: unknown[]) => {
      const first = args[0];
      const message = typeof first === 'string' ? first : first instanceof Error ? first.message : String(first ?? '');
      const codes = args.flatMap((value) => {
        if (!value || typeof value !== 'object') return [];
        const item = value as { code?: unknown; cause?: { code?: unknown } };
        return [item.code, item.cause?.code].filter((code): code is string => typeof code === 'string');
      });
      runtimeDiagnostics.push({ level, message: message.slice(0, 240), codes: [...new Set(codes)] });
    };
    // retrieveQdrant degrades to an empty list when this fails, so check it explicitly.
    let denseLane: { available: boolean; error: string | null } = { available: true, error: null };
    try {
      const { embedQueryForLane } = await import(pathToFileURL(path.join(repoRoot, 'sveltekit-frontend/src/lib/server/retrieval/embedding-service.ts')).href);
      await embedQueryForLane(fixture.query, 'dense_768');
    } catch (error) {
      denseLane = { available: false, error: describeError(error) };
    }
    report.denseLanePreflight = denseLane;
    let result: SearchResult;
    try {
      console.warn = (...args: unknown[]) => captureDiagnostic('warn', args);
      console.error = (...args: unknown[]) => captureDiagnostic('error', args);
      await initializeSearchRuntime();
      const runtime = createSearchRuntime({ readOnly: true });
      result = await runtime.search({
        text: fixture.query,
        topK: fixture.topK,
        ...(fixture.workspaceRevision ? { workspaceRevision: fixture.workspaceRevision } : {}),
      });
    } finally {
      console.warn = originalWarn;
      console.error = originalError;
    }
    const packetIds = extractCanonicalIds(result.packets);
    const { pool } = await import('../../sveltekit-frontend/src/lib/server/db/client.js');
    const known = await pool.query(
      'SELECT packet_key FROM atlas_packets WHERE packet_key = ANY($1::text[])',
      [packetIds],
    );
    const identityGuard = assessReturnedPackets(
      result.packets,
      new Set(known.rows.map((row: { packet_key: string }) => row.packet_key)),
      new Set([fixturePath, producerPath].map((file) => path.relative(repoRoot, file).replace(/\\/g, '/'))),
    );
    const backendError = runtimeDiagnostics.some((item) =>
      item.codes.some((code) => ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT'].includes(code))
      || /^\[retrieveQdrant\].*(?:query embedding failed|dense-only fallback also failed| search failed)/.test(item.message));
    const metrics = packetIds.length > 0 && identityGuard.blockedStatus === null && denseLane.available && !backendError
      ? metricSet(expectedIds, packetIds, fixture.topK)
      : null;
    const referenceSetOutcome = metrics === null
      ? backendError
        ? 'NOT_COMPUTED_RETRIEVAL_BACKEND_UNAVAILABLE'
        : !denseLane.available
        ? 'NOT_COMPUTED_DENSE_LANE_UNAVAILABLE'
        : identityGuard.blockedStatus ? 'NOT_COMPUTED_IDENTITY_GUARD' : 'NOT_COMPUTED_EMPTY_RESULT'
      : metrics.hitsAtK === 0
        ? 'NO_REFERENCE_OVERLAP'
        : metrics.recallAtK === 1
          ? 'FULL_REFERENCE_SET_COVERAGE'
          : 'PARTIAL_REFERENCE_OVERLAP';
    const evaluation = report.evaluation as Record<string, unknown>;
    evaluation.referenceSetOutcome = referenceSetOutcome;
    evaluation.acceptance = 'BASELINE_CAPTURE_ONLY_NOT_PROMOTION';
    report.status = backendError
      ? 'BLOCKED_RETRIEVAL_BACKEND_UNAVAILABLE'
      : !denseLane.available
        ? 'BLOCKED_DENSE_LANE_UNAVAILABLE'
        : packetIds.length === 0
        ? 'BLOCKED_EMPTY_SEARCH_RUNTIME_RESULT'
        : identityGuard.blockedStatus ?? 'REFERENCE_REPLAY_COMPLETED';
    report.runtime = {
      identityGuard,
      readOnly: true,
      query: result.metadata.query,
      durationMs: result.metadata.durationMs,
      candidatesRetrieved: result.metadata.candidatesRetrieved,
      candidatesFused: result.metadata.candidatesFused,
      candidatesReranked: result.metadata.candidatesReranked,
      returnedPacketCount: packetIds.length,
      canonicalPacketIds: packetIds,
      diagnostics: runtimeDiagnostics,
      metrics,
      proof: result.proof ? {
        canonicalJoinedCount: result.proof.canonicalJoinedCount,
        canonicalJoinMissingCount: result.proof.canonicalJoinMissingCount,
        workspaceRejectedCount: result.proof.workspaceRejectedCount,
        workspaceRevisionRejectedCount: result.proof.workspaceRevisionRejectedCount,
        sourceRevisionRejectedCount: result.proof.sourceRevisionRejectedCount,
        pagerankLaneCount: result.proof.pagerankLaneCount,
        graphScoreAttachedCount: result.proof.graphScoreAttachedCount,
        graphScoreMissingCount: result.proof.graphScoreMissingCount,
      } : null,
      provenance: result.provenance ? {
        readOnly: result.provenance.readOnly,
        fusionMethod: result.provenance.fusionMethod,
        retrievalSources: result.provenance.retrievalSources,
        rerankerUsed: result.provenance.rerankerUsed,
      } : null,
    };
  } catch (error) {
    report.status = 'BLOCKED_SEARCH_RUNTIME_ERROR';
    report.error = {
      name: error instanceof Error ? error.name : 'UnknownError',
      message: describeError(error),
    };
  }

  try {
    const { closeConnections } = await import('../../sveltekit-frontend/src/lib/server/db/client.js');
    await closeConnections();
    report.resourceCleanup = { postgresPoolsClosed: true };
  } catch (error) {
    report.resourceCleanup = {
      postgresPoolsClosed: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({ status: report.status, reportPath: path.relative(repoRoot, reportPath).replace(/\\/g, '/'), runtime: report.runtime, serviceArms: report.serviceArms, error: report.error }, null, 2)}\n`);
  if (String(report.status).startsWith('BLOCKED_')) process.exitCode = 2;
}

await main();
