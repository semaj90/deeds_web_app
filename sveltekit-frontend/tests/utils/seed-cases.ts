/**
 * Seed Cases Utility for Playwright E2E Tests
 *
 * Seeds real case data through the authenticated API so:
 * - Data is owned by the logged-in user (userId from session)
 * - Persists in legal_ai_db via Drizzle ORM
 * - Playwright can verify UI + API end-to-end
 *
 * All seeded records use [PW-SEED] prefix for deterministic cleanup.
 */
import type { APIRequestContext } from '@playwright/test';

const SEED_PREFIX = '[PW-SEED]';

export type SeedCase = {
	title: string;
	description: string;
	status?: string;
	priority?: string;
};

export type SeedCaseResult = {
	id: string;
	title: string;
	description: string;
	status: string;
	priority: string;
	userId: string;
	updatedAt: string;
};

/**
 * Register a fresh test user and return session-authenticated request context info.
 * The register endpoint sets the auth_session cookie automatically.
 */
export async function registerTestUser(request: APIRequestContext) {
	const id = Math.random().toString(36).substring(2, 10);
	const user = {
		email: `pw-seed-${id}@test.local`,
		password: 'Password123!',
		firstName: 'PW',
		lastName: 'Seed'
	};

	const res = await request.post('/api/auth/register', { data: user });
	if (!res.ok()) {
		const body = await res.text();
		throw new Error(`Registration failed (${res.status()}): ${body}`);
	}

	const data = await res.json();
	return {
		userId: data.userId as string,
		sessionId: data.sessionId as string,
		email: user.email,
		user
	};
}

/**
 * Seed cases for the currently authenticated user.
 * Requires that the request context already has a valid auth_session cookie
 * (e.g., from registerTestUser or a prior login).
 *
 * POST /api/cases expects: { title, description, status?, priority? }
 */
export async function seedCasesForUser(opts: {
	request: APIRequestContext;
	cases: SeedCase[];
}): Promise<SeedCaseResult[]> {
	const created: SeedCaseResult[] = [];

	for (const c of opts.cases) {
		const res = await opts.request.post('/api/cases', {
			data: {
				title: `${SEED_PREFIX} ${c.title}`,
				description: c.description,
				status: c.status ?? 'open',
				priority: c.priority ?? 'medium'
			}
		});

		if (!res.ok()) {
			const body = await res.text();
			throw new Error(`Failed seeding case "${c.title}" (${res.status()}): ${body}`);
		}

		const json = await res.json();
		created.push(json.data);
	}

	return created;
}

/**
 * Clean up seeded cases by archiving them via the bulk DELETE endpoint.
 * Only archives cases whose IDs match the seeded set.
 */
export async function cleanupSeededCases(opts: {
	request: APIRequestContext;
	caseIds: string[];
}) {
	if (opts.caseIds.length === 0) return;

	// The DELETE /api/cases endpoint soft-deletes (archives) by IDs
	// but uses assignedAttorney not userId — so we delete individually
	for (const id of opts.caseIds) {
		const res = await opts.request.delete(`/api/cases/${id}`);
		if (!res.ok()) {
			console.warn(`Cleanup: failed to delete case ${id} (${res.status()})`);
		}
	}
}

/**
 * Fetch all cases for the authenticated user and return only PW-SEED prefixed ones.
 */
export async function getSeededCases(request: APIRequestContext): Promise<SeedCaseResult[]> {
	const res = await request.get('/api/cases?limit=100');
	if (!res.ok()) return [];

	const json = await res.json();
	return (json.data ?? []).filter((c: SeedCaseResult) => c.title.startsWith(SEED_PREFIX));
}
