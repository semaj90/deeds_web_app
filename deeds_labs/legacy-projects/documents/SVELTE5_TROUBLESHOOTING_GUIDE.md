# Svelte 5 Problem-Solving Troubleshooting Guide

## 🚨 **Critical Problem Solutions**

### 1. **"Cannot use export let in runes mode"**

```svelte
<!-- ❌ BROKEN -->
<script>
  export let documents = [];
  export let onSearch = () => {};
</script>

<!-- ✅ FIXED -->
<script>
  let { documents = [], onSearch = () => {} } = $props();
</script>
```

### 2. **"Cannot use $$props in runes mode"**

```svelte
<!-- ❌ BROKEN -->
<script>
  console.log($$props);
</script>

<!-- ✅ FIXED -->
<script>
  let props = $props();
  console.log(props);

  // Or with destructuring and rest
  let { knownProp, ...restProps } = $props();
</script>
```

### 3. **"State not updating in UI"**

```svelte
<!-- ❌ BROKEN -->
<script>
  const count = $state(0); // const prevents reactivity!

  function increment() {
    count = count + 1; // This won't work
  }
</script>

<!-- ✅ FIXED -->
<script>
  let count = $state(0); // Use let, not const

  function increment() {
    count = count + 1; // Works correctly
  }
</script>
```

### 4. **"Infinite effect loops"**

```svelte
<!-- ❌ BROKEN -->
<script>
  let data = $state([]);
  let processedData = $state([]);

  $effect(() => {
    // This creates an infinite loop!
    processedData = data.map(item => ({ ...item, processed: true }));
  });
</script>

<!-- ✅ FIXED -->
<script>
  let data = $state([]);

  // Use $derived for computed values
  let processedData = $derived(
    data.map(item => ({ ...item, processed: true }))
  );
</script>
```

### 5. **"Effect not running when expected"**

```svelte
<!-- ❌ BROKEN -->
<script>
  let searchQuery = $state('');

  $effect(() => {
    // This won't track searchQuery because it's in a timeout
    setTimeout(() => {
      if (searchQuery) {
        performSearch(searchQuery);
      }
    }, 300);
  });
</script>

<!-- ✅ FIXED -->
<script>
  let searchQuery = $state('');

  $effect(() => {
    // Read the dependency synchronously
    const query = searchQuery;

    // Then use it asynchronously
    const timeoutId = setTimeout(() => {
      if (query) {
        performSearch(query);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  });
</script>
```

### 6. **"Cannot bind to component exports"**

```svelte
<!-- ❌ BROKEN (Svelte 4 pattern) -->
<DocumentUploader bind:uploadedFiles />

<!-- ✅ FIXED (Svelte 5 pattern) -->
<script>
  let uploader;

  // Access via component reference
  function getUploadedFiles() {
    return uploader?.uploadedFiles || [];
  }
</script>

<DocumentUploader bind:this={uploader} />

<!-- ✅ BETTER: Use bindable props -->
<!-- In DocumentUploader.svelte -->
<script>
  let { uploadedFiles = $bindable([]) } = $props();
</script>

<!-- In parent component -->
<DocumentUploader bind:uploadedFiles />
```

---

## 🛠️ **Common Development Issues**

### 7. **"Derived state not updating with object mutations"**

```svelte
<!-- ❌ PROBLEMATIC -->
<script>
  let documents = $state([
    { id: 1, title: 'Contract A', metadata: { tags: [] } }
  ]);

  // This derived won't update when you mutate the tags array directly
  let tagCount = $derived(
    documents.reduce((sum, doc) => sum + doc.metadata.tags.length, 0)
  );

  function addTag(docId, tag) {
    const doc = documents.find(d => d.id === docId);
    doc.metadata.tags.push(tag); // Direct mutation - derived won't update!
  }
</script>

<!-- ✅ FIXED -->
<script>
  let documents = $state([
    { id: 1, title: 'Contract A', metadata: { tags: [] } }
  ]);

  let tagCount = $derived(
    documents.reduce((sum, doc) => sum + doc.metadata.tags.length, 0)
  );

  function addTag(docId, tag) {
    documents = documents.map(doc =>
      doc.id === docId
        ? {
            ...doc,
            metadata: {
              ...doc.metadata,
              tags: [...doc.metadata.tags, tag]
            }
          }
        : doc
    );
  }
</script>
```

