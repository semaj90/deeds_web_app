<script lang="ts">
	import AIChatAssistant from '$lib/components/AIChatAssistant.svelte';

	export const ssr = false;
</script>

<div class="p-6 max-w-2xl mx-auto">
	<header class="mb-6">
		<h1 class="text-xl font-bold mb-1">AI Chat Assistant</h1>
		<p class="text-sm opacity-60">Simple mock AI assistant with case context, simulated responses, and message history.</p>
	</header>

	<AIChatAssistant caseId="demo-case-001" initialContext="Property dispute involving boundary encroachment and easement rights." />
</div>
