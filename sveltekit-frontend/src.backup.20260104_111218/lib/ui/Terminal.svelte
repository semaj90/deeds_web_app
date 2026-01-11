<script lang="ts">
 let { children, prompt = ">" } = $props();
</script>

<div class="terminal bg-ink text-neon font-mono text-sm p-4 rounded-lg border border-frame/20 overflow-x-auto">
 <div class="mb-2 text-neon/70">{prompt}</div>
 {@render children?.()}
</div>
