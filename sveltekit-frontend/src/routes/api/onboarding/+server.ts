import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db, pool } from '$lib/server/db/client';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

const DEFAULT_ONBOARDING_STATE = {
  hasCompletedOnboarding: false,
  onboardingStep: 0,
};

let onboardingColumnsAvailable: boolean | null = null;

async function hasOnboardingColumns() {
  if (onboardingColumnsAvailable !== null) return onboardingColumnsAvailable;

  try {
    const result = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::int AS count
			 FROM information_schema.columns
			 WHERE table_schema = 'public'
			   AND table_name = 'users'
			   AND column_name IN ('has_completed_onboarding', 'onboarding_step')`
    );

    onboardingColumnsAvailable = Number(result.rows[0]?.count ?? 0) === 2;
  } catch {
    onboardingColumnsAvailable = false;
  }

  return onboardingColumnsAvailable;
}

function isMissingColumnError(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '42703';
}

/** GET: Return current onboarding state for the authenticated user */
export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!(await hasOnboardingColumns())) {
    return json(DEFAULT_ONBOARDING_STATE);
  }

  try {
    const [row] = await db
      .select({
        hasCompletedOnboarding: users.hasCompletedOnboarding,
        onboardingStep: users.onboardingStep,
      })
      .from(users)
      .where(eq(users.id, locals.user.id))
      .limit(1);

    if (!row) {
      return json(DEFAULT_ONBOARDING_STATE);
    }

    return json(row);
  } catch (error) {
    if (isMissingColumnError(error)) {
      onboardingColumnsAvailable = false;
      return json(DEFAULT_ONBOARDING_STATE);
    }

    console.warn('[api/onboarding] GET fallback:', error);
    return json(DEFAULT_ONBOARDING_STATE);
  }
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
  if (
    typeof body.onboardingStep === 'number' &&
    Number.isInteger(body.onboardingStep) &&
    body.onboardingStep >= 0
  ) {
    updates.onboardingStep = body.onboardingStep;
  }

  if (Object.keys(updates).length === 0) {
    return json({ error: 'No valid fields to update' }, { status: 400 });
  }

  if (!(await hasOnboardingColumns())) {
    return json({ ok: true, persisted: false, reason: 'schema_unavailable' });
  }

  try {
    await db.update(users).set(updates).where(eq(users.id, locals.user.id));
    return json({ ok: true, persisted: true });
  } catch (error) {
    if (isMissingColumnError(error)) {
      onboardingColumnsAvailable = false;
      return json({ ok: true, persisted: false, reason: 'schema_unavailable' });
    }

    console.warn('[api/onboarding] PATCH fallback:', error);
    return json({ ok: true, persisted: false, reason: 'update_failed' });
  }
};
