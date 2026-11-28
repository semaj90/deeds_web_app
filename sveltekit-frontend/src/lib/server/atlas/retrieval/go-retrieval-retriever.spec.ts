import { describe, expect, it, vi } from 'vitest';
import { createGoRetrievalRetriever, type GoRetrievalRequestContext } from './go-retrieval-retriever.js';

const context: GoRetrievalRequestContext = {
  requestId: 'request-1',
  taskId: 'task-1',
  runId: 'run-1',
  workspaceId: 'workspace-1',
  workspaceRevision: 'sha256:workspace-revision',
  sourceRevision: 'sha256:source-revision',
  representationId: 'semantic_768',
  representationRevision: 2,
  embeddingModelId: 'embeddinggemma2-fixture',
  embeddingModelRevision: `sha256:${'a'.repeat(64)}`,
};

function response(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('Go Retrieval retriever request and outcome contract', () => {
  it('reports disabled without calling the service', async () => {
    const fetchImpl = vi.fn();
    const adapter = createGoRetrievalRetriever({ enabled: false, fetchImpl });
    const result = await adapter.retrieve({ query: 'needle', limit: 5, context });
    expect(result.status).toBe('DISABLED');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('blocks incomplete identity before the HTTP call', async () => {
    const fetchImpl = vi.fn();
    const adapter = createGoRetrievalRetriever({ enabled: true, httpUrl: 'http://127.0.0.1:8100', fetchImpl });
    const result = await adapter.retrieve({ query: 'needle', limit: 5 });
    expect(result.status).toBe('AUTHORIZATION_BLOCKED');
    expect(result.errorCode).toBe('GO_RETRIEVAL_REVISION_CONTEXT_INCOMPLETE');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('uses the configured HTTP endpoint and forwards trusted task and revision context', async () => {
    const fetchImpl = vi.fn(async () => response({
      chunks: [],
      representation_used: context.representationId,
      representation_revision: context.representationRevision,
      embedding_model_id: context.embeddingModelId,
      embedding_model_revision: context.embeddingModelRevision,
      request_id: context.requestId,
      task_id: context.taskId,
    }));
    const adapter = createGoRetrievalRetriever({ enabled: true, httpUrl: 'http://retrieval.test:8100/', fetchImpl });
    const result = await adapter.retrieve({ query: 'needle', limit: 5, context });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('http://retrieval.test:8100/search/codebase');
    const request = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
    expect(request.task_id).toBe(context.taskId);
    expect(request.request_id).toBe(context.requestId);
    expect(request.representation_id).toBe(context.representationId);
    expect(request.embedding_model_id).toBe(context.embeddingModelId);
    expect(request.embedding_model_revision).toBe(context.embeddingModelRevision);
    expect(request.atlas_context.workspace_revision).toBe(context.workspaceRevision);
    expect(request.atlas_context.source_revision).toBe(context.sourceRevision);
    expect(result.status).toBe('ZERO_HITS');
  });

  it('returns hits only when each candidate matches the request identity', async () => {
    const fetchImpl = vi.fn(async () => response({
      chunks: [{
        packet_key: 'packet-1', source_ref: 'src/a.ts', content_hash: 'sha256:content', score: 0.8,
        workspace_revision: context.workspaceRevision, source_revision: context.sourceRevision,
        representation_id: context.representationId, representation_revision: context.representationRevision,
        chunk_id: 'candidate-1',
      }],
      representation_used: context.representationId,
      representation_revision: context.representationRevision,
      embedding_model_id: context.embeddingModelId,
      embedding_model_revision: context.embeddingModelRevision,
      request_id: context.requestId,
      task_id: context.taskId,
    }));
    const adapter = createGoRetrievalRetriever({ enabled: true, httpUrl: 'http://retrieval.test:8100', fetchImpl });
    const result = await adapter.retrieve({ query: 'needle', limit: 5, context });
    expect(result.status).toBe('SUCCESS');
    expect(result.hits[0]).toMatchObject({ packetKey: 'packet-1', sourceRef: 'src/a.ts', representationId: 'semantic_768' });
  });

  it('distinguishes backend failure and representation fallback from a real zero-hit search', async () => {
    const failed = createGoRetrievalRetriever({
      enabled: true,
      httpUrl: 'http://retrieval.test:8100',
      fetchImpl: vi.fn(async () => response({ error_code: 'ATLAS_RETRIEVAL_ADAPTER_UNAVAILABLE' }, 503)),
    });
    expect((await failed.retrieve({ query: 'needle', limit: 5, context })).status).toBe('BACKEND_UNAVAILABLE');

    const mismatch = createGoRetrievalRetriever({
      enabled: true,
      httpUrl: 'http://retrieval.test:8100',
      fetchImpl: vi.fn(async () => response({
        chunks: [], representation_used: 'legacy_384', representation_revision: context.representationRevision,
        embedding_model_id: context.embeddingModelId, embedding_model_revision: context.embeddingModelRevision,
        request_id: context.requestId, task_id: context.taskId,
      })),
    });
    expect((await mismatch.retrieve({ query: 'needle', limit: 5, context })).status).toBe('REPRESENTATION_MISMATCH');
  });
});
