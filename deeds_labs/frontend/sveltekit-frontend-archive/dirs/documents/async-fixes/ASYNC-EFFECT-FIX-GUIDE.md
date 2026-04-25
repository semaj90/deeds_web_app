# Async Effect Fix Guide - Svelte 5

Based on "Avoid Async Effects In Svelte" video from Joy of Code.

## The Problem

Making `effect()` or `onMount()` callbacks async causes two critical issues:

1. **Cleanup Functions Break**: Async functions return Promises, not cleanup functions. Your cleanup logic never runs → memory leaks.
2. **Reactivity is Lost**: Code after `await` doesn't track reactive variables. You get stale values.

## The Solutions

### Solution 1: Async IIFE (Recommended for Most Cases)

**Before (Broken):**
```svelte
<script>
  import { effect } from 'svelte';
  
  let data = $state(null);
  
  effect(async () => {
    // ❌ BAD: This is async
    const res = await fetch('/api/data');
    data = await res.json();
    
    return () => {
      // ❌ This cleanup will NEVER run
      console.log('cleanup');
    };
  });
</script>
```

**After (Fixed):**
```svelte
<script>
  import { effect } from 'svelte';
  
  let data = $state(null);
  
  effect(() => {
    // ✅ GOOD: The effect callback is synchronous
    
    (async () => {
      try {
        const res = await fetch('/api/data');
        data = await res.json();
      } catch (e) {
        console.error("Failed to fetch", e);
      }
    })(); // <-- IIFE: Define and call immediately
    
    // ✅ GOOD: Cleanup function runs correctly
    return () => {
      console.log('cleanup runs!');
    };
  });
</script>
```

### Solution 2: Named Async Function (Better for Complex Logic)

**After (Alternative Fix):**
```svelte
<script>
  import { effect } from 'svelte';
  
  let data = $state(null);
  
  effect(() => {
    // ✅ GOOD: Synchronous callback
    
    const fetchData = async () => {
      try {
        const res = await fetch('/api/data');
        data = await res.json();
      } catch (e) {
        console.error("Failed to fetch", e);
      }
    };
    
    fetchData(); // Call it
    
    // ✅ GOOD: Cleanup works
    return () => {
      console.log('cleanup runs!');
    };
  });
</script>
```

## Pattern Recognition

### Search for These Patterns (Need Fixing)

```bash
# Find async effects
grep -r "effect(async" src/

# Find async onMount
grep -r "onMount(async" src/
```

### Common Mistakes

#### ❌ Mistake 1: Async Effect with Cleanup
```svelte
effect(async () => {
  await someAsyncWork();
  return () => cleanup(); // Never runs!
});
```

#### ✅ Fix:
```svelte
effect(() => {
  (async () => {
    await someAsyncWork();
  })();
  return () => cleanup(); // Runs correctly!
});
```

#### ❌ Mistake 2: Async onMount with Event Listener
```svelte
onMount(async () => {
  await initializeComponent();
  window.addEventListener('resize', handler);
  return () => window.removeEventListener('resize', handler); // Never runs → memory leak!
});
```

#### ✅ Fix:
```svelte
onMount(() => {
  (async () => {
    await initializeComponent();
  })();
  
  window.addEventListener('resize', handler);
  return () => window.removeEventListener('resize', handler); // Runs correctly!
});
```

## Special Cases

### Case 1: Multiple Await Calls

```svelte
effect(() => {
  (async () => {
    const user = await fetchUser();
    const posts = await fetchPosts(user.id);
    const comments = await fetchComments(posts.map(p => p.id));
    
    // All of this works now
    allData = { user, posts, comments };
  })();
  
  return () => {
    // Cleanup works
  };
});
```

### Case 2: Conditional Async Work

```svelte
effect(() => {
  if (shouldFetch) {
    (async () => {
      data = await fetchData();
    })();
  }
  
  return () => cleanup();
});
```

### Case 3: Error Handling

```svelte
effect(() => {
  (async () => {
    try {
      const result = await riskyOperation();
      handleSuccess(result);
    } catch (error) {
      handleError(error);
    } finally {
      // Always runs, even if component unmounts during await
      setLoading(false);
    }
  })();
  
  return () => {
    // Cleanup runs immediately when effect re-runs or component unmounts
  };
});
```

## Automated Fix Script

Run the automated fixer:

```bash
node fix-async-effects.mjs
```

The script will:
1. Find all async effect/onMount patterns
2. Convert them to sync callbacks with async IIFEs
3. Preserve cleanup functions
4. Create backups (*.backup-async-fix)
5. Generate a report

## Manual Review Checklist

After running the automated fix, manually review:

- [ ] Components with complex nested async logic
- [ ] Files with multiple effects/onMounts
- [ ] WebSocket connections (check cleanup)
- [ ] Event listeners (check cleanup)
- [ ] Subscriptions (check cleanup)
- [ ] Intervals/timeouts (check cleanup)

## Testing

Test each fixed component:

1. **Cleanup Test**: Add console.log in cleanup, verify it runs on unmount
2. **Reactivity Test**: Change reactive vars after await, verify they update
3. **Error Test**: Force async errors, verify error handling works
4. **Memory Test**: Mount/unmount repeatedly, check for leaks in DevTools

## Files Fixed

Run this to see what was changed:

```bash
# See all backup files
find src -name "*.backup-async-fix"

# Compare before/after
diff file.svelte.backup-async-fix file.svelte
```

## Rollback

If something breaks:

```bash
# Restore a single file
cp file.svelte.backup-async-fix file.svelte

# Restore all files
find src -name "*.backup-async-fix" -exec sh -c 'cp "$1" "${1%.backup-async-fix}"' _ {} \;
```

## References

- Video: "Avoid Async Effects In Svelte" - Joy of Code
- Svelte 5 Docs: https://svelte.dev/docs/svelte/$effect
- Svelte 5 Migration: https://svelte.dev/docs/svelte/v5-migration-guide

## Common Patterns in This Codebase

Based on initial scan, these patterns appear frequently:

1. **Document Upload**: `onMount(async () => { await initUploader(); })`
2. **Canvas Initialization**: `effect(async () => { await initFabric(); })`
3. **AI Service Checks**: `effect(async () => { await checkOllamaHealth(); })`
4. **WebSocket Setup**: `onMount(async () => { await connectWebSocket(); })`
5. **3D Rendering**: `effect(async () => { await initThreeJS(); })`

All should follow the IIFE pattern for proper cleanup and reactivity.
