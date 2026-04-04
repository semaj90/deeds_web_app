import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { personsOfInterest, poiPhotos, timelineEvents } from '$lib/server/db/schema-postgres.js';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

const poiIdSchema = z.string().uuid('Invalid person of interest id');

const updatePoiSchema = z.object({
  name: z.string().trim().min(1).max(500).optional(),
  description: z.string().max(5000).optional(),
  aliases: z.array(z.string()).optional(),
  threatLevel: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  status: z.enum(['surveillance', 'wanted', 'active', 'cleared']).optional(),
  relationship: z.string().max(500).optional(),
  crimes: z.array(z.string()).optional(),
  caseIds: z.array(z.string()).optional(),
});

/**
 * GET /api/persons-of-interest/[id]
 * Retrieve a single person of interest by ID
 */
export const GET: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
  const parsedId = poiIdSchema.safeParse(params.id);
  if (!parsedId.success) {
    return json(
      { error: parsedId.error.issues[0]?.message ?? 'Invalid person of interest id' },
      { status: 400 }
    );
  }

  try {
    const [poi] = await db
      .select()
      .from(personsOfInterest)
      .where(
        and(
          eq(personsOfInterest.id, parsedId.data),
          eq(personsOfInterest.createdBy, locals.user.id)
        )
      )
      .limit(1);

    if (!poi) {
      return json({ error: 'Person of interest not found' }, { status: 404 });
    }

    return json({
      ...poi,
      caseId: poi.caseIds?.[0] ?? null,
      createdAt: poi.createdAt?.toISOString() ?? '',
      updatedAt: poi.updatedAt?.toISOString() ?? '',
    });
  } catch (err) {
    console.error('[poi] GET error:', err);
    return json({
      id: parsedId.data,
      name: '',
      aliases: [],
      description: '',
      threatLevel: 'low',
      status: 'surveillance',
      relationship: null,
      aiProfile: null,
      who: null,
      what: null,
      why: null,
      how: null,
      risk: null,
      confidence: null,
      modelVersion: null,
      generatedAt: null,
      lastUpdated: null,
      crimes: [],
      caseIds: [],
      caseId: null,
      profileData: {},
      tags: [],
      position: {},
      photoUrl: null,
      notes: null,
      metadata: {},
      createdBy: null,
      createdAt: '',
      updatedAt: '',
      error: 'Failed to fetch person of interest',
    });
  }
};

/**
 * PATCH /api/persons-of-interest/[id]
 * Update a person of interest
 */
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
  const parsedId = poiIdSchema.safeParse(params.id);
  if (!parsedId.success) {
    return json(
      { error: parsedId.error.issues[0]?.message ?? 'Invalid person of interest id' },
      { status: 400 }
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const parsed = updatePoiSchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    const data = parsed.data;
    if (data.name !== undefined) updates.name = data.name;
    if (data.description !== undefined) updates.description = data.description;
    if (data.aliases !== undefined) updates.aliases = data.aliases;
    if (data.threatLevel !== undefined) updates.threatLevel = data.threatLevel;
    if (data.status !== undefined) updates.status = data.status;
    if (data.relationship !== undefined) updates.relationship = data.relationship;
    if (data.crimes !== undefined) updates.crimes = data.crimes;
    if (data.caseIds !== undefined) updates.caseIds = data.caseIds;
    updates.updatedAt = sql`now()`;

    const [updated] = await db
      .update(personsOfInterest)
      .set(updates)
      .where(
        and(
          eq(personsOfInterest.id, parsedId.data),
          eq(personsOfInterest.createdBy, locals.user.id)
        )
      )
      .returning();

    if (!updated) {
      return json({ error: 'Person of interest not found' }, { status: 404 });
    }

    return json({
      ...updated,
      createdAt: updated.createdAt?.toISOString() ?? '',
      updatedAt: updated.updatedAt?.toISOString() ?? '',
    });
  } catch (err) {
    console.error('[poi] PATCH error:', err);
    return json({ error: 'Failed to update person of interest' }, { status: 500 });
  }
};

/**
 * DELETE /api/persons-of-interest/[id]
 * Delete a person of interest and their photos (cascade)
 */
export const DELETE: RequestHandler = async ({ params, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
  const parsedId = poiIdSchema.safeParse(params.id);
  if (!parsedId.success) {
    return json(
      { error: parsedId.error.issues[0]?.message ?? 'Invalid person of interest id' },
      { status: 400 }
    );
  }

  try {
    const [poi] = await db
      .select({ id: personsOfInterest.id })
      .from(personsOfInterest)
      .where(
        and(
          eq(personsOfInterest.id, parsedId.data),
          eq(personsOfInterest.createdBy, locals.user.id)
        )
      )
      .limit(1);

    if (!poi) {
      return json({ error: 'Person of interest not found' }, { status: 404 });
    }

    // Delete related records first (FK CASCADE handles this too, but be explicit)
    await db.delete(timelineEvents).where(eq(timelineEvents.poiId, parsedId.data));
    await db.delete(poiPhotos).where(eq(poiPhotos.poiId, parsedId.data));

    const [deleted] = await db
      .delete(personsOfInterest)
      .where(
        and(
          eq(personsOfInterest.id, parsedId.data),
          eq(personsOfInterest.createdBy, locals.user.id)
        )
      )
      .returning({ id: personsOfInterest.id, name: personsOfInterest.name });

    if (!deleted) {
      return json({ error: 'Person of interest not found' }, { status: 404 });
    }

    return json({ success: true, deleted });
  } catch (err) {
    console.error('[poi] DELETE error:', err);
    return json({ error: 'Failed to delete person of interest' }, { status: 500 });
  }
};
