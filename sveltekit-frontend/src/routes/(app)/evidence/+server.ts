import { json } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import type { RequestHandler } from './$types.js';

// Allow GET requests to pass through to the page
export const GET: RequestHandler = async () => {
  return new Response(null, { status: 200 });
};

// A light wrapper that accepts multipart form uploads and stores the file in MinIO under 'evidence' bucket.
export const POST: RequestHandler = async ({ request }) => {
  try {
    const form = await request.formData();
    const file = form.get('file') as File;
    const caseId = (form.get('caseId') as string) ?? 'unknown';

    if (!file) return json({ success: false, error: 'No file' }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const id = randomUUID();
    const objectName = `${id}_${file.name}`;

    try {
      const { minio } = await import('$lib/server/minio/client.js');
      const BUCKET = 'evidence';
      const exists = await minio.bucketExists(BUCKET).catch(() => false);
      if (!exists) await minio.makeBucket(BUCKET, 'us-east-1');
      await minio.putObject(BUCKET, objectName, buffer, buffer.length, {
        'x-amz-meta-case-id': caseId,
        'x-amz-meta-original-name': file.name,
        'Content-Type': file.type || 'application/octet-stream',
      });
    } catch (minioErr) {
      console.warn(
        '[evidence] MinIO upload failed, continuing without storage:',
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