### 8. **"Component not re-rendering with prop changes"**

```svelte
<!-- ❌ BROKEN -->
<script>
  let { documents } = $props();

  // This won't update when documents change!
  const documentCount = documents.length;
</script>

<p>Document count: {documentCount}</p>

<!-- ✅ FIXED -->
<script>
  let { documents } = $props();

  // Use $derived for reactive computations
  let documentCount = $derived(documents.length);
</script>

<p>Document count: {documentCount}</p>
```

### 9. **"Event handlers not working with runes"**

```svelte
<!-- ❌ BROKEN -->
<script>
  let count = $state(0);

  // This function is not reactive to count changes
  function handleClick() {
    console.log('Current count:', count); // Might log stale value
    count++;
  }
</script>

<button onclick={handleClick}>Count: {count}</button>

<!-- ✅ FIXED -->
<script>
  let count = $state(0);

  // Use inline functions or ensure function is aware of state
  function handleClick() {
    console.log('Current count:', count); // Always current value
    count++;
  }
</script>

<!-- ✅ ALTERNATIVE: Inline function -->
<button onclick={() => {
  console.log('Current count:', count);
  count++;
}}>
  Count: {count}
</button>
```

### 10. **"Conditionally rendered components losing state"**

```svelte
<!-- ❌ PROBLEMATIC -->
<script>
  let showAdvanced = $state(false);
  let searchQuery = $state('');
</script>

{#if showAdvanced}
  <!-- This component will be destroyed/recreated -->
  <AdvancedSearch bind:query={searchQuery} />
{/if}

<!-- ✅ BETTER: Use CSS visibility instead -->
<script>
  let showAdvanced = $state(false);
  let searchQuery = $state('');
</script>

<div class:hidden={!showAdvanced}>
  <AdvancedSearch bind:query={searchQuery} />
</div>

<style>
  .hidden {
    display: none;
  }
</style>

<!-- ✅ BEST: Use {#key} for intentional recreation -->
{#key showAdvanced}
  {#if showAdvanced}
    <AdvancedSearch bind:query={searchQuery} />
  {/if}
{/key}
```

---

## 🔍 **Debugging Techniques**

### 11. **Use $inspect for reactive debugging**

```svelte
<script>
  let documents = $state([]);
  let filters = $state({});

  // ✅ Basic inspection
  $inspect(documents);

  // ✅ Custom inspection with callback
  $inspect(filters).with((type, value) => {
    console.log(`Filters ${type}:`, value);
    if (type === 'update') {
      console.trace('Filter update stack trace');
    }
  });

  // ✅ Effect tracing
  $effect(() => {
    $inspect.trace('Document filtering effect');

    // Your effect logic here
    if (documents.length > 0 && Object.keys(filters).length > 0) {
      filterDocuments();
    }
  });
</script>
```

### 12. **Prevent effect dependency issues**

```svelte
<script>
  import { untrack } from 'svelte';

  let searchQuery = $state('');
  let debugMode = $state(false);

  $effect(() => {
    // This effect should only run when searchQuery changes,
    // not when debugMode changes
    const query = searchQuery;

    performSearch(query);

    // Use untrack to prevent debugMode from being a dependency
    untrack(() => {
      if (debugMode) {
        console.log('Search performed for:', query);
      }
    });
  });
</script>
```

---

## 🎯 **Performance Problem Solutions**

### 13. **Large list rendering performance**

