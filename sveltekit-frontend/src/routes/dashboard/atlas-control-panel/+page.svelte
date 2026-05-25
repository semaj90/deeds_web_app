<script>
  import { onMount } from 'svelte';
  import { $state, $derived, $effect } from 'svelte';
  import Button from '$lib/components/ui/Button.svelte';

  // --- State Management using runes ---
  let query = $state('');
  let loading = $state(false);
  let results = $state([]);
  let sourceRefs = $state([]);
  let commands = $state([]);
  let bestAnswer = $state('');
  let validationError = $state('');
  let retryCount = $state(0);
  let lastToolCall = $state('');

  // --- Derived State ---
  const hasSources = $derived(sourceRefs.length > 0);
  const isLoading = $derived(loading);

  // --- Simulated API Handler / LangGraph Validation ---
  async function handleAtlasAudit() {
    if (!query) {
        results = [];
        return;
    }
    
    loading = true;
    validationError = '';
    
    // Simulate API latency
    await new Promise(resolve => setTimeout(resolve, 800));

    // Mock API Response that comes from MCP LangGraph
    // We validate it according to the "killer feature" rules
    let mockAuditResult = {
        toolCall: 'atlas.search',
        sourceRefs: [{ path: 'src/lib/schema/user.ts', line: 10, snippet: 'userId: uuid' }],
        commands: ['npm run audit:drizzle-meta'],
        answer: "Found schema references."
    };

    // Test specific fail paths based on keywords to demonstrate the UI
    if (query.includes('generic')) {
       mockAuditResult.sourceRefs = [];
       mockAuditResult.commands = [];
       mockAuditResult.answer = "I think it's somewhere in the codebase.";
    } else if (query.includes('no command')) {
       mockAuditResult.commands = [];
    } else if (query.includes('duplicate')) {
       mockAuditResult.toolCall = lastToolCall;
    }

    // Validation Rules
    if (mockAuditResult.toolCall === lastToolCall && lastToolCall !== '') {
        validationError = "Duplicate tool call = stop/re-route.";
        loading = false;
        return;
    }
    
    lastToolCall = mockAuditResult.toolCall;

    if (mockAuditResult.sourceRefs.length === 0 && mockAuditResult.commands.length === 0) {
        validationError = "Generic answer = failureLookup.";
        bestAnswer = "Re-routing to atlas.failureLookup...";
        loading = false;
        return;
    }

    if (mockAuditResult.sourceRefs.length === 0) {
        if (retryCount < 1) {
            retryCount++;
            validationError = "No sourceRefs = not done. Retrying...";
            loading = false;
            // In a real app we would retry automatically
            return;
        } else {
            validationError = "Max retries reached. No sourceRefs provided.";
            loading = false;
            return;
        }
    }

    if (mockAuditResult.commands.length === 0) {
        validationError = "No command = not actionable.";
        loading = false;
        return;
    }

    // Success path
    retryCount = 0;
    sourceRefs = mockAuditResult.sourceRefs;
    commands = mockAuditResult.commands;
    bestAnswer = mockAuditResult.answer;
    results = mockAuditResult.sourceRefs;
    loading = false;
  }
</script>

<div class="p-8 max-w-6xl mx-auto">
  <h1 class="text-3xl font-bold mb-6 text-primary">OpenCode Atlas Dashboard</h1>
  <p class="mb-8 text-muted-foreground">Monitor runs, failures, chunks, and lessons with strict LangGraph validation.</p>

  <!-- Query Input Area -->
  <div class="mb-10 p-6 border rounded-lg bg-background/50">
    <div class="flex gap-3 mb-4">
      <input 
        type="text" 
        bind:value={query} 
        placeholder="e.g., 'Where is the user ID managed in the DB schema?'"
        class="flex-grow p-3 border rounded-md focus:ring-accent focus:border-accent"
      />
      <Button onclick={handleAtlasAudit} disabled={isLoading || !query} class="w-auto">
        {isLoading ? 'Loading...' : 'Run Atlas Audit'}
      </Button>
    </div>
    {#if validationError}
      <div class="mt-4 p-3 bg-red-100 text-red-800 border border-red-200 rounded-md">
        <strong>Validation Error:</strong> {validationError}
      </div>
    {/if}
  </div>

  <!-- Results Display -->
  {#if hasSources || bestAnswer}
    <div class="grid grid-cols-3 gap-8">
      
      <!-- 1. SourceRefs Panel -->
      <div class="col-span-1 bg-card p-6 rounded-xl shadow-lg border">
        <h2 class="text-xl font-semibold mb-4 flex items-center gap-2"><span class="text-accent">📚</span> SourceRefs</h2>
        {#if hasSources}
          <div class="space-y-3">
            {#each sourceRefs as ref}
              <div class="border-b pb-3 last:border-b-0">
                <p class="text-sm font-medium text-primary truncate">{ref.path}:<span class="text-gray-600 ml-2">({ref.line})</span></p>
                <pre class="text-xs bg-gray-100 p-2 rounded mt-1 overflow-x-auto"><code>{ref.snippet ? ref.snippet.trim() : 'Context snippet not available'}</code></pre>
              </div>
            {/each}
          </div>
        {:else}
            <p class="text-sm text-muted-foreground">No direct source references found.</p>
        {/if}
      </div>

      <!-- 2. Commands Panel -->
      <div class="col-span-1 bg-card p-6 rounded-xl shadow-lg border">
        <h2 class="text-xl font-semibold mb-4 flex items-center gap-2"><span class="text-accent">🛠️</span> Commands</h2>
        <div class="space-y-3">
          {#if commands.length > 0}
            {#each commands as cmd}
              <div class="bg-gray-50 p-3 rounded-lg border border-dashed border-gray-200">
                <code class="text-sm font-mono text-green-700">{cmd}</code>
              </div>
            {/each}
          {:else}
            <p class="text-sm text-muted-foreground">No commands suggested.</p>
          {/if}
        </div>
      </div>

      <!-- 3. Lessons & Run State Panel -->
      <div class="col-span-1 bg-card p-6 rounded-xl shadow-lg border">
        <h2 class="text-xl font-semibold mb-4 flex items-center gap-2"><span class="text-accent">💡</span> Synthesis</h2>
        <div class="whitespace-pre-wrap break-words">
          <p class="text-sm text-muted-foreground mb-3">Best Answer:</p>
          <div class="p-4 bg-white border border-gray-200 rounded-md">
            <p class="whitespace-pre-wrap">{bestAnswer}</p>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>