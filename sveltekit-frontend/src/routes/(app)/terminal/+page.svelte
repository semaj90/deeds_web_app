<script lang="ts">
 import Button from '$lib/components/ui/button/Button.svelte';
 import Textarea from '$lib/components/ui/textarea/Textarea.svelte';
 import Bot from 'lucide-svelte/icons/bot';
 import Loader2 from 'lucide-svelte/icons/loader-2';
 import Send from 'lucide-svelte/icons/send';
 import Users from 'lucide-svelte/icons/users';
 import { tick } from 'svelte';
 type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  keywords?: string[];
  keyPhrases?: string[];
  suggestions?: string[];
 };

 let messages = $state<ChatMessage[]>([]);
 let currentMessage = $state('');
 let isTyping = $state(false);
 let sessionId = $state('local-session-' + Date.now());
 let caseId = $state<string | null>(null);
 let chatContainer: HTMLElement;

 // Auto-scroll to bottom of chat
 $effect(() => {
  if (messages.length) {
   scrollToBottom();
  }
 });

 function scrollToBottom() {
  if (chatContainer) {
   chatContainer.scrollTop = chatContainer.scrollHeight;
  }
 }

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
    throw new Error('Failed to send message');
   }

   const data = await response.json();

   // Add assistant message
   messages = [...messages, {
    id: crypto.randomUUID(),
    role: 'assistant',
    content: data.response || 'No response generated.',
    timestamp: new Date(),
    keywords: data.context?.keywords,
    keyPhrases: data.context?.keyPhrases,
    suggestions: data.context?.suggestions
   }];

  } catch (error) {
   console.error('Chat error:', error);
   messages = [...messages, {
    id: crypto.randomUUID(),
    role: 'assistant',
    content: 'Error: Could not connect to the AI service. Please try again.',
    timestamp: new Date()
   }];
  } finally {
   isTyping = false;
   await tick();
   scrollToBottom();
  }
 }

 function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
   e.preventDefault();
   sendMessage();
  }
 }
</script>

