# XState v5 - Modern State Management

## Core API Changes from v4

### createMachine (Enhanced in v5)
```typescript
import { createMachine, createActor } from 'xstate';

const toggleMachine = createMachine({
  id: 'toggle',
  initial: 'inactive',
  context: {
    count: 0
  },
  states: {
    inactive: {
      on: {
        TOGGLE: {
          target: 'active',
          actions: assign({
            count: ({ context }) => context.count + 1
          })
        }
      }
    },
    active: {
      on: {
        TOGGLE: 'inactive'
      }
    }
  }
});
```

### createActor (Replaces interpret)
```typescript
// v5 Pattern - createActor
const actor = createActor(toggleMachine);

// Start the actor
actor.start();

// Subscribe to state changes
const subscription = actor.subscribe(state => {
  console.log('Current state:', state.value);
  console.log('Context:', state.context);
});

// Send events
actor.send({ type: 'TOGGLE' });

// Cleanup
subscription.unsubscribe();
actor.stop();
```

### Context Management with assign
```typescript
import { createMachine, assign } from 'xstate';

const counterMachine = createMachine({
  context: {
    count: 0,
    user: null
  },
  initial: 'idle',
  states: {
    idle: {
      on: {
        INCREMENT: {
          actions: assign({
            // Function form (recommended)
            count: ({ context }) => context.count + 1
          })
        },
        SET_USER: {
          actions: assign({
            // Direct value assignment
            user: ({ event }) => event.user
          })
        },
        RESET: {
          actions: assign({
            count: 0,
            user: null
          })
        }
      }
    }
  }
});
```

## Migration Guide from v4 to v5

### Key Changes:
1. **`interpret` → `createActor`**: New actor creation API
2. **Enhanced TypeScript**: Better type inference and safety
3. **Improved Context**: More flexible context assignment
4. **Actor Model**: Enhanced actor system for concurrent processes
5. **Simplified API**: More consistent naming and patterns

### Migration Steps:
```typescript
// v4 (Old)
import { interpret } from 'xstate';
const service = interpret(machine).start();

// v5 (New)
import { createActor } from 'xstate';
const actor = createActor(machine).start();
```

## SvelteKit Integration Patterns

### Store Integration
```typescript
// stores/authMachine.ts
import { createMachine, createActor } from 'xstate';
import { writable, readable } from 'svelte/store';

export const authMachine = createMachine({...});

// Create actor
export const authActor = createActor(authMachine);

// Svelte store integration
export const authState = readable(authActor.getSnapshot(), (set) => {
  const subscription = authActor.subscribe(state => {
    set(state);
  });

  authActor.start();

  return () => {
    subscription.unsubscribe();
    authActor.stop();
  };
});

// Helper stores
export const isLoggedIn = derived(authState, $state => $state.matches('loggedIn'));
export const user = derived(authState, $state => $state.context.user);
```

### Component Usage
```svelte
<!-- Auth.svelte -->
<script>
  import { authState, authActor, isLoggedIn, user } from '$lib/stores/authMachine';

  function login() {
    authActor.send({ type: 'LOGIN' });
  }

  function logout() {
    authActor.send({ type: 'LOGOUT' });
  }
</script>

{#if $isLoggedIn}
  <p>Welcome, {$user?.name}!</p>
  <button on:click={logout}>Logout</button>
{:else}
  <button on:click={login}>Login</button>
{/if}

<pre>State: {JSON.stringify($authState.value, null, 2)}</pre>
```

### API Route Integration
```typescript
// routes/api/auth/+server.ts
import type { RequestHandler } from './$types';
import { createActor } from 'xstate';
import { authMachine } from '$lib/machines/auth';

export const POST: RequestHandler = async ({ request }) => {
  const { action, ...data } = await request.json();

  // Create temporary actor for server-side logic
  const actor = createActor(authMachine).start();

  try {
    actor.send({ type: action, ...data });
    const finalState = actor.getSnapshot();

    return Response.json({
      success: true,
      state: finalState.value,
      context: finalState.context
    });
  } catch (error) {
    return Response.json({
      success: false,
      error: error.message
    }, { status: 400 });
  } finally {
    actor.stop();
  }
};
```

**Topics Covered**: createMachine, createActor, assign, v5-migration, typescript-patterns, state-management

*Generated via Context7 MCP Integration - 2025-09-24*