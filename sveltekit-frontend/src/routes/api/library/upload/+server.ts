/**
 * POST /api/library/upload
 * Upload a legal PDF to MinIO, create DB records, start ingestion pipeline.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { uploadLibraryDocument, runIngestionPipeline } from '$lib/server/legal/ingestion-worker.js';

const uploadSchema = z.object({
	title: z.string().min(1).max(500),
	corpusType: z.enum(['constitution', 'statute', 'regulation', 'bill', 'case', 'glossary', 'treatise', 'other']).default('other'),
	jurisdiction: z.string().max(50).default('federal'),
	officialUrl: z.string().url().optional(),
	effectiveDate: z.string().optional(),
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ success: false, error: 'Unauthorized' }, { status: 401 });

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    // Cross-realm instanceof check (jsdom File !== undici File in test env) — use duck-typing
    if (!file || typeof file === 'string')
      return json({ success: false, error: 'Missing file' }, { status: 400 });
    if (file.size > 200 * 1024 * 1024)
      return json({ success: false, error: 'File too large (200 MB max)' }, { status: 413 });

    const meta = uploadSchema.safeParse({
      title: formData.get('title') ?? file.name.replace(/\.pdf$/i, ''),
      corpusType: formData.get('corpusType') ?? 'other',
      jurisdiction: formData.get('jurisdiction') ?? 'federal',
      officialUrl: formData.get('officialUrl') || undefined,
      effectiveDate: formData.get('effectiveDate') || undefined,
    });
    if (!meta.success)
      return json({ success: false, error: meta.error.issues[0]?.message }, { status: 400 });

    const fileBuffer = Buffer.from(await file.arrayBuffer());

    const {
      documentId,
      jobId,
      alreadyExists = false,
      processingStatus = null,
    } = await uploadLibraryDocument({
      fileBuffer,
      fileName: file.name,
      title: meta.data.title,
      corpusType: meta.data.corpusType,
      jurisdictionCode: meta.data.jurisdiction,
      officialUrl: meta.data.officialUrl,
      effectiveDate: meta.data.effectiveDate,
      userId: locals.user.id,
    });

    // Start ingestion in background only for new uploads.
    if (!alreadyExists && jobId) {
      runIngestionPipeline({ documentId, jobId }).catch((err) =>
        console.error('[library/upload] ingestion failed:', err)
      );
    }

    return json(
      {
        success: true,
        documentId,
        jobId,
        alreadyExists,
        processingStatus,
        message: alreadyExists ? 'Document already exists' : 'Upload queued',
        data: { documentId, jobId, alreadyExists, processingStatus },
      },
      { status: alreadyExists ? 200 : 201 }
    );
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    const errStack = error instanceof Error ? error.stack : undefined;
    console.error('[library/upload] upload failed:', errMsg);
    if (errStack) console.error('[library/upload] stack:', errStack);
    return json(
      { success: false, documentId: null, jobId: null, data: null, error: 'Upload failed' },
      { status: 500 }
    );
  }
};
