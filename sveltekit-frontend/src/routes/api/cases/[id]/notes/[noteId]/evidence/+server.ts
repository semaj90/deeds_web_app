import { db } from '$lib/server/db/client';
import {
  caseNoteEvidenceRefs,
  caseNotes,
  cases,
  evidence,
} from '$lib/server/db/schema-postgres.js';
import { json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { validateUuidParams } from '$lib/server/validation.js';
import { cacheControl } from '$lib/server/middleware/cache-headers.js';

// Zod schema validates evidenceId for POST and DELETE
const noteEvidenceSchema = z.object({
  evidenceId: z.string().min(1, 'evidenceId required').max(500),
});

/**
 * GET /api/cases/[id]/notes/[noteId]/evidence
 * List all evidence items linked to a note
 */
export const GET: RequestHandler = async ({ params, locals }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
  const invalid = validateUuidParams(params, 'id', 'noteId');
  if (invalid) return invalid;

  try {
    const [targetCase] = await db
      .select({ id: cases.id })
      .from(cases)
      .where(and(eq(cases.id, params.id), eq(cases.userId, Number(locals.user.id))))
      .limit(1);

    if (!targetCase) {
      return json({ success: true, refs: [] });
    }

    const refs = await db
      .select({
        id: caseNoteEvidenceRefs.id,
        evidenceId: caseNoteEvidenceRefs.evidenceId,
        createdAt: caseNoteEvidenceRefs.createdAt,
        evidenceTitle: evidence.title,
        evidenceType: evidence.evidenceType,
      })
      .from(caseNoteEvidenceRefs)
      .innerJoin(evidence, eq(caseNoteEvidenceRefs.evidenceId, evidence.id))
      .where(eq(caseNoteEvidenceRefs.noteId, params.noteId));

    return json({ success: true, refs }, { headers: cacheControl.medium });
  } catch (err) {
    console.error('[note-evidence] GET error:', err);
    return json({ success: true, refs: [] }, { headers: cacheControl.medium });
  }
};

/**
 * POST /api/cases/[id]/notes/[noteId]/evidence
 * Link an evidence item to a note
 * Body: { evidenceId: string }
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
  const invalid = validateUuidParams(params, 'id', 'noteId');
  if (invalid) return invalid;

  try {
    const [targetCase] = await db
      .select({ id: cases.id })
      .from(cases)
      .where(and(eq(cases.id, params.id), eq(cases.userId, Number(locals.user.id))))
      .limit(1);

    if (!targetCase) {
      return json({ error: 'Case not found' }, { status: 404 });
    }

    const parsed = noteEvidenceSchema.safeParse(await request.json());
    if (!parsed.success) {
      return json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
    }
    const { evidenceId } = parsed.data;

    // Verify note belongs to this case
    const [note] = await db
      .select({ id: caseNotes.id })
      .from(caseNotes)
      .where(and(eq(caseNotes.id, params.noteId), eq(caseNotes.caseId, params.id)))
      .limit(1);

    if (!note) {
      return json({ error: 'Note not found' }, { status: 404 });
    }

    // Verify evidence exists
    const [ev] = await db
      .select({ id: evidence.id })
      .from(evidence)
      .where(
        and(
          eq(evidence.id, evidenceId),
          eq(evidence.caseId, params.id),
          eq(evidence.userId, locals.user.id)
        )
      )
      .limit(1);

    if (!ev) {
      return json({ error: 'Evidence not found' }, { status: 404 });
    }

    const [ref] = await db
      .insert(caseNoteEvidenceRefs)
      .values({ noteId: params.noteId, evidenceId })
      .onConflictDoNothing()
      .returning();

    if (!ref) {
      return json({ success: true, message: 'Already linked' });
    }

    return json({ success: true, ref }, { status: 201 });
  } catch (err) {
    console.error('[note-evidence] POST error:', err);
    return json({ error: 'Failed to link evidence' }, { status: 500 });
  }
};

/**
 * DELETE /api/cases/[id]/notes/[noteId]/evidence
 * Unlink an evidence item from a note
 * Body: { evidenceId: string }
 */
export const DELETE: RequestHandler = async ({ params, request, locals }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
  const invalid = validateUuidParams(params, 'id', 'noteId');
  if (invalid) return invalid;

  try {
    const [targetCase] = await db
      .select({ id: cases.id })
      .from(cases)
      .where(and(eq(cases.id, params.id), eq(cases.userId, Number(locals.user.id))))
      .limit(1);

    if (!targetCase) {
      return json({ error: 'Case not found' }, { status: 404 });
    }

    const delParsed = noteEvidenceSchema.safeParse(await request.json());
    if (!delParsed.success) {
      return json(
        { error: delParsed.error.issues[0]?.message ?? 'Invalid request' },
        { status: 400 }
      );
    }
    const { evidenceId } = delParsed.data;

    const [deleted] = await db
      .delete(caseNoteEvidenceRefs)
      .where(
        and(
          eq(caseNoteEvidenceRefs.noteId, params.noteId),
          eq(caseNoteEvidenceRefs.evidenceId, evidenceId)
        )
      )
      .returning();

    if (!deleted) {
      return json({ error: 'Link not found' }, { status: 404 });
    }

    return json({ success: true });
  } catch (err) {
    console.error('[note-evidence] DELETE error:', err);
    return json({ error: 'Failed to unlink evidence' }, { status: 500 });
  }
};