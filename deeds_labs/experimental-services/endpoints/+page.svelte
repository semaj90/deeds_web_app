<script lang="ts">
	type Endpoint = {
		name: string;
		path: string;
		healthy: boolean;
		message?: string;
	};
	let { data }: { data: { endpoints: Endpoint[] } } = $props();
</script>

<main class="endpoints-page">
	<h1 class="page-title">Service Endpoints Status</h1>
	<div class="endpoint-list">
		{#each data.endpoints as endpoint}
			<div class="endpoint-card" class:ok={endpoint.healthy} class:fail={!endpoint.healthy}>
				<h2>{endpoint.name}</h2>
				<p class="path">{endpoint.path}</p>
				{#if endpoint.message}
					<p class="status">{endpoint.message}</p>
				{/if}
			</div>
		{/each}
	</div>
</main>

<style>
  .endpoints-page {
    padding: 2rem;
  }
  .page-title {
    font-size: 1.8rem;
    margin-bottom: 1rem;
    color: #ffd700;
  }
  .endpoint-list {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 1rem;
  }
  .endpoint-card {
    border-radius: var(--radius-lg, 8px);
    padding: 1rem;
    box-shadow: var(--shadow-md, 0 4px 6px rgba(0, 0, 0, 0.3));
    background: var(--surface, #2a2a2a);
    color: var(--text-primary, #e0e0e0);
    border: 1px solid #444;
  }
  .endpoint-card.ok {
    border-left: 6px solid var(--success, #00ff41);
  }
  .endpoint-card.fail {
    border-left: 6px solid var(--danger, #ff0041);
  }
  .endpoint-card h2 {
    margin: 0 0 0.5rem 0;
    font-size: 1.2rem;
    color: #ffd700;
  }
  .path {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.9rem;
    color: var(--muted, #b0b0b0);
    margin: 0.5rem 0;
    word-break: break-all;
  }
  .status {
    margin-top: 0.5rem;
    font-weight: 600;
    color: var(--text-primary, #e0e0e0);
  }
</style>
