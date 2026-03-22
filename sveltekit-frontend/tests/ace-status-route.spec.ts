import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetAceIngestJob = vi.fn();

vi.mock('$lib/server/ace-ingest-progress.js', () => ({
  getAceIngestJob: mockGetAceIngestJob,
}));

describe('/api/ace/status route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when the caller is unauthenticated', async () => {
    const { GET } = await import('../src/routes/api/ace/status/+server.js');

    const response = await GET({
      url: new URL('http://localhost/api/ace/status?jobId=job-1'),
      locals: {},
    } as never);

    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: 'Unauthorized' });
    expect(mockGetAceIngestJob).not.toHaveBeenCalled();
  });

  it('returns 400 when jobId is missing', async () => {
    const { GET } = await import('../src/routes/api/ace/status/+server.js');

    const response = await GET({
      url: new URL('http://localhost/api/ace/status'),
      locals: {
        user: { id: 'user-1' },
      },
    } as never);

    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: 'Missing jobId parameter' });
    expect(mockGetAceIngestJob).not.toHaveBeenCalled();
  });

  it('returns 404 when the job does not exist', async () => {
    const { GET } = await import('../src/routes/api/ace/status/+server.js');

    mockGetAceIngestJob.mockReturnValue(undefined);

    const response = await GET({
      url: new URL('http://localhost/api/ace/status?jobId=missing-job'),
      locals: {
        user: { id: 'user-1' },
      },
    } as never);

    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({ error: 'Job not found' });
    expect(mockGetAceIngestJob).toHaveBeenCalledWith('missing-job');
  });

  it('returns 404 when the job belongs to another user', async () => {
    const { GET } = await import('../src/routes/api/ace/status/+server.js');

    mockGetAceIngestJob.mockReturnValue({
      jobId: 'job-1',
      userId: 'user-2',
      sourceType: 'url',
      caseId: null,
      title: 'Remote brief',
      filename: null,
      step: 'queued',
      progress: 5,
      message: 'Queued for ingestion',
      createdAt: 1,
      updatedAt: 2,
    });

    const response = await GET({
      url: new URL('http://localhost/api/ace/status?jobId=job-1'),
      locals: {
        user: { id: 'user-1' },
      },
    } as never);

    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body).toEqual({ error: 'Job not found' });
    expect(mockGetAceIngestJob).toHaveBeenCalledWith('job-1');
  });

  it.each([
    ['queued', 'queued'],
    ['starting', 'running'],
    ['fetching', 'running'],
    ['extracting', 'running'],
    ['chunking', 'running'],
    ['embedding', 'running'],
    ['storing', 'running'],
    ['graph', 'running'],
    ['neo4j_sync', 'running'],
    ['deferred', 'deferred'],
    ['complete', 'completed'],
    ['error', 'error'],
  ])('maps step %s to status %s for the owning user', async (step, expectedStatus) => {
    const { GET } = await import('../src/routes/api/ace/status/+server.js');

    mockGetAceIngestJob.mockReturnValue({
      jobId: 'job-1',
      userId: 'user-1',
      sourceType: 'file',
      caseId: 'case-1',
      title: 'Case upload',
      filename: 'case.pdf',
      step,
      progress: step === 'complete' ? 100 : 42,
      message: `Step is ${step}`,
      error: step === 'error' ? 'Embedding failed' : undefined,
      result: step === 'complete' ? { evidenceId: 'evidence-1' } : undefined,
      createdAt: 100,
      updatedAt: 200,
    });

    const response = await GET({
      url: new URL('http://localhost/api/ace/status?jobId=job-1'),
      locals: {
        user: { id: 'user-1' },
      },
    } as never);

    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      jobId: 'job-1',
      sourceType: 'file',
      caseId: 'case-1',
      title: 'Case upload',
      filename: 'case.pdf',
      step,
      progress: step === 'complete' ? 100 : 42,
      message: `Step is ${step}`,
      error: step === 'error' ? 'Embedding failed' : null,
      status: expectedStatus,
      result: step === 'complete' ? { evidenceId: 'evidence-1' } : null,
      createdAt: 100,
      updatedAt: 200,
    });
  });
});