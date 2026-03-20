import { dev } from '$app/environment';
import { db } from '$lib/server/db/client';
import { users } from '$lib/server/db/schema';
import { createUserSession, hashPassword, setSessionCookie } from '$lib/server/lucia';
import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { z } from 'zod';

const DEMO_EMAIL = 'demo@legal-ai.local';
const DEMO_PASSWORD = 'password123';
const DEMO_FIRST_NAME = 'Demo';
const DEMO_LAST_NAME = 'User';
const DEMO_ONBOARDING_STEP = 10;
const demoRoleValues = [
  'prosecutor',
  'detective',
  'admin',
  'analyst',
  'paralegal',
  'investigator',
  'viewer',
  'user',
] as const;

const demoLoginSchema = z.object({
  email: z.string().email().max(255).optional().default(DEMO_EMAIL),
  role: z.enum(demoRoleValues).optional().default('admin'),
});

type DemoLoginInput = z.infer<typeof demoLoginSchema>;

async function parseDemoLoginInput(request: Request, url: URL): Promise<unknown> {
  if (request.method === 'GET') {
    return Object.fromEntries(url.searchParams);
  }

  const rawBody = await request.text();
  if (!rawBody.trim()) {
    return {};
  }

  return JSON.parse(rawBody) as unknown;
}

async function upsertDemoUser(input: DemoLoginInput) {
  const now = new Date().toISOString();
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const username = input.email.split('@')[0];

  const [existingUser] = await db.select().from(users).where(eq(users.email, input.email)).limit(1);

  if (!existingUser) {
    const [newUser] = await db
      .insert(users)
      .values({
        email: input.email,
        passwordHash,
        name: username,
        firstName: DEMO_FIRST_NAME,
        lastName: DEMO_LAST_NAME,
        role: input.role,
        isActive: true,
        hasCompletedOnboarding: true,
        onboardingStep: DEMO_ONBOARDING_STEP,
        createdAt: now,
        updatedAt: now,
      } as any)
      .returning();

    return { user: newUser, created: true };
  }

  const [updatedUser] = await db
    .update(users)
    .set({
      passwordHash,
      name: username,
      firstName: DEMO_FIRST_NAME,
      lastName: DEMO_LAST_NAME,
      role: input.role,
      isActive: true,
      hasCompletedOnboarding: true,
      onboardingStep: DEMO_ONBOARDING_STEP,
      updatedAt: now,
    } as any)
    .where(eq(users.id, existingUser.id))
    .returning();

  return { user: updatedUser, created: false };
}

/**
 * POST /api/auth/demo-login
 * Development-only endpoint that seeds a real demo user in the database
 * and signs in with a normal Lucia session.
 *
 * SECURITY: Only enabled in development builds.
 */
const handleDemoLogin: RequestHandler = async ({ request, cookies, url }) => {
  if (!dev) {
    return json({ error: 'Demo login is only available in development mode' }, { status: 403 });
  }

  try {
    const raw = await parseDemoLoginInput(request, url);
    const parsed = demoLoginSchema.safeParse(raw);
    if (!parsed.success) {
      return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
    }

    const { user, created } = await upsertDemoUser(parsed.data);

    // Create a real Lucia session for the seeded account.
    const session = await createUserSession(user.id);
    setSessionCookie(cookies, session.sessionId);

    return json({
      success: true,
      message: created
        ? `Created and logged in as ${user.email} (${user.role})`
        : `Refreshed and logged in as ${user.email} (${user.role})`,
      credentials: {
        email: user.email,
        password: DEMO_PASSWORD,
      },
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isActive: user.isActive,
      },
      session: { id: session.sessionId, userId: session.userId },
      seeded: {
        created,
        username: user.name ?? user.email.split('@')[0],
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    if (err instanceof SyntaxError) {
      return json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    console.error('[Demo Login] Error:', err);
    return json(
      { error: err instanceof Error ? err.message : 'Failed to create demo session' },
      { status: 500 }
    );
  }
};

export const POST = handleDemoLogin;

/**
 * GET /api/auth/demo-login?email=...&role=...
 * Development-only seed and login via query parameters.
 */
export const GET = handleDemoLogin;



