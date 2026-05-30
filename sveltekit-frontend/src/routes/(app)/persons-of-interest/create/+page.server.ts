import { fail, redirect } from '@sveltejs/kit';
import { zod4 as zod } from 'sveltekit-superforms/adapters';
import { superValidate } from 'sveltekit-superforms/server';
import { z } from 'zod';
import type { Actions, PageServerLoad } from './$types.js';
import { db } from '$lib/server/db/client';
import { personsOfInterest } from '$lib/server/db/schema-postgres';

const poiSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(500),
  aliases: z.string().optional().default(''),
  description: z.string().max(5000).optional().default(''),
  status: z.enum(['surveillance', 'wanted', 'active', 'cleared']).default('surveillance'),
  threatLevel: z.enum(['low', 'medium', 'high', 'critical']).default('low'),
  relationship: z.string().max(500).optional().default(''),
  crimes: z.string().max(5000).optional().default(''),
});

export const load: PageServerLoad = async ({ locals, url }) => {
	const form = await superValidate(zod(poiSchema));
	const id = url.searchParams.get('caseId') || null;

	return {
		form,
		caseId: id,
		userId: locals.user?.id ?? null
	};
};

export const actions: Actions = {
  default: async ({ request, url, locals }) => {
    const form = await superValidate(request, zod(poiSchema));

    if (!form.valid) {
      return fail(400, { form });
    }

    try {
      const id = url.searchParams.get('caseId') || null;
      const aliases = form.data.aliases
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      const crimes = (form.data.crimes || '')
        .split(',')
        .map((value: string) => value.trim())
        .filter(Boolean);

      const newPerson = await db
        .insert(personsOfInterest)
        .values({
          name: form.data.name,
          aliases,
          description: form.data.description,
          threatLevel: form.data.threatLevel,
          status: form.data.status,
          relationship: form.data.relationship || null,
          crimes,
          caseIds: id ? [id] : [],
          createdBy: locals.user?.id ? Number(locals.user.id) : null,
        })
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
