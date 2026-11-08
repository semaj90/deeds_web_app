import { db } from '$lib/server/db/client.js';
import { ENV } from '$lib/server/env.server.js';
import { cases, evidence, analysisJobs, type NewAnalysisJob } from '$lib/server/db/schema-postgres.js';
import {
  ANALYSIS_JOBS_NOTIFY_CHANNEL,
  normalizeAnalysisJobPayload,
} from '$lib/server/analysis/analysis-jobs.js';
import { uploadSeaweedFile as uploadFile, getSeaweedClient as getMinioClient } from '$lib/server/seaweed-client.js';
import { fail, redirect } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms/server';
import { zod4 as zod } from 'sveltekit-superforms/adapters';
import { and, eq, or, desc, sql } from 'drizzle-orm';
import { Buffer } from 'node:buffer';
import { createHash, randomUUID } from 'node:crypto';
import type { Actions, PageServerLoad } from './$types.js';
import { createJob, updateJob } from '$lib/server/evidence-progress.js';
import { isEvidenceVectorOutboxAvailableV1 } from '$lib/server/evidence/evidence-vector-outbox-readiness-v1.js';
import { classifyUploadedBytes } from '$lib/server/ingest/upload-classification-v1.js';
import {
  evidenceUploadSchema,
  evidenceDeleteSchema,
  evidenceUpdateSchema,
  MAX_FILE_SIZE,
  ALLOWED_MIME_TYPES,
} from './schema.js';

const PAGE_SIZE = 50;

/**
 * 1. Canonical Actor Guard: Reject unauthenticated or non-integer user IDs fail-closed.
 */
function requireCanonicalActorId(locals: App.Locals): number {
  const rawId = locals.user?.id;
  const actorId = typeof rawId === 'number' ? rawId : Number(rawId);
  if (!Number.isInteger(actorId) || actorId <= 0) {
    throw new Error('EVIDENCE_ACTOR_UNAUTHORIZED');
  }
  return actorId;
}

/**
 * 2. Server-Side Case ACL Check: Verify the authenticated actor owns the target caseId.
 */
async function assertActorOwnsCase(actorId: number, caseId: string | null | undefined): Promise<void> {
  if (!caseId) return;
  const [matchedCase] = await db
    .select({ id: cases.id })
    .from(cases)
    .where(and(eq(cases.id, caseId), eq(cases.userId, actorId)))
    .limit(1);

  if (!matchedCase) {
    throw new Error('EVIDENCE_CASE_ACCESS_DENIED');
  }
}

