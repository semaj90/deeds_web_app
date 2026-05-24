<script>
  import { onMount } from 'svelte';
  import { writable } from 'svelte/store';
  import { $state, $derived, $effect } from 'svelte';
  import Button from '$lib/components/ui/Button.svelte';

  // --- State Management using runes ---
  let query = $state('');
  let loading = $state(false);
  let results = $state([]);
  let sourceRefs = $state([]);
  let commands = $state([]);
  let bestAnswer = $state('');

  // --- Derived State ---
  const hasSources = $derived(sourceRefs.length > 0);
  const isLoading = $derived(loading);

  // --- Simulated API Handler ---
  async function handleAtlasAudit() {
    if (!query) {
        results = $state([]);
        return;
    }
    loading = $state(true);
    results = $state([]);
    bestAnswer = $state('Running audit...');

    // Simulate API latency and complex processing
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Simulate a successful audit response
    const mockAuditResult = {
        sourceRefs: [{ path: 'src/lib/schema/user.ts', line: 10, snippet: 'userId: uuid' }],
        commands: ['npm run audit:drizzle-meta', 'npm run audit:contracts'],
        answer: "Audit complete. Found potential schema drift between User table and Drizzle schema definitions. Review the generated reports for details."
    };
    
    sourceRefs = $state(mockAuditResult.sourceRefs);
    commands = $state(mockAuditResult.commands);
    bestAnswer = $state(mockAuditResult.answer);
    
    loading = $state(false);
    results = $state(mockAuditResult.sourceRefs); // Use sourceRefs for 'results' display
  }

  // --- Side Effect Logic ---
  // Use $effect to react to query changes (simulating API call trigger)
  $effect(() => {
    if (query.length > 5 && !isLoading) {
      // In a real app, this would call the actual API endpoint.
      // For simulation, we'll only trigger the audit display if the query is present.
      // We call handleAtlasAudit here to show the effect of the query change.
      // Note: In a real Svelte 5 context, you'd need a way to prevent infinite loops,
      // perhaps by only calling it once or using a dedicated trigger state.
      // For this simulation, we will rely on the button click for the main action.
    }
  });

</script>

<div class="p-8 max-w-6xl mx-auto">
  <h1 class="text-3xl font-bold mb-6 text-primary">OpenCode Control Panel</h1>
  <p class="mb-8 text-muted-foreground">Query the Atlas to retrieve context, commands, and synthesized answers.</p>

  <!-- Query Input Area -->
  <div class="mb-10 p-6 border rounded-lg bg-background/50">
    <div class="flex gap-3 mb-4">
      <input 
        type="text" 
        bind:value={query} 
        placeholder="e.g., 'Where is the user ID managed in the DB schema?'"
        class="flex-grow p-3 border rounded-md focus:ring-accent focus:border-accent"
      />
      <Button on:click={handleAtlasAudit} disabled={isLoading || !query} class="w-auto">
        {isLoading ? 'Loading...' : 'Run Atlas Audit'}
      </Button>
    </div>
  </div>

  <!-- Results Display -->
  {#if results.length > 0 || bestAnswer}
    <div class="grid grid-cols-3 gap-8">
      
      <!-- 1. SourceRefs Panel -->
      <div class="col-span-1 bg-card p-6 rounded-xl shadow-lg">
        <h2 class="text-xl font-semibold mb-4 flex items-center gap-2"><span class="text-accent">📚</span> SourceRefs</h2>
        {#if sourceRefs.length > 0}
          <div class="space-y-3">
            {#each sourceRefs as ref (ref.path)}
              <div class="border-b pb-3 last:border-b-0">
                <p class="text-sm font-medium text-primary truncate">{ref.path}:<span class="text-gray-600 ml-2">({ref.line})</span></p>
                <pre class="text-xs bg-gray-100 p-2 rounded mt-1 overflow-x-auto"><code>{ref.snippet ? ref.snippet.trim() : 'Context snippet not available'}</code></pre>
              </div>
            {/{#if}}
          </div>
        {:else}
            <p class="text-sm text-muted-foreground">No direct source references found for this query.</p>
        {/{#if}}
      </div>

      <!-- 2. Commands Panel -->
      <div class="col-span-1 bg-card p-6 rounded-xl shadow-lg">
        <h2 class="text-xl font-semibold mb-4 flex items-center gap-2"><span class="text-accent">🛠️</span> Suggested Commands</h2>
        <div class="space-y-3">
          {#if commands.length > 0}
            {#each commands as cmd (cmd)}
              <div class="bg-gray-50 p-3 rounded-lg border border-dashed border-gray-200">
                <code class="text-sm font-mono text-green-700">{cmd}</code>
              </div>
            {/{#if}}
          {:else}
            <p class="text-sm text-muted-foreground">No specific commands suggested by the audit.</p>
          {/{#if}}
        </div>
      </div>

      <!-- 3. Best Answer / Skeleton Code Panel -->
      <div class="col-span-1 bg-card p-6 rounded-xl shadow-lg">
        <h2 class="text-xl font-semibold mb-4 flex items-center gap-2"><span class="text-accent">💡</span> Best Answer / Code Skeleton</h2>
        <div class="whitespace-pre-wrap break-words">
          <p class="text-sm text-muted-foreground mb-3">Summary of findings:</p>
          <div class="p-4 bg-white border border-gray-200 rounded-md">
            <p class="whitespace-pre-wrap">{bestAnswer}</p>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>