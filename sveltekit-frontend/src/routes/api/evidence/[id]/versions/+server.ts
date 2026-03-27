import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { evidence, evidenceVersions, users } from '$lib/server/db/schema-postgres.js';
import { eq, desc, sql } from 'drizzle-orm';
import { z } from 'zod';
import { createEvidenceVersion } from '$lib/server/audit/evidence-audit.js';
import { isUuid } from '$lib/server/validation.js';

const createVersionSchema = z.object({
	changeReason: z.string().max(1000).optional(),
});

/**
 * GET /api/evidence/[id]/versions
 * Return version history for an evidence item.
 */
export const GET: RequestHandler = async ({ params, locals, url }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const { id } = params;
	if (!isUuid(id)) throw error(400, 'Invalid evidence ID format');

	const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50'), 200);

	// Verify evidence exists
	const [ev] = await db
		.select({ id: evidence.id })
		.from(evidence)
		.where(eq(evidence.id, id))
		.limit(1);

	if (!ev) throw error(404, 'Evidence not found');

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

	return json({
		evidenceId: id,
		versions,
		count: versions.length,
	});
};

/**
 * POST /api/evidence/[id]/versions
 * Create a version snapshot of the current evidence state.
 * Call this before applying metadata updates to preserve the prior state.
 */
export const POST: RequestHandler = async ({ params, locals, request }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const { id } = params;
	if (!isUuid(id)) throw error(400, 'Invalid evidence ID format');

	// Verify evidence exists
	const [ev] = await db
		.select({ id: evidence.id })
		.from(evidence)
		.where(eq(evidence.id, id))
		.limit(1);

	if (!ev) throw error(404, 'Evidence not found');

	const raw = await request.json();
	const parsed = createVersionSchema.safeParse(raw);
	if (!parsed.success) {
		throw error(400, parsed.error.issues[0]?.message ?? 'Invalid input');
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
};