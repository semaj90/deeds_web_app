# Svelte 5 Best Practices Guide for Legal AI Platform

## 🎯 **Core Principles for Problem-Free Development**

This guide addresses all common Svelte 5 pitfalls and provides battle-tested patterns for building robust Legal AI applications.

---

## 🏗️ **1. State Management Best Practices**

### ✅ **Use `$state` for Component State**

```svelte
<!-- ✅ CORRECT: Reactive state declaration -->
<script>
  let searchQuery = $state('');
  let searchResults = $state([]);
  let isLoading = $state(false);
  let errorMessage = $state(null);
</script>
```

### ❌ **Avoid These State Anti-Patterns**

```svelte
<!-- ❌ WRONG: Don't use const with $state -->
<script>
  const count = $state(0); // Will cause reactivity issues
</script>

<!-- ❌ WRONG: Don't mutate state directly in templates -->
<button onclick={() => searchResults.push(newResult)}>
  Add Result <!-- This breaks reactivity -->
</button>

<!-- ✅ CORRECT: Use functions for state mutations -->
<button onclick={addResult}>Add Result</button>
```

### 🔄 **Deep State Management**

```svelte
<script>
  // ✅ CORRECT: Deep reactive objects
  let legalDocument = $state({
    title: '',
    content: '',
    metadata: {
      practiceArea: '',
      jurisdiction: '',
      confidence: 0
    },
    tags: []
  });

  // ✅ CORRECT: Safe property updates
  function updateConfidence(newConfidence) {
    legalDocument.metadata.confidence = newConfidence;
  }

  // ✅ CORRECT: Safe array operations
  function addTag(tag) {
    legalDocument.tags = [...legalDocument.tags, tag];
  }
</script>
```

---

## 📊 **2. Derived State Best Practices**

### ✅ **Use `$derived` for Computed Values**

```svelte
<script>
  let searchResults = $state([]);
  let selectedFilters = $state({ practiceArea: '', jurisdiction: '' });

  // ✅ CORRECT: Derived filtering
  let filteredResults = $derived(
    searchResults.filter(result => {
      if (selectedFilters.practiceArea && result.practiceArea !== selectedFilters.practiceArea) {
        return false;
      }
      if (selectedFilters.jurisdiction && result.jurisdiction !== selectedFilters.jurisdiction) {
        return false;
      }
      return true;
    })
  );

  // ✅ CORRECT: Derived statistics
  let resultsStats = $derived({
    total: filteredResults.length,
    highConfidence: filteredResults.filter(r => r.confidence > 0.8).length,
    practiceAreas: [...new Set(filteredResults.map(r => r.practiceArea))]
  });
</script>
```

### ✅ **Use `$derived.by()` for Complex Logic**

```svelte
<script>
  let documents = $state([]);

  // ✅ CORRECT: Complex derived logic
  let documentAnalysis = $derived.by(() => {
    if (documents.length === 0) return null;

    let analysis = {
      totalWords: 0,
      avgConfidence: 0,
      practiceAreaDistribution: {},
      riskAssessment: 'low'
    };

    for (const doc of documents) {
      analysis.totalWords += doc.wordCount || 0;
      analysis.avgConfidence += doc.confidence || 0;

      const area = doc.practiceArea || 'unknown';
      analysis.practiceAreaDistribution[area] =
        (analysis.practiceAreaDistribution[area] || 0) + 1;
    }

    analysis.avgConfidence /= documents.length;
    analysis.riskAssessment = analysis.avgConfidence < 0.5 ? 'high' :
                             analysis.avgConfidence < 0.8 ? 'medium' : 'low';

    return analysis;
  });
</script>
```

### ❌ **Avoid Effect-Based Derived State**

```svelte
<!-- ❌ WRONG: Using effects for derived values -->
<script>
  let count = $state(0);
  let doubled = $state(0);

  $effect(() => {
    doubled = count * 2; // Don't do this!
  });
</script>

<!-- ✅ CORRECT: Use $derived instead -->
<script>
  let count = $state(0);
  let doubled = $derived(count * 2);
</script>
```

---

## ⚡ **3. Effects Best Practices**

