import type { RequestEvent, RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';

// Simple in-memory store for development/testing.
// Replace with Redis / PostgreSQL / productionServiceClient as needed.
const mockProgressStore = new Map<string, { status: string; percent: number; updatedAt: string }>();

// Seed example (optional)
mockProgressStore.set('example-job-1', {
  percent: 42,
  status: 'in_progress',
  updatedAt: new Date().toISOString(),
});

type ProgressResponse = {
  jobId: string;
  status: string;
  percent: number;
  updatedAt: string;
};

// Replace function declarations with RequestHandler-typed exports to avoid parsing/compile issues
export const GET: RequestHandler = async ({ url }: RequestEvent) => {
  // Expect jobId as query param: /api/security/validate/progress?jobId=...
  const jobId = url.searchParams.get('jobId');
  if (!jobId) {
    return json({ error: 'jobId query parameter is required' }, { status: 400 });
  }

  const record = mockProgressStore.get(jobId);
  if (!record) {
    // In production, query Redis / DB / service instead of this in-memory map.
    return json({ error: 'job not found' }, { status: 404 });
  }

  const response: ProgressResponse = {
    jobId,
    status: record.status,
    percent: record.percent,
    updatedAt: record.updatedAt,
  };

  return json(response);
};

export const POST: RequestHandler = async ({ request }: RequestEvent) => {
  // Accept a JSON body { jobId: string, percent?: number, status?: string }
  let payload: any;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const { jobId, percent, status } = payload ?? {};
  if (!jobId || (percent === undefined && status === undefined)) {
    return json(
      { error: 'jobId and at least one of { percent, status } are required' },
      { status: 400 }
    );
  }

  // Determine whether the job existed before updating (so we can return 200 vs 201)
  const existed = mockProgressStore.has(jobId);
  const existing = mockProgressStore.get(jobId) ?? {
    percent: 0,
    status: 'pending',
    updatedAt: new Date().toISOString(),
  };
  const updated = {
    percent: typeof percent === 'number' ? Math.max(0, Math.min(100, percent)) : existing.percent,
    status: typeof status === 'string' ? status : existing.status,
    updatedAt: new Date().toISOString(),
  };

  mockProgressStore.set(jobId, updated);

  // In production, persist to Redis/DB and emit events to XState/RabbitMQ if needed.
  return json({ jobId, ...updated }, { status: existed ? 200 : 201 });
};
