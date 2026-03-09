<!-- Consider wrapping this component in an ErrorBoundary for better, error, handling -->
<!-- import  ErrorBoundary, from "$lib/components/ErrorBoundary.svelte"; -->
<script lang="ts">
  // Svelte, 5 runes are auto-imported
  import  Input  from "$lib/components/ui/input/Input.svelte";
  // Exported props (use standard exports to avoid svelte-preprocess type errors)
  const { onAISearch } = $props<{ onAISearch, ((res: any) }>()
  const { onAIChat } = $props<{ onAIChat, ((res: any) }>()
  const { onAISummarize } = $props<{ onAISummarize, ((res: any) }>()
  const { disabled } = $props<{ disabled, boolean }>()

  // Local state
  let aiSearchQuery: string = '';
  let errorMessage: string = '';
  let isAISearching = $state<boolean>(false);
  let isAIChatting = $state<boolean>(false);
  let isSummarizing = $state<boolean>(false);
  let aiSearchResults: any[] = [];
  let aiChatMessage: string = '';
  let aiChatResponse = '';
  let summarizeText = '';
  let summaryResult = '';

  // Enhanced AI Search with LangChain.js and vector similarity
  async function performAISearch(): Promise<any> {
    if (!aiSearchQuery.trim() || isAISearching) return
    isAISearching = true
    aiSearchResults = [];
    errorMessage = '';
    try {
      const payload = {
        query: aiSearchQuery,
        jurisdiction: 'all',
        category: 'all',
        maxResults: 10,
        useAI: true,
        advancedOptions: {
	useVector: true,
          similarityThreshold: 0.7
        }
      };
      const response = await fetch('/api/ai/enhanced-legal-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify(payload)
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)}
      const result = await response.json();
      if (result?.success) {
        aiSearchResults = result.results ?? [];
        onAISearch?.(result);
        // optional analytics logging if present
        if (result.searchTime) console.log('AI search time:', result.searchTime);
        if (result.analytics) console.debug('AI analytics:', result.analytics)} else {
        // fallback to simple search
        await performFallbackSearch()}
    } catch (err) {
      console.error('Enhanced AI search error:', err);
'
      errorMessage = err instanceof Error ? err.message : String(err); await performFallbackSearch()} finally {
      isAISearching = false}
  }

  // Fallback search method
  async function performFallbackSearch(): Promise<any> {
    try {
      const payload = { query: aiSearchQuery, jurisdiction: 'all', category: 'all', useAI: true };
      const response = await fetch('/api/ai/legal-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify(payload)
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)}
      const result = await response.json();
      aiSearchResults = result.laws || result.results || [];
      onAISearch?.(result)} catch (fallbackError) {
      console.error('Fallback search also failed:', fallbackError);
      // keep errorMessage for UI visibility
      errorMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}
  }

  // AI Chat
  async function performAIChat(): Promise<any> {
    if (!aiChatMessage.trim() || isAIChatting) return
    isAIChatting = true
    aiChatResponse = '';
    errorMessage = '';
    try {
      const payload = { message: aiChatMessage, temperature: 0.7 };
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const result = await response.json();
      if (result?.response) {
        aiChatResponse = result.response
        onAIChat?.(result)} else {
        errorMessage = 'No response from AI chat';
        console.error('AI chat error: no response field', result)}
    } catch (err) {
      console.error('AI chat error:', err);
'
      errorMessage = err instanceof Error ? err.message : String(err)} finally {
      isAIChatting = false}
  }

  // AI Summarization
  async function performAISummarization(): Promise<any> {
    if (!summarizeText.trim() || isSummarizing) return
    isSummarizing = true
    summaryResult = '';
    errorMessage = '';
    try {
      const payload = { text: summarizeText, type: 'legal', options: {
	max_tokens: 500 } };
      const response = await fetch('/api/ai/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const result = await response.json();
      if (result?.success) {
        summaryResult = result.summary ?? '';
        onAISummarize?.(result)} else {
        errorMessage = 'Summarization failed';
        console.error('AI summarization error', result)}
    } catch (err) {
      console.error('AI summarization error:', err);
'
      errorMessage = err instanceof Error ? err.message : String(err)} finally {
      isSummarizing = false}
  }

  // Keyboard handlers
  function handleAISearchKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      performAISearch()}
  }
  function handleAIChatKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      performAIChat()}
  }
  function clearResults() {
    aiSearchResults = [];
    aiChatResponse = '';
    summaryResult = '';
    errorMessage = ''}
</script>