export const load: PageServerLoad = async ({ url, locals }) => {
  const caseId = url.searchParams.get('caseId');

  let actorId: number;
  try {
    actorId = requireCanonicalActorId(locals);
  } catch {
    return {
      evidence: [],
      caseId,
      user: null,
      loadError: null,
      form: await superValidate(zod(evidenceUploadSchema)),
    };
  }

  if (caseId) {
    try {
      await assertActorOwnsCase(actorId, caseId);
    } catch {
      return {
        evidence: [],
        caseId,
        user: locals.user,
        loadError: 'EVIDENCE_CASE_ACCESS_DENIED',
        form: await superValidate(zod(evidenceUploadSchema)),
      };
    }
  }

  const safe = <T>(p: Promise<T>, fallback: T, timeoutMs = 5000): Promise<T> =>
    Promise.race([
      p,
      new Promise<T>((resolve) => setTimeout(() => resolve(fallback), timeoutMs)),
    ]).catch(() => fallback);

  let loadError: string | null = null;

  // Match either uploadedBy or userId to support legacy data gracefully
  const conditions = [
    or(
      eq(evidence.uploadedBy, actorId),
      eq(evidence.userId, actorId)
    )
  ];
  if (caseId) conditions.push(eq(evidence.caseId, caseId));

  const evidenceData = await safe(
    db
      .select()
      .from(evidence)
      .where(and(...conditions))
      .orderBy(desc(evidence.createdAt))
      .limit(PAGE_SIZE),
    []
  );

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

export const actions: Actions = {
  // Upload new evidence
  upload: async ({ request, locals }) => {
    let actorId: number;
    try {
      actorId = requireCanonicalActorId(locals);
    } catch {
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
      if (caseId) {
        await assertActorOwnsCase(actorId, caseId);
      }

      if (!(await isEvidenceVectorOutboxAvailableV1())) {
        return fail(503, { form, error: 'EVIDENCE_PROCESSING_SCHEMA_UNAVAILABLE' });
      }

      const jobId = randomUUID();
      createJob(jobId, String(actorId));
      updateJob(jobId, { step: 'uploading', progress: 15, message: `Uploading ${file.name}...` });

      // 1. Classification & Security Preflight (Parent Atlas Gates A & B)
      const buffer = Buffer.from(await file.arrayBuffer());
      const classification = classifyUploadedBytes({
        filename: file.name,
        declaredMime: file.type,
        bytes: buffer,
      });

      if (classification.isQuarantined) {
        return fail(400, {
          form,
          error: `EVIDENCE_SECURITY_QUARANTINE: ${classification.quarantineReason ?? 'Disguised executable or MIME mismatch'}`,
        });
      }

      const sourceRevision = classification.sourceRevision;

      // 2. Upload to SeaweedFS
      const fileExt = file.name.split('.').pop() ?? 'bin';
      const objectName = `evidence/${actorId}/${randomUUID()}.${fileExt}`;

      await uploadFile(ENV.SEAWEED_EVIDENCE_BUCKET, objectName, buffer, {
        'Content-Type': classification.observedMime ?? file.type,
        'Original-Filename': file.name,
      });

      const safeTitle = title || file.name;
      const safeFileName = file.name;

      // 3. Atomic Transaction + No `?? randomUUID()` Fallback
      const insertedRecord = await db.transaction(async (tx) => {
        const evidenceKind = classification.legalEvidenceTypeProposal ?? (
          classification.observedMime?.startsWith('image/') || file.type.startsWith('image/')
            ? 'photo'
            : classification.observedMime?.startsWith('video/') || file.type.startsWith('video/')
              ? 'video'
              : classification.observedMime?.startsWith('audio/') || file.type.startsWith('audio/')
                ? 'audio'
                : 'document'
        );

        const [created] = await tx
          .insert(evidence)
          .values({
            caseId: caseId ?? null,
            userId: actorId,
            uploadedBy: actorId, // Canonical owner column everywhere
            evidenceType: evidenceKind,
            title: safeTitle,
            description: description ?? '',
            fileName: safeFileName,
            fileType: file.type,
            fileSize: file.size,
            fileUrl: objectName,
            hash: sourceRevision,
            status: 'processing_queued',
            metadata: {
              source_revision: sourceRevision,
              observed_mime: classification.observedMime,
              mime_status: classification.mimeStatus,
              taxonomy_group: classification.taxonomyGroup,
            },
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .returning();

        // NEVER fall back to `?? randomUUID()` - fail closed if insert returned no row
        if (!created?.id) {
          throw new Error('EVIDENCE_INSERT_FAILED_NO_ID');
        }

        const jobValues = {
          id: jobId,
          evidenceId: created.id,
          caseId: caseId ?? null,
          jobType: 'upload_pipeline',
          status: 'queued',
          progress: '0',
          result: normalizeAnalysisJobPayload(
            {
              evidenceId: created.id,
              caseId: caseId ?? null,
              objectKey: objectName,
              sourceSha256: sourceRevision,
              fileName: safeFileName,
              contentType: file.type,
              uploadedBy: actorId,
            },
            'upload_pipeline'
          ),
        } satisfies NewAnalysisJob;

        await tx.insert(analysisJobs).values(jobValues);
        await tx.execute(
          sql`SELECT pg_notify(${ANALYSIS_JOBS_NOTIFY_CHANNEL}, ${JSON.stringify({ jobType: 'upload_pipeline' })})`
        );

        return created;
      });

      // 4. Generate signed SeaweedFS preview URL (24-hour expiry)
      let previewUrl = '';
      try {
        const client = getMinioClient();
        previewUrl = await client.presignedGetObject(ENV.SEAWEED_EVIDENCE_BUCKET, objectName, 24 * 60 * 60);
      } catch (err) {
        console.warn('[evidence/upload] Failed to generate preview URL (non-fatal):', err);
      }

      updateJob(jobId, { step: 'storing', progress: 20, message: 'Upload stored; queued for extraction and indexing.' });
      return {
        success: true,
        evidence: insertedRecord,
        jobId,
        previewUrl,
      };
    } catch (err) {
      console.error('Upload failed:', err);
      const message = err instanceof Error ? err.message : 'Upload failed';
      return fail(500, { form, error: message });
    }
  },

  // Delete evidence
  delete: async ({ request, locals }) => {
    let actorId: number;
    try {
      actorId = requireCanonicalActorId(locals);
    } catch {
      throw redirect(302, '/login');
    }

    const form = await superValidate(request, zod(evidenceDeleteSchema));
    if (!form.valid) {
      return fail(400, { form });
    }

    try {
      const { evidenceId } = form.data;

      // 4. Reconcile legacy `userId` -> `uploadedBy` & Require Affected-Row Check
      const deleted = await db
        .delete(evidence)
        .where(
          and(
            eq(evidence.id, evidenceId),
            or(
              eq(evidence.uploadedBy, actorId),
              eq(evidence.userId, actorId)
            )
          )
        )
        .returning({ id: evidence.id });

      if (deleted.length === 0) {
        return fail(404, { form, error: 'EVIDENCE_NOT_FOUND_OR_UNAUTHORIZED' });
      }

      return { success: true };
    } catch (err) {
      console.error('Delete failed:', err);
      return fail(500, { form, error: 'Delete failed' });
    }
  },

  // Update evidence metadata
  update: async ({ request, locals }) => {
    let actorId: number;
    try {
      actorId = requireCanonicalActorId(locals);
    } catch {
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
        .where(
          and(
            eq(evidence.id, evidenceId),
            or(
              eq(evidence.uploadedBy, actorId),
              eq(evidence.userId, actorId)
            )
          )
        )
        .returning();

      if (updated.length === 0) {
        return fail(404, { form, error: 'EVIDENCE_NOT_FOUND_OR_UNAUTHORIZED' });
      }

      return {
        success: true,
        evidence: updated[0] ?? null,
      };
    } catch (err) {
      console.error('Update failed:', err);
      return fail(500, { form, error: 'Update failed' });
    }
  },
};
