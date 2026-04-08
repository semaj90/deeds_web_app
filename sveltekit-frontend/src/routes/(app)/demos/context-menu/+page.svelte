<script lang="ts">
	import ContextMenuContent from '$lib/components/ui/ContextMenuContent.svelte';
	import ContextMenuItem from '$lib/components/ui/ContextMenuItem.svelte';
	import ContextMenuTrigger from '$lib/components/ui/ContextMenuTrigger.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';

	let log = $state<string[]>([]);

	function addLog(msg: string) {
		log = [`[${new Date().toLocaleTimeString()}] ${msg}`, ...log].slice(0, 15);
	}

	export const ssr = false;
</script>

<div class="p-6 max-w-2xl mx-auto">
	<header class="mb-6">
		<h1 class="text-xl font-bold mb-1">Context Menu</h1>
		<p class="text-sm opacity-60">Right-click context menu with trigger, content wrapper, and menu items with select callbacks and disabled states.</p>
	</header>

	<div class="p-8 rounded border border-sand/20 text-center text-sm opacity-60 mb-4">
		<ContextMenuTrigger>
			<div class="p-12 border-2 border-dashed border-sand/20 rounded">
				Right-click here to open context menu
			</div>
		</ContextMenuTrigger>
	</div>

	<div class="p-4 rounded border border-sand/20 mb-4">
		<p class="text-sm font-bold mb-2 opacity-70">Menu Items Preview:</p>
		<ContextMenuContent>
			<ContextMenuItem onselect={() => addLog('Copy')}>Copy</ContextMenuItem>
			<ContextMenuItem onselect={() => addLog('Paste')}>Paste</ContextMenuItem>
			<ContextMenuItem onselect={() => addLog('Delete')}>Delete</ContextMenuItem>
			<ContextMenuItem disabled={true}>Disabled Action</ContextMenuItem>
		</ContextMenuContent>
	</div>

	{#if log.length > 0}
		<div class="p-4 rounded border border-sand/20 font-mono text-xs opacity-70 max-h-40 overflow-auto">
			{#each log as entry}
				<div class="py-0.5">{entry}</div>
			{/each}
		</div>
	{/if}
</div>