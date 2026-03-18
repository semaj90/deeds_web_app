<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import { onMount } from 'svelte';

	let { node, document, imagePath = '/images/legal-dashboard-hero.png' }: {
		node: any;
		document: any;
		imagePath?: string;
	} = $props();

	let aiSummary = $state<string | null>(null);
	let loading = $state(false);

	// Build a sensible summary from node text if no AI summary available
	const displaySummary = $derived(
		aiSummary
		?? node.summary
		?? (node.fullText
			? node.fullText.slice(0, 400) + (node.fullText.length > 400 ? '...' : '')
			: `This section of the ${document.title} establishes the core legal framework for ${node.heading}. It outlines the primary obligations, rights, and definitions that govern this specific area of law.`)
	);

	onMount(async () => {
		if (aiSummary || !document.id) return;
		loading = true;
		try {
			const res = await fetch(`/api/library/documents/${document.id}/summary`);
			if (res.ok) {
				const data = await res.json();
				if (data.summary) {
					aiSummary = data.summary;
				}
			}
		} catch {
			// Non-fatal — fall back to text excerpt
		} finally {
			loading = false;
		}
	});
</script>

<div class="executive-summary-card">
	<div class="card-image">
		<img src={imagePath} alt="Legal Scales" />
		<div class="image-overlay"></div>
	</div>

	<div class="card-content">
		<div class="header">
			<Icon name="scroll" size={18} class="text-accent" />
			<h3>Executive Summary</h3>
			{#if loading}
				<span class="loading-badge">Analyzing...</span>
			{/if}
		</div>

		<div class="summary-text">
			<p>
				<span class="first-word">{displaySummary.split(' ')[0]}</span> {displaySummary.split(' ').slice(1).join(' ')}
			</p>
		</div>

		<div class="metadata-footer">
			<div class="meta-item">
				<Icon name="hash" size={12} class="text-sand/40" />
				<span>{node.citationLabel || node.heading}</span>
			</div>
			{#if document.jurisdiction}
				<div class="meta-item">
					<Icon name="map-pin" size={12} class="text-sand/40" />
					<span>{document.jurisdiction.name}</span>
				</div>
			{/if}
			<div class="meta-item">
				<Icon name="external-link" size={12} class="text-sand/40" />
				{#if document.officialUrl}
					<a href={document.officialUrl} target="_blank" rel="noopener noreferrer">View on Official Source</a>
				{:else}
					<span>Internal corpus only</span>
				{/if}
			</div>
		</div>
	</div>
</div>

<style>
	.executive-summary-card {
		display: grid;
		grid-template-columns: 200px 1fr;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 12px;
		overflow: hidden;
		backdrop-filter: blur(8px);
		box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2);
	}

	.card-image {
		position: relative;
		height: 100%;
		background: #0d0e14;
	}

	.card-image img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		opacity: 0.8;
	}

	.image-overlay {
		position: absolute;
		inset: 0;
		background: linear-gradient(90deg, transparent 0%, rgba(13, 14, 20, 0.8) 100%);
	}

	.card-content {
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.header h3 {
		font-size: 0.9rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #e0e0e0;
	}

	.loading-badge {
		font-size: 0.625rem;
		padding: 0.15rem 0.5rem;
		border-radius: 99px;
		background: rgba(96, 165, 250, 0.15);
		color: #60a5fa;
		animation: pulse 1.5s ease-in-out infinite;
	}

	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.5; }
	}

	.summary-text {
		font-size: 0.875rem;
		line-height: 1.6;
		color: rgba(255, 255, 255, 0.8);
	}

	.first-word {
		color: #4ade80;
		font-weight: 700;
	}

	.metadata-footer {
		margin-top: auto;
		display: flex;
		gap: 1.5rem;
		align-items: center;
		padding-top: 1rem;
		border-top: 1px solid rgba(255, 255, 255, 0.05);
		flex-wrap: wrap;
	}

	.meta-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.75rem;
		color: rgba(255, 255, 255, 0.5);
	}

	.meta-item a {
		color: #60a5fa;
		text-decoration: none;
	}

	.meta-item a:hover {
		text-decoration: underline;
	}
</style>
