<script lang="ts">
  import { useMachine } from '$lib/utils/xstate-svelte5.svelte.js';
  import { fromPromise } from 'xstate';
  import { chatMachine } from '$lib/stores/admin-chat-machine.js';
  import { fly } from 'svelte/transition';

  let { chatId = 'admin-studio-default', systemContext = {} } = $props();

  const { snapshot, send } = useMachine(
    chatMachine.provide({
      actors: {
        fetchResponse: fromPromise(async ({ input }: { input: { chatId: string; message: string; attachments?: any[] } }) => {
          const res = await fetch('/api/admin/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...input, systemContext })
          });
          if (!res.ok) throw new Error('Inference server unreachable');
          return res.json();
        })
      }
    }),
    { input: { chatId } }
  );

  let inputVal = $state('');
  let scrollContainer: HTMLElement;

  function handleSubmit() {
    if (!inputVal.trim() || snapshot.matches('thinking')) return;
    send({ type: 'SEND', message: inputVal });
    inputVal = '';
  }

  $effect(() => {
    if (snapshot.context.messages.length && scrollContainer) {
      scrollContainer.scrollTo({ top: scrollContainer.scrollHeight, behavior: 'smooth' });
    }
  });
</script>

<div class="chat-assistant-container flex flex-col h-[500px] bg-white/5 rounded-3xl border border-white/10 overflow-hidden backdrop-blur-xl">
  <!-- Header -->
  <header class="p-4 border-b border-white/5 flex items-center justify-between bg-white/5">
    <div class="flex items-center gap-3">
      <div class="w-2 h-2 rounded-full bg-accent animate-pulse"></div>
      <span class="text-xs font-bold tracking-widest uppercase opacity-70">Gemma 4 / TRACE Oracle</span>
    </div>
    <button
      class="text-[10px] uppercase tracking-tighter opacity-40 hover:opacity-100 transition-opacity"
      onclick={() => send({ type: 'CLEAR' })}
    >
      Reset Loop
    </button>
  </header>

  <!-- Messages -->
  <div
    bind:this={scrollContainer}
    class="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-hide"
  >
    {#if snapshot.context.messages.length === 0}
      <div class="h-full flex flex-col items-center justify-center opacity-20 text-center px-10">
        <span class="i-carbon-machine-learning text-5xl mb-4"></span>
        <p class="text-xs font-mono">Neural interface ready. System context initialized.</p>
      </div>
    {/if}

    {#each snapshot.context.messages as msg, i}
      <div
        class="flex {msg.role === 'user' ? 'justify-end' : 'justify-start'}"
        in:fly={{ y: 10, duration: 400 }}
      >
        <div class="max-w-[85%] group">
          <div class="text-[10px] font-mono mb-1 opacity-30 uppercase tracking-widest {msg.role === 'user' ? 'text-right' : 'text-left'}">
            {msg.role}
          </div>
          <div class="p-4 rounded-2xl text-sm leading-relaxed {msg.role === 'user' ? 'bg-accent/20 text-accent border border-accent/20' : 'bg-white/5 text-white/90 border border-white/10'}">
            {msg.content}
          </div>
        </div>
      </div>
    {/each}

    {#if snapshot.matches('thinking')}
      <div class="flex justify-start">
        <div class="bg-white/5 p-4 rounded-2xl border border-white/10 flex items-center gap-2">
          <div class="dot-loading"></div>
          <div class="dot-loading delay-100"></div>
          <div class="dot-loading delay-200"></div>
        </div>
      </div>
    {/if}

    {#if snapshot.matches('error')}
      <div class="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex flex-col gap-2">
        <span>Transmission Interrupted: {snapshot.context.error}</span>
        <button
          class="underline text-left hover:text-red-300"
          onclick={() => send({ type: 'RETRY' })}
        >
          Re-establish Connection
        </button>
      </div>
    {/if}
  </div>

  <!-- Input -->
  <footer class="p-4 bg-black/20 border-t border-white/5">
    <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="relative">
      <input
        bind:value={inputVal}
        placeholder="Query the Oracle..."
        class="w-full bg-white/5 border border-white/10 rounded-2xl py-3 pl-4 pr-12 text-sm focus:outline-none focus:border-accent/40 transition-all placeholder:opacity-30"
        disabled={snapshot.matches('thinking')}
      />
      <button
        type="submit"
        class="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-xl bg-accent text-black flex items-center justify-center transition-all hover:scale-110 active:scale-90 disabled:opacity-30 disabled:scale-100"
        disabled={!inputVal.trim() || snapshot.matches('thinking')}
      >
        <span class="i-carbon-send text-lg"></span>
      </button>
    </form>
  </footer>
</div>

<style>
  .chat-assistant-container {
    box-shadow:
      0 20px 50px rgba(0, 0, 0, 0.4),
      inset 0 1px 1px rgba(255, 255, 255, 0.05);
  }

  .scrollbar-hide::-webkit-scrollbar {
    display: none;
  }

  .dot-loading {
    width: 6px;
    height: 6px;
    background-color: #8adfff;
    border-radius: 50%;
    animation: bounce 1.4s infinite ease-in-out both;
  }

  @keyframes bounce {
    0%, 80%, 100% { transform: scale(0); opacity: 0.3; }
    40% { transform: scale(1); opacity: 1; }
  }

  .delay-100 { animation-delay: 0.16s; }
  .delay-200 { animation-delay: 0.32s; }
</style>