<div class="terminal-container">
 <header class="terminal-header">
  <div class="header-left">
   <Bot class="icon-lg" />
   <div>
    <h1>YoRHa COMMAND TERMINAL</h1>
    <div class="status">
     <span class="status-dot"></span>
     SYSTEM ONLINE
    </div>
   </div>
  </div>

  <div class="header-right">
   <div class="session-info">
    SESSION: {sessionId.slice(0, 8)}
   </div>
  </div>
 </header>

 <div class="chat-viewport" bind:this={chatContainer}>
  {#if messages.length === 0}
   <div class="empty-state">
    <Bot size={48} />
    <p>Initialize communication sequence...</p>
    <small>Type a command or query to begin.</small>
   </div>
  {/if}

  {#each messages as msg (msg.id)}
   <div class="message-row {msg.role}">
    <div class="avatar">
     {#if msg.role === 'assistant'}
      <Bot size={20} />
     {:else}
      <Users size={20} />
     {/if}
    </div>

    <div class="message-content">
     <div class="sender">{msg.role === 'user' ? 'OPERATOR' : 'YoRHa UNIT'}</div>
     <div class="text">{msg.content}</div>

     {#if msg.role === 'assistant' && msg.suggestions?.length}
      <div class="suggestions">
       {#each msg.suggestions as suggestion}
        <button class="suggestion-chip" onclick={() => {
         currentMessage = suggestion;
         // Optional: Auto-send
        }}>
         {suggestion}
        </button>
       {/each}
      </div>
     {/if}
    </div>

    <div class="timestamp">
     {msg.timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
    </div>
   </div>
  {/each}

  {#if isTyping}
   <div class="message-row assistant typing">
    <div class="avatar"><Bot size={20} /></div>
    <div class="message-content">
     <div class="sender">YoRHa UNIT</div>
     <div class="typing-indicator">
      <Loader2 class="animate-spin" size={16} />
      <span>Processing input stream...</span>
     </div>
    </div>
   </div>
  {/if}
 </div>

 <footer class="input-area">
  <div class="input-wrapper">
   <Textarea
    placeholder="Enter command execution parameters..."
    bind:value={currentMessage}
    onkeydown={handleKeydown}
    class="terminal-input"
    rows={1}
   />
   <Button
    variant="default"
    size="icon"
    class="send-btn"
    onclick={sendMessage}
    disabled={isTyping || !currentMessage.trim()}
   >
    <Send size={18} />
   </Button>
  </div>
  <div class="disclaimer">
   CAUTION: System responses generated by AI models. Verify critical legal information manually.
  </div>
 </footer>
</div>

<style>
 :global(body) {
  margin: 0;
  background-color: #0c0a09;
  color: #e7e5e4;
 }

 .terminal-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  font-family: 'JetBrains Mono', monospace;
  background-color: #0c0a09;
  background-image: linear-gradient(rgba(12, 10, 9, 0.9), rgba(12, 10, 9, 0.9)),
        url('/grid-pattern.png');
 }

 .terminal-header {
  padding: 1rem 1.5rem;
  background: #1c1917;
  border-bottom: 2px solid #44403c;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.5);
  z-index: 10;
 }

 .header-left {
  display: flex;
  align-items: center;
  gap: 1rem;
 }

 h1 {
  font-size: 1.25rem;
  margin: 0;
  letter-spacing: 0.1em;
  color: #fafaf9;
 }

 .status {
  font-size: 0.75rem;
  color: #10b981;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.25rem;
 }

 .status-dot {
  width: 8px;
  height: 8px;
  background: #10b981;
  border-radius: 50%;
  box-shadow: 0 0 8px #10b981;
 }

 .session-info {
  font-size: 0.75rem;
  color: #78716c;
  border: 1px solid #44403c;
  padding: 0.25rem 0.75rem;
  border-radius: 4px;
 }

 .chat-viewport {
  flex: 1;
  overflow-y: auto;
  padding: 2rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  scroll-behavior: smooth;
 }

 .empty-state {
  margin: auto;
  text-align: center;
  color: #57534e;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
 }

 .empty-state p {
  font-size: 1.5rem;
  margin: 0;
 }

 .message-row {
  display: flex;
  gap: 1rem;
  max-width: 80%;
  animation: fadeIn 0.3s ease-out;
 }

 .message-row.user {
  margin-left: auto;
  flex-direction: row-reverse;
 }

 .message-row.assistant {
  margin-right: auto;
 }

 @keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
 }

 .avatar {
  width: 36px;
  height: 36px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
 }

 .user .avatar {
  background: #2563eb;
  color: white;
 }

 .assistant .avatar {
  background: #44403c;
  color: #e7e5e4;
  border: 1px solid #57534e;
 }

 .message-content {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
 }

 .sender {
  font-size: 0.7rem;
  color: #78716c;
 }

 .user .sender {
  text-align: right;
 }

 .text {
  background: #1c1917;
  padding: 1rem;
  border-radius: 4px;
  border: 1px solid #292524;
  line-height: 1.6;
  white-space: pre-wrap;
  color: #d6d3d1;
 }

 .user .text {
  background: #1e3a8a;
  border-color: #1e40af;
  color: white;
 }

 .timestamp {
  font-size: 0.7rem;
  color: #44403c;
  align-self: flex-end;
  margin-bottom: 0.5rem;
 }

 .typing-indicator {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  color: #78716c;
  font-size: 0.875rem;
  padding: 1rem;
  background: #1c1917;
  border: 1px dashed #44403c;
  border-radius: 4px;
 }

 .suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.5rem;
 }

 .suggestion-chip {
  background: #292524;
  border: 1px solid #44403c;
  color: #a8a29e;
  padding: 0.25rem 0.75rem;
  font-size: 0.75rem;
  font-family: 'JetBrains Mono', monospace;
  cursor: pointer;
  transition: all 0.2s;
 }

 .suggestion-chip:hover {
  background: #44403c;
  color: white;
  border-color: #78716c;
 }

 .input-area {
  padding: 1.5rem;
  background: #1c1917;
  border-top: 1px solid #292524;
 }

 .input-wrapper {
  display: flex;
  gap: 1rem;
  max-width: 1200px;
  margin: 0 auto;
  align-items: flex-end;
 }

 :global(.terminal-input) {
  background: #0c0a09 !important;
  border: 1px solid #44403c !important;
  color: #e7e5e4 !important;
  font-family: 'JetBrains Mono', monospace !important;
  resize: none;
  min-height: 50px;
 }

 :global(.terminal-input:focus) {
  border-color: #2563eb !important;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.2);
 }

 .send-btn {
  height: 50px;
  width: 50px;
  flex-shrink: 0;
  background: #2563eb;
 }

 .send-btn:hover {
  background: #1d4ed8;
 }

 .disclaimer {
  text-align: center;
  font-size: 0.7rem;
  color: #44403c;
  margin-top: 1rem;
 }
</style>
