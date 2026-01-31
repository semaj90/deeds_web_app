import { setup, assign, fromPromise, type DoneActorEvent } from 'xstate';

// User type
export interface User {
  id?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  department?: string;
  jurisdiction?: string;
  permissions?: string[];
  isActive?: boolean;
  emailVerified?: boolean;
}

// Session type
export interface Session {
  id?: string;
  expiresAt?: Date;
  fresh?: boolean;
}

type AuthenticateActorOutput = {
  user: User;
  session: Session;
  requiresTwoFactor?: boolean;
};

// Authentication context interface
export interface AuthContext {
  user: User | null;
  session: Session | null;
  error?: string;
  isLoading: boolean;
  deviceInfo?: {
    userAgent?: string;
    platform?: string;
    language?: string;
    timezone?: string;
    securityScore?: number;
  };
  loginAttempts: number;
  maxLoginAttempts: number;
  lastLoginAttempt?: Date;
  lockoutUntil?: Date;
  twoFactorRequired: boolean;
  registrationData?: unknown;
}

// Authentication events
export type AuthEvent =
  | { type: 'START_LOGIN'; data: LoginData }
  | { type: 'START_REGISTRATION'; data: RegistrationData }
  | { type: 'LOGIN_SUCCESS'; data: { user: User; session: Session } }
  | { type: 'LOGIN_FAILURE'; data: { error: string } }
  | { type: 'REGISTRATION_SUCCESS'; data: { user: User } }
  | { type: 'REGISTRATION_FAILURE'; data: { error: string } }
  | { type: 'LOGOUT' }
  | { type: 'SESSION_EXPIRED' }
  | { type: 'REQUIRE_TWO_FACTOR' }
  | { type: 'TWO_FACTOR_SUCCESS'; data: { session: Session } }
  | { type: 'TWO_FACTOR_FAILURE'; data: { error: string } }
  | { type: 'VERIFY_EMAIL' }
  | { type: 'EMAIL_VERIFIED' }
  | { type: 'RESET_PASSWORD'; data: { email: string } }
  | { type: 'PASSWORD_RESET_SENT' }
  | { type: 'ACCOUNT_LOCKED' }
  | { type: 'UNLOCK_ACCOUNT' }
  | { type: 'UPDATE_PROFILE'; data: Partial<User> }
  | { type: 'PROFILE_UPDATED' }
  | { type: 'RETRY' };

export interface LoginData {
  email: string;
  password: string;
  rememberMe?: boolean;
  twoFactorCode?: string;
  deviceInfo?: unknown;
}

export interface RegistrationData {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  role: string;
  department: string;
  jurisdiction: string;
  badgeNumber?: string;
  enableTwoFactor?: boolean;
  deviceInfo?: unknown;
}

const initialContext: AuthContext = {
  user: null,
  session: null,
  error: undefined,
  isLoading: false,
  deviceInfo: undefined,
  loginAttempts: 0,
  maxLoginAttempts: 5,
  lastLoginAttempt: undefined,
  lockoutUntil: undefined,
  twoFactorRequired: false,
  registrationData: undefined,
};

// Helper functions for inline guards
const isMaxAttemptsReached = ({ context }: { context: AuthContext }) => {
  return context.loginAttempts >= context.maxLoginAttempts;
};

const isAccountLocked = ({ context }: { context: AuthContext }) => {
  return context.lockoutUntil ? new Date() < context.lockoutUntil : false;
};

