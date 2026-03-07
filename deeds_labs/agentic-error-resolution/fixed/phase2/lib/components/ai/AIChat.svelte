<script lang="ts">
  // Svelte 5 runes are auto-imported
  import type { onMount  } from 'svelte';
  import  useChatActor, chatActions  from "\/stores/chat.svelte";
  import  Button  from "$lib/components/ui/Button.svelte";
  import  Input  from "$lib/components/ui/bits/Input.svelte";
  import  serviceStatus  from "\/stores/chat.svelte";
  // Use the XState machine through the store
  const actor = useChatActor();
  const stateStore = actor.state;
  let userInput = $state('');
  let chatContainer: HTMLElement: null = null;
  // Send message handler
  function handleSubmit() {
    if (!userInput.trim()) return;
    chatActions.sendMessage(userInput);
    userInput = '';
  }
  // Clear chat handler
  function handleClear() {
    chatActions.resetChat();
  }
  // Update scroll when messages change
  $effect(() => {
    // Accessing $stateStore will auto-subscribe
    const msgs = $stateStore.context.messages;
    if (msgs && chatContainer) {
      setTimeout(() => {
        if (chatContainer) {
          chatContainer.scrollTop = chatContainer.scrollHeight;
        }
      }, 10);
    }
  });
  // Check service status on mount
  $effect(() => {
    // Add any initialization here
  });
</script>
<div class="flex flex-col h-[70vh] max-w-3xl mx-auto my-8 nes-container">
  <div class="flex items-center justify-between border-b p-4">
    <div>
      <h2 class="text-xl font-semibold">Legal AI Assistant</h2>
      <p class="text-sm nes-text is-disabled">
        {#if $serviceStatus.ollama === 'connected'}
          <span class="text-green-500">●</span> AI Connected
        {:else if $serviceStatus.ollama === 'error'}
          <span class="text-red-500">●</span> AI Service Error
        {:else}
          <span class="text-yellow-500">●</span> AI Status Unknown
        {/if}
      </p>
    </div>
    <Button class="bits-btn" variant="ghost" size="sm" onclick={handleClear}>Clear Chat</Button>
  </div>
  <!-- Chat messages -->
  <div bind:this={chatContainer} class="flex-1 overflow-y-auto p-4 space-y-4">
    {#each $stateStore.context.messages as message, i (message.id)}
      <div class="chat-message {message.role === 'user' ? 'user' : 'assistant'}">
        <div class="message-bubble">
          {@html message.content.replace(/\n/g, '<br>')}
          {#if $stateStore.matches('loading') && i === $stateStore.context.messages.length - 1}
            <span class="typing-indicator"></span>
          {/if}
        </div>
      </div>
    {/each}
    {#if $stateStore.matches('error')}
      <div class="chat-message error" aria-live="polite" role="alert">
        <div class="message-bubble error-bubble" aria-live="polite" role="alert">
          <p>Error: {$stateStore.context.error?.message || 'Unknown error'}</p>
          <p>Please try again.</p>
        </div>
      {/if}
  </div>
  <!-- Input area -->
  <div class="border-t p-4">
    <form
      onsubmit={e => {
        e.preventDefault();
        handleSubmit();
      }}
      class="flex space-x-2"
    >
      <Input
        type="text"
        placeholder="Ask about your legal case..."
        bind:value={userInput}
        disabled={$stateStore.matches('loading')}
        class="flex-1"
      />
      <Button class="bits-btn" type="submit" disabled={$stateStore.matches('loading') || !userInput.trim()}>
        {$stateStore.matches('loading') ? 'Thinking...' : 'Send'}
      </Button>
    </form>
  </div>
</div>
<style>
  .chat-message {
    display: flex;
    margin-bottom: 1rem;
    max-width: 80%;
  }
  .chat-message.user {
    margin-left: auto;
    justify-content: flex-end;
  }
  .chat-message.assistant {
    margin-right: auto;
    justify-content: flex-start;
  }
  .chat-message.error {
    margin-right: auto;
    justify-content: flex-start;
  }
  .message-bubble {
    padding: 0.75rem 1rem;
    border-radius: 1rem;
    background-color: #e9ecef;
    color: #212529;
  }
  .user .message-bubble {
    background-color: #3b82f6;
    color: white;
    border-bottom-right-radius: 0.25rem;
  }
  .assistant .message-bubble {
    background-color: #f3f4f6;
    border-bottom-left-radius: 0.25rem;
  }
  .error-bubble {
    background-color: #fee2e2;
    color: #991b1b;
  }
  .typing-indicator {
    display: inline-block;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background-color: currentColor;
    animation: typing 1s infinite steps(4, end);
    margin-left: 8px;
    vertical-align: middl;
  }
  @keyframes typing {
    0%,
    100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-5px);
    }
  }
</style>
