# 📚 SvelteKit 2 + XState + Loki.js Best Practices Guide

## 🏗️ Core SvelteKit 2 Best Practices

### 1. **No Side-Effects in `load` Functions**

`load` functions must be pure—do not write to stores or global state inside them. Always return data from `load` and pass it to components via props or `page.data`.

**❌ Bad:**

```typescript
// Don't do this in +page.ts
import { user } from "$lib/user";

export const load: PageLoad = async ({ fetch }) => {
  const response = await fetch("/api/user");
  // ❌ NEVER DO THIS!
  user.set(await response.json());
};
```

**✅ Good:**

```typescript
// Return data from load
export const load: PageLoad = async ({ fetch }) => {
  const response = await fetch("/api/user");
  return {
    user: await response.json(), // ✅ Return data
  };
};
```

### 2. **State & Stores with Context**

Use Svelte's `setContext`/`getContext` to share state down the component tree, not global modules.

**✅ Proper Context Usage:**

```typescript
// In +layout.svelte
import { setContext } from "svelte";
setContext("user", () => data.user);

// In child component
import { getContext } from "svelte";
const user = getContext("user");
```

### 3. **Component/Page State is Preserved**

Navigating between pages reuses components; lifecycle hooks like `onMount`/`onDestroy` do not rerun.

**Key Points:**

- Use `$derived` for reactive values that depend on `data`
- If you need to remount a component, use `{#key page.url.pathname}`
- State persists across navigation

**✅ Reactive Data Pattern:**

```typescript
<script>
  export let data;

  // ✅ Use $derived for reactive computations
  let wordCount = $derived(data.content.split(' ').length);
  let estimatedReadingTime = $derived(wordCount / 250);
</script>
```

### 4. **Store State in the URL for Persistence**

Use URL search params for state that should persist across reloads or affect SSR.

**✅ URL State Pattern:**

```typescript
// Store filters in URL
const url = new URL(window.location);
url.searchParams.set("filter", "active");
goto(url.toString());
```

### 5. **Ephemeral State in Snapshots**

Use SvelteKit snapshots for UI state that should persist across navigation but not reloads.

---

## 🎯 XState Integration Best Practices

### 6. **State Machine Architecture**

Use XState machines for complex state management, especially for multi-step processes and data management.

**✅ Machine-First Approach:**

```typescript
// Create machines for complex state
import { useMachine } from "@xstate/svelte";
import { caseManagementMachine } from "$lib/machines/caseManagementMachine";

export let data;

const { state, send } = useMachine(
  caseManagementMachine.withContext({
    ...caseManagementMachine.context,
    cases: data.initialCases, // ✅ Use SSR data to hydrate machine
  }),
);
```

### 7. **SSR-Compatible Machine Hydration**

Always hydrate XState machines with SSR data to prevent hydration mismatches.

**✅ SSR Hydration Pattern:**

```typescript
// +page.server.ts
export const load: PageServerLoad = async () => {
  return {
    initialCases: await getCases(),
    initialFilters: getDefaultFilters(),
  };
};

// +page.svelte
const machineWithInitialData = caseManagementMachine.withContext({
  ...caseManagementMachine.context,
  cases: data.initialCases,
  filters: data.initialFilters,
});
```

### 8. **Machine State Reactivity**

Use reactive statements to extract machine state for UI rendering.

**✅ Reactive Machine State:**

```typescript
const { state, send } = useMachine(myMachine);

// ✅ Extract reactive values
$: currentState = $state.value;
$: contextData = $state.context;
$: isLoading = $state.matches("loading");
$: error = $state.context.error;
```

### 9. **Event-Driven Updates**

Use machine events for all state changes instead of direct mutations.

**✅ Event-Driven Pattern:**

```typescript
// ✅ Send events to machine
function handleSearch(query: string) {
  send({ type: "SEARCH", query });
}

function handleFilter(filter: FilterType) {
  send({ type: "APPLY_FILTER", filter });
}
```

---

## 🗄️ Loki.js Caching Best Practices

### 10. **Cache-First Data Loading**

Always check cache before making API requests.

**✅ Cache-First Pattern:**

