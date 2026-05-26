import { json } from '@sveltejs/kit';
import { getSeaweedClient, getSeaweedConfig } from '$lib/server/seaweed-client.js';
import { ENV } from '$lib/server/env.server.js';
import { z } from 'zod';

const BUCKET = ENV.MINIO_EVIDENCE_BUCKET || 'admin-ai-uploads';

const uploadSchema = z.object({
  file: z.any()
});

/**
 * Handles temporary file uploads for the Admin AI Assistant.
 * Stores files in SeaweedFS-compatible object storage and returns metadata.
 */
export async function POST({ request, locals }) {
  if (!locals.user || locals.user.role !== 'admin') {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const { file } = uploadSchema.parse({
      file: formData.get('file')
    });

    if (!(file instanceof File)) {
      return json({ error: 'No file provided' }, { status: 400 });
    }

    const client = getSeaweedClient();
    const config = getSeaweedConfig();
    const fileId = crypto.randomUUID();
    const fileName = `${locals.user.id}/${fileId}-${file.name}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    // Ensure bucket exists
    const exists = await client.bucketExists(BUCKET).catch(() => false);
    if (!exists) {
      await client.makeBucket(BUCKET, 'us-east-1').catch(() => {});
    }

    await client.putObject(BUCKET, fileName, buffer, buffer.length, {
      'Content-Type': file.type,
    });

    const protocol = config.useSSL ? 'https' : 'http';
    const url = `${protocol}://${config.endPoint}:${config.port}/${BUCKET}/${fileName}`;

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
