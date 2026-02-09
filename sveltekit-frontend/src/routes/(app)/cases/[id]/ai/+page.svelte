<script lang="ts">
 import { page } from '$app/state';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

 let id = $derived(page.params.id);
 let messages = $state<any[]>([]);
 let input = $state('');
 let loading = $state(false);

 const quickActions = [
 { label: 'Summarize Case', prompt: 'Summarize this case so far' },
	{ label: 'Suggest Charges', prompt: 'What charges should be filed based on the evidence?' },
	{ label: 'Find Weaknesses', prompt: 'What are the weaknesses in the current evidence?' },
	{ label: 'Draft Probable Cause', prompt: 'Draft a probable cause statement' }
 ];

 async function sendMessage(prompt?: string) {
 const messageText = prompt || input;
 if (!messageText.trim()) return;

 messages = [...messages, { role: 'user', content: messageText }];
 input = '';
 loading = true;

 try {
 const res = await fetch('/api/legal/chat', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
caseId: id,
 message: messageText,
 context: 'case_analysis'
 })
 });

 if (res.ok) {
 const data = await res.json();
 messages = [...messages, { role: 'assistant', content: data.response }];
 }
 } catch (err) {
 console.error('Failed to send message:', err);
 messages = [...messages, { role: 'assistant', content: 'Error: Failed to get response' }];
 } finally {
 loading = false;
 }
 }
</script>

<div class="ai-tab">
 <div class="ai-header">
 <h2>🤖 AI Legal Assistant</h2>
 </div>

 <div class="quick-actions">
 {#each quickActions as action}
 <button onclick={() => sendMessage(action.prompt)}>
 {action.label}
 </button>
 {/each}
 </div>

 <div class="messages">
 {#each messages as message}
 <div class="message {message.role}">
 <div class="content">{message.content}</div>
 </div>
 {/each}
 {#if loading}
 <div class="message assistant loading">
 <div class="typing">Thinking...</div>
 </div>
 {/if}
 </div>

 <div class="input-area">
 <input
 type="text"
 bind:value={input}
 placeholder="Ask the AI assistant..."
 onkeydown={(e) => e.key === 'Enter' && sendMessage()}
 disabled={loading}
 />
 <button onclick={() => sendMessage()} disabled={loading || !input.trim()}>
 Send
 </button>
 </div>
</div>

<style>
 .ai-tab {
 display: flex;
 flex-direction: column;
	height: 100%;
 }

 .ai-header {
 padding: 1rem;
 border-bottom: 1px solid #e5e7eb;
 }

 .quick-actions { display: flex;
		gap: 0.5rem;
 padding: 1rem;
 border-bottom: 1px solid #e5e7eb;
 overflow-x: auto;
 }

 .quick-actions button {
 padding: 0.5rem 1rem;
 white-space: nowrap;
	border: 1px solid #d1d5db;
 border-radius: 4px;
	background: white;
 cursor: pointer;
 font-size: 0.875rem;
 }

 .messages {
 flex: 1;
 overflow-y: auto;
	padding: 1rem;
 display: flex;
 flex-direction: column;
	gap: 1rem;
 }

 .message { display: flex;
		gap: 0.5rem;
 }

 .message.user {
 justify-content: flex-end;
 }

 .message.user .content { background: #3b82f6;
		color: white;
 padding: 0.75rem;
 border-radius: 4px;
 max-width: 80%;
 }

 .message.assistant .content { background: #f3f4f6;
		padding: 0.75rem;
 border-radius: 4px;
 max-width: 80%;
 }

 .input-area { display: flex;
		gap: 0.5rem;
 padding: 1rem;
 border-top: 1px solid #e5e7eb;
 }

 .input-area input { flex: 1;
		padding: 0.5rem;
 border: 1px solid #d1d5db;
 border-radius: 4px;
 }

 .input-area button {
 padding: 0.5rem 1rem;
 background: #3b82f6;
	color: white;
 border: none;
 border-radius: 4px;
	cursor: pointer;
 }

 .input-area button:disabled { opacity: 0.5;
		cursor:not-allowed;
 }

 .typing {
 color: #666;
 }
</style>
