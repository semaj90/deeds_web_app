<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';

	const icons = ['search', 'user', 'settings', 'home', 'star'] as const;
	const sizes = [
		{ label: 'Small (16px)', px: 16 },
		{ label: 'Medium (20px)', px: 20 },
		{ label: 'Large (24px)', px: 24 },
		{ label: 'Extra Large (32px)', px: 32 },
	];
</script>

<div class="max-w-2xl p-8">
	<h1 class="text-xl font-bold mb-1">Icon System Demo</h1>
	<p class="text-xs text-sand/50 mb-6">UnoCSS i-lucide-* icons via Icon.svelte wrapper — pure CSS, SSR-safe</p>

	{#each sizes as size}
		<section class="mb-6">
			<h3 class="text-sm font-semibold mb-2 pb-1.5 border-b border-sand/10">{size.label}</h3>
			<div class="flex flex-wrap gap-4">
				{#each icons as name}
					<div class="flex flex-col items-center gap-1">
						<Icon {name} size={size.px} />
						<span class="text-[10px] text-sand/40 font-mono">{name}</span>
					</div>
				{/each}
			</div>
		</section>
	{/each}

	<section class="mb-6">
		<h3 class="text-sm font-semibold mb-2 pb-1.5 border-b border-sand/10">Responsive Grid</h3>
		<div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
			{#each ['file-text', 'folder', 'shield', 'scale', 'brain', 'cpu', 'database', 'activity'] as name}
				<div class="flex flex-col items-center gap-1.5 p-3 border border-sand/10 rounded-md bg-panel-soft">
					<Icon {name} size={20} />
					<span class="text-[10px] text-sand/40 font-mono">{name}</span>
				</div>
			{/each}
		</div>
	</section>
</div>
