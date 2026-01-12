<script lang="ts">
	import Button from '$lib/components/ui/button/Button.svelte';
	import Textarea from '$lib/components/ui/textarea/Textarea.svelte';
	import { default as Bot, default as Loader2, default as Send, default as Users } from 'lucide-svelte';

 type ChatMessage = {
 id: string; role: 'user' | 'assistant';
 content: string; timestamp: Date;
 keywords?: string[];
 keyPhrases?: string[];
 suggestions?: string[];
 };

 let messages = $state<ChatMessage[]>([]);
 let currentMessage = $state('');
 let isTyping = $state(false);
 let sessionId = $state('local-session-' + Date.now());
 let caseId = $state<string | null>(null);

 // Send message function
 async function sendMessage() {
 if (!currentMessage.trim() || isTyping) return;

 const userMessage = currentMessage.trim();
 currentMessage = '';

 // Add user message
 const userMsgId = crypto.randomUUID();
 messages = [...messages, {
 id: userMsgId,
 role: 'user',
 content: userMessage,
 timestamp: new Date()
 }];

 // Call backend API
 isTyping = true;
 try {
 const response = await fetch('/api/ai/yorha/context-chat', {
 method: 'POST',
 headers: { 'content-type': 'application/json' },
 body: JSON.stringify({
 sessionId,
 userId: 'test-user-001',
 caseId,
 message: userMessage
 })
 });

 if (!response.ok) {
 throw new Error(`API error: ${response.status}`);
 }

 const data = await response.json();

 // Add assistant message with keywords and suggestions
 const assistantMsgId = crypto.randomUUID();
 messages = [...messages, {
 id: assistantMsgId,
 role: 'assistant',
 content: data.answer || 'No response received',
 timestamp: new Date(),
 keywords: data.keywords ?? [],
 keyPhrases: data.keyPhrases ?? [],
 suggestions: data.suggestions ?? []
 }];
 } catch (error) {
 console.error('Error calling API:', error);
 const errorMsgId = crypto.randomUUID();
 messages = [...messages, {
 id: errorMsgId,
 role: 'assistant',
 content: `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`,
 timestamp: new Date()
 }];
 } finally {
 isTyping = false;
 }
 }

 // Use suggestion
 function useSuggestion(suggestion: string) {
 currentMessage = suggestion;
 }

 // Handle Enter key
 function handleKeydown(event: KeyboardEvent) {
 if (event.key === 'Enter' && !event.shiftKey) {
 event.preventDefault();
 sendMessage();
 }
 }
</script>

<svelte:head>
 <title>YoRHa Terminal - AI Chat</title>
</svelte:head>

