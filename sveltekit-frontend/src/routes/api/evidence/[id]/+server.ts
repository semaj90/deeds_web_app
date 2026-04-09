import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { cases, evidence } from '$lib/server/db/schema-postgres.js';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { isUuid } from '$lib/server/validation.js';

function parseMetadata(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

const updateEvidenceSchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  description: z.string().max(5000).optional(),
  type: z.string().max(100).optional(),
  evidenceNumber: z.string().max(50).optional(),
  source: z.string().max(255).optional(),
  summary: z.string().max(10000).optional(),
  tags: z.array(z.string()).optional(),
  caseId: z.string().uuid().nullable().optional(),
});

/**
 * GET /api/evidence/[id]
 * Retrieve a single evidence item by ID
 */
export const GET: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
  if (!isUuid(params.id)) return json({ error: 'Invalid ID format' }, { status: 400 });

  try {
    const [item] = await db
      .select()
      .from(evidence)
      .where(and(eq(evidence.id, params.id), eq(evidence.userId, locals.user.id)))
      .limit(1);

    if (!item) {
      return json({ error: 'Evidence not found' }, { status: 404 });
    }

    return json({
      ...item,
      metadata: parseMetadata(item.metadata),
    });
  } catch (err) {
    console.error('[evidence] GET error:', err);
    // Degraded response contract: return 200 with same shape, empty defaults
    return json({
      id: params.id,
      caseId: null,
      userId: null,
      title: '',
      description: null,
      fileType: null,
      fileSize: null,
      fileUrl: null,
      fileName: null,
      metadata: null,
      createdAt: null,
      updatedAt: null,
      evidenceType: null,
      evidenceNumber: null,
      type: null,
      summary: null,
      tags: [],
      aiTags: [],
      status: 'pending',
      _degraded: true,
    });
  }
};

/**
 * PATCH /api/evidence/[id]
 * Update evidence metadata
 */
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json().catch(() => ({}));
    const parsed = updateEvidenceSchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    const data = parsed.data;
    if (data.title !== undefined) updates.title = data.title;
    if (data.description !== undefined) updates.description = data.description;
    if (data.type !== undefined) updates.type = data.type;
    if (data.evidenceNumber !== undefined) updates.evidenceNumber = data.evidenceNumber;
    if (data.source !== undefined) updates.source = data.source;
    if (data.summary !== undefined) updates.summary = data.summary;
    if (data.tags !== undefined) updates.tags = data.tags;
    if (data.caseId !== undefined) {
      if (data.caseId === null) {
        updates.caseId = null;
      } else {
        const [linkedCase] = await db
          .select({ id: cases.id })
          .from(cases)
          .where(and(eq(cases.id, data.caseId), eq(cases.userId, locals.user.id)))
          .limit(1);

        if (!linkedCase) {
          return json({ error: 'Case not found' }, { status: 404 });
        }

        updates.caseId = data.caseId;
      }
    }

    if (Object.keys(updates).length === 0) {
      return json({ error: 'No updates provided' }, { status: 400 });
    }

    updates.updatedAt = sql`now()`;

    const [updated] = await db
      .update(evidence)
      .set(updates)
      .where(and(eq(evidence.id, params.id), eq(evidence.userId, locals.user.id)))
      .returning();

    if (!updated) {
      return json({ error: 'Evidence not found' }, { status: 404 });
    }

    // Sync parent case to Neo4j graph (non-blocking)
    const syncCaseId = (updated as Record<string, unknown>).caseId as string | null;
    if (syncCaseId) {
      import('$lib/server/graph/pg-neo4j-sync.js')
        .then(({ syncCaseToGraph }) =>
          syncCaseToGraph(syncCaseId).catch((err) =>
            console.warn('[neo4j-sync] evidence update:', err)
          )
        )
        .catch((e) => console.warn('[evidence] neo4j sync import failed:', e));
    }

    return json(updated);
  } catch (err) {
    console.error('[evidence] PATCH error:', err);
    return json({ error: 'Failed to update evidence' }, { status: 500 });
  }
};

/**
 * DELETE /api/evidence/[id]
 * Delete an evidence item
 */
export const DELETE: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const [deleted] = await db
      .delete(evidence)
      .where(and(eq(evidence.id, params.id), eq(evidence.userId, locals.user.id)))
      .returning({ id: evidence.id, title: evidence.title, caseId: evidence.caseId });

    if (!deleted) {
      return json({ error: 'Evidence not found' }, { status: 404 });
    }

    // Sync parent case to Neo4j graph (non-blocking)
    if (deleted.caseId) {
      import('$lib/server/graph/pg-neo4j-sync.js')
        .then(({ syncCaseToGraph }) =>
          syncCaseToGraph(deleted.caseId!).catch((err) =>
            console.warn('[neo4j-sync] evidence delete:', err)
          )
        )
        .catch((e) => console.warn('[evidence] neo4j sync import failed:', e));
    }

    return json({ success: true, deleted });
  } catch (err) {
    console.error('[evidence] DELETE error:', err);
    return json({ error: 'Failed to delete evidence' }, { status: 500 });
  }
};
