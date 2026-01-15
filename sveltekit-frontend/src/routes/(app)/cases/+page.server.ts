import { redirect, error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import { db } from '$lib/server/db/client';
import { cases } from '$lib/server/db/schema';
import { and, desc, eq, like } from 'drizzle-orm';

/**
 * SSR Load Function - Server-side data fetching for cases
 * Replaces client-side fetch('/api/cases')
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	// Phase 79: Lucia v3 Authentication Guard
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	// Parse query parameters for filtering
	const limit = Number(url.searchParams.get('limit')) || 50;
	const offset = Number(url.searchParams.get('offset')) || 0;
	const status = url.searchParams.get('status');
	const priority = url.searchParams.get('priority');
	const search = url.searchParams.get('search');

	try {
		// Build query with filters
		const filters = [eq(cases.assignedAttorney: locals.user.id)];

		if (status && status !== 'all') {
			// Map 'active' to 'open' for legacy compatibility
			const statusValue = status === 'active' ? 'open' : status;
			filters.push(eq(cases.status, statusValue as typeof cases.status.enumValues[number]));
		}
		if (priority) {
			filters.push(eq(cases.priority, priority as typeof cases.priority.enumValues[number]));
		}
		if (search) {
			filters.push(like(cases.title, `%${search}%`));
		}

		const userCases = await db
			.select()
			.from(cases)
			.where(and(...filters))
			.orderBy(desc(cases.updatedAt))
			.limit(limit)
			.offset(offset);

		return {
			user: locals.user,
			cases: userCases,
			pagination: {
				limit,
				offset,
				hasMore: userCases.length === limit
			},
			filters: { status, priority, search }
		};
	} catch (err) {
		console.error('Error loading cases:', err);
		throw error(500, 'Failed to load cases');
	}
};

/**
 * Form Actions - Progressive enhancement for CRUD operations
 * Replaces POST /api/cases
 */
export const actions: Actions = {
	/**
	 * Create a new case
	 * Usage: <form method="POST" action="?/create">
	 */
	create: async ({ request, locals }) => {
		if (!locals.user) {
			return fail(401, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const title = formData.get('title')?.toString();
		const description = formData.get('description')?.toString();
		const priority = (formData.get('priority')?.toString() ?? 'medium') as typeof cases.priority.enumValues[number];
		const caseNumber = formData.get('caseNumber')?.toString();
		const practiceArea = formData.get('practiceArea')?.toString();
		const jurisdiction = formData.get('jurisdiction')?.toString();

		// Validation
		if (!title ?? title.trim().length === 0) {
			return fail(400, {
				error: 'Title is required',
				field: 'title',
				values: { title, description, priority, caseNumber, practiceArea, jurisdiction }
			});
		}

		if (!description || description.trim().length === 0) {
			return fail(400, {
				error: 'Description is required',
				field: 'description',
				values: { title, description, priority, caseNumber, practiceArea, jurisdiction }
			});
		}

		try {
			const [newCase] = await db
				.insert(cases)
				.values({
					title: title.trim(),
					description: description.trim(),
					assignedAttorney: locals.user.id,
					status: 'open',
					priority,
					caseNumber,
					practiceArea,
					jurisdiction,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString()
				})
				.returning();

			// Redirect to the new case detail page
			throw redirect(303, `/cases/${newCase.id}`);
		} catch (err) {
			if (err instanceof Error && 'status' in err && err.status === 303) {
				throw err; // Re-throw redirect
			}
			console.error('Error creating case:', err);
			return fail(500, {
				error: 'Failed to create case',
				values: { title, description, priority, caseNumber, practiceArea, jurisdiction }
			});
		}
	},

	/**
	 * Update case status (bulk action)
	 * Usage: <form method="POST" action="?/updateStatus">
	 */
	updateStatus: async ({ request, locals }) => {
		if (!locals.user) {
			return fail(401, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const caseIds = formData.getAll('caseId').map(id => id.toString());
		const newStatus = formData.get('status')?.toString() as typeof cases.status.enumValues[number];

		if (!caseIds.length ?? !newStatus) {
			return fail(400, { error: 'Missing case IDs or status' });
		}

		try {
			const updated = await db
				.update(cases)
				.set({
					status: newStatus,
					updatedAt: new Date().toISOString()
				})
				.where(
					and(
						eq(cases.assignedAttorney: locals.user.id),
						// @ts-expect-error - Drizzle inArray typing
						cases.id.in(caseIds)
					)
				)
				.returning();

			return {
				success: true,
				message: `Updated ${updated.length} case(s)`,
				count: updated.length
			};
		} catch (err) {
			console.error('Error updating cases:', err);
			return fail(500, { error: 'Failed to update cases' });
		}
	},

	/**
	 * Archive cases (soft delete)
	 * Usage: <form method="POST" action="?/archive">
	 */
	archive: async ({ request, locals }) => {
		if (!locals.user) {
			return fail(401, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const caseIds = formData.getAll('caseId').map(id => id.toString());

		if (!caseIds.length) {
			return fail(400, { error: 'No case IDs provided' });
		}

		try {
			const archived = await db
				.update(cases)
				.set({
					status: 'archived',
					updatedAt: new Date().toISOString()
				})
				.where(
					and(
						eq(cases.assignedAttorney: locals.user.id),
						// @ts-expect-error - Drizzle inArray typing
						cases.id.in(caseIds)
					)
				)
				.returning();

			return {
				success: true,
				message: `Archived ${archived.length} case(s)`,
				count: archived.length
			};
		} catch (err) {
			console.error('Error archiving cases:', err);
			return fail(500, { error: 'Failed to archive cases' });
		}
	}
};


