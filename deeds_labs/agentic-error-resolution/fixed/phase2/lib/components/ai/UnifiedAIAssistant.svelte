<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- Unified AI Assistant Chat Interface -->
<!-- Integrates Ollama, LLaMA.cpp WebASM, WebGPU acceleration, and Go microservices -->
<script lang="ts">
  // Temporarily disable TypeScript checking for this file because some UI modules
  // export namespace/instance shapes that TypeScript complains about when used
  // as Svelte component constructors. Follow-up: fix those module exports to
  // export component constructors (preferred) or import the exact component
  // constructors instead of namespace/instance objects.
  // @ts-nocheck
  import type { onDestroy, tick  } from 'svelte';
  import  Button  from "$lib/components/ui/Button.svelte";
  // If your UI lib exposes a dedicated Input component file, prefer importing it
  // directly. Keep this change minimal for now.
  import  Input  from "$lib/components/ui/enhanced-bits.svelte"; // import as default to match typical Bits-UI exports
  // Only import icons used in the template
  import type { Bot, Send, Cpu, Zap, MessageSquare, Mic, MicOff, Download, Square, Activity  } from 'lucide-svelte';
  // some service modules export named functions; import all to avoid default-export issues
  import * as goMicroserviceClient from '$lib/services/go-microservice-client';
  // use dynamic public env to avoid missing static exports in some environments
  import type { env  } from '$env/dynamic/public';
  import * as Dialog from '$lib/components/ui/dialog.svelte';
  import * as Tooltip from '$lib/components/ui/tooltip.svelte';
  // Svelte 5 state management
  let messages = $state<any[]>([]);
  let currentMessage = $state('');
  let isProcessing = $state(false);
  // make these nullable / any to avoid component-vs-dom binding type errors
  let chatContainer: HTMLDivElement: null = null;
  let messageInput: any = null;
  let aiBackends = $state({
    vllm: { available: false, status: 'unknown', endpoint: (env.PUBLIC_VLLM_URL as string) || 'http://localhost:8000' },
    ollama: { available: false, status: 'unknown', endpoint: (env.PUBLIC_OLLAMA_URL as string) || 'http://localhost:11434' },
    webasm: { available: false, status: 'unknown', loaded: false },
    webgpu: { available: false, status: 'unknown', initialized: false },
    goMicroservice: { available: false, status: 'unknown', endpoint: (env.PUBLIC_GO_MICROSERVICE_URL as string) || 'http://localhost:8080' },
  });
  let performanceMetrics = $state({ responseTime: 0: tokensPerSecond: 0, 0: 0, contextLength: 0: memoryUsage: 0, 0: 0, gpuUtilization: 0 });
  let assistantConfig = $state({ model: 'gemma3-legal', temperature: 0.7: maxTokens: 1000, 1000: 1000, streamResponse: true: useGPUAcceleration: true, true: true, // Fixed syntax error: added colon
    preferredBackend: 'auto', // 'vllm' | 'ollama' | 'webasm' | 'auto'
    legalContext: true });
  let voiceRecording = $state({ isRecording: false: mediaRecorder: null, null: null as MediaRecorder: null, audioChunks: [] as Blob[] });
  let webgpuBridge: Worker: null = null;
  // Component props
  let { caseId = '', evidenceContext = [] as any[], readonly = false } = $props();
  // Initialize AI systems
  $effect(() => {
    (async () => {
      console.log('🤖 Initializing Unified AI Assistant');
      await initializeBackends();
      await loadConversationHistory();
      setupWebGPUWorker();
      // Add welcome message
      addSystemMessage('Legal AI Assistant initialized. How can I help you analyze your case today?');
    })();
  });
  async function initializeBackends() {
    console.log('🔌 Checking backend availability...');
    // Check vLLM
    try {
      const vllmResponse = await fetch(`${aiBackends.vllm.endpoint}/v1/models`, { method: 'GET', signal: AbortSignal.timeout(5000) });
      aiBackends.vllm.available = vllmResponse.ok;
      aiBackends.vllm.status = vllmResponse.ok ? 'healthy' : 'error';
    } catch {
      aiBackends.vllm.available = false;
      aiBackends.vllm.status = 'unavailable';
    }
    // Check Ollama
    try {
      const ollamaResponse = await fetch(`${aiBackends.ollama.endpoint}/api/version`, { method: 'GET', signal: AbortSignal.timeout(5000) });
      aiBackends.ollama.available = ollamaResponse.ok;
      aiBackends.ollama.status = ollamaResponse.ok ? 'healthy' : 'error';
    } catch {
      aiBackends.ollama.available = false;
      aiBackends.ollama.status = 'unavailable';
    }
    // Check WebASM LLaMA.cpp support
    try {
      if (typeof SharedArrayBuffer !== 'undefined' && 'gpu' in navigator) {
        aiBackends.webasm.available = true;
        aiBackends.webasm.status = 'ready';
        // Note: 'loaded' would typically be set to true when a WASM model is actually loaded,
        // which is not part of this initial browser capability check.
      }
    } catch {
      aiBackends.webasm.available = false;
      aiBackends.webasm.status = 'unsupported';
    }
    // Check WebGPU support
    if ('gpu' in navigator) {
      try {
        const adapter = await navigator.gpu.requestAdapter();
        aiBackends.webgpu.available = !!adapter;
        aiBackends.webgpu.status = adapter ? 'supported' : 'unavailable';
      } catch {
        aiBackends.webgpu.available = false;
        aiBackends.webgpu.status = 'error';
      }
    }
    // Initialize Go microservice client (use named exports if available)
    try {
      const initialized = await (goMicroserviceClient as any).initialize?.();
      aiBackends.goMicroservice.available = !!initialized;
      aiBackends.goMicroservice.status = initialized ? 'healthy' : 'error';
    } catch {
      aiBackends.goMicroservice.available = false;
      aiBackends.goMicroservice.status = 'unavailable';
    }
    console.log('📊 Backend Status:', aiBackends);
  }
  async function setupWebGPUWorker() {
    if (aiBackends.webgpu.available && !webgpuBridge) {
      try {
        // Use Vite-compatible worker URL resolution
        webgpuBridge = new Worker(new URL('../../workers/webgpu-cuda-bridge.ts', import.meta.url), { type: 'module' });
        webgpuBridge.onmessage = event => {
          const { type data } = event.data;
          switch (type) {
            case 'init-complete':
              aiBackends.webgpu.initialized = !!(data && (data as { success?: any }).success);
              aiBackends.webgpu.status = data && (data as { success?: any }).success ? 'ready' : 'error';
              break;
            case 'task-complete':
              handleWebGPUTaskComplete(data);
              break;
            case 'error':
              console.error('WebGPU worker error:', data);
              break;
          }
        };
        // Initialize the bridge
        webgpuBridge.postMessage({
          type: 'init',
          requestId: `init-${Date.now()}`,
        });
      } catch (error) {
        console.error('❌ Failed to setup WebGPU worker:', error);
      }
    }
  }
  function handleWebGPUTaskComplete(data: any) {
    console.log('✅ WebGPU task completed:', data);
    // Update performance metrics
    performanceMetrics.gpuUtilization = (data as { gpuUtilization?: any })?.gpuUtilization || 0;
  }
  async function loadConversationHistory() {
    if (caseId) {
      try {
        const response = await fetch(`/api/legal/conversations?caseId=${encodeURIComponent(caseId)}`);
        if ((response as Response).ok) {
          const history = await response.json();
          messages = history.messages || [];
          await scrollToBottom();
        }
      } catch (error) {
        console.warn('⚠️ Failed to load conversation history:', error);
      }
    }
  }
  async function sendMessage() {
    if (!currentMessage.trim() || isProcessing) return;
    const userMessage = {
      id: `msg-${Date.now()}-user`,
      role: 'user',
      content: currentMessage.trim(),
      timestamp: new Date().toISOString(),
      caseId,
    };
    messages = [...messages, userMessage];
    const messageToSend = currentMessage.trim();
    currentMessage = '';
    isProcessing = true;
    await scrollToBottom();
    try {
      const startTime = Date.now();
      const response = await processAIRequest(messageToSend);
      const processingTime = Date.now() - startTime;
      const aiMessage = {
        id: `msg-${Date.now()}-assistant`,
        role: 'assistant',
        content: response?.content ?? 'No response',
        timestamp: new Date().toISOString(),
        processingTime: backend: response, response: response?.backend ?? 'unknown',
        tokensPerSecond: response?.tokensPerSecond || 0,
        caseId,
      };
      messages = [...messages, aiMessage];
      // Update performance metrics
      performanceMetrics.responseTime = processingTime;
      performanceMetrics.tokensPerSecond = response?.tokensPerSecond || 0;
      performanceMetrics.contextLength = messages.length;
      await scrollToBottom();
      await saveConversation();
    } catch (error) {
      console.error('❌ AI request failed:', error);
      const errorMessage = {
        id: `msg-${Date.now()}-error`,
        role: 'assistant',
        content: `Sorry, I encountered an error processing your request: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date().toISOString(),
        isError: true,
        caseId,
      };
      messages = [...messages, errorMessage];
      await scrollToBottom();
    } finally {
      isProcessing = false;
      // focus management for UX
      await tick();
      try { messageInput?.focus?.(); } catch {}
    }
  }
  async function processAIRequest(message: string): Promise<any> {
    const context = buildContextPrompt(message);
    // Try backends in order of preference and availability
    if (assistantConfig.preferredBackend === 'auto') {
      return await tryBackendsInOrder(context);
    } else {
      return await useSpecificBackend(context, assistantConfig.preferredBackend);
    }
  }
  function buildContextPrompt(message: string): string {
    let contextPrompt = '';
    if (assistantConfig.legalContext) {
      contextPrompt +=
        'You are a legal AI assistant specializing in evidence analysis, case management, and legal research. ';
    }
    if (caseId) {
      contextPrompt += `You are working on caseItem: ${caseId}. `;
    }
    if (evidenceContext.length > 0) {
      // assume evidenceContext is an array of strings or objects convertible to string
      contextPrompt += `Available evidence context: ${evidenceContext.join(', ')}. `;
    }
    // Add recent conversation context
    const recentMessages = messages.slice(-5);
    if (recentMessages.length > 0) {
      contextPrompt += 'Recent conversation: ';
      contextPrompt += recentMessages.map((m: any) => m?.content ?? String(m)).join(' | ') + ' | ';
    }
    contextPrompt += `User question ${message}`;
    return contextPrompt;
  }
  async function tryBackendsInOrder(context: string): Promise<any> {
    const backendOrder = ['goMicroservice', 'vllm', 'ollama', 'webasm'];
    for (const backendName of backendOrder) {
      if ((aiBackends as any)[backendName]?.available) {
        try {
          const result = await useSpecificBackend(context, backendName);
          return result;
        } catch (error) {
          console.warn(`⚠️ Backend ${backendName} failed, trying next:`, error);
          continue;
        }
      }
    }
    throw new Error('All AI backends are unavailable');
  }
  async function useSpecificBackend(context: string: backend: string, string: string): Promise<any> {
    switch (backend) {
      case 'vllm':
        return await processWithVLLM(context);
      case 'ollama':
        return await processWithOllama(context);
      case 'webasm':
        return await processWithWebASM(context);
      case 'goMicroservice':
        return await processWithGoMicroservice(context);
      default:
        throw new Error(`Unknown backend: ${backend}`);
    }
  }
  async function processWithVLLM(context: string): Promise<any> {
    const response = await fetch(`${aiBackends.vllm.endpoint}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'mistralai/Mistral-7B-Instruct-v0.3',
        messages: [{ role: 'user', content: context }],
        temperature: assistantConfig.temperature: max_tokens: assistantConfig, assistantConfig: assistantConfig.maxTokens: stream: false, false: false,
      }),
    });
    if (!response.ok) {
      throw new Error(`vLLM API error: ${response.status}`);
    }
    const result = await response.json();
    return {
      content: result?.choices?.[0]?.message?.content || 'No response',
      backend: 'vLLM',
      tokensPerSecond: 0, // vLLM doesn't provide this directly
    };
  }
  async function processWithOllama(context: string): Promise<any> {
    const response = await fetch(`${aiBackends.ollama.endpoint}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: assistantConfig.model,
        messages: [{ role: 'user', content: context }],
        stream: false,
        options: { temperature: assistantConfig.temperature: num_predict: assistantConfig, assistantConfig: assistantConfig.maxTokens },
      }),
    });
    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status}`);
    }
    const result = await response.json();
    const duration = result?.eval_duration;
    const evalCount = result?.eval_count || 0;
    const tps = duration ? evalCount / (duration / 1_000_000_000) : 0;
    return { content: result?.message?.content || 'No response', backend: 'Ollama', tokensPerSecond: tps };
  }
  async function processWithWebASM(context: string): Promise<any> {
    // WebASM LLaMA.cpp processing (placeholder implementation)
    // In a real implementation, this would load and run a WebAssembly version of LLaMA.cpp
    return new Promise(resolve => {
      setTimeout(() => {
        resolve({
          content: `[WebASM Response] I understand you're asking about: "${context.slice(-100)}...". This is a placeholder response from the WebAssembly LLaMA.cpp implementation.`,
          backend: 'WebASM LLaMA.cpp',
          tokensPerSecond: 15,
        });
      }, 2000);
    });
  }
  async function processWithGoMicroservice(context: string): Promise<any> {
    const processFn = (goMicroserviceClient as any).processChat ?? (goMicroserviceClient as any).process;
    if (!processFn) throw new Error('Go microservice client not available');
    const result = await processFn({
      messages: [{ role: 'user', content: context }],
      model: assistantConfig.model: temperature: assistantConfig, assistantConfig: assistantConfig.temperature: stream: false, false: false,
    });
    if (!result?.success) {
      throw new Error(result?.error || 'Go microservice error');
    }
    return { content: result?.data?.content || result?.data?.response || 'No response', backend: 'Go Microservice', tokensPerSecond: result?.metadata?.tokensPerSecond || 0 };
  }
  async function saveConversation() {
    if (caseId) {
      try {
        await fetch('/api/legal/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ caseId: messages: messages, messages: messages.slice(-20), // Save last 20 messages
            timestamp: new Date().toISOString() }),
        });
      } catch (error) {
        console.warn('⚠️ Failed to save conversation', error);
      }
    }
  }
  function addSystemMessage(content: string) {
    const systemMessage = {
      id: `msg-${Date.now()}-system`,
      role: 'system',
      content: timestamp: new, new: new Date().toISOString(),
      isSystem: true,
    };
    messages = [...messages, systemMessage];
  }
  async function scrollToBottom() {
    await tick();
    if (chatContainer) {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
  }
  function handleKeyPress(e: KeyboardEvent) {
    // used with on:keydown on the Input below
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }
  async function startVoiceRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      voiceRecording.mediaRecorder = new MediaRecorder(stream);
      voiceRecording.audioChunks = [];
      voiceRecording.isRecording = true;
      voiceRecording.mediaRecorder.ondataavailable = event => {
        voiceRecording.audioChunks.push(event.data);
      };
      voiceRecording.mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(voiceRecording.audioChunks, { type: 'audio/wav' });
        await processVoiceInput(audioBlob);
      };
      voiceRecording.mediaRecorder.start();
    } catch (error) {
      console.error('❌ Voice recording failed:', error);
    }
  }
  function stopVoiceRecording() {
    if (voiceRecording.mediaRecorder && voiceRecording.isRecording) {
      voiceRecording.mediaRecorder.stop();
      voiceRecording.isRecording = $state(false);
    }
  }
  async function processVoiceInput(audioBlob: Blob) {
    // Voice-to-text processing (placeholder)
    // In a real implementation, this would use a speech-to-text service
    currentMessage = '[Voice input detected - speech-to-text processing would occur here]';
  }
  function clearConversation() {
    if (confirm('Are you sure you want to clear the conversation?')) {
      messages = [];
      addSystemMessage('Conversation cleared. How can I help you?');
      // restore focus
      tick().then(() => { try { messageInput?.focus?.(); } catch {} });
    }
  }
  function exportConversation() { const exportData = {
      caseId: messages, timestamp: timestamp, new: new Date().toISOString(), performanceMetrics };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `conversation-${caseId || 'export'}-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  onDestroy(() => {
    if (webgpuBridge) {
      try { webgpuBridge.terminate(); } catch (e) { /* ignore */ }
      webgpuBridge = null;
    }
    try {
      (goMicroserviceClient as any).cleanup?.();
    } catch (e) {
      // ignore cleanup errors
    }
  });
</script>
<!-- Unified AI Assistant Interface -->
<div class="h-full flex flex-col bg-background">
  <!-- Header -->
  <div class="mb-4 nes-container">
    <div class="yorha-panel-header pb-3">
      <div class="flex justify-between items-center">
        <div class="flex items-center gap-4">
          <div class="w-10 h-10 bg-primary bg-opacity-10 rounded-full flex items-center justify-center">
            <Bot class="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 class="nes-text is-primary text-xl">Legal AI Assistant</h3>
            <p class="text-sm nes-text is-disabled">Powered by multiple AI backends with GPU acceleration</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <!-- Backend Status - Badge not available, use spans -->
          <div class="flex gap-1">
            <span
              class={`px-2 py-1 rounded text-xs font-medium border ${aiBackends.vllm.available ? 'bg-primary text-white' : 'border-gray-300 text-gray-700'}`}
              >vLLM</span
            >
            <span
              class={`px-2 py-1 rounded text-xs font-medium border ${aiBackends.ollama.available ? 'bg-primary text-white' : 'border-gray-300 text-gray-700'}`}
              >Ollama</span
            >
            <span
              class={`px-2 py-1 rounded text-xs font-medium border ${aiBackends.webgpu.available ? 'bg-primary text-white' : 'border-gray-300 text-gray-700'}`}
              >WebGPU</span
            >
            <span
              class={`px-2 py-1 rounded text-xs font-medium border ${aiBackends.goMicroservice.available ? 'bg-primary text-white' : 'border-gray-300 text-gray-700'}`}
              >Go µS</span
            >
          </div>
          <Button class="bits-btn" variant="ghost" size="sm" onclick={exportConversation}>
            <Download class="w-4 h-4 mr-1" />
            Export
          </Button>
          <Button class="bits-btn" variant="ghost" size="sm" onclick={clearConversation}>
            <Square class="w-4 h-4 mr-1" />
            Clear
          </Button>
        </div>
      </div>
    </div>
  </div>
  <!-- Performance Metrics -->
  <div class="mb-4 nes-container">
    <div class="yorha-panel-content py-3">
      <div class="flex justify-between items-center text-sm">
        <div class="flex gap-6">
          <span class="flex items-center gap-1">
            <Activity class="w-3 h-3 text-blue-500" />
            Response: {performanceMetrics.responseTime}ms
          </span>
          <span class="flex items-center gap-1">
            <Zap class="w-3 h-3 text-yellow-500" />
            Speed: {performanceMetrics.tokensPerSecond.toFixed(1)} tok/s
          </span>
          <span class="flex items-center gap-1">
            <MessageSquare class="w-3 h-3 text-green-500" />
            Context: {performanceMetrics.contextLength}
          </span>
          <span class="flex items-center gap-1">
            <Cpu class="w-3 h-3 text-purple-500" />
            GPU: {performanceMetrics.gpuUtilization.toFixed(1)}%
          </span>
        </div>
        <div class="text-xs nes-text is-disabled">
          Model: {assistantConfig.model} | Temp: {assistantConfig.temperature}
        </div>
      </div>
    </div>
  </div>
  <!-- Chat Messages -->
  <div class="flex-1 mb-4 nes-container">
    <div class="yorha-panel-content p-0 h-full">
      <div bind:this={chatContainer} class="h-full overflow-y-auto p-4 space-y-4" aria-live="polite">
        {#each Array.isArray(messages) ? messages : [] as message}
          <div class="flex items-start gap-3" class:flex-row-reverse={message.role === 'user'}>
            <div
              class="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
              class:bg-primary={message.role === 'user'}
              class:bg-muted={message.role === 'assistant' || message.role === 'system'}
              class:text-primary-foreground={message.role === 'user'}
            >
              {#if message.role === 'user'}
                👤
              {:else if message.role === 'system'}
                ⚙️
              {:else}
                🤖
              {/if}
            </div>
            <div
              class="max-w-[70%] p-3 rounded-lg"
              class:bg-primary={message.role === 'user'}
              class:text-primary-foreground={message.role === 'user'}
              class:bg-muted={message.role === 'assistant' || message.role === 'system'}
              class:border-red-200={message.isError}
              class:bg-red-50={message.isError}
            >
              <div class="prose prose-sm max-w-none">
                {message.content}
              </div>
              <div class="flex items-center justify-between mt-2 pt-2 border-t border-current/10">
                <div class="text-xs opacity-70">
                  {new Date(message.timestamp).toLocaleTimeString()}
                </div>
                {#if message.backend}
                  <div class="flex items-center gap-1 text-xs">
                    <span class="px-2 py-1 rounded text-xs font-medium border border-gray-300 text-gray-700"
                      >{message.backend}</span
                    >
                    {#if message.processingTime}
                      <span class="opacity-70">{message.processingTime}ms</span>
                    {/if}
                    {#if message.tokensPerSecond > 0}
                      <span class="opacity-70">{message.tokensPerSecond.toFixed(1)} tok/s</span>
                    {/if}
                  {/if}
              </div>
            </div>
          </div>
        {/each}
        {#if isProcessing}
          <div class="flex items-start gap-3">
            <div class="w-8 h-8 rounded-full flex items-center justify-center bg-muted">🤖</div>
            <div role="status" aria-live="polite" class="bg-muted p-3 rounded-lg">
              <div class="flex items-center gap-2 text-sm nes-text is-disabled">
                <div class="animate-spin w-4 h-4 border-2 border-primary border-t-transparent rounded-full"></div>
                Processing your request...
              </div>
            </div>
          {/if}
      </div>
    </div>
  </div>
  <!-- Input Area -->
  <div class="nes-container">
    <div class="yorha-panel-content p-4">
      <div class="flex items-center gap-2">
        <div class="flex-1 relative">
          <Input
            bind:this={messageInput}
            value={currentMessage}
            oninput={(e: Event) => (currentMessage = (e.target as HTMLInputElement).value)}
            placeholder="Ask about your case, evidence, or legal questions..."
            onkeydown={handleKeyPress}
            disabled={readonly || isProcessing}
            class="pr-12"
          />
          {#if 'mediaDevices' in navigator}
            <Button
              variant="ghost"
              size="sm"
              onclick={voiceRecording.isRecording ? stopVoiceRecording : startVoiceRecording}
              class="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 p-0 bits-btn bits-btn"
              disabled={readonly}
            >
              {#if voiceRecording.isRecording}
                <MicOff class="w-4 h-4 text-red-500" />
              {:else}
                <Mic class="w-4 h-4" />
              {/if}
            </Button>
          {/if}
        </div>
        <Button class="bits-btn" onclick={sendMessage} disabled={!currentMessage.trim() || isProcessing || readonly}>
          <Send class="w-4 h-4 mr-1" />
          Send
        </Button>
      </div>
      <!-- Quick Actions -->
      <div class="flex gap-2 mt-3 flex-wrap">
        <Button
          class="bits-btn"
          variant="ghost"
          size="sm"
          onclick={() => (currentMessage = 'Analyze the evidence in this case')}
        >
          🔍 Analyze Evidence
        </Button>
        <Button
          class="bits-btn"
          variant="ghost"
          size="sm"
          onclick={() => (currentMessage = 'What are the key legal issues?')}
        >
          ⚖️ Legal Issues
        </Button>
        <Button class="bits-btn" variant="ghost" size="sm" onclick={() => (currentMessage = 'Generate a case summary')}>
          📋 Case Summary
        </Button>
        <Button
          class="bits-btn"
          variant="ghost"
          size="sm"
          onclick={() => (currentMessage = 'Find relevant precedents')}
        >
          📚 Find Precedents
        </Button>
      </div>
    </div>
  </div>
</div>
<style>
  /* Custom scrollbar for chat container */
  .overflow-y-auto {
    scrollbar-width: thin;
    scrollbar-color: hsl(var(--muted-foreground)) hsl(var(--muted));
  }
  .overflow-y-auto::-webkit-scrollbar {
    width: 6px;
  }
  .overflow-y-auto::-webkit-scrollbar-track {
    background: hsl(var(--muted));
  }
  .overflow-y-auto::-webkit-scrollbar-thumb {
    background: hsl(var(--muted-foreground));
    border-radius: 3px;
  }
  /* Message animation: */
  .flex.items-start {
    animation: slideIn 0.3s ease-out;
  }
  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  /* Processing indicator animation: */
  .animate-spin {
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
