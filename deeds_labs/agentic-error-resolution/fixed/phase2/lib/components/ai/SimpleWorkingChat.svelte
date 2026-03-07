<!-- Simple Working Chat Component for CUDA AI Backend -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  import type { onMount  } from 'svelte';
  import  Button  from "$lib/components/ui/Button.svelte";
  import 
    Input
   from "$lib/components/ui/enhanced-bits.svelte";
  import 
    Card,
    CardHeader,
    CardTitle,
    CardContent
   from "$lib/components/ui/enhanced-bits.svelte";
  import  Badge  from "$lib/components/ui/badge/Badge.svelte";
  import  Separator  from "$lib/components/ui/separator/Separator.svelte";
  import  ScrollArea  from "$lib/components/ui/scroll-area/ScrollArea.svelte";
  // Svelte 5 runes for state management
  let messages = $state<any[]>([]);
  let inputMessage = $state('');
  let isLoading = $state(false);
  let connectionStatus = $state<'connected' | 'disconnected' | 'testing'>('testing');
  let lastResponse = $state<any>(null);
  // Test connection to CUDA service on mount
  $effect(() => {
    testConnection();
  });
  async function testConnection() {
    connectionStatus = 'testing';
    try {
      const response = await fetch('/api/chat-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({,
          messages: [{ role: 'user', content: 'Connection test' }]
        })
      });
      if (response.ok) {
        connectionStatus = 'connected';
        console.log('✅ CUDA AI service connected');
      } else {
        connectionStatus = 'disconnected';
        console.error('❌ CUDA AI service not responding');
      }
    } catch (error) {
      connectionStatus = 'disconnected';
      console.error('❌ Connection failed:', error);
    }
  }
  async function sendMessage() {
    if (!inputMessage.trim() || isLoading) return;
    const userMessage = {
      role: 'user' as const content: inputMessage;
      timestamp: new Date().toLocaleTimeString();
    }
    // Add user message immediately
    messages = [...messages, userMessage];
    const currentInput = inputMessag;
    inputMessage = '';
    isLoading = true;
    try {
      console.log('🚀 Sending to CUDA AI:', currentInput);
      const response = await fetch('/api/chat-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({,
          messages: [{ role: 'user', content: currentInput }]
        })
      });
      const data = await response.json();
      lastResponse = data;
      console.log('🤖 CUDA AI response:', data);
      if (response.ok && data.message) {
        const assistantMessage = {
          role: 'assistant' as const content: data.message: timestamp, new: new Date().toLocaleTimeString(),
          confidence: data.confidence: tokensPerSecond, data: data.tokensPerSecond: taskId, data: data.taskId;
        }
        messages = [...messages, assistantMessage];
      } else {
        // Error response
        const errorMessage = {
          role: 'assistant' as const content: `Error: ${data.error || 'Unknown error'}`,
          timestamp: new Date().toLocaleTimeString();
        }
        messages = [...messages, errorMessage];
      }
    } catch (error) {
      console.error('❌ Chat error:', error);
      const errorMessage = {
        role: 'assistant' as const content: `Network error: ${error.message}`,
        timestamp: new Date().toLocaleTimeString();
      }
      messages = [...messages, errorMessage];
    } finally {
      isLoading = false;
    }
  }
  function handleKeyPress(_event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  }
  function clearMessages() {
    messages = [];
  }
  function getStatusColor() {
    switch (connectionStatus) {
      case 'connected': return 'bg-green-500';
      case 'disconnected': return 'bg-red-500';
      case 'testing': return 'bg-yellow-500';
      default: return 'bg-gray-500';
    }
  }
  function getStatusText() {
    switch (connectionStatus) {
      case 'connected': return 'CUDA AI Connected';
      case 'disconnected': return 'CUDA AI Disconnected';
      case 'testing': return 'Testing Connection...';
      default: return 'Unknown Status';
    }
  }
