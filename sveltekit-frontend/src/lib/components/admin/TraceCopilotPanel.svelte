<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, slide } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import RoutingExplanationPanel from './RoutingExplanationPanel.svelte';
  import SourceProvenancePanel from './SourceProvenancePanel.svelte';
  import CommandSuggestPanel from './CommandSuggestPanel.svelte';

  // Props (Runes)
  let { contextTag = 'global', isOpen = $bindable(true) } = $props();

  // State (Runes)
  let messages = $state<Array<{ role: string, content: string, metadata?: any }>>([]);
  let input = $state('');
  let sessionId = $state<string | null>(null);
  let isThinking = $state(false);
  let chatEnd = $state<HTMLDivElement | null>(null);
  let systemStatus = $state<any>(null);

  // Browser-context lane (untrusted user-visible). Polled on mount + after
  // every send so the indicator reflects what the server has stored. Empty
  // is a normal/expected state — no extension installed yet.
  let browserCtx = $state<{
    source: 'redis' | 'memory' | 'empty' | 'unknown';
    tabs: number;
    snippets: number;
    redactions: number;
    deviceLabel: string;
  }>({ source: 'unknown', tabs: 0, snippets: 0, redactions: 0, deviceLabel: '—' });

  async function refreshBrowserContext() {
    try {
      const r = await fetch('/api/browser-context/snapshot', { credentials: 'include' });
      if (!r.ok) { browserCtx = { source: 'unknown', tabs: 0, snippets: 0, redactions: 0, deviceLabel: '—' }; return; }
      const { snapshot, source } = await r.json();
      browserCtx = {
        source,
        tabs:        snapshot.tabs?.length ?? 0,
        snippets:    snapshot.snippets?.length ?? 0,
        redactions:  (snapshot.sanitized?.urls_redacted ?? 0)
                   + (snapshot.sanitized?.snippet_redactions ?? 0),
        deviceLabel: snapshot.embed_device ?? '—',
      };
    } catch {
      browserCtx = { source: 'unknown', tabs: 0, snippets: 0, redactions: 0, deviceLabel: '—' };
    }
  }

  // Lifecycle
  onMount(async () => {
    // Initial history fetch
    const res = await fetch('/api/admin/ai-chat/sessions');
    const { sessions } = await res.json();
    if (sessions?.length > 0) {
      sessionId = sessions[0].id;
      const histRes = await fetch(`/api/admin/ai-chat/${sessionId}`);
      const { history } = await histRes.json();
      messages = history || [];
    }
    refreshBrowserContext();
    scrollToBottom();
  });

  $effect(() => {
    if (messages.length) scrollToBottom();
  });

  function scrollToBottom() {
    setTimeout(() => {
      chatEnd?.scrollIntoView({ behavior: 'smooth' });
    }, 50);
  }

  async function sendMessage() {
    if (!input.trim() || isThinking) return;

    const userMsg = input.trim();
    input = '';
    messages.push({ role: 'user', content: userMsg });
    isThinking = true;

    // 1. Scrape UI Snapshot
    const uiSnapshot: Record<string, any> = {};
    document.querySelectorAll('[data-trace-id]').forEach(el => {
      const id = el.getAttribute('data-trace-id')!;
      const type = el.getAttribute('data-trace-type');
      uiSnapshot[id] = {
        type,
        text: (el as HTMLElement).innerText?.slice(0, 500),
        isVisible: el.getBoundingClientRect().height > 0
      };
    });

    try {
      const res = await fetch('/api/admin/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          query: userMsg,
          contextTag,
          uiSnapshot
        })
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);

      sessionId = data.sessionId;
      messages.push({ 
        role: 'assistant', 
        content: data.reply,
        metadata: data.context 
      });
      systemStatus = data.context;
    } catch (err: any) {
      messages.push({ role: 'system', content: `Error: ${err.message}` });
    } finally {
      isThinking = false;
    }
  }

  function handleKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }
</script>

