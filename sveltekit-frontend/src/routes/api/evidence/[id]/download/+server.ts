/**
 * GET /api/evidence/[id]/download
 * Streams the evidence file from SeaweedFS-compatible object storage to the browser.
 * Resolves minio:// URLs and http:// object-store URLs to actual file streams.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { cases, evidence } from '$lib/server/db/schema-postgres.js';
import { and, eq, or } from 'drizzle-orm';
import { getSeaweedStream as getStream, getSeaweedPartialStream as getPartialStream, statSeaweedObject as statObject } from '$lib/server/seaweed-client.js';
import { ENV } from '$lib/server/env.server.js';
import { isUuid } from '$lib/server/validation.js';
import { probeObservedMime } from '$lib/server/ingest/upload-classification-v1.js';

const EVIDENCE_BUCKET = ENV.MINIO_EVIDENCE_BUCKET;

function parseByteRange(header: string | null, size: number): { start: number; end: number } | null | 'invalid' {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || size <= 0 || (!match[1] && !match[2])) return 'invalid';
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[2] && match[1] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || start >= size) return 'invalid';
  return { start, end: Math.min(end, size - 1) };
}

/** Extract object-store key from stored URL formats */
function extractObjectKey(fileUrl: string): { bucket: string; key: string } | null {
  if (!fileUrl) return null;

  // seaweed://bucket-name/path/to/file.pdf (legacy minio:// rows share the same layout)
  if (fileUrl.startsWith('seaweed://') || fileUrl.startsWith('minio://')) {
    const rest = fileUrl.slice(fileUrl.indexOf('://') + 3);
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

export const GET: RequestHandler = async ({ params, locals, url, request }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
  if (!isUuid(params.id)) return json({ error: 'Invalid ID format' }, { status: 400 });
  const caseId = url.searchParams.get('caseId');
  if (url.searchParams.get('inline') === '1' && !caseId) {
    return json({ error: 'Case ID is required for inline preview' }, { status: 400 });
  }
  if (caseId && !isUuid(caseId)) return json({ error: 'Invalid case ID format' }, { status: 400 });

  try {
    if (caseId) {
      const [authorizedCase] = await db
        .select({ id: cases.id })
        .from(cases)
        .where(and(
          eq(cases.id, caseId),
          or(eq(cases.userId, Number(locals.user.id)), eq(cases.assignedAttorney, Number(locals.user.id))),
        ))
        .limit(1);
      if (!authorizedCase) return json({ error: 'Case not found' }, { status: 404 });
    }

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
      .where(
        and(
          eq(evidence.id, params.id),
          ...(caseId ? [eq(evidence.caseId, caseId)] : []),
          ...(!caseId ? [or(
            eq(evidence.userId, Number(locals.user.id)),
            eq(evidence.uploadedBy, Number(locals.user.id)),
          )] : []),
        ),
      )
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

    const range = parseByteRange(request.headers.get('range'), contentLength ?? item.fileSize ?? 0);
    if (range === 'invalid') {
      const size = contentLength ?? item.fileSize ?? 0;
      return new Response(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${size}`, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, no-store' },
      });
    }

    const storedContentType = item.mimeType || item.fileType || 'application/octet-stream';
    let contentType = url.searchParams.get('inline') === '1' ? 'application/octet-stream' : storedContentType;
    if (url.searchParams.get('inline') === '1') {
      const sampleStream = await getPartialStream(parsed.bucket, parsed.key, 0, Math.min(512, contentLength ?? item.fileSize ?? 512));
      const sampleChunks: Buffer[] = [];
      for await (const chunk of sampleStream) {
        sampleChunks.push(Buffer.from(chunk));
        if (sampleChunks.reduce((total, part) => total + part.length, 0) >= 512) break;
      }
      const observedType = probeObservedMime(Buffer.concat(sampleChunks).subarray(0, 512));
      const safeInlineTypes = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'audio/wav', 'audio/mpeg', 'video/mp4']);
      if (!observedType || observedType !== storedContentType.toLowerCase() || !safeInlineTypes.has(observedType)) {
        return json({ error: 'Inline preview requires a matching supported file signature' }, { status: 415 });
      }
      contentType = observedType;
    }

    const stream = range
      ? await getPartialStream(parsed.bucket, parsed.key, range.start, range.end - range.start + 1)
      : await getStream(parsed.bucket, parsed.key);

    const fileName = item.fileName || `evidence-${params.id}`;

    const disposition = url.searchParams.get('inline') === '1' ? 'inline' : 'attachment';
    const headers = new Headers({
      'Content-Type': contentType,
      'Content-Disposition': `${disposition}; filename="${encodeURIComponent(fileName)}"`,
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Accept-Ranges': 'bytes',
    });
    if (range) {
      headers.set('Content-Range', `bytes ${range.start}-${range.end}/${contentLength ?? item.fileSize}`);
      headers.set('Content-Length', String(range.end - range.start + 1));
    } else if (contentLength !== undefined) {
      headers.set('Content-Length', String(contentLength));
    }

    // Convert Node readable stream to Web ReadableStream
    const webStream = new ReadableStream({
      start(controller) {
        // Node emits stream events outside any try block. If the client disconnects,
        // enqueue/close/error throw ERR_INVALID_STATE there and crash the whole process,
        // so every controller call is guarded and the source is torn down once closed.
        let closed = false;
        const finish = () => { closed = true; };
        stream.on('data', (chunk: Buffer) => {
          if (closed) return;
          try {
            controller.enqueue(new Uint8Array(chunk));
          } catch {
            finish();
            stream.destroy();
          }
        });
        stream.on('end', () => {
          if (closed) return;
          finish();
          try { controller.close(); } catch { /* already closed by the client */ }
        });
        stream.on('error', (err: Error) => {
          if (closed) return;
          finish();
          try { controller.error(err); } catch { /* already closed by the client */ }
        });
      },
      cancel() {
        stream.destroy();
      },
    });

    return new Response(webStream, { status: range ? 206 : 200, headers });
  } catch (err) {
    console.error('[evidence/download] error:', err);
    return json({ error: 'Failed to download file' }, { status: 500 });
  }
};
