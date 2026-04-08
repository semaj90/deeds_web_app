<!-- Enhanced YoRHa AI Assistant with Persistence, Context Boundaries, and Workflow Streams -->
<script lang="ts">
  import { fade, scale, slide } from 'svelte/transition';
  // @ts-ignore — ambient declare module shadow
  import { legalDB } from '$lib/db/client-db';
  import { WorkflowEventStream } from '$lib/client/workflow-event-stream';
  // @ts-ignore — ambient declare module shadow
  import { useGamingEvolution } from '$lib/components/ui/gaming/core/useGamingEvolution';

  interface AssistantProps {
    isOpen?: boolean;
    onClose: () => void;
    userRole?: 'prosecutor' | 'detective' | 'admin';
  }

  let { isOpen = false, onClose, userRole = 'prosecutor' }: AssistantProps = $props();

  // Core & Persistence State
  let currentSessionId = $state(crypto.randomUUID());
  let currentMode = $state<'chat' | 'evidence' | 'analysis'>('chat');
  let searchQuery = $state<string>('');
  let chatMessages = $state<any[]>([]);
  let evidenceItems = $state<any[]>([]);
  let isProcessing = $state<boolean>(false);
  
  // ChatGPT-style "Attached Context" Modal/Pill
  let attachedContext = $state<{ id: string; name: string; type: string } | null>(null);

  // RAG / Streaming state
  let ragStatus = $state<'idle' | 'streaming' | 'done' | 'error'>('idle');
  let ragTokenCount = $state(0);
  let activeStream: WorkflowEventStream | null = null;
  
  // Dynamic Gamification State
  let gamingConfigProps = $state<{ enableScanlines?: boolean; animationStyle?: string }>({ enableScanlines: true });

  // DOM Refs
  let searchBarRef = $state<HTMLTextAreaElement | null>(null);
  let chatContainerRef = $state<HTMLDivElement | null>(null);

  // Golden ratio
  const GOLDEN_RATIO = 1.618;
  let containerWidth = $state<number>(800);
  let containerHeight = $derived(containerWidth / GOLDEN_RATIO);

  $effect(() => {
    // Attempt Gamification Hook safely
    try {
      const { getComponentProps } = useGamingEvolution();
      gamingConfigProps = getComponentProps({});
    } catch {
      // Fallback if not wrapped in gaming provider
      gamingConfigProps = { enableScanlines: true, animationStyle: 'smooth' };
    }
  });

  $effect(() => {
    if (isOpen) {
      setTimeout(() => searchBarRef?.focus(), 200);
      loadPersistedSession();
    }
  });

  async function loadPersistedSession() {
    try {
      const history = await legalDB.chatHistory.where('sessionId').equals(currentSessionId).toArray();
      if (history.length > 0) {
        chatMessages = history.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
      } else {
        await addMessage(
          'assistant',
          `Welcome to YoRHa Legal AI Assistant. I'm connected to your Local IndexedDB for absolute persistence.`
        );
      }
    } catch (e) {
      console.warn("IndexedDB not ready yet in demo mode. Bypassing.", e);
    }
  }

  async function addMessage(role: 'user' | 'assistant', content: string) {
    const message = { 
      id: crypto.randomUUID(), 
      sessionId: currentSessionId,
      role, 
      content, 
      timestamp: new Date() 
    };
    
    // UI Update
    chatMessages = [...chatMessages, message];
    
    // Persistent Dexie Update
    try {
      await legalDB.chatHistory.add(message);
    } catch (e) { console.warn('Dexie save bypassed in demo'); }

    setTimeout(() => {
      if (chatContainerRef) chatContainerRef.scrollTop = chatContainerRef.scrollHeight;
    }, 100);
  }

  function updateLastAssistantMessage(content: string) {
    const lastMessage = chatMessages[chatMessages.length - 1];
    if (lastMessage && lastMessage.role === 'assistant') {
      lastMessage.content = content;
      chatMessages = [...chatMessages];
      // Update IndexedDB for the last message
      if (lastMessage.id) {
        legalDB.chatHistory.update(lastMessage.id, { content }).catch(() => {});
      }
    } else {
      addMessage('assistant', content);
    }
    
    setTimeout(() => {
      if (chatContainerRef) chatContainerRef.scrollTop = chatContainerRef.scrollHeight;
    }, 50);
  }

  async function handleSearch() {
    if (!searchQuery.trim() || isProcessing) return;

    const query = searchQuery.trim();
    // Bundle the ChatGPT-style attachment into the query context
    const fullContextStr = attachedContext ? `\n[Context: ${attachedContext.name}]` : '';
    await addMessage('user', query + fullContextStr);
    
    searchQuery = '';
    isProcessing = true;
    ragStatus = 'streaming';
    ragTokenCount = 0;

    // We simulate hitting the POST /api/workflow-jobs endpoint to get a Session ID, 
    // and then instantiate the WorkflowEventStream.
    try {
      // Mock Server Post
      const jobId = `job-${Date.now()}`;
      
      // Instantiate robust SSE class (Phase 2 Wiring)
      activeStream = new WorkflowEventStream(jobId, '/api/workflow-events');
      
      let responseContent = '';
      
      activeStream.on('SSE_CONNECTED', () => {
        ragStatus = 'streaming';
        updateLastAssistantMessage("");
      });
      
      activeStream.on('EMBEDDING_COMPLETE', () => ragTokenCount += 150);

      // We simulate receiving SSE tokens since we don't have a live backend in the demo
      let i = 0;
      const mockResponse = `Based on the attached context and your server-side boundaries, I have cross-referenced IndexedDB and the contextual service.\n\nThe trajectory indicates strong precedent.`;
      
      const interval = setInterval(() => {
        if (i < mockResponse.length) {
          responseContent += mockResponse[i];
          updateLastAssistantMessage(responseContent);
          ragTokenCount++;
          i++;
        } else {
          clearInterval(interval);
          activeStream?.disconnect();
          ragStatus = 'done';
          isProcessing = false;
        }
      }, 30);
      
      // In a real env: activeStream.connect();
    } catch (error: any) {
      console.error('Workflow event error:', error);
      await addMessage('assistant', "I encountered a stream error.");
      isProcessing = false;
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSearch();
    }
    if (event.key === 'Escape') onClose?.();
  }

  function attachReference(item: any) {
    attachedContext = { id: item.id, name: item.name, type: item.type };
    switchMode('chat'); // jump back to chat so user can type with attachment
  }

  function switchMode(mode: 'chat' | 'evidence' | 'analysis') {
    currentMode = mode;
  }

  async function clearSession() {
    currentSessionId = crypto.randomUUID();
    chatMessages = [];
    ragTokenCount = 0;
    ragStatus = 'idle';
    attachedContext = null;
    await loadPersistedSession();
  }
  
  // Generic mock evidence loader
  $effect(() => {
    if (evidenceItems.length === 0) {
      evidenceItems = [
        { id: '1', name: 'Exhibit_A_Transcript.pdf', type: 'document', content: '...' },
        { id: '2', name: 'Server_Context_Log.json', type: 'metadata', content: '...' }
      ];
    }
  });

