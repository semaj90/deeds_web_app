/**
 * GET /api/evidence/[id]/download
 * Streams the evidence file from MinIO to the browser.
 * Resolves minio:// URLs and http:// MinIO URLs to actual file streams.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { evidence } from '$lib/server/db/schema-postgres.js';
import { and, eq } from 'drizzle-orm';
import { getStream, statObject } from '$lib/server/minio-client.js';
import { ENV } from '$lib/server/env.server.js';
import { isUuid } from '$lib/server/validation.js';

const EVIDENCE_BUCKET = ENV.MINIO_EVIDENCE_BUCKET;

/** Extract MinIO object key from stored URL formats */
function extractObjectKey(fileUrl: string): { bucket: string; key: string } | null {
  if (!fileUrl) return null;

  // minio://bucket-name/path/to/file.pdf
  if (fileUrl.startsWith('minio://')) {
    const rest = fileUrl.slice('minio://'.length);
    const slashIdx = rest.indexOf('/');
    if (slashIdx === -1) return null;
    return { bucket: rest.slice(0, slashIdx), key: rest.slice(slashIdx + 1) };
  }

  // http://host:port/bucket/key
  if (fileUrl.startsWith('http')) {
    try {
      const url = new URL(fileUrl);
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts.length >= 2) {
        return { bucket: parts[0], key: parts.slice(1).join('/') };
      }
    } catch {
      // invalid URL
    }
  }

  // Bare key — assume evidence bucket
  if (fileUrl.includes('/')) {
    return { bucket: EVIDENCE_BUCKET, key: fileUrl };
  }

  return null;
}

export const GET: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
  if (!isUuid(params.id)) return json({ error: 'Invalid ID format' }, { status: 400 });

  try {
    const [item] = await db
      .select({
        id: evidence.id,
        fileUrl: evidence.fileUrl,
        fileName: evidence.fileName,
        mimeType: evidence.mimeType,
        fileType: evidence.fileType,
        fileSize: evidence.fileSize,
      })
      .from(evidence)
      .where(and(eq(evidence.id, params.id), eq(evidence.userId, locals.user.id)))
      .limit(1);

    if (!item) {
      return json({ error: 'Evidence not found' }, { status: 404 });
    }

    const fileUrl = item.fileUrl;
    if (!fileUrl) {
      return json({ error: 'No file associated with this evidence' }, { status: 404 });
    }

    const parsed = extractObjectKey(fileUrl);
    if (!parsed) {
      return json({ error: 'Cannot resolve file URL' }, { status: 400 });
    }

    // Get file metadata for Content-Length
    let contentLength: number | undefined;
    try {
      const stat = await statObject(parsed.bucket, parsed.key);
      contentLength = stat.size;
    } catch {
      // statObject failed — stream without Content-Length
    }

    // Stream the file from MinIO
    const stream = await getStream(parsed.bucket, parsed.key);

    const contentType = item.mimeType || item.fileType || 'application/octet-stream';
    const fileName = item.fileName || `evidence-${params.id}`;

    const headers = new Headers({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
      'Cache-Control': 'private, max-age=3600',
    });
    if (contentLength !== undefined) {
      headers.set('Content-Length', String(contentLength));
    }

    // Convert Node readable stream to Web ReadableStream
    const webStream = new ReadableStream({
      start(controller) {
        stream.on('data', (chunk: Buffer) => {
          controller.enqueue(new Uint8Array(chunk));
        });
        stream.on('end', () => {
          controller.close();
        });
        stream.on('error', (err: Error) => {
          controller.error(err);
        });
      },
      cancel() {
        stream.destroy();
      },
    });

    return new Response(webStream, { status: 200, headers });
  } catch (err) {
    console.error('[evidence/download] error:', err);
    return json({ error: 'Failed to download file' }, { status: 500 });
  }
};