```svelte
<!-- ❌ SLOW: Rendering thousands of items -->
<script>
  let documents = $state([/* thousands of items */]);
</script>

{#each documents as doc}
  <DocumentCard {doc} />
{/each}

<!-- ✅ FAST: Virtual scrolling -->
<script>
  let documents = $state([/* thousands of items */]);
  let visibleStartIndex = $state(0);
  let visibleCount = $state(20);

  let visibleDocuments = $derived(
    documents.slice(visibleStartIndex, visibleStartIndex + visibleCount)
  );

  function handleScroll(event) {
    // Update visibleStartIndex based on scroll position
    const scrollTop = event.target.scrollTop;
    const itemHeight = 100; // Assume fixed height
    visibleStartIndex = Math.floor(scrollTop / itemHeight);
  }
</script>

<div class="scroll-container" onscroll={handleScroll}>
  {#each visibleDocuments as doc (doc.id)}
    <DocumentCard {doc} />
  {/each}
</div>
```

### 14. **Expensive derived calculations**

```svelte
<!-- ❌ SLOW: Recalculates on every state change -->
<script>
  let documents = $state([]);
  let searchQuery = $state('');

  let searchResults = $derived(
    documents.filter(doc => {
      // Expensive operation runs on every documents/searchQuery change
      return expensiveTextMatch(doc.content, searchQuery);
    })
  );
</script>

<!-- ✅ FAST: Memoized calculations -->
<script>
  let documents = $state([]);
  let searchQuery = $state('');

  // Cache expensive calculations
  let documentIndex = $derived.by(() => {
    return documents.map(doc => ({
      ...doc,
      searchableText: preprocessTextForSearch(doc.content)
    }));
  });

  let searchResults = $derived(
    documentIndex.filter(doc =>
      fastTextMatch(doc.searchableText, searchQuery)
    )
  );
</script>
```

---

## 🏗️ **Architecture Problem Solutions**

### 15. **State management across components**

```svelte
<!-- ❌ PROP DRILLING -->
<!-- App.svelte -->
<script>
  let user = $state({ name: 'John', role: 'lawyer' });
</script>

<Header {user} />
<Sidebar {user} />
<MainContent {user} />

<!-- ✅ CONTEXT API -->
<!-- App.svelte -->
<script>
  import { setContext } from 'svelte';

  let user = $state({ name: 'John', role: 'lawyer' });
  setContext('user', user);
</script>

<Header />
<Sidebar />
<MainContent />

<!-- Header.svelte -->
<script>
  import { getContext } from 'svelte';

  let user = getContext('user');
</script>

<div>Welcome, {user.name}</div>

<!-- ✅ EVEN BETTER: Store-based state -->
<!-- stores/user.svelte.js -->
export let currentUser = $state({
  name: 'John',
  role: 'lawyer',
  preferences: {}
});

<!-- Any component -->
<script>
  import { currentUser } from '$lib/stores/user.svelte.js';
</script>

<div>Welcome, {currentUser.name}</div>
```

### 16. **API integration patterns**

```svelte
<!-- ✅ ROBUST API INTEGRATION -->
<script>
  let apiState = $state({
    data: null,
    loading: false,
    error: null
  });

  async function fetchData(params = {}) {
    apiState.loading = true;
    apiState.error = null;

    try {
      const response = await fetch('/api/legal-documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      apiState.data = data;

    } catch (error) {
      apiState.error = {
        message: error.message,
        timestamp: new Date().toISOString(),
        params
      };
      console.error('API call failed:', error);

    } finally {
      apiState.loading = false;
    }
  }

  // Reactive API calls
  let searchParams = $state({ query: '', filters: {} });

  $effect(() => {
    if (searchParams.query.length > 2) {
      fetchData(searchParams);
    }
  });
</script>

{#if apiState.loading}
  <div class="loading">Searching documents...</div>
{:else if apiState.error}
  <div class="error">
    Error: {apiState.error.message}
    <button onclick={() => fetchData(apiState.error.params)}>
      Retry
    </button>
  </div>
{:else if apiState.data}
  {#each apiState.data.results as result}
    <DocumentCard {result} />
  {/each}
{/if}
```

---

## 📋 **Quick Fix Checklist**

