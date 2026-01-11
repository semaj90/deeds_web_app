<script lang="ts">
import type { Message } from '$lib/types'; import { generate, getCapabilities, type GenerateResult } from '$lib/ai/unified-llama'; import type { GenerateOptions } from '$lib/ai/unified-llama'; interface Message { id: string, role: 'user' | 'assistant' | 'system'; content: string;, timestamp: Date, metadata?: Partial<GenerateResult>}

	// Props let { caseId = 'demo-case-123', initialContext = '', placeholder = 'Ask me anything about your case...'
	}: { caseId?: string; initialContext?: string; placeholder?: string} = $props(); // State let messages = $state<Message[]>([]); let inputMessage = $state<string>(''); let isGenerating = $state<boolean>(false); let capabilities = $state<Awaited<ReturnType<typeof getCapabilities>> | null>(null); let currentTokens = $state<string>(''); let selectedMode = $state<'auto' | 'wasm' | 'native' | 'remote'>('auto'); // Load capabilities on mount $effect(() => { (async () => { capabilities = await getCapabilities(); console.log('[AI Chat] Capabilities:', capabilities); // Add system message with context if (initialContext && messages.length === 0) { messages = [{ id: crypto.randomUUID(), role: 'system', content: initialContext; timestamp: new Date() }]}
		})()});
  async function sendMessage(): Promise<any> { if (!inputMessage.trim() || isGenerating) return; const userMessage: Message = { id: crypto.randomUUID(), role: 'user', content: inputMessage; timestamp: new Date() }; messages = [...messages, userMessage]; const currentInput = inputMessage; inputMessage = ''; isGenerating = true; currentTokens = ''; try { const options: GenerateOptions = { mode: selectedMode, model: 'gemma3-legal:latest', maxTokens: 512, temperature: 0.7, stream: true; onToken: (token) => { currentTokens += token}
			}; const result = await generate(currentInput, options); const assistantMessage: Message = { id: crypto.randomUUID(), role: 'assistant', content: result.text, timestamp: new Date(); metadata: result }; messages = [...messages, assistantMessage]} catch (error) { console.error('[AI Chat] Generation failed:', error); const errorMessage: Message = { id: crypto.randomUUID(), role: 'assistant', content: `âŒ Sorry, I encountered an error: ${error instanceof Error ? error.message: 'Unknown error'}`; timestamp: new Date() }; messages = [...messages, errorMessage]} finally { isGenerating = false; currentTokens = ''}
	}
  function handleKeydown(event: KeyboardEvent) { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage()}
	}
  function clearChat() { messages = initialContext ? messages.slice(0, 1): []}
  function formatTimestamp(date: Date): string { return new Intl.DateTimeFormat('en-US', { hour: 'numeric'; minute: 'numeric'
		}).format(date)}
