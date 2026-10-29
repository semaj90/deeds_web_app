import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { ingestVideoEvidence } from '$lib/server/features/evidence/index.js';
import {
  checkVideoUploadSizeV1,
  isVideoUploadContentLengthAllowedV1,
  MAX_VIDEO_UPLOAD_BODY_BYTES_V1,
  MAX_VIDEO_UPLOAD_BYTES_V1
} from '$lib/server/features/evidence/video/video-upload-policy-v1.js';
import { EvidenceCaseNotFoundError } from '$lib/server/evidence-case-admission-v1.js';

const videoIngestSchema = z
  .object({
    caseId: z.string().uuid(),
    title: z.string().max(256).optional(),
    description: z.string().max(10_000).optional(),
    sourceUrl: z.string().url().optional(),
    operatorApproved: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
    file: z.custom<File>((value) => value instanceof File, 'Must be a file').optional(),
  })
  .refine((value) => Boolean(value.file || value.sourceUrl), {
    message: 'Provide either a video file or a source URL',
  })
  .refine((value) => !value.sourceUrl || value.operatorApproved, {
    message: 'Operator approval is required for URL ingestion',
  });

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user && !process.env.DEV_BYPASS_AUTH) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }
  const ownerId = Number(locals.user?.id);
  if (!Number.isSafeInteger(ownerId) || ownerId <= 0) {
    return json({ error: 'Authenticated user has no valid evidence-owner identity' }, { status: 403 });
  }

  if (!isVideoUploadContentLengthAllowedV1(request.headers.get('content-length'))) {
    return json(
      {
        error: 'Video upload request exceeds the allowed size',
        code: 'VIDEO_UPLOAD_BODY_TOO_LARGE',
        maxBytes: MAX_VIDEO_UPLOAD_BODY_BYTES_V1
      },
      { status: 413 }
    );
  }

  const formData = await request.formData();
  const parsed = videoIngestSchema.safeParse({
    caseId: formData.get('caseId') ?? undefined,
    title: formData.get('title') ?? undefined,
    description: formData.get('description') ?? undefined,
    sourceUrl: formData.get('sourceUrl') ?? undefined,
    operatorApproved: formData.get('operatorApproved') ?? undefined,
    file: formData.get('file') ?? undefined,
  });

  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
  }

  if (parsed.data.file) {
    const sizeDecision = checkVideoUploadSizeV1(parsed.data.file.size);
    if ('reason' in sizeDecision) {
      return json(
        {
          error: sizeDecision.reason === 'too_large'
            ? `Video file exceeds the ${MAX_VIDEO_UPLOAD_BYTES_V1 / 1024 / 1024} MiB upload limit`
            : 'Video file has an invalid size',
          code: sizeDecision.reason === 'too_large' ? 'VIDEO_UPLOAD_TOO_LARGE' : 'VIDEO_UPLOAD_INVALID_SIZE',
          maxBytes: MAX_VIDEO_UPLOAD_BYTES_V1
        },
        { status: sizeDecision.reason === 'too_large' ? 413 : 400 }
      );
    }
  }

  try {
    const result = await ingestVideoEvidence(parsed.data, String(ownerId));

    return json({
      ok: true,
      ...result,
    });
  } catch (error) {
    if (error instanceof EvidenceCaseNotFoundError) {
      return json({ ok: false, error: 'Case not found' }, { status: 404 });
    }
    console.error('[VideoIngestAPI] Ingest failed:', error);
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Video ingestion failed',
      },
      { status: 500 }
    );
  }
};
