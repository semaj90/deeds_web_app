/**
 * Auth State Machine — XState v5
 * Manages: login → 2FA → authenticated → logout lifecycle
 * Wired to real Lucia v3 API endpoints
 */
import { createMachine, assign, fromPromise, createActor } from 'xstate';

export interface User {
	id: string;
	email: string;
	firstName?: string;
	lastName?: string;
	role: string;
	permissions?: string[];
	avatarUrl?: string | null;
}

export interface Session {
	id: string;
	expiresAt: string;
	fresh?: boolean;
}

export interface AuthContext {
	user: User | null;
	session: Session | null;
	error: string | null;
	isLoading: boolean;
	loginAttempts: number;
	maxLoginAttempts: number;
	lockoutUntil: Date | null;
	twoFactorRequired: boolean;
	registrationData: Record<string, unknown> | null;
}

export type AuthEvent =
	| { type: 'START_LOGIN'; data: { email: string; password: string } }
	| { type: 'START_REGISTRATION'; data: { email: string; password: string; firstName: string; lastName: string } }
	| { type: 'LOGIN_SUCCESS'; data: { user: User; session: Session } }
	| { type: 'LOGIN_FAILURE'; data: { error: string } }
	| { type: 'LOGOUT' }
	| { type: 'SESSION_EXPIRED' }
	| { type: 'REQUIRE_TWO_FACTOR' }
	| { type: 'TWO_FACTOR_SUCCESS'; data: { session: Session } }
	| { type: 'TWO_FACTOR_FAILURE'; data: { error: string } }
	| { type: 'VERIFY_EMAIL' }
	| { type: 'EMAIL_VERIFIED' }
	| { type: 'RESET_PASSWORD'; data: { email: string } }
	| { type: 'UNLOCK_ACCOUNT' }
	| { type: 'UPDATE_PROFILE'; data: Partial<User> }
	| { type: 'CHECK_SESSION' }
	| { type: 'RETRY' };

const initialContext: AuthContext = {
	user: null,
	session: null,
	error: null,
	isLoading: false,
	loginAttempts: 0,
	maxLoginAttempts: 5,
	lockoutUntil: null,
	twoFactorRequired: false,
	registrationData: null
};

// --- Actors (real Lucia v3 API calls) ---

const authenticateActor = fromPromise(async (ctx: any) => {
	const input = ctx.input as { email: string; password: string };
	const res = await fetch('/api/auth/login', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ email: input.email, password: input.password }),
		credentials: 'include'
	});
	const data = await res.json();
	if (!res.ok) throw new Error(data.error || 'Login failed');
	return {
		user: data.user as User,
		session: { id: data.sessionId, expiresAt: new Date(Date.now() + 86400000).toISOString() } as Session
	};
});

const registerActor = fromPromise(async (ctx: any) => {
	const input = ctx.input as { email: string; password: string; firstName: string; lastName: string };
	const res = await fetch('/api/auth/register', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(input),
		credentials: 'include'
	});
	const data = await res.json();
	if (!res.ok) throw new Error(data.error || 'Registration failed');
	return {
		user: data.user as User,
		session: { id: data.sessionId, expiresAt: new Date(Date.now() + 86400000).toISOString() } as Session
	};
});

const logoutActor = fromPromise(async () => {
  const res = await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      String((data as Record<string, unknown>).error ?? 'Logout failed') || 'Logout failed'
    );
  }
  return { success: true };
});

const checkSessionActor = fromPromise(async () => {
  const res = await fetch('/api/auth/me', { credentials: 'include' });
  const data = await res.json();
  if (!res.ok || !data.user) throw new Error('No active session');
  return { user: data.user as User };
});

const updateProfileActor = fromPromise(async (ctx: any) => {
  const input = ctx.input as { updates: Partial<User> };
  const res = await fetch('/api/auth/me', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input.updates),
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Profile update failed');
  return await res.json();
});

const resetPasswordActor = fromPromise(async (ctx: any) => {
  const input = ctx.input as { email: string };
  const res = await fetch('/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: input.email }),
    credentials: 'include',
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      String((data as Record<string, unknown>).error ?? 'Password reset failed') ||
        'Password reset failed'
    );
  }
  return { success: true };
});

// --- Machine Definition ---

