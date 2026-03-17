<script lang="ts">
	import { page } from '$app/stores';
	import Icon from '$lib/components/ui/Icon.svelte';

	const items = [
		{ href: '/library', label: 'Documents', icon: 'library-big' },
		{ href: '/library/glossary', label: 'Glossary', icon: 'book-open-text' },
		{ href: '/library/corpus', label: 'Corpus', icon: 'folder-tree' },
	];

	function isActive(href: string) {
		const pathname = $page.url.pathname;
		return href === '/library' ? pathname === href : pathname.startsWith(href);
	}

	function itemClass(href: string) {
		return [
			'btn-ghost w-full justify-start gap-3 rounded-2xl border text-left',
			isActive(href)
				? 'border-blue-400/30 bg-white/12 text-white'
				: 'border-transparent text-zinc-300 hover:border-white/10',
		].join(' ');
	}
</script>

<aside class="flex h-full flex-col gap-6 px-4 py-5">
	<header class="space-y-2">
		<div class="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/6 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-300">
			<Icon name="scale" class="h-3.5 w-3.5 text-[#f0b35a]" />
			Legal Corpus
		</div>
		<div>
			<h2 class="text-lg font-semibold text-white">Verified Law Library</h2>
			<p class="muted mt-1 text-sm">
				Hierarchy-first reading for documents, glossary entries, and source provenance.
			</p>
		</div>
	</header>

	<nav class="grid gap-2" aria-label="Legal library">
		{#each items as item}
			<a href={item.href} class={itemClass(item.href)}>
				<Icon name={item.icon} class="h-4 w-4 shrink-0" />
				<span>{item.label}</span>
			</a>
		{/each}
	</nav>

	<section class="panel mt-auto overflow-hidden">
		<div class="panel-header">
			<h3 class="text-sm font-medium text-white">Architecture</h3>
			<span class="badge text-[10px]">Layered</span>
		</div>
		<div class="panel-body space-y-3 text-sm text-zinc-300">
			<p>Documents hold authority metadata. Nodes hold the legal hierarchy. Chunks stay retrieval-only.</p>
			<div class="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
				<span>docs</span>
				<span>nodes</span>
				<span>chunks</span>
				<span>citations</span>
			</div>
		</div>
	</section>
</aside>