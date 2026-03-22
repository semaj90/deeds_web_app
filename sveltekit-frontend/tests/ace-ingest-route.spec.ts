import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockChunkLegalDocument = vi.fn();
const mockGenerateEmbeddings = vi.fn();
const mockQdrantUpsert = vi.fn();
const mockHybridSearch = vi.fn();
const mockDeterministicPointId = vi.fn((value: string) => `point-${value}`);
const mockCreateAceIngestJob = vi.fn();
const mockUpdateAceIngestJob = vi.fn();
const mockExtractTextHybrid = vi.fn();
const mockCreateYOLOService = vi.fn();

vi.mock('$lib/server/indexer/legal-chunker.js', () => ({
  chunkLegalDocument: mockChunkLegalDocument,
}));

vi.mock('$lib/server/grpc/embedding-client.js', () => ({
  generateEmbeddings: mockGenerateEmbeddings,
}));

vi.mock('$lib/server/vector/qdrant-manager.js', () => ({
  qdrant: {
    client: {
      upsert: mockQdrantUpsert,
    },
    collections: {
      documents: 'legal_documents',
    },
    hybridSearch: mockHybridSearch,
  },
  deterministicPointId: mockDeterministicPointId,
}));

vi.mock('$lib/server/db/client', () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(async () => [{ id: 'graph-1' }]),
        onConflictDoNothing: vi.fn(async () => undefined),
      })),
    })),
    execute: vi.fn(async () => ({ rows: [] })),
  },
}));

vi.mock('$lib/server/db/schema-postgres.js', () => ({
  yorhaEvidenceNodes: { id: 'id' },
  yorhaEvidenceConnections: {},
}));

vi.mock('$lib/server/ocr/hybrid.js', () => ({
  extractTextHybrid: mockExtractTextHybrid,
}));

vi.mock('$lib/server/yolo.js', () => ({
  createYOLOService: mockCreateYOLOService,
}));

vi.mock('$lib/server/ace-ingest-progress.js', () => ({
  createAceIngestJob: mockCreateAceIngestJob,
  updateAceIngestJob: mockUpdateAceIngestJob,
}));

const longPlainText =
  'Probable cause analysis for ACE ingest route coverage. This text is comfortably longer than thirty characters.';

function makeChunk(text = longPlainText) {
  return {
    text,
    tokenCount: 24,
    sectionPath: ['Section 1'],
    heading: 'Overview',
    citations: ['Cal. Penal Code 836'],
  };
}

function makeUploadFile(name: string, text = longPlainText, type = 'text/plain') {
  const file = new File([text], name, { type });
  Object.defineProperty(file, 'arrayBuffer', {
    value: async () => new TextEncoder().encode(text).buffer,
  });
  return file;
}

async function readSseEvents(response: Response) {
  const text = await response.text();

  return text
    .split('\n\n')
    .filter((chunk) => chunk.startsWith('data: '))
    .map((chunk) => JSON.parse(chunk.slice(6)));
}

