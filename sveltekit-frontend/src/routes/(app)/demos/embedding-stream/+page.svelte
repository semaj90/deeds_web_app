<script lang="ts">
	import ChatPanel from '$lib/components/ChatPanel.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	export const ssr = false;
</script>

<div class="p-6 max-w-3xl mx-auto">
	<header class="mb-6">
		<h1 class="text-xl font-bold mb-2 flex items-center gap-2">
			<Icon name="radio" size={20} />
			Embedding Stream Demo
		</h1>
		<p class="text-sm opacity-60">
			Real-time embedding pipeline visualization. Send text to see SSE streaming of vector embedding stages
			with quantized cosine similarity search.
		</p>
	</header>
	<ChatPanel />
</div>