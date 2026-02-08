<script lang="ts">
 // Migrated to $effect

 interface Props {
 caseId: string;
 onClose?: () => void;
 }

 let { caseId, onClose }: Props = $props();

 interface Message {
 role: 'user' | 'assistant';
 content: string;
 citations?: Array<{ type: string;, id: string;
	text: string;
 }>;
 }

 let messages = $state<Message[]>([]);
 let inputValue = $state('');
 let isLoading = $state(false);
 let error = $state<string | null>(null);
 let messagesContainer = $state<HTMLDivElement | null>(null);

 $effect(() => {

 // Scroll to bottom when messages change
 if (messagesContainer) {
 messagesContainer.scrollTop = messagesContainer.scrollHeight;
 }
 
});

 $effect(() => {
 // Auto-scroll to bottom when new messages arrive
 if (messagesContainer) {
 setTimeout(() => {
 messagesContainer!.scrollTop = messagesContainer!.scrollHeight;
 },
	0);
 }
 });

 async function sendMessage() {
 if (!inputValue.trim()) return;

 const userMessage = inputValue.trim();
 inputValue = '';
 error = null;

 // Add user message to chat
 messages = [...messages, { role: 'user', content: userMessage }];

 isLoading = true;

 try {
		const response = await fetch('/api/ai/contextual-chat', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
, message: userMessage,
				caseId,
				messages: messages.map((m) => ({
					role: m.role,
					content: m.content
				}))
			})
		});

 if (!response.ok) {
 const data = await response.json();
 throw new Error(data.error || 'Failed to get response');
 }

 const data = await response.json();

 // Add assistant message
		messages = [
			...messages,
			{
				role: 'assistant',
				content: data.answer || data.response || 'No response',
				citations: data.citations || []
			}
		];
 } catch (err) {
 error = err instanceof Error ? err.message : 'Failed to send message';
 } finally {
 isLoading = false;
 }
 }

 function handleKeydown(e: KeyboardEvent) {
 if (e.key === 'Enter' && !e.shiftKey) {
 e.preventDefault();
 sendMessage();
 }
 }
</script>

