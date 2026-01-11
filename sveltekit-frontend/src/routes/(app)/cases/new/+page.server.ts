import { db } from '$lib/server/db/client';
import { cases } from '$lib/server/db/schema-postgres';
import { fail, redirect } from '@sveltejs/kit';
import { nanoid } from 'nanoid';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// Phase 79: Lucia v3 Authentication Guard
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	// Fetch recent cases for context (SSR)
	const recentCases = await db
		.select()
		.from(cases)
		.where(eq(cases.userId, locals.user.id))
		.orderBy(desc(cases.createdAt))
		.limit(5);

	return {
		user: locals.user,
		recentCases
	};
};

// Form actions for progressive enhancement
export const actions = {
	// Create new case (POST)
	create: async ({ request, locals }) => {
		if (!locals.user) {
			return fail(401, { error: 'Unauthorized' });
		}

		const formData = await request.formData();
		const title = formData.get('title')?.toString();
		const narrative = formData.get('narrative')?.toString();
		const priority = (formData.get('priority')?.toString() || 'medium') as 'low' | 'medium' | 'high' | 'urgent';

		// Validation
		if (!title?.trim()) {
			return fail(400, { error: 'Title is required', title, narrative });
		}

		if (!narrative?.trim()) {
			return fail(400, { error: 'Narrative is required', title, narrative });
		}

		try {
			// Create case in database
			const [newCase] = await db
				.insert(cases)
				.values({
					id: nanoid(),
					title: title.trim(),
					description: narrative.trim(),
					priority,
					userId: locals.user.id,
					status: 'active',
					createdAt: new Date(),
					updatedAt: new Date()
				})
				.returning();

			// Progressive enhancement: redirect to new case
			throw redirect(303, `/cases/${newCase.id}`);
		} catch (error) {
			console.error('Failed to create case:', error);
			return fail(500, { error: 'Failed to create case', title, narrative });
		}
	}
} satisfies Actions;


