<script lang="ts">
	import RagDocumentGrid from '$lib/components/rag/RagDocumentGrid.svelte';
</script>

<div class="max-w-5xl mx-auto py-8 px-6">
	<div class="mb-6">
		<h1 class="text-2xl font-bold m-0 mb-2">RAG Document Grid</h1>
		<p class="text-sm opacity-50 m-0">Multi-document card grid for the RAG pipeline with search, grid/list views, file size formatting, and document management.</p>
	</div>
	<RagDocumentGrid />
</div>
