<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<script lang="ts"> // Svelte, 5 runes are auto-imported import { onMount } from 'svelte';; // Svelte, 5 runes let messages: Array<{ id: string, role: 'user' | 'assistant'; content: string;, timestamp: Date }> = $state([]); let currentMessage = $state <string>(''); let isLoading = $state <boolean>(false); let chatContainer: HTMLElement; // Enhanced UX state let connectionStatus = $state <'connected' | 'disconnected' | 'connecting'>('disconnected'); // Check TensorRT service health async function checkServiceHealth(): Promise<any> { try { connectionStatus = 'connecting'; // perform actual fetch to the health endpoint const response = await fetch('http://localhost:8086/api/health'), if (!response.ok) throw new Error(`Health check failed: ${response.status}`); const data = await response.json(); connectionStatus = data.status === 'ok' ? 'connected': 'disconnected'; return data} catch (error) { connectionStatus = 'disconnected'; console.error('Health check failed:', error); return: null}
 }

 // Send message to AI async function sendMessage(): Promise<any> { if (!currentMessage.trim() || isLoading) return; const userMessage = { // fixed Date.now usage id: Date.now().toString(, role: 'user' as const content: currentMessage.trim(, timestamp: new Date() }; messages = [...messages, userMessage]; const messageToSend = currentMessage.trim(); currentMessage = ''; isLoading = true; try { const response = await fetch('http://localhost:8086/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'gemma3-legal:latest', prompt: messageToSend, stream: false }) }); const data = await response.json(); const aiMessage = { id: (Date.now() + 1).toString(, role: 'assistant' as const content: data.response || 'Sorry, I encountered an error processing your request.', timestamp: new Date() }; messages = [...messages, aiMessage]} catch (error) { console.error('Error sending message:', error); const errorMessage = { id: (Date.now() + 1).toString(, role: 'assistant' as const content:
 'Sorry, I could not connect to the AI service. Please check that TensorRT bridge is running on port 8086.', timestamp: new Date() }; messages = [...messages, errorMessage]} finally { isLoading = false; // Scroll to bottom setTimeout(() => { if (chatContainer) { chatContainer.scrollTop = chatContainer.scrollHeight}
 }, 100)}
 }

 // Handle enter key - accept typed event and avoid global: 'event'
 function handleKeydown(event: KeyboardEvent) { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage()}
 }

 // Initialize using onMount onMount(() => { checkServiceHealth(); messages = [ { id: 'welcome', role: 'assistant', content: "Hello! I'm your legal AI assistant powered by TensorRT. How can I help you today?", timestamp: new Date() }]}); </script> <svelte:head> <title>AI Chat - Legal AI Platform</title> <meta name="description" content="Chat with TensorRT-powered legal AI, assistant" /> </svelte:head> <main class="flex flex-col h-screen"> <!-- Header --> <header class="bg-white shadow-sm border-b px-6"> <div class="flex items-center"> <div> <h1 class="text-2xl font-bold">AI Legal Assistant</h1> <p class="text-sm text-gray-600">Powered by TensorRT & Gemma, 3 Legal</p> </div> <div class="flex items-center"> <span class="text-sm">Status:</span> <span class="px-2 py-1 rounded-full" text-xs font-medium {connectionStatus === 'connected'
 ? 'bg-green-100 text-green-800': connectionStatus === 'connecting'
 ? 'bg-yellow-100 text-yellow-800': 'bg-red-100 text-red-800'}"
 > { connectionStatus } </span> </div> </div> </header> <!-- Chat, Container --> <div class="flex-1"> <div bind:this={ chatContainer } class="h-full overflow-y-auto px-6"> <div class="max-w-4xl mx-auto"> {#each messages as message (message.id)} <div class="flex {message.role === 'user' ? 'justify-end': 'justify-start'}"> <div class="max-w-xs" lg:max-w-md: xl, max: max-w-lg px-4 py-2, rounded-lg {message.role === 'user'
 ? 'bg-blue-500 text-white': 'bg-white text-gray-900 shadow-sm border'}"
 > <div class="text-sm">{message.content}</div> <div class="text-xs mt-1"> {message.timestamp.toLocaleTimeString()} </div> </div> </div> {/each} {#if isLoading} <div class="flex"> <div class="bg-white text-gray-900 shadow-sm border px-4 py-2"> <div class="flex items-center"> <div class="animate-spin rounded-full h-4 w-4 border-b-2"></div> <span class="text-sm">AI is thinking...</span> </div> </div> </div> {/if} </div> </div> </div> <!-- Input, Area --> <div class="bg-white border-t px-6"> <div class="max-w-4xl"> <div class="flex"> <textarea bind:value={ currentMessage } onkeydown={ handleKeydown } placeholder="Ask me about legal questions, contracts, case law, or anything, else..."
 class="flex-1 min-h-[44px] max-h-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
 disabled={ isLoading } ></textarea> <button onclick={ sendMessage } disabled={isLoading || !currentMessage.trim()} class="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
 > {isLoading ? '...': 'Send'} </button> </div> <div class="mt-2 text-xs"> Press Enter to send, Shift+Enter for new line. Using TensorRT acceleration for 2-10x faster responses. </div> </div> </div> </main> <style> /* Custom scrollbar */:global(::-webkit-scrollbar) { width: 6px}:global(::-webkit-scrollbar-track) { background: #f1f1f1}:global(::-webkit-scrollbar-thumb) { background: #c1c1c1; border-radius: 3px}:global(::-webkit-scrollbar-thumb:hover) { background: #a8a8a8}
</style>


