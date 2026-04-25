# XState v5 Patterns Reference

**Purpose**: Quick reference for fixing XState v5 TypeScript errors in corrupted state machine files.

**Source**: Official XState v5 migration guide (https://stately.ai/docs/migration)

**Last Updated**: December 25, 2024 (Phase 80)

---

## Table of Contents

1. [Core API Changes](#core-api-changes)
2. [TypeScript Types Setup](#typescript-types-setup)
3. [Context & Events](#context--events)
4. [Actions](#actions)
5. [Guards](#guards)
6. [Actors](#actors)
7. [Common Mojibake Corruption Patterns](#common-mojibake-corruption-patterns)
8. [Fix Strategies](#fix-strategies)

---

## Core API Changes

### Creating Machines

```typescript
// ✅ XState v5
import { createMachine, createActor } from 'xstate';

const machine = createMachine({
  // machine config
});

const actor = createActor(machine).start();
```

### Setup API (Strongly Typed)

```typescript
// ✅ XState v5 - Preferred for TypeScript
import { setup, assign } from 'xstate';

const machine = setup({
  types: {
    context: {} as { count: number; user: User | null },
    events: {} as
      | { type: 'INCREMENT' }
      | { type: 'SET_USER'; user: User }
  },
  actions: {
    incrementCount: assign({ count: ({ context }) => context.count + 1 }),
    setUser: assign({ user: ({ event }) => event.user })
  },
  guards: {
    isLoggedIn: ({ context }) => context.user !== null
  },
  actors: {
    fetchUser: fromPromise(async ({ input }: { input: { userId: string } }) => {
      return await api.getUser(input.userId);
    })
  }
}).createMachine({
  context: { count: 0, user: null },
  initial: 'idle',
  states: {
    idle: {
      on: {
        INCREMENT: { actions: 'incrementCount' },
        SET_USER: { actions: 'setUser' }
      }
    }
  }
});
```

---

## TypeScript Types Setup

### Context Types

```typescript
// ✅ Correct pattern
export interface AuthContext {
  user: {
    id?: string;
    email?: string;
    firstName?: string;
    lastName?: string
  } | null;
  session: {
    id?: string;
    expiresAt?: Date;
    fresh?: boolean
  } | null;
  error?: string;
  isLoading: boolean;
  deviceInfo?: {
    userAgent?: string;
    platform?: string;
  };
  loginAttempts: number;
  maxLoginAttempts: number;
}

// ❌ Mojibake corruption pattern
export interface AuthContext {
  user: { id?: string email? : string firstName?: string }| null  // Missing semicolons, wrong spacing
  session: { id?: string expiresAt?: Date fresh?: boolean}| null
  isLoading: boolean: deviceInfo?: { userAgent?: string}  // Colon instead of semicolon
  loginAttempts: number: maxLoginAttempts: number, number: number  // Multiple colons
}
```

### Event Union Types

```typescript
// ✅ Correct pattern
type AuthEvent =
  | { type: 'START_LOGIN'; data: LoginData }
  | { type: 'LOGIN_SUCCESS'; data: { user: User; session: Session } }
  | { type: 'LOGIN_FAILURE'; data: { error: string } }
  | { type: 'LOGOUT' }
  | { type: 'REGISTER'; data: RegisterData };

// ❌ Mojibake corruption pattern
type AuthEvent =
  | { type: 'START_LOGIN', data, LoginData }  // Comma instead of colon
  | { type: 'LOGIN_SUCCESS', data: { user: unknown: session: unknown, unknown: unknown } } }  // Colons in wrong places, extra brace
  | { type: 'LOGIN_FAILURE', data: { error: string } } }  // Extra closing brace
```

### Input Data Interfaces

```typescript
// ✅ Correct pattern
export interface LoginData {
  email: string;
  password: string;
  rememberMe?: boolean;
  twoFactorCode?: string;
  deviceInfo?: unknown;
}

// ❌ Mojibake corruption pattern
export interface LoginData {
  email: string: password: string, string: string: rememberMe?: boolean  // Colons instead of semicolons
  twoFactorCode?: string
}
```

---

## Context & Events

### Setting Context with Input

```typescript
// ✅ v5: Use input property
const machine = createMachine({
  context: ({ input }) => ({
    userId: input.userId,
    count: 0
  }),
  // ...
});

const actor = createActor(machine, {
  input: { userId: '123' }
});

// ❌ v4: machine.withContext() is removed
```

### Providing Dynamic Context

```typescript
// ✅ v5: Use function, not object mappers
const machine = createMachine({
  invoke: {
    src: 'someActor',
    input: ({ context, event }) => ({
      value: event.value,
      userId: context.userId
    })
  }
});

// ❌ v4: Property mappers no longer work
```

---

## Actions

### Action Implementation (Single Argument)

```typescript
// ✅ v5: Single object argument
const machine = createMachine({
  entry: ({ context, event }) => {
    console.log(context.count, event.type);
  },
  actions: {
    incrementCount: assign({ count: ({ context }) => context.count + 1 })
  }
});

// ❌ v4: (context, event) => {} is removed
```

### Assign Actions

```typescript
// ✅ v5: Assign with function
const machine = setup({
  actions: {
    setLoading: assign({ isLoading: () => true, error: () => undefined }),
    setUser: assign({
      user: ({ event }) => (event as any).data?.user || null,
      session: ({ event }) => (event as any).data?.session || null,
      isLoading: () => false,
      error: () => undefined
    })
  }
}).createMachine({
  // ...
});

// ❌ Mojibake corruption pattern
setLoading: assign({ isLoading: () => true, error: () => undefined }  // Missing closing parenthesis
setUser: assign({ user: ({ event } => (event as any).data? .user || null : session: ...  // Colon instead of comma
```

### Enqueue Actions (replaces pure() and choose())

```typescript
// ✅ v5: Use enqueueActions()
entry: [
  enqueueActions(({ context, event, enqueue, check }) => {
    if (check('someGuard')) {
      enqueue('action1');
      enqueue('action2');
    }
  })
]

// ❌ v4: pure() and choose() removed
```

### Send Events

```typescript
// ✅ v5: Use raise() for self, sendTo() for others
entry: [
  raise({ type: 'someEvent' }),           // Send to self
  sendTo('someActor', { type: 'event' })  // Send to another actor
]

// ❌ v4: send() is removed
```

---

## Guards

### Guard Syntax

```typescript
// ✅ v5: Use 'guard' property
const machine = createMachine({
  on: {
    someEvent: {
      guard: 'isLoggedIn',
      target: 'authenticated'
    }
  }
});

// ❌ v4: 'cond' is removed
```

### Guard with Parameters

```typescript
// ✅ v5: Use params object
const machine = createMachine({
  on: {
    someEvent: {
      guard: {
        type: 'isGreaterThan',
        params: { value: 42 }
      }
    }
  }
}).provide({
  guards: {
    isGreaterThan: ({ context, event }, params) => {
      return event.value > params.value;
    }
  }
});

// ❌ v4: Inline params (not nested under 'params') removed
```

### Higher-Level Guards

```typescript
// ✅ v5: stateIn(), not()
import { stateIn, not } from 'xstate';

const machine = createMachine({
  on: {
    someEvent: {
      guard: stateIn({ form: 'submitting' }),
      target: 'someState'
    },
    anotherEvent: {
      guard: not(stateIn({ form: 'idle' })),
      target: 'processing'
    }
  }
});

// ❌ v4: in: 'someState' removed
```

---

## Actors

### Actor Logic Creators

```typescript
// ✅ v5: Use fromPromise, fromCallback, fromEventObservable
import { fromPromise, fromCallback, setup } from 'xstate';

const machine = setup({
  actors: {
    fetchUser: fromPromise(async ({ input }: { input: { userId: string } }) => {
      const response = await fetch(`/api/users/${input.userId}`);
      return response.json();
    }),

    listenToWebSocket: fromCallback(({ sendBack, receive, input }) => {
      const ws = new WebSocket(input.url);
      ws.onmessage = (msg) => sendBack({ type: 'MESSAGE', data: msg.data });
      receive((event) => {
        if (event.type === 'SEND') ws.send(event.message);
      });
      return () => ws.close();
    })
  }
}).createMachine({
  invoke: {
    src: 'fetchUser',
    input: ({ context }) => ({ userId: context.userId }),
    onDone: { actions: assign({ user: ({ event }) => event.output }) }
  }
});

// ❌ v4: invoke.src as function removed
```

### Invoke with Input

```typescript
// ✅ v5: Use invoke.input
const machine = createMachine({
  invoke: {
    src: 'someActor',
    input: { value: 42 }  // or function: ({ context, event }) => ({ value: event.value })
  }
});

// ❌ v4: invoke.data removed
```

### Output from Final States

```typescript
// ✅ v5: Use output property
const machine = createMachine({
  states: {
    finished: {
      type: 'final',
      output: ({ context, event }) => ({ result: context.value })
    }
  },
  output: ({ event }) => event.output  // Top-level output
});

// ❌ v4: data property in final states removed
```

### Creating Actors

```typescript
// ✅ v5: createActor(), not interpret()
import { createActor } from 'xstate';

const actor = createActor(machine, {
  input: { userId: '123' },
  snapshot: previousState  // For restoring state
}).start();

actor.subscribe((snapshot) => {
  console.log(snapshot.value, snapshot.context);
});

actor.send({ type: 'EVENT' });  // Must be object, not string

// ❌ v4: interpret() removed
// ❌ v4: actor.send('EVENT') string types removed
```

---

## Common Mojibake Corruption Patterns

### Pattern 1: Colon Instead of Comma in Objects

```typescript
// ❌ Corrupted
{ user: data.user: session: data.session: isLoading: false }

// ✅ Fixed
{ user: data.user, session: data.session, isLoading: false }
```

### Pattern 2: `string: null` Instead of `string | null`

```typescript
// ❌ Corrupted
email: string: null
password: string: null

// ✅ Fixed
email: string | null
password: string | null
```

### Pattern 3: Missing Semicolons in Interfaces

```typescript
// ❌ Corrupted
interface User {
  id: string email: string firstName: string  // Missing semicolons
}

// ✅ Fixed
interface User {
  id: string;
  email: string;
  firstName: string;
}
```

### Pattern 4: Duplicate Separators

```typescript
// ❌ Corrupted
loginAttempts: number: maxLoginAttempts: number, number: number

// ✅ Fixed
loginAttempts: number;
maxLoginAttempts: number;
```

### Pattern 5: Extra/Missing Braces in Union Types

```typescript
// ❌ Corrupted
| { type: 'SUCCESS', data: { user: unknown: session: unknown } } }  // Extra brace

// ✅ Fixed
| { type: 'SUCCESS'; data: { user: User; session: Session } }
```

---

## Fix Strategies

### 1. **Multi-Replace for Systematic Corruption**

Use `multi_replace_string_in_file` for batches of similar fixes:

```javascript
// Example: Fix object literal separators
{
  oldString: "user: data.user: session: data.session",
  newString: "user: data.user, session: data.session"
}
```

### 2. **Regex Detection Patterns**

```javascript
// Detect mojibake in object literals
const objectLiteralCorruption = /:\s*\w+,\s*\w+:\s*\w+\.\w+/g;

// Detect `string: null` pattern
const typeCorruption = /(\w+):\s*string:\s*null/g;

// Detect missing semicolons in interfaces
const interfaceCorruption = /(\w+:\s*\w+(?:\[\])?)\s+(\w+:)/g;
```

### 3. **Full Rewrite for Complex Files**

If corruption spans 80+ lines (like auth-machine.v5.ts):
1. Extract types first (AuthContext, AuthEvent, etc.)
2. Create clean template with setup() API
3. Migrate actions/guards/actors one by one
4. Test incrementally

### 4. **Verification Steps**

```bash
# After each fix, verify with svelte-check
npx svelte-check --workspace path/to/file.ts

# Or run full type check
npm run check
```

### 5. **Backup Before Fixing**

```bash
# Create .phase80.bak backup
cp file.ts file.ts.phase80.bak
```

---

## References

- **Official XState v5 Docs**: https://stately.ai/docs/xstate
- **Migration Guide**: https://stately.ai/docs/migration
- **TypeScript Requirements**: TypeScript 5.0+, strictNullChecks: true
- **Phase 80 Progress Report**: `PHASE80_PROGRESS_REPORT.md`
- **Incident Report**: `PHASE79_INCIDENT_REPORT.md`

---

## Quick Checklist for Fixing XState Files

- [ ] **Context interface**: Semicolons, not colons between properties
- [ ] **Event union type**: Proper colons after `type`, commas between union members
- [ ] **Input interfaces**: Semicolons between properties
- [ ] **setup() actions**: Proper `assign()` syntax with single object argument
- [ ] **Guards**: Use `guard` property, not `cond`
- [ ] **Actors**: Use `fromPromise()`, `fromCallback()`, not raw functions
- [ ] **Invoke**: Use `input`, not `data`
- [ ] **Send events**: Use `raise()` or `sendTo()`, not `send()`
- [ ] **Types**: `string | null`, not `string: null`
- [ ] **Transitions**: `reenter: true`, not `internal: false`

---

**Next Steps After Reading This Guide**:

1. Fix auth-machine.v5.ts using setup() API and clean template
2. Apply patterns to rabbitmq-xstate-integration.ts
3. Document any new patterns found
4. Create ts-morph codemods for automated fixes
