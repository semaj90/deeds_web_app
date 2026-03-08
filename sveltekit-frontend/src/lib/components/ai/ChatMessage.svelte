<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  interface MessageData {
    id?: string;
    role?: string;
    type?: string;
    content?: string;
    timestamp?: Date | string | number;
    saved?: boolean;
    metadata?: {
      emotionalTone?: string;
      proactive?: boolean;
      model?: string;
      latency?: number;
      tokenCount?: number;
    };
  }

  interface Props {
    message: MessageData;
    onsave?: (id: string) => void;
    oncopymessage?: (content: string) => void;
  }

  let { message, onsave, oncopymessage }: Props = $props();

  // Svelte 5 runes for reactive state
  let copied = $state(false);
  let showActions = $state(false);

  // Svelte 5 $derived for computed values
  let isUser = $derived(message?.role === 'user' || message?.type === 'user');
  let isAssistant = $derived(message?.role === 'assistant' || message?.type === 'assistant');
  let emotionalTone = $derived(message?.metadata?.emotionalTone ?? null);
  let isProactive = $derived(!!message?.metadata?.proactive);
  let hasMetadata = $derived.by(() => {
    return isAssistant && (
      Boolean(message?.metadata?.model) ||
      Boolean(message?.metadata?.latency) ||
      Boolean(message?.metadata?.tokenCount)
    );
  });

  let toneColor = $derived.by(() => {
    switch (emotionalTone) {
      case 'encouraging':
        return 'text-accent';
      case 'supportive':
        return 'text-info';
      case 'enthusiastic':
        return 'text-info';
      case 'thoughtful':
        return 'text-info';
      case 'professional':
        return 'text-sand/60';
      default:
        return 'text-sand/60';
    }
  });

  let formattedTime = $derived.by(() => {
    const date = new Date(message?.timestamp ?? Date.now());
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  });

  // Svelte 5 $effect for side effects
  $effect(() => {
    if (copied) {
      const timeout = setTimeout(() => { copied = false; }, 2000);
      return () => clearTimeout(timeout);
    }
  });

  function copyToClipboard() {
    if (!message?.content) return;
    navigator.clipboard.writeText(message.content).then(() => {
      copied = true;
      oncopymessage?.(message.content!);
    }).catch(() => {
      console.error('Failed to copy to clipboard');
    });
  }

  function toggleSaved() {
    if (message?.id) {
      onsave?.(message.id);
    }
  }
</script>

<div
  class="chat-message-container flex gap-3 py-2"
  class:justify-end={isUser}
  onmouseenter={() => showActions = true}
  onmouseleave={() => showActions = false}
  role="listitem"
>
  {#if !isUser}
    <div class="flex-shrink-0 w-8 h-8 rounded-full bg-sand/10 flex items-center justify-center">
      <span class="i-lucide-bot w-5 h-5 text-sand/60 inline-block"></span>
    </div>
  {/if}

  <div class="message-content-wrapper flex flex-col max-w-[80%]">
    <div
      class="message-bubble rounded-lg px-4 py-2.5 {!isUser ? 'bg-sand/10' : ''}"
      class:bg-info={isUser}
      class:text-white={isUser}
    >
      {#if isProactive}
        <div class="flex items-center gap-1 text-xs opacity-70 mb-1">
          <span class="i-lucide-clock w-3 h-3 inline-block"></span>
          <span>Proactive suggestion</span>
        </div>
      {/if}

      <div class="message-text prose prose-sm max-w-none">
        {@html message.content}
      </div>

      {#if isAssistant && emotionalTone && emotionalTone !== 'neutral'}
        <div class="flex items-center gap-1 text-xs mt-2 {toneColor}">
          {#if emotionalTone === 'encouraging'}
            <span class="i-lucide-thumbs-up w-3 h-3 inline-block"></span>
          {:else if emotionalTone === 'supportive'}
            <span class="i-lucide-heart w-3 h-3 inline-block"></span>
          {:else if emotionalTone === 'enthusiastic'}
            <span class="i-lucide-star w-3 h-3 inline-block"></span>
          {/if}
          <span class="capitalize">{emotionalTone}</span>
        </div>
      {/if}
    </div>

    <!-- Timestamp & Actions -->
    <div class="flex items-center gap-2 mt-1 text-xs" class:justify-end={isUser} class:justify-start={!isUser}>
      <span class="text-sand/40">{formattedTime}</span>

      {#if showActions}
        <div class="actions flex gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            class="p-1 h-auto w-auto"
            onclick={copyToClipboard}
            title={copied ? 'Copied!' : 'Copy message'}
          >
            <span class="i-lucide-copy w-3.5 h-3.5 inline-block"></span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            class="p-1 h-auto w-auto"
            onclick={toggleSaved}
            title={message.saved ? 'Remove from saved' : 'Save message'}
          >
            {#if message.saved}
              <span class="i-lucide-star w-3.5 h-3.5 text-warning inline-block"></span>
            {:else}
              <span class="i-lucide-star-off w-3.5 h-3.5 inline-block"></span>
            {/if}
          </Button>

          <Button variant="ghost" size="sm" class="p-1 h-auto w-auto" title="More options">
            <span class="i-lucide-more-vertical w-3.5 h-3.5 inline-block"></span>
          </Button>
        </div>
      {/if}
    </div>

    <!-- AI Metadata -->
    {#if hasMetadata}
      <div class="text-xs text-sand/40 mt-0.5" class:text-right={isUser} class:text-left={!isUser}>
        {#if message.metadata?.model}
          <span>Model: {message.metadata.model}</span>
        {/if}
        {#if message.metadata?.latency}
          <span class="ml-1">| {message.metadata.latency}ms</span>
        {/if}
        {#if message.metadata?.tokenCount}
          <span class="ml-1">| {message.metadata.tokenCount} tokens</span>
        {/if}
      </div>
    {/if}
  </div>

  {#if isUser}
    <div class="flex-shrink-0 w-8 h-8 rounded-full bg-info/10 flex items-center justify-center">
      <span class="i-lucide-users w-5 h-5 text-info inline-block"></span>
    </div>
  {/if}
</div>

<style>
  .message-text :global(p) {
    margin-bottom: 0.5rem;
  }
  .message-text :global(p:last-child) {
    margin-bottom: 0;
  }
  .message-text :global(ul),
  .message-text :global(ol) {
    margin: 0.5rem 0;
    padding-left: 1.25rem;
  }
  .message-text :global(code) {
    background: rgba(0, 0, 0, 0.1);
    padding: 0.125rem 0.25rem;
    border-radius: 0.25rem;
    font-family: 'Courier New', monospace;
    font-size: 0.875em;
  }
  .message-text :global(blockquote) {
    border-left: 3px solid rgba(0, 0, 0, 0.2);
    padding-left: 1rem;
    margin: 0.5rem 0;
    font-style: italic;
  }
</style>
