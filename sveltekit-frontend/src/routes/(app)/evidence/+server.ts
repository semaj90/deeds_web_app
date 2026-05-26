import { json } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import type { RequestHandler } from './$types.js';
import { z } from 'zod';

const evidenceUploadFieldsSchema = z.object({
  caseId: z.string().min(1).max(200).default('unknown'),
});

// Allow GET requests to pass through to the page
export const GET: RequestHandler = async () => {
  return new Response(null, { status: 200 });
};

// A light wrapper that accepts multipart form uploads and stores the file in SeaweedFS under the 'evidence' bucket.
export const POST: RequestHandler = async ({ request }) => {
  try {
    const form = await request.formData();
    const file = form.get('file') as File;
    const fieldsParsed = evidenceUploadFieldsSchema.safeParse({
      caseId: form.get('caseId') ?? 'unknown',
    });
    const caseId = fieldsParsed.success ? fieldsParsed.data.caseId : 'unknown';

    if (!file) return json({ success: false, error: 'No file' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const id = randomUUID();
    const objectName = `${id}_${file.name}`;

    try {
      const { getSeaweedClient } = await import('$lib/server/seaweed-client.js');
      const seaweed = getSeaweedClient();
      const BUCKET = 'evidence';
      const exists = await seaweed.bucketExists(BUCKET).catch(() => false);
      if (!exists) await seaweed.makeBucket(BUCKET, 'us-east-1');
      await seaweed.putObject(BUCKET, objectName, buffer, buffer.length, {
        'x-amz-meta-case-id': caseId,
        'x-amz-meta-original-name': file.name,
        'Content-Type': file.type || 'application/octet-stream',
      });
    } catch (minioErr) {
      console.warn(
        '[evidence] SeaweedFS upload failed, continuing without storage:',
        (minioErr as Error).message
      );
    }

    return json({ success: true, id, objectName });
  } catch (err: unknown) {
    console.error('Evidence upload error', err);
    return json(
      { success: false, error: (err as any)?.message ?? 'upload error' },
      { status: 500 }
    );
  }
};


