<script lang="ts">
	import EnhancedAIChatTest from '$lib/components/ai/EnhancedAIChatTest.svelte';

	let open = $state(true);

	export const ssr = false;
</script>

<div class="p-6 max-w-4xl mx-auto">
	<header class="mb-6">
		<h1 class="text-xl font-bold mb-1">Enhanced AI Chat Test</h1>
		<p class="text-sm opacity-60">Full-featured AI chat with health checks, streaming responses, bits-ui Dialog integration, and Ollama endpoint testing.</p>
	</header>

	<button class="px-4 py-2 rounded border border-sand/30 hover:border-sand/50 text-sm mb-4" onclick={() => open = true}>
		Open AI Chat Dialog
	</button>

	<EnhancedAIChatTest bind:open caseId="demo-case-001" title="AI Legal Assistant Demo" />
</div>
