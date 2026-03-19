<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import Icon from '$lib/components/ui/Icon.svelte';

	interface Shortcut {
		keys: string[];
		description: string;
		category: string;
	}

	const SHORTCUTS: Shortcut[] = [
		// Navigation
		{ keys: ['Ctrl', 'K'], description: 'Open Command Palette', category: 'Navigation' },
		{ keys: ['Ctrl', 'N'], description: 'Create New Case', category: 'Navigation' },
		{ keys: ['Ctrl', '/'], description: 'Focus Search', category: 'Navigation' },
		{ keys: ['?'], description: 'Keyboard Shortcuts Panel', category: 'Navigation' },
		// Editor
		{ keys: ['Ctrl', 'Shift', 'D'], description: 'Toggle Document Writer', category: 'Editor' },
		{ keys: ['Ctrl', 'S'], description: 'Save Current Document', category: 'Editor' },
		{ keys: ['Ctrl', 'Z'], description: 'Undo', category: 'Editor' },
		{ keys: ['Ctrl', 'Shift', 'Z'], description: 'Redo', category: 'Editor' },
		// Wizard
		{ keys: ['→'], description: 'Next Step', category: 'Onboarding Wizard' },
		{ keys: ['←'], description: 'Previous Step', category: 'Onboarding Wizard' },
		{ keys: ['Enter'], description: 'Confirm / Next', category: 'Onboarding Wizard' },
		{ keys: ['Esc'], description: 'Skip / Dismiss', category: 'Onboarding Wizard' },
		// AI
		{ keys: ['Ctrl', 'Shift', 'A'], description: 'Open AI Chat', category: 'AI' },
		{ keys: ['Ctrl', 'Enter'], description: 'Send Chat Message', category: 'AI' },
	];

	let lastPressed = $state<string[]>([]);
	let pressHistory = $state<Array<{ keys: string[]; time: number }>>([]);
	let filterCategory = $state<string | null>(null);

	const categories = $derived([...new Set(SHORTCUTS.map(s => s.category))]);
	const filtered = $derived(
		filterCategory ? SHORTCUTS.filter(s => s.category === filterCategory) : SHORTCUTS
	);
	const grouped = $derived.by(() => {
		const groups: Record<string, Shortcut[]> = {};
		for (const s of filtered) {
			(groups[s.category] ??= []).push(s);
		}
		return groups;
	});

	function handleKeydown(e: KeyboardEvent) {
		const keys: string[] = [];
		if (e.ctrlKey) keys.push('Ctrl');
		if (e.shiftKey) keys.push('Shift');
		if (e.altKey) keys.push('Alt');

		const key = e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key;
		if (!['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
			keys.push(key);
		}

		if (keys.length > 0) {
			lastPressed = keys;
			pressHistory = [{ keys: [...keys], time: Date.now() }, ...pressHistory.slice(0, 9)];
		}
	}

	function keyMatch(pressed: string[], shortcut: string[]): boolean {
		if (pressed.length !== shortcut.length) return false;
		const norm = (k: string) => k.toLowerCase();
		return pressed.every((k, i) => norm(k) === norm(shortcut[i]));
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="max-w-3xl mx-auto py-8 px-6">
	<!-- Header -->
	<div class="flex items-center gap-3 mb-6">
		<div class="w-10 h-10 rounded-lg bg-purple-500/15 flex items-center justify-center">
			<Icon name="keyboard" size={22} />
		</div>
		<div>
			<h1 class="text-xl font-bold m-0">Keyboard Shortcuts</h1>
			<p class="text-xs opacity-50 m-0">Live key detection + shortcut reference grid</p>
		</div>
	</div>

	<!-- Live detector -->
	<section class="mb-6 p-4 border border-sand-dark rounded-lg bg-panel-soft">
		<h2 class="text-sm font-semibold m-0 mb-3 flex items-center gap-2">
			<Icon name="zap" size={14} />
			Live Key Detection
		</h2>
		<div class="flex items-center gap-4 mb-3">
			<div class="flex gap-1.5 min-h-[36px] items-center">
				{#if lastPressed.length > 0}
					{#each lastPressed as key, i (key + i)}
						<kbd
							class="kbd-live"
							in:fly={{ y: -8, duration: 150, delay: i * 50 }}
						>{key}</kbd>
						{#if i < lastPressed.length - 1}
							<span class="text-xs opacity-30">+</span>
						{/if}
					{/each}
				{:else}
					<span class="text-xs opacity-40 italic">Press any key combo...</span>
				{/if}
			</div>

			<!-- Match indicator -->
			{#if lastPressed.length > 0}
				{@const match = SHORTCUTS.find(s => keyMatch(lastPressed, s.keys))}
				{#if match}
					<span class="text-xs text-green-400 flex items-center gap-1" in:fade={{ duration: 150 }}>
						<Icon name="circle-check" size={12} />
						{match.description}
					</span>
				{/if}
			{/if}
		</div>

		<!-- History -->
		{#if pressHistory.length > 0}
			<div class="flex flex-wrap gap-1.5">
				{#each pressHistory as entry, i}
					<span class="text-[10px] opacity-30 font-mono">
						{entry.keys.join('+')}
					</span>
				{/each}
			</div>
		{/if}
	</section>

	<!-- Category filter -->
	<div class="flex gap-2 mb-4 flex-wrap">
		<button
			class="px-2.5 py-1 text-xs rounded-md border transition-colors"
			class:border-accent={!filterCategory}
			class:bg-accent={!filterCategory}
			class:text-white={!filterCategory}
			class:border-sand-dark={!!filterCategory}
			onclick={() => filterCategory = null}
		>All</button>
		{#each categories as cat}
			<button
				class="px-2.5 py-1 text-xs rounded-md border transition-colors"
				class:border-accent={filterCategory === cat}
				class:bg-accent={filterCategory === cat}
				class:text-white={filterCategory === cat}
				class:border-sand-dark={filterCategory !== cat}
				onclick={() => filterCategory = cat}
			>{cat}</button>
		{/each}
	</div>

	<!-- Shortcut grid -->
	{#each Object.entries(grouped) as [category, items]}
		<section class="mb-5">
			<h3 class="text-xs font-semibold uppercase tracking-wider opacity-50 m-0 mb-2">{category}</h3>
			<div class="grid gap-1.5">
				{#each items as shortcut}
					{@const isActive = keyMatch(lastPressed, shortcut.keys)}
					<div
						class="shortcut-row"
						class:shortcut-active={isActive}
					>
						<div class="flex gap-1">
							{#each shortcut.keys as key, i}
								<kbd class="kbd-ref">{key}</kbd>
								{#if i < shortcut.keys.length - 1}
									<span class="text-[10px] opacity-30 self-center">+</span>
								{/if}
							{/each}
						</div>
						<span class="text-xs opacity-70">{shortcut.description}</span>
					</div>
				{/each}
			</div>
		</section>
	{/each}

	<!-- Code snippet -->
	<section class="p-4 border border-sand-dark rounded-lg bg-panel-soft mt-6">
		<h2 class="text-sm font-semibold m-0 mb-2 flex items-center gap-2">
			<Icon name="code" size={14} />
			Implementation Pattern
		</h2>
		<pre class="text-[11px] leading-relaxed bg-black/30 p-3 rounded-md overflow-x-auto m-0"><code>{`function handleKeydown(e: KeyboardEvent) {
  if (!isVisible) return;
  switch (e.key) {
    case 'ArrowRight':
    case 'Enter':
      e.preventDefault();
      nextStep();
      break;
    case 'Escape':
      e.preventDefault();
      dismiss();
      break;
  }
}`}</code></pre>
	</section>
</div>

<style>
	.kbd-live {
		display: inline-flex;
		align-items: center;
		padding: 4px 10px;
		font-size: 13px;
		font-family: monospace;
		font-weight: 600;
		background: linear-gradient(135deg, rgba(99, 179, 237, 0.15), rgba(128, 90, 213, 0.15));
		border: 1px solid rgba(99, 179, 237, 0.4);
		border-radius: 6px;
		color: #63b3ed;
		min-width: 28px;
		justify-content: center;
	}

	.kbd-ref {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 2px 7px;
		font-size: 11px;
		font-family: monospace;
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 4px;
		min-width: 22px;
	}

	.shortcut-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 6px 10px;
		border-radius: 6px;
		transition: all 0.15s;
	}

	.shortcut-row:hover {
		background: rgba(255, 255, 255, 0.03);
	}

	.shortcut-active {
		background: rgba(99, 179, 237, 0.1) !important;
		border-left: 2px solid #63b3ed;
	}

	.shortcut-active .kbd-ref {
		background: rgba(99, 179, 237, 0.15);
		border-color: rgba(99, 179, 237, 0.4);
		color: #63b3ed;
	}
</style>
