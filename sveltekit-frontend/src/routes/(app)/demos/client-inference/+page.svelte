<script lang="ts">
	import ClientGemmaDemo from '$lib/components/ClientGemmaDemo.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';

</script>

<div class="inference-demo">
	<header class="demo-header">
		<div class="header-brand">
			<div class="brand-badge">
				<Icon name="cpu" size={20} />
			</div>
			<div>
				<h1 class="brand-title">Client Inference Lab</h1>
				<p class="brand-sub">Chat uses the configured local server model; embeddings remain a separate service.</p>
			</div>
		</div>
	</header>

	<div class="tab-content">
		<ClientGemmaDemo />
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

	.tab-content {
		border: 1px solid color-mix(in srgb, var(--t-border) 30%, transparent);
		border-radius: 0.75rem;
		padding: 1.5rem;
		background: var(--t-panel);
	}
</style>
