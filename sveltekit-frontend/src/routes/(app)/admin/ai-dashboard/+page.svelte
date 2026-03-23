<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
</script>

<div class="ai-dashboard-hub">
	<header class="hub-header">
		<div>
			<p class="eyebrow">Admin AI Surfaces</p>
			<h1>AI Dashboard</h1>
			<p class="subtitle">The mixed panel page has been split into route-specific surfaces for operator workflows and lab tooling.</p>
		</div>
		<div class="status-chip">
			<Icon name="split-square-horizontal" class="w-4 h-4" />
			Route split active
		</div>
	</header>

	<section class="hub-grid">
		<a class="hub-card operator" href="/admin/ai-dashboard/operator">
			<div class="card-topline">Production Operator</div>
			<h2>Operator Console</h2>
			<p>Active route-backed workflows for chat, retrieval review, intake, search, and model control.</p>
			<span class="card-link">Open operator route</span>
		</a>

		<a class="hub-card lab" href="/admin/ai-dashboard/lab">
			<div class="card-topline">Experimental + Demo</div>
			<h2>Lab Console</h2>
			<p>Validation, image analysis, GPU-heavy investigation tools, training telemetry, and architecture demos.</p>
			<span class="card-link">Open lab route</span>
		</a>
	</section>
</div>

<style>
	.ai-dashboard-hub {
		min-height: 100vh;
		margin: -2.5rem;
		padding: 2.5rem;
		background:
			radial-gradient(circle at top left, rgba(96, 165, 250, 0.12), transparent 32%),
			radial-gradient(circle at bottom right, rgba(245, 158, 11, 0.08), transparent 28%),
			#0e0d0b;
		color: rgb(212 199 163);
	}

	.hub-header {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		align-items: flex-start;
		margin-bottom: 2rem;
	}

	.eyebrow {
		margin: 0 0 0.5rem;
		font-size: 0.72rem;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: rgba(212, 199, 163, 0.48);
	}

	h1 {
		margin: 0;
		font-size: clamp(2rem, 4vw, 3rem);
		line-height: 1;
		color: rgba(245, 240, 223, 0.96);
	}

	.subtitle {
		margin: 0.8rem 0 0;
		max-width: 52rem;
		color: rgba(212, 199, 163, 0.72);
		font-size: 0.98rem;
		line-height: 1.6;
	}

	.status-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		border-radius: 999px;
		border: 1px solid rgba(96, 165, 250, 0.28);
		background: rgba(96, 165, 250, 0.1);
		color: #93c5fd;
		padding: 0.55rem 0.9rem;
		font-size: 0.78rem;
		white-space: nowrap;
	}

	.hub-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
		gap: 1rem;
	}

	.hub-card {
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
		min-height: 240px;
		padding: 1.35rem;
		border-radius: 18px;
		text-decoration: none;
		color: inherit;
		border: 1px solid rgba(212, 199, 163, 0.1);
		background: rgba(19, 21, 25, 0.86);
		box-shadow: 0 18px 42px rgba(0, 0, 0, 0.28);
		transition: transform 0.18s ease, border-color 0.18s ease, background 0.18s ease;
	}

	.hub-card:hover {
		transform: translateY(-3px);
	}

	.hub-card.operator:hover {
		border-color: rgba(34, 197, 94, 0.28);
		background: rgba(19, 25, 21, 0.92);
	}

	.hub-card.lab:hover {
		border-color: rgba(245, 158, 11, 0.28);
		background: rgba(25, 21, 17, 0.92);
	}

	.card-topline {
		font-size: 0.72rem;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: rgba(212, 199, 163, 0.5);
	}

	h2 {
		margin: 0;
		font-size: 1.4rem;
		color: rgba(245, 240, 223, 0.96);
	}

	.hub-card p {
		margin: 0;
		color: rgba(212, 199, 163, 0.7);
		line-height: 1.65;
	}

	.card-link {
		margin-top: auto;
		font-size: 0.82rem;
		color: #93c5fd;
	}

	@media (max-width: 720px) {
		.hub-header {
			flex-direction: column;
		}
	}
</style>