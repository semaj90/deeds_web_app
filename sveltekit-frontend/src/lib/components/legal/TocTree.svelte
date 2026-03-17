<script lang="ts">
	import { Collapsible } from 'bits-ui';
	import TocTree from './TocTree.svelte';

	type TocNode = {
		id: string;
		heading?: string;
		label?: string;
		citationLabel?: string | null;
		citation_label?: string | null;
		nodeType?: string;
		node_type?: string;
		children?: TocNode[];
	};

	interface Props {
		nodes: TocNode[];
		selectedId?: string | null;
		onSelect?: (id: string) => void;
		depth?: number;
	}

	let {
		nodes = [],
		selectedId = $bindable<string | null>(null),
		onSelect,
		depth = 0,
	}: Props = $props();

	const NODE_GLYPH: Record<string, string> = {
		document: '◆',
		title: '§',
		article: '▸',
		chapter: '◻',
		part: '◈',
		section: '¶',
		subsection: '∙',
		paragraph: '∙',
		clause: '∙',
		definition: '※',
		appendix: '⊕',
		note: '○',
	};

	let openState = $state<Record<string, boolean>>({});

	function labelFor(node: TocNode) {
		return node.heading ?? node.label ?? 'Untitled node';
	}

	function citationFor(node: TocNode) {
		return node.citationLabel ?? node.citation_label ?? null;
	}

	function typeFor(node: TocNode) {
		return node.nodeType ?? node.node_type ?? 'section';
	}

	function isOpen(id: string) {
		return openState[id] ?? depth < 1;
	}

	function setOpen(id: string, open: boolean) {
		openState[id] = open;
	}

	function selectNode(id: string) {
		selectedId = id;
		onSelect?.(id);
	}

	function itemClass(id: string) {
		return [
			'flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition',
			selectedId === id
				? 'bg-blue-500/12 text-white ring-1 ring-inset ring-blue-400/30'
				: 'text-zinc-300 hover:bg-white/6 hover:text-white',
		].join(' ');
	}
</script>

<div class={`grid gap-2 ${depth > 0 ? 'ml-4 border-l border-white/6 pl-3' : ''}`}>
	{#each nodes as node (node.id)}
		{@const hasChildren = Boolean(node.children?.length)}
		{@const citation = citationFor(node)}
		{@const nodeLabel = labelFor(node)}
		{@const nodeType = typeFor(node)}

		{#if hasChildren}
			<Collapsible.Root
				class="overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03]"
				open={isOpen(node.id)}
				onOpenChange={(open) => setOpen(node.id, open)}
			>
				<Collapsible.Trigger class={itemClass(node.id)} onclick={() => selectNode(node.id)}>
					<span class={`w-4 shrink-0 text-[10px] text-zinc-500 transition ${isOpen(node.id) ? 'rotate-90' : ''}`}>
						▶
					</span>
					<span class="min-w-0 flex-1 truncate">{nodeLabel}</span>
					{#if citation}
						<span class="shrink-0 text-[10px] font-mono text-zinc-500">{citation}</span>
					{/if}
				</Collapsible.Trigger>

				<Collapsible.Content class="border-t border-white/6 px-2 py-2">
					<TocTree nodes={node.children ?? []} bind:selectedId {onSelect} depth={depth + 1} />
				</Collapsible.Content>
			</Collapsible.Root>
		{:else}
			<button type="button" class={itemClass(node.id)} onclick={() => selectNode(node.id)}>
				<span class="w-4 shrink-0 text-[10px] text-zinc-500">{NODE_GLYPH[nodeType] ?? '∙'}</span>
				<span class="min-w-0 flex-1 truncate">{nodeLabel}</span>
				{#if citation}
					<span class="shrink-0 text-[10px] font-mono text-zinc-500">{citation}</span>
				{/if}
			</button>
		{/if}
	{/each}
</div>