</script>

{#if isOpen}
  <div class="ai-assistant-overlay" transition:fade={{ duration: 200 }} onclick={onClose} role="button" tabindex="-1">
    <div class="ai-assistant-container {gamingConfigProps.enableScanlines ? 'crt-scanlines' : ''}"
      style="width: {containerWidth}px; height: {containerHeight}px;"
      onclick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="0">
      
      <!-- Gamified CRT Overlay -->
      <div class="crt-overlay pointer-events-none absolute inset-0 z-50 mix-blend-overlay"></div>

      <!-- Header -->
      <header class="assistant-header">
        <div class="header-left">
          <div class="yorha-logo">🏛️</div>
          <div class="header-info">
            <h1 class="assistant-title">YoRHa Contextual AI</h1>
            <p class="assistant-subtitle">PERSISTENCE: ON | ROLE: {userRole.toUpperCase()}</p>
          </div>
        </div>
        <div class="header-controls">
          <div class="mode-switcher">
            <button class="mode-btn" class:active={currentMode === 'chat'} onclick={() => switchMode('chat')}>💬 Chat</button>
            <button class="mode-btn" class:active={currentMode === 'evidence'} onclick={() => switchMode('evidence')}>📁 Context</button>
          </div>
          <button class="close-btn" onclick={onClose}>✖</button>
        </div>
      </header>

      <!-- Main Content Area -->
      <main class="assistant-main">
        {#if currentMode === 'chat'}
          <div class="chat-container" bind:this={chatContainerRef}>
            {#each chatMessages as message (message.id)}
              <div class="message {message.role}" transition:slide={{duration: gamingConfigProps.animationStyle === 'instant' ? 0 : 200}}>
                <div class="message-avatar"> {message.role === 'user' ? '👤' : '🤖'} </div>
                <div class="message-content">
                  {#if message.content.includes('[Context:')}
                    <div class="text-xs mb-2 text-green-400 border border-green-500/30 bg-green-500/10 px-2 py-1 rounded inline-block">
                      {message.content.match(/\[Context:(.*?)\]/)?.[1] || 'Attachment'}
                    </div>
                    <div class="message-text">{message.content.replace(/\[Context:.*?\]/, '')}</div>
                  {:else}
                    <div class="message-text">{message.content}</div>
                  {/if}
                  <div class="message-time"> {new Date(message.timestamp).toLocaleTimeString()} </div>
                </div>
              </div>
            {/each}
          </div>
        {:else if currentMode === 'evidence'}
          <div class="evidence-container">
            <h2 class="text-xl text-[#ffd700] mb-4">Contextual Databases</h2>
            <div class="evidence-grid">
              {#each evidenceItems as item}
                <div class="evidence-item flex justify-between items-center bg-[#1a1a1a] p-4 border border-[#333] hover:border-[#ffd700] transition-colors rounded">
                  <div>
                    <h3 class="text-[#ffd700] font-bold">{item.name}</h3>
                    <p class="text-xs text-green-400">{item.type}</p>
                  </div>
                  <button class="bg-[#333] text-white px-3 py-1 rounded text-sm hover:bg-[#ffd700] hover:text-black transition-colors" onclick={() => attachReference(item)}>
                    Attach to Chat
                  </button>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </main>

      <!-- Search Section with Mini ChatGPT-style Attachment Pill -->
      <div class="search-section relative bg-[#1a1a1a] border-t border-[#333] p-4 pb-6">
        
        <!-- Attached Context Indicator Modal (ChatGPT style) -->
        {#if attachedContext}
          <div class="absolute -top-10 left-6 z-10 flex items-center gap-2 rounded-t-md bg-[#222] border-t border-l border-r border-[#444] px-3 py-1.5 shadow-lg" transition:slide={{duration: 150}}>
            <span class="text-xs text-green-400">📎 Attached Context:</span>
            <span class="text-xs font-bold text-white truncate max-w-[150px]">{attachedContext.name}</span>
            <button class="ml-2 text-[#ff0041] hover:text-red-400" onclick={() => attachedContext = null}>✕</button>
          </div>
        {/if}

        <div class="search-container flex gap-2 relative">
          <textarea
            bind:this={searchBarRef}
            bind:value={searchQuery}
            class="search-input flex-1 resize-none bg-[#0a0a0a] border-2 border-[#ffd700] rounded-lg text-[#e0e0e0] p-3 focus:outline-none focus:border-[#00ff41] transition-colors shadow-inner"
            placeholder="Query the Contextual Agent..."
            rows="2"
            onkeydown={handleKeydown}
            disabled={isProcessing}
          ></textarea>
          
          <button class="search-btn bg-[#ffd700] text-black font-bold border-2 border-[#ffd700] rounded-lg px-4 hover:bg-transparent hover:text-[#ffd700] transition-colors disabled:opacity-50" 
            onclick={handleSearch} disabled={isProcessing || (!searchQuery.trim() && !attachedContext)}>
            {isProcessing ? '⚡' : 'SEND'}
          </button>
        </div>
      </div>

      <!-- Footer Info -->
      <footer class="assistant-footer flex justify-between bg-[#0a0a0a] p-2 px-4 border-t border-[#333] text-xs">
        <div>
          STREAM: <span class={ragStatus === 'streaming' ? 'text-[#00ff41]' : 'text-gray-500'}>{ragStatus.toUpperCase()}</span> | 
          TOKENS: <span class="text-[#ffd700]">{ragTokenCount}</span>
        </div>
        <button class="text-gray-400 hover:text-white" onclick={clearSession}>[ CLEAR DB SESSION ]</button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .ai-assistant-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.8); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 2rem; }
  .ai-assistant-container { position: relative; background: linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%); border: 3px solid #ffd700; border-radius: 12px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 0 0 3px #1a1a1a, 0 0 30px rgba(255, 215, 0, 0.3); font-family: 'JetBrains Mono', monospace; color: #e0e0e0; }
  
  /* Gamification CRT Scanlines */
  .crt-scanlines .crt-overlay {
    background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.06));
    background-size: 100% 2px, 3px 100%;
  }

  .assistant-header { background: linear-gradient(45deg, #ffbf00, #ffd700); color: #000; padding: 1rem 1.5rem; display: flex; justify-content: space-between; align-items: center; }
  .header-left { display: flex; align-items: center; gap: 1rem; }
  .assistant-title { font-size: 1.25rem; font-weight: 700; margin: 0; text-transform: uppercase; }
  .assistant-subtitle { font-size: 0.75rem; margin: 0; font-weight: 600; opacity: 0.8; }
  .header-controls { display: flex; gap: 1rem; }
  
  .mode-btn { padding: 0.5rem 1rem; border: 2px solid #000; font-weight: 600; text-transform: uppercase; cursor: pointer; }
  .mode-btn:hover, .mode-btn.active { background: #000; color: #ffd700; }
  .close-btn { background: #ff0041; color: #fff; border: none; padding: 0.5rem; cursor: pointer; font-weight: bold; }

  .assistant-main { flex: 1; overflow-y: auto; padding: 1rem; }
  .chat-container { display: flex; flex-direction: column; gap: 1rem; height: 100%; overflow-y: auto; overflow-x: hidden; }
  
  .message { display: flex; gap: 1rem; align-items: flex-start; }
  .message.user { flex-direction: row-reverse; }
  .message-content { max-width: 70%; background: #333; padding: 1rem; border-radius: 12px; }
  .message.user .message-content { background: #ffd700; color: #000; }
  .message-text { line-height: 1.5; white-space: pre-wrap; word-break: break-word; }
  .message-time { font-size: 0.7rem; opacity: 0.7; margin-top: 0.5rem; }

  :global(.chat-container::-webkit-scrollbar) { width: 8px; }
  :global(.chat-container::-webkit-scrollbar-track) { background: #1a1a1a; }
  :global(.chat-container::-webkit-scrollbar-thumb) { background: #ffd700; border-radius: 4px; }
</style>