export const authMachine = setup({
  types: {} as {
    context: AuthContext;
    events: AuthEvent;
  },
  actions: {
    setLoading: assign({
      isLoading: () => true,
      error: () => undefined,
    }),
    clearLoading: assign({
      isLoading: () => false,
    }),
    setError: assign({
      error: ({ event }) =>
        (event as { data?: { error: string } }).data?.error ?? 'An error occurred',
      isLoading: () => false,
    }),
    setUser: assign({
      user: ({ event, context }) => {
        const payload = (
          'output' in event ? event.output : 'data' in event ? event.data : null
        ) as { user?: User } | null;
        return payload && 'user' in payload ? payload.user : context.user;
      },
      session: ({ event, context }) => {
        const payload = (
          'output' in event ? event.output : 'data' in event ? event.data : null
        ) as { session?: Session } | null;
        return payload && 'session' in payload ? payload.session : context.session;
      },
      isLoading: () => false,
      error: () => undefined,
      loginAttempts: () => 0,
    }),
    clearUser: assign({
      user: () => null,
      session: () => null,
      error: () => undefined,
    }),
    incrementLoginAttempts: assign({
      loginAttempts: ({ context }) => context.loginAttempts + 1,
      lastLoginAttempt: () => new Date(),
    }),
    resetLoginAttempts: assign({
      loginAttempts: () => 0,
      lastLoginAttempt: () => undefined,
    }),
    setLockout: assign({
      lockoutUntil: () => new Date(Date.now() + 15 * 60 * 1000),
      loginAttempts: () => 0,
    }),
    clearLockout: assign({
      lockoutUntil: () => undefined,
    }),
    setTwoFactorRequired: assign({
      twoFactorRequired: () => true,
    }),
    clearTwoFactor: assign({
      twoFactorRequired: () => false,
    }),
    setRegistrationData: assign({
      registrationData: ({ event }) => (event as { data: RegistrationData }).data,
    }),
    clearRegistrationData: assign({
      registrationData: () => undefined,
    }),
  },
  guards: {
    isMaxAttemptsReached: ({ context }) => {
      return context.loginAttempts >= context.maxLoginAttempts;
    },
    isAccountLocked: ({ context }) => {
      return context.lockoutUntil ? new Date() < context.lockoutUntil : false;
    },
  },
  actors: {
    authenticate: fromPromise(async ({ input }: { input: LoginData }) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));

      if (input.email === 'fail@test.com' || input.password !== 'password123') {
        throw new Error('Invalid credentials');
      }

      if (input.email === '2fa@test.com') {
        return {
          user: {
            id: '1',
            email: input.email,
            firstName: 'Legal',
            lastName: 'Professional',
            role: 'prosecutor',
            permissions: ['read:cases', 'write:cases', 'ai:query'],
          },
          session: {
            id: 'session_123',
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            fresh: false,
          },
          requiresTwoFactor: true,
        };
      }

      return {
        user: {
          id: '1',
          email: input.email,
          firstName: 'Legal',
          lastName: 'Professional',
          role: 'prosecutor',
          permissions: ['read:cases', 'write:cases', 'ai:query'],
        },
        session: {
          id: 'session_123',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          fresh: true,
        },
      };
    }),
    register: fromPromise(async ({ input }: { input: RegistrationData }) => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      return {
        user: {
          id: '2',
          email: input.email,
          firstName: input.firstName,
          lastName: input.lastName,
          role: input.role,
          department: input.department,
          permissions: [],
        },
      };
    }),
    logout: fromPromise(async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      return { success: true };
    }),
    resetPassword: fromPromise(async ({ input: _input }: { input: { email: string } }) => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return { success: true };
    }),
  },
}).createMachine({
  id: 'auth',
  initial: 'idle',
  context: initialContext,
  states: {
    idle: {
      on: {
        START_LOGIN: {
          target: 'authenticating',
          guard: ({ context }) => !isAccountLocked({ context }),
        },
        START_REGISTRATION: 'registering',
        RESET_PASSWORD: 'resettingPassword',
      },
    },
    authenticating: {
      entry: 'setLoading',
      invoke: {
        src: 'authenticate',
        input: ({ event }) => (event as { data: LoginData }).data,
        onDone: [
          {
            target: 'requiresTwoFactor',
            guard: ({ event }) =>
              (event as DoneActorEvent<AuthenticateActorOutput>).output?.requiresTwoFactor === true,
            actions: ['setTwoFactorRequired', 'clearLoading'],
          },
          {
            target: 'authenticated',
            actions: ['setUser', 'resetLoginAttempts'],
          },
        ],
        onError: [
          {
            target: 'locked',
            guard: ({ context }) => isMaxAttemptsReached({ context }),
            actions: ['setLockout', 'setError'],
          },
          {
            target: 'idle',
            actions: ['incrementLoginAttempts', 'setError'],
          },
        ],
      },
    },
    requiresTwoFactor: {
      on: {
        TWO_FACTOR_SUCCESS: {
          target: 'authenticated',
          actions: ['setUser', 'clearTwoFactor', 'resetLoginAttempts'],
        },
        TWO_FACTOR_FAILURE: {
          target: 'idle',
          actions: ['setError', 'clearTwoFactor'],
        },
      },
    },
    authenticated: {
      entry: 'clearLoading',
      on: {
        LOGOUT: 'loggingOut',
        SESSION_EXPIRED: 'idle',
        UPDATE_PROFILE: 'updatingProfile',
      },
    },
    loggingOut: {
      entry: 'setLoading',
      invoke: {
        src: 'logout',
        onDone: {
          target: 'idle',
          actions: ['clearUser', 'clearLoading'],
        },
        onError: {
          target: 'idle',
          actions: ['clearUser', 'setError'],
        },
      },
    },
    registering: {
      entry: ['setLoading', 'setRegistrationData'],
      invoke: {
        src: 'register',
        input: ({ event }) => (event as { data: RegistrationData }).data,
        onDone: {
          target: 'registrationSuccess',
          actions: ['setUser', 'clearRegistrationData'],
        },
        onError: {
          target: 'idle',
          actions: ['setError', 'clearRegistrationData'],
        },
      },
    },
    registrationSuccess: {
      on: {
        EMAIL_VERIFIED: 'authenticated',
        VERIFY_EMAIL: 'verifyingEmail',
      },
      after: {
        5000: 'authenticated',
      },
    },
    verifyingEmail: {
      entry: 'setLoading',
      after: {
        2000: {
          target: 'authenticated',
          actions: 'clearLoading',
        },
      },
    },
    resettingPassword: {
      entry: 'setLoading',
      invoke: {
        src: 'resetPassword',
        input: ({ event }) => ({ email: (event as { data: { email: string } }).data.email }),
        onDone: {
          target: 'passwordResetSent',
          actions: 'clearLoading',
        },
        onError: {
          target: 'idle',
          actions: 'setError',
        },
      },
    },
    passwordResetSent: {
      after: {
        3000: 'idle',
      },
    },
    locked: {
      entry: 'setLockout',
      on: {
        UNLOCK_ACCOUNT: {
          target: 'idle',
          actions: ['clearLockout', 'resetLoginAttempts'],
        },
      },
      after: {
        900000: {
          target: 'idle',
          actions: ['clearLockout', 'resetLoginAttempts'],
        },
      },
    },
    updatingProfile: {
      entry: 'setLoading',
      after: {
        1500: {
          target: 'authenticated',
          actions: 'clearLoading',
        },
      },
    },
  },
});
