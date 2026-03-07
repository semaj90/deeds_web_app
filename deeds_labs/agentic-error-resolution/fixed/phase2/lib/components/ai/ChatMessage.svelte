<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<!-- @migration-task Error while migrating Svelte code: Unexpected block closing tag
https://svelte.dev/e/block_unexpected_close -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  interface Props {
    message: any;
  }
  // receive props via Svelte 5 rune
  let { message }: Props = $props();
  // Use named imports from lucide-svelte
  import  Button  from "$lib/components/ui/enhanced-bits.svelte";
  import type { chatActions  } from '$lib/stores/chat'; // adjusted store path
  import type { notifications  } from '$lib/stores/unified';
  import type { Bot, Clock, Copy, Heart, MoreVertical, Star, StarOff, ThumbsUp, Users  } from 'lucide-svelte';
  import '../chat/chat-message.css';
  // reactive derived values - correct Svelte 5 usage
  let isUser = $derived.by(() => message?.role === 'user' || message?.type === 'user');
  let isAssistant = $derived.by(() => message?.role === 'assistant' || message?.type === 'assistant');
  let emotionalTone = $derived.by(() => message?.metadata?.emotionalTone ?? null);
  let isProactive = $derived.by(() => !!message?.metadata?.proactive);
  function copyToClipboard() {
    if (!message?.content) return;
    navigator.clipboard.writeText(message.content).then(
      () => {
        (notifications as any)?.add?.({
          type: 'success',
          title: 'Copied',
          message: 'Message copied to clipboard'
        });
      },
      () => {
        (notifications as any)?.add?.({
          type: 'error',
          title: 'Copy failed',
          message: 'Could not copy message'
        });
      }
    );
  }
  function toggleSaved() {
    chatActions.toggleMessageSaved?.(message.id);
  }
  function formatTime(timestamp: Date | string | number): string {
    const date = new Date(timestamp ?? Date.now());
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  function getEmotionalToneColor(tone: string): string {
    switch (tone) {
      case 'encouraging': return 'text-green-600';
      case 'supportive': return 'text-blue-600';
      case 'enthusiastic': return 'text-purple-600';
      case 'thoughtful': return 'text-indigo-600';
      case 'professional': return 'text-gray-600';
      default: return 'text-gray-500';
    }
  }
  function getEmotionalToneIcon(tone: string) {
    switch (tone) {
      case 'encouraging': return ThumbsUp;
      case 'supportive': return Heart;
      case 'enthusiastic': return Star;
      default: return null;
    }
  }
</script>
<div class="chat-message-container flex gap-2 mb-4" class:justify-end={isUser}>
  {#if !isUser}
    <!-- Bot Avatar -->
    <div class="avatar flex-shrink-0">
      <Bot class="w-8 h-8 nes-text is-primary" />
    {/if}
  <div class="message-content-wrapper flex flex-col max-w-[70%]">
    <div class="message-bubble nes-container p-3" class:is-dark={isUser} class:is-rounded={isUser}>
      <!-- Proactive Indicator -->
      {#if isProactive}
        <div class="flex items-center gap-1 text-xs text-gray-400 mb-1">
          <Clock class="w-3 h-3" />
          <span>Proactive suggestion</span>
        {/if}
      <!-- Message Text -->
      <div class="message-text message-content">
        {@html message.content}
      </div>
      <!-- Emotional Tone Indicator for AI Messages -->
      {#if isAssistant && emotionalTone && emotionalTone !== 'neutral'}
        {@const ToneIcon = getEmotionalToneIcon(emotionalTone)}
        <div class="flex items-center gap-1 text-xs mt-2" class={getEmotionalToneColor(emotionalTone)}>
          {#if ToneIcon}
            <ToneIcon class="w-3 h-3" / />
          {/if}
          <span>{emotionalTone}</span>
        {/if}
    </div>
    <!-- Message Actions and Timestamp -->
    <div class="flex items-center gap-2 mt-1 text-xs text-gray-500" class:justify-end={isUser} class:justify-start={!isUser}>
      <span class="timestamp">
        {formatTime(message.timestamp)}
      </span>
      <div class="actions flex gap-1">
        <Button
          variant="ghost"
          size="sm"
          class="p-1 h-auto w-auto"
          onclick={() => copyToClipboard()}
          title="Copy message"
        >
          <Copy class="w-4 h-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          class="p-1 h-auto w-auto"
          onclick={() => toggleSaved()}
          title={message.saved ? 'Remove from saved' : 'Save message'}
        >
          {#if message.saved}
            <Star class="w-4 h-4" />
          {:else}
            <StarOff class="w-4 h-4" />
          {/if}
        </Button>
        <Button variant="ghost" size="sm" class="p-1 h-auto w-auto" title="More options">
          <MoreVertical class="w-4 h-4" />
        </Button>
      </div>
    </div>
    <!-- Metadata (for AI messages) -->
    {#if isAssistant && message.metadata}
      <div class="message-metadata text-xs text-gray-500 mt-1" class:text-right={isUser} class:text-left={!isUser}>
        {#if message.metadata.model}
          <div class="flex items-center gap-1" class:justify-end={isUser} class:justify-start={!isUser}>
            <span>Model: {message.metadata.model}</span>
            {#if message.metadata.latency}
              <span>• {message.metadata.latency}ms</span>
            {/if}
          {/if}
        {#if message.metadata.tokenCount}
          <div class={isUser ? 'text-right' : 'text-left'}>Tokens: {message.metadata.tokenCount}{/if}
      {/if}
  </div>
  {#if isUser}
    <!-- User Avatar -->
    <div class="avatar flex-shrink-0">
      <Users class="w-8 h-8 nes-text is-success" />
    {/if}
</div>
<style>
  /* @unocss-include */
  :global(.message-content) {
    word-wrap: break-word;
    overflow-wrap: break-word;
  }
  :global(.message-content p) {
    margin-bottom: 0.5rem;
  }
  :global(.message-content p:last-child) {
    margin-bottom: 0; /* Corrected comma to semicolon */
  }
  :global(.message-content ul, .message-content ol) {
    margin: 0.5rem 0;
    padding-left: 1.25rem;
  }
  :global(.message-content li) {
    margin-bottom: 0.25rem;
  }
  :global(.message-content code) {
    background: rgba(0, 0, 0, 0.1);
    padding: 0.125rem 0.25rem;
    border-radius: 0.25rem;
    font-family: 'Courier New', monospace;
    font-size: 0.875em;
  }
  :global(.message-content blockquote) {
    border-left: 3px solid rgba(0, 0, 0, 0.2);
    padding-left: 1rem;
    margin: 0.5rem 0;
    font-style: italic;
  }
  :global(.message-content h1, .message-content h2, .message-content h3) {
    font-weight: 600;
    margin: 0.75rem 0 0.5rem 0;
  }
  :global(.message-content h1) {
    font-size: 1.25em;
  }
  :global(.message-content h2) {
    font-size: 1.125em;
  }
  :global(.message-content h3) {
    font-size: 1em;
  }
</style>
