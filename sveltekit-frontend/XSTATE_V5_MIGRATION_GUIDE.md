# XState v5 Migration Guide

## Overview

XState v5 introduced significant breaking changes from v4. This guide covers the migration patterns found in the deeds-web-app codebase.

**Version**: XState 5.24.0
**Error Count**: ~60,000+ (primarily type inference issues)
**Affected Files**: ~30 state machine definitions

---

## Key Breaking Changes

### 1. `setup()` API (Recommended Pattern)

**XState v5** introduces `setup()` as the recommended way to define machines with better type inference.

```typescript
// ❌ Old (v4) - createMachine with inline types
import { createMachine, assign } from 'xstate';

const machine = createMachine<Context, Event>({
  id: 'myMachine',
  context: { count: 0 },
  states: { ... }
});

// ✅ New (v5) - setup() with type inference
import { setup, assign, fromPromise } from 'xstate';

const machine = setup({
  types: {
    context: {} as MyContext,
    events: {} as MyEvent
  },
  actors: {
    myActor: fromPromise(async ({ input }) => {
      // input is typed automatically
      return { result: 'done' };
    })
  },
  actions: {
    myAction: assign({ count: ({ context }) => context.count + 1 })
  }
}).createMachine({
  id: 'myMachine',
  context: { count: 0 },
  states: { ... }
});
```

---

### 2. `fromPromise` Actor Input Pattern

**Problem**: Actors must now accept `{ input }` as first parameter, not direct parameters.

```typescript
// ❌ Wrong - Direct parameters (v4 style)
const myActor = fromPromise(async (context: MyContext) => {
  return doSomething(context);
});

// ✅ Correct - Destructure input object (v5)
const myActor = fromPromise(async ({ input }: { input: MyContext }) => {
  return doSomething(input);
});
```

**Common Error**:
```
Argument of type '({ input }: { input: { ... } }) => Promise<...>'
is not assignable to parameter of type '() => Promise<...>'.
Target signature provides too few arguments. Expected 1 or more, but got 0.
```

**Fix**: Always destructure `{ input }` in actor functions.

---

### 3. Event Property Access in Actors

**Problem**: `event.data` is now `event.output` for done events.

```typescript
// ❌ Wrong - event.data (v4)
onDone: {
  actions: assign({
    result: ({ event }) => event.data
  })
}

// ✅ Correct - event.output (v5)
onDone: {
  actions: assign({
    result: ({ event }) => event.output
  })
}
```

**Common Error**:
```
Property 'data' does not exist on type 'Event'. Did you mean 'output'?
```

---

### 4. Context Access in Actions

**Problem**: Actions receive `{ context, event }` object, not separate parameters.

```typescript
// ❌ Wrong - Accessing context directly
actions: assign({
  count: (context) => context.count + 1  // v4 style
})

// ✅ Correct - Destructure from object
actions: assign({
  count: ({ context }) => context.count + 1  // v5 style
})
```

---

### 5. `createActor` replaces `interpret`

```typescript
// ❌ Old (v4)
import { interpret } from 'xstate';
const service = interpret(machine).start();

// ✅ New (v5)
import { createActor } from 'xstate';
const actor = createActor(machine).start();
```

---

## Migration Checklist

### For Each Machine File:

- [ ] Update imports: `import { setup, assign, fromPromise } from 'xstate'`
- [ ] Replace `createMachine<Context, Event>()` with `setup({ types: {...} }).createMachine()`
- [ ] Move actors to `setup({ actors: {...} })`
- [ ] Move reusable actions to `setup({ actions: {...} })`
- [ ] Fix `fromPromise` signatures: `async ({ input }) => {}`
- [ ] Replace `event.data` with `event.output`
- [ ] Update context access: `({ context, event }) => ...`
- [ ] Replace `interpret()` with `createActor()`

---

## Common Error Patterns

### Error 1: `setup` not found

```
Module '"xstate"' has no exported member 'setup'.
Did you mean to use 'import setup from "xstate"' instead?
```

**Cause**: Possible TypeScript cache issue or incorrect import.

**Fix**:
```typescript
// ✅ Correct import
import { setup } from 'xstate';

// Clear TypeScript cache
// rm -rf node_modules/.cache .svelte-kit
```

### Error 2: Actor input type mismatch

```
Target signature provides too few arguments. Expected 1 or more, but got 0.
```

