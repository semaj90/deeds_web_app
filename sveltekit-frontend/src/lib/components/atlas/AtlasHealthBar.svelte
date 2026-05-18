<script lang="ts">
	import type { AtlasHealthStatus } from '$lib/types/atlas.js';

	let { health }: { health: AtlasHealthStatus | null } = $props();

	const services = [
		{ name: 'Redis', key: 'redis' as const },
		{ name: 'Qdrant', key: 'qdrant' as const },
		{ name: 'Neo4j', key: 'neo4j' as const },
		{ name: 'Ollama', key: 'ollama' as const },
	] as const;
</script>

<div class="flex flex-1 items-center gap-3 px-4 py-1.5 bg-panelSoft rounded-lg text-xs overflow-x-auto">
	{#if !health}
		<span class="text-yellow-400">⚠ health endpoint unreachable</span>
	{:else}
		{#each services as svc, i}
			{@const s = health[svc.key]}
			{#if i > 0}<span class="text-sand-6">·</span>{/if}
			<div class="flex items-center gap-1.5 flex-shrink-0">
				<span
					class="w-2 h-2 rounded-full flex-shrink-0"
					style="background:{s.ok ? '#22c55e' : '#ef4444'}"
				></span>
				<span class="text-sand-9">{svc.name}</span>
				{#if s.ok}
					<span class="font-mono text-sand-7">{s.latencyMs}ms</span>
				{:else}
					<span class="text-red-400 truncate max-w-24">{s.detail ?? 'offline'}</span>
				{/if}
			</div>
		{/each}
		<span class="ml-auto text-sand-7 flex-shrink-0">{new Date(health.timestamp).toLocaleTimeString()}</span>
	{/if}
</div>