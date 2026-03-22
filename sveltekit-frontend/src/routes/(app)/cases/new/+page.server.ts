import { superValidate, message } from 'sveltekit-superforms/server';
import { zod4 as zod } from 'sveltekit-superforms/adapters';
import { db } from '$lib/server/db/client';
import { cases } from '$lib/server/db/schema-postgres.js';
import { redirect, fail } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import { extractCaseStructureWithGemma } from '$lib/server/llm/gemmaIntake.js';
import type { Actions, PageServerLoad } from './$types';
import { intakeCaseSchema } from './schema.js';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(302, '/login');

	const safe = <T>(p: Promise<T>, fallback: T, timeoutMs = 5000): Promise<T> =>
    Promise.race([
      p,
      new Promise<T>((resolve) => setTimeout(() => resolve(fallback), timeoutMs)),
    ]).catch(() => fallback);

  const form = await superValidate(zod(intakeCaseSchema));

  const recentCases = await safe(
    db
      .select()
      .from(cases)
      .where(eq(cases.userId, locals.user.id))
      .orderBy(desc(cases.createdAt))
      .limit(5),
    []
  );

	return { form, user: locals.user, recentCases };
};

export const actions = {
	// Create case via Drizzle ORM 0.44 with Superforms validation
	create: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized' });

		const form = await superValidate(request, zod(intakeCaseSchema));
		if (!form.valid) return fail(400, { form });

		const { title, narrative, who, what, when, where, why, how, priority } = form.data;

		// Build structured description from narrative + W-fields
		const wFields = [
			who && `WHO: ${who}`,
			what && `WHAT: ${what}`,
			when && `WHEN: ${when}`,
			where && `WHERE: ${where}`,
			why && `WHY: ${why}`,
			how && `HOW: ${how}`
		]
			.filter(Boolean)
			.join('\n');

		const description = [narrative, wFields].filter(Boolean).join('\n\n');

		let newCase;
		try {
			[newCase] = await db
        .insert(cases)
        .values({
          title: title.trim(),
          description,
          priority: priority,
          userId: locals.user.id,
          status: 'open' as const,
          updatedAt: new Date().toISOString(),
        })
        .returning();
		} catch (error) {
			console.error('Failed to create case:', error);
			return message(form, 'Failed to create case. Please try again.', { status: 500 });
		}

		redirect(303, `/cases/${newCase.id}/overview`);
	},

	// AI analysis — calls Gemma3-Legal to extract persons, title, statute from narrative
	analyze: async ({ request, locals }) => {
		if (!locals.user) return fail(401, { error: 'Unauthorized' });

		const formData = await request.formData();
		const narrative = formData.get('narrative')?.toString() ?? '';
		const who = formData.get('who')?.toString() ?? '';
		const what = formData.get('what')?.toString() ?? '';
		const when = formData.get('when')?.toString() ?? '';
		const where = formData.get('where')?.toString() ?? '';
		const why = formData.get('why')?.toString() ?? '';
		const how = formData.get('how')?.toString() ?? '';

		if (!narrative.trim() && !what.trim()) {
			return fail(400, {
				analysisError: 'Provide a narrative or describe what happened before analyzing.'
			});
		}

		try {
			const extraction = await extractCaseStructureWithGemma({
				narrative,
				who,
				what,
				when,
				where,
				why,
				how
			});

			return { extraction };
		} catch (error) {
			console.error('AI extraction failed:', error);
			return fail(500, {
				analysisError: 'AI analysis unavailable — Ollama may be offline. Create the case manually.'
			});
		}
	}
} satisfies Actions;
