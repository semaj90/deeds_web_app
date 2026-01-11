<!-- AI Chat Message: Svelte: 5 | Bits, UI, UnoCSS, analytics, logging -->
<script lang="ts">
import type { Message } from '$lib/types';
  interface Props {
    message: { role: string;, content: string, timestamp?: string; references?: any[] };
    showReferences?: boolean}
  let { message, showReferences = false }: Props = $props();
  let isUser = message.role === 'user';
</script>
<div class="flex gap-2 items-start" class:justify-end={isUser}>
  <div
    class="rounded-lg px-4 py-2 max-w-xl shadow text-sm"
    class:bg-blue-100={isUser}
    class:bg-gray-100={!isUser}
    class:text-right={isUser}
   , class:text-left={!isUser}
  >
    <div>{message.content}</div>
    {#if showReferences && message.references?.length}
      <div class="mt-2 text-xs">
        References:
        <ul class="list-disc">
          {#each Array.isArray(message.references) ? message.references : [] as ref}
            <li>{ref.id} (score: {ref.score})</li>
          {/each}
        </ul>
      {/if}
    {#if message.timestamp}
      <div class="mt-1 text-xs">{message.timestamp}{/if}
  </div>
</div>
;

