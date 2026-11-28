/**
 * Stage 1: Deterministic Candidate Retrieval
 *
 * Retrieves candidates from four independent sources in parallel:
 * - PostgreSQL lexical retrieval (ts_rank over the indexed tsvector)
 * - Qdrant ANN (semantic search)
 * - Exact matches (function symbols, class names)
 * - AST matches (structural patterns)
 *
 * Returns a flat multiset of source-specific candidates.
 * Fusion happens downstream so the same packet can accumulate evidence
 * from multiple lanes before reciprocal rank fusion.
 */

import { sql, type SQL } from 'drizzle-orm';
import { execFile } from 'node:child_process';
import { basename, extname, resolve as pathResolve } from 'node:path';
import type { Candidate } from './search-runtime.js';
import { embedQueryForLane } from './embedding-service.js';
import { VECTOR_INDEX_REGISTRY } from '$lib/server/vector/vector-index-registry.js';
import { QDRANT_DENSE_VECTOR_NAME } from '$lib/server/vector/retrieval-semantics.js';
import { RETRIEVAL_LIMITS, identifierVariants, tokenizeKeywordSurface } from './search-contract.js';
import { resolveCanonicalIdentity } from './identity-resolution.js';
import { resolveProjectionsBatch } from '$lib/server/atlas/retrieval/projection-registry-v1.js';

const BM25_LIMIT = RETRIEVAL_LIMITS.postgresFtsTopK;
const QDRANT_LIMIT = RETRIEVAL_LIMITS.denseTopK;
const EXACT_LIMIT = RETRIEVAL_LIMITS.exactLexicalTopK;
const AST_LIMIT = RETRIEVAL_LIMITS.topologyTopK;
const RG_LIMIT = RETRIEVAL_LIMITS.maxGraphNeighbors;

export function buildLexicalExpansionQuery(query: string, expansion: readonly string[] = []): string {
  const terms = new Map<string, string>();
  for (const term of [query, ...expansion].map((value) => value.trim()).filter(Boolean)) {
    const key = term.toLocaleLowerCase('en-US');
    if (!terms.has(key)) terms.set(key, term);
  }
  return [...terms.values()].join(' ');
}

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
  }
  return null;
}

function pickNullableString(...values: unknown[]): string | null {
  return pickString(...values);
}

function pickNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/**
 * Compute canonical identity plus observability fields for a candidate.
 *
 * `packetKey` and `symbolVersionId` are normalized to the resolved canonical identity key so the
 * search runtime deduplicates on the shared precedence chain. The original raw fields are carried
 * separately as snake_case metadata so degraded fallback cases stay visible instead of silently
 * masquerading as canonical.
 */
export function deriveIdentity(input: {
  symbolVersionId?: unknown;
  packetKey?: unknown;
  /** Optional chunk-unique fallback tier, checked before source_ref. */
  contentHash?: unknown;
  sourceRef?: unknown;
  fallbackId: string;
}): {
  packetKey: string;
  symbolVersionId: string;
  symbol_version_id: string | null;
  packet_key: string | null;
  source_ref: string | null;
  content_hash: string | null;
  fallback_id: string;
  identityStatus: 'canonical' | 'projection_exact' | 'source_group' | 'degraded';
  identitySource: ReturnType<typeof resolveCanonicalIdentity>['source'];
} {
  const resolved = resolveCanonicalIdentity({
    symbolVersionId: typeof input.symbolVersionId === 'string' ? input.symbolVersionId : undefined,
    packetKey: typeof input.packetKey === 'string' ? input.packetKey : undefined,
    contentHash: typeof input.contentHash === 'string' ? input.contentHash : undefined,
    sourceRef: typeof input.sourceRef === 'string' ? input.sourceRef : undefined,
    fallbackId: input.fallbackId,
  });
  return {
    packetKey: resolved.canonicalId,
    symbolVersionId: resolved.canonicalId,
    symbol_version_id: pickString(input.symbolVersionId),
    packet_key: pickString(input.packetKey),
    source_ref: pickString(input.sourceRef),
    content_hash: pickString(input.contentHash),
    fallback_id: input.fallbackId,
    identityStatus: resolved.status,
    identitySource: resolved.source,
  };
}

/**
 * RF-QDRANT-HYDRATION-02: batch-validate each dense candidate's Qdrant point id against its own
 * `postgres_id` payload via `ProjectionRegistryV1`, and attach `canonicalChunkId` only when it
 * checks out. Fail-open by design -- a `ProjectionRegistryV1` error (network, schema drift) must
 * never remove or block candidates that already resolved via the existing symbol_version_id ->
 * packet_key -> content_hash -> source_ref precedence; it only adds evidence, never subtracts it.
 */
export async function hydrateCanonicalChunkIds(candidates: Candidate[]): Promise<void> {
  if (candidates.length === 0) return;
  try {
    // Deduplicate by point id -- `resolveProjectionsBatch` does not guarantee output order
    // matches input order, so results are matched back by key, never by array position.
    const byPointId = new Map<string, Candidate[]>();
    for (const candidate of candidates) {
      const pointId = candidate.qdrantPointId ?? candidate.id;
      const bucket = byPointId.get(pointId) ?? [];
      bucket.push(candidate);
      byPointId.set(pointId, bucket);
    }
    const keys = [...byPointId.keys()].map((canonicalPacketIdentity) => ({
      canonicalPacketIdentity,
      representationIdentity: 'semantic_768' as const,
    }));
    const resolutions = await resolveProjectionsBatch(keys);
    for (const resolution of resolutions) {
      if (!resolution.ok) continue;
      const bucket = byPointId.get(resolution.ref.physicalPointId);
      if (!bucket) continue;
      for (const candidate of bucket) candidate.canonicalChunkId = resolution.ref.physicalPointId;
    }
  } catch (error) {
    console.warn('[retrieveQdrant] RF-QDRANT-HYDRATION-02 batch hydration failed (fail-open):', (error as Error).message);
  }
}