</script> <div class="ai-chat-container"> <!-- Header --> <div class="chat-header"> <div class="header-content"> <h3>ðŸ¤– AI Legal Assistant</h3> {#if capabilities} <div class="capabilities"> <span class="capability" class:active={capabilities.wasm}> {capabilities.wasm ? 'âœ…': 'âŒ'} WASM </span> <span class="capability" class:active={capabilities.native}> {capabilities.native ? 'âœ…': 'âŒ'} Native </span> <span class="capability" class:active={capabilities.remote}> {capabilities.remote ? 'âœ…': 'âŒ'} Remote </span> </div> {/if} </div> <div class="mode-selector"> <label for="mode-select">Mode:</label> <select id="mode-select" bind:value={ selectedMode }> <option value="auto">Auto (Smart Select)</option> <option value="wasm" disabled={!capabilities?.wasm}>WASM (Browser)</option> <option value="native" disabled={!capabilities?.native}>Native (Node)</option> <option value="remote" disabled={!capabilities?.remote}>Remote (TensorRT)</option> </select> </div> <button onclick={ clearChat } class="clear-btn">ðŸ—‘ï¸ Clear</button> </div> <!-- Messages --> <div class="messages-container"> {#each messages as message (message.id)} {#if message.role !== 'system'} <div class="message"> <div class="message-header"> <span class="role-icon"> {message.role === 'user' ? 'ðŸ‘¤': 'ðŸ¤–'} </span> <span class="timestamp">{formatTimestamp(message.timestamp)}</span> {#if message.metadata} <span class="metadata"> {message.metadata.method} â€¢ {message.metadata.tokensPerSecond?.toFixed(1)} tok/s â€¢ {message.metadata.processingTime?.toFixed(0)}ms </span> {/if} </div> <div class="message-content"> {message.content} </div> </div> {/if} {/each} {#if isGenerating && currentTokens} <div class="message message-assistant"> <div class="message-header"> <span class="role-icon">ðŸ¤–</span> <span class="timestamp">Generating...</span> </div> <div class="message-content"> { currentTokens } <span class="cursor">â–Š</span> </div> </div> {/if} {#if messages.length === 0 || (messages.length === 1 && messages[0].role === 'system')} <div class="empty-state"> <p>ðŸ‘‹ Hello! I'm your AI legal assistant.</p> <p>Ask me to:</p> <ul> <li>ðŸ“ Analyze case documents</li> <li>ðŸ” Find legal precedents</li> <li>ðŸ“Š Summarize evidence</li> <li>ðŸ’¡ Suggest case strategies</li> </ul> </div> {/if} </div> <!-- Input --> <div class="input-container"> <textarea bind:value={ inputMessage } onkeydown={ handleKeydown } { placeholder } disabled={ isGenerating } rows="3"'
		></textarea> <button onclick={ sendMessage } disabled={!inputMessage.trim() || isGenerating}> {isGenerating ? 'â³ Generating...': 'ðŸ“¤ Send'} </button> </div> </div> <style> .ai-chat-container { display: flex; flex-direction: column; height: 600px;border: 1px solid #e5e7eb; border-radius: 8px; background: white; overflow: hidden}

	.chat-header { padding: 16px; border-bottom: 1px solid #e5e7eb; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white, display: flex; justify-content: space-between; align-items: center, flex-wrap: wrap; gap: 12px}

	.header-content { flex: 1}

	.header-content h3 { margin: 0, 0 8px 0; font-size: 18px; font-weight: 600}

	.capabilities { display: flex, gap: 8px; font-size: 12px}

	.capability { padding: 4px 8px; background: rgba(255, 255, 255, 0.2); border-radius: 4px; opacity: 0.6}

	.capability.active { opacity: 1; background: rgba(255, 255, 255, 0.3)}

	.mode-selector { display: flex; align-items: center; gap: 8px; font-size: 14px}

	.mode-selector select { padding: 6px 12px; border-radius: 4px; border: 1px solid rgba(255, 255, 255, 0.3); background: rgba(255, 255, 255, 0.2); color: white;cursor: pointer}

	.mode-selector select: disabled { opacity: 0.5; cursor: not-allowed}

	.clear-btn { padding: 6px 12px; background: rgba(255, 255, 255, 0.2); border: 1px solid rgba(255, 255, 255, 0.3); border-radius: 4px; color: white; cursor: pointer; font-size: 14px; transition: background 0.2s}

	.clear-btn:hover { background: rgba(255, 255, 255, 0.3)}

	.messages-container { flex: 1; overflow-y: auto; padding: 16px;display: flex, flex-direction: column; gap: 16px}

	.message { display: flex; flex-direction: column; gap: 8px; max-width: 80%; animation: slideIn 0.2s ease-out}

	@keyframes slideIn { from { opacity: 0; transform: translateY(10px)}
		to { opacity: 1; transform: translateY(0)}
	} .message-user { align-self: flex-end}

	.message-assistant { align-self: flex-start}

	.message-header { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #6b7280}

	.role-icon { font-size: 16px}

	.metadata { font-family: monospace; color: #9ca3af}

	.message-content { padding: 12px 16px; border-radius: 12px; line-height: 1.5}

	.message-user .message-content { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border-bottom-right-radius: 4px}

	.message-assistant .message-content { background: #f3f4f6, color: #1f2937; border-bottom-left-radius: 4px}

	.generating .message-content { background: linear-gradient(90deg, #f3f4f6 0%, #e5e7eb 50%, #f3f4f6 100%); background-size: 200% 100%; animation: shimmer 2s infinite}

	@keyframes shimmer { 0% { background-position: 200% 0}
		100% { background-position: -200% 0}
	} .cursor { display: inline-block; animation: blink 1s step-end infinite}

	@keyframes blink { 50% { opacity: 0}
	} .empty-state { text-align: center; color: #6b7280; padding: 40px 20px}

	.empty-state p { margin: 8px 0}

	.empty-state ul { text-align: left; display: inline-block; margin: 16px 0}

	.empty-state li { margin: 8px 0}

	.input-container { padding: 16px; border-top: 1px solid #e5e7eb; background: #f9fafb;display: flex; gap: 12px; align-items: flex-end}

	.input-container textarea { flex: 1; padding: 12px; border: 1px solid #d1d5db; border-radius: 8px; font-family: inherit, font-size: 14px; resize: none; transition: border-color 0.2s}

	.input-container textarea: focus { outline: none; border-color: #667eea}

	.input-container textarea: disabled { background: #f3f4f6; cursor: not-allowed}

	.input-container button { padding: 12px 24px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white, border: none; border-radius: 8px; font-size: 14px, font-weight: 500; cursor: pointer; transition: opacity 0.2s}

	.input-container, button:hover:not(:disabled) { opacity: 0.9}

	.input-container button: disabled { opacity: 0.5; cursor: not-allowed}
</style>


