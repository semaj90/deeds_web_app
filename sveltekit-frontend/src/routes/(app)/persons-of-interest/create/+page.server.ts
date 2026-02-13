import { fail, redirect } from '@sveltejs/kit';
import { zod } from 'sveltekit-superforms/adapters';
import { superValidate } from 'sveltekit-superforms/server';
import { z } from 'zod';
import type { Actions, PageServerLoad } from './$types.js';
import { db } from '$lib/server/db/client';
import { personsOfInterest } from '$lib/server/db/schema-postgres';

export const poiSchema = z.object({
	name: z.string().min(1, 'Name is required'),
	dateOfBirth: z.string().optional(),
	email: z.string().email('Invalid email').optional().or(z.literal('')),
	phone: z.string().optional(),
	address: z.string().optional(),
	status: z.enum(['person_of_interest', 'witness', 'suspect', 'victim', 'informant']),
	priority: z.enum(['low', 'medium', 'high', 'critical']),
	threatLevel: z.enum(['low', 'medium', 'high', 'extreme']),
	occupation: z.string().optional(),
	lastKnownLocation: z.string().optional(),
	physicalDescription: z.string().optional()
});

export const load: PageServerLoad = async ({ locals, url }) => {
	const form = await superValidate(zod(poiSchema));
	const caseId = url.searchParams.get('caseId') || null;

	return {
		form,
		caseId,
		userId: (locals as any).user?.id ?? null
	};
};

export const actions: Actions = {
	default: async ({ request, url }) => {
		const form = await superValidate(request, zod(poiSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		try {
			const caseId = url.searchParams.get('caseId') || null;

			const newPerson = await db.insert(personsOfInterest)
				.values({
					name: form.data.name,
					description: form.data.physicalDescription || '',
					threatLevel: form.data.threatLevel || 'low',
					status: form.data.status || 'person_of_interest',
					lastLocation: form.data.lastKnownLocation || null,
					caseId: caseId || null,
				} as any)
				.returning();

			const poi = newPerson[0];
			if (!poi) {
				return fail(500, { form, error: 'Failed to create POI' });
			}

			return redirect(303, `/persons-of-interest/${poi.id}`);
		} catch (error) {
			if (error && typeof error === 'object' && 'status' in error) throw error;
			return fail(500, { form, error: 'Server error' });
		}
	},
};