async function getDb() {
  const mod = await import('$lib/server/db/client.js');
  return mod.db;
}

/** Execute a retrieval SELECT on a dedicated read-only PG client so AbortSignal can issue PG cancel. */
async function executeReadOnlyQuery(db: Awaited<ReturnType<typeof getDb>>, statement: SQL, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const dbClient = await import('$lib/server/db/client.js');
  const client = await dbClient.pool.connect();
  let transactionOpen = false;
  const query = (db as unknown as { dialect: { sqlToQuery(value: SQL): { sql: string; params: unknown[] } } }).dialect.sqlToQuery(statement);
  const cancelActiveQuery = () => {
    const activeQuery = (client as unknown as { activeQuery?: unknown }).activeQuery;
    if (activeQuery) (client as unknown as { cancel(client: unknown, query: unknown): void }).cancel(client, activeQuery);
  };
  signal?.addEventListener('abort', cancelActiveQuery, { once: true });
  try {
    signal?.throwIfAborted();
    await client.query('BEGIN READ ONLY');
    transactionOpen = true;
    await client.query("SELECT set_config('statement_timeout', $1, true)", ['8000ms']);
    signal?.throwIfAborted();
    const queryPromise = client.query(query.sql, query.params);
    if (signal?.aborted) cancelActiveQuery();
    const result = await queryPromise;
    signal?.throwIfAborted();
    return result;
  } finally {
    signal?.removeEventListener('abort', cancelActiveQuery);
    try {
      if (transactionOpen) await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  }
}

async function getQdrantManager() {
  const mod = await import('$lib/server/vector/qdrant-manager.js');
  return mod.getQdrantManager();
}

export type RetrievalLaneName = 'bm25' | 'qdrant' | 'exact' | 'ast' | 'rg' | 'dense' | 'sparse' | 'bm42' | 'go-retrieval';
export type RetrievalLogicalLaneName = 'lexical' | 'dense' | 'exact' | 'ast' | 'rg' | 'multi';
export type RetrievalLaneStatus = 'ok' | 'empty' | 'timed_out' | 'cancelled' | 'unavailable' | 'skipped';
export type RetrievalExecutorStatus =
  | 'SUCCESS' | 'ZERO_HITS' | 'DISABLED' | 'TIMEOUT' | 'CANCELLED'
  | 'BACKEND_UNAVAILABLE' | 'AUTHORIZATION_BLOCKED' | 'REPRESENTATION_MISMATCH';

export interface RetrievalLaneReceipt {
  lane: RetrievalLaneName;
  logicalLane: RetrievalLogicalLaneName;
  status: RetrievalLaneStatus;
  executionStatus?: RetrievalExecutorStatus;
  hitCount: number;
  elapsedMs: number;
  deadlineMs: number;
  error?: string;
  cancellationRequested?: boolean;
  cancellationConfirmed?: boolean;
  cancellationSupport?: 'aborted' | 'unsupported' | 'not_requested';
  lexicalFallback?: {
    status: 'not_needed' | 'not_admitted';
    strategy: 'postgres_substring_like';
    reason?: 'fts_returned_hits' | 'no_indexed_fallback_path';
  };
  binding?: {
    runId: string;
    taskId: string | null;
    workspaceId: string | null;
    workspaceRevision: string | null;
    sourceRevision: string | null;
    representationId: string | null;
    representationRevision: number | null;
    bindingStatus: 'complete' | 'incomplete';
    authorizationBindingStatus: 'validated_actor_grant' | 'not_carried_by_search_runtime';
  };
}

export interface RetrieveAllCandidatesResult {
  candidates: Candidate[];
  laneReceipts: RetrievalLaneReceipt[];
}

/**
 * Execute a single retrieval lane with a bounded deadline and structured receipt,
 * keeping ok, empty, timed_out, unavailable, and skipped distinct.
 */
export async function executeLaneWithDeadline<T = Candidate>(
  lane: RetrievalLaneName,
  logicalLane: RetrievalLogicalLaneName,
  deadlineMs: number,
  run: (signal: AbortSignal) => Promise<T[]>,
  options?: { skip?: boolean; skipReason?: string; unavailableReason?: string; executionStatus?: RetrievalExecutorStatus; signal?: AbortSignal; cancellationConfirmationMs?: number },
): Promise<{ candidates: T[]; receipt: RetrievalLaneReceipt }> {
  if (options?.skip) {
    return {
      candidates: [],
      receipt: {
        lane,
        logicalLane,
        status: 'skipped',
        ...(options.executionStatus ? { executionStatus: options.executionStatus } : {}),
        hitCount: 0,
        elapsedMs: 0,
        deadlineMs,
        ...(options.skipReason ? { error: options.skipReason } : {}),
      },
    };
  }

  if (options?.unavailableReason) {
    return {
      candidates: [],
      receipt: {
        lane,
        logicalLane,
        status: 'unavailable',
        hitCount: 0,
        elapsedMs: 0,
        deadlineMs,
        error: options.unavailableReason,
        cancellationRequested: false,
        cancellationConfirmed: false,
        cancellationSupport: 'not_requested',
      },
    };
  }

  const startedAt = Date.now();
  const controller = new AbortController();
  const parentSignal = options?.signal;
  const abortFromParent = () => controller.abort(parentSignal?.reason ?? new Error('REQUEST_CANCELLED'));
  if (parentSignal?.aborted) abortFromParent();
  else parentSignal?.addEventListener('abort', abortFromParent, { once: true });
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let confirmationTimeout: ReturnType<typeof setTimeout> | undefined;
  let abortListener: (() => void) | undefined;
  let abortKind: 'timed_out' | 'cancelled' = 'cancelled';

  try {
    if (controller.signal.aborted) {
      return {
        candidates: [],
        receipt: { lane, logicalLane, status: 'cancelled', hitCount: 0, elapsedMs: 0, deadlineMs, error: 'REQUEST_CANCELLED' },
      };
    }
    let workSettled = false;
    const workOutcome = Promise.resolve()
      .then(() => run(controller.signal))
      .then(
        (candidates) => {
          workSettled = true;
          return { kind: 'ok' as const, candidates };
        },
        (err: unknown) => {
          workSettled = true;
          return { kind: 'error' as const, message: err instanceof Error ? err.message : String(err) };
        },
      );
    const abortOutcome = new Promise<{ kind: 'abort' }>((resolve) => {
      abortListener = () => resolve({ kind: 'abort' });
      controller.signal.addEventListener('abort', abortListener, { once: true });
      timeout = setTimeout(() => {
        abortKind = 'timed_out';
        controller.abort(new Error(`LANE_DEADLINE_EXCEEDED:${deadlineMs}ms`));
      }, deadlineMs);
    });

    const outcome = await Promise.race([workOutcome, abortOutcome]);
    const elapsedMs = Date.now() - startedAt;

    if (outcome.kind === 'abort') {
      const reason = controller.signal.reason;
      const reasonText = reason instanceof Error ? reason.message : String(reason ?? 'REQUEST_CANCELLED');
      if (/(?:REQUEST|GLOBAL)_DEADLINE_EXCEEDED|DEADLINE_EXCEEDED/.test(reasonText)) {
        abortKind = 'timed_out';
      }
      const confirmationMs = options?.cancellationConfirmationMs ?? 50;
      if (!workSettled && confirmationMs > 0) {
        await Promise.race([
          workOutcome,
          new Promise<void>((resolve) => {
            confirmationTimeout = setTimeout(resolve, confirmationMs);
          }),
        ]);
      }
      const cancellationConfirmed = workSettled;
      return {
        candidates: [],
        receipt: {
          lane,
          logicalLane,
          status: abortKind,
          hitCount: 0,
          elapsedMs,
          deadlineMs,
          error: abortKind === 'timed_out' ? reasonText : 'REQUEST_CANCELLED',
          cancellationRequested: true,
          cancellationConfirmed,
          cancellationSupport: cancellationConfirmed ? 'aborted' : 'unsupported',
        },
      };
    }

    if (outcome.kind === 'error') {
      if (controller.signal.aborted) {
        const reason = controller.signal.reason;
        const message = reason instanceof Error ? reason.message : String(reason ?? 'REQUEST_CANCELLED');
        const status = /(?:REQUEST|GLOBAL)_DEADLINE_EXCEEDED|DEADLINE_EXCEEDED/.test(message) ? 'timed_out' : abortKind;
        return {
          candidates: [],
          receipt: {
            lane, logicalLane, status, hitCount: 0, elapsedMs, deadlineMs,
            error: message,
            cancellationRequested: true,
            cancellationConfirmed: true,
            cancellationSupport: 'aborted',
          },
        };
      }
      return {
        candidates: [],
        receipt: {
          lane,
          logicalLane,
          status: 'unavailable',
          hitCount: 0,
          elapsedMs,
          deadlineMs,
          error: outcome.message,
          cancellationRequested: controller.signal.aborted,
          cancellationConfirmed: controller.signal.aborted,
          cancellationSupport: controller.signal.aborted ? 'aborted' : 'not_requested',
        },
      };
    }

    if (outcome.kind === 'ok') {
      return {
        candidates: outcome.candidates,
        receipt: {
          lane,
          logicalLane,
          status: outcome.candidates.length > 0 ? 'ok' : 'empty',
          hitCount: outcome.candidates.length,
          elapsedMs,
          deadlineMs,
          cancellationRequested: false,
          cancellationConfirmed: false,
          cancellationSupport: 'not_requested',
        },
      };
    }

    return {
      candidates: [],
      receipt: {
        lane,
        logicalLane,
        status: 'unavailable',
        hitCount: 0,
        elapsedMs,
        deadlineMs,
        cancellationRequested: controller.signal.aborted,
        cancellationConfirmed: controller.signal.aborted,
        cancellationSupport: controller.signal.aborted ? 'aborted' : 'not_requested',
      },
    };
  } finally {
    if (timeout) clearTimeout(timeout);
    if (confirmationTimeout) clearTimeout(confirmationTimeout);
    if (abortListener) controller.signal.removeEventListener('abort', abortListener);
    parentSignal?.removeEventListener('abort', abortFromParent);
  }
}

/**
 * Retrieve candidates from all sources with per-lane deadline receipts.
 */
export async function retrieveAllCandidatesWithReceipts(
  query: string,
  filters?: { sourceRefs?: string[]; pathPrefixes?: string[] },
  _limit: number = 128,
  options?: {
    includeVectorLanes?: boolean;
    vectorLaneUnavailableReason?: string;
    lexicalExpansion?: string[];
    laneTimeoutMs?: number;
    globalTimeoutMs?: number;
    signal?: AbortSignal;
    goRetrievalContext?: {
      requestId: string;
      taskId: string;
      runId: string;
      workspaceId: string;
      workspaceRevision: string;
      sourceRevision: string;
      representationId: string;
      representationRevision: number;
      embeddingModelId: string;
      embeddingModelRevision: string;
    };
  },
): Promise<RetrieveAllCandidatesResult> {
  const includeVectorLanes = options?.includeVectorLanes ?? true;
  const laneTimeoutMs = options?.laneTimeoutMs ?? 5000;
  const globalTimeoutMs = options?.globalTimeoutMs ?? 8000;
  const requestController = new AbortController();
  let globalDeadlineReached = false;
  const abortRequest = () => requestController.abort(options?.signal?.reason ?? new Error('REQUEST_CANCELLED'));
  if (options?.signal?.aborted) abortRequest();
  else options?.signal?.addEventListener('abort', abortRequest, { once: true });
  const globalTimer = setTimeout(() => {
    globalDeadlineReached = true;
    requestController.abort(new Error(`REQUEST_DEADLINE_EXCEEDED:${globalTimeoutMs}ms`));
  }, globalTimeoutMs);
  const lexicalQuery = buildLexicalExpansionQuery(query, options?.lexicalExpansion);
  let lexicalFallbackDecision: RetrievalLaneReceipt['lexicalFallback'];
  let goRetrievalExecutionStatus: RetrievalExecutorStatus | undefined;

  const runLane = (
    lane: RetrievalLaneName,
    logical: RetrievalLogicalLaneName,
    run: (signal: AbortSignal) => Promise<Candidate[]>,
		state?: { skip?: boolean; skipReason?: string; unavailableReason?: string; executionStatus?: RetrievalExecutorStatus },
  ) => {
    const remaining = Math.max(1, globalTimeoutMs - (Date.now() - requestStartedAt));
    return executeLaneWithDeadline(lane, logical, Math.min(laneTimeoutMs, remaining), run, {
      signal: requestController.signal,
      ...(state ?? {}),
    });
  };
  const requestStartedAt = Date.now();
  try {
    const laneOutcomes = await Promise.all([
      runLane('bm25', 'lexical', (signal) => retrieveBM25(lexicalQuery, signal, (decision) => {
        lexicalFallbackDecision = decision;
      })),
      runLane(
        'qdrant',
        'dense',
        (signal) => retrieveQdrant(query, signal),
        !includeVectorLanes
          ? options?.vectorLaneUnavailableReason
            ? { unavailableReason: options.vectorLaneUnavailableReason }
            : { skip: true, skipReason: 'vector_lanes_disabled' }
          : undefined,
      ),
      runLane('exact', 'exact', (signal) => retrieveExactMatches(query, signal)),
      runLane('ast', 'ast', (signal) => retrieveASTMatches(query, signal)),
      runLane('rg', 'rg', (signal) => retrieveRipgrep(query, signal)),
      runLane(
        'go-retrieval',
        'dense',
        async (signal) => {
          const { createGoRetrievalRetriever } = await import('$lib/server/atlas/retrieval/go-retrieval-retriever.js');
          const retriever = createGoRetrievalRetriever({ enabled: true, timeoutMs: Math.min(laneTimeoutMs, 5000) });
          const outcome = await retriever.retrieve({
            query,
            limit: Math.min(_limit, 32),
            context: options?.goRetrievalContext,
            signal,
          });
          goRetrievalExecutionStatus = outcome.status;
          if (outcome.status !== 'SUCCESS' && outcome.status !== 'ZERO_HITS') {
            const errorCode = outcome.status === 'TIMEOUT' ? 'DEADLINE_EXCEEDED' :
              outcome.status === 'CANCELLED' ? 'REQUEST_CANCELLED' : `GO_RETRIEVAL_${outcome.status}:${outcome.errorCode ?? ''}`;
            throw new Error(errorCode);
          }
          return outcome.hits.map((hit) => ({
            id: hit.packetKey,
            packetKey: hit.packetKey,
            sourceRef: hit.sourceRef,
            content_hash: hit.contentHash,
            summary: '',
            content: '',
            score: hit.score,
            scoreSource: 'qdrant_768' as const,
            workspaceRevision: hit.workspaceRevision,
            sourceRevision: hit.sourceRevision,
            representationId: hit.representationId,
            representationRevision: hit.representationRevision,
            retrievalExecutor: 'go-retrieval',
          }));
        },
        !includeVectorLanes || !(process.env.GO_RETRIEVAL_ENABLED === 'true' || process.env.GO_RETRIEVAL_ENABLED === '1')
          ? { skip: true, skipReason: !includeVectorLanes ? 'vector_lanes_disabled' : 'go_retrieval_disabled', executionStatus: 'DISABLED' }
          : !options?.goRetrievalContext
            ? { skip: true, skipReason: 'go_retrieval_revision_context_missing', executionStatus: 'AUTHORIZATION_BLOCKED' }
          : undefined,
      ),
    ]);

  const combined = laneOutcomes.flatMap((o) => o.candidates);
    const laneReceipts = laneOutcomes.map((o) => {
      const receipt = o.receipt.lane === 'bm25' && lexicalFallbackDecision
        ? { ...o.receipt, lexicalFallback: lexicalFallbackDecision }
        : o.receipt;
      if (receipt.lane === 'go-retrieval') {
        const executionStatus = goRetrievalExecutionStatus ??
          (receipt.status === 'timed_out' ? 'TIMEOUT' : receipt.status === 'cancelled' ? 'CANCELLED' : undefined);
        if (executionStatus) return { ...receipt, executionStatus };
      }
      if (globalDeadlineReached && o.receipt.status === 'cancelled') {
        return { ...receipt, status: 'timed_out' as const, error: `REQUEST_DEADLINE_EXCEEDED:${globalTimeoutMs}ms` };
      }
      return receipt;
    });
  if (!filters) {
    return { candidates: combined, laneReceipts };
  }

  const filtered = combined.filter((candidate) => {
    if (filters.sourceRefs?.length && !filters.sourceRefs.includes(candidate.sourceRef)) {
      return false;
    }
    if (filters.pathPrefixes?.length && !filters.pathPrefixes.some((prefix) => candidate.sourceRef.startsWith(prefix))) {
      return false;
    }
    return true;
  });

    return { candidates: filtered, laneReceipts };
  } finally {
    clearTimeout(globalTimer);
    options?.signal?.removeEventListener('abort', abortRequest);
  }
}

/**
 * Retrieve candidates from all sources
 */
export async function retrieveAllCandidates(
  query: string,
  filters?: { sourceRefs?: string[]; pathPrefixes?: string[] },
  _limit: number = 128,
  options?: { includeVectorLanes?: boolean; lexicalExpansion?: string[]; laneTimeoutMs?: number; globalTimeoutMs?: number; signal?: AbortSignal },
): Promise<Candidate[]> {
  const res = await retrieveAllCandidatesWithReceipts(query, filters, _limit, options);
  return res.candidates;
}

/**
 * PostgreSQL full-text retrieval via ts_rank (not Okapi BM25).
 * An empty FTS result remains a successful empty result: the old unindexed substring
 * fallback is intentionally not admitted into this bounded retrieval lane.
 */
export type LexicalFallbackDecision = NonNullable<RetrievalLaneReceipt['lexicalFallback']>;

export async function retrieveBM25(
  query: string,
  signal?: AbortSignal,
  onFallbackDecision?: (decision: LexicalFallbackDecision) => void,
): Promise<Candidate[]> {
  try {
    signal?.throwIfAborted();
    const db = await getDb();
    // Clean query terms: remove operators and keep alphanumeric tokens
    const queryTerms = query
      .trim()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 0);

    if (queryTerms.length === 0) {
      return []; // Empty query
    }

    // Build Boolean query with AND between terms
    const queryTsQuery = queryTerms.join(' & ');

    // Primary: PostgreSQL ts_rank on search_vector
    const result = await executeReadOnlyQuery(db, sql`
      WITH ranked AS MATERIALIZED (
        SELECT
          id,
          ts_rank(search_vector, to_tsquery('english', ${queryTsQuery})) AS score
        FROM codebase_chunk_index
        WHERE search_vector @@ to_tsquery('english', ${queryTsQuery})
        ORDER BY score DESC, id ASC
        LIMIT ${BM25_LIMIT}
      )
      SELECT
        chunk.id,
        chunk.source_ref,
        chunk.metadata,
        chunk.summary,
        chunk.content,
        ranked.score
      FROM ranked
      JOIN codebase_chunk_index AS chunk ON chunk.id = ranked.id
      ORDER BY ranked.score DESC, ranked.id ASC
    `, signal);

    if (result.rows.length > 0) {
      onFallbackDecision?.({ status: 'not_needed', strategy: 'postgres_substring_like', reason: 'fts_returned_hits' });
      type BM25Row = {
        id: string;
        source_ref: string;
        metadata: Record<string, unknown> | null;
        summary: string;
        content: string;
        score: number;
      };

    return (result.rows as BM25Row[]).map(row => ({
      id: row.id,
      sourceRef: row.source_ref || '',
      summary: row.summary || '',
      content: row.content || '',
        score: Math.max(0.5, Math.min(1.0, row.score)), // Normalize to 0.5-1.0 range
        scoreSource: 'postgres_fts' as const,
        workspaceRevision: pickString(row.metadata?.workspace_revision, row.metadata?.workspaceRevision),
        sourceRevision: pickNullableString(row.metadata?.source_revision, row.metadata?.sourceRevision),
        representationId: pickNullableString(row.metadata?.representation_id, row.metadata?.representationId),
        representationRevision: pickNumber(row.metadata?.representation_revision, row.metadata?.representationRevision),
        ...deriveIdentity({
          symbolVersionId: row.metadata?.symbol_version_id,
          packetKey: row.metadata?.packet_key,
          sourceRef: row.source_ref,
          fallbackId: row.id,
        }),
      }));
    }

    onFallbackDecision?.({ status: 'not_admitted', strategy: 'postgres_substring_like', reason: 'no_indexed_fallback_path' });
    return [];
  } catch (error) {
    onFallbackDecision?.({ status: 'not_admitted', strategy: 'postgres_substring_like', reason: 'no_indexed_fallback_path' });
    throw error;
  }
}