**Cause**: Actor function not destructuring `{ input }`.

**Fix**:
```typescript
// Before
const actor = fromPromise(async (data: MyData) => { ... });

// After
const actor = fromPromise(async ({ input }: { input: MyData }) => { ... });
```

### Error 3: Cannot find name 'context'

**Cause**: Referencing `context` directly instead of destructuring from parameter.

**Fix**:
```typescript
// Before
assign({ count: context.count + 1 })

// After
assign({ count: ({ context }) => context.count + 1 })
```

### Error 4: Property 'output' does not exist

**Cause**: Using `event.data` instead of `event.output` for done events.

**Fix**:
```typescript
// Before
onDone: { actions: assign({ result: (_, event) => event.data }) }

// After
onDone: { actions: assign({ result: ({ event }) => event.output }) }
```

---

## Example: Full Migration

### Before (XState v4)

```typescript
import { createMachine, assign, invoke } from 'xstate';

interface Context {
  count: number;
  result: string | null;
}

type Event =
  | { type: 'INCREMENT' }
  | { type: 'FETCH_DATA' };

const machine = createMachine<Context, Event>({
  id: 'counter',
  initial: 'idle',
  context: {
    count: 0,
    result: null
  },
  states: {
    idle: {
      on: {
        INCREMENT: {
          actions: assign({
            count: (context) => context.count + 1
          })
        },
        FETCH_DATA: 'loading'
      }
    },
    loading: {
      invoke: {
        src: async (context) => {
          const res = await fetch(`/api/data/${context.count}`);
          return res.json();
        },
        onDone: {
          target: 'idle',
          actions: assign({
            result: (_, event) => event.data.value
          })
        },
        onError: 'idle'
      }
    }
  }
});
```

### After (XState v5)

```typescript
import { setup, assign, fromPromise } from 'xstate';

interface Context {
  count: number;
  result: string | null;
}

type Event =
  | { type: 'INCREMENT' }
  | { type: 'FETCH_DATA' };

const machine = setup({
  types: {
    context: {} as Context,
    events: {} as Event
  },
  actors: {
    fetchData: fromPromise(async ({ input }: { input: { count: number } }) => {
      const res = await fetch(`/api/data/${input.count}`);
      return res.json();
    })
  },
  actions: {
    incrementCount: assign({
      count: ({ context }) => context.count + 1
    }),
    saveResult: assign({
      result: ({ event }) => event.output.value
    })
  }
}).createMachine({
  id: 'counter',
  initial: 'idle',
  context: {
    count: 0,
    result: null
  },
  states: {
    idle: {
      on: {
        INCREMENT: {
          actions: 'incrementCount'
        },
        FETCH_DATA: 'loading'
      }
    },
    loading: {
      invoke: {
        src: 'fetchData',
        input: ({ context }) => ({ count: context.count }),
        onDone: {
          target: 'idle',
          actions: 'saveResult'
        },
        onError: 'idle'
      }
    }
  }
});
```

---

## Affected Files in Codebase

### Core State Machines (Priority 1)
1. `src/crewAIOrchestrationMachine.ts` - ✅ Uses setup(), needs fromPromise fixes
2. `src/evidenceProcessingMachine.ts` - ✅ Uses setup(), needs fromPromise fixes
3. `src/goMicroserviceMachine.ts` - ⚠️ Mixed v4/v5 patterns
4. `src/agentShellMachine.ts` - ⚠️ Uses createMachine directly
5. `src/legalFormMachine.ts` - ❌ Import error

### Backup Files (Priority 3 - Reference Only)
- `.phase72-backups/**/*.ts` - 30+ machine files (DO NOT MODIFY)

---

## Testing After Migration

1. **Type Check**: `npm run check` - Should show reduced errors
2. **Runtime Test**: Start machine actors and verify transitions
3. **Event Flow**: Test all event handlers fire correctly
4. **Context Updates**: Verify assign() actions update context as expected

---

## Resources

- [XState v5 Migration Guide](https://stately.ai/docs/migration)
- [setup() API Reference](https://stately.ai/docs/setup)
- [Actor Input Pattern](https://stately.ai/docs/actors#input)
- [XState v5 Changelog](https://github.com/statelyai/xstate/releases/tag/xstate@5.0.0)

---

## Last Updated
2026-01-09 - Initial XState v5 migration documentation
