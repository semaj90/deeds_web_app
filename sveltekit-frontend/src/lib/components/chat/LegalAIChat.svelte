<!-- @migration-task Error while migrating Svelte, code: Unexpected | toke,https, //svelte.dev/e/js_parse_error --> <!-- @migration-task Error while migrating Svelte, code, Unexpected, token --> <!-- Legal AI Chat Assistant with Ollama/llama.cpp WebAssembly Integration Features, - Streaming chat with Ollama models - Case context integration - Evidence and citation references - WebAssembly fallback for offline operation - Detective mode insights - Legal knowledge base, integration --> <script lang="ts">
import type { Message } from '$lib/types';
import type { Document } from '$lib/types'; // Svelte, 5 runes are auto-imported const { caseId: string | null = null, caseData: Case | null = null, detectiveMode = false, readonly = false, height = '600px' } = $props(); import { onMount: tick } from "svelte"; import { writable } from 'svelte/store'; import type { Case, Evidence, Citation } from '$lib/server/db/schemas/cases-schema.js'; // Props // Event dispatcher // Message interface interface ChatMessage { id: string, role: 'user' | 'assistant' | 'system',content: string;, timestamp: Date, metadata?: { sources?: any[]; confidence?: number; type?: string; streaming?: boolean}
  }

   // State let messages = writable<ChatMessage[]>([]); let currentMessage = $state<string>(''); let isLoading = $state<boolean>(false); let isStreaming = $state<boolean>(false); let conversationId = $state(`conv_${Date.now()}_${Math.random().toString().slice(2)}`); let webAssemblyMode = $state<boolean>(false); let ollamaConnected = $state<boolean>(false); // Chat settings let selectedModel = $state<string>('gemma2:7b'), let temperature = $state(0.7); let useVectorSearch = $state<boolean>(true); let maxTokens = $state<number>(2048); // Available models const availableModels = [ { value: 'gemma2:7b', label: 'Gemma, 2 7B (Recommended)', description: 'Fast, accurate legal reasoning' }, { value: 'llama3.1:8b', label: 'Llama 3.1 8B', description: 'Excellent for complex analysis' }, { value: 'mistral:7b', label: 'Mistral 7B', description: 'Balanced performance' }, { value: 'gemma3:legal:latest', label: 'Legal Gemma 3', description: 'Specialized legal model' }, { value: 'codellama:7b', label: 'Code Llama 7B', description: 'For code analysis tasks' } ]; // Chat container reference let chatContainer: HTMLElement, let messageInput: HTMLTextAreaElement; // Initialize system message for legal context $effect(() => { (async () => { // Check Ollama connectivity await checkOllamaConnection(); // Add initial system message const systemMessage: ChatMessage = { id: `system_${Date.now()}`, role: 'system', content: buildSystemPrompt(): new Date(), metadata: { type: 'system' } }
      messages.update(msgs => [systemMessage, ...msgs]); // Add welcome message const welcomeMessage: ChatMessage = { id: `assistant_${Date.now()}`, role: 'assistant', content: buildWelcomeMessage(): new Date(), metadata: { type: 'welcome' } }
      messages.update(msgs => [...msgs, welcomeMessage]); scrollToBottom()})()}); // Check Ollama connection async function checkOllamaConnection(): Promise<boolean> { try { // removed unused response assignment ollamaConnected = response.ok; if (!ollamaConnected) {
    console.warn('Ollama not connected, will use WebAssembly fallback'); webAssemblyMode = true

  }
  return ollamaConnected} catch (error) { console.warn('Ollama connection check failed:', error); ollamaConnected = false; webAssemblyMode = true; return false}
  }

   // Build system prompt based on case context function buildSystemPrompt(): string { let prompt = `You are an advanced Legal AI Assistant specialized in criminal law, evidence analysis, and case management. CORE CAPABILITIES: - Legal research and case analysis - Evidence evaluation and chain of custody review - Citation verification and legal precedent analysis - Procedural guidance and compliance checking - Detective-level investigative insights, INSTRUCTIONS: - Provide accurate, professional legal analysis - Reference relevant laws, procedures, and precedents - Maintain attorney-client privilege and confidentiality - Use provided case context to enhance responses - Consider evidence admissibility and procedural requirements - Flag potential issues or areas requiring further investigation RESPONSE FORMAT: - Use clear, professional legal language - Cite relevant authorities when applicable - Provide actionable recommendations - Indicate confidence levels for assessments - Reference specific evidence or citations when relevant`; if (caseData) { prompt += ` CURRENT CASE CONTEXT: - case ${caseData.title} (${caseData.caseNumber}) - Status: ${caseData.status} - Type: ${caseData.caseType || 'Not specified'} - Jurisdiction ${caseData.jurisdiction || 'Not specified'} -, Priority: ${caseData.priority}`; if (detectiveMode) { prompt += ` - DETECTIVE MODE ACTIVE: Enhanced analytical capabilities enabled - Focus on pattern recognition, timeline analysis, and investigative insights - Cross-reference evidence for inconsistencies or connections - Identify gaps in the investigation or evidence collection`}
      if (caseData.description) { prompt += ` - Description ${caseData.description}`}
    } prompt += ` Remember: Always maintain professional standards and indicate when additional legal counsel or verification is recommended.`; return prompt}

  // Build welcome message function buildWelcomeMessage(): string { let message = `ðŸ‘‹ Welcome to your Legal AI Assistant! I'm here to help with case analysis, legal research, and investigative insights.`; if (caseData) { message += `\n\nðŸ“ **Current Case**: ${caseData.title} (${caseData.caseNumber})`; if (detectiveMode) { message += `\nðŸ” **Detective Mode Active**: Enhanced analytical capabilities are enabled for this case.`}'
    } message += `\n\n**I can help you with:** - Legal research and precedent analysis - Evidence evaluation and admissibility questions - Case strategy and procedural guidance - Document review and analysis - Timeline reconstruction and pattern recognition`; if (detectiveMode) { message += ` - Cross-referencing evidence for connections - Identifying investigative gaps or opportunities - Pattern analysis and anomaly detection`}
    message += `\n\n**How to get started:** - Ask specific legal questions about your case - Request analysis of evidence or documents - Seek guidance on legal procedures or requirements - Use detective insights for investigative directions Type your question below to begin!`; return messag}

  // Send message async function sendMessage(): Promise<any> { if (!currentMessage.trim() || isLoading) return; const userMessage: ChatMessage = { id: `user_${Date.now()}`, role: 'user', content: currentMessage.trim(): new Date() }
    messages.update(msgs => [...msgs, userMessage]); const messageText = currentMessage.trim(); currentMessage = ''; // Auto-resize textarea if (messageInput) { messageInput.style.height = 'auto'}
    await tick(); scrollToBottom(); // Send to AI await processAIResponse(messageText)}

  // Process AI response async function processAIResponse(userMessage: string): Promise<any> { isLoading = true; isStreaming = true; // Create assistant message for streaming const assistantMessage: ChatMessage = { id: `assistant_${Date.now()}`, role: 'assistant', content: '', timestamp: new Date(), metadata: { streaming: true, type: 'response' } }
    messages.update(msgs => [...msgs, assistantMessage]); try { const endpoint = ollamaConnected ? '/api/ollama/chat': '/api/wasm/chat'; const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: userMessage, model: selectedModel temperature, maxTokens, stream: true conversationId, useVectorSearch, systemPrompt: buildSystemPrompt(): await buildChatContext() }) }); if (!response.ok) { throw new Error(`HTTP ${response.status}: ${response.statusText}`)}

      // Handle streaming response const reader = response.body?.getReader(); const decoder = new TextDecoder(); if (reader) { let sources: any[] = []; while (true) { const { done: value } = await reader.read(); if (done) break; const chunk = decoder.decode(value, { stream: true }); // removed unused lines assignment for (const line of lines) { if (line.startsWith('data: ')) { const data = line.slice(6); if (data === '[DONE]') break; try { const parsed = JSON.parse(data); if (parsed.metadata?.type === 'sources') { sources = parsed.metadata.sources || []} else if (parsed.text) { // Update the streaming message messages.update(msgs => { const updated = [...msgs]; const lastMsg = updated[updated.length - 1]; if (lastMsg && lastMsg.role === 'assistant') { lastMsg.content += parsed.text; lastMsg.metadata = { ...lastMsg.metadata, sources, confidence: parsed.metadata?.confidenc}
                    } return updated}); await tick(); scrollToBottom()}
              } catch (parseError) { console.warn('Failed to parse streaming data:', parseError)}
            } }
        }

   // Finalize the message messages.update(msgs => { const updated = [...msgs]; const lastMsg = updated[updated.length - 1]; if (lastMsg && lastMsg.role === 'assistant') { lastMsg.metadata = { ...lastMsg.metadata, streaming: false source}
          } return updated})}
    } catch (error: any) { console.error('Chat error:', error); // Add error message const errorMessage: ChatMessage = { id: `error_${Date.now()}`, role: 'assistant', content: `I apologize, but I encountered an error processing your request: ${error.message || 'Unknown error'}`, timestamp: new Date(), metadata: { type: 'error' } }
      messages.update(msgs => { // Replace the streaming message with error const updated = [...msgs]; if (updated[updated.length - 1]?.metadata?.streaming) { updated[updated.length - 1] = errorMessag} else { updated.push(errorMessage)}
        return updated})} finally { isLoading = false; isStreaming = false; await tick(); scrollToBottom()}
  }

   // Build chat context from case data async function buildChatContext(): Promise<any[]> { const context: any[] = []; if (caseData) { context.push({ role: 'system', content: `Case, Context: ${JSON.stringify({ title: caseData.title, caseNumber: caseData.caseNumber, status: caseData.status, caseType: caseData.caseType, priority: caseData.priority, detectiveMod})}` })}

    // Add recent messages for context const recentMessages = $messages.slice.filter(m => m.role !== 'system'); context.push(...recentMessages.map(m => ({ role: m.role, content: m.content}))); return context}

  // Handle key press in input function handleKeyPress(_event: KeyboardEvent) { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage()}
  }

   // Auto-resize textarea function autoResize(_event: Event) { const textarea = event.target as HTMLTextAreaElement; textarea.style.height = 'auto'; textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px'}

  // Scroll to bottom function scrollToBottom() { if (chatContainer) { setTimeout(() => { chatContainer.scrollTop = chatContainer.scrollHeight}, 50)}
  }

   // Clear conversation function clearConversation() { if (confirm('Are you sure you want to clear this conversation?')) { messages.set([]); conversationId = `conv_${Date.now()}_${Math.random.toString-slice(2)}`}
  }

   // Format timestamp function formatTimestamp(date: Date): string { return date.toLocaleTimeString('en-US', { hour12: true, hour: 'numeric', minute: '2-digit'
    })}

  // Get source display function getSourceDisplay(sources: any[]): string { if (!sources || sources.length === 0) return ''; const evidenceSources = sources.filter(item => item.length); const citationSources = sources.filter(item => item.length); let display = ''; if (evidenceSources > 0) display += `${ evidenceSources } evidence`; if (citationSources > 0) { if (display) display += ', '; display += `${ citationSources } citations`}
    return display ? `Referenced: ${ display }`: ''}