/**
 * Semantic retrieval via Qdrant ANN search
 * Primary: codebase_chunks_768 (declared dense 768-dim lane)
 */
export async function retrieveQdrant(query: string, signal?: AbortSignal): Promise<Candidate[]> {
  signal?.throwIfAborted();
  const dense768 = await embedQueryForLane(query, 'dense_768', { signal });
  signal?.throwIfAborted();
  const queryVectors = {
    dense768: dense768?.vector ?? null,
  };
  const embedding = queryVectors.dense768;
  if (!embedding) throw new Error('DENSE_QUERY_EMBEDDING_MISSING');

  const qdrant = await getQdrantManager();
  const collections = [VECTOR_INDEX_REGISTRY.qdrantSource768.collection];
  const resultsByKey = new Map<string, Candidate>();

  try {
    for (const collection of collections) {
      try {
        signal?.throwIfAborted();
        // Keep dense retrieval as a raw logical lane; SearchRuntime owns fusion.
        const results = await qdrant.denseSearch({
          collection,
          query,
          queryVector: Array.from(embedding),
          vectorName: QDRANT_DENSE_VECTOR_NAME,
          limit: QDRANT_LIMIT,
          timeoutSeconds: 5,
        });

        for (const hit of results.results) {
          const candidate: Candidate = {
            id: String(hit.id),
            sourceRef: (hit.payload?.source_ref as string) || '',
            summary: (hit.payload?.summary as string) || '',
            content: (hit.payload?.content as string) || '',
            score: hit.score,
            scoreSource: 'qdrant_768',
            embeddingLane: 'dense_768',
            workspaceRevision: pickString(hit.payload?.workspace_revision, hit.payload?.workspaceRevision),
            sourceRevision: pickNullableString(hit.payload?.source_revision, hit.payload?.sourceRevision),
            representationId: pickNullableString(hit.payload?.representation_id, hit.payload?.representationId),
            representationRevision: pickNumber(hit.payload?.representation_revision, hit.payload?.representationRevision),
            qdrantPointId: String(hit.id),
            retrievalExecutor: 'qdrant',
            ...deriveIdentity({
              symbolVersionId: hit.payload?.symbol_version_id,
              packetKey: hit.payload?.packet_key,
              contentHash: hit.payload?.content_hash,
              sourceRef: hit.payload?.source_ref,
              fallbackId: String(hit.id),
            }),
          };

          const existing = resultsByKey.get(candidate.packetKey) ?? resultsByKey.get(candidate.id);
          if (!existing || candidate.score > existing.score) {
            resultsByKey.set(candidate.packetKey, candidate);
            resultsByKey.set(candidate.id, candidate);
          }
        }
      } catch (error) {
        if (signal?.aborted) throw error;
        console.warn(`[retrieveQdrant] ${collection} search failed:`, (error as Error).message);
      }
    }

    if (resultsByKey.size > 0) {
      const deduped = [...new Map(
        [...resultsByKey.values()].map((candidate) => [candidate.packetKey || candidate.id, candidate])
      ).values()]
        .sort((a, b) => b.score - a.score)
        .slice(0, QDRANT_LIMIT);
      await hydrateCanonicalChunkIds(deduped);
      return deduped;
    }
  } catch (error) {
    if (signal?.aborted) throw error;
    console.warn('[retrieveQdrant] adaptive hybrid search failed, falling back to dense-only:', (error as Error).message);
  }

  // Fallback: dense-only v2 collection
  try {
    const results = await qdrant.denseSearch({
      collection: VECTOR_INDEX_REGISTRY.qdrantSource768.collection ?? 'codebase_chunks_768',
      query,
      queryVector: Array.from(embedding),
      vectorName: QDRANT_DENSE_VECTOR_NAME,
      limit: QDRANT_LIMIT,
      timeoutSeconds: 5,
    });

    const fallbackCandidates = results.results.map(hit => ({
      id: String(hit.id),
      sourceRef: (hit.payload?.source_ref as string) || '',
      summary: (hit.payload?.summary as string) || '',
      content: (hit.payload?.content as string) || '',
      score: hit.score * 0.95,
      scoreSource: 'qdrant_768' as const,
      embeddingLane: 'dense_768' as const,
      workspaceRevision: pickString(hit.payload?.workspace_revision, hit.payload?.workspaceRevision),
      sourceRevision: pickNullableString(hit.payload?.source_revision, hit.payload?.sourceRevision),
      representationId: pickNullableString(hit.payload?.representation_id, hit.payload?.representationId),
      representationRevision: pickNumber(hit.payload?.representation_revision, hit.payload?.representationRevision),
      qdrantPointId: String(hit.id),
      retrievalExecutor: 'qdrant',
      ...deriveIdentity({
        symbolVersionId: hit.payload?.symbol_version_id,
        packetKey: hit.payload?.packet_key,
        contentHash: hit.payload?.content_hash,
        sourceRef: hit.payload?.source_ref,
        fallbackId: String(hit.id),
      }),
    }));
    await hydrateCanonicalChunkIds(fallbackCandidates);
    return fallbackCandidates;
  } catch (fallbackError) {
    console.warn('[retrieveQdrant] dense-only fallback also failed:', (fallbackError as Error).message);
    throw fallbackError;
  }
}

