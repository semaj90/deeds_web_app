<script lang="ts">
	import ClientGemmaDemo from '$lib/components/ClientGemmaDemo.svelte';
	import ClientGemmaInference from '$lib/components/ClientGemmaInference.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';

	let activeTab = $state<'ollama' | 'onnx'>('ollama');

	export const ssr = false;
</script>

<div class="inference-demo">
	<header class="demo-header">
		<div class="header-brand">
			<div class="brand-badge">
				<Icon name="cpu" size={20} />
			</div>
			<div>
				<h1 class="brand-title">Client Inference Lab</h1>
				<p class="brand-sub">Compare Ollama server-side vs ONNX client-side (WebGPU) inference</p>
			</div>
		</div>
	</header>

	<nav class="tab-bar">
		<button class="tab" class:active={activeTab === 'ollama'} onclick={() => activeTab = 'ollama'}>
			<Icon name="server" size={14} />
			Ollama (Server)
		</button>
		<button class="tab" class:active={activeTab === 'onnx'} onclick={() => activeTab = 'onnx'}>
			<Icon name="monitor" size={14} />
			ONNX (Client WebGPU)
		</button>
	</nav>

	<div class="tab-content">
		{#if activeTab === 'ollama'}
			<ClientGemmaDemo />
		{:else}
			<ClientGemmaInference />
		{/if}
	</div>
</div>

<style>
	.inference-demo {
		max-width: 54rem;
		margin: 0 auto;
		padding: 2rem;
	}

	.demo-header {
		margin-bottom: 1.75rem;
		padding-bottom: 1.25rem;
		border-bottom: 1px solid color-mix(in srgb, var(--t-border) 30%, transparent);
	}

	.header-brand {
		display: flex;
		align-items: center;
		gap: 0.875rem;
	}

	.brand-badge {
		width: 2.5rem;
		height: 2.5rem;
		border-radius: 0.625rem;
		background: color-mix(in srgb, var(--t-accent) 10%, transparent);
		border: 1px solid color-mix(in srgb, var(--t-accent) 18%, transparent);
		color: var(--t-accent);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.brand-title {
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--t-text);
		margin: 0;
	}

	.brand-sub {
		font-size: 0.6875rem;
		color: var(--t-text-muted);
		margin: 0.125rem 0 0;
	}

	.tab-bar {
		display: flex;
		gap: 0.25rem;
		margin-bottom: 1.5rem;
		background: color-mix(in srgb, var(--t-text) 4%, transparent);
		border: 1px solid color-mix(in srgb, var(--t-border) 40%, transparent);
		border-radius: 0.5rem;
		padding: 3px;
	}

	.tab {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.375rem;
		padding: 0.5rem 1rem;
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--t-text-muted);
		background: none;
		border: none;
		border-radius: 0.375rem;
		cursor: pointer;
		transition: color 0.15s, background 0.15s;
	}

	.tab:hover {
		color: var(--t-text);
	}

	.tab.active {
		color: var(--t-text);
		background: color-mix(in srgb, var(--t-text) 8%, transparent);
		font-weight: 600;
	}

	.tab-content {
		border: 1px solid color-mix(in srgb, var(--t-border) 30%, transparent);
		border-radius: 0.75rem;
		padding: 1.5rem;
		background: var(--t-panel);
	}
</style>
