import { db } from '$lib/server/db/client';
import { evidence } from '$lib/server/db/schema';
import { uploadFile } from '$lib/server/minio-client';
import { fail, redirect } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms/server';
import { zod4 as zod } from 'sveltekit-superforms/adapters';
import { and, eq } from 'drizzle-orm';
import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import type { Actions, PageServerLoad } from './$types';
import { rabbitmq } from '$lib/server/queue/rabbitmq-manager-fixed.js';
import {
  evidenceUploadSchema,
  evidenceDeleteSchema,
  evidenceUpdateSchema,
  MAX_FILE_SIZE,
  ALLOWED_MIME_TYPES,
} from './schema.js';

export const load: PageServerLoad = async ({ url, locals }) => {
  const caseId = url.searchParams.get('caseId');

  // Phase 96: SSR Authentication Guard
  if (!locals.user?.id) {
    return {
      evidence: [],
      caseId,
      user: null,
      loadError: null,
      form: await superValidate(zod(evidenceUploadSchema)),
    };
  }

  const safe = <T>(p: Promise<T>, fallback: T, timeoutMs = 5000): Promise<T> =>
    Promise.race([
      p,
      new Promise<T>((resolve) => setTimeout(() => resolve(fallback), timeoutMs)),
    ]).catch(() => fallback);

  let evidenceData;
  let loadError: string | null = null;

  if (caseId) {
    evidenceData = await safe(
      db
        .select()
        .from(evidence)
        .where(and(eq(evidence.caseId, caseId), eq(evidence.userId, locals.user.id)))
        .limit(100),
      []
    );
  } else {
    evidenceData = await safe(
      db.select().from(evidence).where(eq(evidence.userId, locals.user.id)).limit(50),
      []
    );
  }

  if (evidenceData.length === 0) {
    loadError = 'No evidence found or database unavailable';
  }

  return {
    evidence: evidenceData,
    caseId,
    user: locals.user,
    loadError,
    form: await superValidate(zod(evidenceUploadSchema)),
  };
};

// Phase 96: Form Actions for mutations (replaces API endpoints)
export const actions: Actions = {
  // Upload new evidence
  upload: async ({ request, locals }) => {
    if (!locals.user?.id) {
      throw redirect(302, '/login');
    }

    // Clone request so we can read formData for file AND pass to superValidate
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    // Validate text fields via Superforms
    const form = await superValidate(formData, zod(evidenceUploadSchema));
    if (!form.valid) {
      return fail(400, { form });
    }

    // File validation (separate from Zod)
    if (!file || !(file instanceof File) || file.size === 0) {
      return fail(400, { form, error: 'No file provided' });
    }
    if (!file.name || file.name.trim().length === 0) {
      return fail(400, { form, error: 'File has no name' });
    }
    if (file.size > MAX_FILE_SIZE) {
      return fail(400, { form, error: `File exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit` });
    }
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return fail(400, { form, error: `File type ${file.type} not allowed` });
    }

    try {
      const { title, description, caseId } = form.data;

      // 1. Upload to MinIO
      const fileExt = file.name.split('.').pop() ?? 'bin';
      const objectName = `evidence/${locals.user.id}/${randomUUID()}.${fileExt}`;
      const buffer = Buffer.from(await file.arrayBuffer());

      await uploadFile('legal-evidence', objectName, buffer, {
        'Content-Type': file.type,
        'Original-Filename': file.name,
      });

      // 2. Create DB Record
      const newEvidence = await db
        .insert(evidence)
        .values({
          userId: locals.user.id,
          caseId: caseId ?? null,
          title: title || file.name,
          description,
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type,
          fileUrl: objectName,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      // 3. Enqueue full RAG pipeline (entity extraction → embedding → Qdrant evidence_items)
      // Fire-and-forget: indexing failure must never block the upload response
      const indexText = [title || file.name, description].filter(Boolean).join('\n\n');
      rabbitmq
        .publishEvidenceProcess({
          evidenceId: newEvidence?.[0]?.id ?? randomUUID(),
          text: indexText,
          contentType: file.type,
          fileName: file.name,
          caseId: caseId ?? undefined,
          metadata: { userId: locals.user.id, fileName: file.name, fileType: file.type },
        })
        .catch((err) =>
          console.error('[evidence/upload] RAG queue publish failed (non-fatal):', err)
        );

      return {
        success: true,
        evidence: newEvidence?.[0] ?? null,
      };
    } catch (err) {
      console.error('Upload failed:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Upload failed',
      };
    }
  },
  // Delete evidence
  delete: async ({ request, locals }) => {
    if (!locals.user?.id) {
      throw redirect(302, '/login');
    }

    const form = await superValidate(request, zod(evidenceDeleteSchema));
    if (!form.valid) {
      return fail(400, { form });
    }

    try {
      const { evidenceId } = form.data;

      // Only delete if owned by user
      await db
        .delete(evidence)
        .where(and(eq(evidence.id, evidenceId), eq(evidence.userId, locals.user.id)));

      return { success: true };
    } catch (err) {
      console.error('Delete failed:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Delete failed',
      };
    }
  },
  // Update evidence metadata
  update: async ({ request, locals }) => {
    if (!locals.user?.id) {
      throw redirect(302, '/login');
    }

    const form = await superValidate(request, zod(evidenceUpdateSchema));
    if (!form.valid) {
      return fail(400, { form });
    }

    try {
      const { evidenceId, title, description } = form.data;

      const updated = await db
        .update(evidence)
        .set({
          title,
          description,
          updatedAt: new Date(),
        })
        .where(and(eq(evidence.id, evidenceId), eq(evidence.userId, locals.user.id)))
        .returning();

      return {
        success: true,
        evidence: updated?.[0] ?? null,
      };
    } catch (err) {
      console.error('Update failed:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Update failed',
      };
    }
  },
};
