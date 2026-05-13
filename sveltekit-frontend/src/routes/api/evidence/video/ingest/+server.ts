import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { ingestVideoEvidence } from '$lib/server/evidence/video/video-ingest-service.js';

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

  try {
    const result = await ingestVideoEvidence(parsed.data);

    return json({
      ok: true,
      ...result,
    });
  } catch (error) {
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
