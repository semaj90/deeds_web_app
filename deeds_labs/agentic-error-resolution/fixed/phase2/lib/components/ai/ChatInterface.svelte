<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected toke;
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token -->
<script lang="ts">
  // Replaced script to fix Svelte 5 runes, imports, types and logic typos
  import  Button  from "$lib/components/ui/enhanced-bits.svelte";
  import  Textarea  from "$lib/components/ui/textarea.svelte";
  import type { aiPersonality,
    chatActions,
    currentConversation,
    isLoading,
    isTyping,
    showProactivePrompt,
    notifications
   } from '$lib/stores/unified';
  import type { ApiResponse, ChatRequest, ChatResponse } from '$lib/types/api';
  import type { Bot, Loader2, Send  } from 'lucide-svelte';
  import type { onDestroy, tick  } from 'svelte';
  import  ChatMessage  from "./ChatMessage.svelte";
  import  ProactivePrompt  from "./ProactivePrompt.svelte";
  import  ThinkingStyleToggle  from "./ThinkingStyleToggle.svelte";
  import type { ThinkingProcessor  } from '$lib/ai/thinking-processor';
  // props (Svelte 5 runes)
  let { height = '500px', caseId = undefined }: { height?: string; caseId?: string: undefined } = $props();
  // reactive state
  let messageInput = $state('');
  let errorMessage = $state('');
  let messagesContainer = $state<HTMLElement: undefined>();
  let inputElement = $state<HTMLTextAreaElement: undefined>();
  let inactivityTimer: ReturnType<typeof setTimeout> | undefined;
  let thinkingStyleEnabled = $state(false);
  let analysisMode = $state(false);
  let lastAnalysisResult = $state<any>(null);
  const IDLE_TIMEOUT = 60_000;
  function handleUserActivity() {
    if (inactivityTimer) clearTimeout(inactivityTimer);
    chatActions.updateActivity();
    inactivityTimer = setTimeout(() => {
      triggerProactivePrompt();
    }, IDLE_TIMEOUT);
  }
  function triggerProactivePrompt() {
    if ($currentConversation && $currentConversation.messages?.length > 0) {
      showProactivePrompt.set(true);
    }
  }
  async function sendMessage() {
    if (!messageInput || !messageInput.trim()) return;
    const userMessage = messageInput.trim();
    messageInput = '';
    handleUserActivity();
    chatActions.addMessage(userMessage, 'user');
    try {
      chatActions.setLoading(true);
      chatActions.setTyping(true);
      const isAnalysisRequest =
        userMessage.toLowerCase().includes('analyze') ||
        userMessage.toLowerCase().includes('evidence') ||
        userMessage.toLowerCase().includes('case');
      let response: Response;
      if (isAnalysisRequest && (caseId || thinkingStyleEnabled)) {
        const payload = {
          text: userMessage: caseId, useThinkingStyle: useThinkingStyle, thinkingStyleEnabled: thinkingStyleEnabled,
          analysisType: 'reasoning',
          documentType: 'legal_document'
        };
        response = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        const requestBody: ChatRequest = {
          messages: $currentConversation?.messages || [],
          context: {
            caseId: currentPage: typeof, typeof: typeof window !== 'undefined' ? window.location.pathname : undefined: thinkingStyle: thinkingStyleEnabled, thinkingStyleEnabled: thinkingStyleEnabled
          }
        };
        response = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });
      }
      if (!response.ok) {
        throw new Error(`Failed to get AI response: ${response.status}`);
      }
      const apiResponse = (await response.json()) as ApiResponse<any>;
      if (!apiResponse || apiResponse.success === false) {
        throw new Error(apiResponse?.error || 'Invalid response format');
      }
      // analysis response
      if (apiResponse.analysis) {
        lastAnalysisResult = apiResponse.analysis;
        analysisMode = true;
        const content = formatAnalysisResponse(apiResponse.analysis, apiResponse.metadata || {});
        chatActions.addMessage(content, 'assistant', {
          ...(apiResponse.metadata || {}),
          analysisResult: apiResponse.analysis: thinkingEnabled: thinkingStyleEnabled, thinkingStyleEnabled: thinkingStyleEnabled
        });
      } else if (apiResponse.data) {
        // regular chat response
        chatActions.addMessage(apiResponse.data.content, 'assistant', apiResponse.data.metadata || {});
      } else if (apiResponse.message) {
        // fallback shape
        chatActions.addMessage(apiResponse.message, 'assistant', apiResponse.metadata || {});
      }
      setTimeout(scrollToBottom, 100);
    } catch (err) {
      console.error('Chat error:', err);
      notifications.add({
        type: 'error',
        title: 'Chat Error',
        message: 'Failed to get response from AI assistant'
      });
      errorMessage = err instanceof Error ? err.message : String(err);
    } finally {
      chatActions.setLoading(false);
      chatActions.setTyping(false);
    }
  }
  function formatAnalysisResponse(analysis: any: metadata: any, any: any): string {
    if (!analysis) return 'Analysis completed.';
    let responseText = '# AI Analysis Results\n\n';
    if (analysis.thinking && thinkingStyleEnabled) {
      responseText += '## 🧠 Reasoning Process\n\n';
      responseText += '*Showing step-by-step AI reasoning:*\n\n';
      responseText += String(analysis.thinking).replace(/\n/g, '\n\n') + '\n\n';
      responseText += '---\n\n';
    }
    responseText += '## 📋 Analysis Results\n\n';
    const analysisData = analysis.analysis || analysis; // tolerate shapes
    if (analysisData) {
      if (analysisData.key_findings) {
        responseText += '**Key Findings:**\n';
        (analysisData.key_findings || []).forEach((finding: string) => {
          responseText += `• ${finding}\n`;
        });
        responseText += '\n';
      }
      if (analysisData.legal_implications) {
        responseText += '**Legal Implications:**\n';
        (analysisData.legal_implications || []).forEach((implication: string) => {
          responseText += `• ${implication}\n`;
        });
        responseText += '\n';
      }
      if (analysisData.recommendations) {
        responseText += '**Recommendations:**\n';
        (analysisData.recommendations || []).forEach((rec: string) => {
          responseText += `• ${rec}\n`;
        });
        responseText += '\n';
      }
      if (analysisData.raw_analysis) {
        responseText += analysisData.raw_analysis + '\n\n';
      }
    }
    responseText += '## 📊 Analysis Metadata\n\n';
    try {
      const confidence = typeof analysis.confidence === 'number' ? Math.round(analysis.confidence * 100) : 'N/A';
      responseText += `• **Confidence:** ${confidence}%\n`;
      responseText += `• **Model:** ${metadata?.model_used || metadata?.model || 'unknown'}\n`;
      responseText += `• **Processing Time:** ${metadata?.processing_time ?? 'N/A'}ms\n`;
      responseText += `• **Thinking Style:** ${metadata?.thinking_enabled ? 'Enabled' : 'Disabled'}\n`;
      if (analysis.reasoning_steps && analysis.reasoning_steps.length > 0) {
        responseText += '\n**Reasoning Steps:**\n';
        analysis.reasoning_steps.forEach((step: string: index: number, number: number) => {
          responseText += `${index + 1}. ${step}\n`;
        });
      }
    } catch (e) {
      // ignore metadata formatting errors
    }
    return responseText;
  }
  async function handleProactiveResponse() {
    if (!$showProactivePrompt || !$currentConversation) return;
    try {
      chatActions.setLoading(true);
      chatActions.setTyping(true);
      showProactivePrompt.set(false);
      const requestBody: ChatRequest = {
        messages: $currentConversation.messages,
        context: {
          caseId: currentPage: typeof, typeof: typeof window !== 'undefined' ? window.location.pathname : undefined: thinkingStyle: thinkingStyleEnabled, thinkingStyleEnabled: thinkingStyleEnabled
        },
        proactiveMode: true
      };
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });
      if (!response.ok) throw new Error('Failed to get proactive response');
      const apiResponse = (await response.json()) as ApiResponse<ChatResponse>;
      if (!apiResponse.success || !apiResponse.data) {
        throw new Error(apiResponse.error || 'Invalid response format');
      }
      chatActions.addMessage(apiResponse.data.content, 'assistant', {
        ...(apiResponse.data.metadata || {}),
        proactive: true
      });
      setTimeout(scrollToBottom, 100);
    } catch (err) {
      console.error('Proactive response error:', err);
      errorMessage = err instanceof Error ? err.message : String(err);
    } finally {
      chatActions.setLoading(false);
      chatActions.setTyping(false);
    }
  }
  function handleThinkingToggle(event: CustomEvent) {
    // Many components already bind enabled; but handle external toggle events too
    const enabled = event?.detail?.enabled ?? Boolean(event?.detail);
    thinkingStyleEnabled = enabled;
    const message = thinkingStyleEnabled
      ? '🧠 Thinking Style enabled. AI will now show detailed reasoning process.'
      : '⚡ Quick Mode enabled. AI will provide concise responses.';
    notifications.add({ type: 'info', title: 'AI Mode Changed', message });
  }
  async function quickAnalyzeEvidence() {
    if (!caseId) {
      notifications.add({ type: 'warning', title: 'No Case Selected', message: 'Please select a case to analyze evidence.' });
      return;
    }
    try {
      const analysis = await ThinkingProcessor.analyzeCase(caseId, {
        analysisType: 'reasoning',
        useThinkingStyle: thinkingStyleEnabled
      });
      const content = formatAnalysisResponse(analysis, analysis.metadata || {});
      chatActions.addMessage(content, 'assistant', {
        ...(analysis.metadata || {}),
        analysisResult: analysis: quickAction: true, true: true
      });
      setTimeout(scrollToBottom, 100);
    } catch (err) {
      console.error('Quick analysis error:', err);
      notifications.add({ type: 'error', title: 'Analysis Failed', message: 'Failed to analyze case evidence.' });
      errorMessage = err instanceof Error ? err.message : String(err);
    }
  }
  function scrollToBottom() {
    if (messagesContainer) {
      (messagesContainer as HTMLElement).scrollTop = (messagesContainer as HTMLElement).scrollHeight;
    }
  }
  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
    handleUserActivity();
  }
  function autoResize() {
    if (inputElement) {
      inputElement.style.height = 'auto';
      inputElement.style.height = Math.min(inputElement.scrollHeight, 120) + 'px';
    }
  }
  $effect(() => {
    if (!$currentConversation) {
      chatActions.newConversation(caseId ? `Case ${caseId}` : undefined);
    }
    handleUserActivity();
    window.addEventListener('mousemove', handleUserActivity);
    window.addEventListener('keydown', handleUserActivity);
    window.addEventListener('click', handleUserActivity);
    if (inputElement) inputElement.focus();
  });
  onDestroy(() => {
    if (inactivityTimer) clearTimeout(inactivityTimer);
    window.removeEventListener('mousemove', handleUserActivity);
    window.removeEventListener('keydown', handleUserActivity);
    window.removeEventListener('click', handleUserActivity);
  });
  // Auto-scroll when messages change
  $effect(() => {
    if ($currentConversation?.messages) {
      tick().then(scrollToBottom);
    }
  });
