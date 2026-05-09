import { json } from '@sveltejs/kit';
import { getMinIOStorage } from '$lib/server/minio.js';
import { ENV } from '$lib/server/env.server.js';

const BUCKET = ENV.MINIO_EVIDENCE_BUCKET || 'admin-ai-uploads';

/**
 * Handles temporary file uploads for the Admin AI Assistant.
 * Stores files in MinIO and returns a metadata object.
 */
export async function POST({ request, locals }) {
  if (!locals.user || locals.user.role !== 'admin') {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return json({ error: 'No file provided' }, { status: 400 });
    }

    const storage = getMinIOStorage();
    const fileId = crypto.randomUUID();
    const fileName = `${locals.user.id}/${fileId}-${file.name}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    await storage.uploadBuffer(BUCKET, fileName, buffer, {
      contentType: file.type,
      metadata: {
        'original-name': file.name,
        'uploaded-by': locals.user.id
      }
    });

    const url = await storage.getPresignedDownloadUrl(BUCKET, fileName, { expirySeconds: 3600 });

    return json({
      fileId,
      name: file.name,
      type: file.type,
      size: file.size,
      url
    });
  } catch (err: any) {
    console.error('[AdminChatUpload] Upload failed:', err);
    return json({ error: `Upload failed: ${err.message}` }, { status: 500 });
  }
}
