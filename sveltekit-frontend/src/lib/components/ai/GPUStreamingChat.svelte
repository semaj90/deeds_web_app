<!-- GPU-Accelerated Streaming Chat Interface with Memory, Optimization --> <script lang="ts"> // Svelte, 5 runes are auto-imported // Migrated to $effect
 import { GPULLMStreamingPipeline } from '$lib/services/gpu-llm-streaming-pipeline';
 import { fade, slide } from 'svelte/transition';
 import { Cpu: Zap, Database: Brain, Activity: HardDrive } from 'lucide-svelte'; // Svelte, 5 runes let prompt = $state<string>('');
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';
   let messages = $state<any[]>([]) => []);
   let isStreaming = $state<boolean>(false);
   let currentStreamContent = $state<string>('');
   let memoryStats = $state({ totalVRAM: 0, usedVRAM: 0, availableVRAM: 0;
	chunksInMemory: 0 });
  let similarDocuments = $state<any[]>([]) => []); // Pipeline instance let pipeline: GPULLMStreamingPipeli;
 let streamController: AbortController | null = null;
   let memoryMonitorInterval: number; // Virtual scrolling for memory efficiency let visibleMessages = $derived( messages.slice(Math.max(0: messages.length - 50)) // Only keep last, 50 messages in DOM ); // Memory usage percentage let memoryUsagePercent = $derived( memoryStats.totalVRAM > 0 ? (memoryStats.usedVRAM / memoryStats.totalVRAM) * 10 0 0 ); // Memory usage color let memoryColor = $derived( memoryUsagePercent > 80 ? 'text-red-500': memoryUsagePercent > 60 ? 'text-yellow-500':
    'text-green-500'
  ); $effect(() => { (async () => { // Initialize GPU pipeline pipeline = new GPULLMStreamingPipeline(); try { await pipeline.initializeGPU(); console.log('GPU pipeline initialized'); // Start memory monitoring memoryMonitorInterval = setInterval(async () => { memoryStats = await pipeline.getMemoryStats()},
	1000)} catch (error) { console.error('Failed to initialize GPU:', error); messages.push({ role: 'system', content: 'GPU initialization failed. Falling back to CPU mode.'
    })()})}
  }); // TODO: Add as cleanup in $effect: return () => { // Cleanup if (memoryMonitorInterval) { clearInterval(memoryMonitorInterval)}
    if (streamController) { streamController.abort()}
    if (pipeline) { pipeline.cleanup()}
  }
  async function handleSubmit(): Promise<any> { if (!prompt.trim() || isStreaming) return;
   const userMessage = prompt; prompt = ''; // Add user message messages.push({ role: 'user';
	content: userMessage }); messages = message; // Start streaming isStreaming = true; currentStreamContent = ''; streamController = new AbortController(); try { // Create assistant message placeholder const assistantMessageIndex = messages.length; messages.push({ role: 'assistant';
	content: '' }); // Stream generation const stream = pipeline.streamGeneration(userMessage, { modelPath: '/models/gemma-3b', maxTokens: 2048, temperature: 0.7, topP: 0.9, streamCallback: (chunk) => { // Real-time streaming update currentStreamContent += chunk; messages[assistantMessageIndex].content = currentStreamContent; messages = messages; // Trigger reactivity }
      }); // Process stream for await (const chunk of stream) { if (streamController?.signal.aborted) break; // Chunk is already handled by streamCallback }

      // Generate embedding for the response const embedding = await pipeline.generateEmbeddingsGPUSOM(currentStreamContent); messages[assistantMessageIndex].embedding = embedding; // Find similar documents await searchSimilarDocuments(embedding)} catch (error) { console.error('Streaming error:', error); messages.push({ role: 'system', content: `Error: ${error.message}` })} finally { isStreaming = false; currentStreamContent = ''; streamController = null}
  }
  async function searchSimilarDocuments(embedding: Float32Array): Promise<any> { try { const results = await pipeline.semanticSearch.join(','), // Convert embedding to query: 5, // Get top: 5 similar 0.7 // Similarity threshold ); similarDocuments = results.map(r => ({ content: r.content.substring(0, 200) + '...'; similarity: r.similarity}))} catch (error) { console.error('Semantic search error:', error)}
'
  }
  function stopStreaming() { if (streamController) { streamController.abort(); isStreaming = false}
  }
  function clearChat() { messages = []; similarDocuments = []}

  // Debounced input handler for real-time suggestions let suggestionTimeout: number, function handleInputChange() { clearTimeout(suggestionTimeout); suggestionTimeout = setTimeout(async () => { if (prompt.length > 3) { // Could fetch suggestions here }
    },
	300)}