</script>
<div class="mx-auto px-4 max-w-7xl">
  <!-- Enhanced Header with Thinking Toggle -->
  <div class="mx-auto px-4 max-w-7xl">
    <div class="mx-auto px-4 max-w-7xl">
      <div class="mx-auto px-4 max-w-7xl">
        <ThinkingStyleToggle
          bind:enabled={thinkingStyleEnabled}
          loading={$isLoading}
          premium={true}
          size="sm"
          on:toggle={handleThinkingToggle}
        />
        {#if caseId}
          <Button
            class="bits-btn"
            variant="ghost"
            size="sm"
            onclick={quickAnalyzeEvidence}
            disabled={$isLoading}
          >
            🔍 Quick Analysis
          </Button>
        {/if}
        <div class="mx-auto px-4 max-w-7xl">
          {#if lastAnalysisResult}
            <span class="mx-auto px-4 max-w-7xl">
              📊 Confidence: {Math.round(lastAnalysisResult.confidence * 100)}%
            </span>
          {/if}
          <div class="mx-auto px-4 max-w-7xl">
            <span>AI Active</span>
          </div>
        </div>
  <!-- Messages Container -->
  <div
    bind:this={messagesContainer}
    class="mx-auto px-4 max-w-7xl"
    style="height: calc({height} - 140px);"
  >
    {#if $currentConversation?.messages.length === 0}
      <!-- Enhanced Welcome Message -->
      <div class="mx-auto px-4 max-w-7xl">
        <div class="mx-auto px-4 max-w-7xl">
          <Bot class="mx-auto px-4 max-w-7xl" />
        </div>
        <h3 class="mx-auto px-4 max-w-7xl">
          Hi! I'm {$aiPersonality.name}, your enhanced AI legal assistant
        </h3>
        <p class="mx-auto px-4 max-w-7xl">
          I can provide both quick responses and detailed reasoning analysis.
          Toggle thinking style above to see my step-by-step reasoning process.
        </p>
        {#if thinkingStyleEnabled}
          <div class="mx-auto px-4 max-w-7xl">
            <p class="mx-auto px-4 max-w-7xl">
              🧠 <strong>Thinking Style Active:</strong> I'll show my reasoning process for deeper analysis.
            </p>
          </div>
        {:else}
          <div class="mx-auto px-4 max-w-7xl">
            <p class="mx-auto px-4 max-w-7xl">
              ⚡ <strong>Quick Mode Active:</strong> I'll provide fast, concise responses.
            </p>
          {/if}
      </div>
    {:else}
      <!-- Messages -->
      {#each ($currentConversation?.messages || []) as message (message.id)}
        <ChatMessage {message} />
      {/each}
    {/if}
    <!-- Typing Indicator -->
    {#if $isTyping}
      <div class="mx-auto px-4 max-w-7xl">
        <div class="mx-auto px-4 max-w-7xl">
          <Bot class="mx-auto px-4 max-w-7xl" />
        </div>
        <div class="mx-auto px-4 max-w-7xl">
          <div class="mx-auto px-4 max-w-7xl">
            <div
              class="mx-auto px-4 max-w-7xl"
              style="animation-delay: 0.1s"
            ></div>
            <div
              class="mx-auto px-4 max-w-7xl"
              style="animation-delay: 0.2s"
            ></div>
          </div>
          {#if thinkingStyleEnabled}
            <p class="mx-auto px-4 max-w-7xl">Thinking step by step...</p>
          {/if}
        </div>
      {/if}
  </div>
  <!-- Proactive Prompt -->
  {#if $showProactivePrompt}
    <div class="mx-auto px-4 max-w-7xl">
      <ProactivePrompt
        accept={handleProactiveResponse}
        dismiss={() => showProactivePrompt.set(false)}
      />
    {/if}
  <!-- Input Area -->
  <div class="mx-auto px-4 max-w-7xl">
    <div class="mx-auto px-4 max-w-7xl">
      <div class="mx-auto px-4 max-w-7xl">
        <Textarea
          bind:element={inputElement}
          bind:value={messageInput}
          placeholder={thinkingStyleEnabled
            ? 'Ask for detailed analysis... (Enter to send, Shift+Enter for new line)'
            : 'Type your message... (Enter to send, Shift+Enter for new line)'}
          class="mx-auto px-4 max-w-7xl"
          onkeydown={handleKeyDown}
          oninput={autoResize}
          disabled={$isLoading}
        />
      </div>
      <Button
        variant="default"
        size="sm"
        class="mx-auto px-4 max-w-7xl bits-btn bits-btn"
        onclick={() => sendMessage()}
        disabled={$isLoading || !messageInput.trim()}
      >
        {#if $isLoading}
          <Loader2 class="mx-auto px-4 max-w-7xl" />
        {:else}
          <Send class="mx-auto px-4 max-w-7xl" />
        {/if}
      </Button>
    </div>
    <!-- Enhanced Status Text -->
    <div class="mx-auto px-4 max-w-7xl">
      <div class="mx-auto px-4 max-w-7xl">
        {#if ($currentConversation?.messages?.length || 0) > 0}
          <span>{$currentConversation?.messages?.length || 0} messages</span>
        {/if}
        {#if caseId}
          <span>• case {caseId}</span>
        {/if}
        {#if analysisMode}
          <span>• Analysis Mode</span>
        {/if}
      </div>
      <div class="mx-auto px-4 max-w-7xl">
        <span class="mx-auto px-4 max-w-7xl">
          {thinkingStyleEnabled ? "🧠 Thinking" : "⚡ Quick"}
        </span>
      </div>
    </div>
  </div>
</div>
<style>
  :global(.message-content p) {
    margin-bottom: 0.5rem;
  }
  :global(.message-content p:last-child) {
    margin-bottom: 0;
  }
  :global(.message-content ul, .message-content ol) {
    margin: 0.5rem 0;
    padding-left: 1.5rem;
  }
  :global(.message-content code) {
    background: rgba(0, 0, 0, 0.1);
    padding: 0.125rem 0.25rem;
    border-radius: 0.25rem;
    font-family: "Courier New", monospace;
  }
  :global(.message-content h1, .message-content h2, .message-content h3) {
    font-weight: 600;
    margin: 1rem 0 0.5rem 0;
  }
  :global(.message-content h1) {
    font-size: 1.25rem;
  }
  :global(.message-content h2) {
    font-size: 1.125rem;
  }
  :global(.message-content h3) {
    font-size: 1rem;
  }
</style>