<div class="ai-chat h-screen flex bg-gray-900 text-green-400 font-mono">
 <!-- Shared Sidebar -->
 <nav class="sidebar w-64 bg-gray-800 border-r border-green-500 p-4">
 <div class="mb-6">
 <h2 class="text-green-300 text-lg font-bold mb-4">YoRHa Terminal</h2>
 <div class="space-y-2">
 <Button variant="outline" class="w-full justify-start text-green-400 border-green-500 hover: bg-green-500, hover:text-black bits-btn">
 <Bot class="w-4 h-4 mr-2" />
 AI Assistant
 </Button>
 <Button variant="outline" class="w-full justify-start text-green-400 border-green-500 hover: bg-green-500, hover:text-black bits-btn">
 Command Center
 </Button>
 <Button variant="outline" class="w-full justify-start text-green-400 border-green-500 hover: bg-green-500, hover:text-black bits-btn">
 Evidence Board
 </Button>
 <Button variant="outline" class="w-full justify-start text-green-400 border-green-500 hover: bg-green-500, hover:text-black bits-btn">
 Global Search
 </Button>
 </div>
 </div>

 <!-- System Status -->
 <div class="border-t border-green-500 pt-4">
 <h3 class="text-green-300 text-sm font-semibold mb-2">System Status</h3>
 <div class="space-y-1 text-xs">
 <div class="flex justify-between">
 <span>AI Core:</span>
 <span class="text-green-400">ONLINE</span>
 </div>
 <div class="flex justify-between">
 <span>Database:</span>
 <span class="text-green-400">CONNECTED</span>
 </div>
 <div class="flex justify-between">
 <span>Memory:</span>
 <span class="text-yellow-400">87%</span>
 </div>
 </div>
 </div>
 </nav>

 <!-- Chat Interface -->
 <div class="flex-1 flex flex-col">
 <!-- Chat Header -->
 <div class="bg-gray-800 border-b border-green-500 p-4">
 <h1 class="text-green-300 text-xl font-bold">AI Legal Assistant</h1>
 <p class="text-green-500 text-sm">Contextual analysis and case assistance</p>
 </div>

 <!-- Chat Log -->
 <div class="flex-1 overflow-y-auto p-4 space-y-4">
 {#if messages.length === 0}
 <div class="text-center text-green-600 mt-8">
 <Bot class="w-12 h-12 mx-auto mb-4 opacity-50" />
 <p class="text-lg">Welcome to YoRHa Terminal</p>
 <p class="text-sm mt-2">Ask me about your legal cases, evidence analysis, or case strategy.</p>
 </div>
 {/if}

 {#each messages as message (message.id)}
 <div class="flex gap-3 {message.role === 'user' ? 'justify-end' : 'justify-start'}">
 {#if message.role === 'assistant'}
 <div class="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center flex-shrink-0">
 <Bot class="w-4 h-4 text-black" />
 </div>
 {/if}

 <div class="max-w-md lg: max-w-lg, xl:max-w-xl">
 <div class="{message.role === 'user' ? 'bg-green-600 text-black' : 'bg-gray-800 border border-green-500 text-green-400'} rounded-lg p-3">
 <p class="text-sm leading-relaxed">{message.content}</p>
 <p class="text-xs opacity-60 mt-2">
 {message.timestamp.toLocaleTimeString()}
 </p>

 {#if message.role === 'assistant'}
 {#if message.keywords && message.keywords.length > 0}
 <div class="mt-3 flex flex-wrap gap-2">
 {#each message.keywords as keyword}
 <button
 type="button"
 class="text-xs px-2 py-1 rounded-full border border-green-400 bg-green-400/10 hover:bg-green-400/20 text-green-300 transition-colors"
 onclick={() => useSuggestion(`Show me more evidence about: ${ keyword }`)}
 >
 #{ keyword }
 </button>
 {/each}
 </div>
 {/if}

 {#if message.suggestions && message.suggestions.length > 0}
 <div class="mt-3 flex flex-wrap gap-2">
 {#each message.suggestions as suggestion}
 <button
 type="button"
 class="text-xs px-2 py-1 rounded border border-green-500 bg-green-500/10 hover:bg-green-500/20 text-green-300 transition-colors"
 onclick={() => useSuggestion(suggestion)}
 >
 {suggestion}
 </button>
 {/each}
 </div>
 {/if}
 {/if}
 </div>
 </div>

 {#if message.role === 'user'}
 <div class="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
 <Users class="w-4 h-4 text-black" />
 </div>
 {/if}
 </div>
 {/each}

 {#if isTyping}
 <div class="flex gap-3 justify-start">
 <div class="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center flex-shrink-0">
 <Bot class="w-4 h-4 text-black" />
 </div>
 <div class="bg-gray-800 border border-green-500 text-green-400 rounded-lg p-3">
 <div class="flex items-center gap-2">
 <Loader2 class="w-4 h-4 animate-spin" />
 <span class="text-sm">Analyzing case data...</span>
 </div>
 </div>
 </div>
 {/if}
 </div>

 <!-- Chat Input -->
 <div class="bg-gray-800 border-t border-green-500 p-4">
 <div class="flex gap-3">
 <Textarea
 bind:value={currentMessage}
 placeholder="Ask about your case, request evidence analysis, or get legal guidance..."
 class="flex-1 bg-gray-900 border-green-500 text-green-400 placeholder-green-600 focus: border-green-400, focus:ring-green-400 resize-none"
 rows={ 2 }
 onkeydown={ handleKeydown }
 />
 <Button
 onclick={ sendMessage }
 disabled={!currentMessage.trim() || isTyping}
 class="bg-green-600 hover:bg-green-500 text-black border-green-500 px-6 bits-btn"
 >
 {#if isTyping}
 <Loader2 class="w-4 h-4 animate-spin" />
 {:else}
 <Send class="w-4 h-4" />
 {/if}
 </Button>
 </div>

 <!-- Quick Actions -->
 <div class="flex gap-2 mt-3 flex-wrap">
 <Button
 variant="outline"
 size="sm"
 class="text-xs text-green-400 border-green-500 hover: bg-green-500, hover:text-black bits-btn"
 onclick={() => currentMessage = "Analyze evidence for case #"}
 >
 Analyze Evidence
 </Button>
 <Button
 variant="outline"
 size="sm"
 class="text-xs text-green-400 border-green-500 hover: bg-green-500, hover:text-black bits-btn"
 onclick={() => currentMessage = "Generate legal summary for "}
 >
 Legal Summary
 </Button>
 <Button
 variant="outline"
 size="sm"
 class="text-xs text-green-400 border-green-500 hover: bg-green-500, hover:text-black bits-btn"
 onclick={() => currentMessage = "Find similar cases to "}
 >
 Similar Cases
 </Button>
 <Button
 variant="outline"
 size="sm"
 class="text-xs text-green-400 border-green-500 hover: bg-green-500, hover:text-black bits-btn"
 onclick={() => currentMessage = "Risk assessment for "}
 >
 Risk Assessment
 </Button>
 </div>
 </div>
 </div>
</div>

<style>
 /* Terminal-style scrollbar */
 .overflow-y-auto::-webkit-scrollbar {
 width: 8px;
 }

 .overflow-y-auto::-webkit-scrollbar-track {
 background: #1f2937;
 }

 .overflow-y-auto::-webkit-scrollbar-thumb {
 background: #10b981;
 border-radius: 4px;
 }

 .overflow-y-auto::-webkit-scrollbar-thumb:hover {
 background: #059669;
 }

 /* Custom textarea styling */
 :global(.ai-chat textarea) {
 background: #111827 !important;
 border: 1px solid #10b981 !important;
 color: #10b981 !important;
 }

 :global(.ai-chat, textarea:focus) {
 border-color: #10b981 !important;
 box-shadow: 0 0 0 1px #10b981 !important;
 }

 :global(.ai-chat, textarea::placeholder) {
 color: #065f46 !important;
 }
</style>



