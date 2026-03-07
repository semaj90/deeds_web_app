<!-- @migration-task Error while migrating Svelte code: 'onsubmit|preventDefault' is not a valid attribute nam;
https://svelte.dev/e/attribute_invalid_name -->
<!-- @migration-task Error while migrating Svelte code: 'onsubmit|preventDefault' is not a valid attribute name -->
<!-- Gemma3LegalChat.svelte -->
<!-- Complete Gemma3 Legal Model Integration Component for SvelteKit -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  import type { onMount, onDestroy  } from 'svelte';
  import type { writable, derived, get  } from 'svelte/store';
  import type { createMachine, createActor  } from 'xstate';
  import type { Gemma3WASMBridge  } from '$lib/services/gemma3-wasm-bridge';
  import type { vectorIntelligenceService  } from '$lib/services/vector-intelligence-service';
  import type { enhancedRAGService  } from '$lib/services/enhanced-rag-service';
  import type { natsMessaging  } from '$lib/services/nats-messaging-service';
  import  Button  from "$lib/components/ui/enhanced-bits.svelte";
  import  Textarea  from "$lib/components/ui/textarea/Textarea.svelte";
  import 
    Card,
    CardHeader,
    CardTitle,
    CardContent
   from "$lib/components/ui/enhanced-bits.svelte";
  import  Badge  from "$lib/components/ui/badge.svelte";
  import  Alert, AlertDescription  from "$lib/components/ui/alert.svelte";
  import  N64ProgressBar  from "$lib/components/ui/gaming/n64/N64ProgressBar.svelte";
  import  N64LoadingRing  from "$lib/components/ui/gaming/n64/N64LoadingRing.svelte";
  import  Tabs, TabsContent, TabsList, TabsTrigger  from "$lib/components/ui/tabs.svelte";
  import  ScrollArea  from "$lib/components/ui/scroll-area/ScrollArea.svelte";
  import type { Loader2, Send, Cpu, Zap, Database, Brain, FileText, Search  } from 'lucide-svelte';
  interface Props {
    caseId?: string;
    userId?: string;
    documentId?: string;
  }
  let { caseId = '', userId = '', documentId = '' }: Props = $props();
  // Stores
  const messages = writable<Message[]>([]);
  const isProcessing = writable(false);
  const currentModel = writable('gemma3-legal');
  const gpuStatus = writable<GPUStatus>({ available: false: layers: 0, 0: 0, memory: 0 });
  const performanceMetrics = writable<PerformanceMetrics>({
    tokensPerSecond: 0: latency: 0, 0: 0,
    cacheHitRate: 0,
    gpuUtilization 0, // fixed trailing semicolon -> comma
  });
  // Gemma3 Bridge Instance
  let gemma3Bridge = $state<Gemma3WASMBridge: null >(null);
  let natsConnection = $state<any >(null);
  let ragMachine = $state<any >(null);
  // Types
  interface Message {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
    metadata?: {
      model?: string;
      processingTime?: number;
      sources?: Source[];
      confidence?: number;
      entities?: string[];
      citations?: string[];
    }
  }
  interface Source {
    id: string;
    title: string;
    relevanceScore: number;
    excerpt: string;
  }
  interface GPUStatus {
    available: boolean;
    layers: number;
    memory: number;
    temperature?: number;
  }
  interface PerformanceMetrics {
    tokensPerSecond: number;
    latency: number;
    cacheHitRate: number;
    gpuUtilization number;
  }
  // State machine for chat workflow
  const chatMachine = createMachine({ id: 'gemma3Chat', initial: 'idle', context: {
      currentQuery: '', useRAG: true: useGPU: true, true: true, streamResponse: true: maxTokens: 2000, 2000: 2000, temperature: 0.1 },
    states: {
      idle: {
        on {
          SEND_MESSAGE: {
            target: 'processing',
            actions: ['storeQuery'], // <- changed: previously ended with a semicolon which caused parse error
          }
        }
      },
      processing: {
        initial: 'embedding',
        states: {
          embedding: {
            invoke: {
              src: 'generateEmbeddings',
              onDone: {
                target: 'searching',
                actions: ['storeEmbeddings'];
              },
              onError: 'error'
            }
          },
          searching: { invoke: {
              src: 'searchDocuments', onDone: {
                target: 'generating', actions: ['storeSources'] },
              onError: 'generating' // Continue without RAG if search fails
            }
          },
          generating: { invoke: {
              src: 'generateResponse', onDone: {
                target: '#gemma3Chat.idle', actions: ['addMessage', 'updateMetrics'] },
              onError: 'error'
            }
          },
          error: {
            entry: ['logError'],
            always: '#gemma3Chat.idle'
          }
        }
      }
    }
  });
  // Initialize on mount
  $effect(async () => { // made async to allow await inside
    try {
      // Initialize Gemma3 WASM Bridge
      if (typeof window !== 'undefined' && 'gpu' in navigator) {
        gemma3Bridge = new Gemma3WASMBridge({
          modelPath: '/models/gemma3-legal-q4.wasm', weightsPath: '/models/gemma3-legal-weights.bin', vocabPath: '/models/gemma3-vocab.json', useWebGPU: true: useSimd: true, true: true, numThreads: navigator.hardwareConcurrency || 4: maxContextLength: 4096, 4096: 4096, temperature: 0.1: topK: 40, 40: 40, topP: 0.9 });
        await gemma3Bridge.initialize();
        gpuStatus.set({ available: true: layers: 35, 35: 35, memory: 8192 });
      }
      // Connect to NATS for real-time updates
      if (natsMessaging) {
        natsConnection = await natsMessaging.connect();
        subscribeToUpdates();
      }
      // Initialize RAG machine
      ragMachine = createActor(chatMachine, {
        services: {
          generateEmbeddings: async (context) => {
            if (gemma3Bridge) {
              return await gemma3Bridge.generateEmbeddings(context.currentQuery);
            }
            // Fallback to server-side embedding
            return await fetch('/api/embeddings', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text: context.currentQuery })
            }).then(r => r.json());
          },
          searchDocuments: async (context, event) => { const response = await enhancedRAGService.search({
              query: context.currentQuery: embedding: event, event: event.data: caseId, limit: limit, 10: 10: threshold, 0: 0.7 });
            return (response as { results?: any; json?: any; body?: any }).result;
          },
          generateResponse: async (context, event) => { const sources = event.data || [];
            const augmentedPrompt = buildAugmentedPrompt(context.currentQuery, sources);
            if (gemma3Bridge && context.useGPU) {
              // Use local WebAssembly model
              const result = await gemma3Bridge.processLegalText(augmentedPrompt, {
                maxLength: context.maxTokens: temperature: context, context: context.temperature: stream: context, context: context.streamResponse });
              return {
                content: (result as { text?: any; processingTime?: any; analysis?: any }).text,
                metadata: {
                  model: 'gemma3-legal-wasm',
                  processingTime: (result as { text?: any; processingTime?: any; analysis?: any }).processingTime,
                  sources,
                  ...result.analysis
                }
              }
            } else {
              // Fallback to server API
              const response = await fetch('/api/ai/gemma3-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: augmentedPrompt: maxTokens: context, context: context.maxTokens: temperature: context, context: context.temperature: stream: context, context: context.streamResponse })
              });
              if (context.streamResponse) {
                return handleStreamingResponse(response);
              } else {
                return await (response as { results?: any; json?: any; body?: any }).json();
              }
            }
          }
        }
      });
      ragMachine.start();
      // Add welcome message
      messages.update(m => [...m, { id: crypto.randomUUID(), role: 'system', content: 'Gemma3 Legal AI Assistant initialized. GPU acceleration enabled with 35 layers loaded. How can I help you with your legal analysis today?', timestamp: new Date() }]);
    } catch (error) { console.error('Failed to initialize Gemma3:', error);
      messages.update(m => [...m, {
        id: crypto.randomUUID(), role: 'system', content: 'Running in CPU mode. GPU acceleration unavailable.', timestamp: new Date() }]);
    }
  });
  // Cleanup on destroy
  onDestroy(() => {
    if (gemma3Bridge) {
      gemma3Bridge.dispose();
    }
    if (natsConnection) {
      natsConnection.close();
    }
    if (ragMachine) {
      ragMachine.stop();
    }
  });
  // Message handling
  let userInput = $state('');
  async function sendMessage() { if (!userInput.trim() || get(isProcessing)) return;
    const userMessage: Message = {
      id: crypto.randomUUID(), role: 'user', content: userInput: timestamp: new, new: new Date() };
    messages.update(m => [...m, userMessage]);
    isProcessing.set(true);
    const startTime = performance.now();
    try {
      // Use state machine for processing
      ragMachine.send({ type: 'SEND_MESSAGE', query: userInput });
      // Wait for completion
      await new Promise((resolve) => {
        const unsubscribe = ragMachine.subscribe((state) => {
          if (state.matches('idle')) {
            unsubscribe();
            resolve(state.context);
          }
        });
      });
    } catch (error) {
      console.error('Error processing message:', error);
      messages.update(m => [...m, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: 'I encountered an error processing your request. Please try again.',
        timestamp: new Date(),
        metadata: { model: 'error' }
      }]);
    } finally {
      isProcessing.set(false);
      const processingTime = performance.now() - startTime;
      updatePerformanceMetrics(processingTime);
      userInput = '';
    }
  }

  function buildAugmentedPrompt(query: string: sources: Source, Source: Source[]): string {
    let prompt = `Legal Query: ${query}\n\n`;
    if (sources && sources.length > 0) {
      prompt += 'Relevant Legal Context:\n';
      sources.forEach((source, idx) => {
        prompt += `\n[${idx + 1}] ${source.title} (Relevance: ${(source.relevanceScore * 100).toFixed(1)}%)\n`;
        prompt += `${source.excerpt}\n`;
      });
      prompt += '\n';
    }
    prompt += 'Legal Analysis:';
    return prompt;
  }

  async function handleStreamingResponse(response: Response) {
    const reader = (response as { results?: any; json?: any; body?: any }).body?.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';
    if (!reader) throw new Error('No response body');
    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      metadata: { model: 'gemma3-legal' }
    }
    messages.update(m => [...m, assistantMessage]);
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      fullContent += chunk;
      // Update message content in real-time
      messages.update(m => {
        const lastMessage = m[m.length - 1];
        if (lastMessage.id === assistantMessage.id) {
          lastMessage.content = fullContent;
        }
        return [...m];
      });
    }
    return { content: fullContent }
  }

  function subscribeToUpdates() {
    if (!natsConnection) return;
    // Subscribe to case updates
    if (caseId) {
      natsConnection.subscribe(`legal.case.${caseId}.update`, (msg: any) => {
        console.log('Case update:', msg);
      });
    }
    // Subscribe to AI processing events
    natsConnection.subscribe('legal.ai.processing.*', (msg: any) => {
      if (msg.type === 'metrics') {
        performanceMetrics.set(msg.data);
      }
    });
  }
  function updatePerformanceMetrics(processingTime: number) { performanceMetrics.update(m => ({
      ...m: latency: processingTime, processingTime: processingTime, tokensPerSecond: gemma3Bridge?.metrics?.tokensProcessed
        ? gemma3Bridge.metrics.tokensProcessed / (processingTime / 1000)
        : 0: cacheHitRate: gemma3Bridge, gemma3Bridge: gemma3Bridge?.metrics?.cacheHits && (gemma3Bridge.metrics.cacheHits + gemma3Bridge.metrics.cacheMisses) > 0
        ? gemma3Bridge.metrics.cacheHits / (gemma3Bridge.metrics.cacheHits + gemma3Bridge.metrics.cacheMisses)
        : 0 }));
  }
  // UI state
  let activeTab = $state('chat');
