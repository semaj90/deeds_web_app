<script lang="ts">
  import Brain from 'lucide-svelte/icons/brain';
  import Cpu from 'lucide-svelte/icons/cpu';
  import Zap from 'lucide-svelte/icons/zap';
  import { webAssemblyAIAdapter } from '../../adapters/webasm-ai-adapter';
  import Badge from "../ui/badge/Badge.svelte";

  interface Props {
    collapsed?: boolean;
    showStatus?: boolean;
  }

  let { collapsed = false, showStatus = true }: Props = $props();

  // State
  let chatInput = $state('');
  let messages = $state<any[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: "Hello! I'm initializing my local AI model (Gemma 270MB). Once ready, you can ask me legal questions that remain entirely on your device.",
      timestamp: Date.now()
    }
  ]);
  let isProcessing = $state(false);
  let isInitialized = $state(false);
  let error = $state<string | null>(null);

  // System status
  let systemStatus = $state({
    webgpu: false,
    webasm: false,
    model: false,
    adapter: false
  });

  // Quick prompts
  let quickPrompts = [
    'What are the key legal considerations for AI in healthcare?',
    'Explain GDPR compliance for AI systems.',
    'How do AI liability laws work?',
    'What are the privacy risks of machine learning?'
  ];

  async function initializeAI() {
    try {
      console.log('🤖 Initializing client-side AI...');
      const initialized = await webAssemblyAIAdapter.initialize();
      if (initialized) {
        const health = await webAssemblyAIAdapter.getHealthStatus();
        systemStatus = {
          webgpu: health.webgpuEnabled ?? false,
          webasm: health.wasmSupported ?? false,
          model: health.modelLoaded ?? false,
          adapter: health.initialized ?? false
        };
        isInitialized = true;
        console.log('✅ Client-side AI ready:', health);
      } else {
        throw new Error('Failed to initialize AI adapter');
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Unknown initialization error';
      console.error('❌ AI initialization failed:', err);
    }
  }

  async function sendMessage(promptText?: string) {
    const message = (promptText || chatInput).trim();
    if (!message || isProcessing || !isInitialized) return;

    const userMessage = {
      id: `user_${Date.now()}`,
      role: 'user' as const,
      content: message,
      timestamp: Date.now()
    };

    messages = [...messages, userMessage];
    isProcessing = true;
    error = null;

    if (!promptText) chatInput = '';

    try {
      const response = await webAssemblyAIAdapter.sendMessage(message, {
        conversationHistory: messages.map((msg, i) => ({
          id: msg.id || `msg-${i}`,
          timestamp: msg.timestamp || Date.now(),
          type: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content
        })) as any[]
      });

      const assistantMessage = {
        id: `assistant_${Date.now()}`,
        role: 'assistant' as const,
        content: response.content,
        timestamp: Date.now()
      };

      messages = [...messages, assistantMessage];
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to process message';
      console.error('❌ Message processing failed:', err);
    } finally {
      isProcessing = false;
    }
  }

  function clearChat() {
    messages = [
      {
        id: 'welcome',
        role: 'assistant',
        content: 'Chat cleared. How can I help you?',
        timestamp: Date.now()
      }
    ];
    error = null;
  }

  function handleKeyPress(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  }

  $effect(() => {
    initializeAI();
  });
</script>

<div class="client-ai-chat" class:collapsed>
  <div class="bg-panel/90 backdrop-blur-md border border-warning/30 shadow-xl rounded-lg overflow-hidden">
    <div class="p-3 border-b border-sand/20">
      <h3 class="flex items-center gap-2 text-warning text-sm font-bold">
        <Brain class="w-4 h-4" />
        Client-Side AI
        {#if showStatus}
          <Badge variant="outline" class={systemStatus.model ? 'border-accent text-accent text-[10px]' : 'border-warning text-warning text-[10px]'}>
             {systemStatus.model ? 'Gemma Active' : 'Loading...'}
          </Badge>
        {/if}
      </h3>

      {#if showStatus && !collapsed}
        <div class="flex items-center gap-3 mt-2 text-[10px]">
          <span class="flex items-center gap-1 {systemStatus.webgpu ? 'text-accent' : 'text-sand/60'}">
            <Zap class="w-3 h-3" /> WebGPU
          </span>
          <span class="flex items-center gap-1 {systemStatus.webasm ? 'text-accent' : 'text-sand/60'}">
            <Cpu class="w-3 h-3" /> WebASM
          </span>
          <span class="ml-auto text-sand/40">
            {isInitialized ? 'Ready' : 'Initializing...'}
          </span>
        </div>
      {/if}
    </div>

    {#if !collapsed}
      <div class="h-64 overflow-y-auto p-3 space-y-3 scrollbar-none" id="chat-messages">
        {#each messages as msg (msg.id)}
          <div class="flex flex-col {msg.role === 'user' ? 'items-end' : 'items-start'}">
            <div class="max-w-[85%] rounded px-3 py-2 text-xs {msg.role === 'user' ? 'bg-info/20 text-info/20 border border-info/30' : 'bg-panelSoft text-sand/40 border border-sand/20'}">
              {msg.content}
            </div>
            <span class="text-[10px] text-sand/60 mt-1">
              {msg.role === 'user' ? 'You' : 'Gemma'} • {new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
            </span>
          </div>
        {/each}

        {#if isProcessing}
          <div class="flex items-center gap-2 text-sand/40 text-[10px] italic">
            <Brain class="w-3 h-3 animate-pulse" />
            Gemma is thinking...
          </div>
        {/if}
      </div>

      <div class="p-3 bg-black/40 border-t border-sand/20">
        {#if messages.length <= 1 && !isProcessing}
          <div class="flex flex-wrap gap-1 mb-3">
            {#each quickPrompts.slice(0, 2) as prompt}
              <button
                onclick={() => sendMessage(prompt)}
                class="text-[10px] px-2 py-1 bg-panelSoft hover:bg-panelSoft text-sand/40 rounded transition-colors"
              >
                {prompt.slice(0, 30)}...
              </button>
            {/each}
          </div>
        {/if}

        {#if error}
          <div class="mb-2 p-2 bg-danger/10 border border-danger/30 rounded text-danger/80 text-[10px]">
            ⚠️ {error}
          </div>
        {/if}

        <div class="flex gap-2">
          <textarea
            bind:value={chatInput}
            onkeydown={handleKeyPress}
            placeholder={isInitialized ? "Type a message..." : "Initializing..."}
            class="flex-1 bg-panelSoft border border-sand/20 rounded p-2 text-xs text-white focus:outline-none focus:border-warning/50 resize-none h-10"
            disabled={!isInitialized || isProcessing}
          ></textarea>
          <button
            onclick={() => sendMessage()}
            disabled={!isInitialized || isProcessing || !chatInput.trim()}
            class="px-3 bg-warning hover:bg-warning disabled:opacity-50 text-black text-xs font-bold rounded transition-colors"
          >
            SEND
          </button>
        </div>

        <div class="flex justify-between mt-2">
          <span class="text-[9px] text-sand/60 uppercase tracking-widest">Client Mode: Secure</span>
          <button onclick={clearChat} class="text-[9px] text-sand/60 hover:text-sand/40">CLEAR HISTORY</button>
        </div>
      </div>
    {:else}
      <div class="p-2 text-center">
         <Badge variant="outline" class="text-[10px] border-warning/50 text-warning">
            {messages.length} MSG
         </Badge>
      </div>
    {/if}
  </div>
</div>

<style>
  .client-ai-chat {
    font-family: 'Inter', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    width: 320px;
    z-index: 50;
  }
  .client-ai-chat.collapsed {
    width: 60px;
  }
  .scrollbar-none::-webkit-scrollbar {
    display: none;
  }
</style>






