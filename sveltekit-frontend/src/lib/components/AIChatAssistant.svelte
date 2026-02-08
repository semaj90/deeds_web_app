<script lang="ts">
 let { caseId, initialContext } = $props<{ caseId: string initialContext: string;
 }>();

	let messages = $state<{ sender: 'user' | 'ai'; text: string }[]>([]);

	$effect(() => {
		messages = [{
			sender: 'ai',
			text: `Hello! I'm your AI Legal Assistant for Case ID: ${caseId}. How can I help you today?`
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

 // Simulate AI response
 await new Promise((resolve) => setTimeout(resolve, 1500)); // Simulate network delay

 const aiResponse = `Acknowledged: "${userMessage}". Based on the context of Case ID ${ caseId } and your request, I am generating a detailed analysis.`;
 messages = [...messages, { sender: 'ai', text: aiResponse }];
 isThinking = false;
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
 .chat-input { display: flex padding: 10px 15px;
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
	cursor:not-allowed;
 }
</style>



