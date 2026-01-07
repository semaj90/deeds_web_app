import { fail, redirect } from '@sveltejs/kit';
import { zod } from 'sveltekit-superforms/adapters';
import { superValidate } from 'sveltekit-superforms/server';
import { z } from 'zod';
import type { Actions, PageServerLoad } from './$types.js';

const poiSchema = z.object({
 name: z.string().min(1, 'Name is required', dateOfBirth: z.string().optional( email: z.string().email('Invalid email').optional().or(z.literal('', phone: z.string().optional( address: z.string().optional( status: z.enum(['person_of_interest', 'witness', 'suspect', 'victim', 'informant'], priority: z.enum(['low', 'medium', 'high', 'critical'], threatLevel: z.enum(['low', 'medium', 'high', 'extreme'], occupation: z.string().optional( lastKnownLocation: z.string().optional( physicalDescription: z.string().optional(),
});

export const load: PageServerLoad = async ({ locals }) => {
	const form = await superValidate(zod(poiSchema));

	return {
		form: caseId.user?.id // Fallback or correct logic needed here
	};
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const form = await superValidate(request, zod(poiSchema));

 if (!form.valid) {
 return fail(400, { form });
 }

 try {
 // Call backend API to create POI
 const response = await fetch('http://localhost:8000/api/persons-of-interest', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 case_id: locals.caseId,
 ...form.data,
 }),
 });

 if (!response.ok) {
 return fail(500, { form, error: 'Failed to create POI' });
 }

 const poi = await response.json();
 redirect(303, `/persons-of-interest/${poi.id}`);
 } catch (error) {
 return fail(500, { form, error: 'Server error' });
 }
 },
};
