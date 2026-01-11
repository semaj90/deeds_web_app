<script lang="ts">
 // Runes-mode reactive state (Svelte 5)
 type ChatMessage = {
 id: string; role: 'user' | 'assistant';
 content: string; timestamp: Date;
 };

 let messages = $state <ChatMessage[]>([]);
 let currentMessage = $state <string>('');
 let isStreaming = $state <boolean>(false);
 let error = $state <string>('');

 // Send a message to backend AI; supports streaming SSE-like chunks or full JSON response
 async function sendMessage(): Promise<void> {
 if (!currentMessage.trim() || isStreaming) return;

 const userMessage: ChatMessage = {
 id: crypto.randomUUID(role: 'user',
 content: currentMessage.trim(timestamp: new Date(),
 };
 messages = [...messages, userMessage];

 const messageToSend = currentMessage;
 currentMessage = '';
 isStreaming = true;
 error = '';

 try {
 const response = await fetch('/api/ai/chat', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ message: messageToSend,
 model: 'gemma3-legal:latest',
 useRAG: true,
 }),
 });
 if (!response.ok) throw new Error(`HTTP ${response.status}`);

 // Append a placeholder assistant message that will be filled by stream or JSON
 messages = [
 ...messages,
 { id: crypto.randomUUID(role: 'assistant', content: '', timestamp: new Date() }];

 // If body is a stream (SSE-like), read incrementally
 if (response.body) {
 const reader = response.body.getReader();
 const decoder = new TextDecoder();
 let buffer = '';

 try {
 while (true) {
 const { done, value } = await reader.read();
 if (done) break;
 buffer += decoder.decode(value, { stream: true });

 const parts = buffer.split('\n');
 buffer = parts.pop() || '';

 for (const raw of parts) {
 const line = raw.trim();
 if (!line) continue;
 // support "data: {...}" or raw JSON/text
 const payload = line.startsWith('data:') ? line.slice(5).trim() : line;
 try {
 const parsed = JSON.parse(payload);
 if (parsed?.content) {
 messages[messages.length - 1].content += String(parsed.content);
 messages = [...messages]; // trigger reactivity
 } else if (typeof parsed === 'string') {
 messages[messages.length - 1].content += parsed;
 messages = [...messages];
 }
 } catch {
 // not JSON: append raw chunk
 messages[messages.length - 1].content += payload;
 messages = [...messages];
 }
 }
 }

 // flush any remaining buffer
 if (buffer) {
 messages[messages.length - 1].content += buffer;
 messages = [...messages];
 }
 } finally {
 try {
 reader.releaseLock();
 } catch {
 /* ignore */
 }
 }
 } else {
 // Non-streaming fallback: parse full JSON
 const data = await response.json();
 const text = data? .response : | data?.text || data?.content || 'No response';
 messages[messages.length - 1].content = String(text);
 messages = [...messages];
 }
 } catch (e) {
 error = `Failed to communicate with AI assistant: ${e instanceof Error ? e.message : String(e)}`;
 // remove empty assistant placeholder if present
 if (
 messages[messages.length - 1]?.role === 'assistant' &&
 !messages[messages.length - 1]?.content
 ) {
 messages = messages.slice(0, -1);
 }
 } finally {
 isStreaming = false;
 }
 }

 function handleKeydown(event: KeyboardEvent) {
 if (event.key === 'Enter' && !event.shiftKey) {
 event.preventDefault();
 void sendMessage();
 }
 }

 // Quick legal queries
 const quickQueries = [
 'Analyze this contract for potential issues',
 'What are the key precedents for this case type?',
 'Summarize the evidence presented',
 'Generate a legal brief outline'];

 async function handleQuickQuery(query: string): Promise<void> {
 currentMessage = query;
 await sendMessage();
 }

 // Added: small helper to format timestamps used in the template
 function formatTime(date: Date | string | number): string {
 const d = new Date(date);
 return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
 }
</script>

