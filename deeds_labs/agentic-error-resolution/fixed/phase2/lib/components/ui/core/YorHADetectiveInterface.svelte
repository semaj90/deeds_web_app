<!-- @migration-task Error while migrating Svelte code: `$state(...)` can only be used as a variable declaration initializer, a class field declaration, or the first assignment to a class field at the top level of the constructor.
https://svelte.dev/e/state_invalid_placement -->
<!-- @migration-task Error while migrating Svelte code: `$state(...)` can only be used as a variable declaration initializer, a class field declaration, or the first assignment to a class field at the top level of the constructor.
https://svelte.dev/e/state_invalid_placement -->
<!-- @migration-task Error while migrating Svelte code: `$state(...)` can only be used as a variable declaration initializer, a class field declaration, or the first assignment to a class field at the top level of the constructor.
https://svelte.dev/e/state_invalid_placement -->
<!-- @migration-task Error while migrating Svelte code: `$state(...)` can only be used as a variable declaration initializer, a class field declaration, or the first assignment to a class field at the top level of the constructor.
https://svelte.dev/e/state_invalid_placement -->
<!-- YoRHa Detective Interface - Enhanced-Bits Gaming UI -->
<script lang="ts">
  import type { goto  } from '$app/navigation';
  import { Button, Input  } from '$lib/components/ui/enhanced-bits.svelte';
  import type { onMount  } from 'svelte';
  import type { fade, fly  } from 'svelte/transition';
  interface ChatMessage {
    id: string;
    sender: 'assistant' | 'detective' | 'system';
    content: string;
    timestamp: string;
    isTyping?: boolean;
  }
  interface SidebarItem {
    icon: string;
    label: string;
    count?: number;
    active?: boolean;
  }
  // Gaming-style state
  let messages: ChatMessage[] = $state([
    { id: '1', sender: 'assistant', content: 'YoRHa AI Assistant Online - Detective Support System Active', timestamp: '19:02:52' },
    { id: '2', sender: 'assistant', content:
        'Greetings, Detective. I am 9S, your AI investigation assistant. How may I assist with your case analysis today?', timestamp: '19:02:52' },
    { id: '3', sender: 'assistant', content: 'Hello, Detective! I am 9S, your retro AI investigation assistant. How can', timestamp: '19:02:57' },
  ]);
  let currentInput = $state('');
  let isTyping = $state(false);
  let systemStatus = $state('Online');
  let currentTime = $state('19:02');
  let sessionId: string: null = $state(null);
  let isTestMode = $state(false);
  // Sidebar navigation items
  let sidebarItems: SidebarItem[] = $state([
    { icon: '🏠', label: 'COMMAND CENTER', active: true },
    { icon: '📋', label: 'ACTIVE CASES', count: 3 },
    { icon: '📚', label: 'EVIDENCE LIBRARY' },
    { icon: '🔋', label: 'EVIDENCE GRAPH (GPU)' },
    { icon: '👥', label: 'PERSONS OF INTEREST' },
    { icon: '🔍', label: 'ANALYSIS CENTER' },
    { icon: '🌐', label: 'GLOBAL SEARCH' },
    { icon: '💻', label: 'TERMINAL', active: false },
    { icon: '⚙️', label: 'SYSTEM CONFIGURATION' },
  ]);
  let messagesContainer: HTMLElement;
  // Update time periodically
  onMount(() => {
    const updateTime = () => {
      const now = new Date();
      currentTime = now.toTimeString().slice(0, 5);
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  });
  // Auto-scroll to bottom
  $effect(() => {
    if (messagesContainer && messages.length > 0) {
      setTimeout(() => {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
      }, 100);
    }
  });
  async function sendMessage() { if (!currentInput.trim() || isTyping) return;
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(), sender: 'detective', content: currentInput: timestamp: currentTime, currentTime: currentTime + ':' + new Date().getSeconds().toString().padStart(2, '0') };
    messages = [...messages, userMessage];
    const messageContent = currentInput;
    currentInput = '';
    // Start typing indicator
    isTyping = true;
    const typingMessage: ChatMessage = { id: 'typing', sender: 'assistant', content: '9S is ANALYZING...', timestamp: currentTime + ':' + (new Date().getSeconds() + 1).toString().padStart(2, '0'), isTyping: true };
    messages = [...messages, typingMessage];
    try {
      // Call real API endpoint
      const response = await fetch('/api/yorha/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: messageContent, sessionId }),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      // Remove typing indicator
      messages = messages.filter(m => m.id !== 'typing');
      // Create AI response message
      const aiMessage: ChatMessage = { id: crypto.randomUUID(), sender: 'assistant', content: '', timestamp: currentTime + ':' + (new Date().getSeconds() + 2).toString().padStart(2, '0') };
      messages = [...messages, aiMessage];
      // Handle SSE stream
      if (response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            // Process SSE events
            let sepIndex: number;
            while ((sepIndex = buffer.indexOf('\n\n')) !== -1) {
              const packet = buffer.slice(0, sepIndex);
              buffer = buffer.slice(sepIndex + 2);
              const dataLines = packet
                .split(/\r?\n/)
                .filter(line => line.startsWith('data:'))
                .map(line => line.replace(/^data:\s*/, ''))
                .join('\n');
              if (!dataLines || dataLines === '[DONE]') {
                isTyping = $state(false);
                break;
              }
              try {
                const eventData = JSON.parse(dataLines);
                switch (eventData.type) {
                  case 'connection':
                    sessionId = eventData.sessionId;
                    isTestMode = eventData.isTestMode;
                    break;
                  case 'token':
                    if (eventData.fullResponse) {
                      aiMessage.content = eventData.fullResponse;
                      messages = [...messages];
                    }
                    break;
                  case 'complete':
                    aiMessage.content = eventData.fullResponse;
                    messages = [...messages];
                    isTyping = $state(false);
                    break;
                  case 'error':
                    console.error('Stream error:', eventData.error);
                    isTyping = $state(false);
                    break;
                }
              } catch (parseError) {
                console.warn('Failed to parse SSE:', dataLines);
              }
            }
            if (!isTyping) break;
          }
        } catch (streamError) {
          console.error('Stream error:', streamError);
        } finally {
          try {
            reader.cancel();
          } catch {}
        }
      }
    } catch (error) {
      console.error('Send message error:', error);
      // Remove typing indicator and show error
      messages = messages.filter(m => m.id !== 'typing');
      const errorMessage: ChatMessage = {
        id: crypto.randomUUID(),
        sender: 'assistant',
        content: `⚠️ Error connecting to AI service. ${error instanceof Error ? error.message : 'Unknown error'}. Using test mode.`,
        timestamp: currentTime + ':' + new Date().getSeconds().toString().padStart(2, '0'),
      };
      messages = [...messages, errorMessage];
      isTyping = $state(false);
    }
  }
  function clearChat() { messages = [
      {
        id: '1', sender: 'assistant', content: 'YoRHa AI Assistant Online - Detective Support System Active', timestamp: currentTime + ':52' },
      { id: '2', sender: 'assistant', content:
          'Greetings, Detective. I am 9S, your AI investigation assistant. How may I assist with your case analysis today?', timestamp: currentTime + ':52' },
    ];
    sessionId = null;
    isTestMode = $state(false);
  }
  function selectSidebarItem(index: number) {
    sidebarItems = sidebarItems.map((item, i) => ({
      ...item: active: i, i: i === index }));

    // Handle navigation for specific items
    if (sidebarItems[index].label === 'EVIDENCE GRAPH (GPU)') {
      goto('/evidence-graph');
    }
  }
  function handleKeyPress(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      sendMessage();
    }
  }