export const authMachine = createMachine({
  id: 'auth',
  initial: 'idle',
  context: initialContext as AuthContext,

  states: {
    idle: {
      on: {
        START_LOGIN: {
          target: 'authenticating',
          guard: ({ context }: { context: AuthContext }) =>
            !context.lockoutUntil || new Date() > context.lockoutUntil,
        },
        START_REGISTRATION: 'registering',
        RESET_PASSWORD: 'resettingPassword',
        CHECK_SESSION: 'checkingSession',
      },
    },

    checkingSession: {
      invoke: {
        src: checkSessionActor,
        onDone: {
          target: 'authenticated',
          actions: assign(({ event }) => ({
            user: event.output.user,
            isLoading: false,
            error: null,
          })),
        },
        onError: { target: 'idle' },
      },
    },

    authenticating: {
      entry: assign({ isLoading: true, error: null }),
      invoke: {
        src: authenticateActor,
        input: ({ event }) => {
          const e = event as Extract<AuthEvent, { type: 'START_LOGIN' }>;
          return { email: e.data.email, password: e.data.password };
        },
        onDone: [
          {
            guard: ({ event }) => !!(event.output as Record<string, unknown>).requiresTwoFactor,
            target: 'requiresTwoFactor',
            actions: assign({ twoFactorRequired: true, isLoading: false }),
          },
          {
            target: 'authenticated',
            actions: assign(({ event }) => ({
              user: event.output.user,
              session: event.output.session,
              isLoading: false,
              error: null,
              loginAttempts: 0,
            })),
          },
        ],
        onError: [
          {
            guard: ({ context }) =>
              (context as AuthContext).loginAttempts >= (context as AuthContext).maxLoginAttempts,
            target: 'locked',
            actions: assign(({ context }) => ({
              lockoutUntil: new Date(Date.now() + 15 * 60 * 1000),
              loginAttempts: 0,
              error:
                (context as AuthContext).error || 'Account locked due to too many failed attempts',
              isLoading: false,
            })),
          },
          {
            target: 'idle',
            actions: assign(({ context, event }) => ({
              loginAttempts: (context as AuthContext).loginAttempts + 1,
              error: (event as { error?: { message?: string } }).error?.message || 'Login failed',
              isLoading: false,
            })),
          },
        ],
      },
    },

    requiresTwoFactor: {
      on: {
        TWO_FACTOR_SUCCESS: {
          target: 'authenticated',
          actions: assign(({ event }) => {
            const e = event as Extract<AuthEvent, { type: 'TWO_FACTOR_SUCCESS' }>;
            return {
              session: e.data.session,
              twoFactorRequired: false,
              loginAttempts: 0,
              error: null,
            };
          }),
        },
        TWO_FACTOR_FAILURE: {
          target: 'idle',
          actions: assign(({ event }) => ({
            error: (event as Extract<AuthEvent, { type: 'TWO_FACTOR_FAILURE' }>).data.error,
            twoFactorRequired: false,
            isLoading: false,
          })),
        },
      },
    },

    authenticated: {
      entry: assign({ isLoading: false }),
      on: {
        LOGOUT: 'loggingOut',
        SESSION_EXPIRED: {
          target: 'idle',
          actions: assign({ user: null, session: null }),
        },
        UPDATE_PROFILE: 'updatingProfile',
      },
    },

    loggingOut: {
      entry: assign({ isLoading: true }),
      invoke: {
        src: logoutActor,
        onDone: {
          target: 'idle',
          actions: assign({ user: null, session: null, error: null, isLoading: false }),
        },
        onError: {
          target: 'idle',
          actions: assign({ user: null, session: null, isLoading: false }),
        },
      },
    },

    registering: {
      entry: assign(({ event }) => ({
        isLoading: true,
        error: null,
        registrationData:
          ((event as Record<string, unknown>).data as Record<string, unknown>) ?? null,
      })),
      invoke: {
        src: registerActor,
        input: ({ event }) => {
          const e = event as Extract<AuthEvent, { type: 'START_REGISTRATION' }>;
          return e.data;
        },
        onDone: {
          target: 'authenticated',
          actions: assign(({ event }) => ({
            user: event.output.user,
            session: event.output.session,
            registrationData: null,
            isLoading: false,
            error: null,
          })),
        },
        onError: {
          target: 'idle',
          actions: assign(({ event }) => ({
            error:
              (event as { error?: { message?: string } }).error?.message || 'Registration failed',
            registrationData: null,
            isLoading: false,
          })),
        },
      },
    },

    resettingPassword: {
      entry: assign({ isLoading: true, error: null }),
      invoke: {
        src: resetPasswordActor,
        input: ({ event }) => {
          const e = event as Extract<AuthEvent, { type: 'RESET_PASSWORD' }>;
          return { email: e.data.email };
        },
        onDone: {
          target: 'passwordResetSent',
          actions: assign({ isLoading: false }),
        },
        onError: {
          target: 'idle',
          actions: assign(({ event }) => ({
            error:
              (event as { error?: { message?: string } }).error?.message || 'Password reset failed',
            isLoading: false,
          })),
        },
      },
    },

    passwordResetSent: {
      after: {
        3000: 'idle',
      },
    },

    locked: {
      on: {
        UNLOCK_ACCOUNT: {
          target: 'idle',
          actions: assign({ lockoutUntil: null, loginAttempts: 0 }),
        },
      },
      after: {
        900000: {
          target: 'idle',
          actions: assign({ lockoutUntil: null, loginAttempts: 0 }),
        },
      },
    },

    updatingProfile: {
      entry: assign({ isLoading: true }),
      invoke: {
        src: updateProfileActor,
        input: ({ event }) => ({
          updates: (event as Record<string, unknown>).data ?? {},
        }),
        onDone: {
          target: 'authenticated',
          actions: assign(({ context, event }) => ({
            user: (context as AuthContext).user
              ? {
                  ...(context as AuthContext).user!,
                  ...(((event.output as Record<string, unknown>).user as Partial<User>) ?? {}),
                }
              : (context as AuthContext).user,
            isLoading: false,
          })),
        },
        onError: {
          target: 'authenticated',
          actions: assign({ isLoading: false }),
        },
      },
    },
  },
});

export type AuthMachine = typeof authMachine;
export const authActor = createActor(authMachine);
