/**
 * POST /api/library/upload
 * Upload a bounded PDF or supported raster image to SeaweedFS and enqueue ingestion.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { uploadLibraryDocumentStreamV1 } from '$lib/server/legal/ingestion-worker.js';
import { isSupportedLibraryUploadMimeTypeV1 } from '$lib/server/features/legal-corpus/legal/library-upload-format-v1.js';
import { getAuthorizedCase } from '$lib/server/case-access.js';
import { normalizeLibraryActorIdV1 } from '$lib/server/library/library-document-access-v1.js';

const uploadSchema = z.object({
	title: z.string().min(1).max(500),
	corpusType: z.enum(['constitution', 'statute', 'regulation', 'bill', 'case', 'glossary', 'treatise', 'other']).default('other'),
	jurisdiction: z.string().max(50).default('federal'),
	officialUrl: z.string().url().optional(),
	effectiveDate: z.string().optional(),
	caseId: z.string().uuid().optional(),
});

const MAX_UPLOAD_BYTES = 200 * 1024 * 1024;
const MAX_MULTIPART_REQUEST_BYTES = MAX_UPLOAD_BYTES + 1024 * 1024;

export const POST: RequestHandler = async ({ request, locals, url }) => {
	if (!locals.user?.id) return json({ success: false, error: 'Unauthorized' }, { status: 401 });

  try {
    const contentType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
    if (contentType && isSupportedLibraryUploadMimeTypeV1(contentType)) {
      const byteLength = Number(request.headers.get('x-library-byte-length') ?? request.headers.get('content-length'));
      if (!Number.isSafeInteger(byteLength) || byteLength <= 0) return json({ success: false, error: 'Upload byte length required' }, { status: 411 });
      if (byteLength > MAX_UPLOAD_BYTES) return json({ success: false, error: 'File too large (200 MB max)' }, { status: 413 });
      if (!request.body) return json({ success: false, error: 'Missing file body' }, { status: 400 });

      let headerMetadata: Record<string, unknown> = {};
      const encodedMetadata = request.headers.get('x-library-metadata');
      if (encodedMetadata) {
        if (encodedMetadata.length > 12_000) return json({ success: false, error: 'Upload metadata too large' }, { status: 400 });
        try {
          const decoded = JSON.parse(Buffer.from(encodedMetadata, 'base64url').toString('utf8')) as unknown;
          if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) throw new Error('Metadata must be an object');
          headerMetadata = decoded as Record<string, unknown>;
        } catch {
          return json({ success: false, error: 'Invalid upload metadata' }, { status: 400 });
        }
      }

      const rawMeta = uploadSchema.safeParse({
        title: headerMetadata['title'] ?? url.searchParams.get('title') ?? request.headers.get('x-library-title') ?? `Uploaded ${contentType.startsWith('image/') ? 'image' : 'PDF'}`,
        corpusType: headerMetadata['corpusType'] ?? url.searchParams.get('corpusType') ?? request.headers.get('x-library-corpus-type') ?? 'other',
        jurisdiction: headerMetadata['jurisdiction'] ?? url.searchParams.get('jurisdiction') ?? request.headers.get('x-library-jurisdiction') ?? 'federal',
        officialUrl: headerMetadata['officialUrl'] ?? url.searchParams.get('officialUrl') ?? request.headers.get('x-library-official-url') ?? undefined,
        effectiveDate: headerMetadata['effectiveDate'] ?? url.searchParams.get('effectiveDate') ?? request.headers.get('x-library-effective-date') ?? undefined,
        caseId: headerMetadata['caseId'] ?? url.searchParams.get('caseId') ?? request.headers.get('x-case-id') ?? undefined,
      });
      if (!rawMeta.success) return json({ success: false, error: rawMeta.error.issues[0]?.message }, { status: 400 });

      const actorId = normalizeLibraryActorIdV1(locals.user.id);
      if (actorId === null) return json({ success: false, error: 'Unauthorized' }, { status: 401 });
      if (rawMeta.data.caseId) {
        const authorizedCase = await getAuthorizedCase(rawMeta.data.caseId, actorId).catch(() => null);
        if (!authorizedCase) return json({ success: false, error: 'Case not found' }, { status: 404 });
      }

      const defaultExtension = contentType === 'application/pdf' ? '.pdf' : contentType === 'image/jpeg' ? '.jpg' : contentType === 'image/png' ? '.png' : '.webp';
      let suppliedFileName = request.headers.get('x-file-name');
      if (suppliedFileName) {
        try { suppliedFileName = decodeURIComponent(suppliedFileName); }
        catch { return json({ success: false, error: 'Invalid file name encoding' }, { status: 400 }); }
      }
      const fileName = (suppliedFileName ?? url.searchParams.get('fileName') ?? `${rawMeta.data.title}${defaultExtension}`)
        .replace(/[\\/\r\n\0]/g, '_').slice(0, 255);
      const stored = await uploadLibraryDocumentStreamV1({
        body: request.body,
        byteLength,
        mimeType: contentType,
        fileName,
        title: rawMeta.data.title,
        corpusType: rawMeta.data.corpusType,
        jurisdictionCode: rawMeta.data.jurisdiction,
        officialUrl: rawMeta.data.officialUrl,
        effectiveDate: rawMeta.data.effectiveDate,
        caseId: rawMeta.data.caseId,
        userId: String(actorId),
      });
      return json({
        success: true,
        documentId: stored.documentId,
        jobId: stored.jobId,
        sourceHash: stored.sourceHash,
        byteLength: stored.byteLength,
        alreadyExists: stored.alreadyExists,
        processingStatus: stored.processingStatus,
        data: { documentId: stored.documentId, jobId: stored.jobId, sourceHash: stored.sourceHash, byteLength: stored.byteLength },
      }, { status: stored.alreadyExists ? 200 : 202 });
    }
    if (contentType !== 'multipart/form-data') return json({ success: false, error: 'Expected PDF, JPEG, PNG, WebP, or multipart/form-data' }, { status: 415 });

    // `request.formData()` buffers before exposing the File. Require and cap the
    // complete multipart body before parsing so legacy clients cannot bypass the
    // same upload bound used by the raw streaming path.
    const contentLengthHeader = request.headers.get('content-length');
    if (!contentLengthHeader || !/^\d+$/.test(contentLengthHeader)) {
      return json({ success: false, error: 'Content-Length required for multipart upload' }, { status: 411 });
    }
    const multipartByteLength = Number(contentLengthHeader);
    if (!Number.isSafeInteger(multipartByteLength) || multipartByteLength <= 0) {
      return json({ success: false, error: 'Invalid multipart Content-Length' }, { status: 411 });
    }
    if (multipartByteLength > MAX_MULTIPART_REQUEST_BYTES) {
      return json({ success: false, error: 'Multipart request too large (201 MiB max)' }, { status: 413 });
    }

    const formData = await request.formData();
    const file = formData.get('file');
    // Cross-realm instanceof check (jsdom File !== undici File in test env) — use duck-typing
    if (!file || typeof file === 'string')
      return json({ success: false, error: 'Missing file' }, { status: 400 });
    if (file.size <= 0) return json({ success: false, error: 'Empty files are not accepted' }, { status: 400 });
    if (file.size > MAX_UPLOAD_BYTES)
      return json({ success: false, error: 'File too large (200 MB max)' }, { status: 413 });

    const extension = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';
    const extensionMime: Record<string, string> = {
      pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
    };
    const declaredMime = file.type.toLowerCase().split(';', 1)[0]?.trim() ?? '';
    const normalizedMime = declaredMime === 'image/jpg' ? 'image/jpeg' : declaredMime;
    const fileMimeType = isSupportedLibraryUploadMimeTypeV1(normalizedMime)
      ? normalizedMime
      : extensionMime[extension] ?? '';
    if (!isSupportedLibraryUploadMimeTypeV1(fileMimeType)) {
      return json({ success: false, error: 'Unsupported file type. Use PDF, JPEG, PNG, or WebP.' }, { status: 415 });
    }

    const meta = uploadSchema.safeParse({
      title: formData.get('title') ?? file.name.replace(/\.[^.]+$/, ''),
      corpusType: formData.get('corpusType') ?? 'other',
      jurisdiction: formData.get('jurisdiction') ?? 'federal',
      officialUrl: formData.get('officialUrl') || undefined,
      effectiveDate: formData.get('effectiveDate') || undefined,
      caseId: formData.get('caseId') || undefined,
    });
    if (!meta.success)
      return json({ success: false, error: meta.error.issues[0]?.message }, { status: 400 });

    const actorId = normalizeLibraryActorIdV1(locals.user.id);
    if (actorId === null) return json({ success: false, error: 'Unauthorized' }, { status: 401 });
    if (meta.data.caseId) {
      const authorizedCase = await getAuthorizedCase(meta.data.caseId, actorId).catch(() => null);
      if (!authorizedCase) return json({ success: false, error: 'Case not found' }, { status: 404 });
    }

    const stored = await uploadLibraryDocumentStreamV1({
      body: file.stream(),
      byteLength: file.size,
      mimeType: fileMimeType,
      fileName: file.name,
      title: meta.data.title,
      corpusType: meta.data.corpusType,
      jurisdictionCode: meta.data.jurisdiction,
      caseId: meta.data.caseId,
      officialUrl: meta.data.officialUrl,
      effectiveDate: meta.data.effectiveDate,
      userId: String(actorId),
    });

    return json({
      success: true,
      documentId: stored.documentId,
      jobId: stored.jobId,
      alreadyExists: stored.alreadyExists,
      processingStatus: stored.processingStatus,
      sourceHash: stored.sourceHash,
      byteLength: stored.byteLength,
      message: stored.alreadyExists ? 'Document already exists' : 'Document stored; ingestion queued for a worker',
      data: { documentId: stored.documentId, jobId: stored.jobId, alreadyExists: stored.alreadyExists, processingStatus: stored.processingStatus },
    }, { status: stored.alreadyExists ? 200 : 202 });
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
