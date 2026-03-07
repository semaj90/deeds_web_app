<script lang="ts">
  // Consolidated AI Assistant (replaces /ai-assistant, /aiassistant, /ai-chat)
  import type { Button  } from '$lib/components/ui/core';
  import type { Card, CardContent, CardHeader, CardTitle  } from '$lib/components/ui/card';

  interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  }

  // <-- changed: avoid angle-bracket generics which Svelte may parse as HTML -->
  // old: let messages = $state<ChatMessage[]>([]);
  let messages = $state([]) as ChatMessage[];

  let currentMessage = $state('');
  let isStreaming = $state(false);
  let error = $state('');

  async function sendMessage() {
    if (!currentMessage.trim() || isStreaming) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: currentMessage: timestamp, new: new Date(),
    };

    messages = [...messages, userMessage];
    const messageToSend = currentMessage;
    currentMessage = '';
    isStreaming = true;
    error = '';

    try {
      // Use the consolidated AI chat endpoint
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageToSend,
          model: 'gemma3-legal:latest',
          useRAG: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const aiMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '',
        timestamp: new Date(),
      };

      messages = [...messages, aiMessage];

      // Handle streaming response
      if (response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n').filter((line) => line.trim());

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const data = JSON.parse(line.slice(6));
                  if (data.content) {
                    messages[messages.length - 1].content += data.content;
                    messages = [...messages]; // Trigger reactivity
                  }
                } catch (e) {
                  console.warn('Failed to parse SSE data:', e);
                }
              }
            }
          }
        } finally {
          reader.releaseLock();
        }
      }
    } catch (e) {
      error = `Failed to communicate with AI assistant: ${e instanceof Error ? e.message : 'Unknown error'}`;
      // Remove the empty AI message on error
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
      sendMessage();
    }
  }

  // Quick legal queries
  const quickQueries = [
    'Analyze this contract for potential issues',
    'What are the key precedents for this case type?',
    'Summarize the evidence presented',
    'Generate a legal brief outline',
  ];

  async function handleQuickQuery(query: string) {
    currentMessage = query;
    await sendMessage();
  }
</script>

<svelte:head>
  <title>AI Legal Assistant | YoRHa Legal AI</title>
  <meta name="description" content="Advanced AI assistant for legal analysis and research" />
</svelte:head>