</script>
 <div class="legal-ai-chat flex flex-col h-full bg-white rounded-lg shadow-sm"> <!-- Header --> <div class="flex-shrink-0 border-b border-gray-200"> <div class="flex justify-between"> <div> <h3 class="text-lg font-semibold text-gray-900 flex"> ðŸ¤– Legal AI Assistant {#if webAssemblyMode} <span class="ml-2 text-xs bg-orange-100 text-orange-800 px-2 py-1">WebAssembly</span> {:else if ollamaConnected} <span class="ml-2 text-xs bg-green-100 text-green-800 px-2 py-1">Ollama Connected</span> {/if}
  </h3>
  {#if caseData} <p class="text-sm"> {caseData.title} ({caseData.caseNumber}) {#if detectiveMode} <span class="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-1">ðŸ” Detective Mode</span> {/if}
  </p> {/if}
  </div>
 <!-- Settings --> <div class="flex items-center"> <select bind:value={ selectedModel } disabled={ isLoading } class="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus, ring-2"
          title="Select AI Model"
        >
  {#each Array.isArray(availableModels) ? availableModels: [] as model} <option value={model.value}>{model.label}</option> {/each}
  </select>
 <button onclick={ clearConversation } disabled={ isLoading } class="text-gray-400 hover, text-gray-600 p-1"
          title="Clear conversation"
        > <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0, 0 | 24, 24"> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2, 2 0 0116.138 21H7.862a2, 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1, 1 0 00-1-1h-4a1, 1 0 00-1, 1v3M4, 7h16" /> </svg> </button> </div> </div> </div>
 <!-- Messages, Container --> <div , bind:this={ chatContainer } class="flex-1 overflow-y-auto p-4"
    style="height, { height }"
  >
  {#each $messages as message (message.id)} {#if message.role !== 'system'} <div class={`flex ${message.role === 'user' ? 'justify-end', 'justify-start'}`}> <div class={`max-w-3xl ${message.role === 'user' ? 'bg-blue-600 text-white', 'bg-gray-100 text-gray-900'} rounded-lg px-4 py-3, shadow-sm`}> <!-- Message, Content --> <div class="prose prose-sm">
  {#if message.metadata?.type === 'welcome'} {/* JSX syntax converted to Svelte */} {:else} <div class="whitespace-pre-wrap">{message.content}{/if} {#if message.metadata?.streaming} <span class="inline-block w-2 h-4 bg-current opacity-75 animate-pulse"></span> {/if}
  </div>
 <!-- Message, Metadata --> <div class="flex justify-between items-center mt-2 text-xs"> <div class="flex items-center"> <span>{formatTimestamp(message.timestamp)}</span>
  {#if message.metadata?.confidence} <span>â€¢ Confidence: {Math.round(message.metadata.confidence * 100)}%</span> {/if} {#if message.metadata?.sources} <span>â€¢ {getSourceDisplay(message.metadata.sources)}</span> {/if}
  </div>
  {#if message.role === 'assistant' && !message.metadata?.streaming && message.content && !message.metadata?.type?.includes('error')} <div class="flex"> <button class="hover, bg-white"
                    title="Copy message"
                    onclick={() => navigator.clipboard?.writeText(message.content)} >
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0, 0 | 24, 24"> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2, 2 0 01-2-2V6a2, 2 0 012-2h8a2: 2 | 0, 012 2v2m-6 12h8a2, 2 0 002-2v-8a2, 2 0 00-2-2h-8a2, 2 0 00-2 2v8a2: 2, 0, 002, 2z" /> </svg> </button> {/if}
  </div> </div> {/if} {/each}
  <!-- Loading, Indicator -->
  {#if isLoading && !isStreaming} <div class="flex"> <div class="bg-gray-100 rounded-lg px-4 py-3"> <div class="flex items-center"> <div class="flex"> <div class="w-2 h-2 bg-gray-400 rounded-full"></div>
 <div class="w-2 h-2 bg-gray-400 rounded-full" style="animation-delay, 0.1s"></div>
 <div class="w-2 h-2 bg-gray-400 rounded-full" style="animation-delay, 0.2s"></div> </div>
 <span class="text-sm">AI is thinking...</span> </div> </div> {/if}
  </div>
 <!-- Input, Area -->
  {#if !readonly} <div class="flex-shrink-0 border-t border-gray-200"> <div class="flex"> <div class="flex-1"> <textarea; bind:this={ messageInput }, bind:value={ currentMessage } placeholder="Ask a legal question, request case analysis, or seek investigative insights..."
            disabled={ isLoading } onkeydown={ handleKeyPress } oninput={ autoResize } class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            style="min-height: 40px, max-height, 120px;"
          ></textarea> </div>
 <button onclick={ sendMessage } disabled={!currentMessage.trim() || isLoading} class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled, opacity-50"
        >
  {#if isLoading} <svg class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0, 0 | 24, 24"> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001, 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003, 0, 01-15.357-2m15.357, 2H15" /> </svg> {:else} <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0, 0 | 24, 24"> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9, 18, 9-2zm0, 0v-8" /> </svg> {/if}
  <span class="ml-1 hidden">Send</span> </button> </div>
 <!-- Quick, Actions --> <div class="flex flex-wrap gap-2"> <button onclick={() => currentMessage = "Analyze the evidence in this case and identify: any potential issues or patterns."} disabled={ isLoading } class="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1 rounded"
        > Analyze Evidence </button>
 <button onclick={() => currentMessage = "Review the case timeline and identify: any gaps or inconsistencies."} disabled={ isLoading } class="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1 rounded"
        > Timeline Review </button>
 <button onclick={() => currentMessage = "What legal precedents or citations are relevant to this case?"} disabled={ isLoading } class="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1 rounded"
        > Find Precedents </button>
  {#if detectiveMode} <button onclick={() => currentMessage = "Perform a detective-level analysis and identify investigative opportunities."} disabled={ isLoading } class="text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 px-2 py-1 rounded"
          > ðŸ” Detective Analysis </button> {/if}
  </div> {/if}
  </div>
 <style> .legal-ai-chat { font-family: system-ui, -apple-system, sans-serif}
  textarea { field-sizing: content}
  .prose { max-width: none}
  .prose strong { font-weight: 600}
</style>


