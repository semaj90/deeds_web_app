import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { evidence, evidenceVersions } from '$lib/server/db/schema-postgres.js';
import { and, eq, desc, sql } from 'drizzle-orm';
import { z } from 'zod';
import { createEvidenceVersion } from '$lib/server/audit/evidence-audit.js';
import { isUuid } from '$lib/server/validation.js';
import { cacheControl } from '$lib/server/middleware/cache-headers.js';

const createVersionSchema = z.object({
  changeReason: z.string().max(1000).optional(),
});

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