### ✅ **Use `$effect` for Side Effects Only**

```svelte
<script>
  let searchQuery = $state('');
  let searchResults = $state([]);

  // ✅ CORRECT: API calls and side effects
  $effect(() => {
    if (searchQuery.length > 2) {
      performSearch(searchQuery);
    }
  });

  // ✅ CORRECT: DOM manipulation
  let canvasElement = $state(null);

  $effect(() => {
    if (canvasElement && searchResults.length > 0) {
      drawSearchResultsChart(canvasElement, searchResults);
    }
  });

  // ✅ CORRECT: Cleanup with teardown
  $effect(() => {
    const interval = setInterval(() => {
      checkForNewDocuments();
    }, 30000);

    return () => clearInterval(interval);
  });
</script>
```

### ✅ **Use `$effect.pre` for Pre-DOM Updates**

```svelte
<script>
  let documentList = $state([]);
  let scrollContainer = $state(null);

  // ✅ CORRECT: Pre-DOM effect for scroll management
  $effect.pre(() => {
    if (!scrollContainer) return;

    documentList.length; // Track length changes

    // Auto-scroll to bottom when new documents are added
    if (scrollContainer.scrollTop + scrollContainer.clientHeight >
        scrollContainer.scrollHeight - 20) {
      tick().then(() => {
        scrollContainer.scrollTo(0, scrollContainer.scrollHeight);
      });
    }
  });
</script>
```

### ❌ **Avoid These Effect Anti-Patterns**

```svelte
<!-- ❌ WRONG: State updates in effects -->
<script>
  let data = $state([]);
  let processedData = $state([]);

  $effect(() => {
    processedData = data.map(item => ({ ...item, processed: true }));
    // Use $derived instead!
  });
</script>

<!-- ❌ WRONG: Multiple effects for the same dependency -->
<script>
  let searchQuery = $state('');

  $effect(() => {
    if (searchQuery) validateQuery(searchQuery);
  });

  $effect(() => {
    if (searchQuery) logSearch(searchQuery);
  });

  // ✅ CORRECT: Combine related effects
  $effect(() => {
    if (searchQuery) {
      validateQuery(searchQuery);
      logSearch(searchQuery);
    }
  });
</script>
```

---

## 📝 **4. Props and Component Communication**

### ✅ **Modern Props Declaration**

```svelte
<!-- ✅ CORRECT: Props with destructuring -->
<script>
  let {
    documents = [],
    searchQuery = '',
    onSearch = () => {},
    variant = 'default',
    ...restProps
  } = $props();
</script>
```

### ✅ **Bindable Props for Two-Way Communication**

```svelte
<!-- Enhanced Document Upload Component -->
<script>
  let {
    uploadedFiles = $bindable([]),
    isUploading = $bindable(false),
    onUploadComplete = () => {},
    maxFiles = 10,
    acceptedTypes = ['.pdf', '.docx', '.txt']
  } = $props();

  async function handleFileUpload(files) {
    isUploading = true;

    try {
      const processed = await Promise.all(
        files.map(file => processLegalDocument(file))
      );

      uploadedFiles = [...uploadedFiles, ...processed];
      onUploadComplete(processed);
    } finally {
      isUploading = false;
    }
  }
</script>
```

### ✅ **Type-Safe Props**

```svelte
<script lang="ts">
  interface DocumentSearchProps {
    documents: LegalDocument[];
    searchQuery: string;
    onSearch: (query: string) => void;
    filters?: SearchFilters;
    variant?: 'compact' | 'expanded';
  }

  let {
    documents,
    searchQuery,
    onSearch,
    filters = {},
    variant = 'expanded'
  }: DocumentSearchProps = $props();
</script>
```

---

## 🔧 **5. Component Architecture Patterns**

### ✅ **Smart vs. Presentational Components**

