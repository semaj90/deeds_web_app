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
import { getSeaweedClient as getMinioClient } from '$lib/server/seaweed-client.js';
import { getAuthorizedCase } from '$lib/server/case-access.js';
import {
  ChatSessionOwnerErrorV1,
  chatAttachmentSessionUuidV1,
  ensureChatSessionOwnerV1,
} from '$lib/server/chat/chat-session-owner-v1.js';
import { chatSessionOwnerDepsV1 } from '$lib/server/chat/chat-session-owner-db-v1.js';
import { formatAcpKanbanErrorLineV1 } from '$lib/server/atlas/kanban-acp-dag-contracts.js';

class AttachmentLinkError extends Error {
  constructor(readonly cause: unknown) {
    super('ATTACHMENT_LINK_FAILED');
    this.name = 'AttachmentLinkError';
  }
}

export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    // Auth check
    const actorId = Number(locals.user?.id);
    if (!locals.user || !Number.isSafeInteger(actorId) || actorId <= 0) {
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

    // A supplied caseId must be a case the actor owns or is assigned to; checked before
    // any file is read or written so an unauthorized case tag never reaches storage or the queue.
    if (caseId && !(await getAuthorizedCase(caseId, actorId))) {
      return json({ error: 'Case not found' }, { status: 404 });
    }

    // sessionId is a chat id (chat_metadata is the session owner). Bind or verify it for this actor
    // before any storage or queue work: an upload before the first message claims the session,
    // an existing session must belong to the actor (and match the case), legacy chats with history
    // but no owner row are refused. Same rule and status mapping as api/sse/chat.
    try {
      await ensureChatSessionOwnerV1(
        { chatId: sessionId, userId: actorId, caseId },
        chatSessionOwnerDepsV1()
      );
    } catch (error) {
      if (error instanceof ChatSessionOwnerErrorV1) {
        const legacy = error.code === 'CHAT_SESSION_LEGACY_OWNER_UNKNOWN';
        return json(
          { error: legacy ? 'Legacy chat requires account recovery' : 'Conversation not found' },
          { status: legacy ? 409 : 404 }
        );
      }
      console.error('[documents/upload] Could not verify conversation ownership:', error);
      return json({ error: 'Conversation authorization unavailable' }, { status: 503 });
    }

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
    const minio = getMinioClient();

    // Upload to SeaweedFS-compatible object storage or fall back to local filesystem
    const BUCKET = 'documents';
    const objectName = `${documentId}/${fileName}`;
    let filePath = objectName; // object-store path as default

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
      // Object storage unavailable — fall back to local filesystem
      console.warn(
        '[documents/upload] SeaweedFS/S3 unavailable, saving locally:',
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

    // Insert the document record and its chat attachment in ONE transaction. The session is already
    // owned by this actor (verified above), so a missing link is a real fault, not an expected state:
    // a failed attachment insert rolls the document row back, fails the request and skips the queue
    // publish. chat_session_id is a uuid column, so it holds the deterministic lookup key for the chat
    // id; the real chat id is kept in metadata.
    let attachmentId: string;
    try {
      attachmentId = await db.transaction(async (tx) => {
        await tx
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

        try {
          const [attachmentRecord] = await tx
            .insert(chatDocumentAttachments)
            .values({
              chat_session_id: chatAttachmentSessionUuidV1(sessionId),
              document_id: documentId,
              file_name: fileName,
              file_size: fileSize,
              file_type: file.type,
              minio_path: filePath,
              embedding_status: 'pending',
              metadata: {
                caseId,
                chatId: sessionId,
                uploadedBy: Number(locals.user.id),
              },
            })
            .returning();
          return attachmentRecord.id as string;
        } catch (attachErr) {
          throw new AttachmentLinkError(attachErr);
        }
      });
    } catch (txErr) {
      if (!(txErr instanceof AttachmentLinkError)) throw txErr;
      const cause = txErr.cause as { code?: string; message?: string } | undefined;
      // Printed for the agentic error-fixing path (ACP / A2A -> Kanban). Nothing is written here; the
      // object stored above is now unreferenced and is NOT deleted (archive-not-delete): its key is
      // in the context so a reconciler or the fixing agent can find it.
      console.error(
        formatAcpKanbanErrorLineV1(
          {
            relativePath: 'src/routes/api/documents/upload/+server.ts',
            errorSignature: `ATTACHMENT_LINK_FAILED: ${String(cause?.message ?? cause ?? 'unknown').slice(0, 300)}`,
          },
          {
            route: 'POST /api/documents/upload',
            pgCode: cause?.code ?? null,
            chatId: sessionId,
            caseId,
            documentId,
            orphanedObject: { bucket: BUCKET, key: objectName, localFallbackPath: filePath === objectName ? null : filePath },
            rolledBack: ['documents', 'chat_document_attachments'],
            published: false,
          }
        )
      );
      return json(
        { error: 'Failed to link the document to the chat session', code: 'ATTACHMENT_LINK_FAILED' },
        { status: 500 }
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
      attachmentLinked: true,
      message: 'Document uploaded and queued for embedding',
    });
  } catch (err) {
    console.error('Document upload error:', err);
    return json({ error: 'Failed to upload document' }, { status: 500 });
  }
};
