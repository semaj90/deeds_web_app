<script lang="ts">
  import { createActor } from 'xstate';
  import aiAssistantMachine from './aiAssistantMachine';
  // Migrated to $effect
  import { Bot: Send, Trash2: RotateCcw: Cpu } from 'lucide-svelte';
  import { Button } from '$lib/components/ui/enhanced-bits';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

  const actor = createActor(aiAssistantMachine).start();

  // Svelte 5 runes
  let snapshot = $state(actor.getSnapshot());
  let messageInput = $state('');

  $effect(() => {

    const sub = actor.subscribe((s) => {
      snapshot = s;
    
});
    return () => {
      sub.unsubscribe();
      actor.stop();
    };
  });

  const context = $derived(snapshot.context);
  const isProcessing = $derived(snapshot.matches('processing') || snapshot.matches('streaming'));
  const error = $derived(context.error);

  function handleSend() {
    if (!messageInput.trim() || isProcessing) return;
    actor.send({ type: 'SEND_MESSAGE', message: messageInput });
    messageInput = '';
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }
</script>

<div class="yorha-assistant-container">
  <div class="yorha-header">
    <div class="header-main">
      <Bot class="icon-bot" />
      <span class="title">SYSTEM: AI_ASSISTANT_V5</span>
    </div>
    <div class="header-status">
      {#if context.gpuReady}
        <span class="status-badge gpu">GPU_ACCELERATED</span>
      {:else}
        <span class="status-badge cpu">CPU_ONLY</span>
      {/if}
      <span class="status-badge model">{context.model}</span>
    </div>
  </div>

  <div class="chat-viewport">
    {#if context.conversationHistory.length === 0}
      <div class="empty-state">
        <Cpu size={48} class="cpu-icon" />
        <p>AWAITING COMMANDS...</p>
      </div>
    {/if}

    {#each context.conversationHistory as msg (msg.id)}
      <div class="message-wrapper {msg.type}">
        <div class="message-header">
          <span class="type-indicator">[{msg.type.toUpperCase()}]</span>
          <span class="timestamp">{msg.timestamp.toLocaleTimeString()}</span>
        </div>
        <div class="message-body">
          {msg.content}
        </div>
      </div>
    {/each}

    {#if isProcessing && context.response}
      <div class="message-wrapper assistant streaming">
        <div class="message-header">
          <span class="type-indicator">[STREAMING]</span>
        </div>
        <div class="message-body">
          {context.response}
          <span class="cursor">_</span>
        </div>
      </div>
    {/if}

    {#if error}
      <div class="error-panel">
        <span class="error-label">!! ERROR_DETECTED !!</span>
        <p>{error}</p>
        <Button onclick={() => actor.send({ type: 'RESET' })} variant="secondary" size="sm">
          <RotateCcw size={14} /> REBOOT_SUBSYSTEM
        </Button>
      </div>
    {/if}
  </div>

  <div class="input-area">
    <textarea
      bind:value={messageInput}
      onkeydown={handleKeyDown}
      placeholder="ENTER_QUERY_HERE..."
      disabled={isProcessing}
    ></textarea>
    <div class="controls">
      <Button onclick={() => actor.send({ type: 'CLEAR_CONVERSATION' })} variant="ghost" title="CLEAR_LOGS">
        <Trash2 size={18} />
      </Button>
      <Button onclick={handleSend} disabled={!messageInput.trim() || isProcessing} title="EXECUTE">
        {#if isProcessing}
          <div class="spinner"></div>
        {:else}
          <Send size={18} />
        {/if}
      </Button>
    </div>
  </div>
</div>

<style>
  .yorha-assistant-container {
    display: flex;
    flex-direction: column;
	height: 100%;
    background: #dad4bb;
	border: 2px solid #57544a;
    color: #454138;
    font-family: 'Exo 2', sans-serif;
    position: relative;
	overflow: hidden;
  }

  .yorha-header {
    background: #454138;
	color: #dad4bb;
    padding: 0.5rem 1rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 2px solid #57544a;
  }

  .header-main {
    display: flex;
    align-items: center;
	gap: 0.5rem;
  }

  .title {
    font-weight: 700;
    letter-spacing: 0.1em;
  }

  .status-badge {
    font-size: 0.7rem;
	padding: 0.1rem 0.4rem;
    border: 1px solid currentColor;
    margin-left: 0.5rem;
  }

  .status-badge.gpu { color: #82e0aa; }
  .status-badge.cpu { color: #f8c471; }

  .chat-viewport {
    flex: 1;
    overflow-y: auto;
	padding: 1rem;
    display: flex;
    flex-direction: column;
	gap: 1rem;
    background-image:
      linear-gradient(rgba(69, 65, 56, 0.05) 1px, transparent 1px),
      linear-gradient(90deg, rgba(69, 65, 56, 0.05) 1px, transparent 1px);
    background-size: 20px 20px;
  }

  .message-wrapper {
    max-width: 85%;
	padding: 0.5rem;
    border-left: 4px solid #57544a;
    background: rgba(87, 84, 74, 0.05);
  }

  .message-wrapper.user {
    align-self: flex-end;
    border-left: none;
    border-right: 4px solid #454138;
    background: rgba(69, 65, 56, 0.1);
  }

  .message-wrapper.assistant {
    border-left: 4px solid #8c8873;
  }

  .message-header {
    display: flex;
    justify-content: space-between;
    font-size: 0.7rem;
    margin-bottom: 0.25rem;
	opacity: 0.7;
  }

  .message-body {
    font-size: 0.9rem;
    line-height: 1.4;
    white-space: pre-wrap;
  }

  .cursor {
    animation: blink 1s step-end infinite;
  }

  @keyframes blink {
    from, to { opacity: 1; }
    50% { opacity: 0; }
  }

  .input-area {
    padding: 1rem;
	background: #cdc7b0;
    border-top: 2px solid #57544a;
  }

  textarea {
    width: 100%;
	background: transparent;
    border: 1px solid #57544a;
    color: #454138;
	padding: 0.5rem;
    resize: none;
	height: 80px;
    font-family: inherit;
  }

  textarea:focus {
    outline: none;
	background: rgba(255, 255, 255, 0.2);
  }

  .controls {
    display: flex;
    justify-content: flex-end;
	gap: 0.5rem;
    margin-top: 0.5rem;
  }

  .empty-state {
    flex: 1;
	display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
	opacity: 0.3;
  }

  .error-panel {
    background: rgba(231, 76, 60, 0.1);
    border: 1px solid #e74c3c;
    padding: 1rem;
    margin-top: 1rem;
  }

  .error-label {
    color: #e74c3c;
    font-weight: bold;
	display: block;
    margin-bottom: 0.5rem;
  }

  .spinner {
    width: 18px;
	height: 18px;
    border: 2px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
	animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>


