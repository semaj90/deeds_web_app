<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- AI Assistant Integration Test Component -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  import type { Card, CardContent, CardHeader, CardTitle, Button, Alert  } from './index.js';
  import  Bot  from "lucide-svelte/icons/bot.svelte";
  import  CheckCircle  from "lucide-svelte/icons/check-circle.svelte";
  // Test data
  let testMessages = $state([
    { role: 'user', content: 'Can you analyze this contract for potential risks?', timestamp: new Date().toLocaleTimeString(), references: [] },
    {
      role: 'assistant',
      content:
        "I've analyzed the contract and found several key areas of concern. The liability clause in section 3.2 appears to heavily favor the other party, and the termination conditions in section 7.1 may be too restrictive for your organization.",
      timestamp: new Date().toLocaleTimeString(),
      references: [
        { id: 'contract-001', score: 0.95 },
        { id: 'legal-precedent-042', score: 0.87 },
      ],
    },
    { role: 'system', content: 'Analysis completed with 94% confidence. 2 similar cases found in database.', timestamp: new Date().toLocaleTimeString(), references: [] },
  ]);
  let searchQuery = $state('');
  let testStatus = $state('ready');
  // Local replacement state for the search bar
  let aiSearchTerm = $state('');
  function handleAISearch(query: string) {
    const q = (query ?? '').trim();
    if (!q) {
      // ignore empty searches
      return;
    }
    searchQuery = q;
    testStatus = 'searching';
    // clear local input while searching
    aiSearchTerm = '';
    // Simulate AI search
    setTimeout(() => {
      testStatus = 'completed';
      testMessages.push({
        role: 'assistant',
        content: `Based on your query: "${q}", I found relevant legal precedents and can provide detailed analysis. This appears to be related to ${q.includes('contract') ? 'contract law' : 'general legal matters'}.`,
        timestamp: new Date().toLocaleTimeString(),
        references: [{ id: 'search-result-001', score: 0.92 }],
      });
    }, 1500);
  }
  function clearMessages() {
    testMessages = [];
    testStatus = 'ready';
    searchQuery = '';
    aiSearchTerm = '';
  }
</script>
<div class="p-6 max-w-4xl mx-auto space-y-6">
  <Card class="border-2 border-primary/20">
    <CardHeader>
      <div class="flex items-center gap-3">
        <Bot class="w-8 h-8 text-primary" />
        <div>
          <CardTitle class="text-xl">AI Assistant Integration Test</CardTitle>
          <p class="text-sm text-muted-foreground mt-1">
            Testing enhanced-bits AI components with legal assistant functionality
          </p>
        </div>
      </div>
    </CardHeader>
    <CardContent class="space-y-4">
      <!-- Status Alert -->
      {#if testStatus === 'ready'}
        <div class="border-green-200 bg-green-50 rounded">
          <Alert>
            <div class="flex items-center gap-2 p-2">
              <CheckCircle class="w-4 h-4 text-green-600" />
              <span class="text-green-800">AI Assistant components loaded successfully. Ready for testing.</span>
            </div>
          </Alert>
        </div>
      {:else if testStatus === 'searching'}
        <div class="border-blue-200 bg-blue-50 rounded">
          <Alert>
            <div class="flex items-center gap-2 p-2">
              <Bot class="w-4 h-4 text-blue-600 animate-pulse" />
              <span class="text-blue-800">Processing AI search query...</span>
            </div>
          </Alert>
        </div>
      {:else if testStatus === 'completed'}
        <div class="border-purple-200 bg-purple-50 rounded">
          <Alert>
            <div class="flex items-center gap-2 p-2">
              <CheckCircle class="w-4 h-4 text-purple-600" />
              <span class="text-purple-800">AI search completed. Results added to conversation.</span>
            </div>
          </Alert>
        {/if}
      <!-- AI Search Bar Test (local replacement) -->
      <div class="space-y-2">
        <h3 class="font-semibold text-sm">AI Search Bar Component</h3>
        <!-- prevent default full-page submit -->
        <form on:submit|preventDefault={() => handleAISearch(aiSearchTerm)}>
          <div class="flex gap-2">
            <input
              class="form-control"
              name="ai-search"
              aria-label="AI search"
              placeholder="Test AI search functionality..."
              bind:value={aiSearchTerm}
            />
            <Button type="submit">Search</Button>
          </div>
        </form>
      </div>
      <!-- Chat Messages Test (inline rendering instead of AIChatMessage component) -->
      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <h3 class="font-semibold text-sm">AI Chat Messages Component</h3>
          <Button variant="ghost" size="sm" onclick={clearMessages} class="text-xs">Clear Messages</Button>
        </div>
        <div class="border rounded-lg p-4 max-h-96 overflow-y-auto space-y-3 bg-muted/20">
          {#if testMessages.length === 0}
            <div class="text-center text-muted-foreground py-8">
              <Bot class="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p class="text-sm">No test messages. Try using the search bar above.</p>
            </div>
          {:else}
            {#each Array.isArray(testMessages) ? testMessages : [] as message}
              <!-- inline representation -->
              <div class="p-3 rounded bg-white/60 border">
                <div class="flex justify-between items-center text-xs text-muted-foreground mb-1">
                  <strong class="capitalize">{message.role}</strong>
                  <span>{message.timestamp}</span>
                </div>
                <div class="text-sm">{message.content}</div>
                {#if message.references && message.references.length}
                  <div class="mt-2 text-xs text-muted-foreground">
                    <strong>References:</strong>
                    <ul class="list-disc list-inside ml-4">
                      {#each Array.isArray(message.references) ? message.references : [] as ref}
                        <li>{ref.id} ({ref.score})</li>
                      {/each}
                    </ul>
                  {/if}
              </div>
            {/each}
          {/if}
        </div>
      </div>
      <!-- Integration Status -->
      <div class="space-y-2">
        <h3 class="font-semibold text-sm">Integration Status</h3>
        <div class="grid grid-cols-2 gap-4">
          <div class="space-y-2">
            <div class="flex items-center gap-2">
              <CheckCircle class="w-4 h-4 text-green-500" />
              <span class="text-sm">Enhanced-bits Components</span>
            </div>
            <div class="flex items-center gap-2">
              <CheckCircle class="w-4 h-4 text-green-500" />
              <span class="text-sm">AI Chat Messages</span>
            </div>
            <div class="flex items-center gap-2">
              <CheckCircle class="w-4 h-4 text-green-500" />
              <span class="text-sm">AI Search Bar</span>
            </div>
          </div>
          <div class="space-y-2">
            <div class="flex items-center gap-2">
              <CheckCircle class="w-4 h-4 text-green-500" />
              <span class="text-sm">Svelte 5 Runes</span>
            </div>
            <div class="flex items-center gap-2">
              <CheckCircle class="w-4 h-4 text-green-500" />
              <span class="text-sm">Legal AI Context</span>
            </div>
            <div class="flex items-center gap-2">
              <CheckCircle class="w-4 h-4 text-green-500" />
              <span class="text-sm">Analytics Integration</span>
            </div>
          </div>
        </div>
      </div>
      <!-- Test Data -->
      {#if searchQuery}
        <div class="space-y-2">
          <h3 class="font-semibold text-sm">Last Search Query</h3>
          <div class="bg-muted p-3 rounded text-sm font-mono">
            {searchQuery}
          </div>
        {/if}
    </CardContent>
  </Card>
</div>
<style>
  /* Enhanced-bits styling integration */
  :global(.ai-test-container) {
    font-family: 'Inter', system-ui, sans-serif;
  }
</style>
