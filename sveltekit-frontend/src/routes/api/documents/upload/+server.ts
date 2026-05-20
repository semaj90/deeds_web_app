/**
 * POST /api/documents/upload
 *
 * Uploads document files (PDF, DOCX, TXT) and publishes to RabbitMQ document.embed queue
 * Returns document ID and attachment record for chat context
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { db } from '$lib/server/db/client';

const documentUploadFieldsSchema = z.object({
  sessionId: z.string().min(1).max(200),
  caseId: z.string().uuid().nullable().optional(),
});
import { documents, chatDocumentAttachments } from '$lib/server/db/schema-postgres';
import { rabbitmq } from '$lib/server/queue/rabbitmq-manager-fixed';
import { minio } from '$lib/server/minio/client';

export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    // Auth check
    if (!locals.user) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const sessionIdRaw = formData.get('sessionId') as string | null;
    const caseIdRaw = formData.get('caseId') as string | null;

    if (!file) {
      return json({ error: 'No file provided' }, { status: 400 });
    }

    const fieldsParsed = documentUploadFieldsSchema.safeParse({
      sessionId: sessionIdRaw,
      caseId: caseIdRaw && caseIdRaw.length > 0 ? caseIdRaw : null,
    });
    if (!fieldsParsed.success) {
      return json(
        { error: 'Invalid form fields', details: fieldsParsed.error.flatten() },
        { status: 400 }
      );
    }
    const { sessionId } = fieldsParsed.data;
    const caseId = fieldsParsed.data.caseId ?? null;

    // Validate file type
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/markdown',
      'application/json',
    ];

    if (!allowedTypes.includes(file.type) && !file.name.match(/\.(pdf|doc|docx|txt|md|json)$/i)) {
      return json(
        { error: 'Invalid file type. Allowed: PDF, DOC, DOCX, TXT, MD, JSON' },
        { status: 400 }
      );
    }

    // Validate file size (max 50MB for documents)
    if (file.size > 50 * 1024 * 1024) {
      return json({ error: 'File too large (max 50MB)' }, { status: 400 });
    }

    // Create document ID (must be UUID for postgres)
    const documentId = crypto.randomUUID();
    const fileName = file.name;
    const fileSize = file.size;
    const buffer = Buffer.from(await file.arrayBuffer());

    // Upload to MinIO (primary) or fall back to local filesystem
    const BUCKET = 'documents';
    const objectName = `${documentId}/${fileName}`;
    let filePath = objectName; // MinIO object path as default

    try {
      await minio.bucketExists(BUCKET).catch(async () => {
        await minio.makeBucket(BUCKET, 'us-east-1');
      });
      await minio.putObject(BUCKET, objectName, buffer, buffer.length, {
        'content-type': file.type,
        'x-amz-meta-document-id': documentId,
        'x-amz-meta-case-id': caseId ?? '',
        'x-amz-meta-uploaded-by': locals.user.id,
      });
    } catch (minioErr) {
      // MinIO unavailable — fall back to local filesystem
      console.warn(
        '[documents/upload] MinIO unavailable, saving locally:',
        (minioErr as Error).message
      );
      const { writeFile, mkdir } = await import('fs/promises');
      const { join } = await import('path');
      const { existsSync } = await import('fs');
      const tempDir = join(process.cwd(), 'uploads', 'documents');
      if (!existsSync(tempDir)) {
        await mkdir(tempDir, { recursive: true });
      }
      filePath = join(tempDir, `${documentId}_${fileName}`);
      await writeFile(filePath, buffer);
    }

    // Insert document record
    const [documentRecord] = await db
      .insert(documents)
      .values({
        id: documentId,
        title: fileName.replace(/\.[^.]+$/, ''), // Remove extension
        filePath: filePath,
        fileSize: fileSize,
        mimeType: file.type,
        originalName: fileName,
        status: 'pending',
        metadata: {
          uploadedBy: Number(locals.user.id),
          uploadedAt: new Date().toISOString(),
          sessionId,
        },
      })
      .returning();

    // Insert chat attachment record (optional — skip if session doesn't exist)
    let attachmentId: string | null = null;
    try {
      const [attachmentRecord] = await db
        .insert(chatDocumentAttachments)
        .values({
          chat_session_id: sessionId,
          document_id: documentId,
          file_name: fileName,
          file_size: fileSize,
          file_type: file.type,
          minio_path: filePath,
          embedding_status: 'pending',
          metadata: {
            caseId,
            uploadedBy: Number(locals.user.id),
          },
        })
        .returning();
      attachmentId = attachmentRecord.id;
    } catch (attachErr) {
      // Non-fatal: attachment record links to a chat session; if session doesn't exist yet, skip
      console.warn(
        'Document attachment insert skipped (session may not exist yet):',
        (attachErr as Error).message
      );
    }

    // Publish to RabbitMQ — wait for channel to be ready if still initializing
    await rabbitmq.publishWhenReady('document.processing', 'document.chat.embed', {
      documentId,
      filePath,
      fileName,
      sessionId,
      caseId,
      userId: Number(locals.user.id),
      timestamp: Date.now(),
    });

    return json({
      success: true,
      documentId,
      attachmentId,
      message: 'Document uploaded and queued for embedding',
    });
  } catch (err) {
    console.error('Document upload error:', err);
    return json({ error: 'Failed to upload document' }, { status: 500 });
  }
};