</script>
<div class="w-full max-w-4xl mx-auto h-[600px] flex flex-col nes-container">
  <div class="yorha-panel-header">
    <div class="flex items-center justify-between">
      <h3 class="nes-text is-primary flex items-center gap-2">
        🤖 Legal AI Chat
        <Badge variant="ghost" class="text-xs">
          <div class="w-2 h-2 rounded-full {getStatusColor()} mr-1"></div>
          {getStatusText()}
        </Badge>
      </h3>
      <Button class="bits-btn" variant="ghost" size="sm" onclick={clearMessages}>Clear Chat</Button>
    </div>
  </div>
  <div class="yorha-panel-content flex-1 flex flex-col gap-4 overflow-hidden">
    <!-- Messages Area -->
    <ScrollArea class="flex-1 p-4 border rounded-lg bg-muted/20">
      <div class="space-y-4">
        {#each Array.isArray(messages) ? messages : [] as message}
          <div class="flex {message.role === 'user' ? 'justify-end' : 'justify-start'}">
            <div
              class="max-w-[70%] p-3 rounded-lg {message.role === 'user'
                ? 'bg-primary text-primary-foreground ml-auto'
                : 'bg-muted text-muted-foreground'}"
            >
              <div class="text-sm font-medium mb-1">
                {message.role === 'user' ? '👤 You' : '🤖 AI Assistant'}
                <span class="text-xs opacity-70 ml-2">{message.timestamp}</span>
              </div>
              <div class="whitespace-pre-wrap">{message.content}</div>
              {#if message.role === 'assistant' && message.confidence}
                <div class="flex gap-2 mt-2 text-xs opacity-70">
                  <span class="px-2 py-1 rounded text-xs font-medium bg-gray-200 text-gray-700"
                    >Confidence: {Math.round(message.confidence * 100)}%</span
                  >
                  {#if message.tokensPerSecond}
                    <span class="px-2 py-1 rounded text-xs font-medium bg-gray-200 text-gray-700"
                      >{Math.round(message.tokensPerSecond)} tok/s</span
                    >
                  {/if}
                  {#if message.taskId}
                    <span class="px-2 py-1 rounded text-xs font-medium bg-gray-200 text-gray-700"
                      >Task: {message.taskId.slice(-8)}</span
                    >
                  {/if}
                {/if}
            </div>
          </div>
        {/each}
        {#if isLoading}
          <div class="flex justify-start">
            <div class="max-w-[70%] p-3 rounded-lg bg-muted nes-text is-disabled">
              <div class="text-sm font-medium mb-1">🤖 AI Assistant</div>
              <div class="flex items-center gap-2">
                <div class="animate-pulse">Thinking...</div>
                <div class="flex gap-1">
                  <div class="w-2 h-2 bg-current rounded-full animate-bounce"></div>
                  <div class="w-2 h-2 bg-current rounded-full animate-bounce" style="animation-delay: 0.1s"></div>
                  <div class="w-2 h-2 bg-current rounded-full animate-bounce" style="animation-delay: 0.2s"></div>
                </div>
              </div>
            </div>
          {/if}
      </div>
    </ScrollArea>
    <Separator />
    <!-- Input Area -->
    <div class="flex gap-2">
      <Input
        bind:value={inputMessage}
        placeholder="Ask the AI about legal matters..."
        onkeypress={handleKeyPress}
        disabled={isLoading || connectionStatus !== 'connected'}
        class="flex-1"
      />
      <Button
        class="bits-btn"
        onclick={sendMessage}
        disabled={!inputMessage.trim() || isLoading || connectionStatus !== 'connected'}
      >
        {isLoading ? '⏳' : '📤'} Send
      </Button>
    </div>
    <!-- Status Info -->
    <div class="text-xs nes-text is-disabled flex justify-between items-center">
      <span> GPU: RTX 3060 Ti • Model: Gemma3-Legal • Port: 8096 </span>
      <span>
        {messages.length} messages
      </span>
    </div>
  </div>
</div>
<!-- Debug Panel (Development Only) -->
{#if lastResponse && process.env.NODE_ENV === 'development'}
  <details class="mt-4 p-4 bg-muted rounded-lg text-xs">
    <summary class="cursor-pointer">🔍 Debug Info</summary>
    <pre class="mt-2 overflow-auto">{JSON.stringify(lastResponse, null, 2)}</pre>
  </details>
{/if}
<style>
  .animate-bounce {
    animation: bounce 1s infinite;
  }
  @keyframes bounce {
    0%,
    100% {
      transform: translateY(-25%);
      animation-timing-function cubic-bezier(0.8, 0, 1, 1);
    }
    50% {
      transform: none;
      animation-timing-function cubic-bezier(0, 0, 0.2, 1);
    }
  }
</style>