```svelte
<!-- Smart Component: DocumentSearchContainer.svelte -->
<script>
  import DocumentSearchView from './DocumentSearchView.svelte';
  import { enhancedSemanticSearch } from '$lib/services/rag-service.js';

  let searchQuery = $state('');
  let searchResults = $state([]);
  let isLoading = $state(false);
  let searchFilters = $state({});

  async function performSearch() {
    if (!searchQuery.trim()) return;

    isLoading = true;
    try {
      const results = await enhancedSemanticSearch(searchQuery, searchFilters);
      searchResults = results;
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      isLoading = false;
    }
  }
</script>

<DocumentSearchView
  bind:searchQuery
  bind:searchFilters
  {searchResults}
  {isLoading}
  {performSearch}
/>
```

```svelte
<!-- Presentational Component: DocumentSearchView.svelte -->
<script>
  import { ButtonBits, InputBits, CardBits } from '$lib/components/ui/bits-ui';

  let {
    searchQuery = $bindable(''),
    searchFilters = $bindable({}),
    searchResults = [],
    isLoading = false,
    performSearch = () => {}
  } = $props();
</script>

<div class="search-container">
  <InputBits
    bind:value={searchQuery}
    placeholder="Search legal documents..."
    onkeydown={(e) => e.key === 'Enter' && performSearch()}
  />

  <ButtonBits
    onclick={performSearch}
    loading={isLoading}
    variant="primary"
  >
    Search
  </ButtonBits>

  {#each searchResults as result}
    <CardBits variant="elevated">
      <h3>{result.title}</h3>
      <p>{result.excerpt}</p>
    </CardBits>
  {/each}
</div>
```

### ✅ **Composition with Snippets**

```svelte
<!-- Flexible Card Component -->
<script>
  let {
    children,
    header,
    footer,
    variant = 'default'
  } = $props();
</script>

<div class="card card--{variant}">
  {#if header}
    <div class="card__header">
      {@render header()}
    </div>
  {/if}

  <div class="card__content">
    {@render children()}
  </div>

  {#if footer}
    <div class="card__footer">
      {@render footer()}
    </div>
  {/if}
</div>

<!-- Usage -->
<Card variant="legal-document">
  {#snippet header()}
    <h3>Contract Analysis</h3>
  {/snippet}

  <p>Document content goes here...</p>

  {#snippet footer()}
    <ButtonBits>Download PDF</ButtonBits>
  {/snippet}
</Card>
```

---

## 🎯 **6. Performance Optimization**

### ✅ **Efficient List Rendering**

```svelte
<script>
  let documents = $state([]);
  let visibleCount = $state(50);

  // ✅ CORRECT: Virtual scrolling for large lists
  let visibleDocuments = $derived(documents.slice(0, visibleCount));

  function loadMore() {
    visibleCount += 50;
  }
</script>

{#each visibleDocuments as document (document.id)}
  <DocumentCard {document} />
{/each}

{#if visibleCount < documents.length}
  <ButtonBits onclick={loadMore}>Load More</ButtonBits>
{/if}
```

### ✅ **Optimized State Updates**

```svelte
<script>
  let searchResults = $state([]);

  // ✅ CORRECT: Batch updates
  function updateMultipleDocuments(updates) {
    searchResults = searchResults.map(doc => {
      const update = updates.find(u => u.id === doc.id);
      return update ? { ...doc, ...update } : doc;
    });
  }

  // ✅ CORRECT: Use raw state for non-reactive data
  let staticConfig = $state.raw({
    apiEndpoints: {
      search: '/api/rag/semantic-search',
      upload: '/api/documents/upload-enhanced'
    },
    limits: {
      maxFileSize: 10 * 1024 * 1024,
      maxSearchResults: 100
    }
  });
</script>
```

---

## 🛡️ **7. Error Handling and Debugging**

### ✅ **Comprehensive Error Handling**

```svelte
<script>
  import { ErrorBoundary } from '$lib/components/ErrorBoundary.svelte';

  let searchState = $state({
    query: '',
    results: [],
    error: null,
    isLoading: false
  });

  async function safeSearch(query) {
    searchState.isLoading = true;
    searchState.error = null;

    try {
      const results = await enhancedSemanticSearch(query);
      searchState.results = results;
    } catch (error) {
      searchState.error = {
        message: error.message,
        code: error.code,
        timestamp: new Date().toISOString()
      };
      console.error('Search failed:', error);
    } finally {
      searchState.isLoading = false;
    }
  }
</script>

<ErrorBoundary>
  {#if searchState.error}
    <div class="error-container">
      <h3>Search Error</h3>
      <p>{searchState.error.message}</p>
      <ButtonBits onclick={() => safeSearch(searchState.query)}>
        Retry Search
      </ButtonBits>
    </div>
  {/if}

  <!-- Search component content -->
</ErrorBoundary>
```

