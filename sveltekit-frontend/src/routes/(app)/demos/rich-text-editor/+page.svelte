<script lang="ts">
	import RichTextEditorSmall from '$lib/components/editor/RichTextEditor.svelte';
	import RichTextEditorFull from '$lib/components/ui/RichTextEditor.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';

	let smallContent = $state('<p>Edit me — this is the <strong>compact</strong> editor with word count.</p>');
	let fullContent = $state('<h2>Full TipTap Editor</h2><p>This editor has a <em>full toolbar</em>, markdown export, and content/JSON modes.</p>');
	let activeTab = $state<'compact' | 'full'>('compact');

	export const ssr = false;
</script>

<div class="p-6 max-w-4xl mx-auto">
	<header class="mb-6">
		<h1 class="text-xl font-bold mb-1">Rich Text Editors</h1>
		<p class="text-sm opacity-60">Two editor variants: compact execCommand-based with word count, and full TipTap editor with toolbar and export.</p>
	</header>

	<div class="flex gap-2 mb-4">
		<button class="px-3 py-1.5 rounded text-sm border" class:border-accent={activeTab === 'compact'} onclick={() => activeTab = 'compact'}>
			Compact (159L)
		</button>
		<button class="px-3 py-1.5 rounded text-sm border" class:border-accent={activeTab === 'full'} onclick={() => activeTab = 'full'}>
			Full TipTap (676L)
		</button>
	</div>

	{#if activeTab === 'compact'}
		<RichTextEditorSmall bind:value={smallContent} placeholder="Compact Editor" />
	{:else}
		<RichTextEditorFull content={fullContent} onChange={({ html }) => fullContent = html} />
	{/if}
</div>