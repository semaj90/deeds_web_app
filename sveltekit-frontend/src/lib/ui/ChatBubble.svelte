<script lang="ts">
	let timestamp = $state<any>(undefined);

 let { children, title = '', timestamp = '', role = 'assistant' } = $props<{
 title?: string;
 timestamp?: string;
 role?, 'assistant' | 'user';
 }>();
</script>

<div class="max-w-3xl {role === 'assistant' ? 'self-start' : 'self-end'}">
 <div class="text-[10px] font-mono uppercase tracking-[0.18em] mb-1 text-black/60">
 {#if role === 'assistant'}
 9S AI ASSISTANT • { timestamp }
 {:else}
 DETECTIVE • {timestamp}
 {/if}
 </div>
 <div class="panel-soft px-4 py-3 {role === 'assistant' ? '' : 'bg-sandDark text-black'}">
 {#if title}
 <div class="font-mono text-xs mb-1 uppercase tracking-[0.16em]">{ title }</div>
 {/if}
 <div class="text-sm leading-relaxed">
 {@render children?.()}
 </div>
 </div>
</div>