/**
 * Exact identifier matches
 * Searches for exact function symbols, class names, etc
 */
export async function retrieveExactMatches(query: string, signal?: AbortSignal): Promise<Candidate[]> {
  try {
    signal?.throwIfAborted();
    // Split query into potential identifiers
    const identifiers = query
      .split(/\s+/)
      .filter(term => term.length > 2 && /^[a-zA-Z_]/.test(term));

    if (identifiers.length === 0) return [];

    // Use the first identifier with indexed predicates (packet_key btree, metadata GIN, search_vector GIN)
    // to avoid a 274k-row sequential scan and PG 57014 statement timeouts.
    const firstIdentifier = identifiers[0];
    const prefixPattern = `${firstIdentifier}%`;
    const containsPattern = `%${firstIdentifier}%`;

    const db = await getDb();
    signal?.throwIfAborted();
    const result = await executeReadOnlyQuery(db, sql`
      SELECT
        id,
        source_ref,
        metadata,
        summary,
        content,
        1.0 as score
      FROM codebase_chunk_index
      WHERE (metadata->>'packet_key') = ${firstIdentifier}
         OR metadata @> jsonb_build_object('function_symbol', ${firstIdentifier}::text)
         OR (
           search_vector @@ plainto_tsquery('english', ${firstIdentifier})
           AND (
             symbol ILIKE ${prefixPattern}
             OR source_ref ILIKE ${containsPattern}
           )
         )
      LIMIT ${EXACT_LIMIT}
    `, signal);

    type ExactRow = {
      id: string;
      source_ref: string;
      metadata: Record<string, unknown> | null;
      summary: string;
      content: string;
      score: number;
    };

    signal?.throwIfAborted();
    return (result.rows as ExactRow[]).map(row => ({
      id: row.id,
      sourceRef: row.source_ref,
      summary: row.summary || '',
      content: row.content || '',
      score: row.score,
      scoreSource: 'exact_symbol' as const,
      workspaceRevision: pickString(row.metadata?.workspace_revision, row.metadata?.workspaceRevision),
      sourceRevision: pickNullableString(row.metadata?.source_revision, row.metadata?.sourceRevision),
      representationId: pickNullableString(row.metadata?.representation_id, row.metadata?.representationId),
      representationRevision: pickNumber(row.metadata?.representation_revision, row.metadata?.representationRevision),
      ...deriveIdentity({
        symbolVersionId: row.metadata?.symbol_version_id,
        packetKey: row.metadata?.packet_key,
        contentHash: row.metadata?.content_hash ?? row.metadata?.contentHash,
        sourceRef: row.source_ref,
        fallbackId: row.id,
      }),
    }));
  } catch (error) {
    if (signal?.aborted) throw error;
    console.warn('Exact match retrieval failed:', error);
    throw error;
  }
}