### ✅ **Development Debugging**

```svelte
<script>
  let documentState = $state({ documents: [], filters: {} });

  // ✅ CORRECT: Use $inspect for debugging
  $inspect(documentState).with((type, state) => {
    if (type === 'update') {
      console.log('Document state updated:', state);
    }
  });

  // ✅ CORRECT: Use $inspect.trace for effect debugging
  $effect(() => {
    $inspect.trace('Document filter effect');

    if (documentState.filters.practiceArea) {
      filterDocuments(documentState.filters);
    }
  });
</script>
```

---

## 🏢 **8. Legal AI Platform Integration**

### ✅ **RAG Service Integration**

```svelte
<script>
  import { ragService } from '$lib/services/langchain-rag.js';
  import { semanticSearchAPI } from '$lib/services/enhanced-legal-search.js';

  let ragSession = $state({
    isActive: false,
    context: [],
    currentQuery: '',
    results: []
  });

  // ✅ CORRECT: Reactive RAG session management
  let sessionSummary = $derived.by(() => {
    if (!ragSession.isActive) return null;

    return {
      queryCount: ragSession.context.length,
      topPracticeAreas: getTopPracticeAreas(ragSession.results),
      avgConfidence: calculateAvgConfidence(ragSession.results),
      suggestedFollowups: generateFollowupQuestions(ragSession.results)
    };
  });

  async function performRAGSearch(query) {
    ragSession.currentQuery = query;

    try {
      // Primary search through enhanced semantic API
      const semanticResults = await semanticSearchAPI.search(query);

      // Fallback to LangChain RAG if needed
      const ragResults = semanticResults.length < 3
        ? await ragService.searchDocuments(query)
        : [];

      const combinedResults = [...semanticResults, ...ragResults];

      ragSession.results = combinedResults;
      ragSession.context.push({
        query,
        results: combinedResults,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('RAG search failed:', error);
      throw error;
    }
  }
</script>
```

### ✅ **Document Processing Integration**

```svelte
<script>
  import { documentProcessor } from '$lib/services/enhanced-document-upload.js';

  let uploadState = $state({
    files: [],
    processing: false,
    results: [],
    errors: []
  });

  // ✅ CORRECT: Reactive upload progress
  let uploadProgress = $derived({
    total: uploadState.files.length,
    completed: uploadState.results.length,
    failed: uploadState.errors.length,
    inProgress: uploadState.processing,
    percentage: uploadState.files.length > 0
      ? ((uploadState.results.length + uploadState.errors.length) / uploadState.files.length) * 100
      : 0
  });

  async function processDocuments(files) {
    uploadState.files = Array.from(files);
    uploadState.processing = true;
    uploadState.results = [];
    uploadState.errors = [];

    for (const file of uploadState.files) {
      try {
        const result = await documentProcessor.processDocument(file);
        uploadState.results = [...uploadState.results, result];
      } catch (error) {
        uploadState.errors = [...uploadState.errors, { file, error }];
      }
    }

    uploadState.processing = false;
  }
</script>
```

---

## 📋 **9. Migration Checklist**

### ✅ **Svelte 4 to Svelte 5 Migration**

```svelte
<!-- ❌ OLD: Svelte 4 patterns -->
<script>
  export let documents = [];
  export let onSearch = () => {};

  let searchQuery = '';
  let filteredDocs = [];

  $: filteredDocs = documents.filter(doc =>
    doc.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  $: console.log('Search query changed:', searchQuery);

  onMount(() => {
    console.log('Component mounted');
  });
</script>

<!-- ✅ NEW: Svelte 5 patterns -->
<script>
  import { onMount } from 'svelte';

  let { documents = [], onSearch = () => {} } = $props();

  let searchQuery = $state('');

  let filteredDocs = $derived(
    documents.filter(doc =>
      doc.title.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  $effect(() => {
    console.log('Search query changed:', searchQuery);
  });

  onMount(() => {
    console.log('Component mounted');
  });
</script>
```