describe('/api/ace/ingest route', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockChunkLegalDocument.mockReturnValue([makeChunk()]);
    mockGenerateEmbeddings.mockResolvedValue({
      vectors: [[0.1, 0.2, 0.3]],
      model: 'embeddinggemma:latest',
    });
    mockQdrantUpsert.mockResolvedValue(undefined);
    mockHybridSearch.mockResolvedValue({ results: [] });
    mockExtractTextHybrid.mockResolvedValue({
      text: longPlainText,
      method: 'tesseract',
    });
    mockCreateYOLOService.mockReturnValue({
      isModelAvailable: vi.fn(async () => false),
      analyzeDocument: vi.fn(async () => ({ objects: [], layout: { regions: [] } })),
    });
    mockCreateAceIngestJob.mockReturnValue(undefined);
    mockUpdateAceIngestJob.mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns 401 when the caller is unauthenticated', async () => {
    const { POST } = await import('../src/routes/api/ace/ingest/+server.js');

    const request = new Request('http://localhost/api/ace/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/legal-brief' }),
    });

    const response = await POST({
      request,
      url: new URL('http://localhost/api/ace/ingest'),
      locals: {},
    } as never);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expect(mockCreateAceIngestJob).not.toHaveBeenCalled();
  });

  it('returns 400 when the JSON body is invalid', async () => {
    const { POST } = await import('../src/routes/api/ace/ingest/+server.js');

    const request = new Request('http://localhost/api/ace/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Missing URL' }),
    });

    const response = await POST({
      request,
      url: new URL('http://localhost/api/ace/ingest'),
      locals: {
        user: { id: 'user-1' },
      },
    } as never);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid input: expected string, received undefined' });
    expect(mockCreateAceIngestJob).not.toHaveBeenCalled();
  });

  it('ingests a URL synchronously and returns completed status metadata', async () => {
    const { POST } = await import('../src/routes/api/ace/ingest/+server.js');

    const fetchMock = vi.fn(async () =>
      new Response(
        '<html><head><title>Search Warrant Notes</title></head><body><p>' +
          longPlainText +
          '</p></body></html>',
        {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const request = new Request('http://localhost/api/ace/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'https://example.com/legal-brief',
        title: 'Search Warrant Notes',
      }),
    });

    const response = await POST({
      request,
      url: new URL('http://localhost/api/ace/ingest'),
      locals: {
        user: { id: 'user-1' },
      },
    } as never);

    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(
      expect.objectContaining({
        success: true,
        sourceType: 'url',
        url: 'https://example.com/legal-brief',
        title: 'Search Warrant Notes',
        domain: 'example.com',
        chunksCreated: 1,
        embeddingModel: 'embeddinggemma:latest',
        graphNodeId: null,
        indexingStatus: 'completed',
        statusStep: 'complete',
        statusProgress: 100,
        statusMessage: 'Ingest completed.',
      })
    );
    expect(body.jobId).toEqual(expect.any(String));
    expect(mockCreateAceIngestJob).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        sourceType: 'url',
        title: 'Search Warrant Notes',
      })
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.com/legal-brief',
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: 'text/html, application/xhtml+xml, text/plain',
          'User-Agent': 'ACE-Ingest/1.0 (Legal AI Research)',
        }),
      })
    );
    expect(mockUpdateAceIngestJob).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({
        step: 'complete',
        progress: 100,
        message: 'Ingest completed.',
      })
    );
  });

  it('returns a queued preview response for multipart text uploads', async () => {
    const { POST } = await import('../src/routes/api/ace/ingest/+server.js');

    mockGenerateEmbeddings.mockImplementation(() => new Promise(() => {}));

    const formData = new FormData();
    formData.set('file', makeUploadFile('notes.txt'));
    formData.set('caseId', 'case-1');
    formData.set('title', 'Attached Notes');

    const request = {
      headers: {
        get: (name: string) =>
          name.toLowerCase() === 'content-type' ? 'multipart/form-data; boundary=test' : null,
      },
      formData: async () => formData,
    } as Request;

    const response = await POST({
      request,
      url: new URL('http://localhost/api/ace/ingest'),
      locals: {
        user: { id: 'user-1' },
      },
    } as never);

    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(
      expect.objectContaining({
        success: true,
        sourceType: 'file',
        filename: 'notes.txt',
        title: 'Attached Notes',
        caseId: 'case-1',
        indexingStatus: 'queued',
        statusStep: 'queued',
        statusProgress: 40,
        statusMessage: 'Preview ready, background indexing queued.',
        extractionMethod: 'utf8',
      })
    );
    expect(body.jobId).toEqual(expect.any(String));
    expect(mockCreateAceIngestJob).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        sourceType: 'file',
        caseId: 'case-1',
        title: 'Attached Notes',
        filename: 'notes.txt',
      })
    );
    expect(mockUpdateAceIngestJob).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        step: 'queued',
        progress: 40,
        message: 'Preview ready, background indexing queued.',
      })
    );
  });

  it('marks file indexing as deferred when the embedding step times out in background work', async () => {
    const { POST } = await import('../src/routes/api/ace/ingest/+server.js');

    const timeoutError = new Error('ACE background embedding exceeded 20000ms');
    timeoutError.name = 'TimeoutError';
    mockGenerateEmbeddings.mockRejectedValue(timeoutError);

    const formData = new FormData();
    formData.set('file', makeUploadFile('timeout.txt'));

    const request = {
      headers: {
        get: (name: string) =>
          name.toLowerCase() === 'content-type' ? 'multipart/form-data; boundary=test' : null,
      },
      formData: async () => formData,
    } as Request;

    const response = await POST({
      request,
      url: new URL('http://localhost/api/ace/ingest'),
      locals: {
        user: { id: 'user-1' },
      },
    } as never);

    expect(response.status).toBe(200);

    await vi.waitFor(() => {
      expect(mockUpdateAceIngestJob).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          step: 'deferred',
          progress: 100,
          message: 'Background retrieval indexing deferred because the embedding service timed out.',
          result: expect.objectContaining({
            indexingStatus: 'deferred',
            statusStep: 'deferred',
            statusProgress: 100,
          }),
        })
      );
    });
  });

  it('returns 500 and tracks the job as failed when URL fetch fails', async () => {
    const { POST } = await import('../src/routes/api/ace/ingest/+server.js');

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response('bad gateway', {
          status: 502,
          headers: { 'content-type': 'text/plain' },
        })
      )
    );

    const request = new Request('http://localhost/api/ace/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/failure' }),
    });

    const response = await POST({
      request,
      url: new URL('http://localhost/api/ace/ingest'),
      locals: {
        user: { id: 'user-1' },
      },
    } as never);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Ingestion failed', jobId: expect.any(String) });
    expect(mockUpdateAceIngestJob).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({
        step: 'error',
        progress: 100,
        message: 'Ingestion failed.',
        error: 'Fetch failed: HTTP 502',
      })
    );
  });

  it('streams progress events and a final complete event when stream mode is enabled', async () => {
    const { POST } = await import('../src/routes/api/ace/ingest/+server.js');

    const fetchMock = vi.fn(async () =>
      new Response(
        '<html><head><title>Streamed Brief</title></head><body><p>' +
          longPlainText +
          '</p></body></html>',
        {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const request = new Request('http://localhost/api/ace/ingest?stream=true', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'https://example.com/stream-brief',
        title: 'Streamed Brief',
      }),
    });

    const response = await POST({
      request,
      url: new URL('http://localhost/api/ace/ingest?stream=true'),
      locals: {
        user: { id: 'user-1' },
      },
    } as never);

    const events = await readSseEvents(response);
    const finalEvent = events.at(-1);

    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stage: 'fetching' }),
        expect.objectContaining({ stage: 'complete', progress: 1 }),
      ])
    );
    expect(finalEvent).toEqual(
      expect.objectContaining({
        stage: 'complete',
        progress: 1,
        result: expect.objectContaining({
          success: true,
          sourceType: 'url',
          title: 'Streamed Brief',
          indexingStatus: 'completed',
        }),
      })
    );
    expect(mockUpdateAceIngestJob).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({
        step: 'complete',
        progress: 100,
        message: 'Ingest completed.',
      })
    );
  });

  it('streams an error event when stream mode fails during ingest', async () => {
    const { POST } = await import('../src/routes/api/ace/ingest/+server.js');

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response('bad gateway', {
          status: 502,
          headers: { 'content-type': 'text/plain' },
        })
      )
    );

    const request = new Request('http://localhost/api/ace/ingest?stream=true', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/stream-failure' }),
    });

    const response = await POST({
      request,
      url: new URL('http://localhost/api/ace/ingest?stream=true'),
      locals: {
        user: { id: 'user-1' },
      },
    } as never);

    const events = await readSseEvents(response);

    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(events.at(-1)).toEqual({
      stage: 'error',
      progress: 0,
      error: 'Fetch failed: HTTP 502',
    });
    expect(mockUpdateAceIngestJob).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({
        step: 'error',
        progress: 100,
        message: 'Ingestion failed.',
        error: 'Fetch failed: HTTP 502',
      })
    );
  });
});