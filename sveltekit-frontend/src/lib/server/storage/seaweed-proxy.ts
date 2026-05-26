import { error, type RequestHandler } from '@sveltejs/kit';
import { getSeaweedFile } from '$lib/server/seaweed-client.js';

const MIME_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg'
};

export const GET: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) throw error(401, 'Unauthorized');
  const fullPath = params.path;
  if (!fullPath) throw error(400, 'Missing path');

  const slashIdx = fullPath.indexOf('/');
  if (slashIdx < 1) throw error(400, 'Invalid path — expected /{bucket}/{key}');

  const bucket = fullPath.substring(0, slashIdx);
  const objectKey = fullPath.substring(slashIdx + 1);
  if (!objectKey) throw error(400, 'Missing object key');

  try {
    const body = await getSeaweedFile(bucket, objectKey);
    const ext = '.' + objectKey.split('.').pop()?.toLowerCase();
    const contentType = MIME_MAP[ext] || 'application/octet-stream';

    return new Response(new Uint8Array(body), {
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(body.length),
        'Cache-Control': 'public, max-age=86400, immutable'
      }
    });
  } catch (err: any) {
    if (err?.code === 'NoSuchKey' || err?.code === 'NoSuchBucket') {
      throw error(404, 'File not found');
    }
    console.error('[seaweed-proxy] Error fetching object:', err?.message ?? err);
    throw error(500, 'Failed to fetch file from storage');
  }
};

