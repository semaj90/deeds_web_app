import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db/client';
import { cases, evidenceBoardConnections } from '$lib/server/db/schema-postgres.js';
import { eq, and } from 'drizzle-orm';
import type { RequestHandler } from './$types.js';
import { z } from 'zod';
import { cacheControl, checkETag, notModified } from '$lib/server/middleware/cache-headers.js';

const connectionCreateSchema = z.object({
  fromEvidenceId: z.string().uuid('Invalid fromEvidenceId'),
  toEvidenceId: z.string().uuid('Invalid toEvidenceId'),
  connectionType: z.string().max(100).optional(),
  label: z.string().max(500).optional(),
  notes: z.string().max(5000).optional(),
  strength: z.number().min(0).max(1).optional(),
});

const connectionUpdateSchema = z.object({
  connectionId: z.string().uuid('connectionId is required'),
  label: z.string().max(500).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  strength: z.number().min(0).max(1).optional(),
  connectionType: z.string().max(100).optional(),
  isVisible: z.boolean().optional(),
});

const connectionDeleteSchema = z.object({
  connectionId: z.string().uuid('connectionId is required'),
});

/**
 * GET /api/cases/[id]/connections
 * Load all evidence board connections for a case
 */
export const GET: RequestHandler = async ({ params, locals, request }) => {
  if (!locals.user) throw error(401, 'Unauthorized');

  const [targetCase] = await db
    .select({ id: cases.id })
    .from(cases)
    .where(and(eq(cases.id, params.id), eq(cases.userId, locals.user.id)))
    .limit(1);

  if (!targetCase) throw error(404, 'Case not found');

  const connections = await db
    .select()
    .from(evidenceBoardConnections)
    .where(eq(evidenceBoardConnections.caseId, params.id));

  const responseData = { connections };
  const { etag, isMatch } = checkETag(responseData, request.headers);
  if (isMatch) return notModified(etag);
  return json(responseData, { headers: { ...cacheControl.private, ETag: etag } });
};

/**
 * POST /api/cases/[id]/connections
 * Create a new evidence board connection
 */
export const POST: RequestHandler = async ({ params, locals, request }) => {
  if (!locals.user) throw error(401, 'Unauthorized');

  const [targetCase] = await db
    .select({ id: cases.id })
    .from(cases)
    .where(and(eq(cases.id, params.id), eq(cases.userId, locals.user.id)))
    .limit(1);

  if (!targetCase) throw error(404, 'Case not found');

  const raw = await request.json();
  const parsed = connectionCreateSchema.safeParse(raw);
  if (!parsed.success) {
    throw error(400, parsed.error.issues[0]?.message ?? 'Invalid input');
  }
  const { fromEvidenceId, toEvidenceId, connectionType, label, notes, strength } = parsed.data;

  const [connection] = await db
    .insert(evidenceBoardConnections)
    .values({
      caseId: params.id,
      fromEvidenceId,
      toEvidenceId,
      connectionType: connectionType ?? 'related',
      label: label ?? null,
      notes: notes ?? null,
      strength: strength ?? 1.0,
      createdBy: locals.user.id,
    })
    .returning();

  return json({ connection }, { status: 201 });
};

/**
 * PATCH /api/cases/[id]/connections
 * Update an existing evidence board connection
 */
export const PATCH: RequestHandler = async ({ params, locals, request }) => {
  if (!locals.user) throw error(401, 'Unauthorized');

  const [targetCase] = await db
    .select({ id: cases.id })
    .from(cases)
    .where(and(eq(cases.id, params.id), eq(cases.userId, locals.user.id)))
    .limit(1);

  if (!targetCase) throw error(404, 'Case not found');

  const raw = await request.json();
  const parsed = connectionUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    throw error(400, parsed.error.issues[0]?.message ?? 'Invalid input');
  }
  const { connectionId, label, notes, strength, connectionType, isVisible } = parsed.data;

  const updates: Record<string, unknown> = {};
  if (label !== undefined) updates.label = label;
  if (notes !== undefined) updates.notes = notes;
  if (strength !== undefined) updates.strength = strength;
  if (connectionType !== undefined) updates.connectionType = connectionType;
  if (isVisible !== undefined) updates.isVisible = isVisible;

  if (Object.keys(updates).length === 0) {
    throw error(400, 'No fields to update');
  }

  const [updated] = await db
    .update(evidenceBoardConnections)
    .set({ ...updates, updatedAt: new Date() })
    .where(
      and(
        eq(evidenceBoardConnections.id, connectionId),
        eq(evidenceBoardConnections.caseId, params.id)
      )
    )
    .returning();

  if (!updated) throw error(404, 'Connection not found');

  return json({ connection: updated });
};

/**
 * DELETE /api/cases/[id]/connections
 * Delete an evidence board connection
 */
export const DELETE: RequestHandler = async ({ params, locals, request }) => {
  if (!locals.user) throw error(401, 'Unauthorized');

  const [targetCase] = await db
    .select({ id: cases.id })
    .from(cases)
    .where(and(eq(cases.id, params.id), eq(cases.userId, locals.user.id)))
    .limit(1);

  if (!targetCase) throw error(404, 'Case not found');

  const raw = await request.json();
  const parsed = connectionDeleteSchema.safeParse(raw);
  if (!parsed.success) {
    throw error(400, parsed.error.issues[0]?.message ?? 'Invalid input');
  }
  const { connectionId } = parsed.data;

  const [deleted] = await db
    .delete(evidenceBoardConnections)
    .where(
      and(
        eq(evidenceBoardConnections.id, connectionId),
        eq(evidenceBoardConnections.caseId, params.id)
      )
    )
    .returning();

  if (!deleted) throw error(404, 'Connection not found');

  return json({ success: true });
};
