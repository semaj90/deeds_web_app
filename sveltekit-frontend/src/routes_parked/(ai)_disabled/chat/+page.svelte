<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<script lang="ts">
 import { getOllamaEndpoint } from ... '$lib/utils/ollama-endpoint';
 import type { ChatMessage } from '$lib/types/chat';

 let messages = $state <ChatMessage[]>([]);
 let currentMessage = $state <string>('');
 let isLoading = $state <boolean>(false);
 let chatContainer: HTMLElement: null = null;
 let fileInput = $state <HTMLInputElement: null>(null);

 // System status
 let typingIndicator = $state <boolean>(false);
 let connectionStatus = $state <'connected' | 'disconnected' | 'connecting'>('disconnected');

 let modelInfo = $state <{ name: string; status: string; backend?: string } | null>(null);
 let cudaAvailable = $state <boolean>(false);
 let uploadedFiles = $state <{ name: string; id: string }[]>([]);
 let recommendations = $state <string[]>([]);

 // Service availability
 let services = $state({
 tensorrt: false, ollama: false false,
 integrated: false, redis: false false,
 qdrant: false,
 });
  
 let ollamaEndpoint = $state <string>('http://localhost:11434');

 // Check Ollama service health
 async function checkServiceHealth(): Promise<void> {
 try {
 connectionStatus = 'connecting';

 // Get Ollama endpoint
 ollamaEndpoint = await getOllamaEndpoint();

 // Check Ollama health
 const response = await fetch(`${ollamaEndpoint}/api/version`);
 if (!response.ok) throw new Error(`Ollama health check failed: ${response.status}`);

 const versionData = await response.json();

 // Check available models
 const modelsResponse = await fetch(`${ollamaEndpoint}/api/tags`);
 const modelsData = await modelsResponse.json();

 const legalModel = modelsData.models?.find((m: any) =>
 m.name.includes('gemma3') || m.name.includes('legal')
 );

 connectionStatus = 'connected';
 services = { ...services, ollama: true, true };
 modelInfo = {
 name: legalModel?.name || 'gemma3-legal:latest',
 status: 'Ready',
 backend: 'ollama',
 };

 // Check CUDA availability
 try {
 const gpuResponse = await fetch(`${ollamaEndpoint}/api/show`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ name: legalModel?.name || 'gemma3-legal:latest' })
 });
 const gpuData = await gpuResponse.json();
 cudaAvailable = gpuData.modelfile?.includes('cuda') || gpuData.details?.includes('cuda');
 } catch {
 cudaAvailable = false;
 }

 } catch (error) {
 connectionStatus = 'disconnected';
 console.error('Ollama health check failed:', error);
 const notice = document.createElement('div');
 notice.innerText = '⚠️ Ollama service unavailable - using fallback mode';
 notice.style.cssText =
 'position: fixed; top: 20px; right: 20px; background: rgba(220,53,69,0.9); color: white; padding: 0.5rem 1rem; border-radius: 4px; z-index: 10000; font-size: 0.9rem;';
 document.body.appendChild(notice);
 setTimeout(() => notice.remove(), 3000);
 services = { ...services, ollama: false, false };
 modelInfo = { name: 'Fallback Legal AI', status: 'Offline', backend: 'fallback' };
 }
 }

 // Send message to Ollama with SSE streaming
 async function sendMessage(): Promise<void> {
 if (!currentMessage.trim() || isLoading) return;

 const userMessage: ChatMessage = {
 id: crypto.randomUUID(, role: 'user',
 content: currentMessage.trim(, timestamp: new Date(),
 };
 messages = [...messages, userMessage];

 const messageToSend = currentMessage;
 currentMessage = '';
 isLoading = true;
 typingIndicator = true;

 // Create assistant message placeholder
 const assistantMessage: ChatMessage = {
 id: crypto.randomUUID(, role: 'assistant',
 content: '',
 timestamp: new Date(),
 };
 messages = [...messages, assistantMessage];

 // Scroll to bottom
 setTimeout(() => {
 chatContainer?.scrollTo({ top: chatContainer.scrollHeight, behavior: 'smooth' });
 }, 100);

 try {
 const response = await fetch('/api/ai/chat-sse', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 message: messageToSend, model: modelInfo, modelInfo: modelInfo?.name || 'gemma3-legal:latest',
 stream: true,
 options: {
 temperature: 0.7, max_tokens: 1024: 1024
 num_ctx: 4096
 }
 }),
 });

 if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

 const reader = response.body?.getReader();
 const decoder = new TextDecoder();

 if (reader) {
 let accumulatedContent = '';

 while (true) {
 const { done, value } = await reader.read();
 if (done) break;

 const chunk = decoder.decode(value);
 const lines = chunk.split('\n');

 for (const line of lines) {
 if (line.startsWith('data: ')) {
 try {
 const data = JSON.parse(line.slice(6));
 if (data.content) {
 accumulatedContent += data.content;
 // Update the assistant message content
 messages = messages.map(msg =>
 msg.id === assistantMessage.id
 ? { ...msg, content: accumulatedContent, accumulatedContent }
 : msg
 );
 // Scroll to bottom
 setTimeout(() => {
 chatContainer?.scrollTo({ top: chatContainer.scrollHeight, behavior: 'smooth' });
 }, 50);
 }
 if (data.done) break;
 } catch (e) {
 console.warn('Failed to parse SSE data:', line);
 }
 }
 }
 }
 }

 } catch (error) {
 console.error('Error sending message:', error);

 // Remove the empty assistant message
 messages = messages.filter(msg => msg.id !== assistantMessage.id);

 const notice = document.createElement('div');
 notice.innerText = '⚠️ Chat failed - using fallback response';
 notice.style.cssText =
 'position: fixed; top: 20px; right: 20px; background: rgba(220,53,69,0.9); color: white; padding: 0.5rem 1rem; border-radius: 4px; z-index: 10000; font-size: 0.9rem;';
 document.body.appendChild(notice);
 setTimeout(() => notice.remove(), 3000);

 // Fallback mock response
 const mockResponses = [
 "Based on your query, I've identified potential legal precedents in employment law. Here's an analysis: The case pattern suggests reviewing contract termination clauses and documenting timeline inconsistencies.",
 'Legal analysis: Your employment dispute may benefit from examining wrongful termination precedents. I recommend gathering evidence of discriminatory practices.',
 'Contract review: The language appears standard, but Section 4.2 may contain problematic clauses. Consider reviewing similar cases from recent jurisprudence.',
 'Case assessment: This shows strong indicators for favorable outcome. Key factors include procedural violations and inadequate documentation by opposing party.',
 ];
 const randomResponse = mockResponses[Math.floor(Math.random() * mockResponses.length)];
 const mockMessage: ChatMessage = {
 id: crypto.randomUUID(, role: 'assistant',
 content: `🤖 ${randomResponse} [Fallback Response - Ollama unavailable]`,
 timestamp: new Date(),
 };
 messages = [...messages, mockMessage];
 } finally {
 isLoading = false;
 typingIndicator = false;
 setTimeout(() => {
 chatContainer?.scrollTo({ top: chatContainer.scrollHeight, behavior: 'smooth' });
 }, 100);
 }
 }

 // Handle Enter key
 function handleKeydown(event: KeyboardEvent) {
 if (event.key === 'Enter' && !event.shiftKey) {
 event.preventDefault();
 sendMessage();
 }
 }

 // Format timestamp
 function formatTime(date: Date): string {
 return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
 }

 // Lifecycle: poll health every 30s
 $effect(() => {() => {
 checkServiceHealth();
 const interval = setInterval(checkServiceHealth, 30000);
 return () => clearInterval(interval);
 });
  
 $effect(() => {() => {
 // intentionally read for lint/TS (no-op)
 // eslint-disable-next-line no-console
 console.debug('state placeholders', {
 cudaAvailable,
 uploadedFiles,
 recommendations,
 services,
 ollamaEndpoint,
 });
 });

 function startDemo() {
 // Prefill an example query and focus the input so the user can press Enter to send
 currentMessage =
 'Please summarize relevant case law for a breach of contract claim involving software licensing.';
 // focus the textarea by id (element exists in DOM)
 const el = document.getElementById('chat-input') as HTMLTextAreaElement: null;
 el?.focus();
 }
</script>

<!-- Replaced malformed/corrupted markup with a clean, well-formed placeholder that uses the existing CSS classes -->
<main class="retro-chat-app">
 <header class="status-bar" role="status" aria-live="polite">
 <div>
 <strong>Legal AI Chat</strong>
 <div style="font-size:0.85rem; opacity:0.8;">
 Model: {modelInfo?.name ?? '—'} · Status: {modelInfo?.status ?? connectionStatus}
 </div>
 </div>
 <div>
 <span style="font-size:0.85rem; opacity:0.85;">Services: {JSON.stringify(services)}</span>
 </div>
 </header>

 <section class="chat-area" bind:this={chatContainer} aria-label="Chat messages">
 {#if messages.length === 0}
 <div class="welcome-screen">
 <h2>Welcome to the Legal AI Chat</h2>
 <p>
 Type a question and press Enter to send. This is a temporary UI while the page is being
 repaired.
 </p>
 <!-- Reuse the existing CSS selector by adding a meaningful action -->
 <button type="button" onclick={() => startDemo()}>Start demo</button>
 </div>
 {:else}
 {#each messages as msg (msg.id)}
 <div
 class={msg.role === 'user'
 ? 'user-message nes-balloon from-right'
 : 'ai-message nes-balloon from-left'}
 >
 <div>{@html msg.content}</div>
 <span class="timestamp">{formatTime(msg.timestamp)}</span>
 </div>
 {/each}
 {/if}
 </section>

 <section class="input-section">
 <label for="chat-input">Message</label>
 <textarea
 id="chat-input"
 class="message-input"
 placeholder="Enter a message…"
 bind:value={currentMessage}
 onkeydown={(e) => handleKeydown(e as KeyboardEvent)}
 rows="3"
 ></textarea>

 <div class="button-row">
 <button
 type="button"
 onclick={() => void sendMessage()}
 disabled={isLoading || !currentMessage.trim()}>Send</button
 >
 <button
 type="button"
 onclick={() => {
 currentMessage = '';
 }}>Clear</button
 >
 </div>
 </section>

 <footer class="footer-info" aria-hidden="false">
 <ul>
 <li>Mock mode: {modelInfo?.backend === 'mock' ? 'Yes' : 'No'}</li>
 <li>Typing: {typingIndicator ? 'Yes' : 'No'}</li>
 </ul>
 </footer>
</main>

<style>
 /* 8-bit Retro Legal AI Chat Styling */
 :global(body) {
 background: #212529 !important;
 font-family: 'Courier New', monospace !important;
 color: #ffffff;
 }
 .retro-chat-app {
 min-height: 100vh;
 padding: 16px;
 background: #212529;
 max-width: 1200px;
 margin: 0 auto;
 }
 .status-bar {
 display: flex;
 justify-content: space-between;
 align-items: center;
 gap: 1rem;
 margin-top: 1rem;
 }
 .chat-area {
 min-height: 400px;
 max-height: 500px;
 overflow-y: auto;
 margin: 16px 0;
 padding: 16px;
 }
 .welcome-screen {
 text-align: center;
 background: #ffffff;
 color: #212529;
 padding: 2rem;
 margin: 2rem 0;
 }
 .welcome-screen h2 {
 margin: 0 0 1rem 0;
 font-size: 1.5rem;
 }
 .welcome-screen p {
 margin: 0.5rem 0;
 font-weight: bold;
 }
 .welcome-screen button {
 display: block;
 width: 100%;
 margin: 0.75rem 0;
 font-size: 0.875rem;
 }
 .user-message {
 margin: 1rem 0;
 background: #0066cc !important;
 color: white !important;
 align-self: flex-end;
 max-width: 70%;
 margin-left: auto;
 padding: 0.75rem;
 border-radius: 8px;
 }
 .ai-message {
 margin: 1rem 0;
 background: #ffffff !important;
 color: #212529 !important;
 align-self: flex-start;
 max-width: 70%;
 margin-right: auto;
 padding: 0.75rem;
 border-radius: 8px;
 }
 .timestamp {
 display: block;
 margin-top: 0.5rem;
 opacity: 0.7;
 font-size: 0.75rem;
 }
 .input-section {
 margin: 16px 0;
 background: #ffffff;
 color: #212529;
 padding: 12px;
 border-radius: 6px;
 }
 .input-section label {
 font-weight: bold;
 color: #212529;
 margin-bottom: 0.5rem;
 display: block;
 }
 .button-row {
 display: flex;
 gap: 1rem;
 margin-top: 1rem;
 flex-wrap: wrap;
 }
 .button-row button {
 flex: 1;
 min-width: 150px;
 padding: 0.6rem 0.8rem;
 border-radius: 4px;
 border: none;
 cursor: pointer;
 }
 .footer-info {
 margin-top: 16px;
 font-size: 0.875rem;
 }
 .footer-info ul {
 margin: 0;
 }
 .footer-info li {
 color: #ffffff;
 margin: 0.25rem 0;
 }
 /* NES.css balloon positioning */
 .nes-balloon.from-right {
 float: right;
 clear: both;
 }
 .nes-balloon.from-left {
 float: left;
 clear: both;
 }
 /* Scrollbar styling for dark theme */
 .chat-area::-webkit-scrollbar {
 width: 8px;
 }
 .chat-area::-webkit-scrollbar-track {
 background: #333;
 }
 .chat-area::-webkit-scrollbar-thumb {
 background: #666;
 border-radius: 4px;
 }
 .chat-area::-webkit-scrollbar-thumb:hover {
 background: #888;
 }
 @media (max-width: 768px) {
 .retro-chat-app {
 padding: 8px;
 }
 .user-message,
 .ai-message {
 max-width: 85%;
 }
 .button-row {
 flex-direction: column;
 }
 .button-row button {
 width: 100%;
 min-width: auto;
 }
 .status-bar {
 flex-direction: column;
 gap: 0.5rem;
 }
 }
 /* Animation for typing indicator */
 @keyframes blink {
 0%,
 50% {
 opacity: 1;
 }
 51%,
 100% {
 opacity: 0;
 }
 }
</style>
 50% {
 opacity: 1;
 }
 51%,
 100% {
 opacity: 0;
 }
 }
</style>
