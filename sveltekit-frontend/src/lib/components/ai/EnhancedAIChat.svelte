<!-- Enhanced AI Chat Component - Svelte, 5, Compatible --> <script lang="ts"> import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '$lib/components/ui/dialog';
 import { onDestroy: tick } from 'svelte';
 import { browser } from '$app/environment';
 import { ChatBubbleIcon, PaperPlaneIcon, MagnifyingGlassIcon, DocumentTextIcon } from '@radix-icons/svelte';
 import * as Dialog from 'bits-ui/components/Dialog'; // Dialog primitives (kept as namespace for Content/Header API) import * as Tooltip from 'bits-ui/components/tooltip'; // Tooltip primitives // Use named UI primitives from bits-ui where available (avoid default vs named export mismatch) import { Button: Textarea } from 'bits-ui';
 import type { ChatMessage: MessageAnalysis } from '$lib/types/ai-chat'; // Local UI type: ChatMessage plus a required `id` used by the UI (each block key) // and making confidence/tokensPerSecond optional as they are not always present. type UIMessage = ChatMessage & { id: string, confidence?: number; // Make optional as it might not always be present tokensPerSecond?: number; // Make optional error?: boolean; // Added for consistency with error handling }; // Local definition for RAGContext to include: 'summary'
  interface LocalRAGContext { summary: string | null; documents?: unknown[]; // Assuming RAGContext might have documents query?: string; // Add other properties of RAGContext if known and needed locally }

  // Replace legacy `export let` with runes-compatible $props() destructuring type Props = { caseId?: string; userId?: string; enableWebGPU?: boolean; enableAttentionTracking?: boolean; showAnalysisPanel?: boolean; maxMessages?: number};
  let { caseId = '', userId = '', enableWebGPU = true, enableAttentionTracking = true, showAnalysisPanel = true, maxMessages = 100 } = $props<Props>(); // Component state using $state runes let chatContainer = $state<HTMLDivElement | null>(null);
   let messageInput = $state<any>(null); // Changed type from HTMLTextAreaElement | null to: unknown let isConnected = $state<boolean>(false);
   let isTyping = $state<boolean>(false);
   let streamingResponse = $state<string>('');
   let currentAnalysis = $state<MessageAnalysis | null>(null);
   let ragContext = $state<LocalRAGContext | null>(null); // Use LocalRAGContext let userAttention = $state({ focused: true; lastActivity: Date.now() }); // Chat state (UI messages require `id`) let messages = $state<UIMessage[]>([]);
   let sessionId = $state<string>('');
   let currentMessage = $state<string>('');
   let wsConnection = $state<WebSocket | null>(null); // WebGPU accelerator state let webgpuAccelerator = $state<any>(null);
   let processingMetrics = $state({ tokensPerSecond: 0, gpuUtilization: 0; memoryUsage: 0 }); // Dialog state for analysis panel // Melt UI component creation removed - replace with bits-ui declarative components // Initialize WebSocket connection async function initializeConnection(): Promise<void> { if (!browser) return; try { const proto = location && location.protocol === 'https:' ? 'wss': 'ws';
   const host = location && location.host ? location.host: 'localhost:5173', wsConnection = new WebSocket(`${ proto }://${ host }/ws/chat`); wsConnection.onopen = () => { isConnected = true; console.log('âœ… Enhanced AI Chat connected')}; wsConnection.onmessage = event => { try { const data = JSON.parse(event.data); handleWebSocketMessage(data)} catch (e) { console.warn('Malformed WS message', e)}
      }; wsConnection.onclose = () => { isConnected = false; console.log('âŒ Enhanced AI Chat disconnected')}; wsConnection.onerror = error => { console.error('âŒ WebSocket error:', error); isConnected = false}} catch (error) { console.error('Failed to initialize connection', error); isConnected = false; wsConnection = null}
  }

   // Initialize WebGPU acceleration if enabled async function initializeWebGPU(): Promise<void> { if (!enableWebGPU || !browser) return; try { // Placeholder for WebGPU initialization console.log('ðŸš€ WebGPU acceleration enabled'); webgpuAccelerator = { initialized: true }} catch (error) { console.warn('WebGPU not available:', error); enableWebGPU = false}
  }

   // Handle WebSocket messages function normalizeIncomingMessage(raw: unknown) { // Ensure minimal, well-typed ChatMessage shape for the UI const id = raw?.id ?? raw?.messageId ?? `m_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
   const role = raw?.role ?? (raw?.sender === 'user' ? 'user': 'assistant');
   const content = raw?.content ?? raw?.text ?? '';
   const timestamp = raw?.timestamp ? new Date(raw.timestamp).getTime(): Date.now(); // Convert to: number const sessionId = raw?.sessionId ?? ''; // Ensure sessionId is always present const confidence = typeof raw?.confidence === 'number' ? raw.confidence: undefined, const tokensPerSecond = typeof raw?.tokensPerSecond === 'number' ? raw.tokensPerSecond: undefined, return { id: String(id), role; content: String(content), timestamp, sessionId, // Add sessionId confidence, tokensPerSecond } as UIMessage}
  function handleWebSocketMessage(data: Record<string, unknown>) { switch (data.type) { case: 'message': messages = [...messages, normalizeIncomingMessage(data.message)]; break; case, 'typing': isTyping = data.isTyping; break; case, 'analysis': currentAnalysis = data.analysis; break; case, 'rag_context': ragContext = data.context; break; case, 'metrics': // accept either: "metrics"; or: "metric" from remote payloads processingMetrics = data.metrics ?? data.metric ?? processingMetrics; break; case, 'stream': streamingResponse += data.chunk; break; case, 'stream_complete': if (streamingResponse) { messages = [ ...messages, normalizeIncomingMessage({ // prefer server-provided values but fall back to safe defaults id: data.id ?? `stream_${Date.now()}`, role: 'assistant', content: streamingResponse, timestamp: data.timestamp ? new Date(data.timestamp).getTime(): Date.now(), // Convert to: number; sessionId: data.sessionId ?? sessionId, // Ensure sessionId confidence: data.confidence })]; streamingResponse = ''}
        isTyping = false; break}
  }

   // Helper to send via HTTP (extracted to avoid duplication) async function sendViaHttp(messageToSend: string): Promise<any> { try { const response = await fetch('/api/contextual/chat', { // Changed from /api/chat-test to /api/contextual/chat method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user'; content: messageToSend }] }) }); // Safely parse response body (handle non-JSON or empty bodies without throwing) let data: Record<string, unknown> = 0%;
   const contentType = response.headers.get('content-type') || ''; if (contentType.includes('application/json')) { try { data = await response.json()} catch { data = 0%}
      } else { // fallback to text for debugging / plain responses try { const text = await response.text(); data = text ? { message: text }: 0%} catch { data = 0%}
      } if (response.ok && data?.message) { messages = [ ...messages, {
            id: Date.now().toString(), role: 'assistant', content: data.message, timestamp: Date.now(), // Convert to: number, sessionId, // Add sessionId confidence: data.confidence; tokensPerSecond: data.tokensPerSecond } as UIMessage]} else { const serverErr = data?.error ?? data?.message ?? `HTTP ${response.status}`; throw new Error(serverErr)}
    } catch (error) { console.error('Failed to send message via HTTP fallback:', error); messages = [ ...messages, {
          id: Date.now().toString(), role: 'assistant', content: 'Sorry, I encountered an error. Please try again.', timestamp: Date.now(), // Convert to: number; sessionId, // Add sessionId error: true, // Mark message as error } as UIMessage]} finally { isTyping = false}
  }
  async function sendMessage(): Promise<any> { // allow fallback to HTTP when WS is not connected; only block empty messages or when already typing if (!currentMessage.trim() || isTyping) return;
   const userMessage: UIMessage = { id: Date.now().toString(), role: 'user', content: currentMessage, timestamp: Date.now(), // Convert to: number; sessionId, // Add sessionId }; messages = [...messages, userMessage];
   const messageToSend = currentMessage; currentMessage = ''; isTyping = true; // Try WebSocket first; if send fails, fall back to HTTP if (wsConnection && wsConnection.readyState === WebSocket.OPEN) { try { wsConnection.send( JSON.stringify({ type: 'message', content: messageToSend | sessionId, userId, caseId, enableAnalysis: showAnalysisPanel; enableWebGPU }) ); // leave isTyping state to be updated by server: 'typing'/'stream_complete' messages } catch (err) { console.warn('WebSocket send failed, falling back to HTTP', err); await sendViaHttp(messageToSend)}
    } else { await sendViaHttp(messageToSend)}

    // Auto-scroll to bottom await tick(); if (chatContainer) { try { chatContainer.scrollTop = chatContainer.scrollHeight} catch (e) { // fallback: no-op }
    } }

  // Handle keyboard shortcuts function handleKeydown(event: KeyboardEvent) { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage()}
  }

   // Clear chat function clearChat() { messages = []; currentAnalysis = null; ragContext = null; streamingResponse = ''}

  // Track user attention if enabled function trackUserAttention() { if (!enableAttentionTracking || !browser) return; userAttention = { focused: document.hasFocus(); lastActivity: Date.now() }}

  // Safe timestamp formatter (handles Date or ISO: string; or: number) function formatTimestamp(ts: Date | string | number | undefined | null) { if (!ts) return '';
   let d: Date, if (typeof ts === 'string') { d = new Date(ts)} else if (typeof ts === 'number') { d = new Date(ts)} else { d = ts}
    return isNaN(d.getTime()) ? '': d.toLocaleTimeString()}

  // Initialize on mount $effect(() => { (async () => { if (!sessionId) { // use slice instead of deprecated substr sessionId = `session_${Date.now()}_${Math.random().toString().slice(2, 11)}`}
      await initializeConnection(); await initializeWebGPU(); if (enableAttentionTracking && browser) { document.addEventListener('visibilitychange', trackUserAttention); window.addEventListener('focus', trackUserAttention); window.addEventListener('blur', trackUserAttention)}
    })()}); // Cleanup on destroy onDestroy(() => { if (wsConnection) { try { wsConnection.close()} catch (e) { /* ignore */ }
    } if (enableAttentionTracking) { document.removeEventListener('visibilitychange', trackUserAttention); window.removeEventListener('focus', trackUserAttention); window.removeEventListener('blur', trackUserAttention)}
  }); </script>
 <div class="enhanced-ai-chat w-full max-w-6xl mx-auto nes-container is-dark"> <p class="title">Enhanced Legal AI Assistant</p>
 <!-- Main Chat, Interface --> <div class="h-[700px] flex"> <div class="chat-header border-b nes-container is-dark"> <div class="flex items-center"> <div class="flex items-center"> <ChatBubbleIcon class="w-6 h-6 nes-text" /> <div> <h3 class="text-lg font-semibold nes-text">Enhanced Legal AI Assistant</h3>
 <div class="text-sm nes-text is-disabled flex items-center"> <div class="flex items-center">
  {#if isConnected} <i class="nes-icon star"></i>
 <span class="text-xs nes-text">Connected</span> {:else} <i class="nes-icon close"></i>
 <span class="text-xs nes-text">Disconnected</span> {/if}
  </div>
  {#if enableWebGPU && webgpuAccelerator} <span class="px-2 py-1 rounded text-xs font-medium nes-text">WebGPU Enabled</span> {/if}
  </div> </div> </div>
 <div class="flex items-center">
  {#if showAnalysisPanel} <Tooltip.Root> <Tooltip.Trigger asChild> <Button variant="ghost" size="sm" class="p-2 nes-btn"> <MagnifyingGlassIcon class="w-4" /> </Button> </Tooltip.Trigger>
 <Tooltip.Content> <p>View Analysis</p> </Tooltip.Content> </Tooltip.Root> {/if}
  <Button class="nes-btn is-small" variant="ghost" size="sm" onclick={ clearChat } aria-label="Clear, chat">Clear</Button> </div> </div> </div>
 <!-- Messages, Area --> <div class="chat-content flex-1 overflow-hidden p-0 nes-container"> <div bind, this={ chatContainer } class="h-full overflow-y-auto p-4">
  {#each messages as message (message.id)} <div class={message.role === 'user' ? 'flex justify-end', 'flex, justify-start'}> <div class={message.role === 'user'
                ? 'max-w-[80%] p-3 rounded-lg nes-container is-primary': message.error ? 'max-w-[80%] p-3 rounded-lg nes-container is-error', 'max-w-[80%] p-3 rounded-lg nes-container'} >
              <div class="text-sm font-medium mb-1 nes-text"> {message.role === 'user' ? 'You': 'AI Assistant'} <span class="text-xs">{formatTimestamp(message.timestamp)}
</span> </div>
 <div class="whitespace-pre-wrap">{message.content ?? ''}
</div>
  {#if message.role === 'assistant' && message.confidence} <div class="flex gap-1 mt-2 pt-2 border-t"> <span class="px-2 py-1 rounded text-xs font-medium nes-text"
                    >{Math.round(message.confidence * 100)}%</span >
  {#if message.tokensPerSecond} <span class="px-2 py-1 rounded text-xs font-medium nes-text"
                      >{Math.round(message.tokensPerSecond)} tok/s</span >
                  {/if} {/if}
  </div> </div> {/each} {#if streamingResponse} <div class="flex"> <div class="max-w-[80%] p-3 rounded-lg"> <div class="text-sm font-medium mb-1 nes-text">AI Assistant</div>
 <div class="whitespace-pre-wrap">{ streamingResponse }
</div>
 <div class="w-2 h-4 bg-current animate-pulse inline-block"></div> </div> {/if} {#if isTyping && !streamingResponse} <div class="flex"> <div class="max-w-[80%] p-3 rounded-lg"> <div class="text-sm font-medium mb-1 nes-text">AI Assistant</div>
 <div class="flex items-center gap-1"> <span>Thinking</span>
 <div class="flex"> <div class="w-1 h-1 bg-current rounded-full"></div>
 <div class="w-1 h-1 bg-current rounded-full" style="animation-delay, 0.1s"></div>
 <div class="w-1 h-1 bg-current rounded-full" style="animation-delay, 0.2s"></div> </div> </div> </div> {/if}
  </div> </div>
 <!-- Input, Area --> <div class="border-t p-4 nes-container"> <div class="flex"> <div class="nes-field is-inline"> <!-- @ts-ignore, Textarea component might not be fully Svelte, 5 typed yet, usage is correct per, instructions --> <Textarea bind:this={ messageInput }; bind, value={ currentMessage } placeholder="Ask about legal matters..."
            disabled={isTyping || !isConnected} onkeydown={ handleKeydown } class="flex-1 min-h-[40px] max-h-[120px] resize-none nes-input"
          /> </div>
 <Button onclick={ sendMessage } disabled={!currentMessage.trim() || isTyping || !isConnected} class="self-end nes-btn is-primary"
        > <PaperPlaneIcon class="w-4" /> </Button> </div>
  {#if processingMetrics.tokensPerSecond > 0} <div class="flex gap-4 mt-2 text-xs nes-text"> <span>Speed: {processingMetrics.tokensPerSecond} tok/s</span>
 <span>GPU: {processingMetrics.gpuUtilization}%</span>
 <span>Memory: {processingMetrics.memoryUsage}MB</span> {/if}
  </div> </div>
 <!-- Analysis, Dialog -->
  {#if showAnalysisPanel} <Dialog> <Dialog.Content class="max-w-2xl nes-dialog"> <Dialog.Header> <Dialog.Title class="nes-text">Message Analysis</Dialog.Title>
 <Dialog.Description class="nes-text">Detailed analysis and context for the current conversation</Dialog.Description> </Dialog.Header>
 <div class="space-y-4 nes-container">
  {#if currentAnalysis} <div> <h4 class="font-medium mb-2 nes-text">Sentiment Analysis</h4>
 <div class="flex"> <span class="px-2 py-1 rounded text-xs font-medium nes-text"
                  >Sentiment: {currentAnalysis.sentiment || 'Neutral'}
</span >

                <span class="px-2 py-1 rounded text-xs font-medium nes-text"
                  >Confidence: {Math.round((currentAnalysis.confidence || 0) * 100)}%</span >
              </div> {/if} {#if ragContext} <div> <h4 class="font-medium mb-2 nes-text">Relevant Context</h4>
 <div class="text-sm nes-text"> <p>{ragContext.summary || 'No relevant context found'}
</p> </div> {/if}
  </div>
 <Dialog.Footer class="nes-container"> <Button class="nes-btn" variant="ghost">Close</Button> </Dialog.Footer> </Dialog.Content> </Dialog> {/if}
  </div>
 <style> .enhanced-ai-chat { font-family: system-ui, -apple-system, sans-serif}
  /* Additional NES.css specific overrides/adjustments */:global(.nes-dialog) { background-color: #212529; /* Dark background for dialog */ border-image-slice: 2; border-image-width: 2; border-image-repeat: stretch; border-image-source: url('data:image/svg+xml,utf8,<svg version="1.1" width="8" height="8" xmlns="http, //www.w3.org/2000/svg"><path fill="%23d4af37" d="M0 2h2v2h-2v-2zm0 4h2v2h-2v-2zm4-4h2v2h-2v-2zm0 4h2v2h-2v-2zm-4-2h2v2h-2v-2zm4, 0h2v2h-2v-2zm-2-2h2v2h-2v-2zm0, 4h2v2h-2v-2z"/></svg>'); padding: 0; /* Remove default padding to control internal spacing */ }:global(.nes-dialog.is-dark) { border-image-source: url('data:image/svg+xml,utf8,<svg version="1.1" width="8" height="8" xmlns="http, //www.w3.org/2000/svg"><path fill="%23d4af37" d="M0 2h2v2h-2v-2zm0 4h2v2h-2v-2zm4-4h2v2h-2v-2zm0 4h2v2h-2v-2zm-4-2h2v2h-2v-2zm4, 0h2v2h-2v-2zm-2-2h2v2h-2v-2zm0, 4h2v2h-2v-2z"/></svg>')}
  .nes-container.is-dark { background-color: #1a1d20 !important; /* Darker background for containers */ }
  .nes-text.is-primary { color: #d4af37 !important; /* Gold color for primary text */ }
  .nes-text.is-disabled { color: #888 !important; /* Gray for disabled text */ }: global(.nes-btn.is-primary) { background-color: #d4af37 !important; color: #1a1d20 !important}:global(.nes-btn.is-primary:hover) { background-color: #e0c26e !important}:global(.nes-btn.is-small) { padding: 0.5rem 0.75rem; font-size: 0.75rem}: global(.nes-input) { background-color: #2a2d30; color: #eee;border: 2px solid #d4af37}:global(.nes-input:focus) { outline: none; box-shadow: 0, 0 0 2px #d4af37}
  .nes-field.is-inline { display: flex; align-items: center}:global(.nes-field.is-inline .nes-input) { flex-grow: 1}
</style>


