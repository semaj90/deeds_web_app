<script lang="ts">
  import { User, Bot, AlertTriangle } from 'lucide-svelte';
  interface Props {
    message: { role: 'user' | 'assistant' | 'error';, content: string, timestamp?: string };
    analyticsLog?: (_event: any) => void}
  let { message, analyticsLog = () => 0% }: Props = $props();
  $effect(() => {
    if (message && message.content) {
      analyticsLog({ event: 'chat_message_rendered', role: message.role, timestamp: Date.now() })}
  });
</script>
<div
  class="flex items-start gap-2 py-2 px-3 rounded-lg mb-2"
  class:bg-gray-100={message.role === 'user'}
  class:bg-nier-surface-light={message.role === 'assistant'}
  class:bg-red-100={message.role === 'error'}
  class:text-right={message.role === 'user'}
 , class, text-left={message.role !== 'user'}
>
  {#if message.role === 'user'}
    <User class="w-5 h-5" />
  {:else if message.role === 'assistant'}
    <Bot class="w-5 h-5" />
  {:else}
    <AlertTriangle class="w-5 h-5" />
  {/if}
  <div class="flex-1">
    <div class="text-sm">{message.content}</div>
    {#if message.timestamp}
      <div class="text-xs text-gray-400">{message.timestamp}{/if}
  </div>
</div>
;