{#if isOpen}
  <div 
    class="fixed inset-y-0 right-0 w-96 bg-zinc-950 border-l border-zinc-800 shadow-2xl flex flex-col z-[1000] font-sans"
    transition:slide={{ axis: 'x', duration: 300, easing: cubicOut }}
  >
    <!-- Header -->
    <div class="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50 backdrop-blur-md">
      <div class="flex items-center gap-2">
        <div class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
        <h2 class="text-sm font-bold text-zinc-100 uppercase tracking-widest">TRACE Copilot</h2>
      </div>
      <button 
        onclick={() => isOpen = false}
        class="text-zinc-500 hover:text-zinc-100 transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
      </button>
    </div>

    <!-- Metrics Bar (Context Awareness) -->
    {#if systemStatus}
      <div class="px-4 py-2 bg-emerald-500/10 border-b border-emerald-500/20 flex gap-4 text-[10px] text-emerald-400 font-mono overflow-x-auto whitespace-nowrap scrollbar-none">
        <span>CHUNKS: {systemStatus.metrics?.db?.chunks || 0}</span>
        <span>SUMMARIES: {systemStatus.metrics?.db?.summaries || 0}</span>
        <span>LATENCY: {systemStatus.system?.latencyMs}ms</span>
        <!-- TODO: Integrate routingExplanation visualization (Lexical/Topology/Task signal breakdown) -->
      </div>
    {/if}

    <!-- Messages -->
    <div class="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-zinc-800">
      {#each messages as msg}
        <div 
          class="flex flex-col gap-1 {msg.role === 'user' ? 'items-end' : 'items-start'}"
          in:fade={{ duration: 200 }}
        >
          <div 
            class="max-w-[85%] px-3 py-2 rounded-xl text-sm leading-relaxed
                   {msg.role === 'user' ? 'bg-emerald-600 text-white rounded-br-none' : 
                    msg.role === 'system' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                    'bg-zinc-800 text-zinc-100 rounded-bl-none border border-zinc-700'}"
          >
            {msg.content}
          </div>
          {#if msg.metadata?.routingExplanation}
            <div class="mt-2 w-full max-w-[90%]">
              <RoutingExplanationPanel explanation={msg.metadata.routingExplanation} />
            </div>
          {/if}
          {#if msg.metadata?.hits}
            <div class="mt-2 w-full max-w-[95%]">
              <SourceProvenancePanel hits={msg.metadata.hits} graphPaths={msg.metadata.graphPaths} />
            </div>
          {/if}
          {#if msg.metadata?.suggestedCommands}
            <div class="mt-2 w-full max-w-[95%]">
              <CommandSuggestPanel commands={msg.metadata.suggestedCommands} />
            </div>
          {/if}
          {#if msg.metadata?.model}
            <span class="text-[9px] text-zinc-600 font-mono uppercase px-1">{msg.metadata.model}</span>
          {/if}
        </div>
      {/each}

      {#if isThinking}
        <div class="flex items-start gap-1" in:fade>
          <div class="bg-zinc-800 border border-zinc-700 p-3 rounded-xl rounded-bl-none flex gap-1">
            <div class="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style="animation-delay: 0ms"></div>
            <div class="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style="animation-delay: 150ms"></div>
            <div class="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style="animation-delay: 300ms"></div>
          </div>
        </div>
      {/if}
      <div bind:this={chatEnd}></div>
    </div>

    <!-- Input -->
    <div class="p-4 bg-zinc-900/50 border-t border-zinc-800">
      <div class="relative group">
        <textarea
          bind:value={input}
          onkeydown={handleKey}
          placeholder="Ask TRACE about indexing health..."
          class="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 pr-12 text-sm text-zinc-100 placeholder-zinc-600 
                 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 
                 resize-none transition-all group-hover:border-zinc-700"
          rows="2"
        ></textarea>
        <button 
          onclick={sendMessage}
          disabled={isThinking || !input.trim()}
          class="absolute right-2 bottom-3 p-1.5 text-emerald-500 hover:bg-emerald-500/10 rounded-lg transition-all disabled:opacity-0"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
        </button>
      </div>
      <div class="mt-2 flex justify-between items-center">
        <span class="text-[10px] text-zinc-600 font-mono">GEMMA4-LEGAL-VLM :3040</span>
        <div class="flex items-center gap-3">
          <span
            class="text-[10px] font-mono"
            class:text-zinc-600={browserCtx.source === 'empty' || browserCtx.source === 'unknown'}
            class:text-emerald-500={browserCtx.source === 'redis' || browserCtx.source === 'memory'}
            title={`Browser context: ${browserCtx.source} · ${browserCtx.deviceLabel} · tabs=${browserCtx.tabs} snippets=${browserCtx.snippets} redactions=${browserCtx.redactions}\n(untrusted user-visible — TRACE backend is authoritative)`}
          >
            BROWSER {browserCtx.source === 'empty' || browserCtx.source === 'unknown'
              ? '—'
              : `t=${browserCtx.tabs}/s=${browserCtx.snippets}`}
          </span>
          <div class="flex gap-2">
             <div class="w-2 h-2 rounded-full bg-zinc-800"></div>
             <div class="w-2 h-2 rounded-full bg-zinc-800"></div>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  :global(.scrollbar-none::-webkit-scrollbar) { display: none; }
  :global(.scrollbar-thin::-webkit-scrollbar) { width: 4px; }
  :global(.scrollbar-thumb-zinc-800::-webkit-scrollbar-thumb) { background: #27272a; border-radius: 10px; }
</style>
