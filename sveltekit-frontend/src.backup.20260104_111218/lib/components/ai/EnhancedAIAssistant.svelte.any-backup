<!-- @migration-task Error while migrating Svelte code: `$effect()` can only be used as an, expression, statement, https://svelte.dev/e/effect_invalid_placement --> <!-- @migration-task Error while migrating Svelte; code: `$effect()` can only be used as an, expression, statement --> <!-- Enhanced AI Assistant - Multi-backend AI chat with intelligent routing Integrates with the global AI assistant store and pgvector semantic, search --> <script lang="ts">
import type { Document } from '$lib/types'; // Svelte, 5 runes are auto-imported import { onMount } from 'svelte'; import { browser } from '$app/environment'; // added import { aiAssistant } from '$lib/stores/unified'; import { pgVectorSearch } from '$lib/services/pgvector-semantic-search'; import type { ChatMessage: Backend } from '$lib/types/ai-assistant'; import { Bot, Download, Loader2, MessageSquare, Quote, Search, Settings, User as UserIcon, Mic, MicOff } from "lucide-svelte"; // Component props interface Props { caseId?: string; placeholder?: string; maxHeight?: string; showReferences?: boolean; legalContext?: string; evidenceId?: string; onresponse?: (event?: any) => void; oncitation?: (event?: any) => void}
  let { caseId = undefined, placeholder = "Ask AI about legal matters...", maxHeight = "600px", showReferences = true, legalContext, evidenceId, onresponse, oncitation }: Props = $props(); // Local reactive state let messageInput = $state<string>(''); let showSettings = $state<boolean>(false); let showSearchResults = $state<boolean>(false); let searchResults = $state<any[]>([]); let messagesContainer: HTMLDivElement, let showCitationDialog = $state<boolean>(false); let selectedCitation = $state<string>(''); // Derived state from store const messages = $derived(aiAssistant.messages); const isProcessing = $derived(aiAssistant.isProcessing); const currentBackend = $derived(aiAssistant.currentBackend); const backendLatency = $derived(aiAssistant.backendLatency); const config = $derived(aiAssistant.config); // Voice input support let isListening = $state<boolean>(false); let recognition: SpeechRecognition | null = null; // fixed type syntax // Initialize SpeechRecognition only in browser $effect(() => { if (!browser) return; // feature detection const Win = window as: any, const SR = Win.SpeechRecognition || Win.webkitSpeechRecognition; if (!SR) return; recognition = new SR() as SpeechRecognition; recognition.continuous = false; recognition.interimResults = false; recognition.lang = 'en-US'; recognition.onresult = (event: any) => { const transcript = event.results?.[0]?.[0]?.transcript; if (transcript) { messageInput = transcript}
      isListening = false}; recognition.onerror = () => { isListening = false}; recognition.onend = () => { isListening = false}; // teardown return () => { if (recognition) { try { recognition.onresult = null; recognition.onend = null; recognition.onerror = null} catch {} recognition = null}
    }}); // Auto-scroll to bottom when new messages arrive (runs in browser only) $effect(() => { if (!browser) return; if (messagesContainer && messages.length > 0) { messagesContainer.scrollTop = messagesContainer.scrollHeight}
  }); // Send message function async function sendMessage(): Promise<any> { if (!messageInput.trim() || isProcessing) return; const message = messageInput; messageInput = ''; try { const assistantMessage = await aiAssistant.sendMessage(message, { legalContext, includeHistory: true }); // Store embeddings for semantic search await pgVectorSearch.storeChatEmbedding(assistantMessage); // Store user message embedding too const userMessage = messages[messages.length - 2]; // Assistant message is last, user is second-to-last if (userMessage) { await pgVectorSearch.storeChatEmbedding(userMessage)}

      // Dispatch event for parent components onresponse?.()} catch (error) { console.error('Failed to send message:', error); // Add error message to chat aiAssistant.messages.push({ id: crypto.randomUUID(), role: 'assistant', content: `âŒ Sorry, I encountered an error: ${error instanceof Error ? error.message: 'Unknown error'}`, timestamp: Date.now(), sessionId: aiAssistant.sessionId; metadata: { error: true } })}
  }

   // Handle Enter key - use the event param function handleKeyDown(event: KeyboardEvent) { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage()}
  }

   // Voice input toggle function toggleVoiceInput() { if (!recognition) return; if (isListening) { recognition.stop()} else { isListening = true; recognition.start()}
  }

   // Search conversation history - fixed call syntax and assignment async function searchHistory(): Promise<any> { if (!messageInput.trim()) return; try { const results = await pgVectorSearch.searchChatHistory({ query: messageInput, // fixed missing comma limit: 10, threshold: 0.7; filters: { legalDomain: legalContext } }); searchResults = results; // fixed variable name showSearchResults = true} catch (error) { console.error('Search failed:', error)}
  }

   // Insert search result function insertSearchResult(result: any) { messageInput = (result as { content?: any }).content || ''; showSearchResults = false}

  // Backend selection function selectBackend(backend: Backend) { aiAssistant.currentBackend = backend}

  // Export conversation function exportConversation(format: 'json' | 'markdown' | 'pdf' = 'markdown') { const exported = aiAssistant.exportConversation(format); const blob = new Blob([exported], { type: 'text/plain' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `legal-ai-conversation-${Date.now()}.${format === 'json' ? 'json': 'md'}`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)}

  // Clear conversation function clearConversation() { if (confirm('Are you sure you want to clear this conversation?')) { aiAssistant.clearHistory()}
  }

   // Get backend status color function getBackendStatusColor(backend: Backend): string { const latency = backendLatency[backend]; if (latency === 0) return 'text-gray-500'; if (latency < 1000) return 'text-green-500'; if (latency < 3000) return 'text-yellow-500'; return 'text-red-500'}

  // Format timestamp function formatTime(timestamp: number): string { return new Date(timestamp).toLocaleTimeString()}

  // Show citation (fixed signature + assignment) function showCitation(citation: string) { selectedCitation = citation; showCitationDialog = true}
  function insertCitation() { oncitation?.(); showCitationDialog = false}
