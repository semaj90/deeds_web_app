import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db/client';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

/** GET: Return current onboarding state for the authenticated user */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const [row] = await db
		.select({
			hasCompletedOnboarding: users.hasCompletedOnboarding,
			onboardingStep: users.onboardingStep
		})
		.from(users)
		.where(eq(users.id, locals.user.id))
		.limit(1);

	if (!row) {
		return json({ hasCompletedOnboarding: false, onboardingStep: 0 });
	}

	return json(row);
};

/** PATCH: Update onboarding progress */
export const PATCH: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const body = await request.json();
	const updates: Record<string, unknown> = {};

	if (typeof body.hasCompletedOnboarding === 'boolean') {
		updates.hasCompletedOnboarding = body.hasCompletedOnboarding;
	}
	if (typeof body.onboardingStep === 'number' && Number.isInteger(body.onboardingStep) && body.onboardingStep >= 0) {
		updates.onboardingStep = body.onboardingStep;
	}

	if (Object.keys(updates).length === 0) {
		return json({ error: 'No valid fields to update' }, { status: 400 });
	}

	await db.update(users).set(updates).where(eq(users.id, locals.user.id));

	return json({ ok: true });
};
