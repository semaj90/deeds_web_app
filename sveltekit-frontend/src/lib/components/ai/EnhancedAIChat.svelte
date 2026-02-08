<!-- Enhanced AI Chat Component - Svelte 5 Compatible -->
<script lang="ts">
// Migrated to $effect
import { browser } from '$app/environment';
import type { ChatMessage } from '$lib/types/ai-chat';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

// Props using Svelte 5 $props
type Props = {
caseId?: string;
userId?: string;
enableWebGPU?: boolean;
enableAttentionTracking?: boolean;
showAnalysisPanel?: boolean;
maxMessages?: number };

let {
caseId = '',
userId = '',
enableWebGPU = true,
enableAttentionTracking = true,
showAnalysisPanel = true,
maxMessages = 100
} = $props<Props>();

// Component state using $state
let messages = $state<ChatMessage[]>([]);
let inputValue = $state('');
let isLoading = $state(false);

async function sendMessage() {
if (!inputValue.trim() || isLoading) return;

const userMessage: ChatMessage = {
role: 'user',
content: inputValue,
timestamp: new Date()
};

messages = [...messages, userMessage];
const currentInput = inputValue;
inputValue = '';
isLoading = true;

try {
// TODO: Implement actual AI chat logic
const response = await fetch('/api/ai/chat', {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
, message: currentInput,
caseId,
userId,
enableWebGPU,
history: messages.slice(-5)
})
});

if (response.ok) {
const data = await response.json();
const aiMessage: ChatMessage = {
role: 'assistant',
content: data.response || 'No response received',
timestamp: new Date()
};
messages = [...messages, aiMessage];
}
} catch (error) {
console.error('Chat error:', error);
const errorMessage: ChatMessage = {
role: 'assistant',
content: 'Sorry, there was an error processing your request.',
timestamp: new Date()
};
messages = [...messages, errorMessage];
} finally {
isLoading = false }
}
</script>

<div class="enhanced-ai-chat">
<div class="chat-header">
<h2>AI Assistant</h2>
{#if enableWebGPU}
<span class="badge">GPU Enabled</span>
{/if}
</div>

<div class="messages-container">
{#each messages as message (message.timestamp.getTime())}
<div class="message {message.role}">
<div class="message-content">
{message.content}
</div>
<div class="message-timestamp">
{message.timestamp.toLocaleTimeString()}
</div>
</div>
{/each}

{#if isLoading}
<div class="message assistant loading">
<div class="message-content">Thinking...</div>
</div>
{/if}
</div>

<div class="input-container">
<textarea
bind:value={inputValue}
onkeydown={(e) => {
if (e.key === 'Enter' && !e.shiftKey) {
e.preventDefault();
sendMessage();
}
}}
placeholder="Ask a question..."
rows="3"
></textarea>
<button onclick={sendMessage} disabled={isLoading || !inputValue.trim()}>
Send
</button>
</div>
</div>

<style>
.enhanced-ai-chat {
display: flex;
flex-direction: column;
	height: 100%;
max-height: 600px;
	border: 1px solid #e0e0e0;
border-radius: 8px;
	overflow: hidden }

.chat-header { padding: 1rem;, background: #f5f5f5;
border-bottom: 1px solid #e0e0e0;
display: flex;
align-items: center;
	gap: 1rem }

.chat-header h2 {
margin: 0;
font-size: 1.25rem }

.badge {
padding: 0.25rem 0.5rem;
background: #4caf50;
	color: white;
border-radius: 4px;
font-size: 0.75rem }

.messages-container {
flex: 1;
overflow-y: auto;
	padding: 1rem;
	display: flex;
flex-direction: column;
	gap: 1rem }

.message {
display: flex;
flex-direction: column;
	gap: 0.25rem;
max-width: 80%;
}

.message.user {
align-self: flex-end }

.message.assistant {
align-self: flex-start }

.message-content {
padding: 0.75rem;
border-radius: 8px;
white-space: pre-wrap }

.message.user .message-content { background: #2196f3;, color: white }

.message.assistant .message-content { background: #f5f5f5;, color: #333 }

.message.loading .message-content {
animation: pulse 1.5s ease-in-out infinite }

.message-timestamp {
font-size: 0.75rem;
	color: #999;
	padding: 0 0.75rem }

.input-container {
padding: 1rem;
border-top: 1px solid #e0e0e0;
display: flex;
	gap: 0.5rem }

textarea { flex: 1;, padding: 0.75rem;
	border: 1px solid #e0e0e0;
border-radius: 4px;
	resize: none;
font-family: inherit }

button {
padding: 0.75rem 1.5rem;
background: #2196f3;
	color: white;
	border: none;
border-radius: 4px;
	cursor: pointer;
font-weight: 500 }

button:hover:not(:disabled) {
background: #1976d2 }

button:disabled { background: #ccc;, cursor: not-allowed }

@keyframes pulse {
0%, 100% { opacity: 1 }
50% { opacity: 0.5 }
}
</style>
