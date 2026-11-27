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
const reportPath = path.resolve(repoRoot, '.tmp/atlas/search-runtime-domain10-reference-eval-v1.json');

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

/**
 * Optional side-by-side probes of :8097, :8100 and :8094. They never change the
 * run status or the SearchRuntime metrics. :8097 caches query embeddings in
 * Valkey (TTL), and :8100 embeds through it, so these probes are not write-free.
 */
async function runServiceArms(
  pool: { query: (sql: string, values: unknown[]) => Promise<{ rows: any[] }> },
  query: string,
  expectedIds: string[],
  topK: number,
  evaluationSourceRefs: ReadonlySet<string>,
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
  const run = async (meta: Record<string, string>, hits: () => Promise<ArmHit[]>) => {
    const started = Date.now();
    try {
      return { ...meta, status: 'COMPLETED', ...summarize(await hits()), durationMs: Date.now() - started };
    } catch (error) {
      return { ...meta, status: 'FAILED', error: describeError(error), durationMs: Date.now() - started };
    }
  };

  const goEmbedUrl = process.env.ATLAS_EVAL_GO_EMBED_URL ?? 'http://127.0.0.1:8097';
  const goRetrievalUrl = process.env.ATLAS_EVAL_GO_RETRIEVAL_URL ?? 'http://127.0.0.1:8100';
  const eg2Url = process.env.ATLAS_EVAL_EG2_URL ?? 'http://127.0.0.1:8094';
  const qdrantUrl = process.env.ATLAS_EVAL_QDRANT_URL ?? 'http://127.0.0.1:6333';

  return {
    countsTowardMetrics: false,
    writeNote: ':8097 caches query embeddings in Valkey with a TTL; :8100 embeds through :8097.',
    pgvectorEg1Via8097: await run({
      embedder: ':8097 /embed, raw query text',
      store: 'codebase_chunk_index.content_embedding_768',
      parity: 'Document side matched 20/20 sampled rows at cosine >= 0.999 on 2026-11-26 (manual check, not re-run here). Query-side recipe unverified.',
    }, async () => {
      const [vector] = (await postJson(`${goEmbedUrl}/embed`, { texts: [query] })).embeddings;
      if (!Array.isArray(vector) || vector.length !== 768) throw new Error('EG1_QUERY_VECTOR_NOT_768');
      // pgvector HNSW returns at most hnsw.ef_search rows (default 40).
      const result = await pool.query(
        `SELECT metadata->>'packet_key' AS packet_key, source_ref
           FROM codebase_chunk_index
          WHERE content_embedding_768 IS NOT NULL
          ORDER BY content_embedding_768 <=> $1::vector
          LIMIT $2`,
        [JSON.stringify(vector), topK],
      );
      return result.rows.map((row) => ({ packetKey: row.packet_key ?? null, sourceRef: normalize(row.source_ref) }));
    }),
    goRetrieval8100: await run({
      embedder: 'Go retrieval internal (configured for :8097)',
      store: ':8100 /search/codebase',
      parity: 'Not checked.',
    }, async () => {
      const body = await postJson(`${goRetrievalUrl}/search/codebase`, { query, limit: topK });
      if (!Array.isArray(body.chunks)) throw new Error(body.chunks === null ? 'GO_RETRIEVAL_NULL_CHUNKS: HTTP 200 with no result list; check the container log for an embed failure' : 'GO_RETRIEVAL_CHUNKS_NOT_ARRAY');
      return body.chunks.map((chunk: any) => ({
        packetKey: chunk.packet_key || null,
        sourceRef: normalize(chunk.source_ref || chunk.file_path),
      }));
    }),
    eg2Via8094: await run({
      embedder: ':8094 /embed (EmbeddingGemma 2, experiment), raw query text',
      store: 'codebase_chunks_eg2_768_q8',
      parity: 'UNVERIFIED: query and document recipes not confirmed; partial corpus.',
    }, async () => {
      const vector = (await postJson(`${eg2Url}/embed`, { texts: [query], dims: [768] })).embeddings?.['768']?.[0];
      if (!Array.isArray(vector) || vector.length !== 768) throw new Error('EG2_QUERY_VECTOR_NOT_768');
      const body = await postJson(`${qdrantUrl}/collections/codebase_chunks_eg2_768_q8/points/query`, {
        query: vector,
        limit: topK,
        with_payload: ['source_ref'],
      });
      return body.result.points.map((point: any) => ({ packetKey: null, sourceRef: normalize(point.payload?.source_ref) }));
    }),
  };
}

async function main() {
  const withServiceArms = process.argv.includes('--service-arms');
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
    mode: 'READ_ONLY_SEARCH_RUNTIME_REPLAY',
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
    },
    writesPerformed: false,
    canonicalAuthority: false,
    runtime: null,
    error: null,
  };

  try {
    const { loadRuntimeEnv } = await import(pathToFileURL(path.join(repoRoot, 'sveltekit-frontend/src/lib/server/config/load-runtime-env.js')).href);
    loadRuntimeEnv({ cwd: repoRoot, mode: 'development' });
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
    const metrics = packetIds.length > 0 && identityGuard.blockedStatus === null && denseLane.available
      ? metricSet(expectedIds, packetIds, fixture.topK)
      : null;
    if (withServiceArms) {
      report.serviceArms = await runServiceArms(
        pool,
        fixture.query,
        expectedIds,
        fixture.topK,
        new Set([fixturePath, producerPath].map((file) => path.relative(repoRoot, file).split(path.sep).join('/'))),
      );
    }
    const backendError = runtimeDiagnostics.some((item) => item.codes.some((code) => ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT'].includes(code)));
    const referenceSetOutcome = metrics === null
      ? !denseLane.available
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
      message: error instanceof Error ? error.message : String(error),
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
  process.stdout.write(`${JSON.stringify({ status: report.status, reportPath: path.relative(repoRoot, reportPath).replace(/\\/g, '/'), runtime: report.runtime, error: report.error }, null, 2)}\n`);
  if (String(report.status).startsWith('BLOCKED_')) process.exitCode = 2;
}

await main();
