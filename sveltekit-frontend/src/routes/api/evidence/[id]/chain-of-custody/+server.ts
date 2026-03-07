import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db/client';
import { evidence } from '$lib/server/db/schema-postgres.js';
import { eq } from 'drizzle-orm';

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
	if (!locals.user) throw error(401, 'Unauthorized');

	const item = await db.select({
		id: evidence.id,
		title: evidence.title,
		hash: evidence.hash,
		chainOfCustody: evidence.chainOfCustody,
		createdAt: evidence.createdAt,
	}).from(evidence)
		.where(eq(evidence.id, params.id))
		.limit(1)
		.then(r => r[0]);

	if (!item) throw error(404, 'Evidence not found');

	const chain: CustodyEvent[] = Array.isArray(item.chainOfCustody) ? item.chainOfCustody as CustodyEvent[] : [];

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
};

/**
 * POST /api/evidence/[id]/chain-of-custody
 * Append a new custody event to the chain
 */
export const POST: RequestHandler = async ({ params, locals, request }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const body = await request.json();
	if (!body?.action) throw error(400, 'Missing required field: action');

	const validActions = ['received', 'transferred', 'analyzed', 'stored', 'retrieved', 'exported', 'sealed'];
	if (!validActions.includes(body.action)) {
		throw error(400, `Invalid action. Must be one of: ${validActions.join(', ')}`);
	}

	const item = await db.select({
		id: evidence.id,
		chainOfCustody: evidence.chainOfCustody,
	}).from(evidence)
		.where(eq(evidence.id, params.id))
		.limit(1)
		.then(r => r[0]);

	if (!item) throw error(404, 'Evidence not found');

	const chain: CustodyEvent[] = Array.isArray(item.chainOfCustody) ? item.chainOfCustody as CustodyEvent[] : [];

	const newEvent: CustodyEvent = {
		action: body.action,
		from: body.from ?? undefined,
		to: body.to ?? undefined,
		notes: body.notes ?? undefined,
		userId: locals.user.id,
		userName: (locals.user as any).name ?? locals.user.email ?? undefined,
		timestamp: new Date().toISOString(),
		location: body.location ?? undefined,
		hash: body.hash ?? undefined,
	};

	chain.push(newEvent);

	await db.update(evidence)
		.set({
			chainOfCustody: chain,
			updatedAt: new Date(),
		})
		.where(eq(evidence.id, params.id));

	return json({ success: true, event: newEvent, totalEvents: chain.length }, { status: 201 });
};
