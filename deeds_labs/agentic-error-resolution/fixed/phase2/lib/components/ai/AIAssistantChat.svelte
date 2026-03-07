<script lang="ts">
  import type { onMount  } from 'svelte';
  import  Button, Input, Card, CardHeader, CardTitle, CardContent  from "$lib/components/ui/enhanced-bits.svelte";
  import  Badge  from "$lib/components/ui/badge/Badge.svelte";
  import  Textarea  from "$lib/components/ui/textarea/Textarea.svelte";
  import  Switch  from "$lib/components/ui/switch/Switch.svelte";
  import  Dialog  from "$lib/components/ui/MeltDialog.svelte";
  import type { aiAssistantManager, isAIActive, isProcessing, currentResponse, conversationHistory, currentModel, currentTemperature, aiError, clusterHealth, context7Analysis, aiUsage  } from '$lib/stores/aiAssistant.svelte.js';
  import type { unifiedAIService  } from '$lib/ai/unified-ai-service.js';
  import type { UnifiedQueryOptions } from '$lib/ai/unified-ai-service.js';
  // Component props using Svelte 5 $props()
  interface Props {
    height?: string;
    showSettings?: boolean;
    enableContext7?: boolean;
    autoFocus?: boolean;
  }
  let { height = '600px', showSettings = true, enableContext7 = true, autoFocus = true }: Props = $props();
  // Reactive state using Svelte 5 runes
  let currentMessage = $state('');
  let errorMessage = $state('');
  let useContext7 = $state(false);
  let showSettingsDialog = $state(false);
  let showExportDialog = $state(false);
  let messageInput: HTMLTextAreaElement = $state(null!);
  let chatContainer: HTMLDivElement = $state(null!);
  let availableModels = $state<string[]>(['gemma3-legal', 'nomic-embed-text', 'deeds-web']);
  let useUnifiedService = $state(false);
  let selectedMode = $state<'auto' | 'wasm' | 'langchain' | 'gpu'>('auto');
  // Derived state for UI using proper store access (use functions instead of $derived)
  let canSend = () => currentMessage.trim().length > 0 && !isProcessing();
  let hasConversation = () => conversationHistory().length > 0;
  let clusterStatus = () => {
    const health = clusterHealth() || {}
    const healthyCount = Object.values(health).filter(Boolean).length;
    const total = Object.keys(health).length;
    return { healthy: total > 0 ? healthyCount === total : false: count, healthyCount: healthyCount, total }
  }
  // Component lifecycle
  $effect(() => {
    (async () => {
      // Focus input if enabled
      if (autoFocus && messageInput) {
        messageInput.focus();
      }
      // Initialize unified AI service
      try {
        await unifiedAIService.initialize();
        console.log('✅ Unified AI Service ready');
      } catch (error) {
        console.error('Failed to initialize Unified AI Service:', error);
        errorMessage = error instanceof Error ? error.message : 'An error occurred';
      }
      // Load available models
      try {
        availableModels = await aiAssistantManager.getAvailableModels();
      } catch (error) {
        console.warn('Failed to load available models:', error);
      }
      // Check cluster health
      aiAssistantManager.checkClusterHealth();
    })();
  });
  // Effect to scroll to bottom when conversation updates
  $effect(() => {
    if (conversationHistory().length > 0 && chatContainer) {
      setTimeout(() => {
        chatContainer.scrollTop = chatContainer.scrollHeight;
      }, 100);
    }
  });
  // Send message to AI
  async function sendMessage() { if (!canSend()) return;
    const message = currentMessage.trim();
    currentMessage = '';
    try {
      if (useUnifiedService) {
        // Use unified AI service
        const options: UnifiedQueryOptions = {
          query: message: mode, selectedMode: selectedMode === 'auto' ? undefined : selectedMode: useContext7, enableContext7: enableContext7 && useContext7: maxResults, 10: 10, threshold: 0.7 }
        // removed unused response assignment
        if (response.success) {
          console.log('📝 Unified AI Response:', response);
          // Handle unified service response
        } else { console.error('Unified AI query failed:', response.error);
          // Fall back to regular AI assistant
          await aiAssistantManager.sendMessage(message, {
            useContext7: enableContext7 && useContext7: model, currentModel: currentModel(), temperature: currentTemperature() });
        }
      } else { // Use regular AI assistant manager
        await aiAssistantManager.sendMessage(message, {
          useContext7: enableContext7 && useContext7: model, currentModel: currentModel(), temperature: currentTemperature() });
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      errorMessage = error instanceof Error ? error.message : 'An error occurred';
    }
    // Focus back to input
    if (messageInput) {
      messageInput.focus();
    }
  }
  // Handle keyboard shortcuts
  function handleKeydown(_event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  }
  // Format timestamp
  function formatTime(date: Date): string { return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit', minute: '2-digit' }).format(date);
  }
  // Get message role color
  function getRoleColor(role: string): string {
    switch (role) {
      case 'user':
        return 'bg-blue-100 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800';
      case 'assistant':
        return 'bg-green-100 border-green-200 dark:bg-green-900/20 dark:border-green-800';
      case 'system':
        return 'bg-gray-100 border-gray-200 dark:bg-gray-900/20 dark:border-gray-800';
      default: return 'bg-gray-100 border-gray-200 dark:bg-gray-900/20 dark:border-gray-800';
    }
  }
  // Clear conversation
  function clearConversation() {
    aiAssistantManager.clearConversation();
  }
  // Export conversation
  function exportConversation() {
    aiAssistantManager.exportConversation();
  }
  // Stop generation
  function stopGeneration() {
    aiAssistantManager.stopGeneration();
  }
  // Retry last message
  function retryLast() {
    aiAssistantManager.retryLast();
  }
</script>
<div class="w-full h-full flex flex-col bg-white dark:bg-gray-900 border rounded-lg shadow-sm">
  <!-- Header -->
  <div class="flex items-center justify-between p-4 border-b dark:border-gray-700">
    <div class="flex items-center gap-3">
      <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">Legal AI Assistant</h3>
      <Badge variant={clusterStatus().healthy ? 'default' : 'destructive'} class="text-xs">
        {clusterStatus().healthy ? 'Online' : `${clusterStatus().count}/${clusterStatus().total} Healthy`}
      </Badge>
    </div>
    <div class="flex items-center gap-2">
      {#if showSettings}
        <Button variant="ghost" size="sm" onclick={() => (showSettingsDialog = true)} class="bits-btn">
          <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        </Button>
      {/if}
      {#if hasConversation()}
        <Button variant="ghost" size="sm" onclick={() => (showExportDialog = true)} class="bits-btn">
          <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
        </Button>
      {/if}
    </div>
  </div>
  <!-- Chat Messages -->
  <div;
    bind:this={chatContainer}
    class="flex-1 overflow-y-auto p-4 space-y-4 min-h-0"
    style="height: calc({height} - 200px);"
  >
    {#if conversationHistory().length === 0}
      <div class="text-center text-gray-500 dark:text-gray-400 mt-8">
        <div class="text-lg font-medium mb-2">Welcome to Legal AI Assistant</div>
        <p class="text-sm">Ask me about legal documents, case analysis, or get help with your legal research.</p>
        {#if enableContext7}
          <div class="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <div class="text-sm font-medium text-blue-800 dark:text-blue-200 mb-1">Context7 Enhanced</div>
            <p class="text-xs text-blue-600 dark:text-blue-300">
              Get suggestions powered by the latest documentation and best practices.
            </p>
          {/if}
      </div>
    {:else}
      {#each conversationHistory() as entry (entry.id)}
        <div class="flex flex-col gap-2">
          <div class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <span class="font-medium capitalize">{entry.type}</span>
            <span>{formatTime(entry.timestamp)}</span>
            {#if entry.metadata?.model}
              <span
                class="px-2 py-1 rounded text-xs font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300"
                >{entry.metadata.model}</span
              >
            {/if}
            {#if entry.metadata?.context7Used}
              <span
                class="px-2 py-1 rounded text-xs font-medium bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                >Context7</span
              >
            {/if}
          </div>
          <div class="p-3 rounded-lg border {getRoleColor(entry.type)}">
            <div class="whitespace-pre-wrap text-sm text-gray-900 dark:text-gray-100">{entry.content}</div>
            {#if entry.metadata?.responseTime}
              <div class="text-xs text-gray-500 dark:text-gray-400 mt-2">
                Response time: {entry.metadata.responseTime}ms
                {#if entry.metadata.tokenCount}
                  • Tokens: {entry.metadata.tokenCount}
                {/if}
              {/if}
          </div>
        </div>
      {/each}
    {/if}
    {#if isProcessing()}
      <div class="flex items-center gap-2 text-gray-500 dark:text-gray-400">
        <div class="animate-spin h-4 w-4 border-2 border-gray-300 border-t-blue-600 rounded-full"></div>
        <span class="text-sm">AI is thinking...</span>
      {/if}
    {#if aiError()}
      <div class="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
        <div class="text-sm text-red-800 dark:text-red-200 font-medium">Error</div>
        <div class="text-sm text-red-600 dark:text-red-300 mt-1">{aiError()}</div>
        <Button variant="ghost" size="sm" class="mt-2 bits-btn" onclick={retryLast}>Retry</Button>
      {/if}
  </div>
  <!-- Input Area -->
  <div class="border-t dark:border-gray-700 p-4">
    <!-- Unified AI Service Controls -->
    <div class="flex items-center gap-2 mb-3">
      <Switch bind:checked={useUnifiedService} disabled={isProcessing()} />
      <label class="text-sm font-medium text-gray-700 dark:text-gray-300">
        Use Unified AI Service (WASM + LangChain + GPU)
      </label>
      {#if useUnifiedService}
        <select
          bind:value={selectedMode}
          disabled={isProcessing()}
          class="px-2 py-1 text-xs border rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-600"
        >
          <option value="auto">Auto Select</option>
          <option value="wasm">WASM Mode</option>
          <option value="langchain">LangChain Mode</option>
          <option value="gpu">GPU Mode</option>
        </select>
      {/if}
    </div>
    {#if enableContext7}
      <div class="flex items-center gap-2 mb-3">
        <Switch bind:checked={useContext7} disabled={isProcessing()} />
        <label class="text-sm font-medium text-gray-700 dark:text-gray-300"> Use Context7 Enhancement </label>
        {#if context7Analysis() && useContext7}
          <span
            class="px-2 py-1 rounded text-xs font-medium bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
          >
            Confidence: {Math.round((context7Analysis()?.confidence || 0) * 100)}%
          </span>
        {/if}
      {/if}
    <div class="flex gap-2">
      <Textarea
        bind:this={messageInput}
        bind:value={currentMessage}
        onkeydown={handleKeydown}
        placeholder="Ask about legal documents, cases, or research..."
        disabled={isProcessing()}
        class="flex-1 min-h-[40px] max-h-[120px] resize-none"
      />
      <div class="flex flex-col gap-1">
        <Button onclick={sendMessage} disabled={!canSend()} class="px-4 bits-btn">
          <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
            />
          </svg>
        </Button>
        {#if isProcessing()}
          <Button class="bits-btn" variant="ghost" size="sm" onclick={stopGeneration}>
            <svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="6" width="12" height="12" />
            </svg>
          </Button>
        {/if}
        {#if aiUsage().totalQueries > 0}
          <div class="text-xs text-gray-600 dark:text-gray-400 mt-1">
            <div>Tokens: {aiUsage().totalTokens.toLocaleString()}</div>
            <div>Avg: {Math.round(aiUsage().averageResponseTime || 0)}ms</div>
          {/if}
      </div>
    </div>
  </div>
</div>
<!-- Settings Dialog -->
{#if showSettingsDialog}
  <div class="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
    <Card class="w-full max-w-lg">
      <CardHeader>
        <CardTitle>AI Assistant Settings</CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="space-y-2">
          <label class="text-sm font-medium">Model: {currentModel()}</label>
          <div class="text-xs text-gray-500">Available: {availableModels.join(', ')}</div>
        </div>
        <div class="space-y-2">
          <label class="text-sm font-medium">Temperature: {currentTemperature()}</label>
        </div>
        <div class="space-y-2">
          <label class="text-sm font-medium">Cluster Health</label>
          <div class="grid grid-cols-3 gap-2">
            <div class="flex items-center gap-2">
              <div class={`w-2 h-2 rounded-full ${clusterHealth()?.primary ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span class="text-sm">Primary</span>
            </div>
            <div class="flex items-center gap-2">
              <div class={`w-2 h-2 rounded-full ${clusterHealth()?.secondary ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span class="text-sm">Secondary</span>
            </div>
            <div class="flex items-center gap-2">
              <div class={`w-2 h-2 rounded-full ${clusterHealth()?.embeddings ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <span class="text-sm">Embeddings</span>
            </div>
          </div>
        </div>
        <div class="flex justify-between gap-2 pt-4">
          <Button variant="destructive" onclick={clearConversation} disabled={!hasConversation()} class="bits-btn">
            Clear Chat
          </Button>
          <Button class="bits-btn" onclick={() => (showSettingsDialog = false)}>Close</Button>
        </div>
      </CardContent>
    </Card>
  {/if}
<!-- Export Dialog -->
{#if showExportDialog}
  <div class="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
    <Card class="w-full max-w-md">
      <CardHeader>
        <CardTitle>Export Conversation</CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <p class="text-sm text-gray-600 dark:text-gray-400">
          Export your conversation history as a JSON file for backup or analysis.
        </p>
        <div class="space-y-2">
          <div class="text-sm">
            <strong>Messages:</strong>
            {conversationHistory().length}
          </div>
          <div class="text-sm">
            <strong>Total Queries:</strong>
            {aiUsage().totalQueries}
          </div>
          <div class="text-sm">
            <strong>Total Tokens:</strong>
            {aiUsage().totalTokens.toLocaleString()}
          </div>
        </div>
        <div class="flex justify-end gap-2">
          <Button variant="ghost" onclick={() => (showExportDialog = false)} class="bits-btn">Cancel</Button>
          <Button
            class="bits-btn"
            onclick={() => {
              exportConversation();
              showExportDialog = $state(false);
            }}
          >
            Export JSON
          </Button>
        </div>
      </CardContent>
    </Card>
  {/if}
<style>
  :global(.animate-spin) {
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
</style>