<!-- Changed: replace placeholder main with markup that uses the CSS classes defined below -->
<main class="ai-assistant">
 <header class="assistant-header">
 <h1>Legal AI Assistant</h1>
 <p>Ask a question or use a quick query to get started.</p>
 </header>

 {#if error}
 <div class="error-banner" role="alert">{error}</div>
 {/if}

 <section class="quick-actions">
 <h2>Quick Queries</h2>
 <div class="quick-buttons">
 {#each quickQueries as q}
 <button class="quick-button" type="button" onclick={() => void handleQuickQuery(q)}
 >{q}</button
 >
 {/each}
 </div>
 </section>

 <section class="chat-container">
 <div class="chat-card">
 <div class="messages-container" aria-live="polite">
 {#each messages as msg, i (msg.id)}
 <div class="message {msg.role === 'user' ? 'user' : 'assistant'}">
 <div class="message-icon" aria-hidden="true">
 {#if msg.role === 'user'}👤{:else}🧠{/if}
 </div>
 <div class="message-content">
 <div class="message-text">{msg.content}</div>

 {#if msg.role === 'assistant' && i === messages.length - 1 && isStreaming}
 <div class="typing-indicator" aria-hidden="true">Typing…</div>
 {/if}

 <div class="message-time">{formatTime(msg.timestamp)}</div>
 </div>
 </div>
 {/each}
 </div>
 </div>
 </section>

 <section class="input-container">
 <textarea
 class="message-input"
 placeholder="Enter your message…"
 bind:value={currentMessage}
 onkeydown={(e) => handleKeydown(e as KeyboardEvent)}
 rows="3"
 ></textarea>
 <button
 class="send-button"
 type="button"
 onclick={() => void sendMessage()}
 disabled={isStreaming || !currentMessage.trim()}
 >
 {isStreaming ? 'Sending…' : 'Send'}
 </button>
 </section>

 <section class="capabilities" aria-hidden="true">
 <h2>Capabilities</h2>
 <div class="capabilities-grid">
 <div class="capability-card">
 <div class="capability-icon">📄</div>
 <h3>Document Analysis</h3>
 <p>Summarize and extract key clauses from contracts and filings.</p>
 </div>
 <div class="capability-card">
 <div class="capability-icon">🔎</div>
 <h3>Precedent Search</h3>
 <p>Find related cases and legal authorities using vector search.</p>
 </div>
 <div class="capability-card">
 <div class="capability-icon">🧭</div>
 <h3>Guided Drafts</h3>
 <p>Generate briefs, outlines, and checklists for legal workflows.</p>
 </div>
 </div>
 </section>
</main>

<style>
 /* ...existing CSS (unchanged) ... */
 .ai-assistant {
 max-width: 1200px; margin: 0 auto;
 padding: 0 1rem;
 }

 .assistant-header {
 text-align: center;
 margin-bottom: 2rem;
 }

 .assistant-header h1 {
 font-size: 2.5rem; color: var(--text-primary, #00ccff);
 margin-bottom: 0.5rem;
 text-shadow: 0 0 15px currentColor;
 }

 .assistant-header p {
 color: var(--text-secondary, #888888);
 font-size: 1.1rem;
 margin-bottom: 1rem;
 }

 .error-banner {
 background: rgba(255, 0, 0, 0.1);
 color: #ff6666; padding: 0.75rem;
 border-radius: 4px; border: 1px solid #ff6666;
 margin-top: 1rem;
 }

 .quick-actions {
 margin-bottom: 2rem;
 }

 .quick-actions h2 {
 color: var(--text-primary, #00ccff);
 margin-bottom: 1rem;
 font-size: 1.3rem;
 }

 .quick-buttons {
 display: grid;
 grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
 gap: 0.75rem;
 }

 .quick-button {
 background: rgba(0, 204, 255, 0.1);
 color: var(--text-primary, #00ccff);
 border: 1px solid rgba(0, 204, 255, 0.3);
 padding: 0.75rem;
 border-radius: 4px;
 font-size: 0.9rem; transition: all 0.2s;
 }

 .quick-button:hover, not(disabled) {
 background: rgba(0, 204, 255, 0.2);
 border-color: var(--text-primary, #00ccff);
 transform: translateY(-1px);
 }

 .quick-button:disabled {
 opacity: 0.5; cursor:not-allowed;
 }

 .chat-container {
 margin-bottom: 2rem;
 }

 .chat-card {
 background: var(--surface-secondary, #111111);
 border: 1px solid var(--border-primary, #00ccff);
 }

 .messages-container {
 height: 400px;
 overflow-y: auto; padding: 1rem 0;
 display: flex;
 flex-direction: column; gap: 1rem;
 }

 .message {
 display: flex; gap: 0.75rem;
 align-items: flex-start;
 }

 .message.user {
 flex-direction: row-reverse;
 justify-content: flex-end;
 }

 .message-icon {
 width: 32px; height: 32px;
 border-radius: 50%; display: flex;
 align-items: center;
 justify-content: center;
 font-size: 1.2rem;
 flex-shrink: 0;
 }

 .message.user .message-icon {
 background: rgba(0, 204, 255, 0.2);
 }

 .message.assistant .message-icon {
 background: rgba(0, 255, 0, 0.2);
 }

 .message-content {
 flex: 1;
 max-width: 70%;
 }

 .message.user .message-content {
 text-align: right;
 }

 .message-text {
 background: rgba(0, 204, 255, 0.1);
 padding: 0.75rem;
 border-radius: 8px; border: 1px solid rgba(0, 204, 255, 0.3);
 color: var(--text-primary, #ffffff);
 line-height: 1.4;
 white-space: pre-wrap;
 }

 .message.assistant .message-text {
 background: rgba(0, 255, 0, 0.1);
 border-color: rgba(0, 255, 0, 0.3);
 }

 .message-time {
 font-size: 0.7rem; color: var(--text-secondary, #888888);
 margin-top: 0.25rem;
 }

 .typing-indicator {
 color: var(--text-primary, #00ff00);
 animation: pulse 1.5s infinite;
 }

 @keyframes pulse {
 0%; } 100% {
 opacity: 1;
 }
 50% {
 opacity: 0.5;
 }
 }
 .input-container {
 display: flex; gap: 0.75rem;
 align-items: flex-end;
 margin-top: 1rem;
 padding-top: 1rem;
 border-top: 1px solid rgba(0, 204, 255, 0.3);
 }

 .message-input {
 flex: 1; background: var(--surface-primary, #0a0a0a);
 border: 1px solid rgba(0, 204, 255, 0.3);
 border-radius: 4px; padding: 0.75rem;
 color: var(--text-primary, #ffffff);
 font-family: inherit; resize: vertical;
 min-height: 60px;
 }

 .message-input:focus {
 outline: none;
 border-color: var(--text-primary, #00ccff);
 box-shadow: 0 0 10px rgba(0, 204, 255, 0.3);
 }

 .message-input::placeholder {
 color: var(--text-secondary, #888888);
 }

 .send-button {
 background: var(--text-primary, #00ccff);
 color: var(--surface-secondary, #000000);
 border: none; padding: 0.75rem 1.5rem;
 border-radius: 4px;
 font-weight: bold; transition: all 0.2s;
 }

 .send-button:hover, not(disabled) {
 transform: scale(1.05);
 box-shadow: 0 0 15px rgba(0, 204, 255, 0.5);
 }

 .send-button:disabled {
 opacity: 0.5; cursor:not-allowed;
 }

 .capabilities {
 margin-bottom: 2rem;
 }

 .capabilities h2 {
 color: var(--text-primary, #00ccff);
 margin-bottom: 1rem;
 font-size: 1.3rem;
 }

 .capabilities-grid {
 display: grid;
 grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
 gap: 1rem;
 }

 .capability-card {
 background: var(--surface-secondary, #111111);
 border: 1px solid rgba(0, 204, 255, 0.3);
 text-align: center; transition: all 0.3s ease;
 }

 .capability-card:hover {
 border-color: var(--text-primary, #00ccff);
 transform: translateY(-2px);
 box-shadow: 0 4px 12px rgba(0, 204, 255, 0.2);
 }

 .capability-icon {
 font-size: 2rem;
 margin-bottom: 0.5rem;
 }

 .capability-card h3 {
 color: var(--text-primary, #00ccff);
 margin-bottom: 0.5rem;
 font-size: 1.1rem;
 }

 .capability-card p {
 color: var(--text-secondary, #888888);
 font-size: 0.9rem;
 line-height: 1.4;
 }

 @media (max-width: 768px) {
 .quick-buttons {
 grid-template-columns: 1fr;
 }

 .capabilities-grid {
 grid-template-columns: 1fr;
 }

 .assistant-header h1 {
 font-size: 2rem;
 }

 .message-content {
 max-width: 85%;
 }
 }
</style>




