<script lang="ts">
	import ClientSideAIChat from '$lib/components/ai/ClientSideAIChat.svelte';
</script>

<div class="p-6 max-w-3xl mx-auto">
	<header class="mb-6">
		<h1 class="text-xl font-bold mb-1">Client-Side AI Chat</h1>
		<p class="text-sm opacity-60">WASM adapter chat delegating to /api/sse/chat with WebGPU/WASM health status indicators and streaming responses.</p>
	</header>
	<ClientSideAIChat />
</div>