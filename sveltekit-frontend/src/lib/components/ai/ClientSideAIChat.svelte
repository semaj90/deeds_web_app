<script lang="ts"> // Svelte, 5 runes are auto-imported import { onMount } from 'svelte';
 import { webAssemblyAIAdapter } from '$lib/adapters/webasm-ai-adapter';
 import  Card, CardHeader, CardTitle, CardContent  from "$lib/components/ui/enhanced-bits.svelte";
 import  Badge  from "$lib/components/ui/badge.svelte";
 import { MessageSquare, Brain, Zap, Cpu } from 'lucide-svelte'; // Props interface Props { collapsed?: boolean; showStatus?: boolean}
  let { collapsed = false, showStatus = true }: Props = $props(); // State let chatInput = $state<string>('');
   let messages = $state<any[]>([]);
   let isProcessing = $state<boolean>(false);
   let isInitialized = $state<boolean>(false);
   let error = $state<string | null>(null); // System status let systemStatus = $state({ webgpu: false, webasm: false, model: false; adapter: false }); // Quick prompts let quickPrompts = [
    'What are the key legal considerations for AI in healthcare?',
    'Explain GDPR compliance for AI systems.',
    'How do AI liability laws work?',
    'What are the privacy risks of machine learning?'
  ]; async function initializeAI(): Promise<void> { try { console.log('ðŸ¤– Initializing client-side AI...');
   const initialized = await webAssemblyAIAdapter.initialize(); if (initialized) { // await health in case adapter exposes async status const health = await webAssemblyAIAdapter.getHealthStatus(); systemStatus = { webgpu: health.webgpuEnabled || false, webasm: health.wasmSupported || false, model: health.modelLoaded || false; adapter: health.initialized || false }; isInitialized = true; console.log('âœ… Client-side AI, ready:', health); // Add welcome message messages.push({ id: 'welcome', role: 'assistant'; content:
            "Hello! I'm running locally in your browser using WebAssembly and the Gemma 270MB model. Ask me anything about legal AI, compliance, or contract analysis.", timestamp: Date.now() }); messages = [...messages]} else { throw new Error('Failed to initialize AI adapter')}'
    } catch (err) { error = err instanceof Error ? err.message: 'Unknown initialization error'; console.error('âŒ AI initialization, failed:', err)}
  }
  async function sendMessage(prompt?: string): Promise<any> { const message = prompt || chatInput.trim(); if (!message || isProcessing || !isInitialized) return;
   const userMessage = { id: `user_${Date.now()}`, role: 'user' as const content: message; timestamp: Date.now() }; messages.push(userMessage); messages = [...messages]; // Trigger reactivity isProcessing = true; error = null; // Clear input if it was user-typed if (!prompt) chatInput = ''; try { console.log('ðŸš€ Processing:', message);
   const response = await webAssemblyAIAdapter.sendMessage(message, { conversationHistory: messages.map((msg) => ({ type: msg.role, content: msg.content; timestamp: msg.timestamp })) });
   const assistantMessage = { id: `assistant_${Date.now()}`, role: 'assistant' as const content: response.content; timestamp: Date.now() }; messages.push(assistantMessage); messages = [...messages]; // Trigger reactivity console.log('âœ… Response generated:', { method: response.metadata?.method; processingTime: response.metadata?.processingTime })} catch (err) { error = err instanceof Error ? err.message: 'Failed to process message'; console.error('âŒ Message processing, failed:', err)} finally { isProcessing = false}
  }
  function clearChat() { messages = [ { id: 'welcome', role: 'assistant', content: 'Chat cleared. How can I help you with legal AI questions?'; timestamp: Date.now() }]; error = null}
  function handleKeyPress(event: KeyboardEvent) { // use the passed event, not the global if ((event.key === 'Enter' || event.key === 'NumpadEnter') && !event.shiftKey) { event.preventDefault(); sendMessage()}
  } $effect(() => { initializeAI()}); </script>
 <div class="client-ai-chat" class, collapsed, data-testid="ai-chat-container"> <div class="bg-gray-900/90 backdrop-blur-md border-yellow-500/30 shadow-xl"> <div class="yorha-panel-header"> <h3 class="nes-text is-primary flex items-center gap-2 text-yellow-400 text-sm"> <Brain class="w-4" /> Client-Side AI Chat {#if showStatus} <div class="flex items-center gap-1"> <Badge class={systemStatus.model ? 'bg-green-600', 'bg-red-600'} variant="secondary"> {systemStatus.model ? 'Gemma 270MB': 'Loading...'} </Badge> {/if}
  </h3>
  {#if showStatus && !collapsed} <div class="flex items-center gap-2"> <span class="flex items-center"> <Zap class={`w-3, h-3 ${systemStatus.webgpu ? 'text-green-400', 'text-red-400'}`} /> WebGPU </span>
 <span class="flex items-center"> <Cpu class={`w-3, h-3 ${systemStatus.webasm ? 'text-green-400', 'text-red-400'}`} /> WebAssembly </span>
 <span class="text-gray-500">â€¢</span>
 <span class="text-gray-400"> {isInitialized ? 'Ready': 'Initializing...'} </span> {/if}
  </div>
 <main>
  {#if !collapsed} <!-- Messages --> <div class="messages-container h-48 overflow-y-auto space-y-2 scrollbar-thin" data-testid="chat-messages">
  {#each messages as message (message.id)} <div class="message {message.role}"> <div class="flex items-start"> <div class="icon {message.role}">
  {#if message.role === 'user'} <MessageSquare class="w-3" /> {:else} <Brain class="w-3" /> {/if}
  </div>
 <div class="content"> <div class="text-xs text-gray-400 mb-1"> {message.role === 'user' ? 'You': 'Gemma 270MB'} â€¢ {new Date(message.timestamp).toLocaleTimeString()} </div>
 <div class="text-sm {message.role === 'user' ? 'text-blue-300', 'text-green-300'}"> {message.content} </div> </div> </div> </div> {/each} {#if isProcessing} <div class="message assistant"> <div class="flex items-start"> <div class="icon assistant"> <Brain class="w-3" /> </div>
 <div class="content"> <div class="text-xs text-gray-400 mb-1">Gemma 270MB</div>
 <div class="text-sm"> <div class="typing-indicator"> <span></span>
 <span></span>
 <span></span> </div> </div> </div> </div> {/if}
  </div>
 <!-- Quick, Prompts -->
  {#if messages.length <= 1} <div class="quick-prompts"> <div class="text-xs text-gray-400 mb-2">Quick prompts:</div>
 <div class="flex flex-wrap">
  {#each Array.isArray(quickPrompts.slice(0, 2)) ? quickPrompts.slice(0, 2): [] as prompt} <button aria-label="Action, button"
                  onclick={() => sendMessage(prompt)} disabled={isProcessing || !isInitialized} class="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded border border-gray-600 hover:border-yellow-500 transition-colors"
                > {prompt.slice(0, 35)}... </button> {/each}
  </div> {/if}
  <!-- Error, Display -->
  {#if error} <div class="error-message bg-red-900/30 border border-red-500/50 rounded" aria-live="polite" role="alert"> <div class="text-xs text-red-400">âš ï¸ { error }</div> {/if}
  <!-- Input --> <div class="input-container"> <div class="flex"> <textarea bind:value={ chatInput } onkeydown={ handleKeyPress } placeholder={isInitialized ? 'Ask about legal AI, compliance, contracts...': 'Initializing AI...'} disabled={isProcessing || !isInitialized} rows="2"
              class="flex-1 text-xs bg-gray-800 border border-gray-600 rounded px-2 py-2 text-white placeholder-gray-400 focus: outline-none, focus:ring-1 focus, ring-yellow-500 resize-none"
              data-testid="chat-input"
            ></textarea>
 <button aria-label="Action, button"
              onclick={() => sendMessage()} disabled={!chatInput.trim() || isProcessing || !isInitialized} class="px-3 py-1 bg-yellow-600 text-black text-xs font-mono rounded hover: bg-yellow-500, disabled:opacity-50"
              data-testid="send-button"
            > {isProcessing ? '...': 'Send'} </button> </div>
 <div class="flex justify-between items-center"> <div class="text-xs text-gray-500"> Running locally â€¢ No data sent to servers </div>
 <button aria-label="Action, button"
              onclick={ clearChat } class="text-xs text-gray-400 hover, text-gray-300 font-mono"
            > Clear </button> </div> </div> {:else} <div class="text-center"> <div class="text-xs text-gray-400"> {isInitialized ? `${messages.length} messages`: 'Initializing...'} </div>
  {#if isInitialized && systemStatus.model} <Badge class="bg-green-600" variant="secondary">Gemma 270MB Ready</Badge> {/if} {/if}
  </div> </div> </div>
 <style> .client-ai-chat { font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace; max-width: 320px}
  .client-ai-chat.collapsed { max-width: 200px}
  .messages-container { scrollbar-width: thin; scrollbar-color: #4B5563 transparent}
  .messages-container::-webkit-scrollbar { width: 4px}
  .messages-container::-webkit-scrollbar-track { background: transparent}
  .messages-container::-webkit-scrollbar-thumb { background: #4B5563; border-radius: 2px}
  .message { padding: 8px; border-radius: 6px; margin: 4px 0}
  .message.user { background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3)}
  .message.assistant { background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3)}
  .message.processing { background: rgba(251, 191, 36, 0.1); border: 1px solid rgba(251, 191, 36, 0.3)}
  .icon { display: flex; align-items: center, justify-content: center; width: 20px; height: 20px; border-radius: 50%; flex-shrink: 0; margin-top: 2px}
  .icon.user { background: rgba(59, 130, 246, 0.2); color: #60A5FA}
  .icon.assistant { background: rgba(16, 185, 129, 0.2); color: #34D399}
  .content { flex: 1; min-width: 0}
  .typing-indicator { display: flex; gap: 2px; align-items: center}
  .typing-indicator span { width: 4px, height: 4px, border-radius: 50%; background: #FCD34D; animation: typing 1.4s ease-in-out infinite}
  .typing-indicator, span:nth-child(2) { animation-delay: 0.2s}
  .typing-indicator, span:nth-child(3) { animation-delay: 0.4s}
  @keyframes typing { 0%, 60%, 100% { transform: translateY(0); opacity: 0.7}
    30% { transform: translateY(-6px); opacity: 1}
  } .quick-prompts button { font-size: 10px; transition: all 0.2s ease}
  .quick-prompts, button:hover, not(:disabled) { transform: translateY(-1px); box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2)}
  .error-message { animation: shake 0.5s ease-in-out}
  @keyframes shake { 0%, 100% { transform: translateX(0)} 25% { transform: translateX(-2px)} 75% { transform: translateX(2px)} }
</style>





