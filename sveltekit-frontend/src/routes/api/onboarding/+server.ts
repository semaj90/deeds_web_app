import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { db, pool } from '$lib/server/db/client';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const onboardingPatchSchema = z.object({
  hasCompletedOnboarding: z.boolean().optional(),
  onboardingStep: z.number().int().min(0).max(100).optional(),
}).refine(data => data.hasCompletedOnboarding !== undefined || data.onboardingStep !== undefined, {
  message: 'At least one of hasCompletedOnboarding or onboardingStep is required',
});

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

  const raw = await request.json().catch(() => null);
  const parsed = onboardingPatchSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.hasCompletedOnboarding !== undefined) {
    updates.hasCompletedOnboarding = parsed.data.hasCompletedOnboarding;
  }
  if (parsed.data.onboardingStep !== undefined) {
    updates.onboardingStep = parsed.data.onboardingStep;
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
