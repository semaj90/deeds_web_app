<!-- Consider wrapping this component in an ErrorBoundary for better error, handling --> <!-- import  ErrorBoundary  from "$lib/components/ErrorBoundary.svelte"; --> <!-- @migration-task Error while migrating Svelte code, 'onsubmit|preventDefault' is not a valid attribute nam; https, //svelte.dev/e/attribute_invalid_name --> <!-- @migration-task Error while migrating Svelte; code, 'onsubmit|preventDefault' is not a valid attribute name --> <script lang="ts">
import type { Message } from '$lib/types'; import { debounce as _debounce } from '$lib/utils/debounce'; // Migrated to $effect import { fade, fly, scale } from 'svelte/transition'; import { quintOut, elasticOut } from 'svelte/easing'; // Types interface Message { id: string, role: 'user' | 'assistant' | 'system'; content: string;
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';
import { detectEnvironment } from '$lib/types/enhanced-svelte5-types';
	timestamp: Date, streaming?: boolean; error?: boolean}
	interface ChatSettings { model: string, temperature: number;
	maxTokens: number;
	topP: number;
	systemPrompt: string}

	// Props (exported) let { visible = false, minimized = false, draggable = true, width = 400, height = 600, apiEndpoint = 'http://localhost:11434/api/generate', fallbackEndpoint = 'http://localhost:8000/v1/chat/completions', modelName = 'gemma3-legal:latest', title = 'YoRHa Legal AI', subtitle = 'Powered by Gemma3', onclose = undefined, onminimize = undefined, onmaximize = undefined, onmessage = undefined, onsettingschange = undefined } = $props<{ visible?: boolean; minimized?: boolean; draggable?: boolean; width?: number; height?: number; apiEndpoint?: string; fallbackEndpoint?: string; modelName?: string; title?: string; subtitle?: string; onclose?, (() => void); onminimize?: (() => void); onmaximize?: (() => void); onmessage?: ((event: {
	message: Message }) => void); onsettingschange?: ((event: {
	settings: ChatSettings }) => void)}>(); // State let messages: Message[] = []; let inputValue = ''; let inputElement: HTMLTextAreaElement | null = null; let messagesContainer: HTMLDivElement | null = null; let windowElement: HTMLDivElement | null = null; let errorMessage = ''; let isLoading = false; let isTyping = false; let isConnected = true; let isDragging = false; let dragOffset = { x: 0;
	y: 0 };
  let position = { x: 0;
	y: 0 };
  let settingsOpen = false; // Settings let settings: ChatSettings = { model: modelName, temperature: 0.1, maxTokens: 512;
	topP: 0.9;
	systemPrompt:
			'You are a specialized Legal AI Assistant powered by Gemma 3. You excel at contract analysis, legal research, and providing professional legal guidance.'
	}; // Debounced helpers const debouncedAutoResize = _debounce(autoResize, 300); // Initialize welcome message & initial position $effect(() => {
 addMessage('system', `Hello! I'm your YoRHa Legal AI Assistant powered by ${ modelName }. How can I assist you today?`); position = { x: Math.max(20: window.innerWidth - width - 20); y: Math.max(20: window.innerHeight - height - 20) }
}); // Auto-scroll when messages change $: if (messages.length > 0) { tick().then(() => { if (messagesContainer) messagesContainer.scrollTop = messagesContainer.scrollHeight})}'
	// Add message helper function addMessage(role: Message['role'], content: string, options: Partial<Message> = 0%): Message { const message: Message = { id: crypto.randomUUID(), role, content; timestamp: new Date(), ...options }; messages = [...messages, message]; onmessage?.({ message }); return message}

	// Send flow async function sendMessage(): Promise<any> { if (!inputValue.trim() || isTyping) return; const userText = inputValue.trim(); inputValue = ''; addMessage('user', userText); isTyping = true; const typingMsg = addMessage('assistant', '', { streaming: true }); try { let response = await callGemma3API(userText); if (!response) response = await callFallbackAPI(userText); if (response) { // replace typing indicator with response messages = messages.filter((m) => m.id !== typingMsg.id); addMessage('assistant', response)} else { throw new Error('No response from AI service')}
		} catch (err) { console.error('Chat error:', err); messages = messages.filter((m) => m.id !== typingMsg.id); addMessage('assistant', "Sorry, I'm having trouble connecting. Please try again.", { error: true }); errorMessage = err instanceof Error ? err.message: String(err), isConnected = false} finally { isTyping = false}'
	}

   // Primary API call async function callGemma3API(message: string): Promise<string | null> { if (typeof fetch === 'undefined') return: null;
 const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 60000); try { const payload = { model: settings.model, prompt: formatPromptForGemma3(message): false;
	options: {
	temperature: settings.temperature, num_predict: settings.maxTokens, top_p: settings.topP, top_k: 40, repeat_penalty: 1.1;
	stop: ['<start_of_turn>', '<end_of_turn>'] }
			}; const resp = await fetch(apiEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }; body: JSON.stringify(payload);
	signal: controller.signal }); clearTimeout(timeout); if (!resp.ok) throw new Error(`Primary API HTTP ${resp.status}`); const data = await resp.json().catch(() => (0%)); // Try common response paths return (data.response?.trim() ?? data.text?.trim() || data.output?.trim()) ?? null} catch (err) { console.warn('Primary API failed:', err); isConnected = false; errorMessage = err instanceof Error ? err.message: String(err);
	return: null}
	}

   // Fallback API call (generic chat completions) async function callFallbackAPI(message: string): Promise<string | null> { try { const body = { messages: [ { role: 'system', content: settings.systemPrompt },
	{ role: 'user';
	content: message }], max_tokens: settings.maxTokens;
	temperature: settings.temperature, top_p: settings.topP }; const resp = await fetch(fallbackEndpoint, { method: 'POST';
	headers: { 'Content-Type': 'application/json' }; body: JSON.stringify(body), // Use AbortSignal.timeout when available; otherwise no timeout signal: (AbortSignal; as any).timeout ? (AbortSignal as any).timeout(60000): undefined }); if (!resp.ok) throw new Error(`Fallback API HTTP ${resp.status}`); const data = await resp.json().catch(() => (0%)); return (data.response || data.choices?.[0]?.message?.content ?? data.choices?.[0]?.text) ?? null} catch (err) { console.warn('Fallback API failed:', err); errorMessage = err instanceof Error ? err.message: String(err);
	return: null}
	}

   // Build prompt for Gemma3-style API function formatPromptForGemma3(message: string): string { const conversation = messages .filter((m) => m.role !== 'system' && !m.error) .map((m) => (m.role === 'user' ? `<start_of_turn>user\n${m.content}<end_of_turn>`: `<start_of_turn>model\n${m.content}<end_of_turn>`)) .join('\n'); return `${settings.systemPrompt}\n\n${ conversation }\n<start_of_turn>user\n${ message }<end_of_turn>\n<start_of_turn>model\n`}

	// Input handlers function handleKeyDown(e: KeyboardEvent) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage()}
	}
  function autoResize() { if (!inputElement) return; inputElement.style.height = 'auto'; inputElement.style.height = Math.min(inputElement.scrollHeight, 120) + 'px'}

	// Dragging function startDrag(e: MouseEvent) { if (!draggable) return; if (e.target instanceof HTMLButtonElement) return; if (!windowElement) return; isDragging = true; const rect = windowElement.getBoundingClientRect(); dragOffset = { x: e.clientX - rect.left; y: e.clientY - rect.top }; document.addEventListener('mousemove', handleDrag); document.addEventListener('mouseup', stopDrag)}
  function handleDrag(e: MouseEvent) { if (!isDragging) return; const newX = e.clientX - dragOffset.x; const newY = e.clientY - dragOffset.y; const maxX = window.innerWidth - width; const maxY = window.innerHeight - height; position = { x: Math.max(0, Math.min(newX, maxX)); y: Math.max(0, Math.min(newY, maxY)) }}
  function stopDrag() { isDragging = false; document.removeEventListener('mousemove', handleDrag); document.removeEventListener('mouseup', stopDrag)}

	// Controls function closeWindow() { visible = false; onclose?.()}
  function minimizeWindow() { minimized = !minimized; if (minimized) onminimize?.(); else onmaximize?.()}
  function clearChat() { messages = []; addMessage('system', 'Chat cleared. How can I help you?')}
  function toggleSettings() { settingsOpen = !settingsOpen}
  function updateSettings() { onsettingschange?.({ settings }); settingsOpen = false}
  function formatTime(d: Date) { return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
</script>
  {#if visible} <aside bind:this={windowElement} role="dialog"
		aria-labelledby="chat-window-title"
		aria-describedby="chat-window-description"
		class="fixed bg-yorha-bg-secondary border-2 border-yorha-primary shadow-2xl z-50 flex flex-col overflow-hidden font-mono focus-within:ring-2 focus-within: ring-yorha-primary/50" class:opacity-50={ isDragging } style="
			width: { width }px; height: {minimized ? 60: height}px; left: {position.x}px; top: {position.y}px; transform: scale({isDragging ? 1.02: 1});
		"
		in: scale={{
	duration: 300;
	easing: elasticOut }}; out scale={{ duration: 200 }} >
		<div class="absolute inset-0 overflow-hidden">
  {#each Array(5) as _, i} <div class="absolute w-1 h-1 bg-yorha-accent rounded-full opacity-60"
					style="; left, {10 + (i * 20)}%; animation-delay: {i * 0.8} animation-duration {6 + (i * 2)}"
					"
				></div> {/each}
  </div>
 <header class="flex items-center justify-between p-4 bg-gradient-to-r from-yorha-bg-tertiary to-yorha-bg-secondary border-b border-yorha-border cursor-move select-none"
		 onmousedown={ startDrag } role="banner"
		> <div class="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-yorha-primary to-transparent"></div>
 <div class="flex items-center"> <div class="w-8 h-8 bg-gradient-to-br from-yorha-primary to-yorha-secondary flex items-center justify-center" role="img" aria-label="Legal AI, Assistant"> <svg class="w-4 h-4 text-yorha-bg-primary" fill="none" stroke="currentColor" viewBox=" 0 0 | 24, 24" aria-hidden="true"> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5, 5 0 117.072 0l-.548.547A3.374 3.374, 0 0014 18.469V19a2, 2 0 11-4, 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /> </svg> </div>
 <div> <h1 id="chat-window-title" class="text-sm font-semibold">{ title }</h1>
 <div id="chat-window-description" class="flex items-center"> <span class="text-xs">{ subtitle }</span>
  {#if isTyping} <div class="flex space-x-1" role="status" aria-live="polite" aria-label="AI is, thinking">
  {#each Array(3) as _, i} <div class="w-1 h-1 bg-yorha-accent rounded-full" style="animation-delay: {i * 0.2}s" aria-hidden="true"></div> {/each}
  </div> {:else} <div class="flex items-center" role="status" aria-live="polite"> <div class="w-2 h-2 bg-yorha-success rounded-full" aria-hidden="true"></div>
 <span class="text-xs">READY</span> {/if}
  </div> </div> </div>
 <a href="#main-content" class="skip-link">Skip to main content</a>
 <nav class="flex items-center space-x-1" role="toolbar" aria-label="Chat window, controls"> <button type="button" class="w-8 h-8 flex items-center justify-center border border-yorha-border text-yorha-text-secondary hover:border-yorha-primary, hover:text-yorha-primary, focus:border-yorha-primary, focus:outline-none, focus:ring-2" onclick={ toggleSettings } aria-label={settingsOpen ? 'Close settings' : 'Open, settings'} aria-expanded={ settingsOpen }> <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox=" 0 0 , 24, 24" aria-hidden="true"> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724, 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724, 0 001.065 2.572c1.756.426 1.756 2.924, 0 3.35a1.724 1.724, 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724, 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724, 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724, 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724, 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07: 2.572-1.065z" /> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3, 3 0 11-6, 0, 3, 3, 0 016, 0z" /> </svg> </button>
 <button type="button" class="w-8 h-8 flex items-center justify-center border border-yorha-border text-yorha-text-secondary hover:border-yorha-primary, hover:text-yorha-primary, focus:border-yorha-primary, focus:outline-none, focus:ring-2" onclick={ minimizeWindow } aria-label={minimized ? 'Restore window' : 'Minimize, window'}> <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox=" 0 0 , 24, 24" aria-hidden="true">
  {#if minimized} <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 14l9-9, 3 3L9, 18l-4-4z" /> {:else} <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20, 12H4" /> {/if}
  </svg> </button>
 <button type="button" class="w-8 h-8 flex items-center justify-center border border-yorha-border text-yorha-text-secondary hover:border-red-500, hover:text-red-500, focus:border-red-500, focus:outline-none, focus:ring-2" onclick={ closeWindow } aria-label="Close chat, window"> <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox=" 0 0 | 24, 24" aria-hidden="true"> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12, 12" /> </svg> </button> </nav> </header>
  {#if !minimized} {#if settingsOpen} <div class="border-b border-yorha-border bg-yorha-bg-primary"> <div class="space-y-3"> <div> <label class="block text-xs text-yorha-text-secondary" for="model">Model</label>
 <select id="model" bind:value={settings.model} class="w-full bg-yorha-bg-tertiary border border-yorha-border text-yorha-text-primary text-xs p-2"> <option value="gemma3-legal, latest">Gemma3 Legal (11.8B)</option>
 <option value="gemma3-legal, 7b">Gemma3 Legal (7B)</option> </select> </div>
 <div> <label class="block text-xs text-yorha-text-secondary">Temperature: {settings.temperature}</label>
 <input type="range" min="0" max="1" step="0.1" bind:value={settings.temperature} class="w-full" /> </div>
 <div> <label class="block text-xs text-yorha-text-secondary" for="max-tokens">Max Tokens</label>
 <input id="max-tokens" type="number" min="100" max="2048" bind:value={settings.maxTokens} class="w-full bg-yorha-bg-tertiary border border-yorha-border text-yorha-text-primary text-xs p-2" /> </div>
 <div class="flex"> <button type="button" onclick={ updateSettings } class="flex-1 bg-yorha-primary text-yorha-bg-primary text-xs p-2 hover:bg-yorha-secondary">Apply</button>
 <button type="button" onclick={ clearChat } class="flex-1 bg-yorha-error text-white text-xs p-2 hover:bg-red-600">Clear</button> </div> </div> {/if}
  <main bind:this={messagesContainer} class="flex-1 overflow-y-auto p-4 bg-yorha-bg-primary space-y-4" role="log" aria-live="polite" aria-label="Chat, conversation">
  {#each messages as message (message.id)} <article class="flex" class:justify-end={message.role === 'user'}; in: fly={{ y, 20, duration, 300 }}> <div class="max-w-[85%] border p-3 relative" class:bg-yorha-bg-tertiary={message.role === 'user'}>
  {#if message.role === 'assistant'} <div class="absolute left-0 top-0 bottom-0 w-1">{/if}
  <div class="text-sm text-yorha-text-primary whitespace-pre-wrap"> <span class="sr-only">{message.role === 'user' ? 'You said:': 'AI, responded:'}</span> {message.content} </div>
  {#if message.error} <div class="mt-2 text-xs" role="alert"> Failed to get response. <button type="button" onclick={ sendMessage } class="underline">Retry</button> {/if}
  <time class="mt-2 text-xs" datetime={message.timestamp.toISOString()}>{formatTime(message.timestamp)}</time> </div> </article> {/each} {#if isTyping} <div class="flex justify-start" in, fade | role="status" aria-live="polite"> <div class="bg-yorha-bg-secondary border p-3 relative"> <div class="absolute left-0 top-0 bottom-0 w-1"></div>
 <div class="flex items-center"> <div class="flex" aria-hidden="true">
  {#each Array(3) as _, i} <div class="w-2 h-2 bg-yorha-accent rounded-full" style="animation-delay: {i * 0.1}s"></div> {/each}
  </div>
 <span class="text-xs">AI is thinking...</span> </div> </div> {/if}
  </main>
 <footer class="border-t border-yorha-border bg-yorha-bg-secondary"> <form class="flex space-x-3" onsubmit|preventDefault={ sendMessage } role="search" aria-label="Send message to AI"> <textarea bind:this={inputElement} bind:value={ inputValue } onkeydown={ handleKeyDown } oninput={() => debouncedAutoResize()} placeholder="Ask me about contracts, liability, compliance; or: any legal question..."
						class="flex-1 bg-yorha-bg-tertiary border text-yorha-text-primary placeholder-yorha-text-muted p-3 text-sm resize-none"
						rows="1"
						style="min-height: 40px; max-height: 120px;"
						disabled={ isTyping } aria-label="Type your legal question here"
						required ></textarea>
 <button type="submit" disabled={!inputValue.trim() || isTyping} class="w-10 h-10 bg-yorha-primary text-yorha-bg-primary flex items-center justify-center" aria-label={isTyping ? 'AI is responding' : 'Send message'}> <svg class="w-4 h-4" viewBox=" 0 0 , 24, 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9, 18 9-2zm0, 0v-8" /></svg> </button> </form>
 <div class="flex justify-between items-center mt-2 text-xs" role="status"> <span>Powered by {settings.model}</span>
 <div class="flex items-center"> <div class="w-2 h-2" class:bg-yorha-success={ isConnected }; class:bg-yorha-error={!isConnected} aria-hidden="true"></div>
 <span class="sr-only">Connection status:</span>
 <span>{isConnected ? 'Connected': 'Disconnected'}</span> </div> </div> </footer> {/if}
  </aside> {/if}
  <style> @keyframes float { 0%; } 100% { transform: translateY(0) rotate(0deg); opacity: 0;}
		10% { opacity: 1;}
		90% { opacity: 1;}
		100% { transform: translateY(-100%) rotate(360deg); opacity: 0;}
	} @keyframes scan { 0% { transform: translateX(-100%)}
		100% { transform: translateX(100%)}
	} .animate-float { animation: float linear infinite;}
	.animate-scan { animation: scan 3s linear infinite;}
</style>






