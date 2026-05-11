import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { db } from '$lib/server/db/client';
import { cases } from '$lib/server/db/schema-postgres.js';
import { eq } from 'drizzle-orm';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Case detail layout load. Fetches the full case row once at the layout level
 * so every sub-route (/board, /canvas, /chat, /evidence, /notes, /overview,
 * /persons, /reports, /ai) can read it via `await parent()` without re-fetching.
 *
 * Returns the FULL case row (previously truncated to 4 fields). Sub-routes
 * that only need {id, title, status, jurisdiction} still work; sub-routes that
 * need more fields (caseNumber, practiceArea, etc.) no longer have to re-query.
 *
 * Companion to branch 4 (commit eb9575f5eb): /cases/[id]/+page.server.ts also
 * fetches the case but exposes it as `case` (not via parent()). That fetch is
 * redundant with this layout load but harmless — kept for backward-compat with
 * any direct consumer of [id]/+page.svelte.
 */
export const load: LayoutServerLoad = async ({ locals, params }) => {
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	// UUID guard prevents noisy 400s on malformed IDs.
	if (!UUID_RE.test(params.id)) {
		return { caseData: null, loadError: 'Invalid case ID format' };
	}

	const safe = <T>(p: Promise<T>, fallback: T): Promise<T> => p.catch(() => fallback);
	const caseRows = await safe(db.select().from(cases).where(eq(cases.id, params.id)).limit(1), []);
	const caseRow = caseRows[0] ?? null;

	return {
		caseData:  caseRow,
		loadError: caseRow ? null : 'Case not found or database unavailable',
	};
};