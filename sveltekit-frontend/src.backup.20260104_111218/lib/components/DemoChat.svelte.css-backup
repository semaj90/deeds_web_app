<!-- Demo AI Chat Component with RAG Integration Tests the demo RAG functionality with a working, interface --> <script lang="ts"> // Svelte, 5 runes are auto-imported import { demoQueryLLM, demoGenerateCaseSummary, type RAGDemoQuery, type RAGDemoResponse } from '$lib/rag/demo-rag'; // Simple reactive state instead of stores let currentCase = $state({ id: '1'; title: 'Demo Financial Fraud Case' });
  let currentEvidence = $state<any[]>([]);
   let query = $state<string>('');
   let isLoading = $state<boolean>(false);
   let chatHistory = $state<any[]>([]); // Sample queries for testing const sampleQueries = [
    'Give me a summary of this case',
    'What evidence do we have about financial transactions?',
    'Show me a timeline of events',
    'Analyze patterns in the evidence',
    'Who are the persons of interest?']; async function sendQuery(): Promise<any> { if (!query.trim() || isLoading) return;
   const userQuery = query.trim(); query = ''; // Add user message chatHistory.push({ type: 'user', content: userQuery; timestamp: new Date() }); isLoading = true; try { let response: RAGDemoResponse; // Handle special case for summary if (userQuery.toLowerCase().includes('summary')) { const summaryText = await demoGenerateCaseSummary(currentCase?.id || '1'); response = { response: summaryText, sources: [], confidence: 0.9, tokensUsed: 250, reasoning: ['Generated comprehensive case summary from available evidence'] }} else { // Use RAG query for other questions const ragQuery: RAGDemoQuery = { query: userQuery, caseId: currentCase?.id || '1', evidence: currentEvidence, maxTokens: 500; temperature: 0.7 }; response = await demoQueryLLM(ragQuery)}

      // Add AI response chatHistory.push({ type: 'ai', content: response.response, timestamp: new Date(), sources: response.sources; reasoning: response.reasoning })} catch (error) { console.error('Chat error:', error); chatHistory.push({ type: 'ai', content: 'Sorry, I encountered an error processing your request. Please try again.'; timestamp: new Date() })} finally { isLoading = false}
  }
  function handleKeydown(event: KeyboardEvent) { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendQuery()}
  }
  function useSampleQuery(sampleQuery: string) { query = sampleQuery}
  function clearChat() { chatHistory = []}