/**
 * AST-based structural matches
 * Searches via tree_node_id array matching against query identifiers
 */
export async function retrieveASTMatches(query: string, signal?: AbortSignal): Promise<Candidate[]> {
  try {
    signal?.throwIfAborted();
    // Extract potential identifiers from query (alphanumeric, underscore)
    const identifiers = query
      .split(/[^\w]+/)
      .filter(term => term.length > 0)
      .map(term => `%${term}%`);

    if (identifiers.length === 0) return [];

    const identifierPredicates = identifiers.map((identifier) => sql`COALESCE(metadata->>'tree_node_id', output_meta->>'tree_node_id') ILIKE ${identifier}`);

    // Search for packets with tree_node_ids that match query identifiers
    // tree_node_ids is a TEXT[] array in Postgres
    const db = await getDb();
    signal?.throwIfAborted();
    const result = await executeReadOnlyQuery(db, sql`
      SELECT
        id,
        source_ref,
        metadata,
        output_meta,
        summary,
        content,
        0.8 as score
      FROM codebase_chunk_index
      WHERE COALESCE(metadata->>'tree_node_id', output_meta->>'tree_node_id') IS NOT NULL
        AND (${sql.join(identifierPredicates, sql` OR `)})
      ORDER BY COALESCE(metadata->>'tree_node_id', output_meta->>'tree_node_id') ASC, id ASC
      LIMIT ${AST_LIMIT}
    `, signal);

    type ASTRow = {
      id: string;
      source_ref: string;
      metadata: Record<string, unknown> | null;
      output_meta: Record<string, unknown> | null;
      summary: string;
      content: string;
      score: number;
    };

    signal?.throwIfAborted();
    return (result.rows as ASTRow[]).map(row => ({
      id: row.id,
      sourceRef: row.source_ref,
      summary: row.summary || '',
      content: row.content || '',
      score: row.score,
      scoreSource: 'ast_tree' as const,
      workspaceRevision: pickString(row.metadata?.workspace_revision, row.output_meta?.workspace_revision, row.metadata?.workspaceRevision, row.output_meta?.workspaceRevision),
      sourceRevision: pickNullableString(row.metadata?.source_revision, row.output_meta?.source_revision, row.metadata?.sourceRevision, row.output_meta?.sourceRevision),
      representationId: pickNullableString(row.metadata?.representation_id, row.output_meta?.representation_id, row.metadata?.representationId, row.output_meta?.representationId),
      representationRevision: pickNumber(row.metadata?.representation_revision, row.output_meta?.representation_revision, row.metadata?.representationRevision, row.output_meta?.representationRevision),
      ...deriveIdentity({
        symbolVersionId: row.metadata?.symbol_version_id ?? row.output_meta?.symbol_version_id,
        packetKey: row.metadata?.packet_key ?? row.output_meta?.packet_key,
        contentHash: row.metadata?.content_hash ?? row.output_meta?.content_hash ?? row.metadata?.contentHash ?? row.output_meta?.contentHash,
        sourceRef: row.source_ref,
        fallbackId: row.id,
      }),
    }));
  } catch (error) {
    if (signal?.aborted) throw error;
    console.warn('AST match retrieval failed:', error);
    throw error;
  }
}

