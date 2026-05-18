import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db/client';
import { evidence } from '$lib/server/db/schema-postgres.js';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { isUuid } from '$lib/server/validation.js';

const custodyEventSchema = z.object({
	action: z.enum(['received', 'transferred', 'analyzed', 'stored', 'retrieved', 'exported', 'sealed']),
	from: z.string().max(500).optional(),
	to: z.string().max(500).optional(),
	notes: z.string().max(5000).optional(),
	location: z.string().max(500).optional(),
	hash: z.string().max(500).optional(),
});

interface CustodyEvent {
	action: 'received' | 'transferred' | 'analyzed' | 'stored' | 'retrieved' | 'exported' | 'sealed';
	from?: string;
	to?: string;
	notes?: string;
	userId: string;
	userName?: string;
	timestamp: string;
	location?: string;
	hash?: string;
}

/**
 * GET /api/evidence/[id]/chain-of-custody
 * Return the chain of custody log for an evidence item
 */
export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	if (!isUuid(params.id)) return json({ error: 'Invalid evidence ID format' }, { status: 400 });

	try {
		const item = await db
			.select({
				id: evidence.id,
				title: evidence.title,
				hash: evidence.hash,
				chainOfCustody: evidence.chainOfCustody,
				createdAt: evidence.createdAt,
			})
			.from(evidence)
			.where(and(eq(evidence.id, params.id), eq(evidence.userId, Number(locals.user.id))))
			.limit(1)
			.then((r) => r[0]);

		if (!item) {
			return json({ error: 'Evidence not found' }, { status: 404 });
		}

		const chain: CustodyEvent[] = Array.isArray(item.chainOfCustody) ? item.chainOfCustody as unknown as CustodyEvent[] : [];

		return json({
			evidenceId: item.id,
			title: item.title,
			fileHash: item.hash,
			chain,
			totalEvents: chain.length,
			firstEvent: chain[0] ?? null,
			lastEvent: chain[chain.length - 1] ?? null,
			createdAt: item.createdAt,
		});
	} catch (err) {
		console.error('[chain-of-custody] GET error:', err);
		return json({ evidenceId: params.id, title: null, fileHash: null, chain: [], totalEvents: 0, firstEvent: null, lastEvent: null, createdAt: null });
	}
};

/**
 * POST /api/evidence/[id]/chain-of-custody
 * Append a new custody event to the chain
 */
export const POST: RequestHandler = async ({ params, locals, request }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	if (!isUuid(params.id)) return json({ error: 'Invalid evidence ID format' }, { status: 400 });

	// Zod schema validates action enum (received|transferred|analyzed|stored|retrieved|exported|sealed)
	const parsed = custodyEventSchema.safeParse(await request.json());
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}
	const body = parsed.data;

	const item = await db
		.select({
			id: evidence.id,
			chainOfCustody: evidence.chainOfCustody,
		})
		.from(evidence)
		.where(and(eq(evidence.id, params.id), eq(evidence.userId, Number(locals.user.id))))
		.limit(1)
		.then((r) => r[0]);

	if (!item) return json({ error: 'Evidence not found' }, { status: 404 });

	const chain: CustodyEvent[] = Array.isArray(item.chainOfCustody) ? item.chainOfCustody as unknown as CustodyEvent[] : [];

	const newEvent: CustodyEvent = {
		action: body.action,
		from: body.from ?? undefined,
		to: body.to ?? undefined,
		notes: body.notes ?? undefined,
		userId: locals.user.id,
		userName: (locals.user as { name?: string; email?: string }).name ?? locals.user.email ?? undefined,
		timestamp: new Date().toISOString(),
		location: body.location ?? undefined,
		hash: body.hash ?? undefined,
	};

	chain.push(newEvent);

	await db
		.update(evidence)
		.set({
			chainOfCustody: chain as unknown as Record<string, unknown>[],
			updatedAt: new Date(),
		})
		.where(and(eq(evidence.id, params.id), eq(evidence.userId, Number(locals.user.id))));

	return json({ success: true, event: newEvent, totalEvents: chain.length }, { status: 201 });
};
