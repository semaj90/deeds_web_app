<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- AI Search Bar: Svelte 5, Bits UI, UnoCSS, analytics logging -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  import type { Input, Button  } from './index.js';
  import Search from 'lucide-svelte';
  interface Props {
    placeholder?: string;
    userContext?: any;
    neo4jContext?: any;
    analyticsLog?: (_event: any) => void;
    onResults?: (results: any) => void;
    onsearch?: (query: string) => void;
  }
  const {
    placeholder = 'Ask AI...',
    userContext = {},
    neo4jContext = {},
    analyticsLog = () => ,
    onResults = () => ,
    onsearch
  }: Props = $props();
  let query = $state('');
  let loading = $state(false);
  async function handleSearch() {
    if (!query) return;
    loading = true;
    analyticsLog({ event: 'ai_search_submitted', query, userContext, timestamp: Date.now() });
    try {
      const res = await fetch('/api/semantic-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, userContext, neo4jContext })
      });
      const data = await res.json();
      analyticsLog({ event: 'ai_search_result', query, resultCount: data.results?.length, timestamp: Date.now() });
      onResults?.(data.results);
      onsearch?.(query);
    } catch (error) {
      analyticsLog({ event: 'ai_search_error', query, error: error.message, timestamp: Date.now() });
    } finally {
      loading = false;
    }
  }
  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') handleSearch();
  }
</script>
<div class="flex gap-2 items-center w-full">
  <Input
    variant="search"
    bind:value={query}
    placeholder={placeholder}
    icon={Search}
    iconPosition="left"
    class="flex-1 vector-search-input"
    keydown={handleKeyDown}
    legal
    aiAssisted
  />
  <Button class="bits-btn" variant="yorha" onclick={handleSearch} loading={loading} legal aria-label="Search with AI">
<Search class="w-4 h-4 mr-1" />
    Search
</div>;