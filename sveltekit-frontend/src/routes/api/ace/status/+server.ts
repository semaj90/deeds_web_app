import { json } from '@sveltejs/kit';
import type { RequestHandler } from './';
import { z } from 'zod';
import { getAceIngestJob } from '$lib/server/ace-ingest-progress.js';
import { cacheControl, checkETag, notModified } from '$lib/server/middleware/cache-headers.js';

const querySchema = z.object({
	jobId: z.string().min(1, 'Missing jobId parameter').max(200)
});

const emptyStatus = {
  jobId: null,
  sourceType: null,
  caseId: null,
  title: null,
  filename: null,
  step: 'queued',
  progress: 0,
  message: '',
  error: null,
  status: 'queued',
  result: null,
  createdAt: null,
  updatedAt: null,
};

export const GET: RequestHandler = async ({ url, locals, request }) => {
  if (!locals.user?.id) {
    return json({ ...emptyStatus, error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return json(
      { ...emptyStatus, error: parsed.error.issues[0]?.message ?? 'Missing jobId parameter' },
      { status: 400 }
    );
  }
  const { jobId } = parsed.data;

  const job = getAceIngestJob(jobId);
  if (!job || job.userId !== locals.user.id) {
    return json(
      { ...emptyStatus, jobId, error: 'Job not found', status: 'error' },
      { status: 404 }
    );
  }

  const responseData = {
    jobId: job.jobId,
    sourceType: job.sourceType,
    caseId: job.caseId ?? null,
    title: job.title ?? null,
    filename: job.filename ?? null,
    step: job.step,
    progress: job.progress,
    message: job.message,
    error: job.error ?? null,
    status:
      job.step === 'complete'
        ? 'completed'
        : job.step === 'deferred'
          ? 'deferred'
          : job.step === 'error'
            ? 'error'
            : job.step === 'queued'
              ? 'queued'
              : 'running',
    result: job.result ?? null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };

  const { etag, isMatch } = checkETag(responseData, request.headers);
  if (isMatch) return notModified(etag);

  return json(responseData, {
    headers: { ...cacheControl.short, ETag: etag }
  });
};
