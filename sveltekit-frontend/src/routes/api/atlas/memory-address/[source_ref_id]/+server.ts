import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db/client';
import { atlasMemoryAddressRegistry } from '$lib/server/db/schema/atlas-memory-address-registry.js';
import { eq, isNull, or } from 'drizzle-orm';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const { source_ref_id } = params;
	if (!source_ref_id || source_ref_id.trim() === '') {
		throw error(400, 'source_ref_id is required');
	}

	// source_ref_id param may be a numeric id or a string source_ref path
	const parsed = parseInt(source_ref_id, 10);
	const numericId = !isNaN(parsed) && String(parsed) === source_ref_id.trim() ? parsed : null;

	try {
		const rows = await db
			.select()
			.from(atlasMemoryAddressRegistry)
			.where(
				or(
					numericId !== null
						? eq(atlasMemoryAddressRegistry.sourceRefId, numericId)
						: undefined,
					eq(atlasMemoryAddressRegistry.sourceRef, source_ref_id)
				)
			);

		// Separate active vs expired entries
		const now = new Date();
		const active = rows.filter((r) => !r.validTo || r.validTo > now);
		const expired = rows.filter((r) => r.validTo && r.validTo <= now);

		return json({
			source_ref_id,
			total: rows.length,
			active: active.length,
			expired: expired.length,
			entries: active,
		});
	} catch {
		return json({ source_ref_id, total: 0, active: 0, expired: 0, entries: [] });
	}
};