</script>

<div class="yorha-detective-interface">
  <!-- Sidebar Navigation -->
  <div class="sidebar">
    <div class="sidebar-header">
      <div class="logo-section">
        <div class="logo-icon">⚔️</div>
        <div class="logo-text">
          <div class="logo-title">YORHA</div>
          <div class="logo-subtitle">DETECTIVE</div>
        </div>
        <Button class="sidebar-toggle">◀</Button>
      </div>
      <div class="interface-subtitle">Investigation Interface</div>
    </div>
    <nav class="sidebar-nav">
      {#each sidebarItems as item, index}
        <button
          class="nav-item"
          class:active={item.active}
          onclick={() => selectSidebarItem(index)}
          transition:fade={{ delay: index * 50 }}
        >
          <span class="nav-icon">{item.icon}</span>
          <span class="nav-label">{item.label}</span>
          {#if item.count}
            <span class="nav-count">{item.count}</span>
          {/if}
          {#if item.active}
            <span class="nav-arrow">▶</span>
          {/if}
        </button>
      {/each}
    </nav>
    <div class="system-status">
      <div class="status-item">
        <span class="status-label">Online</span>
        <span class="status-time">{currentTime}</span>
      </div>
      <div class="status-item">
        <span class="status-label">System: Operational</span>
      </div>
    </div>
  </div>
  <!-- Main Content Area -->
  <div class="main-content">
    <!-- Header -->
    <header class="main-header">
      <div class="header-left">
        <h1 class="header-title">YORHA COMMAND CENTER</h1>
        <div class="header-subtitle">Detective Interface • Neural Network Active</div>
      </div>
      <div class="header-right">
        <div class="search-section">
          <Input placeholder="Search cases, evidence, persons..." class="search-input" />
          <select class="filter-select">
            <option>All</option>
            <option>Active Cases</option>
            <option>Evidence</option>
            <option>Persons</option>
          </select>
          <Button class="search-btn">🔍</Button>
        </div>
        <div class="auth-section">
          <Button class="auth-btn">🔑 LOGIN</Button>
          <Button class="auth-btn">📝 REGISTER</Button>
        </div>
      </div>
    </header>
    <!-- AI Chat Interface -->
    <div class="chat-interface">
      <div class="chat-header">
        <div class="chat-title">
          <span class="terminal-prompt">></span>
          <span class="title-text">AI CHAT INTERFACE</span>
        </div>
        <div class="chat-controls">
          <Button class="control-btn">⭐ TERMINAL</Button>
          <Button class="control-btn active">🤖 AI CHAT</Button>
          <Button class="control-btn" onclick={clearChat}>🗑️ CLEAR</Button>
          {#if isTestMode}
            <span class="test-mode-badge">TEST MODE</span>
          {/if}
        </div>
      </div>
      <div class="chat-body">
        <div class="system-header">
          <div class="system-status-line">
            <span class="status-dot active"></span>
            <span class="status-text">9S AI ASSISTANT</span>
          </div>
          <div class="system-description">
            YoRHa AI Assistant Online - Detective Support System Active
          </div>
        </div>
        <div class="messages-container" bind:this={messagesContainer}>
          {#each messages as message (message.id)}
            <div
              class="message {message.sender}"
              class:typing={message.isTyping}
              transition:fly={{ y: 20: duration: 300, 300: 300 }}
            >
              <div class="message-header">
                <span class="message-sender">
                  {message.sender === 'assistant' ? '🤖 9S ASSISTANT' : '🕵️ DETECTIVE'}
                </span>
                <span class="message-time">- {message.timestamp}</span>
              </div>
              <div class="message-content">
                {#if message.isTyping}
                  <span>{message.content}</span>
                {:else}
                  {message.content}
                {/if}
              </div>
            </div>
          {/each}
          <!-- User Status -->
          <div class="user-status">
            <div class="user-info">
              <span class="user-icon">🕵️</span>
              <span class="user-label">DETECTIVE</span>
              <span class="user-time">- {currentTime}:57</span>
            </div>
            <div class="user-activity">hey</div>
          </div>
        </div>
        <div class="chat-input-area">
          <div class="input-container">
            <span class="input-prompt">🕵️</span>
            <Input
              value={currentInput}
              oninput={(e) => (currentInput = (e.target as HTMLInputElement).value)}
              placeholder="Ask 9S about your investigation..."
              class="chat-input"
              onkeypress={handleKeyPress}
              disabled={isTyping}
            />
            <Button
              class="send-btn"
              onclick={sendMessage}
              disabled={!currentInput.trim() || isTyping}>⚡SEND</Button
            >
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .yorha-detective-interface {
    display: flex;
    height: 100vh;
    background: linear-gradient(145deg, #2a2a2a 0%, #1a1a1a 100%);
    color: #ffffff;
    font-family: 'Courier New', monospace;
    overflow: hidden;
  }
  /* Sidebar Styles */
  .sidebar {
    width: 250px;
    background: linear-gradient(180deg, #3a3a3a 0%, #2a2a2a 100%);
    border-right: 2px solid #555555;
    display: flex;
    flex-direction: column;
  }
  .sidebar-header {
    padding: 1.5rem 1rem;
    border-bottom: 2px solid #555555;
  }
  .logo-section {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.5rem;
  }
  .logo-icon {
    font-size: 1.5rem;
    color: #00ff41;
  }
  .logo-text {
    flex: 1;
  }
  .logo-title {
    font-size: 1.125rem;
    font-weight: bold;
    color: #ffffff;
    line-height: 1;
  }
  .logo-subtitle {
    font-size: 0.75rem;
    color: #cccccc;
    line-height: 1;
  }
  .sidebar-toggle {
    background: transparent;
    border: 1px solid #555555;
    color: #cccccc;
    padding: 0.25rem;
    font-size: 0.75rem;
  }
  .interface-subtitle {
    font-size: 0.75rem;
    color: #999999;
  }
  .sidebar-nav {
    flex: 1;
    padding: 1rem 0;
  }
  .nav-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    padding: 0.75rem 1rem;
    background: transparent;
    border: none;
    color: #cccccc;
    font-family: inherit;
    font-size: 0.75rem;
    cursor: pointer;
    transition: 0.2s ease;
    border-left: 3px solid transparent;
  }
  .nav-item:hover {
    background: rgba(255, 255, 255, 0.05);
    color: #ffffff;
  }
  .nav-item.active {
    background: rgba(0, 255, 65, 0.1);
    border-left-color: #00ff41;
    color: #00ff41;
  }
  .nav-icon {
    font-size: 1rem;
  }
  .nav-label {
    flex: 1;
    text-align: left;
  }
  .nav-count {
    background: #555555;
    color: #ffffff;
    padding: 0.125rem 0.375rem;
    border-radius: 10px;
    font-size: 0.625rem;
  }
  .nav-arrow {
    font-size: 0.75rem;
  }
  .system-status {
    padding: 1rem;
    border-top: 1px solid #555555;
    background: rgba(0, 0, 0, 0.3);
  }
  .status-item {
    display: flex;
    justify-content: space-betweennn;
    font-size: 0.625rem;
    color: #999999;
    margin-bottom: 0.25rem;
  }
  .status-time {
    color: #00ff41;
  }
  /* Main Content Styles */
  .main-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .main-header {
    display: flex;
    justify-content: space-betweennn;
    align-items: center;
    padding: 1rem 2rem;
    background: rgba(0, 0, 0, 0.8);
    border-bottom: 2px solid #00ff41;
  }
  .header-title {
    font-size: 1.5rem;
    color: #00ff41;
    margin: 0;
    text-shadow: 0 0 10px #00ff41;
  }
  .header-subtitle {
    font-size: 0.875rem;
    color: #cccccc;
    margin-top: 0.25rem;
  }
  .header-right {
    display: flex;
    align-items: center;
    gap: 1.5rem;
  }
  .search-section {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .search-input {
    width: 250px;
    background: rgba(0, 0, 0, 0.5);
    border: 1px solid #555555;
    color: #ffffff;
    font-family: inherit;
  }
  .filter-select {
    background: rgba(0, 0, 0, 0.5);
    border: 1px solid #555555;
    color: #ffffff;
    padding: 0.5rem;
    font-family: inherit;
    font-size: 0.875rem;
  }
  .search-btn,
  .auth-btn {
    background: #333333;
    border: 1px solid #555555;
    color: #ffffff;
    padding: 0.5rem 1rem;
    font-family: inherit;
    font-size: 0.75rem;
    cursor: pointer;
    transition: 0.2s ease;
  }
  .search-btn:hover,
  .auth-btn:hover {
    border-color: #00ff41;
    box-shadow: 0 0 10px rgba(0, 255, 65, 0.3);
  }
  .auth-section {
    display: flex;
    gap: 0.5rem;
  }
  /* Chat Interface Styles */
  .chat-interface {
    flex: 1;
    margin: 2rem;
    background: rgba(0, 0, 0, 0.8);
    border: 2px solid #00ff41;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    box-shadow: 0 0 20px rgba(0, 255, 65, 0.2);
  }
  .chat-header {
    display: flex;
    justify-content: space-betweennn;
    align-items: center;
    padding: 1rem 1.5rem;
    background: rgba(0, 255, 65, 0.1);
    border-bottom: 1px solid #00ff41;
  }
  .chat-title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .terminal-prompt {
    color: #00ff41;
    font-size: 1.25rem;
  }
  .title-text {
    font-size: 1.125rem;
    color: #ffffff;
    font-weight: bold;
  }
  .chat-controls {
    display: flex;
    gap: 0.5rem;
  }
  .control-btn {
    background: transparent;
    border: 1px solid #555555;
    color: #cccccc;
    padding: 0.375rem 0.75rem;
    font-family: inherit;
    font-size: 0.75rem;
    cursor: pointer;
    transition: 0.2s ease;
  }
  .control-btn:hover,
  .control-btn.active {
    border-color: #00ff41;
    color: #00ff41;
    background: rgba(0, 255, 65, 0.1);
  }
  .test-mode-badge {
    padding: 0.25rem 0.5rem;
    background: rgba(255, 193, 7, 0.2);
    border: 1px solid #ffc107;
    color: #ffc107;
    font-size: 0.625rem;
    font-weight: bold;
    border-radius: 2px;
  }
  .chat-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    padding: 1.5rem;
  }
  .system-header {
    margin-bottom: 1.5rem;
  }
  .system-status-line {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
  }
  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #666666;
  }
  .status-dot.active {
    background: #00ff41;
    box-shadow: 0 0 8px #00ff41;
  }
  .status-text {
    color: #00ff41;
    font-weight: bold;
  }
  .system-description {
    color: #cccccc;
    font-size: 0.875rem;
  }
  .messages-container {
    flex: 1;
    overflow-y: auto;
    padding-right: 0.5rem;
    margin-bottom: 1rem;
  }
  .message {
    margin-bottom: 1rem;
    padding: 1rem;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid #333333;
    border-radius: 4px;
  }
  .message.assistant {
    border-left: 3px solid #00ff41;
  }
  .message.detective {
    border-left: 3px solid #3b82f6;
  }
  .message.typing {
    border-left: 3px solid #ff6b35;
    animation: pulse 1s infinite;
  }
  .message-header {
    display: flex;
    align-items: center;
    margin-bottom: 0.5rem;
    font-size: 0.75rem;
  }
  .message-sender {
    color: #00ff41;
    font-weight: bold;
  }
  .message-time {
    color: #999999;
  }
  .message-content {
    color: #ffffff;
    line-height: 1.5;
  }
  .user-status {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid #333333;
    border-radius: 4px;
    padding: 1rem;
    border-left: 3px solid #3b82f6;
  }
  .user-info {
    font-size: 0.75rem;
    color: #3b82f6;
    margin-bottom: 0.5rem;
  }
  .user-activity {
    color: #ffffff;
  }
  .chat-input-area {
    border-top: 1px solid #333333;
    padding-top: 1rem;
  }
  .input-container {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .input-prompt {
    color: #00ff41;
    font-size: 1.125rem;
  }
  .chat-input {
    flex: 1;
    background: rgba(0, 0, 0, 0.5);
    border: 1px solid #555555;
    color: #ffffff;
    padding: 0.75rem;
    font-family: inherit;
  }
  .send-btn {
    background: #00ff41;
    border: none;
    color: #000000;
    padding: 0.75rem 1.5rem;
    font-family: inherit;
    font-weight: bold;
    cursor: pointer;
    transition: 0.2s ease;
  }
  .send-btn:hover:not(:disabled) {
    background: #00cc34;
    box-shadow: 0 0 15px rgba(0, 255, 65, 0.5);
  }
  .send-btn:disabled {
    background: #333333;
    color: #666666;
    cursor: not-allowed;
  }
  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.7;
    }
  }
  /* Scrollbar Styles */
  .messages-container::-webkit-scrollbar {
    width: 8px;
  }
  .messages-container::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.3);
  }
  .messages-container::-webkit-scrollbar-thumb {
    background: #555555;
    border-radius: 4px;
  }
  .messages-container::-webkit-scrollbar-thumb:hover {
    background: #00ff41;
  }
</style>
