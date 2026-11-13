import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { evidence, evidenceVersions } from '$lib/server/db/schema-postgres.js';
import { and, eq, desc, sql } from 'drizzle-orm';
import { z } from 'zod';
import { createEvidenceVersion } from '$lib/server/features/evidence/index.js';
import { isUuid } from '$lib/server/validation.js';
import { cacheControl } from '$lib/server/middleware/cache-headers.js';
import { getAuthorizedCase } from '$lib/server/case-access.js';
import {
  EvidenceRevisionErrorV1,
  MAX_REVISION_IMAGE_BYTES,
  createDrizzleRevisionPortsV1,
  saveEvidenceMarkupRevisionV1,
} from '$lib/server/features/evidence/evidence-revision-v1.js';

const createVersionSchema = z.object({
  changeReason: z.string().max(1000).optional(),
});

const markupRevisionFormSchema = z.object({
  caseId: z.string().uuid(),
  parentSha256: z.string().min(1),
  revisionNotes: z.string().max(4000).optional(),
  markupJson: z.string().min(2).max(200_000),
  flattenedImage: z.instanceof(File),
});

const REVISION_ERROR_STATUS: Record<EvidenceRevisionErrorV1['code'], number> = {
  INVALID_MARKUP: 400,
  INVALID_PARENT_SHA256: 400,
  IMAGE_EMPTY: 400,
  IMAGE_TOO_LARGE: 413,
  IMAGE_TYPE_UNSUPPORTED: 400,
  IMAGE_TYPE_MISMATCH: 400,
  EVIDENCE_NOT_FOUND: 404,
  EVIDENCE_CASE_MISMATCH: 404,
  PARENT_HASH_UNAVAILABLE: 422,
  PARENT_HASH_MISMATCH: 409,
};

/**
 * Multipart branch: commit a flattened marked-up image as a derived revision (see evidence-revision-v1.ts).
 * Authorizes by case access, not evidence.userId. `committed` here does NOT mean indexed.
 */
async function handleMarkupRevision(evidenceId: string, userId: number, request: Request) {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_REVISION_IMAGE_BYTES + 1_048_576) return json({ ok: false, error: 'Payload too large' }, { status: 413 });

  let form: FormData;
  try { form = await request.formData(); } catch { return json({ ok: false, error: 'Invalid multipart body' }, { status: 400 }); }
  const parsed = markupRevisionFormSchema.safeParse({
    caseId: form.get('caseId'),
    parentSha256: form.get('parentSha256'),
    revisionNotes: form.get('revisionNotes') ?? undefined,
    markupJson: form.get('markupJson'),
    flattenedImage: form.get('flattenedImage'),
  });
  if (!parsed.success) return json({ ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });

  let markup: unknown;
  try { markup = JSON.parse(parsed.data.markupJson); } catch { return json({ ok: false, error: 'markupJson is not valid JSON' }, { status: 400 }); }

  if (!(await getAuthorizedCase(parsed.data.caseId, userId))) return json({ ok: false, error: 'Evidence not found' }, { status: 404 });

  try {
    const receipt = await saveEvidenceMarkupRevisionV1(
      {
        caseId: parsed.data.caseId,
        evidenceId,
        actorUserId: userId,
        parentSha256: parsed.data.parentSha256,
        declaredMimeType: parsed.data.flattenedImage.type || undefined,
        bytes: new Uint8Array(await parsed.data.flattenedImage.arrayBuffer()),
        markup,
        revisionNotes: parsed.data.revisionNotes,
      },
      await createDrizzleRevisionPortsV1(),
    );
    return json({ ok: true, ...receipt }, { status: receipt.idempotent ? 200 : 201 });
  } catch (err) {
    if (err instanceof EvidenceRevisionErrorV1) return json({ ok: false, code: err.code, error: err.message }, { status: REVISION_ERROR_STATUS[err.code] });
    console.error('[evidence/versions] markup revision error:', err);
    return json({ ok: false, error: 'Failed to save revision' }, { status: 500 });
  }
}

/**
 * GET /api/evidence/[id]/versions
 * Return version history for an evidence item.
 */
export const GET: RequestHandler = async ({ params, locals, url }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = params;
  if (!isUuid(id)) return json({ error: 'Invalid evidence ID format' }, { status: 400 });

  try {
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50'), 200);

    // Verify evidence exists and belongs to user
    const [ev] = await db
      .select({ id: evidence.id })
      .from(evidence)
      .where(and(eq(evidence.id, id), eq(evidence.userId, Number(locals.user.id))))
      .limit(1);

    if (!ev) {
      return json({ error: 'Evidence not found' }, { status: 404 });
    }

    const versions = await db
      .select({
        id: evidenceVersions.id,
        version: evidenceVersions.version,
        title: evidenceVersions.title,
        description: evidenceVersions.description,
        metadata: evidenceVersions.metadata,
        changedBy: evidenceVersions.changedBy,
        changeReason: evidenceVersions.changeReason,
        createdAt: evidenceVersions.createdAt,
        userName: sql<string>`(SELECT name FROM users WHERE id = ${evidenceVersions.changedBy})`,
      })
      .from(evidenceVersions)
      .where(eq(evidenceVersions.evidenceId, id))
      .orderBy(desc(evidenceVersions.version))
      .limit(limit);

    return json(
      {
        evidenceId: id,
        versions,
        count: versions.length,
      },
      { headers: cacheControl.short }
    );
  } catch (err) {
    console.error('[evidence/versions] GET error:', err);
    return json({ evidenceId: id, versions: [], count: 0 }, { headers: cacheControl.short });
  }
};

/**
 * POST /api/evidence/[id]/versions
 * Create a version snapshot of the current evidence state.
 */
export const POST: RequestHandler = async ({ params, locals, request }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = params;
  if (!isUuid(id)) return json({ error: 'Invalid evidence ID format' }, { status: 400 });

  if ((request.headers.get('content-type') ?? '').toLowerCase().startsWith('multipart/form-data')) {
    const actorId = Number(locals.user.id);
    if (!Number.isInteger(actorId) || actorId < 1) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    return handleMarkupRevision(id, actorId, request);
  }

  try {
    // Verify evidence exists and belongs to user
    const [ev] = await db
      .select({ id: evidence.id })
      .from(evidence)
      .where(and(eq(evidence.id, id), eq(evidence.userId, Number(locals.user.id))))
      .limit(1);

    if (!ev) {
      return json({ error: 'Evidence not found' }, { status: 404 });
    }

    const raw = await request.json();
    const parsed = createVersionSchema.safeParse(raw);
    if (!parsed.success) {
      return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
    }

    await createEvidenceVersion(id, {
      changedBy: locals.user.id,
      changeReason: parsed.data.changeReason,
    });

    // Return the newly created version
    const [latest] = await db
      .select({
        id: evidenceVersions.id,
        version: evidenceVersions.version,
        title: evidenceVersions.title,
        description: evidenceVersions.description,
        createdAt: evidenceVersions.createdAt,
      })
      .from(evidenceVersions)
      .where(eq(evidenceVersions.evidenceId, id))
      .orderBy(desc(evidenceVersions.version))
      .limit(1);

    return json({ success: true, version: latest ?? null }, { status: 201 });
  } catch (err) {
    console.error('[evidence/versions] POST error:', err);
    return json({ error: 'Failed to create version' }, { status: 500 });
  }
};