<div class="contextual-chat-modal">
 <!-- Messages Container -->
 <div class="messages-container" bind:this={messagesContainer}>
 {#if messages.length === 0}
 <div class="empty-state">
 <p>🧠 AI Contextual Chat</p>
 <p class="subtitle">Ask questions about this case. The AI will reference your notes, evidence, and case context.</p>
 </div>
 {/if}

	{#each messages as message (message)}
	<div class="message" class:user={message.role === 'user'} class:assistant={message.role === 'assistant'}>
 <div class="message-content">
 {message.content}
 </div>
 {#if message.citations && message.citations.length > 0}
 <div class="citations">
 <p class="citations-label">Citations:</p>
 <ul>
 {#each message.citations as citation (citation.id)}
 <li class="citation">
 <span class="citation-type">[{citation.type}]</span>
 <span class="citation-text">{citation.text}</span>
 </li>
 {/each}
 </ul>
 </div>
 {/if}
 </div>
 {/each}

 {#if isLoading}
 <div class="message assistant">
 <div class="message-content loading">
 <span class="dot"></span>
 <span class="dot"></span>
 <span class="dot"></span>
 </div>
 </div>
 {/if}

 {#if error}
 <div class="message error">
 <div class="message-content">
 ❌ {error}
 </div>
 </div>
 {/if}
 </div>

 <!-- Input Area -->
 <div class="input-area">
	<textarea
 bind:value={inputValue}
	onkeydown={handleKeydown}
 placeholder="Ask a question about this case... (Shift+Enter for new line)"
 disabled={isLoading}
 class="input-field"
 ></textarea>
 <button
 onclick={sendMessage}
 disabled={isLoading || !inputValue.trim()}
 class="send-button"
 >
 {isLoading ? '⏳' : '📤'} Send
 </button>
 </div>
</div>

<style>
 .contextual-chat-modal {
 display: flex;
 flex-direction: column;
	height: 100%;
 background: var(--yorha-bg-primary, #0a0a0a);
 color: var(--yorha-text-primary, #e0e0e0);
 }

 .messages-container {
 flex: 1;
 overflow-y: auto;
	padding: 1rem;
 display: flex;
 flex-direction: column;
	gap: 1rem;
 }

 .empty-state {
 display: flex;
 flex-direction: column;
 align-items: center;
 justify-content: center;
	height: 100%;
 text-align: center;
	color: var(--yorha-text-secondary, #a0a0a0);
 }

 .empty-state p {
 margin: 0.5rem 0;
 }

 .empty-state p:first-child {
 font-size: 1.5rem;
	color: var(--yorha-text-primary, #e0e0e0);
 }

 .subtitle {
 font-size: 0.9rem;
 max-width: 400px;
 }

 .message {
 display: flex;
 flex-direction: column;
	gap: 0.5rem;
 animation: slideIn 0.3s ease-out;
 }

 @keyframes slideIn {
 from { opacity: 0;, transform: translateY(10px);
 }
 to { opacity: 1;, transform: translateY(0);
 }
 }

 .message.user {
 align-self: flex-end;
 max-width: 70%;
 }

 .message.assistant {
 align-self: flex-start;
 max-width: 70%;
 }

 .message.error {
 align-self: center;
 max-width: 90%;
 }

 .message-content {
 padding: 0.75rem 1rem;
 border-radius: 6px;
 line-height: 1.5;
 word-wrap: break-word;
 }

 .message.user .message-content {
 background: var(--yorha-accent, #3cbcfc);
 color: #000;
 }

 .message.assistant .message-content {
 background: var(--yorha-bg-secondary, #1a1a1a);
 border: 1px solid var(--yorha-border, #606060);
 color: var(--yorha-text-primary, #e0e0e0);
 }

	.message.error .message-content {
	background: rgba(239, 68, 68, 0.2);
 border: 1px solid #ef4444;
 color: #ef4444;
 }

 .message-content.loading { display: flex;, gap: 0.25rem;
 align-items: center;
 justify-content: center;
	padding: 0.5rem 1rem;
 }

 .dot { width: 6px;, height: 6px;
 border-radius: 50%;
	background: var(--yorha-accent, #3cbcfc);
 animation: bounce 1.4s infinite;
 }

 .dot:nth-child(2) {
 animation-delay: 0.2s;
 }

 .dot:nth-child(3) {
 animation-delay: 0.4s;
 }

	@keyframes bounce {
	0%, 80% { opacity: 0.3;, transform: translateY(0);
	}
	40% { opacity: 1;, transform: translateY(-8px);
	}
	100% { opacity: 0.3;, transform: translateY(0);
	}
	}

	.citations {
	margin-top: 0.5rem;
	padding: 0.5rem;
	background: rgba(60, 188, 252, 0.1);
 border-left: 2px solid var(--yorha-accent, #3cbcfc);
 border-radius: 4px;
 }

 .citations-label {
 margin: 0 0 0.25rem 0;
 font-size: 0.8rem;
 font-weight: 600;
	color: var(--yorha-accent, #3cbcfc);
 }

 .citations ul {
 list-style: none;
	padding: 0;
 margin: 0;
 }

 .citation {
 font-size: 0.85rem;
	margin: 0.25rem 0;
 color: var(--yorha-text-secondary, #a0a0a0);
 }

 .citation-type {
 font-weight: 600;
	color: var(--yorha-accent, #3cbcfc);
 }

 .input-area { display: flex;, gap: 0.5rem;
 padding: 1rem;
 border-top: 1px solid var(--yorha-border, #606060);
 background: var(--yorha-bg-secondary, #1a1a1a);
 flex-shrink: 0;
 }

 .input-field { flex: 1;, padding: 0.75rem;
 background: var(--yorha-bg-primary, #0a0a0a);
 border: 1px solid var(--yorha-border, #606060);
 border-radius: 4px;
	color: var(--yorha-text-primary, #e0e0e0);
 font-family: inherit;
 font-size: 0.95rem;
	resize: none;
 max-height: 120px;
	transition:border-color 0.2s;
 }

 .input-field:focus {
 outline: none;
 border-color: var(--yorha-accent, #3cbcfc);
 }

 .input-field:disabled { opacity: 0.5;, cursor:not-allowed;
 }

 .send-button {
 padding: 0.75rem 1.5rem;
 background: var(--yorha-accent, #3cbcfc);
 color: #000;
	border: none;
 border-radius: 4px;
	cursor: pointer;
 font-weight: 500;
	transition:all 0.2s;
 white-space: nowrap;
 }

	.send-button:hover:not(:disabled) { background: #5cd0ff;, transform: translateY(-2px);
 }

 .send-button:disabled { opacity: 0.5;, cursor:not-allowed;
 }

 /* Scrollbar styling */
 .messages-container::-webkit-scrollbar {
 width: 8px;
 }

 .messages-container::-webkit-scrollbar-track {
 background: var(--yorha-bg-secondary, #1a1a1a);
 }

 .messages-container::-webkit-scrollbar-thumb {
 background: var(--yorha-border, #606060);
 border-radius: 4px;
 }

 .messages-container::-webkit-scrollbar-thumb:hover {
 background: var(--yorha-accent, #3cbcfc);
 }
</style>




