import { db } from '$lib/server/db/client';
import { personsOfInterest } from '$lib/server/db/schema';
import { error, json } from '@sveltejs/kit';
import { and, desc, eq, arrayContains } from 'drizzle-orm';
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
	relationship: z.string().max(200).optional().default('person_of_interest')
});

/**
 * GET /api/persons
 * Fetch persons of interest with optional filtering
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const id = url.searchParams.get('caseId');
	const threatLevel = url.searchParams.get('threatLevel');
	const limit = Number(url.searchParams.get('limit')) || 20;
	const offset = Number(url.searchParams.get('offset')) || 0;

	try {
        const filters = [];

        if (id) {
            // Check if id is in the caseIds array
            filters.push(arrayContains(personsOfInterest.caseIds, [id]));
        }

        if (threatLevel) {
            // @ts-ignore
            filters.push(eq(personsOfInterest.threatLevel, threatLevel));
        }

        let query = db.select().from(personsOfInterest);

        if (filters.length > 0) {
            // @ts-ignore
            query = query.where(and(...filters));
        }

        const results = await query
			.orderBy(desc(personsOfInterest.createdAt))
			.limit(limit)
			.offset(offset);

		return json({
			success: true,
            data: results,
            pagination: { limit, offset, count: results.length }
		});
	} catch (err) {
		console.error('Error fetching persons of interest:', err);
		throw error(500, 'Failed to fetch persons of interest');
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

	try {
		const raw = await request.json();
		const parsed = personCreateSchema.safeParse(raw);
		if (!parsed.success) {
			throw error(400, parsed.error.issues[0]?.message ?? 'Invalid input');
		}
		const body = parsed.data;
		const id = body.caseId;

		const newPerson = await db.insert(personsOfInterest)
			.values({
				caseIds: [id],
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
				message: 'Person of interest created successfully'
			},
			{ status: 201 }
		);
	} catch (err) {
		console.error('Error creating person of interest:', err);
		throw error(500, 'Failed to create person of interest');
	}
};
