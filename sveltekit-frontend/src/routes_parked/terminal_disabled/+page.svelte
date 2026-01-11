<script lang="ts">
 import AgentChat from '$lib/components/agentic/AgentChat.svelte';
</script>

<div class="h-full flex flex-col">
 <div class="mb-4">
 <h1 class="text-2xl font-bold text-cyan-400">Terminal</h1>
 <p class="text-slate-400">AI Command Interface</p>
 </div>

 <div class="flex-1 bg-slate-900/50 border border-slate-700 rounded-lg overflow-hidden">
 <AgentChat />
 </div>
</div>


