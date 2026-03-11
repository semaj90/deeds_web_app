import { db } from '$lib/server/db/client';
import { cases } from '$lib/server/db/schema';
import { verifySSRDatabaseConnection } from '$lib/server/db/ssr-health-check';
import { fail, redirect } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms/server';
import { zod4 as zod } from 'sveltekit-superforms/adapters';
import { and, desc, eq, like } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import {
	caseListCreateSchema,
	caseBulkUpdateStatusSchema,
	caseBulkArchiveSchema
} from './schema.js';

/**
 * SSR Load Function - Server-side data fetching for cases
 * Replaces client-side fetch('/api/cases')
 * Requirements: 5.2 - SSR database connection verification
 */
export const load: PageServerLoad = async ({ locals, url }) => {
  // Phase 79: Lucia v3 Authentication Guard
  if (!locals.user) {
    throw redirect(302, '/login');
  }

  // Parse query parameters for filtering
  const limit = Number(url.searchParams.get('limit')) || 50;
  const offset = Number(url.searchParams.get('offset')) ?? 0;
  const status = url.searchParams.get('status');
  const priority = url.searchParams.get('priority');
  const search = url.searchParams.get('search');

  // Use SSR database verification with graceful fallback
  const {
    data: userCases,
    error: dbError,
    fromFallback,
  } = await verifySSRDatabaseConnection(
    async () => {
      // Build query with filters
      const filters = [eq(cases.userId, locals.user!.id)];

      if (status && status !== 'all') {
        // Map 'active' to 'open' for legacy compatibility
        const statusValue = status === 'active' ? 'open' : status;
        filters.push(eq(cases.status, statusValue as (typeof cases.status.enumValues)[number]));
      }
      if (priority) {
        filters.push(eq(cases.priority, priority as (typeof cases.priority.enumValues)[number]));
      }
      if (search) {
        filters.push(like(cases.title, `%${search}%`));
      }

      return await db
        .select()
        .from(cases)
        .where(and(...filters))
        .orderBy(desc(cases.updatedAt))
        .limit(limit)
        .offset(offset)
        .$withCache({ config: { ex: 300 } });
    },
	[] // Fallback to empty array if database unavailable
  );

  // Log database errors but don't crash the page
  if (dbError) {
    console.warn('⚠️ Cases page: Database unavailable, showing empty state:', dbError);
  }

  return {
    user: locals.user,
    cases: userCases,
    pagination: {
      limit,
      offset,
      hasMore: userCases.length === limit,
    },
	filters: { status, priority, search },
	// Pass database status to UI for graceful degradation
    databaseStatus: {
	available: !fromFallback,
      error: dbError,
    },
	form: await superValidate(zod(caseListCreateSchema))
	};
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

		const form = await superValidate(request, zod(caseListCreateSchema));
		if (!form.valid) {
			return fail(400, { form });
		}

		const { title, description, priority, caseNumber, practiceArea, jurisdiction } = form.data;

		try {
			const newCase = await db
				.insert(cases)
				.values({
					title: title.trim(),
					description: description.trim(),
					userId: locals.user.id,
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
			throw redirect(303, `/cases/${newCase[0]?.id}`);
		} catch (err) {
			if (err instanceof Error && 'status' in err && (err as { status?: number }).status === 303) {
				throw err; // Re-throw redirect
			}
			console.error('Error creating case:', err);
			return fail(500, {
				error: 'Failed to create case',
				form
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
		const data = {
			caseId: formData.getAll('caseId').map(String),
			status: formData.get('status')?.toString()
		};

		const result = caseBulkUpdateStatusSchema.safeParse(data);
		if (!result.success) {
			return fail(400, { error: result.error.issues[0]?.message ?? 'Invalid input' });
		}

		try {
			const updated = await db
				.update(cases)
				.set({
					status: result.data.status,
					updatedAt: new Date().toISOString()
				})
				.where(
					and(
						eq(cases.assignedAttorney, locals.user.id),
						// @ts-expect-error - Drizzle inArray typing
						cases.id.in(result.data.caseId)
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
		const data = {
			caseId: formData.getAll('caseId').map(String)
		};

		const result = caseBulkArchiveSchema.safeParse(data);
		if (!result.success) {
			return fail(400, { error: result.error.issues[0]?.message ?? 'No case IDs provided' });
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
						eq(cases.assignedAttorney, locals.user.id),
						// @ts-expect-error - Drizzle inArray typing
						cases.id.in(result.data.caseId)
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
