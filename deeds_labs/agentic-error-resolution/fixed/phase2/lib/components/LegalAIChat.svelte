<!-- @migration-task Error while migrating Svelte code: Expected a valid element or component name. Components must have a valid variable name or dot notation expression
https://svelte.dev/e/tag_invalid_name -->
<!-- @migration-task Error while migrating Svelte code: Expected a valid element or component name. Components must have a valid variable name or dot notation expression
https://svelte.dev/e/tag_invalid_name -->
<!-- @migration-task Error while migrating Svelte code: Expected a valid element or component name. Components must have a valid variable name or dot notation expression
https://svelte.dev/e/tag_invalid_name -->
<!-- @migration-task Error while migrating Svelte code: Expected a valid element or component name. Components must have a valid variable name or dot notation expression
https://svelte.dev/e/tag_invalid_name -->
<!-- Updated AI Chat for GPU Ollama -->
html
  let messages = $state<Array<{ role: string; content: string }>>([]);
  let input = $state('');
  let isLoading = $state(false);

  // Use an env fallback instead of hardcoded localhost
  const process.env.OLLAMA_URL = import.meta.env.VITE_OLLAMA_URL || 'http://localhost:11434';

  async function sendMessage() {
    if (!String(input).trim()) return;

    // Avoid mutating the $state array directly; assign a new array
    messages = [...messages, { role: 'user', content: input }];
    const userMessage = input;
    input = '';
    isLoading = true;

    try {
      const response = await fetch(`${process.env.OLLAMA_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gemma3-legal',
          prompt: userMessage,
          stream: false,
          options: { temperature: 0.3, num_ctx: 2048 }
        })
      });

      if (!response.ok) throw new Error('AI service unavailable');
      const data = await response.json();
      messages = [...messages, { role: 'assistant', content: (data?.response ?? String(data)) }];
    } catch (error) {
      messages = [...messages, { role: 'error', content: 'AI service error - check GPU setup' }];
    } finally {
      isLoading = false;
    }
  }
</script>

<div class="h-96 flex flex-col nes-container" data-case-id={caseId}>
  <div class="yorha-panel-header">
    <h3 class="nes-text is-primary">Legal AI Assistant (GPU)</h3>
  </div>

  <div class="yorha-panel-content flex-1 flex flex-col space-y-4">
    <div class="flex-1 overflow-y-auto space-y-2 p-2 border rounded">
      {#each Array.isArray(messages) ? messages : [] as message}
        <div class={
          message.role === 'user'
            ? 'p-2 rounded bg-blue-100 ml-8'
            : message.role === 'error'
              ? 'p-2 rounded bg-red-100'
              : 'p-2 rounded bg-gray-100 mr-8'
        }>
          <strong>{message.role}:</strong> {message.content}
        </div>
      {/each}

      {#if isLoading}
        <div class="text-center p-2">⚡ GPU AI processing...</div>
      {/if}
    </div>

    <div class="flex space-x-2">
      <!-- Replaced custom Input with native input bound to runes $state -->
      <input
        class="flex-1 px-3 py-2 border rounded"
        bind:value={input}
        placeholder="Legal question..."
        onkeydown={(e: KeyboardEvent) => e.key === 'Enter' && sendMessage()}
        />

      <!-- Replaced custom Button with native button and Svelte 5 event attribute -->
      <button
        class="bits-btn px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
        onclick={sendMessage}
        disabled={isLoading}
      >
        Send
      </button>
    </div>
  </div>
</div>