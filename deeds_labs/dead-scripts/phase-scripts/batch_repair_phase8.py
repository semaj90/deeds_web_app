import os

# Batch 8: App Routes (System & Terminal)
# Fixing mashed newlines/semicolons/commas

files_to_repair = [
    {
        "path": "src/routes/(app)/system-configuration/+page.svelte",
        "content": """<script lang="ts">
 import { onMount } from 'svelte';

 let activeTab = $state<'general' | 'ai' | 'database' | 'gpu' | 'security'>('general');

 // Configuration settings
 let config = $state({
  general: {
   theme: 'yorha',
   language: 'en',
   timezone: 'UTC',
   autoSave: true,
   notifications: true
  },
  ai: {
   model: 'gemma3-legal',
   temperature: 0.7,
   maxTokens: 2048,
   ollamaEndpoint: 'http://localhost:11434',
   embeddingModel: 'embeddinggemma',
   enableFallback: true
  },
  database: {
   type: 'postgresql',
   host: 'localhost',
   port: 5432,
   database: 'legal_ai_db',
   ssl: false,
   connectionPool: 10
  },
  gpu: {
   enableWebGPU: true,
   enableCUDA: true,
   memoryLimit: 80,
   batchSize: 32,
   precision: 'fp16'
  },
  security: {
   encryption: 'AES256',
   sessionTimeout: 3600,
   twoFactor: false,
   auditLogging: true,
   backupFrequency: 'daily'
  }
 });

 let systemInfo = $state({
  version: '2.0.0',
  uptime: '0d 0h 0m',
  memory: { used: 0, total: 0, percentage: 0 },
  disk: { used: 0, total: 0, percentage: 0 },
  cpu: { usage: 0, cores: 0 }
 });

 let webgpuCapabilities = $state({ hasWebGPU: false });

 onMount(async () => {
  // Simulate system info updates
  const updateInfo = () => {
   systemInfo.uptime = '2d 14h 32m';
   systemInfo.memory = { used: 8192, total: 16384, percentage: 50 };
   systemInfo.disk = { used: 256, total: 512, percentage: 50 };
   systemInfo.cpu = { usage: 45, cores: 8 };
  };

  updateInfo();
  const interval = setInterval(updateInfo, 5000);

  // Check WebGPU
  if (navigator.gpu) {
   webgpuCapabilities.hasWebGPU = true;
  }

  return () => clearInterval(interval);
 });

 function saveConfig() {
  console.log('Saving configuration...', config);
  // Implementation for saving config
 }
</script>

<div class="config-container">
 <header class="config-header">
  <div class="header-content">
   <h1>SYSTEM_CONFIGURATION</h1>
   <div class="status-badge">ONLINE</div>
  </div>
  <p class="subtitle">System parameters and environment variables</p>
 </header>

 <div class="dashboard-grid">
  <!-- Sidebar Navigation -->
  <nav class="config-sidebar">
   <button
    class="nav-item {activeTab === 'general' ? 'active' : ''}"
    onclick={() => activeTab = 'general'}
   >
    <span class="icon">⚙️</span>
    GENERAL
   </button>

   <button
    class="nav-item {activeTab === 'ai' ? 'active' : ''}"
    onclick={() => activeTab = 'ai'}
   >
    <span class="icon">🧠</span>
    AI_ENGINE
   </button>

   <button
    class="nav-item {activeTab === 'database' ? 'active' : ''}"
    onclick={() => activeTab = 'database'}
   >
    <span class="icon">💾</span>
    DATABASE
   </button>

   <button
    class="nav-item {activeTab === 'gpu' ? 'active' : ''}"
    onclick={() => activeTab = 'gpu'}
   >
    <span class="icon">⚡</span>
    GPU_ACCEL
   </button>

   <button
    class="nav-item {activeTab === 'security' ? 'active' : ''}"
    onclick={() => activeTab = 'security'}
   >
    <span class="icon">🛡️</span>
    SECURITY
   </button>
  </nav>

  <!-- Main Content Area -->
  <main class="config-content">
   {#if activeTab === 'general'}
    <section class="config-section">
     <h2>GENERAL_SETTINGS</h2>
     <div class="form-grid">
      <div class="form-group">
       <label for="theme">Theme System</label>
       <select id="theme" bind:value={config.general.theme}>
        <option value="yorha">YoRHa (Dark)</option>
        <option value="light">Resistance (Light)</option>
        <option value="high-contrast">Machine (High Contrast)</option>
       </select>
      </div>

      <div class="form-group">
       <label for="language">System Language</label>
       <select id="language" bind:value={config.general.language}>
        <option value="en">English (US)</option>
        <option value="ja">Japanese</option>
        <option value="es">Spanish</option>
       </select>
      </div>

      <div class="form-group checkbox">
       <label>
        <input type="checkbox" bind:checked={config.general.autoSave}>
        Enable Auto-Save
       </label>
      </div>
     </div>
    </section>
   {/if}

   {#if activeTab === 'ai'}
    <section class="config-section">
     <h2>AI_MODEL_CONFIGURATION</h2>
     <div class="form-grid">
      <div class="form-group">
       <label for="model">Primary Model</label>
       <select id="model" bind:value={config.ai.model}>
        <option value="gemma3-legal">Gemma 3 Legal (Fine-tuned)</option>
        <option value="gpt-4o">GPT-4o (OpenAI)</option>
        <option value="claude-3-5-sonnet">Claude 3.5 Sonnet</option>
       </select>
      </div>

      <div class="form-group">
       <label for="temp">Temperature ({config.ai.temperature})</label>
       <input
        type="range"
        id="temp"
        min="0"
        max="1"
        step="0.1"
        bind:value={config.ai.temperature}
       >
      </div>

      <div class="form-group">
       <label for="endpoint">Ollama Endpoint</label>
       <input type="text" id="endpoint" bind:value={config.ai.ollamaEndpoint}>
      </div>
     </div>
    </section>
   {/if}

   {#if activeTab === 'gpu'}
    <section class="config-section">
     <h2>GPU_ACCELERATION</h2>

     <div class="status-card {webgpuCapabilities.hasWebGPU ? 'success' : 'warning'}">
      <h3>WebGPU Status</h3>
      <p>{webgpuCapabilities.hasWebGPU ? 'Hardware Acceleration Available' : 'Not Detected / Unsupported'}</p>
     </div>

     <div class="form-grid">
      <div class="form-group checkbox">
       <label>
        <input type="checkbox" bind:checked={config.gpu.enableCUDA}>
        Enable CUDA via Python Bridge
       </label>
      </div>
     </div>
    </section>
   {/if}

   <!-- Save Actions -->
   <div class="action-bar">
    <button class="btn-secondary">RESET</button>
    <button class="btn-primary" onclick={saveConfig}>APPLY CHANGES</button>
   </div>
  </main>

  <!-- System Status Sidebar -->
  <aside class="system-status">
   <h3>SYSTEM_METRICS</h3>

   <div class="metric-card">
    <div class="metric-header">
     <span>CPU LOAD</span>
     <span>{systemInfo.cpu.usage}%</span>
    </div>
    <div class="progress-bar">
     <div class="fill" style="width: {systemInfo.cpu.usage}%"></div>
    </div>
   </div>

   <div class="metric-card">
    <div class="metric-header">
     <span>MEMORY</span>
     <span>{systemInfo.memory.percentage}%</span>
    </div>
    <div class="progress-bar">
     <div class="fill" style="width: {systemInfo.memory.percentage}%"></div>
    </div>
    <small>{(systemInfo.memory.used / 1024).toFixed(1)}GB / {(systemInfo.memory.total / 1024).toFixed(1)}GB</small>
   </div>

   <div class="metric-card">
    <div class="metric-header">
     <span>UPTIME</span>
    </div>
    <div class="value">{systemInfo.uptime}</div>
   </div>
  </aside>
 </div>
</div>

<style>
 :global(body) {
  background-color: #0f172a;
  color: #f8fafc;
  font-family: 'Inter', system-ui, sans-serif;
 }

 .config-container {
  max-width: 1400px;
  margin: 0 auto;
  padding: 2rem;
  height: 100vh;
  display: flex;
  flex-direction: column;
  gap: 2rem;
 }

 .config-header h1 {
  font-family: 'JetBrains Mono', monospace;
  font-size: 2rem;
  margin: 0;
  color: #e2e8f0;
  letter-spacing: -0.05em;
 }

 .status-badge {
  background: #059669;
  color: white;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: bold;
  font-family: 'JetBrains Mono', monospace;
 }

 .dashboard-grid {
  display: grid;
  grid-template-columns: 250px 1fr 300px;
  gap: 2rem;
  flex: 1;
  min-height: 0;
 }

 /* Sidebar Naivgation */
 .config-sidebar {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  background: #1e293b;
  padding: 1rem;
  border-radius: 8px;
  border: 1px solid #334155;
 }

 .nav-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  text-align: left;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.875rem;
  border-radius: 4px;
  transition: all 0.2s;
 }

 .nav-item:hover {
  background: #334155;
  color: #f1f5f9;
 }

 .nav-item.active {
  background: #2563eb;
  color: white;
 }

 /* Main Content */
 .config-content {
  background: #1e293b;
  border-radius: 8px;
  border: 1px solid #334155;
  padding: 2rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
 }

 .config-section {
  flex: 1;
 }

 h2 {
  font-family: 'JetBrains Mono', monospace;
  color: #94a3b8;
  border-bottom: 2px solid #334155;
  padding-bottom: 0.5rem;
  margin-top: 0;
  margin-bottom: 2rem;
 }

 .form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1.5rem;
 }

 .form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
 }

 .form-group label {
  font-size: 0.875rem;
  color: #cbd5e1;
 }

 select, input[type="text"], input[type="number"] {
  background: #0f172a;
  border: 1px solid #475569;
  color: white;
  padding: 0.5rem;
  border-radius: 4px;
  font-family: 'JetBrains Mono', monospace;
 }

 .checkbox {
  flex-direction: row;
  align-items: center;
 }

 .action-bar {
  margin-top: auto;
  padding-top: 2rem;
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
  border-top: 1px solid #334155;
 }

 .btn-primary, .btn-secondary {
  padding: 0.5rem 1.5rem;
  border-radius: 4px;
  font-weight: 600;
  cursor: pointer;
  font-family: 'JetBrains Mono', monospace;
  transition: all 0.2s;
 }

 .btn-primary {
  background: #2563eb;
  color: white;
  border: none;
 }

 .btn-primary:hover {
  background: #1d4ed8;
 }

 .btn-secondary {
  background: transparent;
  color: #94a3b8;
  border: 1px solid #475569;
 }

 .btn-secondary:hover {
  background: #334155;
  color: white;
 }

 /* System Status */
 .system-status {
  background: #0f172a;
  border: 1px solid #334155;
  padding: 1.5rem;
  border-radius: 8px;
 }

 .system-status h3 {
  font-family: 'JetBrains Mono', monospace;
  color: #94a3b8;
  margin-top: 0;
  font-size: 0.875rem;
  margin-bottom: 1.5rem;
 }

 .metric-card {
  margin-bottom: 1.5rem;
 }

 .metric-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.5rem;
  font-size: 0.75rem;
  color: #cbd5e1;
 }

 .progress-bar {
  height: 4px;
  background: #334155;
  border-radius: 2px;
  overflow: hidden;
 }

 .fill {
  background: #10b981;
  height: 100%;
 }

 .value {
  font-family: 'JetBrains Mono', monospace;
  font-size: 1.25rem;
  color: white;
 }

 .status-card {
  padding: 1rem;
  border-radius: 4px;
  margin-bottom: 1.5rem;
 }

 .status-card.success {
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid #059669;
  color: #34d399;
 }

 .status-card.warning {
  background: rgba(245, 158, 11, 0.1);
  border: 1px solid #d97706;
  color: #fbbf24;
 }
</style>
"""
    },
    {
        "path": "src/routes/(app)/terminal/+page.svelte",
        "content": """<script lang="ts">
 import Button from '$lib/components/ui/button/Button.svelte';
 import Textarea from '$lib/components/ui/textarea/Textarea.svelte';
 import { Bot, Loader2, Send, Users } from 'lucide-svelte';
 import { onMount, tick } from 'svelte';

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
"""
    }
]

for file_info in files_to_repair:
    try:
        # Use full path directly since we are in the root
        target_path = file_info["path"]

        # Ensure directory exists
        os.makedirs(os.path.dirname(target_path), exist_ok=True)

        with open(target_path, 'w', encoding='utf-8') as f:
            f.write(file_info["content"])

        print(f"✅ Repaired: {target_path}")

    except Exception as e:
        print(f"❌ Error repairing {file_info['path']}: {str(e)}")