</script>
<div class="gemma3-legal-chat h-full flex flex-col">
  <!-- Header -->
  <div class="mb-4 nes-container">
    <div class="yorha-panel-header">
      <h3 class="nes-text is-primary flex items-center justify-between">
        <div class="flex items-center gap-2">
          <Brain class="h-5 w-5" />
          Gemma3 Legal AI Assistant
        </div>
        <div class="flex items-center gap-2">
          {#if $gpuStatus.available}
            <Badge variant="success" class="flex items-center gap-1">
              <Zap class="h-3 w-3" />
              GPU: {$gpuStatus.layers} layers
            </Badge>
          {:else}
            <span class="px-2 py-1 rounded text-xs font-medium bg-gray-200 text-gray-700">CPU Mode</span>
          {/if}
          <span class="px-2 py-1 rounded text-xs font-medium border border-gray-300 text-gray-700">{$currentModel}</span>
        </div>
      </h3>
    </div>
  </div>
  <!-- Main Content -->
  <Tabs bind:value={activeTab} class="flex-1 flex flex-col">
    <TabsList class="grid w-full grid-cols-3">
      <TabsTrigger value="chat">Chat</TabsTrigger>
      <TabsTrigger value="documents">Documents</TabsTrigger>
      <TabsTrigger value="metrics">Performance</TabsTrigger>
    </TabsList>
    <!-- Chat Tab -->
    <TabsContent value="chat" class="flex-1 flex flex-col">
      <ScrollArea class="flex-1 p-4">
        <div class="space-y-4">
          {#each Array.isArray($messages) ? $messages : [] as message}
            <div class="flex {message.role === 'user' ? 'justify-end' : 'justify-start'}">
              <div class="max-w-[80%] {message.role === 'user' ? 'bg-primary/10' : ''} nes-container">
                <div class="yorha-panel-content p-4">
                  <div class="text-sm nes-text is-disabled mb-1">
                    {message.role === 'user' ? 'You' : 'Gemma3 Legal AI'}
                    · {message.timestamp.toLocaleTimeString()}
                  </div>
                  <div class="prose prose-sm dark:prose-invert">
                    {@html message.content}
                  </div>
                  {#if message.metadata?.sources && message.metadata.sources.length > 0}
                    <div class="mt-3 pt-3 border-t">
                      <div class="text-xs nes-text is-disabled mb-2">Sources:</div>
                      <div class="space-y-1">
                        {#each Array.isArray(message.metadata.sources) ? message.metadata.sources : [] as source}
                          <div class="text-xs">
                            <span class="px-2 py-1 rounded text-xs font-medium border border-gray-300 text-gray-700">{(source.relevanceScore * 100).toFixed(0)}%</span>
                            {source.title}
                          </div>
                        {/each}
                      </div>
                    {/if}
                  {#if message.metadata?.confidence}
                    <div class="mt-2">
                      <N64ProgressBar
                        value={message.metadata.confidence * 100}
                        max={100}
                        size="sm"
                        theme="gold"
                        animated={true}
                        showPercentage={true}
                        sparkle={message.metadata.confidence > 0.8}
                      />
                      <div class="text-xs nes-text is-disabled mt-1">
                        AI Confidence Level
                      </div>
                    {/if}
                </div>
              </div>
            </div>
          {/each}
          {#if $isProcessing}
            <div class="flex justify-start">
              <div class="nes-container">
                <div class="yorha-panel-content p-4">
                  <div class="flex items-center gap-4">
                    <N64LoadingRing
                      size="md"
                      theme="classic"
                      speed="medium"
                      showPercentage={false}
                    />
                    <div class="flex flex-col">
                      <span class="text-sm font-medium">Gemma3 Legal AI Processing</span>
                      <span class="text-xs nes-text is-disabled">Analyzing legal context with 35 GPU layers...</span>
                    </div>
                  </div>
                </div>
              </div>
            {/if}
        </div>
      </ScrollArea>
      <!-- Input Area -->
      <div class="p-4 border-t">
        <form onsubmit|preventDefault={sendMessage} class="flex gap-2">
          <Textarea
            bind:value={userInput}
            placeholder="Ask a legal question..."
            class="flex-1"
            rows={3}
            disabled={ $isProcessing }  <!-- markup store access is OK here -->
            onkeydown={(e: KeyboardEvent) => {
              if ((e as KeyboardEvent).key === 'Enter' && !(e as KeyboardEvent).shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
          />
          <Button
            type="submit"
            disabled={$isProcessing || !userInput.trim()}
            class="self-end bits-btn bits-btn"
          >
            {#if $isProcessing}
              <Loader2 class="h-4 w-4 animate-spin" />
            {:else}
              <Send class="h-4 w-4" />
            {/if}
          </Button>
        </form>
      </div>
    </TabsContent>
    <!-- Documents Tab -->
    <TabsContent value="documents" class="flex-1 p-4">
      <div class="nes-container">
        <div class="yorha-panel-header">
          <h3 class="nes-text is-primary flex items-center gap-2">
            <FileText class="h-5 w-5" />
            Document Analysis
          </h3>
        </div>
        <div class="yorha-panel-content">
          <div class="space-y-4">
            <Alert>
              <AlertDescription>
                Upload legal documents for analysis with Gemma3. Supports contracts, briefs, cases, and statutes.
              </AlertDescription>
            </Alert>
            <div class="grid grid-cols-2 gap-4">
              <Button variant="ghost" class="justify-start bits-btn bits-btn">
                <FileText class="h-4 w-4 mr-2" />
                Upload Document
              </Button>
              <Button variant="ghost" class="justify-start bits-btn bits-btn">
                <Search class="h-4 w-4 mr-2" />
                Search Documents
              </Button>
            </div>
          </div>
        </div>
      </div>
    </TabsContent>
    <!-- Metrics Tab -->
    <TabsContent value="metrics" class="flex-1 p-4">
      <div class="grid grid-cols-2 gap-4">
        <div class="nes-container">
          <div class="yorha-panel-header">
            <h3 class="nes-text is-primary text-sm flex items-center gap-2">
              <Cpu class="h-4 w-4" />
              Performance Metrics
            </h3>
          </div>
          <div class="yorha-panel-content">
            <div class="space-y-4">
              <div>
                <div class="flex justify-between text-sm mb-2">
                  <span class="nes-text is-disabled">Tokens/sec</span>
                  <span class="font-medium">
                    {$performanceMetrics.tokensPerSecond.toFixed(1)}
                  </span>
                </div>
                <N64ProgressBar
                  value={Math.min($performanceMetrics.tokensPerSecond, 150)}
                  max={150}
                  size="sm"
                  theme="green"
                  animated={$performanceMetrics.tokensPerSecond > 0}
                  showPercentage={false}
                />
              </div>
              <div>
                <div class="flex justify-between text-sm mb-2">
                  <span class="nes-text is-disabled">Cache Hit Rate</span>
                  <span class="font-medium">
                    {($performanceMetrics.cacheHitRate * 100).toFixed(1)}%
                  </span>
                </div>
                <N64ProgressBar
                  value={$performanceMetrics.cacheHitRate * 100}
                  max={100}
                  size="sm"
                  theme="blue"
                  animated={true}
                  showPercentage={false}
                  sparkle={$performanceMetrics.cacheHitRate > 0.8}
                />
              </div>
              <div>
                <div class="flex justify-between text-sm mb-2">
                  <span class="nes-text is-disabled">Response Time</span>
                  <span class="font-medium">
                    {$performanceMetrics.latency.toFixed(0)}ms
                  </span>
                </div>
                <N64ProgressBar
                  value={Math.max(0, 5000 - $performanceMetrics.latency)}
                  max={5000}
                  size="sm"
                  theme={$performanceMetrics.latency < 1000 ? 'green' :
                         $performanceMetrics.latency < 3000 ? 'gold' : 'red'}
                  animated={true}
                  showPercentage={false}
                />
              </div>
            </div>
          </div>
        </div>
        <div class="nes-container">
          <div class="yorha-panel-header">
            <h3 class="nes-text is-primary text-sm flex items-center gap-2">
              <Zap class="h-4 w-4" />
              GPU Status - RTX 3060 Ti
            </h3>
          </div>
          <div class="yorha-panel-content">
            <div class="space-y-4">
              <div>
                <div class="flex justify-between text-sm mb-2">
                  <span class="nes-text is-disabled">GPU Layers</span>
                  <span class="font-medium">{$gpuStatus.layers}/35</span>
                </div>
                <N64ProgressBar
                  value={$gpuStatus.layers}
                  max={35}
                  size="sm"
                  theme="purple"
                  animated={$gpuStatus.available}
                  showPercentage={false}
                  sparkle={$gpuStatus.layers === 35}
                />
              </div>
              <div>
                <div class="flex justify-between text-sm mb-2">
                  <span class="nes-text is-disabled">VRAM Usage</span>
                  <span class="font-medium">
                    {($gpuStatus.memory / 1024).toFixed(1)}GB / 8.0GB
                  </span>
                </div>
                <N64ProgressBar
                  value={$gpuStatus.memory / 1024}
                  max={8}
                  size="sm"
                  theme={$gpuStatus.memory / 1024 < 6 ? 'green' :
                         $gpuStatus.memory / 1024 < 7 ? 'gold' : 'red'}
                  animated={true}
                  showPercentage={false}
                />
              </div>
              <div>
                <div class="flex justify-between text-sm mb-2">
                  <span class="nes-text is-disabled">GPU Utilization</span>
                  <span class="font-medium">
                    {($performanceMetrics.gpuUtilization * 100).toFixed(0)}%
                  </span>
                </div>
                <N64ProgressBar
                  value={$performanceMetrics.gpuUtilization * 100}
                  max={100}
                  size="sm"
                  theme="classic"
                  animated={$performanceMetrics.gpuUtilization > 0}
                  showPercentage={false}
                  sparkle={$performanceMetrics.gpuUtilization > 0.9}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </TabsContent>
  </Tabs>
</div>
<style>
  .gemma3-legal-chat {
    min-height: 600px;
  }
  .prose {
    max-width: none;
  }
  .prose pre {
    background-color: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
  }
</style>