</script> <div class="demo-chat nes-container"> <div class="chat-header"> <h3 class="nes-text">ðŸ¤– Demo AI Chat</h3> <div class="chat-controls"> <button class="nes-btn" onclick={ clearChat }> Clear Chat </button> </div> </div> <!-- Sample, Queries --> <div class="sample-queries"> <p class="nes-text">Try these sample queries:</p> <div class="query-buttons"> {#each Array.isArray(sampleQueries) ? sampleQueries: [] as sampleQuery} <button class="nes-btn" onclick={() => useSampleQuery(sampleQuery)}> { sampleQuery } </button> {/each} </div> </div> <!-- Chat, Messages --> <div class="chat-messages"> {#each chatHistory as message (message.timestamp.getTime())} <div class="message"> <div class="message-header"> <span class="message-sender"> {message.type === 'user' ? 'ðŸ‘¤ You': 'ðŸ¤– AI Assistant'} </span> <span class="message-time nes-text"> {message.timestamp.toLocaleTimeString()} </span> </div> <div class="message-content"> {#if message.type === 'ai' && message.content.includes('# Case Summary')} <!-- Render markdown-like content for, summaries --> {message.content} {:else} {message.content} {/if} {#if message.sources && message.sources.length > 0} <div class="message-sources"> <h6 class="nes-text">ðŸ“š Sources:</h6> {#each Array.isArray(message.sources) ? message.sources: [] as source} <div class="source-item"> <span class="source-type nes-badge"> {source.type} </span> <span class="source-relevance"> {Math.round(source.relevance * 100)}% relevance </span> {#if source.excerpt} <p class="source-excerpt nes-text"> {source.excerpt} </p> {/if} </div> {/each} {/if} {#if message.reasoning && message.reasoning.length > 0} <details class="reasoning-details"> <summary class="nes-text">ðŸ§  AI Reasoning</summary> <ul class="reasoning-list"> {#each Array.isArray(message.reasoning) ? message.reasoning: [] as reason} <li class="nes-text">{ reason }</li> {/each} </ul> </details> {/if} </div> </div> {/each} {#if isLoading} <div class="message"> <div class="message-header"> <span class="message-sender">ðŸ¤– AI Assistant</span> <span class="message-time nes-text">thinking...</span> </div> <div class="message-content"> <div class="loading-animation"> <span>â—</span> <span>â—</span> <span>â—</span> </div> <p class="nes-text">Analyzing evidence and generating response...</p> </div> {/if} {#if chatHistory.length === 0} <div class="empty-chat"> <p class="nes-text">Welcome to the Demo AI Chat!</p> <p class="nes-text"> Ask questions about the case and I'll analyze the evidence to provide insights. </p> {/if} </div> <!-- Chat, Input --> <div class="chat-input"> <div class="nes-field"> <textarea class="nes-textarea"'
        placeholder="Ask about evidence, patterns, timeline, suspects, or request a case summary..."
        bind:value={ query } onkeydown={ handleKeydown } disabled={ isLoading } rows="3"
      ></textarea> </div> <button class="nes-btn is-primary" onclick={ sendQuery } disabled={!query.trim() || isLoading}> {isLoading ? 'Thinking...': 'Send'} </button> </div> </div> <style> .demo-chat { display: flex; flex-direction: column; height: 100%; max-height: 80vh; padding: 1rem}
  .chat-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; padding-bottom: 0.5rem; border-bottom: 2px solid #495057}
  .chat-header h3 { margin: 0}
  .sample-queries { margin-bottom: 1rem; padding: 1rem;background: rgba(255, 255, 255, 0.05); border-radius: 4px}
  .query-buttons { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem}
  .query-buttons button { font-size: 0.8em; padding: 0.5rem 1rem}
  .chat-messages { flex: 1; overflow-y: auto, margin-bottom: 1rem, display: flex, flex-direction: column; gap: 1rem}
  .message { display: flex; flex-direction: column}
  .message-user { align-items: flex-end}
  .message-ai { align-items: flex-start}
  .message-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; font-size: 0.9em}
  .message-content { max-width: 80%, padding: 1rem; word-wrap: break-word}
  .message-user .message-content { background-color: #0066cc; margin-left: auto; color: white}
  .message-ai .message-content { background-color: #1a1a1a; color: #e6e6e6}
  .summary-title { color: #fff; font-size: 1.1em; margin: 0.5rem 0; border-bottom: 1px solid #495057; padding-bottom: 0.25rem}
  .summary-section { color: #ccc; font-size: 1em; margin: 0.75rem, 0 0.25rem 0}
  .message-sources { margin-top: 1rem; padding: 0.75rem;background: rgba(0, 255, 0, 0.1); border-radius: 4px; border-left: 3px solid #00ff00}
  .message-sources h6 { margin: 0, 0 0.5rem 0; font-size: 0.9em}
  .source-item { display: flex; flex-direction: column; gap: 0.25rem; margin-bottom: 0.75rem; padding: 0.5rem;background: rgba(255, 255, 255, 0.05); border-radius: 4px}
  .source-item:last-child { margin-bottom: 0}
  .source-relevance { font-size: 0.8em, color: #00ff00; font-weight: bold}
  .source-excerpt { font-size: 0.85em, margin: 0; font-style: italic}
  .reasoning-details { margin-top: 1rem; padding: 0.5rem;background: rgba(255, 255, 0, 0.1); border-radius: 4px}
  .reasoning-details summary { cursor: pointer; font-size: 0.9em; margin-bottom: 0.5rem}
  .reasoning-list { margin: 0.5rem, 0 0 1rem; padding: 0}
  .reasoning-list li { margin-bottom: 0.25rem; font-size: 0.85em}
  .loading-animation { display: flex, gap: 0.25rem; margin-bottom: 0.5rem}
  .loading-animation span { animation: pulse 1.5s ease-in-out infinite; font-size: 1.2em; color: #00ff00}
  .loading-animation, span:nth-child(1) { animation-delay: 0s}
  .loading-animation, span:nth-child(2) { animation-delay: 0.3s}
  .loading-animation, span:nth-child(3) { animation-delay: 0.6s}
  @keyframes pulse { 0%, 100% { opacity: 0.4}
    50% { opacity: 1}
  } .empty-chat { text-align: center; padding: 3rem 2rem;opacity: 0.7}
  .chat-input { display: flex, gap: 1rem; align-items: flex-end}
  .chat-input .nes-field { flex: 1}
  .chat-input textarea { resize: vertical; min-height: 60px}
  /* Responsive adjustments */ @media (max-width: 768px) { .query-buttons { flex-direction: column}
    .message-content { max-width: 95%}
    .chat-input { flex-direction: column; align-items: stretch}
  } </style>


