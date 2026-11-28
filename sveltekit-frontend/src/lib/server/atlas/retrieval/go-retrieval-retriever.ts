/**
 * Bounded read-only adapter for the Go Retrieval codebase endpoint.
 * SearchRuntime remains the sole cross-lane fusion owner.
 */
import { randomUUID } from 'node:crypto';
import { ENV } from '$lib/server/env.server.js';

export type GoRetrievalExecutionStatus =
  | 'SUCCESS'
  | 'ZERO_HITS'
  | 'DISABLED'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'BACKEND_UNAVAILABLE'
  | 'AUTHORIZATION_BLOCKED'
  | 'REPRESENTATION_MISMATCH';

export interface GoRetrievalRetrieverOptions {
  enabled?: boolean;
  httpUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface GoRetrievalRequestContext {
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
}

export interface GoRetrievalHit {
  packetKey: string;
  sourceRef: string;
  contentHash: string;
  score: number;
  workspaceRevision: string;
  sourceRevision: string;
  representationId: string;
  representationRevision: number;
  lane: 'go-retrieval';
  metadata?: Record<string, unknown>;
}

export interface GoRetrievalOutcome {
  status: GoRetrievalExecutionStatus;
  requestId: string;
  hits: GoRetrievalHit[];
  elapsedMs: number;
  errorCode?: string;
  representationUsed?: string;
}

export function createGoRetrievalRetriever(opts?: GoRetrievalRetrieverOptions) {
  const enabled = opts?.enabled ?? (process.env.GO_RETRIEVAL_ENABLED === 'true' || process.env.GO_RETRIEVAL_ENABLED === '1');
  const baseUrl = (opts?.httpUrl ?? ENV.GO_RETRIEVAL_HTTP_URL ?? '').replace(/\/+$/, '');
  const timeoutMs = opts?.timeoutMs ?? 8_000;
  const fetchImpl = opts?.fetchImpl ?? fetch;

  return {
    lane: 'go-retrieval' as const,

    async retrieve(input: {
      query: string;
      limit: number;
      context?: Partial<GoRetrievalRequestContext>;
      signal?: AbortSignal;
    }): Promise<GoRetrievalOutcome> {
      const requestId = input.context?.requestId?.trim() || randomUUID();
      const startedAt = Date.now();
      const empty = (status: GoRetrievalExecutionStatus, errorCode?: string, representationUsed?: string): GoRetrievalOutcome => ({
        status,
        requestId,
        hits: [],
        elapsedMs: Date.now() - startedAt,
        ...(errorCode ? { errorCode } : {}),
        ...(representationUsed ? { representationUsed } : {}),
      });

      if (!enabled) return empty('DISABLED', 'GO_RETRIEVAL_DISABLED');
      if (!baseUrl) return empty('BACKEND_UNAVAILABLE', 'GO_RETRIEVAL_HTTP_URL_MISSING');
      if (input.signal?.aborted) return empty('CANCELLED', 'REQUEST_CANCELLED');

      const context = input.context;
      if (!context || ![
        context.requestId, context.taskId, context.runId, context.workspaceId,
        context.workspaceRevision, context.sourceRevision, context.representationId,
        context.embeddingModelId, context.embeddingModelRevision,
      ].every((value) => typeof value === 'string' && value.trim().length > 0) ||
        !Number.isSafeInteger(context.representationRevision) || context.representationRevision! < 1) {
        return empty('AUTHORIZATION_BLOCKED', 'GO_RETRIEVAL_REVISION_CONTEXT_INCOMPLETE');
      }

      const timeoutSignal = AbortSignal.timeout(timeoutMs);
      const signal = input.signal ? AbortSignal.any([input.signal, timeoutSignal]) : timeoutSignal;
      try {
        const response = await fetchImpl(`${baseUrl}/search/codebase`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          signal,
          body: JSON.stringify({
            query: input.query,
            limit: Math.max(1, Math.min(100, Math.floor(input.limit))),
            representation_id: context.representationId,
            representation_revision: context.representationRevision,
            embedding_model_id: context.embeddingModelId,
            embedding_model_revision: context.embeddingModelRevision,
            task_id: context.taskId,
            request_id: context.requestId,
            atlas_context: {
              tool_call_id: context.requestId,
              run_id: context.runId,
              workspace_id: context.workspaceId,
              workspace_revision: context.workspaceRevision,
              source_revision: context.sourceRevision,
              // Search does not yet know a seed packet identity. Never invent one.
              packet_key: '',
              packet_revision: '',
            },
          }),
        });

        const data = await response.json().catch(() => ({})) as Record<string, any>;
        const backendCode = typeof data.error_code === 'string' ? data.error_code : undefined;
        if (backendCode === 'EG2_QUERY_MODEL_REVISION_MISMATCH') {
          return empty('REPRESENTATION_MISMATCH', backendCode, typeof data.representation_used === 'string' ? data.representation_used : undefined);
        }
        if (response.status === 401 || response.status === 403) return empty('AUTHORIZATION_BLOCKED', backendCode ?? `HTTP_${response.status}`);
        if (!response.ok || backendCode) return empty('BACKEND_UNAVAILABLE', backendCode ?? `HTTP_${response.status}`);

        const representationUsed = typeof data.representation_used === 'string' ? data.representation_used : '';
        const responseRequestId = typeof data.request_id === 'string' ? data.request_id : '';
        const responseTaskId = typeof data.task_id === 'string' ? data.task_id : '';
        if (representationUsed !== context.representationId ||
          responseRequestId !== context.requestId || responseTaskId !== context.taskId ||
          data.embedding_model_id !== context.embeddingModelId ||
          data.embedding_model_revision !== context.embeddingModelRevision ||
          (typeof data.representation_revision === 'number' && data.representation_revision !== context.representationRevision) ||
          (typeof data.representation_fallback_reason === 'string' && data.representation_fallback_reason.length > 0)) {
          return empty('REPRESENTATION_MISMATCH', 'GO_RETRIEVAL_RESPONSE_BINDING_MISMATCH', representationUsed || undefined);
        }

        const chunks = Array.isArray(data.chunks) ? data.chunks : [];
        const hits: GoRetrievalHit[] = [];
        for (const raw of chunks) {
          if (!raw || typeof raw !== 'object') continue;
          const row = raw as Record<string, any>;
          const packetKey = typeof row.packet_key === 'string' ? row.packet_key.trim() : '';
          const sourceRef = typeof row.source_ref === 'string' ? row.source_ref.trim() : '';
          const contentHash = typeof row.content_hash === 'string' ? row.content_hash.trim() : '';
          const workspaceRevision = typeof row.workspace_revision === 'string' ? row.workspace_revision : '';
          const sourceRevision = typeof row.source_revision === 'string' ? row.source_revision : '';
          const representationId = typeof row.representation_id === 'string' ? row.representation_id : '';
          const representationRevision = Number(row.representation_revision);
          if (!packetKey || !sourceRef || !contentHash || !workspaceRevision || !sourceRevision ||
            workspaceRevision !== context.workspaceRevision || sourceRevision !== context.sourceRevision ||
            representationId !== context.representationId || representationRevision !== context.representationRevision) {
            return empty('REPRESENTATION_MISMATCH', 'GO_RETRIEVAL_CANDIDATE_IDENTITY_MISMATCH', representationUsed);
          }
          hits.push({
            packetKey,
            sourceRef,
            contentHash,
            score: typeof row.score === 'number' && Number.isFinite(row.score) ? row.score : 0,
            workspaceRevision,
            sourceRevision,
            representationId,
            representationRevision,
            lane: 'go-retrieval',
            metadata: { candidateId: typeof row.chunk_id === 'string' ? row.chunk_id : undefined },
          });
        }
        return {
          status: hits.length > 0 ? 'SUCCESS' : 'ZERO_HITS',
          requestId,
          hits,
          elapsedMs: Date.now() - startedAt,
          representationUsed,
        };
      } catch (error) {
        if (input.signal?.aborted) return empty('CANCELLED', 'REQUEST_CANCELLED');
        if (signal.aborted) return empty('TIMEOUT', 'GO_RETRIEVAL_DEADLINE_EXCEEDED');
        return empty('BACKEND_UNAVAILABLE', error instanceof Error ? error.name : 'GO_RETRIEVAL_BACKEND_ERROR');
      }
    },
  };
}
