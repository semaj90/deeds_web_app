import { db } from '$lib/server/db/client';
import { cases, personsOfInterest } from '$lib/server/db/schema-postgres.js';
import { error, json } from '@sveltejs/kit';
import { and, desc, eq, or, isNull, arrayContains, type SQL } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { z } from 'zod';

const THREAT_LEVELS = ['low', 'medium', 'high', 'critical'] as const;
const POI_STATUSES = ['surveillance', 'wanted', 'active', 'cleared'] as const;

const personCreateSchema = z.object({
  caseId: z.string().uuid('Invalid caseId'),
  name: z.string().min(1, 'Name is required').max(500),
  aliases: z.array(z.string().max(200)).max(50).optional().default([]),
  description: z.string().max(10000).optional().default(''),
  threatLevel: z.enum(THREAT_LEVELS).optional().default('low'),
  status: z.enum(POI_STATUSES).optional().default('active'),
  relationship: z.string().max(200).optional().default('person_of_interest'),
});

const personListSchema = z.object({
  caseId: z.string().max(100).nullish(),
  threatLevel: z.enum(THREAT_LEVELS).nullish(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * GET /api/persons
 * Fetch persons of interest with optional filtering
 */
export const GET: RequestHandler = async ({ locals, url }) => {
  if (!locals.user) {
    return json({ success: false, data: [], pagination: { limit: 20, offset: 0, count: 0 } });
  }

  const parsed = personListSchema.safeParse({
    caseId: url.searchParams.get('caseId'),
    threatLevel: url.searchParams.get('threatLevel'),
    limit: url.searchParams.get('limit') ?? undefined,
    offset: url.searchParams.get('offset') ?? undefined,
  });
  if (!parsed.success)
    return json({ error: parsed.error.issues[0]?.message ?? 'Invalid query' }, { status: 400 });
  const { caseId: id, threatLevel, limit, offset } = parsed.data;

  try {
    const filters: SQL[] = [];
    filters.push(or(eq(personsOfInterest.createdBy, locals.user.id), isNull(personsOfInterest.createdBy))!);

    if (id) {
      // Check if id is in the caseIds array
      filters.push(arrayContains(personsOfInterest.caseIds, [id]));
    }

    if (threatLevel) {
      filters.push(eq(personsOfInterest.threatLevel, threatLevel));
    }

    let query = db.select().from(personsOfInterest).$dynamic();

    if (filters.length > 0) {
      query = query.where(and(...filters));
    }

    const results = await query
      .orderBy(desc(personsOfInterest.createdAt))
      .limit(limit)
      .offset(offset);

    return json({
      success: true,
      data: results,
      pagination: { limit, offset, count: results.length },
    });
  } catch (err) {
    console.error('Error fetching persons of interest:', err);
    return json({
      success: false,
      data: [],
      pagination: { limit: 20, offset: 0, count: 0 },
    });
  }
};

/**
 * POST /api/persons
 * Create a new person of interest
 */
export const POST: RequestHandler = async ({ locals, request }) => {
  if (!locals.user) {
    throw error(401, 'Unauthorized');
  }

  const raw = await request.json();
  const parsed = personCreateSchema.safeParse(raw);
  if (!parsed.success) {
    throw error(400, parsed.error.issues[0]?.message ?? 'Invalid input');
  }
  const body = parsed.data;
  const id = body.caseId;

  const [targetCase] = await db
    .select({ id: cases.id })
    .from(cases)
    .where(and(eq(cases.id, id), eq(cases.userId, locals.user.id)))
    .limit(1);

  if (!targetCase) {
    throw error(404, 'Case not found');
  }

  try {
    const newPerson = await db
      .insert(personsOfInterest)
      .values({
        caseIds: [id],
        createdBy: locals.user.id,
        name: body.name,
        aliases: body.aliases,
        description: body.description ?? '',
        threatLevel: body.threatLevel,
        status: body.status ?? 'surveillance',
        relationship: body.relationship,
      })
      .returning();

    return json(
      {
        success: true,
        data: newPerson[0],
        message: 'Person of interest created successfully',
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('Error creating person of interest:', err);
    throw error(500, 'Failed to create person of interest');
  }
};
