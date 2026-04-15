<script lang="ts">
	import TocTree from '$lib/components/library/reader/TocTree.svelte';

	const sampleToc = [
		{ id: 'ch1', heading: 'Chapter 1: Introduction', nodeType: 'section', children: [
			{ id: 'ch1-1', heading: '1.1 Background', nodeType: 'subsection', children: [] },
			{ id: 'ch1-2', heading: '1.2 Scope', nodeType: 'subsection', children: [] },
		]},
		{ id: 'ch2', heading: 'Chapter 2: Legal Framework', nodeType: 'section', children: [
			{ id: 'ch2-1', heading: '2.1 Statutory Authority', nodeType: 'subsection', children: [] },
			{ id: 'ch2-2', heading: '2.2 Case Law', nodeType: 'subsection', children: [
				{ id: 'ch2-2-1', heading: '2.2.1 Federal Precedents', nodeType: 'paragraph', children: [] },
				{ id: 'ch2-2-2', heading: '2.2.2 State Precedents', nodeType: 'paragraph', children: [] },
			]},
		]},
		{ id: 'ch3', heading: 'Chapter 3: Analysis', nodeType: 'section', children: [] },
	];

</script>

<div class="p-6 max-w-2xl mx-auto">
	<header class="mb-6">
		<h1 class="text-xl font-bold mb-1">Table of Contents Tree</h1>
		<p class="text-sm opacity-60">Collapsible TOC tree with bits-ui accordion, nested sections, and document reader navigation.</p>
	</header>
	<TocTree nodes={sampleToc} />
</div>