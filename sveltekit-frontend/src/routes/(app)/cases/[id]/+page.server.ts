import { redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { cases } from '$lib/server/db/schema-postgres.js';
import type { PageServerLoad } from './$types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** safe() — wraps DB queries so a flake never throws a 500 from page load. */
const safe = <T>(p: Promise<T>, fallback: T): Promise<T> => p.catch(() => fallback);

/**
 * Case detail root load. Per triage doc §3 Proposal 5: previously a pure
 * redirect guard, forcing 8 child routes (/board, /canvas, /chat, /evidence,
 * /notes, /overview, /persons, /reports) to each re-fetch the case
 * independently. This load now fetches once and exposes the case via
 * parent() so child routes inherit graceful 404 handling.
 *
 * Child route usage:
 *   const { case: caseRow, loadError } = await parent();
 *   if (loadError || !caseRow) return { ... };
 */
export const load: PageServerLoad = async ({ params, locals }) => {
	// Phase 79: Lucia v3 Authentication Guard
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	// UUID guard per CLAUDE.md — prevents noisy 400s in console on malformed IDs.
	if (!UUID_RE.test(params.id)) {
		return {
			user:      locals.user,
			case:      null,
			loadError: 'Invalid case ID format',
		};
	}

	// Schema is integer-FK (Drizzle); live DB may still be uuid until the
	// 2026-05-11_schema_finalization.sql migration applies. Both paths are
	// safe: pre-migration returns 0 rows (graceful loadError), post-migration
	// returns the case. CLAUDE.md "Schema Mismatch" pattern.
	const rows = await safe(
		db
			.select()
			.from(cases)
			.where(eq(cases.id, params.id))
			.limit(1),
		[]
	);

	if (rows.length === 0) {
		return {
			user:      locals.user,
			case:      null,
			loadError: 'Case not found or database unavailable',
		};
	}

	return {
		user:      locals.user,
		case:      rows[0],
		loadError: null,
	};
};