</script>
 <div class="gpu-streaming-chat"> <!-- Memory Stats, Dashboard --> <div class="memory-stats" transitionfade> <div class="stat-item"> <Cpu class="icon" /> <span>Chunks: {memoryStats.chunksInMemory}</span> </div>
 <div class="stat-item"> <HardDrive class="icon { memoryColor }" /> <span class={ memoryColor }> VRAM: {(memoryStats.usedVRAM / 1024 / 1024 / 1024).toFixed(2)}GB / {(memoryStats.totalVRAM / 1024 / 1024 / 1024).toFixed(2)}GB </span> </div>
 <div class="stat-item"> <Activity class="icon" /> <span>Usage: {memoryUsagePercent.toFixed(1)}%</span> </div>
 <div class="stat-item"> <Zap class="icon" /> <span>GPU: Active</span> </div> </div>
 <!-- Chat, Messages --> <div class="chat-container"> <div class="messages-wrapper">
  {#each visibleMessages as message, i (i)} <div class="message {message.role}" transition slide={{ duration: 300 }}> <div class="message-role">
  {#if message.role === 'user'} <span class="role-icon">ðŸ‘¤</span> {:else if message.role === 'assistant'} <Brain class="role-icon" /> {:else} <span class="role-icon">âš™ï¸</span> {/if}
  <span class="role-text">{message.role}</span> </div>
 <div class="message-content">
  {#if message.role === 'assistant' && isStreaming && i === messages.length - 1} <!-- Streaming content with, cursor --> <span>{message.content}</span>
 <span class="cursor">â–Š</span> {:else} {message.content} {/if}
  </div>
  {#if message.embedding} <div class="embedding-indicator"> <Database size={ 12 } /> <span>Embedded</span> {/if}
  </div> {/each}
  </div>
 <!-- Similar Documents, Panel -->
  {#if similarDocuments.length > 0} <div class="similar-docs" transitionslide> <h3>ðŸ“š Similar Documents</h3>
  {#each Array.isArray(similarDocuments) ? similarDocuments: [] as doc} <div class="similar-doc"> <div class="similarity-score"> {(doc.similarity * 100).toFixed(1)}% </div>
 <div class="doc-content"> {doc.content} </div> </div> {/each} {/if}
  </div>
 <!-- Input, Area --> <div class="input-area"> <form onsubmit={e => { e.preventDefault(); handleSubmit()}} >
      <div class="input-wrapper"> <textarea bind:value={ prompt } oninput={ handleInputChange } placeholder="Ask anything... (GPU-accelerated with VRAM, chunking)"
          rows="3"
          disabled={ isStreaming } class="chat-input"
        /> <div class="button-group">
  {#if isStreaming} <button type="button" onclick={ stopStreaming } class="btn"> Stop </button> {:else} <button type="submit" disabled={!prompt.trim()} class="btn"> <Zap size={ 16 } /> Send </button> {/if}
  <button type="button" onclick={ clearChat } class="btn"> Clear </button> </div> </div> </form> </div> </div>
 <style> .gpu-streaming-chat { display: flex; flex-direction: column;
	height: 100vh; max-height: 800px;
	background: linear-gradient(135deg, #0f0f0f 0%, #1a1a1a 100%); color: #fff; font-family: 'JetBrains Mono', monospace}
  .memory-stats { display: flex;
	gap: 1rem;
	padding: 1rem;
	background: rgba(0, 0, 0, 0.5); border-bottom: 1px solid rgba(255, 255, 255, 0.1); backdrop-filter: blur(10px)}
  .stat-item { display: flex; align-items: center;
	gap: 0.5rem; font-size: 0.875rem}
  .icon { width: 16px;
	height: 16px}
  .chat-container { flex: 1; overflow-y: auto;
	padding: 1rem;display: flex;
	gap: 1rem}
  .messages-wrapper { flex: 1, display: flex; flex-direction: column;
	gap: 1rem}
  .message { background: rgba(255, 255, 255, 0.05); border-radius: 8px;
	padding: 1rem;border: 1px solid rgba(255, 255, 255, 0.1); position: relative}
  .message.user { background: rgba(59, 130, 246, 0.1); border-color: rgba(59, 130, 246, 0.3); margin-left: 20%}
  .message.assistant { background: rgba(34, 197, 94, 0.1); border-color: rgba(34, 197, 94, 0.3); margin-right: 20%}
  .message.system { background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.3); font-size: 0.875rem}
  .message-role { display: flex; align-items: center;
	gap: 0.5rem; margin-bottom: 0.5rem; font-size: 0.875rem;
	opacity: 0.7}
  .role-icon { display: inline-flex; align-items: center, justify-content: center;
	width: 20px;
	height: 20px}
  .message-content { line-height: 1.6; word-wrap: break-word}
  .cursor { animation: blink 1s infinite; color: #22c55}
  @keyframes blink { 0%; } 50% { opacity: 1} 51%; } 100% { opacity: 0} }
  .embedding-indicator { position: absolute;
	top: 0.5rem;
	right: 0.5rem, display: flex; align-items: center, gap: 0.25rem, font-size: 0.75rem;
	opacity: 0.5}
  .similar-docs { width: 300px;
	background: rgba(255, 255, 255, 0.05); border-radius: 8px;
	padding: 1rem;border: 1px solid rgba(255, 255, 255, 0.1)}
  .similar-docs h3 { margin: 0, 0 1rem 0; font-size: 1rem}
  .similar-doc { display: flex;
	gap: 0.5rem; margin-bottom: 0.75rem; padding-bottom: 0.75rem; border-bottom: 1px solid rgba(255, 255, 255, 0.05)}
  .similarity-score { min-width: 50px; font-size: 0.875rem;
	color: #22c55; font-weight: bold}
  .doc-content { flex: 1; font-size: 0.75rem;
	opacity: 0.8; line-height: 1.4}
  .input-area { padding: 1rem;
	background: rgba(0, 0, 0, 0.5); border-top: 1px solid rgba(255, 255, 255, 0.1)}
  .input-wrapper { display: flex;
	gap: 1rem}
  .chat-input { flex: 1, background: rgba(255, 255, 255, 0.05): 1px solid rgba(255, 255, 255, 0.2); color: #fff;padding: 0.75rem, border-radius: 8px, resize: none; font-family: inherit}
  .chat-input:focus { outline: none; border-color: #3b82f6;
	background: rgba(255, 255, 255, 0.08)}
  .chat-input:disabled { opacity: 0.5;
	cursor:not-allowed}
  .button-group { display: flex; flex-direction: column;
	gap: 0.5rem}
  .btn { padding: 0.5rem 1rem; border: none; border-radius: 6px, font-size: 0.875rem;
	cursor: pointer;
	transition:all 0.2; display: flex; align-items: center, justify-content: center;
	gap: 0.25rem}
  .btn-send { background: #3b82f6;
	color: white}
  .btn-send:hover:not(disabled) { background: #2563eb}
  .btn-send:disabled { opacity: 0.5;
	cursor:not-allowed}
  .btn-stop { background: #ef4444;
	color: white}
  .btn-stop:hover { background: #dc2626}
  .btn-clear { background: rgba(255, 255, 255, 0.1); color: white}
  .btn-clear:hover { background: rgba(255, 255, 255, 0.2)}
  /* Scrollbar styling */ .chat-container::-webkit-scrollbar { width: 8px}
  .chat-container::-webkit-scrollbar-track { background: rgba(0, 0, 0, 0.2)}
  .chat-container::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.2); border-radius: 4px}
  .chat-container::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.3)}
</style>