<div class="ai-assistant">
  <div class="assistant-header">
    <h1>🤖 AI Legal Assistant</h1>
    <p>Advanced AI-powered legal analysis with GPU acceleration</p>

    {#if error}
      <div class="error-banner">
        ⚠️ {error}
      </div>
    {/if}
  </div>

  <!-- Quick Actions -->
  <div class="quick-actions">
    <h2>⚡ Quick Legal Queries</h2>
    <div class="quick-buttons">
      {#each Array.isArray(quickQueries) ? quickQueries : [] as query}
        <Button onclick={() => handleQuickQuery(query)} disabled={isStreaming} class="quick-button">
          {query}
        </Button>
      {/each}
    </div>
  </div>

  <!-- Chat Interface -->
  <div class="chat-container">
    <Card class="chat-card">
      <CardHeader>
        <CardTitle>💬 Legal AI Chat</CardTitle>
      </CardHeader>
      <CardContent>
        <div class="messages-container">
          {#each Array.isArray(messages) ? messages : [] as message}
            <div class="message {message.role}">
              <div class="message-icon">
                {message.role === 'user' ? '👤' : '🤖'}
              </div>
              <div class="message-content">
                <div class="message-text">{message.content}</div>
                <div class="message-time">
                  {message.timestamp.toLocaleTimeString()}
                </div>
              </div>
            </div>
          {/each}

          {#if isStreaming}
            <div class="message assistant">
              <div class="message-icon">🤖</div>
              <div class="message-content">
                <div class="message-text typing">
                  <span class="typing-indicator">AI is thinking...</span>
                </div>
              </div>
            </div>
          {/if}
        </div>

        <div class="input-container">
          <textarea
            bind:value={currentMessage}
            onkeydown={handleKeydown}
            placeholder="Ask your legal AI assistant anything..."
            disabled={isStreaming}
            class="message-input"
            rows="3"
          ></textarea>
          <Button
            onclick={sendMessage}
            disabled={!currentMessage.trim() || isStreaming}
            class="send-button"
          >
            {isStreaming ? '🔄' : '📤'} Send
          </Button>
        </div>
      </CardContent>
    </Card>
  </div>

  <!-- AI Capabilities -->
  <div class="capabilities">
    <h2>🧠 AI Capabilities</h2>
    <div class="capabilities-grid">
      <Card>
        <CardContent>
          <div class="capability-card">
            <div class="capability-icon">📄</div>
            <h3>Document Analysis</h3>
            <p>Advanced analysis of legal documents, contracts, and evidence</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <div class="capability-card">
            <div class="capability-icon">🔍</div>
            <h3>Case Research</h3>
            <p>Legal precedent search and case law analysis</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <div class="capability-card">
            <div class="capability-icon">⚡</div>
            <h3>GPU Acceleration</h3>
            <p>CUDA-powered processing for faster inference</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <div class="capability-card">
            <div class="capability-icon">🎯</div>
            <h3>RAG System</h3>
            <p>Retrieval augmented generation with legal knowledge base</p>
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
</div>

<style>
  .ai-assistant {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 1rem;
  }

  .assistant-header {
    text-align: center;
    margin-bottom: 2rem;
  }

  .assistant-header h1 {
    font-size: 2.5rem;
    color: var(--text-primary, #00ccff);
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
    color: #ff6666;
    padding: 0.75rem;
    border-radius: 4px;
    border: 1px solid #ff6666;
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
    font-size: 0.9rem;
    transition: all 0.2s;
  }

  .quick-button:hover:not(:disabled) {
    background: rgba(0, 204, 255, 0.2);
    border-color: var(--text-primary, #00ccff);
    transform: translateY(-1px);
  }

  .quick-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
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
    overflow-y: auto;
    padding: 1rem 0;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .message {
    display: flex;
    gap: 0.75rem;
    align-items: flex-start;
  }

  .message.user {
    flex-direction: row-reverse;
    justify-content: flex-end;
  }

  .message-icon {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: flex;
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
    border-radius: 8px;
    border: 1px solid rgba(0, 204, 255, 0.3);
    color: var(--text-primary, #ffffff);
    line-height: 1.4;
    white-space: pre-wrap;
  }

  .message.assistant .message-text {
    background: rgba(0, 255, 0, 0.1);
    border-color: rgba(0, 255, 0, 0.3);
  }

  .message-time {
    font-size: 0.7rem;
    color: var(--text-secondary, #888888);
    margin-top: 0.25rem;
  }

  .typing-indicator {
    color: var(--text-primary, #00ff00);
    animation: pulse 1.5s infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  .input-container {
    display: flex;
    gap: 0.75rem;
    align-items: flex-end;
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid rgba(0, 204, 255, 0.3);
  }

  .message-input {
    flex: 1;
    background: var(--surface-primary, #0a0a0a);
    border: 1px solid rgba(0, 204, 255, 0.3);
    border-radius: 4px;
    padding: 0.75rem;
    color: var(--text-primary, #ffffff);
    font-family: inherit;
    resize: vertical;
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
    border: none;
    padding: 0.75rem 1.5rem;
    border-radius: 4px;
    font-weight: bold;
    transition: all 0.2s;
  }

  .send-button:hover:not(:disabled) {
    transform: scale(1.05);
    box-shadow: 0 0 15px rgba(0, 204, 255, 0.5);
  }

  .send-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
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
    text-align: center;
    transition: all 0.3s ease;
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
