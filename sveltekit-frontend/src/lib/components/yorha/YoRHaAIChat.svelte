<!-- YoRHa AI Chat Component with Enhanced RAG Integration --> <script lang="ts">
  import { Button } from '$lib/components/ui/button/index.js';
  import Activity from '@lucide/svelte/icons/activity';
  import BotIcon from '@lucide/svelte/icons/bot';
  import SendIcon from '@lucide/svelte/icons/send';
  // Migrated to $effect

  // Svelte 5 state management
  let messages = $state<any[]>([]);
  let messageInput = $state('');
  let isConnected = $state(false);
  let isTyping = $state(false);
  let isLoading = $state(false);
  let chatContainer = $state<HTMLDivElement | null>(null);

  /**
   * Resolves the Ollama endpoint dynamically.
   * Provides fallback for Docker and local development.
   */
  function getOllamaEndpoint(): string {
    // Check for explicit global config if available
    const globalUrl = (globalThis as any)?.__OLLAMA_URL__;
    if (globalUrl) return globalUrl;

    // Standard local fallback
    return 'http://localhost:11434';
  }

  const RAG_SERVICE_URL = 'http://localhost:8093';

  $effect(() => {

    initializeChat();
  
});

  async function initializeChat() {
    try {
      // 1. Try RAG Service first
      const ragHealth = await fetch(`${RAG_SERVICE_URL}/health`).catch(() => ({ ok: false }));

      // 2. Try Ollama Service as fallback
      const ollamaUrl = getOllamaEndpoint();
      const ollamaHealth = await fetch(`${ollamaUrl}/api/tags`).catch(() => ({ ok: false }));

      isConnected = (ragHealth as Response).ok || (ollamaHealth as Response).ok;

      const activeEndpoint = (ragHealth as Response).ok ? 'Enhanced RAG' : 'Ollama Direct';

      messages = [{
        id: 'welcome',
        role: 'assistant',
        content: `🤖 **YoRHa AI Assistant Online**\n\nInterface: ${activeEndpoint}\n- Sync Status: ✅ SYNCHRONIZED\n- Neural Link: ✅ STABLE\n- Contextual Memory: ✅ ACTIVE\n\nHow can I assist with your mission, operator?`,
        timestamp: new Date().toISOString(),
        type: 'system'
      }];
    } catch (error) {
      isConnected = false;
      messages = [{
        id: 'error',
        role: 'assistant',
        content: `⚠️ **Connection Failed**\n\nNo AI service detected at ${RAG_SERVICE_URL} or ${getOllamaEndpoint()}.\n\nOffline Mode Enabled.`,
        timestamp: new Date().toISOString(),
        type: 'error'
      }];
    }

    // Load history if available
    /*
    const savedChats = await aiChatStore.loadChatHistory?.();
    if (savedChats) {
      messages = [...messages, ...savedChats];
    }
    */

    scrollToBottom();
  }

  async function sendMessage() {
    const trimmed = messageInput.trim();
    if (!trimmed || isLoading) return;

    const userMsg = {
      id: Date.now().toString(),
      role: 'user',
      content: trimmed,
      timestamp: new Date().toISOString(),
      type: 'user'
    };

    messages = [...messages, userMsg];
    messageInput = '';
    isLoading = true;
    isTyping = true;

    if (trimmed.startsWith('/')) {
      await handleCommand(trimmed);
      isLoading = false;
      isTyping = false;
      return;
    }

    try {
      // Logic for Contextual Chat via Ollama or RAG
      const ollamaUrl = getOllamaEndpoint();
      const payload = {
        model: 'gemma3-legal:latest', // Per project convention
        messages: messages.map(m => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content
        })),
        stream: false
      };

      // Try RAG first, fallback to Ollama chat
      let responseText = '';

      const ragResponse = await fetch(`${RAG_SERVICE_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
message: trimmed, history: messages })
      }).catch(() => null);

      if (ragResponse && ragResponse.ok) {
        const result = await ragResponse.json();
        responseText = result.response;
      } else {
        // FALLBACK: Direct Ollama Contextual Chat
        const ollamaResponse = await fetch(`${ollamaUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify(payload)
        });

        if (ollamaResponse.ok) {
          const result = await ollamaResponse.json();
          responseText = result.message.content;
        } else {
          throw new Error('All AI services unresponsive.');
        }
      }

      const assistantMsg = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: responseText,
        timestamp: new Date().toISOString(),
        type: 'assistant'
      };

      messages = [...messages, assistantMsg];

    } catch (err) {
      messages = [...messages, {
        id: Date.now().toString(),
        role: 'assistant',
        content: `❌, Error: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: new Date().toISOString(),
        type: 'error'
      }];
    } finally {
      isLoading = false;
      isTyping = false;
      scrollToBottom();
    }
  }

  async function handleCommand(command: string) {
    const cmd = command.slice(1).toLowerCase();
    let response = '';

    switch(cmd) {
      case 'help': response = 'Available commands: /help, /status, /clear'; break;
      case 'status': response = `System Status: ${isConnected ? 'Online' : 'Offline'}`; break;
      case 'clear': messages = messages.slice(0,1); response = 'Chat cleared.'; break;
      default:response = `Unknown command: ${cmd}`;
    }

    messages = [...messages, {
      id: Date.now().toString(),
      role: 'assistant',
      content: response,
      timestamp: new Date().toISOString(),
      type: 'system'
    }];
  }

  function scrollToBottom() {
    setTimeout(() => {
      if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
    },
	50);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }
</script>

<div class="flex flex-col h-full bg-[#1a1a1a] text-[#d1d1d1] font-mono border border-[#3a3a3a]">
  <!-- Header -->
  <div class="p-3 border-b border-[#3a3a3a] flex items-center justify-between bg-[#222]">
    <div class="flex items-center gap-2">
      <div class="w-8 h-8 rounded-full bg-panelSoft border border-sand/20 flex items-center justify-center flex-shrink-0">
        <BotIcon class="w-5 h-5 text-info" />
      </div>
      <span class="font-bold tracking-tighter uppercase">YoRHa AI Interface</span>
    </div>
    <div class="flex items-center gap-2 text-[10px]">
      <div class="w-2 h-2 rounded-full {isConnected ? 'bg-accent' : 'bg-rose-500'}"></div>
      <span>{isConnected ? 'SYSTEM_ONLINE' : 'SYSTEM_OFFLINE'}</span>
    </div>
  </div>

  <!-- Messages -->
  <div bind:this={chatContainer} class="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-zinc-700">
    {#each messages as msg (msg.id)}
      <div class="flex {msg.role === 'user' ? 'justify-end' : 'justify-start'}">
        <div class="max-w-[85%] space-y-1">
          <div class="flex items-center gap-2 text-[10px] text-sand/60 {msg.role === 'user' ? 'flex-row-reverse' : ''}">
            <span class="font-bold uppercase">{msg.role}</span>
            <span>{new Date(msg.timestamp).toLocaleTimeString()}</span>
          </div>
          <div class="p-3 rounded border {msg.role === 'user' ? 'bg-info/10 border-info/30' : 'bg-panel border-sand/20'}">
            <p class="text-sm whitespace-pre-wrap">{msg.content}</p>
          </div>
        </div>
      </div>
    {/each}
    {#if isTyping}
      <div class="flex gap-2 items-center text-xs text-sand/60 animate-pulse">
        <Activity class="w-4 h-4" /> <span>YoRHa processing...</span>
      </div>
    {/if}
  </div>

  <!-- Input -->
  <div class="p-4 border-t border-[#3a3a3a] bg-[#222]">
    <div class="flex gap-2">
      <textarea
        bind:value={messageInput}
        onkeydown={handleKeydown}
        placeholder="ENTER_COMMAND_OR_QUERY..."
        class="flex-1 bg-black border border-sand/20 p-3 text-sm focus:outline-none focus:border-info resize-none"
        rows="2"
      ></textarea>
      <Button variant="outline" class="h-auto px-6 border-sand/20 bg-black hover:bg-panel" onclick={sendMessage}>
        <SendIcon class="w-5 h-5" />
      </Button>
    </div>
    <div class="mt-2 flex justify-between text-[9px] text-sand/60">
      <span>CMD: /HELP, /STATUS, /CLEAR</span>
      <span>READY_FOR_INPUT</span>
    </div>
  </div>
</div>

<style>
  :global(.scrollbar-thin::-webkit-scrollbar) {
    width: 6px;
  }
  :global(.scrollbar-thin::-webkit-scrollbar-thumb) {
    background: #333;
    border-radius: 10px;
  }
</style>






