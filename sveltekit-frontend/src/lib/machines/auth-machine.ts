
import { setup, assign, fromPromise, createActor } from 'xstate';

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
  registrationData: any | null;
}

export type AuthEvent =
  | { type: 'START_LOGIN'; data: any }
  | { type: 'START_REGISTRATION'; data: any }
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

export const authMachine = setup({
  types: {
    context: {} as AuthContext,
    events: {} as AuthEvent
  },
  actions: {
    setLoading: assign({ isLoading: true, error: null }),
    clearLoading: assign({ isLoading: false }),
    setError: assign(({ event }) => ({
      error: (event as any).data?.error || 'An unknown error occurred',
      isLoading: false
    })),
    setUser: assign(({ event, context }) => {
      if (event.type === 'LOGIN_SUCCESS') {
        return {
          user: event.data.user; session: event.data.session,
          isLoading: false,
          error: null,
          loginAttempts: 0
        };
      }
      return context;
    }),
    clearUser: assign({ user: null, session: null, error: null }),
    incrementLoginAttempts: assign({
      loginAttempts: ({ context }) => context.loginAttempts + 1
    }),
    resetLoginAttempts: assign({ loginAttempts: 0 }),
    setLockout: assign({
      lockoutUntil: () => new Date(Date.now() + 15 * 60 * 1000), // 15 mins
      loginAttempts: 0
    }),
    clearLockout: assign({ lockoutUntil: null }),
    setTwoFactorRequired: assign({ twoFactorRequired: true }),
    clearTwoFactor: assign({ twoFactorRequired: false }),
    setRegistrationData: assign(({ event }) => ({
        registrationData: (event as any).data
    })),
    clearRegistrationData: assign({ registrationData: null })
  },
  guards: {
    isMaxAttemptsReached: ({ context }) => context.loginAttempts >= context.maxLoginAttempts,
    isAccountLocked: ({ context }) => !!context.lockoutUntil && new Date() < context.lockoutUntil
  },
  actors: {
    authenticate: fromPromise(async ({ input }: { input: any }) => {
      // Mock authentication
      await new Promise(resolve => setTimeout(resolve, 1000));
      if (input.email?.includes('fail')) throw new Error('Invalid credentials');

      // Sim 2FA
      if (input.email?.includes('2fa')) {
         return { requiresTwoFactor: true };
      }

      return {
        user: { id: '1', email: input.email || 'user@example.com', role: 'user', permissions: [] },
        session: { id: 'sess_1', expiresAt: new Date(Date.now() + 86400000).toISOString() }
      };
    }),
    register: fromPromise(async () => {
        await new Promise(resolve => setTimeout(resolve, 1500));
        return { success: true };
    }),
    logout: fromPromise(async () => {
        await new Promise(resolve => setTimeout(resolve, 500));
        return { success: true };
    }),
    resetPassword: fromPromise(async () => {
        await new Promise(resolve => setTimeout(resolve, 1000));
        return { success: true };
    })
  }
}).createMachine({
  id: 'auth',
  initial: 'idle',
  context: initialContext,
  states: {
    idle: {
      on: {
        START_LOGIN: {
          target: 'authenticating',
          guard: ({ context }) => !context.lockoutUntil || new Date() > context.lockoutUntil
        },
        START_REGISTRATION: 'registering',
        RESET_PASSWORD: 'resettingPassword'
      }
    },
    authenticating: {
      entry: 'setLoading',
      invoke: {
        src: 'authenticate',
        input: ({ event }) => (event as any).data,
        onDone: [
          {
            guard: ({ event }) => (event.output as any).requiresTwoFactor,
            target: 'requiresTwoFactor',
            actions: ['setTwoFactorRequired', 'clearLoading']
          },
          {
            target: 'authenticated',
            actions: ['setUser', 'resetLoginAttempts']
          }
        ],
        onError: [
          {
            guard: 'isMaxAttemptsReached',
            target: 'locked',
            actions: ['setLockout', 'setError']
          },
          {
            target: 'idle',
            actions: ['incrementLoginAttempts', 'setError']
          }
        ]
      }
    },
    requiresTwoFactor: {
      on: {
        TWO_FACTOR_SUCCESS: {
          target: 'authenticated',
          actions: ['setUser', 'clearTwoFactor', 'resetLoginAttempts']
        },
        TWO_FACTOR_FAILURE: {
          target: 'idle',
          actions: ['setError', 'clearTwoFactor']
        }
      }
    },
    authenticated: {
      entry: 'clearLoading',
      on: {
        LOGOUT: 'loggingOut',
        SESSION_EXPIRED: 'idle',
        UPDATE_PROFILE: 'updatingProfile'
      }
    },
    loggingOut: {
      entry: 'setLoading',
      invoke: {
        src: 'logout',
        onDone: { target: 'idle', actions: ['clearUser', 'clearLoading'] },
        onError: { target: 'idle', actions: ['clearUser', 'setError'] }
      }
    },
    registering: {
      entry: ['setLoading', 'setRegistrationData'],
      invoke: {
        src: 'register',
        input: ({ event }) => (event as any).data,
        onDone: { target: 'registrationSuccess', actions: ['clearRegistrationData'] },
        onError: { target: 'idle', actions: ['setError', 'clearRegistrationData'] }
      }
    },
    registrationSuccess: {
        after: {
            2000: 'idle'
        }
    },
    resettingPassword: {
        entry: 'setLoading',
        invoke: {
            src: 'resetPassword',
            input: ({ event }) => (event as any).data,
            onDone: { target: 'passwordResetSent', actions: 'clearLoading' },
            onError: { target: 'idle', actions: 'setError' }
        }
    },
    passwordResetSent: {
        after: {
            3000: 'idle'
        }
    },
    locked: {
      entry: 'setLockout',
      on: {
        UNLOCK_ACCOUNT: {
            target: 'idle',
            actions: ['clearLockout', 'resetLoginAttempts']
        }
      },
      after: {
        900000: { // 15 minutes
           target: 'idle',
           actions: ['clearLockout', 'resetLoginAttempts']
        }
      }
    },
    updatingProfile: {
        entry: 'setLoading',
        after: {
            1000: { target: 'authenticated', actions: 'clearLoading' }
        }
    }
  }
});

export const authActor = createActor(authMachine);
