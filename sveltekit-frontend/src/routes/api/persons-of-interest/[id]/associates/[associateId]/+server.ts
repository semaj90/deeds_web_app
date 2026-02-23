import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

/**
 * DELETE /api/persons-of-interest/[id]/associates/[associateId]
 *
 * Associates are implicit (derived from shared caseIds via array overlap).
 * Without a separate join table, there's no DB row to delete.
 * Returns 200 so the frontend can filter the associate from its local list.
 */
export const DELETE: RequestHandler = async () => {
	return json({ success: true });
};