```typescript
// In machine actors
searchCases: fromPromise(async ({ input }) => {
  // ✅ Try cache first
  const cached = caseCacheManager.get();
  if (cached.length > 0 && isCacheValid()) {
    return { data: cached, fromCache: true };
  }

  // ✅ Fallback to API
  const response = await fetch('/api/cases');
  const data = await response.json();

  // ✅ Update cache
  caseCacheManager.upsert(data);
  return { data, fromCache: false };
}),
```

### 11. **Smart Cache Invalidation**

Implement proper cache invalidation strategies.

**✅ Cache Invalidation Pattern:**

```typescript
// Invalidate cache on mutations
updateCase: fromPromise(async ({ input }) => {
  const response = await fetch(`/api/cases/${input.id}`, {
    method: 'PUT',
    body: JSON.stringify(input.data),
  });

  const updatedCase = await response.json();

  // ✅ Update cache with new data
  caseCacheManager.upsert([updatedCase]);

  return updatedCase;
}),
```

### 12. **TTL-Based Cache Strategy**

Set appropriate TTL (Time To Live) for different data types.

**✅ TTL Configuration:**

```typescript
// Different TTL for different data types
export const cacheConfig = {
  cases: { ttl: 10 * 60 * 1000 }, // 10 minutes
  evidence: { ttl: 15 * 60 * 1000 }, // 15 minutes
  users: { ttl: 60 * 60 * 1000 }, // 1 hour
  staticData: { ttl: 24 * 60 * 60 * 1000 }, // 24 hours
};
```

---

## 🔄 Real-time Integration Best Practices

### 13. **WebSocket State Management**

Use XState to manage WebSocket connection states.

**✅ WebSocket Machine Pattern:**

```typescript
const { state, send } = useMachine(realtimeMachine);

$: isConnected = $state.context.isConnected;
$: unreadCount = $state.context.unreadCount;

// ✅ Handle connection lifecycle
onMount(() => {
  if (user) {
    send({ type: "CONNECT", userId: user.id });
  }
});
```

### 14. **Cache Synchronization**

Keep cache in sync with real-time updates.

**✅ Real-time Cache Sync:**

```typescript
// Update cache when receiving real-time updates
processRealtimeUpdate: assign({
  recentUpdates: ({ context, event }) => {
    if (event.type === 'SOCKET_MESSAGE') {
      // ✅ Update cache based on update type
      updateCacheFromRealtimeData(event.data);

      return [newUpdate, ...context.recentUpdates];
    }
    return context.recentUpdates;
  },
}),
```

---

## 🧪 Development & Debugging Best Practices

### 15. **XState Inspector Usage**

Always use XState Inspector during development.

**✅ Development Setup:**

```typescript
// src/lib/config/xstate-dev.ts
import { createBrowserInspector } from "@xstate/inspect";

if (import.meta.env.DEV) {
  createBrowserInspector({
    iframe: false, // Use popup window
    url: "https://stately.ai/viz?inspect",
  });
}
```

### 16. **Cache Debugging**

Log cache operations during development.

**✅ Cache Debugging:**

```typescript
// Enable cache debugging in development
const DEBUG_CACHE = import.meta.env.DEV;

if (DEBUG_CACHE) {
  console.log("Cache hit:", cachedData.length);
  console.log("Cache stats:", cacheManager.getStats());
}
```

### 17. **Machine Testing Patterns**

Write tests for machine logic, not just components.

**✅ Machine Testing:**

```typescript
// Test machine states and transitions
import { describe, it, expect } from "vitest";
import { caseManagementMachine } from "$lib/machines/caseManagementMachine";

describe("Case Management Machine", () => {
  it("should transition to searching when SEARCH event is sent", () => {
    const nextState = caseManagementMachine.transition("idle", {
      type: "SEARCH",
      query: "test",
    });
    expect(nextState.value).toBe("searching");
  });
});
```

---

## 🚀 Performance Best Practices

### 18. **Lazy Loading Machines**

Load state machines only when needed.

**✅ Lazy Machine Loading:**

