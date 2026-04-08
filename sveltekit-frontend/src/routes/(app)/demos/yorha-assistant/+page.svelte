<script lang="ts">
	import YorhaAIAssistant from '$lib/components/ai/YorhaAIAssistant.svelte';
	export const ssr = false;
</script>

<div class="p-6 max-w-4xl mx-auto">
	<header class="mb-6">
		<h1 class="text-xl font-bold mb-1">YoRHa AI Assistant</h1>
		<p class="text-sm opacity-60">YoRHa-themed AI assistant with SSE streaming, session management, confidence scoring, and dark terminal aesthetic.</p>
	</header>
	<YorhaAIAssistant userID="demo-user" />
</div>