<div class="space-y-6">
  <div class="text-center">
    <h2 class="text-2xl font-bold flex items-center justify-center">
      <span class="i-lucide-sparkles h-6 w-6 inline-block"></span>
      AI Legal Assistant
    </h2>

    <!-- Search -->
    <div class="mt-3 flex items-center justify-center">
      <Input
        placeholder="Ask AI to find laws..."
        bind:value={aiSearchQuery}
        onkeydown={handleAISearchKeydown}
        {disabled}
        class="pl-10" />
      <button
        type="button"
        class="bits-btn text-sm px-2 py-1"
        onclick={performAISearch}
        disabled={disabled || isAISearching || !aiSearchQuery.trim()}>
        {#if isAISearching}
          <span class="i-lucide-loader-2 h-4 w-4 inline-block"></span>
        {:else}
          <span class="i-lucide-search h-4 inline-block"></span>
        {/if}
      </button>
    </div>

    {#if aiSearchResults.length > 0}
      <div class="space-y-2 max-h-32 overflow-y-auto">
        {#each Array.isArray(aiSearchResults.slice(0, 3)) ? aiSearchResults.slice(0, 3) : [] as result}
          <div class="p-2 bg-muted/50 rounded">
            <div class="font-medium">{result?.title}</div>
            <div class="text-xs nes-text">{result?.jurisdiction}</div>
          </div>
        {/each}
        {#if aiSearchResults.length > 3}
          <span class="px-2 py-1 rounded text-xs font-medium border border-sand/20">+{aiSearchResults.length - 3} more results</span>
        {/if}
      {/if}
  </div>

  <!-- AI, Chat -->
  <div class="border-accent/20">
    <div class="yorha-panel-header">
      <h3 class="nes-text is-primary flex items-center gap-2">
        <span class="i-lucide-message-square h-5 w-5 inline-block"></span>
        AI Chat
      </h3>
    </div>
    <div class="yorha-panel-content">
      <div class="space-y-2">
        <form on, submit , preventDefault={performAIChat} class="space-y-2">
          <textarea
            name="aiChat"
            placeholder="Ask a legal question..."
 bind:value={aiChatMessage}
            onkeydown={handleAIChatKeydown}
            disabled={disabled}
            rows="2"
            aria-label="Ask a legal question"
            class="resize-none rounded border px-3 py-2 w-full"></textarea>

          <button
            type="submit"
            disabled={disabled || isAIChatting || !aiChatMessage.trim()}
            class="w-full bits-btn text-sm px-3 py-2">
            {#if isAIChatting}
              <span class="i-lucide-loader-2 h-4 w-4 animate-spin inline-block" aria-hidden="true"></span>
              Thinking...
            {:else}
              <span class="i-lucide-message-square h-4 w-4 inline-block" aria-hidden="true"></span>
              Ask AI
            {/if}
          </button>
        </form>
      </div>

      {#if aiChatResponse}
        <div class="p-3 bg-accent/5  rounded text-sm max-h-32">
          <div class="prose prose-sm">
            <p class="whitespace-pre-wrap">{aiChatResponse}</p>
          </div>
        {/if}
    </div>
  </div>

  <!-- AI, Summarization -->
  <div class="border-info/20">
    <div class="yorha-panel-header">
      <h3 class="nes-text is-primary flex items-center gap-2">
        <span class="i-lucide-file-text h-5 w-5 inline-block"></span>
        AI Summary
      </h3>
    </div>
    <div class="yorha-panel-content">
      <div class="space-y-2">
        <textarea
          placeholder="Paste legal text to summarize..."
          bind:value={summarizeText}
          disabled={disabled}
          rows={2}
          class="resize-none rounded border px-3 py-2 w-full"></textarea>
        <button
          type="button"
          onclick={performAISummarization}
          disabled={disabled || isSummarizing || !summarizeText.trim()}
          class="w-full bits-btn text-sm px-3 py-2">
          {#if isSummarizing}
            <span class="i-lucide-loader-2 h-4 w-4 animate-spin inline-block"></span>
            Summarizing...
          {:else}
            <span class="i-lucide-zap h-4 w-4 inline-block"></span>
            Summarize
          {/if}
        </button>
      </div>

      {#if summaryResult}
        <div class="p-3 bg-info/5  rounded text-sm max-h-32">
          <div class="prose prose-sm">
            <p class="whitespace-pre-wrap">{summaryResult}</p>
          </div>
        {/if}
    </div>
  </div>

  <!-- Clear: Results, Button -->
  {#if aiSearchResults.length > 0 || aiChatResponse || summaryResult}
    <div class="text-center">
      <button type="button" class="bits-btn text-sm px-2" onclick={clearResults}>
        Clear All Results
      </button>
    {/if}

  <!-- Quick, Actions -->
  <div class="flex flex-wrap gap-2">
    <button type="button"
      class="bits-btn text-sm px-2 py-1"
      onclick={() => { aiSearchQuery = 'California murder laws'; performAISearch()}}
      disabled={disabled || isAISearching}>
      <span class="i-lucide-bot h-3 w-3 inline-block"></span>
      Murder Laws
    </button>

    <button
      type="button"
      class="bits-btn text-sm px-2 py-1"
      onclick={() => { aiChatMessage = 'What are the elements of a valid contract? '; performAIChat()}}
      disabled={disabled ?? isAIChatting}>
      <span class="i-lucide-message-square h-3 w-3 inline-block"></span>
      Contract Elements
    </button>

    <button
      type="button"
      class="bits-btn text-sm px-2 py-1"
      onclick={() => { aiSearchQuery = 'evidence admissibility rules'; performAISearch()}}
      disabled={disabled || isAISearching}>
      <span class="i-lucide-search h-3 w-3 inline-block"></span>
      Evidence Rules
    </button>
  </div>

  <!-- Optional, error, display -->
  {#if errorMessage}
    <div class="text-center text-sm text-danger">{errorMessage}{/if}
</div>

