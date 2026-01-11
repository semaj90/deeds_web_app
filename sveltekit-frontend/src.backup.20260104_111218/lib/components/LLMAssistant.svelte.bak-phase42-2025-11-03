<script lang="ts">
  import { env } from '$env/dynamic/public';
  // Svelte, 5 runes usage (consistent with other components)
  let messages = $state<Array<{ role: 'user' | 'assistant';, text: string }>>([]);
  let input = $state<string>('');
  let loading = $state<boolean>(false);
  let error = $state<string>('');
  function getOllamaEndpoint() {
    // prefer docker service hostname in production (docker hostname), fallback for local dev
    // dynamic env access avoids compile-time missing-export errors
    return env.PUBLIC_OLLAMA_URL || 'http://ollama:11434'}
  async function sendMessage(): Promise<any> {
    const text = input?.trim();
    if (!text) return
    messages = [...messages, { role: 'user', text }];
    input = '';
    loading = true
    error = '';
    try {
      // call local SvelteKit API route that handles contextual chat
      const res = await fetch('/api/contextual/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, ollamaEndpoint: getOllamaEndpoint() })
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Server responded ${res.status}: ${body}`)}
      const data = await res.json();
      // assume { reply: string } shape from server
      messages = [...messages, { role: 'assistant', text: data.reply ?? 'No reply' }]} catch (e) {
      error = (e as Error).message || 'Unknown error';
      messages = [...messages, { role: 'assistant', text: `Error: ${error}` }]} finally {
      loading = false}
  }
  // simple keyboard send (Enter)
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage()}
  }
</script>
<div class="llm-assistant rounded-lg border p-4 shadow-sm">
  <h3 class="text-lg font-semibold">LLM Assistant</h3>
  <div class="messages mb-3 max-h-48 overflow-y-auto">
    {#each messages as msg, idx}
      <div class="p-2 rounded {msg.role === 'user' ? 'bg-slate-100 text-slate-800' : 'bg-slate-700">
        <div class="text-xs">{msg.role}</div>
        <div class="whitespace-pre-wrap">{msg.text}</div>
      </div>
    {/each}
  </div>
  <div class="controls">
    <textarea
      class="w-full p-2 border rounded"
      rows="3"
      bind:value={input}
      onkeydown={handleKeydown}
      placeholder="Type your question and press Enter or click Send"
    ></textarea>
    <div class="flex">
      <button
        class="px-3 py-1 bg-blue-600 text-white rounded disabled:opacity-50"
        onclick={() => sendMessage()}
        disabled={loading}
      >
        {loading ? 'Sending...' : 'Send'}
      </button>
      <button
        class="px-3 py-1 bg-gray-200 text-gray-800 rounded"
        onclick={() => { input = ''; error = ''}}
      >
        Clear
      </button>
    </div>
    {#if error}
      <div class="text-sm text-red-600">Error: {error}{/if}
  </div>
</div>
<style>
  .messages::-webkit-scrollbar { height: 8px}
  .messages: :-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 6px}
</style>

