<script lang="ts">
  import { useMachine } from '$lib/utils/xstate-svelte5.svelte.js';
  import { fromPromise } from 'xstate';
  import { chatMachine } from '$lib/stores/admin-chat-machine.js';
  import { fade, slide, fly } from 'svelte/transition';
  import { onMount } from 'svelte';
  import { Dialog } from 'bits-ui';
  import { captureUISnapshot } from '$lib/utils/ui-recon.js';
  import Badge from '$lib/components/ui/badge/Badge.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import { cn } from '$lib/utils.js';

  let { open = $bindable(false) } = $props();

  const { snapshot, send } = useMachine(
    chatMachine.provide({
      actors: {
        fetchResponse: fromPromise(async ({ input }: { input: { chatId: string; message: string; attachments?: any[] } }) => {
          const uiSnapshot = captureUISnapshot();
          const res = await fetch('/api/admin/ai-chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: input.message,
              sessionId: input.chatId,
              uiSnapshot,
              attachments: input.attachments
            })
          });
          if (!res.ok) throw new Error('TRACE Gateway Timeout');
          return res.json();
        })
      }
    }),
    { input: { chatId: 'global-contextual-assistant' } }
  );

  let inputVal = $state('');
  let attachments = $state<{ fileId: string; name: string; type: string; url: string }[]>([]);
  let isUploading = $state(false);
  let scrollContainer: HTMLElement;
  let fileInput: HTMLInputElement;

  async function handleFileUpload(e: Event) {
    const files = (e.target as HTMLInputElement).files;
    if (!files?.length) return;

    isUploading = true;
    try {
      const formData = new FormData();
      formData.append('file', files[0]);

      const res = await fetch('/api/admin/ai-chat/upload', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      attachments = [...attachments, data];
    } catch (err) {
      console.error('[Assistant] Upload failed:', err);
    } finally {
      isUploading = false;
    }
  }

  function handleSubmit() {
    if (!inputVal.trim() && attachments.length === 0) return;
    if (snapshot.matches('thinking')) return;

    send({
      type: 'SEND',
      message: inputVal,
      attachments: attachments.map(a => ({ fileId: a.fileId, type: a.type, name: a.name }))
    });

    inputVal = '';
    attachments = [];
  }

  let worker: Worker;
  let tokenCount = $state(0);

  onMount(() => {
    worker = new Worker(new URL('$lib/workers/admin-chat.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      if (e.data.type === 'token_estimate') {
        tokenCount = e.data.payload.tokens;
      }
    };

    const handleToggle = () => { open = !open; };
    window.addEventListener('yorha:toggle-assistant', handleToggle);
    return () => {
      window.removeEventListener('yorha:toggle-assistant', handleToggle);
      worker.terminate();
    };
  });

  $effect(() => {
    if (inputVal && worker) {
      worker.postMessage({ type: 'estimate_tokens', payload: { text: inputVal } });
    }
  });
</script>

<Dialog.Root bind:open>
  <Dialog.Portal>
    <!-- Tactical Backdrop -->
    <Dialog.Overlay class="hud-modal-backdrop fixed inset-0 z-[9990] bg-black/80 backdrop-blur-md transition-opacity" />

    <!-- Centered Modal Content Container -->
    <Dialog.Content
      class="fixed inset-0 z-[9991] flex items-center justify-center p-4 sm:p-6 pointer-events-none"
    >
      <div
        class="pointer-events-auto relative w-full max-w-2xl h-[600px] flex flex-col bg-[#131b2a]/95 text-sand border border-[#f3d471]/30 rounded-2xl overflow-hidden shadow-[0_0_100px_rgba(0,0,0,0.8)] backdrop-blur-xl"
        in:fly={{ y: 20, duration: 400 }}
      >
        <!-- Tactical Corner Notches (Phoenix Justice / YoRHa HUD) -->
        <span class="hud-notch-tl" aria-hidden="true"></span>
        <span class="hud-notch-tr" aria-hidden="true"></span>
        <span class="hud-notch-bl" aria-hidden="true"></span>
        <span class="hud-notch-br" aria-hidden="true"></span>

        <!-- Top Highlight Bar -->
        <div class="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#f3d471]/80 to-transparent"></div>

        <!-- Header -->
        <header class="p-8 border-b border-[#f3d471]/20 flex items-center justify-between bg-black/20 backdrop-blur-md">
          <div class="flex items-center gap-6">
            <div class="relative">
              <div class="w-12 h-12 rounded-2xl bg-accent/20 flex items-center justify-center border border-accent/30 shadow-[0_0_20px_rgba(138,223,255,0.2)]">
                <span class="i-carbon-assistant text-accent text-2xl"></span>
              </div>
              <div class="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-green-500 border-2 border-black"></div>
            </div>
            <div>
              <Dialog.Title class="text-xl font-bold tracking-tight text-white flex items-center gap-3">
                TRACE Copilot
                <span class="px-2 py-0.5 rounded-full bg-accent/10 border border-accent/20 text-[10px] uppercase tracking-widest text-accent font-mono">Read Only</span>
              </Dialog.Title>
              <div class="flex items-center gap-3 mt-1.5">
                <div class="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[9px] font-mono text-white/40 uppercase">
                  <span class="w-1.5 h-1.5 rounded-full bg-green-500/50"></span>
                  Qdrant
                </div>
                <div class="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[9px] font-mono text-white/40 uppercase">
                  <span class="w-1.5 h-1.5 rounded-full bg-green-500/50"></span>
                  Neo4j
                </div>
                <div class="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[9px] font-mono text-white/40 uppercase">
                  <span class="w-1.5 h-1.5 rounded-full bg-accent/50"></span>
                  MCP:8788
                </div>
              </div>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <div class="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-[10px] font-mono text-white/60">
              {snapshot.value.toString().toUpperCase()}
            </div>
            <button
              class="w-10 h-10 rounded-xl hover:bg-white/10 text-white/40 flex items-center justify-center transition-all cursor-pointer"
              onclick={() => open = false}
              aria-label="Close assistant"
            >
              <span class="i-carbon-close text-xl"></span>
            </button>
          </div>
        </header>

        <!-- Messages -->
        <div
          bind:this={scrollContainer}
          class="flex-1 overflow-y-auto p-8 space-y-10 scrollbar-hide"
        >
          {#if snapshot.context.messages.length === 0}
            <div class="h-full flex flex-col items-center justify-center text-center px-12 opacity-20">
              <div class="i-carbon-machine-learning-model text-7xl mb-8"></div>
              <p class="text-xs font-mono leading-relaxed max-w-sm">
                Global UI context initialized. Ready to analyze elements, run subagent missions, or troubleshoot system states.
              </p>
            </div>
          {/if}

          {#each snapshot.context.messages as msg}
            <div class="message-group space-y-4" in:fly={{ y: 10, duration: 400 }}>
              <div class="flex items-center gap-3 opacity-30">
                <span class="text-[10px] font-mono uppercase tracking-[0.2em]">{msg.role}</span>
                <div class="h-[1px] flex-1 bg-white/10"></div>
              </div>

              <div class={cn(
                "p-6 rounded-[1.5rem] text-sm leading-relaxed border",
                msg.role === 'user'
                  ? "bg-accent/5 border-accent/20 text-accent ml-12"
                  : "bg-white/5 border-white/10 text-white/90 mr-12 shadow-inner"
              )}>
                <div class="prose prose-invert prose-sm max-w-none mb-4">
                  {msg.content}
                </div>

                {#if msg.role === 'assistant' && msg.contextPack}
                  <div class="flex flex-wrap gap-2 pt-4 border-t border-white/5" transition:slide>
                    {#each Object.keys(msg.contextPack.mcp) as tool}
                      <div class="px-2 py-0.5 rounded bg-accent/10 border border-accent/20 text-[8px] font-mono text-accent uppercase">
                        {tool}
                      </div>
                    {/each}
                    <div class="ml-auto px-2 py-0.5 rounded bg-white/5 border border-white/10 text-[8px] font-mono text-white/40 uppercase">
                      Gemma 4 • 8090
                    </div>
                  </div>
                {/if}
              </div>
            </div>
          {/each}

          {#if snapshot.matches('retrieving_context')}
            <div class="flex flex-col gap-4 mr-12" in:fade>
              <div class="flex items-center gap-3 opacity-30">
                <span class="text-[10px] font-mono uppercase tracking-[0.2em]">Assistant</span>
                <div class="h-[1px] flex-1 bg-white/10"></div>
              </div>
              <div class="bg-white/5 p-6 rounded-[1.5rem] border border-white/10 flex items-center gap-5">
                <div class="orb-loading"></div>
                <div class="flex flex-col gap-1">
                  <span class="text-xs font-mono opacity-50 uppercase tracking-widest">Retrieving TRACE Context...</span>
                  <div class="h-1 w-48 bg-white/5 rounded-full overflow-hidden mt-1">
                    <div class="h-full bg-accent animate-progress"></div>
                  </div>
                </div>
              </div>
            </div>
          {/if}

          {#if snapshot.matches('generating')}
            <div class="flex flex-col gap-4 mr-12" in:fade>
              <div class="flex items-center gap-3 opacity-30">
                <span class="text-[10px] font-mono uppercase tracking-[0.2em]">Assistant</span>
                <div class="h-[1px] flex-1 bg-white/10"></div>
              </div>
              <div class="bg-accent/5 p-6 rounded-[1.5rem] border border-accent/20 flex items-center gap-5">
                <span class="i-carbon-connection-two-way animate-pulse text-accent text-2xl"></span>
                <div class="flex flex-col gap-1">
                  <span class="text-xs font-mono text-accent uppercase tracking-widest">Gemma 4 Reasoning...</span>
                </div>
              </div>
            </div>
          {/if}
        </div>

        <!-- Input -->
        <footer class="p-8 border-t border-[#f3d471]/20 bg-black/40 space-y-4">
          {#if attachments.length > 0}
            <div class="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
              {#each attachments as file, idx}
                <div class="relative group/file shrink-0 w-24 h-24 rounded-2xl border border-white/10 overflow-hidden bg-white/5" in:slide>
                  {#if file.type.startsWith('image/')}
                    <img src={file.url} alt={file.name} class="w-full h-full object-cover opacity-60" />
                  {:else}
                    <div class="w-full h-full flex flex-col items-center justify-center p-2 text-center">
                      <span class="i-carbon-document text-2xl opacity-20"></span>
                      <span class="text-[9px] font-mono opacity-40 truncate w-full">{file.name}</span>
                    </div>
                  {/if}
                  <button
                    class="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover/file:opacity-100 transition-opacity"
                    onclick={() => attachments = attachments.filter((_, i) => i !== idx)}
                    aria-label="Remove attachment"
                  >
                    <span class="i-carbon-close text-xs"></span>
                  </button>
                </div>
              {/each}
            </div>
          {/if}

          <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="relative group">
            <textarea
              bind:value={inputVal}
              placeholder="Command subagents or analyze view..."
              class="w-full bg-white/5 border border-white/10 rounded-[1.25rem] py-5 pl-16 pr-16 text-sm focus:outline-none focus:border-[#f3d471]/60 transition-all placeholder:opacity-20 min-h-[64px] max-h-32 resize-none shadow-2xl"
              onkeydown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
              disabled={snapshot.matches('thinking')}
            ></textarea>

            <input
              type="file"
              bind:this={fileInput}
              class="hidden"
              onchange={handleFileUpload}
              accept="image/*,.pdf,.doc,.docx,.txt"
            />

            <button
              type="button"
              class="absolute left-4 bottom-4 w-10 h-10 rounded-xl hover:bg-white/10 text-white/40 flex items-center justify-center transition-all cursor-pointer"
              onclick={() => fileInput.click()}
              disabled={isUploading || snapshot.matches('thinking')}
            >
              {#if isUploading}
                <span class="i-carbon-loader animate-spin"></span>
              {:else}
                <span class="i-carbon-add text-xl"></span>
              {/if}
            </button>

            <button
              type="submit"
              aria-label="Send message"
              class="absolute right-4 bottom-4 w-12 h-12 rounded-[1rem] bg-[#f3d471] hover:bg-[#ffe180] text-black font-bold flex items-center justify-center transition-all hover:scale-105 active:scale-95 disabled:opacity-30 disabled:scale-100 shadow-[0_0_20px_rgba(243,212,113,0.3)] cursor-pointer"
              disabled={(!inputVal.trim() && attachments.length === 0) || snapshot.matches('thinking')}
            >
              <span class="i-carbon-send-alt text-2xl"></span>
            </button>
          </form>

          <div class="mt-5 flex justify-center gap-8 opacity-20 hover:opacity-40 transition-opacity">
            <div class="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest">
              <span class="i-carbon-flow-stream"></span>
              Subagent Loop
            </div>
            <div class="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest">
              <span class="i-carbon-view"></span>
              Recon Active
            </div>
          </div>
        </footer>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  .scrollbar-hide::-webkit-scrollbar {
    display: none;
  }

  .orb-loading {
    width: 16px;
    height: 16px;
    background: #8adfff;
    border-radius: 50%;
    box-shadow: 0 0 20px #8adfff;
    animation: orb-pulse 2s infinite ease-in-out;
  }

  @keyframes orb-pulse {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.4); opacity: 0.6; }
  }

  @keyframes progress {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
  }

  .animate-progress {
    animation: progress 2s linear infinite;
  }

  .hud-notch-tl,
  .hud-notch-tr,
  .hud-notch-bl,
  .hud-notch-br {
    position: absolute;
    width: 8px;
    height: 8px;
    pointer-events: none;
  }
  .hud-notch-tl {
    top: -1px;
    left: -1px;
    border-top: 2px solid #f3d471;
    border-left: 2px solid #f3d471;
  }
  .hud-notch-tr {
    top: -1px;
    right: -1px;
    border-top: 2px solid #f3d471;
    border-right: 2px solid #f3d471;
  }
  .hud-notch-bl {
    bottom: -1px;
    left: -1px;
    border-bottom: 2px solid #f3d471;
    border-left: 2px solid #f3d471;
  }
  .hud-notch-br {
    bottom: -1px;
    right: -1px;
    border-bottom: 2px solid #f3d471;
    border-right: 2px solid #f3d471;
  }
</style>