---

## 🎨 **10. UI Component Library Integration**

### ✅ **bits-ui Integration Patterns**

```svelte
<script>
  import {
    ButtonBits,
    InputBits,
    CardBits,
    DialogBits,
    TabsBits
  } from '$lib/components/ui/bits-ui';

  let activeTab = $state('search');
  let dialogOpen = $state(false);

  // ✅ CORRECT: Unified state management with UI components
  let legalAIState = $state({
    searchQuery: '',
    uploadedDocs: [],
    activeFilters: {},
    systemStatus: 'ready'
  });
</script>

<TabsBits bind:value={activeTab}>
  <TabsBits.List>
    <TabsBits.Trigger value="search">Document Search</TabsBits.Trigger>
    <TabsBits.Trigger value="upload">Upload Documents</TabsBits.Trigger>
    <TabsBits.Trigger value="analysis">AI Analysis</TabsBits.Trigger>
  </TabsBits.List>

  <TabsBits.Content value="search">
    <CardBits variant="elevated" padding="lg">
      <InputBits
        bind:value={legalAIState.searchQuery}
        placeholder="Search legal documents..."
        label="Document Search"
      />
      <ButtonBits onclick={() => performSearch(legalAIState.searchQuery)}>
        Search
      </ButtonBits>
    </CardBits>
  </TabsBits.Content>
</TabsBits>
```

---

## 🚀 **11. Production Deployment Best Practices**

### ✅ **Environment Configuration**

```svelte
<script>
  import { dev } from '$app/environment';
  import { page } from '$app/stores';

  // ✅ CORRECT: Environment-aware configuration
  let config = $state.raw({
    apiBaseUrl: dev ? 'http://localhost:8080' : 'https://api.legal-ai.com',
    enableDebugLogs: dev,
    ragService: {
      maxResults: dev ? 10 : 50,
      timeout: dev ? 5000 : 15000
    }
  });

  // ✅ CORRECT: Production-safe logging
  function logDebug(message, data) {
    if (config.enableDebugLogs) {
      console.log(message, data);
    }
  }
</script>
```

---

## 📊 **12. Testing Patterns**

### ✅ **Component Testing**

```typescript
// DocumentSearch.test.ts
import { render, fireEvent } from '@testing-library/svelte';
import DocumentSearch from '../DocumentSearch.svelte';

test('performs search when button clicked', async () => {
  const mockSearch = vi.fn();
  const { getByRole, getByLabelText } = render(DocumentSearch, {
    props: { onSearch: mockSearch }
  });

  const searchInput = getByLabelText('Document Search');
  const searchButton = getByRole('button', { name: /search/i });

  await fireEvent.input(searchInput, { target: { value: 'contract law' } });
  await fireEvent.click(searchButton);

  expect(mockSearch).toHaveBeenCalledWith('contract law');
});
```

---

## 🎯 **Summary: Key Problem Solutions**

| Problem | Solution | Pattern |
|---------|----------|---------|
| **State not reactive** | Use `$state` with `let`, never `const` | `let count = $state(0)` |
| **Derived values not updating** | Use `$derived` instead of `$effect` | `let double = $derived(count * 2)` |
| **Infinite effect loops** | Don't update state in effects | Use `$derived` for computed values |
| **Props not reactive** | Use `$props()` with destructuring | `let { value } = $props()` |
| **Complex component communication** | Use `$bindable` for two-way binding | `let { value = $bindable() } = $props()` |
| **Performance issues** | Use keyed `#each`, virtual scrolling | `{#each items as item (item.id)}` |
| **Memory leaks** | Return cleanup functions from effects | `return () => clearInterval(id)` |
| **Hard to debug** | Use `$inspect` and `$inspect.trace` | `$inspect(state).with(console.log)` |

This guide ensures your Legal AI platform follows Svelte 5 best practices while maintaining compatibility with your existing RAG system and bits-ui integration! 🚀