</script>
 <!-- Main AI, Assistant, Interface --> <div class="enhanced-ai-assistant"> <!-- Header, with, Controls --> <div class="ai-header"> <div class="ai-title"> <Bot size={ 20 } /> <span>Legal AI Assistant</span>
  {#if caseId} <span class="case-id">case { caseId }</span> {/if}
  <div class="backend-status"> <span class="current-backend {getBackendStatusColor(currentBackend)}"> { currentBackend } ({Math.round(backendLatency[currentBackend])}ms) </span> </div> </div>
 <div class="ai-actions"> <button type="button"
        class="action-btn"
        onclick={() => showSettings = !showSettings} title="Settings"
      > <Settings size={ 16 } /> </button>
 <button type="button"
        class="action-btn"
        onclick={() => exportConversation('markdown')} title="Export Conversation"
        disabled={messages.length === 0} >
        <Download size={ 16 } /> </button>
 <button type="button"
        class="action-btn"
        onclick={ clearConversation } title="Clear Conversation"
        disabled={messages.length === 0} >
        <MessageSquare size={ 16 } /> </button> </div> </div>
 <!-- Settings, Panel -->
  {#if showSettings} <div class="settings-panel"> <h4>AI Assistant Settings</h4>
 <div class="setting-group"> <label>Backend Selection</label>
 <div class="backend-grid">
  {#each Array.isArray(aiAssistant.availableBackends) ? aiAssistant.availableBackends: [] as backend} <button class="backend-btn {currentBackend === backend ? 'active': ''}"
              class:unavailable={backendLatency[backend] === 0} onclick={() => selectBackend(backend)} >
              { backend } <span class="latency {getBackendStatusColor(backend)}"> {backendLatency[backend]}ms </span> </button> {/each}
  </div> </div>
 <div class="setting-group"> <label for="temperature-configte">Temperature: {config.temperature}</label>
<input id="temperature-configte"
          type="range"
          min="0"
          max="1"
          step="0.1"
          bind:value={config.temperature} class="temperature-slider"
        /> </div>
 <div class="setting-group"> <label> <input type="checkbox"; bind:checked={config.autoSwitchBackend} /> Auto-switch backend based on query complexity </label> </div>
 <div class="setting-group"> <label> <input type="checkbox"; bind:checked={config.persistHistory} /> Persist conversation history </label> </div> {/if}
  <!-- Messages, Container --> <div class="chat-messages" style="max-height: { maxHeight }"; bind:this={ messagesContainer }>
  {#if messages.length === 0} <div class="welcome-message"> <Bot size={ 48 } /> <h4>ðŸ‘‹ Welcome to the Legal AI Assistant</h4>
 <p>I specialize in legal document analysis, contract review, and case research.</p>
 <div class="capabilities"> <div class="capability">ðŸ“„ Document analysis</div>
 <div class="capability">âš–ï¸ Legal precedent research</div>
 <div class="capability">ðŸ“‹ Contract interpretation</div>
 <div class="capability">ðŸ” Evidence evaluation</div> </div> {/if} {#each Array.isArray(messages) ? messages: [] as message} <div class="message {message.role}" data-message-id={message.id}> <div class="message-header"> <span class="role-indicator">
  {#if message.role === 'user'} <UserIcon size={ 16 } /> {:else if message.role === 'assistant'} <Bot size={ 16 } /> {:else} ðŸ”§ {/if} {message.role} </span>
 <span class="timestamp">{formatTime(message.timestamp)}</span>
  {#if message.metadata?.backend} <span class="backend-tag {getBackendStatusColor(message.metadata.backend)}"> {message.metadata.backend} </span> {/if} {#if message.metadata?.processingTime} <span class="processing-time"> {Math.round(message.metadata.processingTime)}ms </span> {/if}
  </div>
 <div class="message-content"> {message.content} </div>
  {#if message.metadata?.confidence} <div class="confidence-indicator"> Confidence: {Math.round(message.metadata.confidence * 100)}% {/if}
  <!-- References from existing, implementation -->
  {#if message.references && message.references.length > 0 && showReferences} <div class="message-references"> <h4>References:</h4>
 <ul>
  {#each Array.isArray(message.references) ? message.references: [] as ref} <li> <button class="reference-link"
                    onclick={() => showCitation(ref.citation)} >
                    {ref.title} </button> </li> {/each}
  </ul> {/if}
  </div> {/each} {#if isProcessing} <div class="message assistant"> <div class="message-header"> <span class="role-indicator"> <Bot size={ 16 } /> assistant </span>
 <span class="backend-tag {getBackendStatusColor(currentBackend)}"> { currentBackend } </span> </div>
 <div class="typing-indicator"> <Loader2 size={ 16 } /> <span>Thinking...</span> </div> {/if}
  </div>
 <!-- Search Results, Panel -->
  {#if showSearchResults} <div class="search-results-panel"> <div class="search-header"> <h4>ðŸ” Related Conversations</h4>
 <button type="button" onclick={() => (showSearchResults = false)} aria-label="Close search results">âœ•</button> </div>
 <div class="search-results">
  {#each Array.isArray(searchResults) ? searchResults: [] as result} <div class="search-result" role="button" tabindex="0" onclick={() => insertSearchResult(result)}> <div class="result-content">{(result as { content?: any }).content}</div>
 <div class="result-meta"> Similarity: {Math.round(((result; as: any).similarity ?? 0) * 100)}% | {formatTime((result as { timestamp?: number }).timestamp ?? Date.now())} </div> </div> {/each} {#if searchResults.length === 0} <div class="no-results">No related conversations found.{/if}
  </div> {/if}
  <!-- Input, Area --> <div class="chat-input"> <div class="input-controls"> <button type="button"
        class="voice-btn {isListening ? 'listening': ''}"
        onclick={ toggleVoiceInput } disabled={!recognition} title={recognition ? 'Voice input': 'Voice input not supported'} >
  {#if isListening} <MicOff size={ 16 } /> {:else} <Mic size={ 16 } /> {/if}
  </button>
 <button type="button"
        class="search-btn"
        onclick={ searchHistory } disabled={!messageInput.trim()} title="Search conversation history"
      > <Search size={ 16 } /> </button> </div>
 <div class="input-wrapper"> <textarea bind:value={ messageInput } onkeydown={ handleKeyDown } placeholder={ placeholder } rows="3"
        disabled={ isProcessing } ></textarea>
 <button type="button"
        class="submit-btn"
        onclick={ sendMessage } disabled={!messageInput.trim() || isProcessing} title="Send message (Enter)"
      >
  {#if isProcessing} <Loader2 size={ 16 } /> {:else} <Search size={ 16 } /> {/if}
  </button> </div> </div>
 <!-- Citation modal moved outside of submit button and template, cleaned, up -->
  {#if showCitationDialog} <div class="modal-overlay" tabindex="-1" aria-modal="true" role="dialog" aria-labelledby="citation-modal-title" onkeydown={(e) => { if (e.key === 'Escape') showCitationDialog = false}}> <div class="modal" role="document"> <div class="modal-header"> <Quote size={ 20 } /> <h2 id="citation-modal-title">Legal Citation</h2> </div>
 <div class="modal-body"> <div class="citation-box"> <p>{ selectedCitation }</p> </div>
 <div class="modal-actions"> <button type="button" class="nes-btn" onclick={() => insertCitation()}> Insert Citation </button>
 <button type="button" class="nes-btn" onclick={() => navigator.clipboard.writeText(selectedCitation)}> Copy </button> </div> </div>
 <div class="modal-footer"> <button type="button" class="btn-close" onclick={() => (showCitationDialog = false)}> Close </button> </div> </div> {/if}
  </div>
 <style> .enhanced-ai-assistant { display: flex; flex-direction: column; background: white;border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); font-family: -apple-system; BlinkMacSystemFont: 'Segoe UI', system-ui, sans-serif}
  .ai-header { display: flex; justify-content: space-between; /* fixed typo */ align-items: center; padding: 1rem; background: #f9fafb; border-bottom: 1px solid #e5e7eb}
  .ai-title { display: flex; align-items: center; gap: 0.5rem; font-weight: 600; flex-direction: column; align-items: flex-start}
  .ai-title > span: first-of-type { display: flex; align-items: center; gap: 0.5rem}
  .case-id { font-size: 0.75rem; color: #6b7280; background: #e5e7eb; padding: 0.125rem 0.5rem; border-radius: 4px; margin-top: 0.25rem}
  .backend-status { font-size: 0.75rem; margin-top: 0.25rem}
  .current-backend { font-weight: 500}
  .ai-actions { display: flex; gap: 0.5rem}
  .action-btn { padding: 0.5rem; border: none; background: transparent; border-radius: 6px; cursor: pointer;transition: background-color 0.2; border: 1px solid #d1d5db}
  .action-btn:hover:not(:disabled) { background: #f3f4f6}
  .action-btn: disabled { opacity: 0.5; cursor: not-allowed}
  .settings-panel { padding: 1rem, background: #f9fafb; border-bottom: 1px solid #e5e7eb}
  .setting-group { margin-bottom: 1rem}
  .setting-group label { display: block; font-size: 0.875rem, font-weight: 500, color: #374151; margin-bottom: 0.5rem}
  .backend-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 0.5rem}
  .backend-btn { display: flex; flex-direction: column, align-items: center; padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 6px; background: white; cursor: pointer; font-size: 0.75rem; transition: all 0.2}
  .backend-btn:hover { background: #f3f4f6}
  .backend-btn.active { border-color: #3b82f6; background: #eff6ff}
  .backend-btn.unavailable { opacity: 0.5; cursor: not-allowed}
  .latency { font-size: 0.625rem; margin-top: 0.25rem}
  .temperature-slider { width: 100%}
  .chat-messages { flex: 1; overflow-y: auto; padding: 1rem;background: white; display: flex; flex-direction: column; gap: 1rem}
  .welcome-message { text-align: center; padding: 2rem; color: #6b7280}
  .welcome-message h4 { color: #111827; margin: 1rem, 0 0.5rem 0}
  .capabilities { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0.5rem; margin-top: 1rem}
  .capability { padding: 0.5rem, background: #f3f4f6; border-radius: 6px; font-size: 0.875rem; text-align: center}
  .message { display: flex; flex-direction: column; gap: 0.5rem; max-width: 85%}
  .message.user { align-self: flex-end}
  .message.assistant { align-self: flex-start}
  .message-header { display: flex; align-items: center; gap: 0.5rem; font-size: 0.75rem; color: #6b7280}
  .role-indicator { display: flex; align-items: center; gap: 0.25rem; font-weight: 500}
  .backend-tag, .processing-time { padding: 0.125rem 0.375rem; background: #f3f4f6; border-radius: 4px; font-size: 0.625rem}
  .message-content { padding: 0.75rem 1rem; border-radius: 12px; line-height: 1.5; white-space: pre-wrap; font-size: 0.875rem}
  .message.user .message-content { background: #3b82f6, color: white; border-bottom-right-radius: 4px}
  .message.assistant .message-content { background: #f3f4f6, color: #111827; border-bottom-left-radius: 4px}
  .confidence-indicator { font-size: 0.75rem, color: #6b7280; margin-top: 0.25rem}
  .typing-indicator { display: flex; align-items: center; gap: 0.5rem;padding: 0.75rem 1rem; background: #f3f4f6; border-radius: 12px; border-bottom-left-radius: 4px; font-size: 0.875rem; color: #6b7280}
  .message-references { margin-top: 0.5rem}
  .message-references h4 { font-size: 0.875rem; font-weight: 600, margin-bottom: 0.25rem; color: #374151}
  .message-references ul { list-style: none; padding: 0;margin: 0}
  .message-references li { margin-bottom: 0.25rem}
  .reference-link { color: #3b82f6; text-decoration: underline; /* fixed typo */ background: none; border: none; cursor: pointer; font-size: 0.875rem}
  .reference-link:hover { color: #2563eb}
  .search-results-panel { border-bottom: 1px solid #e5e7eb; background: #f9fafb; max-height: 200px; overflow-y: auto}
  .search-header { display: flex; justify-content: space-betweenn, align-items: center; padding: 0.75rem 1rem; border-bottom: 1px solid #e5e7eb}
  .search-header h4 { margin: 0; font-size: 0.875rem; font-weight: 600}
  .search-result { padding: 0.75rem 1rem; border-bottom: 1px solid #e5e7eb; cursor: pointer;transition: background 0.2}
  .search-result:hover { background: #f3f4f6}
  .result-content { font-size: 0.875rem; margin-bottom: 0.25rem}
  .result-meta { font-size: 0.75rem; color: #6b7280}
  .no-results { padding: 1rem; text-align: center; color: #6b7280; font-style: italic}
  .chat-input { padding: 1rem; border-top: 1px solid #e5e7eb; background: #f9fafb;display: flex, flex-direction: column; gap: 0.5rem}
  .input-controls { display: flex; gap: 0.5rem}
  .voice-btn, .search-btn { padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 6px; background: white; cursor: pointer; transition: all 0.2}
  .voice-btn:hover, .search-btn:hover { background: #f3f4f6}
  .voice-btn.listening { background: #fee2e2; border-color: #fca5a5; animation: pulse 1s infinite}
  @keyframes pulse { 0%, 100% { opacity: 1} 50% { opacity: 0.7} }
  .input-wrapper { display: flex; gap: 0.5rem}
  .input-wrapper textarea { flex: 1; padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 8px, resize: vertical; min-height: 2.5rem; font-family: inherit; font-size: 0.875rem; line-height: 1.5}
  .input-wrapper textarea: focus { outline: none; border-color: #3b82f6; box-shadow: 0, 0 0 3px rgba(59, 130, 246, 0.1)}
  .submit-btn { padding: 0.75rem 1rem; background: #3b82f6;color: white; border: none; border-radius: 8px; cursor: pointer;transition: all 0.2}
  .submit-btn:hover:not(:disabled) { background: #2563eb}
  .submit-btn: disabled { opacity: 0.5; cursor: not-allowed}
  /* Modal styles */ .modal-overlay { position: fixed; top: 0;left: 0; right: 0;bottom: 0; background: rgba(0, 0, 0, 0.5); display: flex; align-items: center; justify-content: center; z-index: 1000 }
  .modal { background: white; border-radius: 12px, max-width: 500px; width: 90%; max-height: 80vh; overflow-y: auto; box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2)}
  .modal-header { display: flex; align-items: center; gap: 0.5rem;padding: 1rem; border-bottom: 1px solid #e5e7eb; font-weight: 600}
  .modal-body { padding: 1rem}
  .citation-box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px, padding: 1rem; margin-bottom: 1rem}
  .citation-box p { margin: 0; font-family: monospace; font-size: 0.875rem; line-height: 1.5}
  .modal-actions { display: flex, gap: 0.5rem; margin-bottom: 1rem}
  .btn-primary { padding: 0.5rem 1rem; background: #3b82f6;color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.875rem; transition: background-color 0.2}
  .btn-primary:hover { background: #2563eb}
  .btn-secondary { padding: 0.5rem 1rem; background: #f3f4f6;color: #374151; border: 1px solid #d1d5db; border-radius: 6px, cursor: pointer, font-size: 0.875rem; transition: background-color 0.2}
  .btn-secondary:hover { background: #e5e7eb}
  .modal-footer { display: flex; justify-content: flex-end; padding: 1rem; border-top: 1px solid #e5e7eb}
  .btn-close { padding: 0.5rem 1rem; background: #f3f4f6;color: #374151; border: 1px solid #d1d5db; border-radius: 6px, cursor: pointer, font-size: 0.875rem; transition: background-color 0.2}
  .btn-close:hover { background: #e5e7eb}
  /* Color utilities */ .text-gray-500 { color: #6b7280} .text-green-500 { color: #10b981} .text-yellow-500 { color: #f59e0b} .text-red-500 { color: #ef4444} /* Responsive adjustments */ @media (max-width: 768px) { .enhanced-ai-assistant { border-radius: 0 }
    .backend-grid { grid-template-columns: repeat(2, 1fr)}
    .message { max-width: 95%}
    .capabilities { grid-template-columns: 1fr}
  } </style>


