<script lang="ts">
	import AgentChat from '$lib/components/agentic/AgentChat.svelte';
</script>

<div class="p-6 max-w-3xl mx-auto">
	<header class="mb-6">
		<h1 class="text-xl font-bold mb-1">Agent Chat</h1>
		<p class="text-sm opacity-60">Multi-tool agentic chat interface calling /api/agents/chat with tool execution results and streaming responses.</p>
	</header>
	<AgentChat />
</div>
