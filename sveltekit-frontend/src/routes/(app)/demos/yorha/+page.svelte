<script lang="ts">
	import GamingAIButton from '$lib/components/ai/GamingAIButton.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';

	let aiMode = $state<'idle' | 'thinking' | 'active'>('idle');
	let isVisible = $state(true);
	let log = $state<string[]>([]);

	function addLog(msg: string) {
		log = [`[${new Date().toLocaleTimeString()}] ${msg}`, ...log].slice(0, 20);
	}

	export const ssr = false;
</script>

<div class="p-6 max-w-4xl mx-auto">
	<header class="mb-6">
		<h1 class="text-xl font-bold mb-2 flex items-center gap-2">
			<Icon name="bot" size={20} />
			YoRHa AI Button Demo
		</h1>
		<p class="text-sm opacity-60">
			Gaming-style floating AI assistant button with quick actions, mode animations, and connection status.
		</p>
	</header>

	<div class="controls mb-6 flex gap-4 flex-wrap">
		<label class="flex items-center gap-2 text-sm">
			<span>Mode:</span>
			<select bind:value={aiMode} class="px-2 py-1 border rounded bg-transparent text-sm">
				<option value="idle">Idle (pulse)</option>
				<option value="thinking">Thinking (bounce)</option>
				<option value="active">Active (ping)</option>
			</select>
		</label>
		<label class="flex items-center gap-2 text-sm">
			<input type="checkbox" bind:checked={isVisible} />
			Visible
		</label>
	</div>

	<div class="log-panel p-4 rounded border max-h-80 overflow-auto font-mono text-xs opacity-70">
		<h3 class="font-bold mb-2 text-sm">Event Log</h3>
		{#if log.length === 0}
			<p class="opacity-50">Interact with the floating button (bottom-right) to see events...</p>
		{/if}
		{#each log as entry}
			<div class="py-0.5">{entry}</div>
		{/each}
	</div>
</div>

<GamingAIButton
	bind:isVisible
	bind:aiMode
	onToggle={() => addLog(`Toggle: mode=${aiMode}`)}
	onSettingsClick={() => addLog('Settings clicked')}
	isConnected={true}
/>

<style>
	.log-panel {
		background: rgba(15, 23, 42, 0.6);
		border-color: rgba(148, 163, 184, 0.2);
	}
	.controls select {
		border-color: rgba(148, 163, 184, 0.3);
	}
</style>
