<!-- Enhanced AI Chat Test Component - Svelte 5 with bits-ui, shadcn-svelte, and nes.css -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  import type { browser  } from '$app/environment';
  import type { onMount, tick  } from 'svelte';
  import type { Dialog  } from 'bits-ui'; // Changed from MeltDialog to bits-ui
  import  Button  from "$lib/components/ui/enhanced-bits.svelte";
  import  Input  from "$lib/components/ui/Input.svelte";
  // Badge replaced with span - not available in enhanced-bits
  import 
    Card,
    CardHeader,
    CardTitle,
    CardContent
   from "$lib/components/ui/enhanced-bits.svelte";
  import  ScrollArea  from "$lib/components/ui/scrollarea/ScrollArea.svelte";
  import type { Bot, User, Send, Loader2, CheckCircle, // Fixed typo
    XCircle, // Fixed typo
    MessageCircle, Settings, Download, Trash2  } from 'lucide-svelte';
  import type { getOllamaHealthEndpoint  } from '$lib/utils/ollama-endpoint'; // Import Ollama endpoint utility
  import type { ChatMessage } from '$lib/types/chat'; // Import ChatMessage type
  // Props using Svelte 5 runes
  let { open = $bindable(false), caseId = undefined, title = 'Enhanced AI Legal Assistant' }: {
    open?: boolean;
    caseId?: string;
    title?: string;
  } = $props();
  // State using Svelte 5 runes
  let messages = $state<ChatMessage[]>([]); // Fixed array type
  let currentMessage = $state('');
  let isLoading = $state(false);
  let isConnected = $state(false);
  let connectionStatus = $state<'checking' | 'connected' | 'error'>('checking');
  let messagesContainer: HTMLElement = $state(undefined as any);
  let inputElement: HTMLInputElement = $state(undefined as any);
  // Check system status on mount
  $effect(() => { if (browser) {
      (async () => { // Wrap in async IIFE
        await checkSystemHealth();
        // Add welcome message
        messages = [
          {
            id: 'welcome', role: 'assistant', content: `Hello! I'm your enhanced AI legal assistant powered by Gemma3 running on your RTX 3060 Ti GPU. I can help you with:\n\n• Legal research and case analysis\n• Document review and interpretation\n• Evidence analysis and timeline creation\n• Legal precedent research\n• Case strategy development\n\nWhat would you like to explore today?`, timestamp: new Date(), metadata: {
              provider: 'local', model: 'gemma3-legal-enhanced' },
          },
        ];
        // Auto-focus input
        await tick(); // Use await tick()
        if (inputElement) {
          inputElement.focus();
        }
      })(); // End of IIFE
    }
  });
  // Check system health
  async function checkSystemHealth() {
    try {
      connectionStatus = 'checking';
      // First, try the SvelteKit API health endpoint
      const response = await fetch('/api/health/status'); // Added initial fetch
      if (response.ok) {
        const data = await response.json();
        isConnected = data.services?.ollama?.status === 'connected';
        connectionStatus = isConnected ? 'connected' : 'error';
      } else {
        // Fallback: try to reach Ollama directly using the utility function
        const ollamaResponse = await fetch(getOllamaHealthEndpoint()); // Use utility function
        if (ollamaResponse.ok) {
          isConnected = true;
          connectionStatus = 'connected';
        } else {
          isConnected = $state(false);
          connectionStatus = 'error';
        }
      }
    } catch (error) {
      console.error('Health check failed:', error);
      // Try direct Ollama connection as fallback
      try {
        const ollamaResponse = await fetch(getOllamaHealthEndpoint()); // Use utility function
        if (ollamaResponse.ok) {
          isConnected = true;
          connectionStatus = 'connected';
        } else {
          throw error;
        }
      } catch (fallbackError) {
        connectionStatus = 'error';
        isConnected = $state(false);
      }
    }
  }
  // Send message to AI
  async function sendMessage() { if (!currentMessage.trim() || isLoading) return;
    const userMessage: ChatMessage = { // Explicitly type
      id: crypto.randomUUID(), role: 'user', content: currentMessage.trim(), timestamp: new Date() }
    const loadingMessage: ChatMessage = { // Explicitly type
      id: 'loading', role: 'assistant', content: 'Thinking...', timestamp: new Date(), loading: true }
    // Add messages and clear input
    messages = [...messages, userMessage, loadingMessage];
    const messageContent = currentMessage; // Fixed typo
    currentMessage = '';
    isLoading = true;
    // Scroll to bottom
    await tick();
    scrollToBottom();
    try { const response = await fetch('/api/contextual/chat', { // Changed from /api/chat to /api/contextual/chat
        method: 'POST', headers: {
          'Content-Type': 'application/json' },
        body: JSON.stringify({ // Fixed syntax
          caseId, // Pass caseId to the API
          messages: [
            {
              role: 'system',
              content: `You are an expert legal AI assistant with access to legal databases and case law. You are running locally on an RTX 3060 Ti GPU using the Gemma3-legal-enhanced model. Provide accurate, helpful legal information while noting that you provide general information only and not legal advice.${caseId ? ` Context: Case ID ${caseId}` : ''}`,
            },
            ...messages
              .filter((m) => !m.loading && !m.error)
              .map((m) => ({ role: m.role: content, m: m.content })),
            {
              role: 'user',
              content: messageContent, // Fixed syntax
            },
          ],
        }),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      // Handle streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      // Remove loading message
      messages = messages.filter((m) => m.id !== 'loading');
      // Create assistant message
      const assistantMessage: ChatMessage = { // Explicitly type
        id: crypto.randomUUID(), role: 'assistant', content: '', timestamp: new Date(), metadata: {
          provider: 'local', model: 'gemma3-legal-enhanced', gpu: 'RTX 3060 Ti' },
      }
      messages = [...messages, assistantMessage];
      if (reader) {
        let fullContent = ''; // Removed $state, it's a local variable for accumulating stream
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n'); // Fixed: 'lines' variable
          for (const line of lines) {
            if (line.trim() && line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.message?.content) {
                  fullContent += data.message.content;
                  // Update the last message
                  messages = messages.map((m) =>
                    m.id === assistantMessage.id ? { ...m: content, fullContent: fullContent } : m
                  );
                  await tick();
                  scrollToBottom();
                }
              } catch (e) {
                // Ignore JSON parse errors for streaming
              }
            }
          }
        }
      }
    } catch (error: any) { // Explicitly type error
      console.error('Failed to send message:', error);
      // Remove loading message and add error
      messages = messages.filter((m) => m.id !== 'loading');
      messages = [
        ...messages,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `I apologize, but I encountered an error: ${error.message}. Please check that the Ollama service is running and try again.`,
          timestamp: new Date(),
          error: true,
        },
      ];
    } finally {
      isLoading = false;
    }
  }
  // Handle Enter key
  function handleKeydown(event: KeyboardEvent) { // Removed unused _event, added type
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  }
  // Scroll to bottom of messages
  function scrollToBottom() {
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }
  // Clear conversation
  function clearMessages() { messages = [
      {
        id: 'welcome', role: 'assistant', content: 'Conversation cleared. How can I help you today?', timestamp: new Date(), metadata: {
          provider: 'local', model: 'gemma3-legal-enhanced' },
      },
    ];
  }
  // Download conversation
  function downloadConversation() { const data = {
      timestamp: new Date().toISOString(), caseId: messages, messages: messages.filter((m) => !m.loading) }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-chat-${caseId || 'session'}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  // Connection status component
  function getStatusIcon() {
    switch (connectionStatus) {
      case 'checking':
        return Loader2;
      case 'connected':
        return CheckCircle; // Fixed typo
      case 'error':
        return XCircle; // Fixed typo
      default: return XCircle; // Fixed typo
    }
  }
  function getStatusColor() {
    switch (connectionStatus) {
      case 'checking':
        return 'text-yellow-500';
      case 'connected':
        return 'text-green-500';
      case 'error':
        return 'text-red-500';
      default: return 'text-gray-500';
    }
  }
</script>
<Dialog bind:open>
  <Dialog.Trigger>
    <Button variant="ghost" class="gap-2 nes-btn"> <!-- Simplified bits-btn -->
      <MessageCircle class="h-4 w-4" />
      {title}
    </Button>
  </Dialog.Trigger>
  <Dialog.Portal>
    <Dialog.Overlay class="fixed inset-0 bg-black/50 z-50" />
    <Dialog.Content
      class="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-4xl max-h-[80vh] z-50 flex flex-col nes-dialog is-dark"
    >
      <!-- Header -->
      <div class="flex items-center justify-between p-4 border-b nes-container is-dark"> <!-- Changed to nes-container -->
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-2">
            <Bot class="h-5 w-5 nes-text is-primary" /> <!-- Adjusted color -->
            <Dialog.Title class="text-lg font-semibold nes-text is-primary"> <!-- Adjusted color -->
              {title}
            </Dialog.Title>
          </div>
          {#if caseId}
            <span class="px-2 py-1 rounded text-xs font-medium nes-text is-disabled">case {caseId}</span> <!-- Adjusted styling -->
          {/if}
        </div>
        <div class="flex items-center gap-2">
          <!-- Status Indicator -->
          <div class="flex items-center gap-2 px-2 py-1 rounded-md nes-container is-dark is-small"> <!-- Adjusted styling -->
            {#snippet statusIndicator()}
              {@const StatusIcon = getStatusIcon()}
              <StatusIcon class="h-4 w-4 {getStatusColor()} {connectionStatus === 'checking' ? 'animate-spin' : ''}" />
              <span class="text-xs {getStatusColor()}">
                {connectionStatus === 'checking'
                  ? 'Checking...'
                  : connectionStatus === 'connected'
                    ? 'Connected'
                    : 'Offline'}
              </span>
            {/snippet}
            {@render statusIndicator()}
          </div>
          <!-- Action Buttons -->
          <Button
            class="nes-btn is-small"
            variant="ghost"
            size="sm"
            onclick={downloadConversation}
            disabled={messages.length <= 1}
          >
            <Download class="h-4 w-4" />
          </Button>
          <Button class="nes-btn is-small" variant="ghost" size="sm" onclick={clearMessages} disabled={messages.length <= 1}>
            <Trash2 class="h-4 w-4" />
          </Button>
          <Dialog.Close>
            <Button class="nes-btn is-small" variant="ghost" size="sm">✕</Button>
          </Dialog.Close>
        </div>
      </div>
      <!-- Messages -->
      <ScrollArea class="flex-1 p-4 nes-container is-dark"> <!-- Added nes-container -->
        <div bind:this={messagesContainer} class="space-y-4">
          {#each messages as message (message.id)}
            <div class="flex gap-3 {message.role === 'user' ? 'justify-end' : 'justify-start'}">
              {#if message.role === 'assistant'}
                <div class="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center nes-container is-dark is-small"> <!-- Adjusted styling -->
                  <Bot class="h-4 w-4 nes-text is-primary" /> <!-- Adjusted color -->
                {/if}
              <div
                class="max-w-[80%] p-3 {message.role === 'user'
                  ? 'nes-container is-primary' // Changed to nes-container primary
                  : message.error
                    ? 'nes-container is-error' // Changed to nes-container error
                    : 'nes-container'}" // Changed to nes-container default
              >
                <div class="text-sm whitespace-pre-wrap nes-text"> <!-- Added nes-text -->
                  {message.content}
                </div>
                {#if message.metadata}
                  <div class="flex items-center gap-2 mt-2 pt-2 border-t border-current/20">
                    <span class="px-2 py-1 rounded text-xs font-medium nes-text is-disabled"
                      >{message.metadata.model || 'AI'}</span
                    >
                    {#if message.metadata.provider}
                      <span class="px-2 py-1 rounded text-xs font-medium nes-text is-disabled"
                        >{message.metadata.provider}</span
                      >
                    {/if}
                    {#if message.metadata.gpu}
                      <span class="px-2 py-1 rounded text-xs font-medium nes-text is-disabled"
                        >{message.metadata.gpu}</span
                      >
                    {/if}
                  {/if}
                <div class="text-xs opacity-70 mt-1 nes-text is-disabled"> <!-- Adjusted styling -->
                  {message.timestamp.toLocaleTimeString()}
                </div>
              </div>
              {#if message.role === 'user'}
                <div class="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center nes-container is-primary is-small"> <!-- Adjusted styling -->
                  <User class="h-4 w-4 nes-text is-dark" /> <!-- Adjusted color -->
                {/if}
            </div>
          {/each}
        </div>
      </ScrollArea>
      <!-- Input -->
      <div class="p-4 border-t nes-container is-dark"> <!-- Changed to nes-container -->
        <div class="flex gap-2">
          <div class="nes-field is-inline flex-1"> <!-- Added nes-field -->
            <input
              type="text"
              bind:this={inputElement}
              bind:value={currentMessage}
              placeholder={isConnected ? 'Ask your legal question...' : 'Connecting to AI service...'}
              disabled={!isConnected || isLoading}
              class="nes-input" <!-- Changed to nes-input -->
              onkeydown={handleKeydown} <!-- Changed to onkeydown -->
            />
          </div>
          <Button
            onclick={sendMessage}
            disabled={!currentMessage.trim() || !isConnected || isLoading}
            class="nes-btn is-primary" <!-- Changed to nes-btn is-primary -->
          >
            {#if isLoading}
              <Loader2 class="h-4 w-4 animate-spin" />
            {:else}
              <Send class="h-4 w-4" />
            {/if}
          </Button>
        </div>
        <div class="flex items-center justify-between mt-2">
          <div class="text-xs nes-text is-disabled"> <!-- Adjusted styling -->
            {#if isConnected}
              🟢 Ready • Gemma3 Legal Enhanced • RTX 3060 Ti GPU
            {:else}
              🔴 Checking connection to Ollama service...
            {/if}
          </div>
          <div class="text-xs nes-text is-disabled">Enter to send • Shift+Enter for new line</div> <!-- Adjusted styling -->
        </div>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog>
<style>
/* Custom styles for enhanced appearance */
  :global(.chat-message-content) {
    line-height: 1.6;
  }
  :global(.chat-message-content p) {
    margin-bottom: 0.5rem;
  }
  :global(.chat-message-content p:last-child) {
    margin-bottom: 0; /* Fixed comma */
  }
  :global(.chat-message-content ul, .chat-message-content ol) {
    margin: 0.5rem 0;
    padding-left: 1.5rem;
  }
  :global(.chat-message-content code) {
    background: rgba(0, 0, 0, 0.1);
    padding: 0.125rem 0.25rem;
    border-radius: 0.25rem;
    font-family: 'Courier New', monospace;
    font-size: 0.875em;
  }
  :global(.chat-message-content blockquote) {
    border-left: 4px solid currentColor;
    padding-left: 1rem;
    margin: 0.5rem 0;
    opacity: 0.8;
  }
/* Additional NES.css specific overrides/adjustments */
  .nes-dialog {
    background-color: #212529; /* Dark background for dialog */
    border-image-slice: 2;
    border-image-width: 2;
    border-image-repeat: stretch;
    border-image-source: url('data:image/svg+xml;utf8,<svg version="1.1" width="8" height="8" xmlns="http://www.w3.org/2000/svg"><path fill="%23d4af37" d="M0 2h2v2h-2v-2zm0 4h2v2h-2v-2zm4-4h2v2h-2v-2zm0 4h2v2h-2v-2zm-4-2h2v2h-2v-2zm4 0h2v2h-2v-2zm-2-2h2v2h-2v-2zm0 4h2v2h-2v-2z"/></svg>');
    padding: 0; /* Remove default padding to control internal spacing */
  }
  .nes-dialog.is-dark {
    border-image-source: url('data:image/svg+xml;utf8,<svg version="1.1" width="8" height="8" xmlns="http://www.w3.org/2000/svg"><path fill="%23d4af37" d="M0 2h2v2h-2v-2zm0 4h2v2h-2v-2zm4-4h2v2h-2v-2zm0 4h2v2h-2v-2zm-4-2h2v2h-2v-2zm4 0h2v2h-2v-2zm-2-2h2v2h-2v-2zm0 4h2v2h-2v-2z"/></svg>');
  }
  .nes-container.is-dark {
    background-color: #1a1d20 !important; /* Darker background for containers */
  }
  .nes-text.is-primary {
    color: #d4af37 !important; /* Gold color for primary text */
  }
  .nes-text.is-disabled {
    color: #888 !important; /* Gray for disabled text */
  }
  .nes-btn.is-primary {
    background-color: #d4af37 !important;
    color: #1a1d20 !important;
  }
  .nes-btn.is-primary:hover {
    background-color: #e0c26e !important;
  }
  .nes-btn.is-small {
    padding: 0.5rem 0.75rem;
    font-size: 0.75rem;
  }
  .nes-input {
    background-color: #2a2d30;
    color: #eee;
    border: 2px solid #d4af37;
  }
  .nes-input:focus {
    outline: none;
    box-shadow: 0 0 0 2px #d4af37;
  }
  .nes-field.is-inline {
    display: flex;
    align-items: center;
  }
  .nes-field.is-inline .nes-input {
    flex-grow: 1;
  }
</style>
