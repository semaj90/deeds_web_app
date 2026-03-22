import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { evidence } from '$lib/server/db/schema-postgres.js';
import { eq, and, desc } from 'drizzle-orm';
import { z } from 'zod';

const evidenceDeleteSchema = z.object({
  evidenceId: z.string().uuid(),
  hard: z.boolean().optional(),
});

/**
 * GET /api/cases/[id]/evidence
 * List all evidence items linked to a specific case
 */
export const GET: RequestHandler = async ({ params }) => {
  const caseId = params.id;

  try {
    const items = await db
      .select({
        id: evidence.id,
        caseId: evidence.caseId,
        title: evidence.title,
        description: evidence.description,
        type: evidence.type,
        evidenceType: evidence.evidenceType,
        fileName: evidence.fileName,
        fileType: evidence.fileType,
        fileSize: evidence.fileSize,
        mimeType: evidence.mimeType,
        fileUrl: evidence.fileUrl,
        evidenceNumber: evidence.evidenceNumber,
        source: evidence.source,
        summary: evidence.summary,
        tags: evidence.tags,
        aiTags: evidence.aiTags,
        collectedAt: evidence.collectedAt,
        collectedBy: evidence.collectedBy,
        createdAt: evidence.createdAt,
        updatedAt: evidence.updatedAt,
      })
      .from(evidence)
      .where(eq(evidence.caseId, caseId))
      .orderBy(desc(evidence.createdAt));

    const total = items.length;

    return json({ evidence: items, total });
  } catch (err) {
    console.error(`[cases/${caseId}/evidence] GET error:`, err);
    return json({ evidence: [], total: 0 });
  }
};

/**
 * DELETE /api/cases/[id]/evidence
 * Remove an evidence item from a case (soft: unlinks, hard: deletes row).
 * Body: { evidenceId: string, hard?: boolean }
 * Evidence upload goes through /api/evidence/upload (full 9-stage pipeline).
 */
export const DELETE: RequestHandler = async ({ params, request, locals }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

  const caseId = params.id;
  const raw = await request.json().catch(() => ({}));
  const parsed = evidenceDeleteSchema.safeParse(raw);
  if (!parsed.success)
    return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  const { evidenceId, hard } = parsed.data;

  if (hard) {
    await db.delete(evidence).where(and(eq(evidence.id, evidenceId), eq(evidence.caseId, caseId)));
  } else {
    // Soft unlink: set caseId to null
    await db
      .update(evidence)
      .set({ caseId: null })
      .where(and(eq(evidence.id, evidenceId), eq(evidence.caseId, caseId)));
  }

  return json({ success: true });
};
