<script lang="ts">
	import AskAI from '$lib/components/ai/AskAI.svelte';
</script>

<div class="p-6 max-w-3xl mx-auto">
	<header class="mb-6">
		<h1 class="text-xl font-bold mb-1">Ask AI</h1>
		<p class="text-sm opacity-60">AI Q&A with reference citations, confidence scoring, conversation history, and search result counts.</p>
	</header>
	<AskAI placeholder="Ask a legal question..." showReferences={true} />
</div>