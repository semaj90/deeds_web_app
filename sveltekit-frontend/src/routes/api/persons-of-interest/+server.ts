import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { personsOfInterest } from '$lib/server/db/schema-postgres.js';
import { desc, eq, ilike, or, sql } from 'drizzle-orm';
import { z } from 'zod';

const createPOISchema = z.object({
	name: z.string().trim().min(1, 'Name is required').max(500),
	description: z.string().max(5000).optional(),
	status: z.enum(['surveillance', 'wanted', 'active', 'cleared']).default('surveillance'),
	threatLevel: z.enum(['low', 'medium', 'high', 'critical']).default('low'),
	aliases: z.array(z.string()).optional(),
	relationship: z.string().max(500).optional(),
	crimes: z.array(z.string()).optional(),
	caseIds: z.array(z.string()).optional(),
});

const poiListSchema = z.object({
	page: z.coerce.number().int().min(1).default(1),
	limit: z.coerce.number().int().min(1).max(100).default(20),
	search: z.string().max(500).optional().default(''),
	status: z.enum(['surveillance', 'wanted', 'active', 'cleared']).or(z.literal('')).default(''),
	threatLevel: z.enum(['low', 'medium', 'high', 'critical']).or(z.literal('')).default(''),
});

/**
 * GET /api/persons-of-interest
 * List all persons of interest with optional filtering and pagination
 */
export const GET: RequestHandler = async ({ url }) => {
	const parsed = poiListSchema.safeParse({
		page: url.searchParams.get('page') ?? undefined,
		limit: url.searchParams.get('limit') ?? undefined,
		search: url.searchParams.get('search')?.trim(),
		status: url.searchParams.get('status') ?? undefined,
		threatLevel: url.searchParams.get('threatLevel') ?? undefined,
	});
	if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? 'Invalid query' }, { status: 400 });
	const { page, limit, search, status, threatLevel } = parsed.data;
	const offset = (page - 1) * limit;

	try {
		const conditions = [];
		if (status) conditions.push(eq(personsOfInterest.status, status as any));
		if (threatLevel) conditions.push(eq(personsOfInterest.threatLevel, threatLevel as any));
		if (search) {
			conditions.push(
				or(
					ilike(personsOfInterest.name, `%${search}%`),
					ilike(personsOfInterest.description, `%${search}%`)
				)!
			);
		}

		const where = conditions.length > 0
			? conditions.length === 1 ? conditions[0] : sql`${conditions[0]} AND ${conditions.slice(1).reduce((a, b) => sql`${a} AND ${b}`)}`
			: undefined;

		const [items, countResult] = await Promise.all([
			db
				.select({
					id: personsOfInterest.id,
					name: personsOfInterest.name,
					status: personsOfInterest.status,
					threatLevel: personsOfInterest.threatLevel,
					description: personsOfInterest.description,
					aliases: personsOfInterest.aliases,
					relationship: personsOfInterest.relationship,
					crimes: personsOfInterest.crimes,
					caseIds: personsOfInterest.caseIds,
					confidence: personsOfInterest.confidence,
					createdAt: personsOfInterest.createdAt,
					updatedAt: personsOfInterest.updatedAt,
				})
				.from(personsOfInterest)
				.where(where)
				.orderBy(desc(personsOfInterest.updatedAt))
				.limit(limit)
				.offset(offset),
			db
				.select({ count: sql<number>`CAST(COUNT(*) AS INTEGER)` })
				.from(personsOfInterest)
				.where(where),
		]);

		return json({
			persons: items,
			total: countResult[0]?.count ?? 0,
			page,
			limit,
			totalPages: Math.ceil((countResult[0]?.count ?? 0) / limit),
		});
	} catch (err) {
		console.error('[poi] GET list error:', err);
		return json({ persons: [], total: 0, page: 1, limit, totalPages: 0 });
	}
};

/**
 * POST /api/persons-of-interest
 * Create a new person of interest
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json().catch(() => ({}));
		const parsed = createPOISchema.safeParse(body);
		if (!parsed.success) {
			return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
		}

		const [created] = await db
			.insert(personsOfInterest)
			.values({
				name: parsed.data.name,
				description: parsed.data.description ?? '',
				status: parsed.data.status,
				threatLevel: parsed.data.threatLevel,
				aliases: parsed.data.aliases ?? [],
				relationship: parsed.data.relationship ?? null,
				crimes: parsed.data.crimes ?? [],
				caseIds: parsed.data.caseIds ?? [],
			})
			.returning();

		return json(created, { status: 201 });
	} catch (err) {
		console.error('[poi] POST error:', err);
		return json({ error: 'Failed to create person of interest' }, { status: 500 });
	}
};
