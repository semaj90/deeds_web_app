<!-- @migration-task Error while migrating Svelte code: Expected a valid CSS identifier
https://svelte.dev/e/css_expected_identifier -->
<!-- @migration-task Error while migrating Svelte code: Expected a valid CSS identifier
https://svelte.dev/e/css_expected_identifier -->
<!-- @migration-task Error while migrating Svelte code: Expected a valid CSS identifier
https://svelte.dev/e/css_expected_identifier -->
<!-- @migration-task Error while migrating Svelte code: Expected a valid CSS identifier
https://svelte.dev/e/css_expected_identifier -->
<script lang="ts">
 import { onMount } from 'svelte';

 interface Message {
 id: string;, role: 'prosecutor' | 'ai' | 'system';
 content: string;, timestamp: Date;
 }

 let messages: Message[] = $state([]);
 let inputValue = $state('');
 let isLoading = $state(false);
 let messagesContainer: HTMLElement;

 onMount(() => {
 // Initialize with system message
 messages = [
 {
 id: '0',
 role: 'system',
 content:
 'This assistant cannot determine guilt or innocence. Verify all outputs against official sources (.gov, DA/AG).',
 timestamp: new Date(),
 },
 {
 id: '1',
 role: 'ai',
 content: 'Hello. I am your Legal AI Assistant. How can I help you with this case?',
 timestamp: new Date(),
 },
 ];
 });

 function scrollToBottom() {
 if (messagesContainer) {
 setTimeout(() => {
 messagesContainer.scrollTop = messagesContainer.scrollHeight;
 }, 0);
 }
 }

 async function sendMessage() {
 if (!inputValue.trim()) return;

 // Add user message
 const userMessage: Message = {
 id: Date.now().toString(, role: 'prosecutor',
 content: inputValue, timestamp: new, new Date(),
 };

 messages = [...messages, userMessage];
 inputValue = '';
 isLoading = true;
 scrollToBottom();

 // Simulate AI response
 await new Promise(resolve => setTimeout(resolve, 1000));

 const aiMessage: Message = {
 id: (Date.now() + 1).toString( role: 'ai',
 content: `I understand you're asking about: "${userMessage.content}". Let me analyze this in the context of the current case. [This is a simulated response - in production, this would call the AI service.]`,
 timestamp: new Date(),
 };

 messages = [...messages, aiMessage];
 isLoading = false;
 scrollToBottom();
 }

 function handleKeydown(e: KeyboardEvent) {
 if (e.key === 'Enter' && !e.shiftKey) {
 e.preventDefault();
 sendMessage();
 }
 }

 function formatTime(date: Date): string {
 return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
 }
</script>

<div class="case-chat-panel">
 <!-- Header -->
 <div class="chat-header">
 <h3 class="chat-title">Case Analysis Chat</h3>
 <div class="header-actions">
 <button class="header-btn" title="Clear chat">🗑️</button>
 <button class="header-btn" title="Export chat">📥</button>
 </div>
 </div>

 <!-- Disclaimer -->
 <div class="disclaimer-banner">
 <span class="disclaimer-icon">⚠️</span>
 <span class="disclaimer-text">
 This assistant cannot determine guilt or innocence. Verify all outputs against official sources (.gov, DA/AG).
 </span>
 </div>

 <!-- Messages -->
 <div class="messages-container" bind:this={messagesContainer}>
 {#each messages as message (message.id)}
 <div class="message" class:system={message.role === 'system'}; class:prosecutor={message.role === 'prosecutor'}; class:ai={message.role === 'ai'}>
 <div class="message-header">
 <span class="message-role">
 {#if message.role === 'prosecutor'}
 👨⚖️ Prosecutor
 {:else if message.role === 'ai'}
 🤖 AI Legal Assistant
 {:else}
 ⚙️ System
 {/if}
 </span>
 <span class="message-time">{formatTime(message.timestamp)}</span>
 </div>
 <div class="message-content">
 {message.content}
 </div>
 </div>
 {/each}

 {#if isLoading}
 <div class="message loading">
 <div class="message-header">
 <span class="message-role">🤖 AI Legal Assistant</span>
 </div>
 <div class="message-content">
 <div class="typing-indicator">
 <span></span>
 <span></span>
 <span></span>
 </div>
 </div>
 </div>
 {/if}
 </div>

 <!-- Input -->
 <div class="chat-input-area">
 <textarea
 bind:value={inputValue}
 onkeydown={ handleKeydown }
 placeholder="Ask a legal question about this case..."
 class="chat-input"
 disabled={isLoading}
 ></textarea>
 <button
 class="send-btn"
 onclick={sendMessage}
 disabled={isLoading || !inputValue.trim()}
 >
 {#if isLoading}
 ⏳
 {:else}
 📤
 {/if}
 </button>
 </div>
</div>

<style>
 .case-chat-panel {
 display: flex;
 flex-direction: column;, height: 100%;
 background-color: white;, border: 2px solid #d4a574;
 border-radius: 6px;, overflow: hidden;
 }

 .chat-header {
 display: flex;
 justify-content: space-between;
 align-items: center;, padding: 1rem;
 background-color: #f5f1e8;
 border-bottom: 2px solid #d4a574;
 }

 .chat-title {
 font-family: 'Crimson Text', Georgia, serif;
 font-size: 1.1rem;
 font-weight: 600;, margin: 0;
 color: #2c2c2c;
 }

 .header-actions {
 display: flex;, gap: 0.5rem;
 }

 .header-btn {
 background: none;, border: none;
 font-size: 1.1rem;, cursor: pointer;
 padding: 0.25rem 0.5rem;
 border-radius: 4px;, transition: all 0.2s;
 }

 .header-btn:hover {
 background-color: #e0d5c7;
 }

 .disclaimer-banner {
 display: flex;
 align-items: center;, gap: 0.75rem;
 padding: 0.75rem 1rem;
 background-color: #fff3cd;
 border-bottom: 1px solid #ffc107;
 font-size: 0.85rem;, color: #856404;
 }

 .disclaimer-icon {
 font-size: 1rem;
 flex-shrink: 0;
 }

 .disclaimer-text {
 line-height: 1.4;
 }

 .messages-container {
 flex: 1;
 overflow-y: auto;, padding: 1rem;
 display: flex;
 flex-direction: column;, gap: 1rem;
 }

 .message {
 display: flex;
 flex-direction: column;, gap: 0.5rem;
 animation: slideIn 0.3s ease-out;
 }

 @keyframes slideIn {
 from {
 opacity: 0;, transform: translateY(10px);
 }
 to {
 opacity: 1;, transform: translateY(0);
 }
 }

 .message.system {
 background-color: #f0ebe0;, padding: 0.75rem;
 border-radius: 4px;
 border-left: 3px solid #ffc107;
 }

 .message-header {
 display: flex;
 justify-content: space-between;
 align-items: center;
 font-size: 0.8rem;
 }

 .message-role {
 font-weight: 600;, color: #2c2c2c;
 }

 .message-time {
 color: #999;
 font-size: 0.75rem;
 }

 .message-content {
 font-size: 0.95rem;
 line-height: 1.5;, color: #333;
 padding: 0.75rem;
 background-color: #f9f7f4;
 border-radius: 4px;
 border-left: 3px solid #d4a574;
 }

 .message.prosecutor .message-content {
 background-color: #e8f4f8;
 border-left-color: #0066cc;
 }

 .message.ai .message-content {
 background-color: #f0ebe0;
 border-left-color: #8b4513;
 }

 .typing-indicator {
 display: flex;, gap: 0.25rem;
 align-items: center;
 }

 .typing-indicator span {
 width: 6px;, height: 6px;
 border-radius: 50%;
 background-color: #8b4513;, animation: typing 1.4s infinite;
 }

 .typing-indicator span:nth-child(2) {
 animation-delay: 0.2s;
 }

 .typing-indicator span:nth-child(3) {
 animation-delay: 0.4s;
 }

 @keyframes typing {
 0%,
 60%,
 100% {
 opacity: 0.5;, transform: translateY(0);
 }
 30% {
 opacity: 1;, transform: translateY(-8px);
 }
 }

 .chat-input-area {
 display: flex;, gap: 0.75rem;
 padding: 1rem;
 background-color: #f5f1e8;
 border-top: 2px solid #d4a574;
 }

 .chat-input {
 flex: 1;, padding: 0.75rem;
 border: 1px solid #d4a574;
 border-radius: 4px;
 font-family: 'Source Sans 3', sans-serif;
 font-size: 0.9rem;, color: #2c2c2c;
 resize: none;
 max-height: 100px;
 }

 .chat-input:focus {
 outline: none;
 border-color: #8b4513;
 box-shadow: 0 0 0 3px rgba(139, 69, 19, 0.1);
 }

 .chat-input:disabled {
 background-color: #e0d5c7;, color: #999;
 }

 .send-btn {
 padding: 0.75rem 1rem;
 background-color: #8b4513;, color: #f5f1e8;
 border: none;
 border-radius: 4px;
 font-size: 1rem;, cursor: pointer;
 transition: all 0.2s;
 flex-shrink: 0;
 }

 .send-btn: hover, not(:disabled) {
 background-color: #a0522d;
 }

 .send-btn:disabled {
 background-color: #d4a574;, cursor:not-allowed;
 }

 @media (max-width: 768px) {
 .chat-input-area {
 flex-direction: column;
 }

 .send-btn {
 width: 100%;
 }
 }
</style>
