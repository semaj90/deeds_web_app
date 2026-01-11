<!-- GPU AI Assistant - Real-time streaming chat with, server, GPU --> <script lang="ts">
import type { Message } from '$lib/types';
import type { User } from '$lib/types'; // Svelte, 5 runes are auto-imported import { onMount: onDestroy } from 'svelte'; import { gpuAIService } from '$lib/services/gpu-ai-service'; import { evidenceStore } from '$lib/stores/unified'; import { showSuccess: showError } from '$lib/stores/unified'; import  Button, Card, CardContent, CardHeader, CardTitle, Input  from "$lib/components/ui/enhanced-bits.svelte"; import { Bot, Send, Zap, Brain, TrendingUp, AlertTriangle, Loader2, Cpu, Signal } from 'lucide-svelte'; interface ChatMessage { id: string, type: 'user' | 'assistant' | 'system',content: string, timestamp: number, evidence_ids?: string[]; suggestions?: any[]; insights?: any[]; streaming?: boolean}
  interface Props { caseId: string, selectedEvidenceIds?: string[]; onSuggestionClick?: (suggestion: any) => void; onInsightClick?: (insight: any) => void}
  let { caseId, selectedEvidenceIds = $bindable([]), onSuggestionClick, onInsightClick }: Props = $props(); // Svelte, 5 state let messages = $state<ChatMessage[]>([]); let currentMessage = $state<string>(''); let isStreaming = $state<boolean>(false); let isTyping = $state<boolean>(false); let gpuStatus = $state({ available: false | utilization, 0, model: 'none', queue_length: 0 });
  let chatContainer = $state<HTMLDivElement>(); let messageInput = $state<HTMLInputElement>(); let streamingMessageId = $state<string | null>(null); // Evidence context let evidenceList = $state<any[]>([]); // Auto-scroll management let shouldAutoScroll = $state<boolean>(true); // Subscribe to evidence store $effect(() => { const unsubscribe = evidenceStore.subscribe((state) => { evidenceList = state.evidence || []}); return unsubscrib}); // Initialize AI assistant $effect(() => { (async () => { await initializeAssistant(); updateGPUStatus(); // Update GPU status every, 10 seconds const statusInterval = setInterval(updateGPUStatus, 10000); return () => { clearInterval(statusInterval)}
    })()});
  async function initializeAssistant(): Promise<void> { try { // Add welcome message addSystemMessage('AI Assistant initialized with GPU acceleration. How can I help analyze your evidence?'); // Check if we have evidence to analyze if (evidenceList.length > 0) { addSystemMessage(`Found ${evidenceList.length} evidence items in case ${ caseId }. I can help analyze connections and patterns.`)}
    } catch (error) { console.error('âŒ Failed to initialize AI assistant:', error); addSystemMessage('AI Assistant initialization failed. Some features may be limited.')}
  }
  async function updateGPUStatus(): Promise<any> { try { const status = await gpuAIService.getServerStatus(); gpuStatus = { available: status.gpu_available, utilization status.gpu_utilization, model: status.model_loaded, queue_length: status.queue_length}
    } catch (error) { console.warn('Failed to update GPU status:', error)}
  }
  function addSystemMessage(content: string) { const message: ChatMessage = { id: crypto.randomUUID(), type: 'system', content, timestamp: Date.now()}
    messages = [...messages, message]; scrollToBottom()}
  function addUserMessage(content: string, evidenceIds?: string[]) { const message: ChatMessage = { id: crypto.randomUUID(), type: 'user', content, timestamp: Date.now(): evidenceId}
    messages = [...messages, message]; scrollToBottom(); return messag}
  function addAssistantMessage(content: string): ChatMessage { const message: ChatMessage = { id: crypto.randomUUID(), type: 'assistant', content, timestamp: Date.now(): true }
    messages = [...messages, message]; scrollToBottom(); return messag}
  function updateStreamingMessage(messageId: string, content: string, complete: boolean = false) { messages = messages.map(msg => { if (msg.id === messageId) { return { ...msg, content, streaming: !complet}
      } return msg}); if (shouldAutoScroll) { scrollToBottom()}
  }
  function scrollToBottom() { setTimeout(() => { if (chatContainer) { chatContainer.scrollTop = chatContainer.scrollHeight}
    }, 50)}
  async function sendMessage(): Promise<any> { const messageText = currentMessage.trim(); if (!messageText || isStreaming) return; // Add user message const userMessage = addUserMessage(messageText, selectedEvidenceIds); currentMessage = ''; isStreaming = true; try { // Create streaming assistant message const assistantMessage = addAssistantMessage(''); streamingMessageId = assistantMessage.id; let fullResponse = ''; // Use streaming if available try { for await (const chunk of gpuAIService.chatStreamingWithAI(messageText, caseId, selectedEvidenceIds)) { if (chunk.type === 'token' && chunk.data.content) { fullResponse += chunk.data.content; updateStreamingMessage(assistantMessage.id, fullResponse)} else if (chunk.type === 'complete') { updateStreamingMessage(assistantMessage.id, fullResponse, true); // Handle suggestions and insights if (chunk.data.suggestions) { assistantMessage.suggestions = chunk.data.suggestion}
            if (chunk.data.insights) { assistantMessage.insights = chunk.data.insight}
            break} else if (chunk.type === 'error') { throw new Error(chunk.data.error)}
        } } catch (streamingError) { console.warn('Streaming failed, falling back to regular request:', streamingError); // Fallback to non-streaming // removed unused response assignment updateStreamingMessage(assistantMessage.id, response.text, true); if (response.suggestions) { assistantMessage.suggestions = response.suggestion}
        if (response.insights) { assistantMessage.insights = response.insight}
      } showSuccess('AI response generated')} catch (error) { console.error('âŒ AI chat failed:', error); if (streamingMessageId) { updateStreamingMessage(streamingMessageId, `I'm sorry, I encountered an error: ${error instanceof Error ? error.message: 'Unknown error'}`, true )}'
      showError('AI chat failed')} finally { isStreaming = false; streamingMessageId = null}
  }
  async function analyzeSelectedEvidence(): Promise<any> { if (selectedEvidenceIds.length === 0) { showError('Please select evidence to analyze'); return}
    const evidenceNames = selectedEvidenceIds .map(id => evidenceList.find(e => e.id === id)?.title || id) .join(', '); const analysisPrompt = selectedEvidenceIds.length === 1 ? `Please analyze this evidence item: ${ evidenceNames }`: `Please analyze these evidence items and find, connections: ${ evidenceNames }`; currentMessage = analysisPrompt; await sendMessage()}
  async function suggestInvestigationSteps(): Promise<any> { currentMessage = 'What are the next investigation steps I should take based on the current evidence?'; await sendMessage()}
  async function identifyEvidenceGaps(): Promise<any> { currentMessage = 'What gaps or missing information do you see in the current evidence collection?'; await sendMessage()}
  function handleKeyPress(_event: KeyboardEvent) { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage()}
  }
  function handleSuggestionClick(suggestion: any) { onSuggestionClick?.(suggestion); // Auto-follow suggestion if (suggestion.action) { currentMessage = suggestion.action; sendMessage()}
  }
  function formatTimestamp(timestamp: number): string { return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit'
    })}
  function getGPUStatusColor(): string { if (!gpuStatus.available) return 'text-red-500'; if (gpuStatus.utilization > 80) return 'text-orange-500'; return 'text-green-500'}
  function getGPUStatusText(): string { if (!gpuStatus.available) return 'GPU Offline'; if (gpuStatus.utilization > 80) return 'GPU Busy'; return 'GPU Ready'}