const RG_STOP_WORDS = new Set(['the', 'and', 'for', 'with', 'this', 'that', 'from', 'have', 'not', 'are', 'was', 'were']);

/**
 * Ripgrep keyword lane — file-system lexical search
 * Extracts identifier-like keywords from the query, runs rg against src/ to find
 * matching files, then looks up chunks by source_ref in Postgres.
 * A ripgrep no-match exit is a valid empty result; missing binaries, timeouts,
 * malformed output, and database errors remain failures in the lane receipt.
 */
export async function retrieveRipgrep(query: string, signal?: AbortSignal): Promise<Candidate[]> {
  try {
    signal?.throwIfAborted();
    // Extract identifier-like keywords from query
    const keywords = [...new Set(
      (query.match(/\b[a-zA-Z_][a-zA-Z0-9_]{2,}\b/g) ?? [])
        .flatMap((kw) => identifierVariants(kw))
        .flatMap((kw) => tokenizeKeywordSurface(kw))
        .filter((kw) => kw.length > 2)
        .filter((kw) => !RG_STOP_WORDS.has(kw.toLowerCase()))
    )].slice(0, Math.min(8, RETRIEVAL_LIMITS.maxExactKeywords));

    if (keywords.length === 0) return [];

    // Run rg for each keyword in parallel, collect matched file paths
    const rgResults = await Promise.all(
      keywords.map(kw =>
        new Promise<string[]>((resolve, reject) => {
          // cwd: SvelteKit dev server runs from sveltekit-frontend/, so process.cwd() is correct
          const child = execFile(
            'rg',
            ['--json', '-l', '-i', kw, 'src/'],
            { cwd: pathResolve(process.cwd()), timeout: 5000, ...(signal ? { signal } : {}) },
            (err, stdout) => {
              if (err) {
                if (err.code === 1) resolve([]); // ripgrep's documented no-match exit code
                else reject(err);
                return;
              }
              // rg --json -l emits one JSON object per line; "match" type lines contain path.text
              const paths: string[] = [];
              for (const line of stdout.split('\n')) {
                if (!line.trim()) continue;
                try {
                  const obj = JSON.parse(line);
                  if (obj.type === 'match' || obj.type === 'path') {
                    const p = obj.data?.path?.text ?? obj.data?.lines?.text;
                    if (p) paths.push(p as string);
                  }
                } catch (error) {
                  reject(new Error(`RIPGREP_JSON_INVALID:${error instanceof Error ? error.message : String(error)}`));
                  return;
                }
              }
              resolve(paths);
            }
          );
          // Belt-and-suspenders timeout via AbortController is not available on execFile;
          // the `timeout` option above handles it.
          void child;
        })
      )
    );

    // Collect unique file stems across all keyword results
    const stems = new Set<string>();
    for (const paths of rgResults) {
      for (const filePath of paths) {
        const stem = basename(filePath, extname(filePath));
        if (stem) stems.add(stem);
      }
    }

    if (stems.size === 0) return [];

    // Query codebase_chunk_index for chunks whose source_ref contains any of the file stems
    const candidates: Candidate[] = [];
    for (const stem of stems) {
      if (candidates.length >= RG_LIMIT) break;

      const stemPattern = `%${stem}%`;
      const remaining = RG_LIMIT - candidates.length;

      try {
        const db = await getDb();
        const result = await executeReadOnlyQuery(db, sql`
          SELECT
            id,
            source_ref,
            metadata,
            summary,
            content
          FROM codebase_chunk_index
          WHERE source_ref ILIKE ${stemPattern}
          ORDER BY id ASC
          LIMIT ${remaining}
        `, signal);

        type RgRow = {
          id: string;
          source_ref: string;
          metadata: Record<string, unknown> | null;
          summary: string;
          content: string;
        };

        for (const row of result.rows as RgRow[]) {
        candidates.push({
          id: row.id,
          sourceRef: row.source_ref || '',
          summary: row.summary || '',
          content: row.content || '',
            score: 0.7,
            scoreSource: 'rg_keyword' as const,
            workspaceRevision: pickString(row.metadata?.workspace_revision, row.metadata?.workspaceRevision),
            sourceRevision: pickNullableString(row.metadata?.source_revision, row.metadata?.sourceRevision),
            representationId: pickNullableString(row.metadata?.representation_id, row.metadata?.representationId),
            representationRevision: pickNumber(row.metadata?.representation_revision, row.metadata?.representationRevision),
            ...deriveIdentity({
              symbolVersionId: row.metadata?.symbol_version_id,
              packetKey: row.metadata?.packet_key,
              contentHash: row.metadata?.content_hash ?? row.metadata?.contentHash,
              sourceRef: row.source_ref,
              fallbackId: row.id,
            }),
          });
        }
      } catch (error) {
        if (signal?.aborted) throw error;
        throw error;
      }
    }

    return candidates;
  } catch (error) {
    if (signal?.aborted) throw error;
    throw error;
  }
}