```typescript
// Load machines on demand
const loadCaseMachine = () => import("$lib/machines/caseManagementMachine");
const loadAIMachine = () => import("$lib/machines/aiAssistantMachine");

// Use in components
onMount(async () => {
  const { caseManagementMachine } = await loadCaseMachine();
  // Initialize machine
});
```

### 19. **Memory Management**

Monitor and control memory usage.

**✅ Memory Management:**

```typescript
// Set cache limits
export const cacheManager = new CacheManager(collection, {
  ttl: 10 * 60 * 1000, // 10 minutes
  maxSize: 1000, // Max 1000 items
  cleanupInterval: 5000, // Cleanup every 5 seconds
});

// Regular cleanup
setInterval(() => {
  cacheManager.cleanup();
}, cacheManager.cleanupInterval);
```

### 20. **Bundle Optimization**

Optimize bundle size for XState and Loki.js.

**✅ Bundle Optimization:**

```typescript
// vite.config.ts
export default defineConfig({
  optimizeDeps: {
    include: ["lokijs", "xstate", "@xstate/svelte"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "state-machines": ["xstate", "@xstate/svelte"],
          cache: ["lokijs"],
        },
      },
    },
  },
});
```

---

## 🏭 Production Best Practices

### 21. **Environment-Specific Configuration**

Configure differently for development vs production.

**✅ Environment Configuration:**

```typescript
// Production settings
const config = {
  xstate: {
    devTools: import.meta.env.DEV,
    inspect: import.meta.env.DEV,
  },
  cache: {
    debug: import.meta.env.DEV,
    persist: !import.meta.env.DEV, // Only persist in production
  },
  websocket: {
    url: import.meta.env.VITE_WS_URL || "ws://localhost:3001",
    reconnectAttempts: import.meta.env.PROD ? 10 : 3,
  },
};
```

### 22. **Error Boundaries**

Implement proper error handling for machines.

**✅ Error Handling:**

```typescript
// Machine with error handling
states: {
  loading: {
    invoke: {
      src: 'loadData',
      onDone: {
        target: 'success',
        actions: 'setData',
      },
      onError: {
        target: 'error',
        actions: 'setError',
      },
    },
  },
  error: {
    on: {
      RETRY: {
        target: 'loading',
        guard: 'canRetry', // ✅ Limit retry attempts
      },
      CLEAR_ERROR: {
        target: 'idle',
        actions: 'clearError',
      },
    },
  },
},
```

### 23. **Monitoring & Analytics**

Track machine state transitions and performance.

**✅ Monitoring Pattern:**

```typescript
// Track state transitions
const { state, send } = useMachine(myMachine, {
  logger: (log) => {
    if (import.meta.env.PROD) {
      // Send to analytics
      analytics.track("state_transition", {
        machine: log.machine.id,
        from: log.state.value,
        event: log.event.type,
      });
    }
  },
});
```

---

## 📋 Key Principles Summary

### **Never Do This:**

- ❌ Mutate global state in `load` functions
- ❌ Use global stores for data that should use context
- ❌ Forget to use `$derived` for reactive values in preserved components
- ❌ Store persistent state in ephemeral places
- ❌ Create machines without SSR hydration
- ❌ Make API calls without checking cache first
- ❌ Enable XState DevTools in production
- ❌ Ignore cache TTL and memory limits

### **Always Do This:**

- ✅ Return data from `load` functions
- ✅ Use context for component tree state sharing
- ✅ Use `$derived` for reactive computations
- ✅ Store persistent state in URL params
- ✅ Hydrate machines with SSR data
- ✅ Check cache before API calls
- ✅ Use machines for complex state management
- ✅ Implement proper error boundaries
- ✅ Monitor performance and state transitions
- ✅ Test machine logic independently

### **Context-Aware Development:**

- 🧠 **SSR First**: Always consider server-side rendering
- 🔄 **State Preservation**: Components persist across navigation
- 📱 **Progressive Enhancement**: Start with SSR, enhance with interactivity
- ⚡ **Performance**: Cache strategically, load lazily
- 🐛 **Debugging**: Use visual tools for state management
- 🏭 **Production Ready**: Monitor, measure, and optimize

This comprehensive guide ensures your SvelteKit + XState + Loki.js application follows best practices for performance, maintainability, and user experience! 🚀
