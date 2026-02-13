import { db } from '$lib/server/db/client';
import { personsOfInterest } from '$lib/db/schema';
import { error, json } from '@sveltejs/kit';
import { and, desc, eq, arrayContains } from 'drizzle-orm';
import type { RequestHandler } from './$types';

/**
 * GET /api/persons
 * Fetch persons of interest with optional filtering
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const caseId = url.searchParams.get('caseId');
	const threatLevel = url.searchParams.get('threatLevel');
	const limit = Number(url.searchParams.get('limit')) || 20;
	const offset = Number(url.searchParams.get('offset')) || 0;

	try {
        const filters = [];

        if (caseId) {
            // Check if caseId is in the caseIds array
            filters.push(arrayContains(personsOfInterest.caseIds, [caseId]));
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
		const body = await request.json();

		if (!body?.caseId || !body.name) {
			throw error(400, 'Missing required fields: caseId, name');
		}

		const newPerson = await db.insert(personsOfInterest)
			.values({
				caseIds: [body.caseId], // Store as array
                name: body.name,
                aliases: body.aliases || [], // Ensure array
				description: body.description ?? '',
				threatLevel: body.threatLevel ?? 'low',
                status: body.status ?? 'active',
                // flagged column removed as it's not in schema
                // tags: body.tags || [], // tags not in schema snippet either? Let's check.
                // Step 2862 snippet lines 316-355: name, aliases, description, threatLevel, status, relationship, aiProfile...
                // NO TAGS.
                // So remove tags too.
                relationship: body.relationship ?? 'person_of_interest',
				createdAt: new Date(),
				updatedAt: new Date()
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