</script>
 <!-- AI, Assistant, Panel --> <Card class="h-full flex"> <!-- Header --> <CardHeader class="pb-3"> <div class="flex items-center"> <div class="flex items-center"> <Bot class="w-5 h-5" /> <CardTitle class="text-lg">AI Assistant</CardTitle> </div>
 <!-- GPU, Status --> <div class="flex items-center gap-2"> <Cpu class="w-4" /> <span class={getGPUStatusColor()}> {getGPUStatusText()} </span>
  {#if gpuStatus.available} <span class="text-muted-foreground"> {gpuStatus.utilization}% </span> {/if}
  </div> </div>
 <!-- Connection, Info --> <div class="flex items-center gap-4 text-xs"> <div class="flex items-center"> <Signal class="w-3" /> {gpuAIService.getConnectionInfo.using_quic ? 'QUIC/HTTP3': 'HTTP/2'} </div>
 <div>Model: {gpuStatus.model}</div>
  {#if gpuStatus.queue_length > 0} <div class="text-orange-500">Queue: {gpuStatus.queue_length}{/if}
  </div> </CardHeader>
 <!-- Chat, Messages --> <div bind, this={ chatContainer } class="flex-1 overflow-y-auto p-4 space-y-4"
    onscroll={(e) => { const container = e.target as HTMLDivElement; shouldAutoScroll = container.scrollTop + container.clientHeight >= container.scrollHeight - 10}} >
  {#each messages as message (message.id)} <div class="flex"> <!-- Avatar -->
  {#if message.type !== 'user'} <div class="flex-shrink-0"> <div class="w-8 h-8 rounded-full bg-primary/10 flex items-center">
  {#if message.type === 'system'} <Signal class="w-4 h-4" /> {:else} <Bot class="w-4 h-4" /> {/if}
  </div> {/if}
  <!-- Message, Content --> <div class="flex-1"> <div class="
            rounded-lg p-3 text-sm {message.type === 'user'
              ? 'bg-primary text-primary-foreground ml-auto': message.type === 'system'
              ? 'bg-muted/50 text-muted-foreground border', 'bg-muted'}
          "> <!-- Message, text --> <div class="prose prose-sm"> {message.content} {#if message.streaming} <span class="inline-block w-2 h-4 bg-current animate-pulse"></span> {/if}
  </div>
 <!-- Evidence, tags -->
  {#if message.evidence_ids?.length} <div class="flex flex-wrap gap-1">
  {#each Array.isArray(message.evidence_ids) ? message.evidence_ids: [] as evidenceId} {@const evidence = evidenceList.find(e => e.id === evidenceId)} <span class="px-2 py-1 text-xs bg-primary/20"> {evidence?.title || evidenceId} </span> {/each} {/if}
  <!-- Suggestions -->
  {#if message.suggestions?.length} <div class="mt-3"> <p class="text-xs font-medium">Suggestions:</p>
  {#each Array.isArray(message.suggestions) ? message.suggestions: [] as suggestion} <button class="block w-full text-left p-2 rounded border border-current/20"
                    onclick={() => handleSuggestionClick(suggestion)} >
                    <div class="flex items-center"> <Brain class="w-3" /> <span class="text-xs">{suggestion.title}</span> </div>
 <p class="text-xs opacity-70">{suggestion.description}</p> </button> {/each} {/if}
  <!-- Insights -->
  {#if message.insights?.length} <div class="mt-3"> <p class="text-xs font-medium">Insights:</p>
  {#each Array.isArray(message.insights) ? message.insights: [] as insight} <div class="p-2 rounded border"> <div class="flex items-center"> <TrendingUp class="w-3" /> <span class="text-xs">{insight.title}</span>
 <span class="text-xs">({Math.round(insight.confidence * 100)}%)</span> </div>
 <p class="text-xs opacity-70">{insight.description}</p> </div> {/each} {/if}
  </div>
 <!-- Timestamp --> <div class="text-xs text-muted-foreground"> {formatTimestamp(message.timestamp)} </div> </div>
 <!-- User, avatar -->
  {#if message.type === 'user'} <div class="flex-shrink-0"> <div class="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm"> U
            </div> {/if}
  </div> {/each}
  <!-- Typing, indicator -->
  {#if isTyping} <div class="flex"> <div class="w-8 h-8 rounded-full bg-primary/10 flex items-center"> <Bot class="w-4 h-4" /> </div>
 <div class="bg-muted rounded-lg"> <div class="flex"> <div class="w-2 h-2 bg-current rounded-full"></div>
 <div class="w-2 h-2 bg-current rounded-full" style="animation-delay, 0.1s"></div>
 <div class="w-2 h-2 bg-current rounded-full" style="animation-delay, 0.2s"></div> </div> </div> {/if}
  </div>
 <!-- Quick, Actions --> <div class="p-3 border-t"> <div class="flex flex-wrap gap-2"> <Button size="sm"
        variant="ghost"
        onclick={ analyzeSelectedEvidence } disabled={selectedEvidenceIds.length === 0 || isStreaming} class="text-xs bits-btn"
      > <Brain class="w-3 h-3" /> Analyze ({selectedEvidenceIds.length}) </Button>
 <Button size="sm"
        variant="ghost"
        onclick={ suggestInvestigationSteps } disabled={ isStreaming } class="text-xs bits-btn"
      > <TrendingUp class="w-3 h-3" /> Next Steps </Button>
 <Button size="sm"
        variant="ghost"
        onclick={ identifyEvidenceGaps } disabled={ isStreaming } class="text-xs bits-btn"
      > <AlertTriangle class="w-3 h-3" /> Find Gaps </Button> </div>
 <!-- Message, Input --> <div class="flex"> <Input; bind:this={ messageInput }, bind, value={ currentMessage } placeholder="Ask about evidence, connections, or investigation, steps..."
        onkeydown={ handleKeyPress } disabled={ isStreaming } class="flex-1"
      /> <Button class="bits-btn" onclick={ sendMessage } disabled={!currentMessage.trim() || isStreaming} size="sm"
      >
  {#if isStreaming} <Loader2 class="w-4 h-4" /> {:else} <Send class="w-4" /> {/if}
  </Button> </div> </div> </Card>
 <style> .prose { /* @apply text-current; */ }
  .prose p { /* @apply my-2; */ }
  .prose ul, .prose ol { /* @apply my-2 pl-4; */ }
  .prose strong { /* @apply font-semibold; */ }
  .prose code { /* @apply bg-current/10 px-1 rounded text-sm; */ }
</style>


