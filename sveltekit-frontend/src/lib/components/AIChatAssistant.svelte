<script lang="ts">
  import { chat } from '$lib/ai/unified-generation.js';

  let { caseId, initialContext }: { caseId: string; initialContext: string } = $props();

	let messages = $state<{ sender: 'user' | 'ai', text: string }[]>([]);

	$effect(() => {
		messages = [{
			sender: 'ai',
			text: `Hello! I'm your AI Legal Assistant. How can I help you analyze this context?`
		}];
	});
 let currentInput = $state('');
 let isThinking = $state(false);

 async function sendMessage() {
 if (!currentInput.trim()) return;

 const userMessage = currentInput;
 messages = [...messages, { sender: 'user', text: userMessage }];
 currentInput = '';
 isThinking = true;

 try {
  const history = messages.slice(0, -1).map(m => ({
  role: m.sender === 'ai' ? 'assistant' : 'user',
  content: m.text
  }));

  // Prepend initial context invisibly to the first interaction
  const prompt = history.length === 1 
  ? `Context for analysis: ${initialContext}\n\nUser Question: ${userMessage}`
  : userMessage;

  const aiResponse = await chat(prompt, { history });
  messages = [...messages, { sender: 'ai', text: aiResponse }];
 } catch (error) {
  messages = [...messages, { sender: 'ai', text: 'Error generating response. Please try again.' }];
  console.error('Chat error:', error);
 } finally {
  isThinking = false;
 }
 }
</script>

<div class="ai-chat-assistant">
 <div class="chat-header">
 <h3>AI Assistant for Case: { caseId }</h3>
 </div>
 <div class="chat-messages">
 {#each messages as message}
 <div class="message {message.sender}">
 <span class="sender-label">{message.sender === 'user' ? 'You' : 'AI'}:</span>
 {message.text}
 </div>
 {/each}
 {#if isThinking}
 <div class="message ai thinking">
 <span class="sender-label">AI:</span>
 Thinking...
 </div>
 {/if}
 </div>
 <div class="chat-input">
 <textarea
 bind:value={currentInput}
 onkeydown={(e) => {
 if (e.key === 'Enter' && !e.shiftKey) {
 e.preventDefault();
 sendMessage();
 }
 }}
 placeholder="Ask a question or provide instructions..."
 rows="3"
 disabled={isThinking}
 ></textarea>
 <button onclick={sendMessage} disabled={isThinking || !currentInput.trim()}>Send</button>
 </div>
</div>

<style>
 .ai-chat-assistant {
 display: flex;
 flex-direction: column;
	height: 500px;
	border: 1px solid #eee;
 border-radius: 8px;
 background-color: #fff;
	overflow: hidden;
 }
 .chat-header {
 padding: 10px 15px;
 background-color: #f0f0f0;
 border-bottom: 1px solid #eee;
 }
 .chat-messages {
 flex-grow: 1;
	padding: 15px;
 overflow-y: auto;
	display: flex;
 flex-direction: column;
	gap: 10px;
 }
 .message {
 padding: 8px 12px;
 border-radius: 15px;
 max-width: 80%;
 word-wrap: break-word;
 }
 .message.user {
 background-color: #e0f7fa;
 align-self: flex-end;
 }
 .message.ai {
 background-color: #f0f0f0;
 align-self: flex-start;
 }
 .message.ai.thinking {
 font-style: italic;
	color: #666;
 }
 .sender-label {
 font-weight: bold;
 margin-right: 5px;
 }
 .chat-input {
	display: flex;
	padding: 10px 15px;
	border-top: 1px solid #eee;
	gap: 10px;
 }
 .chat-input textarea {
 flex-grow: 1;
	border: 1px solid #ddd;
 border-radius: 4px;
	padding: 8px;
 font-family: inherit;
	resize: vertical;
 min-height: 60px;
 }
 .chat-input button {
 padding: 8px 15px;
 background-color: #667eea;
	color: white;
	border: none;
 border-radius: 4px;
	cursor: pointer;
 }
 .chat-input button:disabled {
	background-color: #ccc;
	cursor: not-allowed;
 }
</style>



