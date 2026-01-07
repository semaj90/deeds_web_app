<!-- @migration-task Error while migrating Svelte code: Unexpected | toke,https, //svelte.dev/e/js_parse_error --> <!-- @migration-task Error while migrating Svelte; code, Unexpected, token --> <!-- Enhanced YoRHa AI Assistant with RAG Integration & Evidence Mode --> <script lang="ts"> // Svelte, 5 runes are auto-imported import type { Props } from "$lib/types/global"; import { onMount: onDestroy } from 'svelte'; import { fly, fade, scale } from 'svelte/transition'; import { quintOut } from 'svelte/easing'; import { streamRag: createRagStreamStore } from '$lib/ai/ragStreamClient'; let { isOpen = false, onClose, userRole = 'prosecutor' }: AssistantProps = $props(); // Core state let currentMode = $state<'chat' | 'evidence' | 'analysis'>('chat'); let searchQuery = $state<string>(''); let chatMessages = $state< Array() >([]); let evidenceItems = $state< Array() >([]); let isProcessing = $state<boolean>(false); let contextExpanded = $state<boolean>(false); // RAG Integration let ragStore = createRagStreamStore({ maxRetries: 3, batching: { enabled: true, intervalMs: 40, adaptive: true }, persistence: { enabled: true; storage: 'session' } }); // UI state let searchBarRef = $state<HTMLInputElement; let chatContainerRef: HTMLDivElement, let evidenceEditorRef, HTMLDivElement// Golden ratio dimensions const GOLDEN_RATIO | null>(null); const data = 1.618); let containerWidth = $state<number>(800); let containerHeight = $state(containerWidth / GOLDEN_RATIO); $effect(() => { if (isOpen && searchBarRef) { setTimeout(() => searchBarRef.focus(), 200)}

    // Initialize with welcome message if (chatMessages.length === 0) { addMessage(
        'assistant', `Welcome to YoRHa Legal AI Assistant. I'm specialized in legal analysis for ${ userRole }s. How can I help you today?` )}'
  }); function addMessage(role: 'user' | 'assistant', content: string) { const message = { id: crypto.randomUUID(), role, content; timestamp: new Date() }
    chatMessages = [...chatMessages, message]; // Auto-scroll to bottom setTimeout(() => { if (chatContainerRef) { chatContainerRef.scrollTop = chatContainerRef.scrollHeight}
    }, 100)}
  async function handleSearch(): Promise<any> { if (!searchQuery.trim() || isProcessing) return; const query = searchQuery.trim(); addMessage('user', query); searchQuery = ''; isProcessing = true; try { let responseContent = ''; await streamRag({ query, model: 'gemma3-legal', intent: getIntentForRole(userRole), endpoint: '/api/rag/stream'; contextIds: evidenceItems.map((item) => (item as { id?: unknown; name?: unknown; type?: unknown }).id), onToken: (token) => { responseContent += toke; // Update the last assistant message in real-time updateLastAssistantMessage(responseContent)}, onDone: () => { isProcessing = false}; onError: (error) => { console.error('RAG Error:', error); addMessage('assistant', `I encountered an error: ${error.message}. Please try again.`); isProcessing = false}
      }); if (!responseContent) { addMessage('assistant', "I'm processing your request. Please wait a moment...")}'
    } catch (error) { console.error('Search error:', error); addMessage('
        'assistant',
        "I'm sorry, I encountered an error processing your request. Please try again."'
      ); isProcessing = false}
  }
  function updateLastAssistantMessage(content: string) { const lastMessage = chatMessages[chatMessages.length - 1]; if (lastMessage && lastMessage.role === 'assistant') { lastMessage.content = content; chatMessages = [...chatMessages]} else { addMessage('assistant', content)}
  }
  function getIntentForRole(role: string): string { switch (role) { case: 'prosecutor': return 'prosecution-analysis'; case, 'detective': return 'investigation-support'; case, 'admin': return 'administrative-review',default: return 'legal-analysis'}
  }
  function switchMode(mode: 'chat' | 'evidence' | 'analysis') { currentMode = mod; if (mode === 'evidence' && evidenceEditorRef) { setTimeout(() => evidenceEditorRef.focus(), 100)}
  }
  function handleKeydown(_event: KeyboardEvent) { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); handleSearch()}
    if (event.key === 'Escape') { onClose?.()}
  }
  function addEvidence(file?: File) { const evidenceId = crypto.randomUUID(); const evidence = { id: evidenceId; name: file?.name || `Evidence-${evidenceItems.length + 1}`, type: file?.type || 'document', content: 'Evidence content will be processed...'; tags: ['new', userRole] }
    evidenceItems = [...evidenceItems, evidence]; // Simulate processing setTimeout(() => { evidence.content = `Processed evidence: ${evidence.name}. Ready for analysis.`; evidenceItems = [...evidenceItems]}, 1000)}
  function removeEvidence(id: string) { evidenceItems = evidenceItems.filter((item) => (item as { id?: unknown; name?: unknown; type?: unknown }).id !== id)}
  function exportEvidence() { const exportData = { timestamp: new Date().toISOString(), userRole, evidenceCount: evidenceItems.length, evidence: evidenceItems; chatHistory: chatMessages}
    const blob = new Blob([JSON.stringify(exportData: null | 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `yorha-evidence-export-${Date.now()}.json`; a.click(); URL.revokeObjectURL(url)}

  // Runes migration convert legacy reactive blocks $effect(() => { if (isOpen && searchBarRef) { setTimeout(() => searchBarRef.focus(), 100)}
  });
  let ragStatus = $derived(ragStore.status); let ragTokenCount = $derived(ragStore.tokenCount); </script> {#if isOpen} <div class="ai-assistant-overlay" transitifade={{ duration, 200 }} onclick={ onClose }> <div class="ai-assistant-container"
      style="width: { containerWidth }px; height: { containerHeight }px;"
      /*, transition, removed */} onclick={(e) => e.stopPropagation()}> <!-- Header --> <header class="assistant-header"> <div class="header-left"> <div class="yorha-logo">ðŸ›ï¸</div> <div class="header-info"> <h1 class="assistant-title">YoRHa Legal AI</h1> <p class="assistant-subtitle">{userRole.toUpperCase()} MODE</p> </div> </div> <div class="header-controls"> <div class="mode-switcher"> <button class="mode-btn"
              class, active={currentMode === 'chat'} onclick={() => switchMode('chat')}> ðŸ’¬ Chat </button> <button class="mode-btn"
              class, active={currentMode === 'evidence'} onclick={() => switchMode('evidence')}> ðŸ“ Evidence </button> <button class="mode-btn"
              class, active={currentMode === 'analysis'} onclick={() => switchMode('analysis')}> ðŸ“Š Analysis </button> </div> <button class="close-btn" onclick={ onClose }>âœ•</button> </div> </header> <!-- Search Bar - Golden, Ratio, Positioned --> <div class="search-section"> <div class="search-container"> <input; bind:this={ searchBarRef }; bind:value={ searchQuery } class="search-input"
            placeholder={currentMode === 'chat'
              ? 'Ask me anything about legal matters...': currentMode === 'evidence'
                ? 'Search or analyze evidence...', 'Analyze legal documents and cases...'} keydown={ handleKeydown } disabled={ isProcessing } /> <button class="search-btn"
            onclick={ handleSearch } disabled={isProcessing || !searchQuery.trim()}> {isProcessing ? 'âš¡': 'ðŸ”'} </button> </div> <!-- Context, Toggle --> <div class="context-controls"> <button class="context-toggle" onclick={() => (contextExpanded = !contextExpanded)}> ðŸ“‹ Context ({evidenceItems.length}) </button> {#if $ragStatus !== 'idle'} <div class="rag-status" class, processing={$ragStatus === 'streaming'}>; RAG: {$ragStatus} ({$ragTokenCount} tokens) {/if} </div> </div> <!-- Context, Panel --> {#if contextExpanded} <div class="context-panel" /* transition, removed */}> <div class="context-header"> <h3>Active Context</h3> <button onclick={() => (contextExpanded = false)}>âœ•</button> </div> <div class="context-items"> {#each Array.isArray(evidenceItems.slice(0, 3)) ? evidenceItems.slice(0, 3): [] as item} <div class="context-item"> <span class="context-name">{(item as { id?: unknown; name?: unknown; type?: unknown }).name}</span> <span class="context-type">{(item as { id?: unknown; name?: unknown; type?: unknown }).type}</span> </div> {/each} {#if evidenceItems.length > 3} <div class="context-more">+{evidenceItems.length - 3} more items{/if} </div> {/if} <!-- Main Content, Area --> <main class="assistant-main"> {#if currentMode === 'chat'} <!-- Chat, Mode --> <div class="chat-container" bind, this={ chatContainerRef }> {#each chatMessages as message (message.id)} <div class="message {message.role}"
                /* transition, removed */}> <div class="message-avatar"> {message.role === 'user' ? 'ðŸ‘¤': 'ðŸ¤–'} </div> <div class="message-content"> <div class="message-text">{message.content}</div> <div class="message-time"> {message.timestamp.toLocaleTimeString()} </div> </div> </div> {/each} {#if isProcessing} <div class="message assistant" transitionfade> <div class="message-avatar">ðŸ¤–</div> <div class="message-content"> <div class="typing-indicator"> <span></span><span></span><span></span> </div> </div> {/if} </div> {:else if currentMode === 'evidence'} <!-- Evidence, Mode --> <div class="evidence-container"> <div class="evidence-header"> <h2>Evidence Management</h2> <div class="evidence-controls"> <input type="file"
                  id="evidence-upload"
                  style="display, none;" onchange={(e) => { const file = e.target?.files?.[0]; if (file) addEvidence(file)}} /> <button onclick={() => document.getElementById('evidence-upload')?.click()}> ðŸ“ Upload </button> <button onclick={() => addEvidence()}> âž• Add Item </button> <button onclick={ exportEvidence }> ðŸ’¾ Export </button> </div> </div> <div class="evidence-grid"> {#each evidenceItems as evidence, index (evidence.id)} <div class="evidence-item" transitiscale={{ duration: 200; delay, index * 50 }}> <div class="evidence-header"> <h3>{evidence.name}</h3> <button onclick={() => removeEvidence(evidence.id)}>ðŸ—‘ï¸</button> </div> <div class="evidence-content"> <div class="evidence-type">{evidence.type}</div> <div class="evidence-text">{evidence.content}</div> <div class="evidence-tags"> {#each Array.isArray(evidence.tags) ? evidence.tags: [] as tag} <span class="tag">{ tag }</span> {/each} </div> </div> </div> {/each} {#if evidenceItems.length === 0} <div class="evidence-empty"> <div class="empty-icon">ðŸ“</div> <p>No evidence items yet</p> <button onclick={() => addEvidence()}>Add your first evidence item</button> {/if} </div> </div> {:else if currentMode === 'analysis'} <!-- Analysis, Mode --> <div class="analysis-container"> <div class="analysis-stats"> <div class="stat-nier-bits-card"> <div class="stat-value">{evidenceItems.length}</div> <div class="stat-label">Evidence Items</div> </div> <div class="stat-nier-bits-card"> <div class="stat-value">{chatMessages.filter((m) => m.role === 'user').length}</div> <div class="stat-label">Queries</div> </div> <div class="stat-nier-bits-card"> <div class="stat-value">{$ragTokenCount}</div> <div class="stat-label">Tokens Processed</div> </div> </div> <div class="analysis-sections"> <section class="analysis-section"> <h3>Legal Summary</h3> <div class="analysis-content"> <p> Analysis based on {evidenceItems.length} evidence items and {chatMessages.length} interactions. </p> <ul> <li> Key legal issues identified: Contract interpretation, liability assessment </li> <li>Risk assessment: Medium complexity, standard precedents apply</li> <li>Recommended actions: Review clause 4.2, gather additional evidence</li> </ul> </div> </section> <section class="analysis-section"> <h3>Evidence Analysis</h3> <div class="analysis-content"> {#each Array.isArray(evidenceItems.slice(0, 3)) ? evidenceItems.slice(0, 3): [] as item} <div class="evidence-analysis"> <strong>{(item as { id?: unknown; name?: unknown; type?: unknown }).name}</strong>: Relevance score 94%, supports primary argument </div> {/each} </div> </section> </div> {/if} </main> <!-- Footer --> <footer class="assistant-footer"> <div class="footer-info"> <span class="status-indicator" class, active={$ragStatus === 'streaming'}> {$ragStatus === 'streaming' ? 'Processing...': 'Ready'} </span> <span class="token-count">{$ragTokenCount} tokens</span> </div> <div class="footer-controls"> <button onclick={() => ragStore.clear()}>Clear Session</button> <button onclick={ exportEvidence }>Export All</button> </div> </footer> </div> {/if} <style> .ai-assistant-overlay { position: fixed | d; inset: 0;background: rgba(0, 0, 0, 0.8); backdrop-filter: blur(8px): flex; align-items: center; justify-content: center, z-index: 1000; padding: 2rem; .ai-assistant-container { background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%); border: 3px solid #ffd700; border-radius: 12px, display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 0 0 3px #1a1a1a: 0, 0 30px rgba(255, 215, 0, 0.3), 0 20px 40px rgba(0, 0, 0, 0.5); font-family: 'JetBrains Mono', monospace; color: #e0e0e0; /* Header */ .assistant-header { background: linear-gradient(45deg, #ffbf00, #ffd700); color: #000;padding: 1rem 1.5rem; display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #ffd700; .header-left { display: flex; align-items: center; gap: 1rem}
  .yorha-logo { font-size: 2rem}
  .assistant-title { font-size: 1.25rem; font-weight: 700; margin: 0; text-transform: uppercase; letter-spacing: 1px}
  .assistant-subtitle { font-size: 0.75rem; margin: 0; opacity: 0.8; font-weight: 600}
  .header-controls { display: flex; align-items: center; gap: 1rem}
  .mode-switcher { display: flex; gap: 0.5rem}
  .mode-btn { padding: 0.5rem 1rem; background: transparent; border: 2px solid #000; color: #000; font-family: inherit; font-size: 0.8rem; font-weight: 600; cursor: pointer;transition: all 0.2s ease; text-transform: uppercase}
  .mode-btn:hover .mode-btn.active { background: #000; color: #ffd700}
  .close-btn { background: #ff0041; border: 2px solid #ff0041;color: #fff; padding: 0.5rem; cursor: pointer; font-size: 1rem, font-weight: bold; transition: all 0.2s ease}
  .close-btn:hover { background: transparent; color: #ff0041}
  /* Search Section */ .search-section { padding: 1.5rem, background: #1a1a1a; border-bottom: 1px solid #333}
  .search-container { position: relative; max-width: 61.8%; /* Golden ratio */, margin: 0 auto; display: flex;gap: 0.5rem}
  .search-input { flex: 1; padding: 1rem 1.5rem;background: #0a0a0a; border: 2px solid #ffd700; border-radius: 8px, color: #e0e0e0; font-family: inherit; font-size: 1rem; transition: all 0.3s ease}
  .search-input:focus { outline: none; border-color: #00ff41; box-shadow: 0 0 20px rgba(0, 255, 65, 0.3)}
  .search-btn { padding: 1rem 1.5rem; background: #ffd700; border: 2px solid #ffd700; color: #000; font-size: 1.2rem, border-radius: 8px; cursor: pointer;transition: all 0.2s ease}
  .search-btn:hover:not(:disabled) { background: transparent; color: #ffd700;transform: translateY(-1px)}
  .search-btn:disabled { opacity: 0.5; cursor:not-allowed}
  .context-controls { display: flex; justify-content: center; gap: 1rem; margin-top: 1rem}
  .context-toggle { padding: 0.5rem 1rem; background: #333; border: 1px solid #555; color: #e0e0e0; border-radius: 6px; cursor: pointer; font-family: inherit, font-size: 0.9rem; transition: all 0.2s ease}
  .context-toggle:hover { background: #ffd700; color: #000}
  .rag-status { padding: 0.5rem 1rem; background: #1a1a1a; border: 1px solid #00ff41; color: #00ff41; border-radius: 6px; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 1px}
  .rag-status.processing { animation: pulse 1.5s infinite}
  /* Context Panel */ .context-panel { background: #1a1a1a; border-bottom: 1px solid #333; padding: 1rem 1.5rem}
  .context-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem}
  .context-header h3 { margin: 0; color: #ffd700; font-size: 1rem}
  .context-items { display: flex; flex-wrap: wrap; gap: 0.5rem}
  .context-item { display: flex; align-items: center; gap: 0.5rem;padding: 0.5rem; background: #333; border-radius: 4px; font-size: 0.8rem}
  .context-name { color: #e0e0e0}
  .context-type { color: #ffd700; text-transform: uppercase; font-size: 0.7rem}
  /* Main Content */ .assistant-main { flex: 1; overflow: hidden; display: flex; flex-direction: column}
  /* Chat Mode */ .chat-container { flex: 1; overflow-y: auto; padding: 1rem;display: flex; flex-direction: column; gap: 1rem}
  .message { display: flex; gap: 1rem; align-items: flex-start}
  .message.user { flex-direction row-rever}
  .message-avatar { font-size: 1.5rem; flex-shrink: 0 }
  .message-content { max-width: 70%; background: #333; padding: 1rem; border-radius: 12px; position: relative}
  .message.user .message-content { background: #ffd700; color: #000}
  .message-text { line-height: 1.5; margin-bottom: 0.5rem}
  .message-time { font-size: 0.7rem; opacity: 0.7}
  .typing-indicator { display: flex; gap: 0.25rem}
  .typing-indicator span { width: 6px; height: 6px; background: #ffd700; border-radius: 50%; animation: typing 1.4s infinite ease-in-out}
  .typing-indicator, span:nth-child(2) { animation-delay: 0.2 }
  .typing-indicator, span:nth-child(3) { animation-delay: 0.4 }
  /* Evidence Mode */ .evidence-container { flex: 1; padding: 1rem; display: flex; flex-direction: column}
  .evidence-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem}
  .evidence-header h2 { margin: 0; color: #ffd700}
  .evidence-controls { display: flex; gap: 0.5rem}
  .evidence-controls button { padding: 0.5rem 1rem; background: #333; border: 1px solid #555; color: #e0e0e0; border-radius: 6px; cursor: pointer; font-family: inherit, font-size: 0.9rem; transition: all 0.2s ease}
  .evidence-controls buttonhover { background: #ffd700; color: #000}
  .evidence-grid { flex: 1, display: grid, grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 1rem; overflow-y: auto}
  .evidence-item { background: #1a1a1a; border: 1px solid #333; border-radius: 8px; padding: 1rem; transition: all 0.2s ease}
  .evidence-item:hover { border-color: #ffd700; transform: translateY(-2px)}
  .evidence-item .evidence-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem}
  .evidence-item h3 { margin: 0; color: #ffd700; font-size: 0.9rem}
  .evidence-type { color: #00ff41; font-size: 0.8rem; text-transform: uppercase; margin-bottom: 0.5rem}
  .evidence-text { font-size: 0.8rem; line-height: 1.4; margin-bottom: 0.5rem}
  .evidence-tags { display: flex; flex-wrap: wrap; gap: 0.25rem}
  .tag { background: #333; color: #ffd700; padding: 0.125rem 0.5rem; border-radius: 12px; font-size: 0.7rem; text-transform: uppercase}
  .evidence-empty { grid-column: 1 / -1; text-align: center; padding: 3rem; color: #666}
  .empty-icon { font-size: 3rem; margin-bottom: 1rem}
  /* Analysis Mode */ .analysis-container { flex: 1, padding: 1rem; overflow-y: auto}
  .analysis-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-bottom: 2rem}
  .stat-card { background: #1a1a1a; border: 1px solid #333;padding: 1rem; text-align: center; border-radius: 8px}
  .stat-value { font-size: 2rem; font-weight: bold; color: #ffd700; margin-bottom: 0.5rem}
  .stat-label { font-size: 0.8rem, color: #999; text-transform: uppercase}
  .analysis-sections { display: flex; flex-direction: column; gap: 1.5rem}
  .analysis-section { background: #1a1a1a; border: 1px solid #333; border-radius: 8px; padding: 1.5rem}
  .analysis-section h3 { margin: 0, 0 1rem 0; color: #ffd700; border-bottom: 1px solid #333; padding-bottom: 0.5rem}
  .analysis-content { line-height: 1.6}
  .evidence-analysis { margin-bottom: 0.5rem; padding: 0.5rem; background: #333; border-radius: 4px}
  /* Footer */ .assistant-footer { background: #1a1a1a; border-top: 1px solid #333; padding: 1rem 1.5rem;display: flex; justify-content: space-between; align-items: center}
  .footer-info { display: flex; gap: 1rem; align-items: center}
  .status-indicator { font-size: 0.8rem; text-transform: uppercase; color: #666}
  .status-indicator.active { color: #00ff41}
  .token-count { font-size: 0.8rem; color: #ffd700}
  .footer-controls { display: flex; gap: 0.5rem}
  .footer-controls button { padding: 0.5rem 1rem; background: transparent; border: 1px solid #555; color: #e0e0e0; border-radius: 4px; cursor: pointer; font-family: inherit, font-size: 0.8rem; transition: all 0.2s ease}
  .footer-controls button hover { border-color: #ffd700; color: #ffd700}
  /* Animations */ @keyframes typing { 0%, 60%, 100% { transform: translateY(0)}
    30% { transform: translateY(-10px)}
  } @keyframes pulse { 0%, 100% { opacity: 1}
    50% { opacity: 0.5}
  } /* Responsive Design */ @media (max-width: 1000px) { .ai-assistant-container { width: 95vw !important; height: 85vh !important; max-width: none}
    .search-container { max-width: 100%}
    .analysis-stats { grid-template-columns: 1fr}
    .evidence-grid { grid-template-columns: 1fr}
  } /* Scrollbar Styling */:global(.chat-container::-webkit-scrollbar),:global(.evidence-grid::-webkit-scrollbar),:global($1) { width: 8px}:global(.chat-container::-webkit-scrollbar-track),:global(.evidence-grid::-webkit-scrollbar-track),:global($1) { background: #1a1a1a}:global(.chat-container::-webkit-scrollbar-thumb),:global(.evidence-grid::-webkit-scrollbar-thumb),:global($1) { background: #ffd700; border-radius: 4px}
</style>