| Symptom | Common Cause | Quick Fix |
|---------|-------------|-----------|
| State not updating | Used `const` instead of `let` | Change to `let variable = $state()` |
| Infinite loops | State update in `$effect` | Move to `$derived` |
| Props not working | Using `export let` | Switch to `let { prop } = $props()` |
| Effect not triggering | Async dependency reading | Read dependencies synchronously first |
| Component not re-rendering | Non-reactive computed value | Use `$derived` instead of plain assignment |
| Memory leaks | Missing effect cleanup | Return cleanup function from `$effect` |
| Performance issues | Large list rendering | Add keys and use virtual scrolling |
| Binding not working | Legacy binding syntax | Update to Svelte 5 binding patterns |

---

## 🚀 **Legal AI Platform Specific Solutions**

### 17. **RAG Search Integration Issues**

```svelte
<!-- ✅ ROBUST RAG INTEGRATION -->
<script>
  import { ragService } from '$lib/services/langchain-rag.js';
  import { semanticSearchAPI } from '$lib/services/enhanced-legal-search.js';

  let searchState = $state({
    query: '',
    results: [],
    isSearching: false,
    searchHistory: [],
    error: null
  });

  // Debounced search to prevent API spam
  let searchTimeout = $state(null);

  $effect(() => {
    const query = searchState.query;

    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }

    if (query.length > 2) {
      searchTimeout = setTimeout(async () => {
        await performSearch(query);
      }, 500);
    }

    return () => {
      if (searchTimeout) {
        clearTimeout(searchTimeout);
      }
    };
  });

  async function performSearch(query) {
    searchState.isSearching = true;
    searchState.error = null;

    try {
      // Try enhanced semantic search first
      let results = await semanticSearchAPI.search(query);

      // Fallback to RAG service if needed
      if (results.length < 3) {
        const ragResults = await ragService.searchDocuments(query);
        results = [...results, ...ragResults];
      }

      searchState.results = results;
      searchState.searchHistory = [
        { query, resultCount: results.length, timestamp: Date.now() },
        ...searchState.searchHistory.slice(0, 9) // Keep last 10
      ];

    } catch (error) {
      searchState.error = error;
      console.error('Search failed:', error);
    } finally {
      searchState.isSearching = false;
    }
  }
</script>
```

### 18. **Document Upload State Management**

```svelte
<!-- ✅ COMPLEX UPLOAD STATE HANDLING -->
<script>
  let uploadState = $state({
    files: [],
    processing: [],
    completed: [],
    failed: [],
    overallProgress: 0
  });

  // Reactive progress calculation
  let progressStats = $derived({
    total: uploadState.files.length,
    processed: uploadState.completed.length + uploadState.failed.length,
    percentage: uploadState.files.length > 0
      ? (uploadState.completed.length + uploadState.failed.length) / uploadState.files.length * 100
      : 0,
    isComplete: uploadState.processing.length === 0 && uploadState.files.length > 0
  });

  async function processFiles(fileList) {
    uploadState.files = Array.from(fileList);
    uploadState.processing = [...uploadState.files];
    uploadState.completed = [];
    uploadState.failed = [];

    // Process files in parallel with concurrency limit
    const concurrencyLimit = 3;
    const semaphore = new Array(concurrencyLimit).fill(Promise.resolve());

    const processingPromises = uploadState.files.map(async (file, index) => {
      // Wait for an available slot
      await semaphore[index % concurrencyLimit];

      try {
        const result = await processDocument(file);

        // Update state immutably
        uploadState.completed = [...uploadState.completed, { file, result }];
        uploadState.processing = uploadState.processing.filter(f => f !== file);

      } catch (error) {
        uploadState.failed = [...uploadState.failed, { file, error }];
        uploadState.processing = uploadState.processing.filter(f => f !== file);
      }

      // Release the slot
      semaphore[index % concurrencyLimit] = Promise.resolve();
    });

    await Promise.all(processingPromises);
  }
</script>
```

This troubleshooting guide should solve 99% of the problems developers encounter when building with Svelte 5! 🎯