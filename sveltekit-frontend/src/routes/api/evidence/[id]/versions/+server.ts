import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { evidence, evidenceVersions } from '$lib/server/db/schema-postgres.js';
import { and, eq, desc, sql } from 'drizzle-orm';
import { z } from 'zod';
import { createEvidenceVersion } from '$lib/server/features/evidence/index.js';
import { isUuid } from '$lib/server/validation.js';
import { getAuthorizedCase } from '$lib/server/case-access.js';
import {
  EvidenceRevisionErrorV1,
  MAX_REVISION_IMAGE_BYTES,
  createDrizzleRevisionPortsV1,
  saveEvidenceAnnotationRevisionV1,
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

const annotationRevisionRequestSchema = z.object({
  schema: z.literal('atlas.evidence-annotation-revision-request.v1'),
  caseId: z.string().uuid(),
  parentSha256: z.string().min(1).max(80),
  revisionNotes: z.string().max(4000).optional(),
  annotation: z.unknown().refine((value) => typeof value === 'object' && value !== null && !Array.isArray(value)),
}).strict();

const MAX_ANNOTATION_REQUEST_BYTES = 262_144;

async function readBoundedJson(request: Request): Promise<{ ok: true; value: unknown } | { ok: false; status: 400 | 413; error: string }> {
  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_ANNOTATION_REQUEST_BYTES) {
    return { ok: false, status: 413, error: 'Payload too large' };
  }
  if (!request.body) return { ok: false, status: 400, error: 'Invalid JSON body' };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > MAX_ANNOTATION_REQUEST_BYTES) {
        await reader.cancel();
        return { ok: false, status: 413, error: 'Payload too large' };
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { ok: true, value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown };
  } catch {
    try { await reader.cancel(); } catch { /* stream already closed */ }
    return { ok: false, status: 400, error: 'Invalid JSON body' };
  } finally {
    reader.releaseLock();
  }
}

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

  // content-length is advisory (absent on chunked uploads), so enforce the cap while reading, before formData() buffers it.
  const maxBody = MAX_REVISION_IMAGE_BYTES + 1_048_576;
  let form: FormData;
  try {
    if (!request.body) return json({ ok: false, error: 'Invalid multipart body' }, { status: 400 });
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBody) { await reader.cancel(); return json({ ok: false, error: 'Payload too large' }, { status: 413 }); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    form = await new Response(new Blob(chunks as BlobPart[]), { headers: { 'content-type': request.headers.get('content-type') ?? '' } }).formData();
  } catch { return json({ ok: false, error: 'Invalid multipart body' }, { status: 400 }); }
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
  if (!locals.user) return json({ evidenceId: params.id, versions: [], count: 0, error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'private, no-store' } });

  const { id } = params;
  if (!isUuid(id)) return json({ evidenceId: id, versions: [], count: 0, error: 'Invalid evidence ID format' }, { status: 400, headers: { 'Cache-Control': 'private, no-store' } });

  try {
    const requestedLimit = Number.parseInt(url.searchParams.get('limit') ?? '50', 10);
    const limit = Number.isInteger(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 200) : 50;

    // Match revision-write authorization: owner or authorized case collaborator.
    const actorId = Number(locals.user.id);
    if (!Number.isSafeInteger(actorId) || actorId < 1) return json({ error: 'Unauthorized' }, { status: 401 });
    const [source] = await db
      .select({ id: evidence.id, caseId: evidence.caseId, userId: evidence.userId })
      .from(evidence)
      .where(eq(evidence.id, id))
      .limit(1);
    if (!source) return json({ evidenceId: id, versions: [], count: 0, error: 'Evidence not found' }, { status: 404, headers: { 'Cache-Control': 'private, no-store' } });
    const authorized = source.caseId
      ? Boolean(await getAuthorizedCase(source.caseId, actorId))
      : source.userId === actorId;
    if (!authorized) return json({ evidenceId: id, versions: [], count: 0, error: 'Evidence not found' }, { status: 404, headers: { 'Cache-Control': 'private, no-store' } });

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
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch (err) {
    console.error('[evidence/versions] GET error:', err);
    return json({ evidenceId: id, versions: [], count: 0, error: 'Unable to load revision history' }, { headers: { 'Cache-Control': 'private, no-store' } });
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

  const contentType = (request.headers.get('content-type') ?? '').toLowerCase();
  if (contentType.startsWith('multipart/form-data')) {
    const actorId = Number(locals.user.id);
    if (!Number.isInteger(actorId) || actorId < 1) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    return handleMarkupRevision(id, actorId, request);
  }

  if (contentType.startsWith('application/json')) {
    const parsedBody = await readBoundedJson(request);
    if (parsedBody.ok === false) return json({ ok: false, error: parsedBody.error }, { status: parsedBody.status });
    const raw = parsedBody.value;

    if (typeof raw === 'object' && raw !== null && 'schema' in raw && raw.schema === 'atlas.evidence-annotation-revision-request.v1') {
      const parsed = annotationRevisionRequestSchema.safeParse(raw);
      if (!parsed.success) return json({ ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
      const actorId = Number(locals.user.id);
      if (!Number.isInteger(actorId) || actorId < 1) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });
      if (!(await getAuthorizedCase(parsed.data.caseId, actorId))) return json({ ok: false, error: 'Evidence not found' }, { status: 404 });
      try {
        const receipt = await saveEvidenceAnnotationRevisionV1({
          caseId: parsed.data.caseId,
          evidenceId: id,
          actorUserId: actorId,
          parentSha256: parsed.data.parentSha256,
          annotation: parsed.data.annotation,
          revisionNotes: parsed.data.revisionNotes,
        }, await createDrizzleRevisionPortsV1());
        return json({ ok: true, ...receipt }, { status: receipt.idempotent ? 200 : 201 });
      } catch (err) {
        if (err instanceof EvidenceRevisionErrorV1) return json({ ok: false, code: err.code, error: err.message }, { status: REVISION_ERROR_STATUS[err.code] });
        console.error('[evidence/versions] annotation revision error:', err);
        return json({ ok: false, error: 'Failed to save annotation revision' }, { status: 500 });
      }
    }

    try {
      const [ev] = await db.select({ id: evidence.id }).from(evidence)
        .where(and(eq(evidence.id, id), eq(evidence.userId, Number(locals.user.id)))).limit(1);
      if (!ev) return json({ error: 'Evidence not found' }, { status: 404 });
      const parsed = createVersionSchema.safeParse(raw);
      if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
      await createEvidenceVersion(id, { changedBy: locals.user.id, changeReason: parsed.data.changeReason });
      const [latest] = await db.select({
        id: evidenceVersions.id,
        version: evidenceVersions.version,
        title: evidenceVersions.title,
        description: evidenceVersions.description,
        createdAt: evidenceVersions.createdAt,
      }).from(evidenceVersions).where(eq(evidenceVersions.evidenceId, id)).orderBy(desc(evidenceVersions.version)).limit(1);
      return json({ success: true, version: latest ?? null }, { status: 201 });
    } catch (err) {
      console.error('[evidence/versions] POST error:', err);
      return json({ error: 'Failed to create version' }, { status: 500 });
    }
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
