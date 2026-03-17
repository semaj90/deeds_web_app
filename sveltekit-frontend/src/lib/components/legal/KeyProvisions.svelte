<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';

	type Provision = {
		id: string;
		heading: string | null;
		full_text?: string | null;
		fullText?: string | null;
		citation_label?: string | null;
		citationLabel?: string | null;
	};

	let {
		provisions = [],
		documentId,
	}: {
		provisions: Provision[];
		documentId: string;
	} = $props();

	function sliceContent(text: string, length = 150) {
		if (!text) return 'No content available for this provision.';
		return text.length > length ? text.slice(0, length) + '...' : text;
	}

	function getContent(provision: Provision) {
		return provision.fullText ?? provision.full_text ?? '';
	}

	function getCitationLabel(provision: Provision) {
		return provision.citationLabel ?? provision.citation_label ?? null;
	}
</script>

<div class="provisions-section">
	<div class="section-header">
		<Icon name="layout-grid" size={18} class="text-accent" />
		<h3>Key Provisions</h3>
	</div>

	<div class="provisions-grid">
		{#each provisions as provision}
			<div class="provision-card">
				<div class="card-header">
					<h4>{provision.heading}</h4>
					<Icon name="info" size={14} class="text-sand/30" />
				</div>

				<p class="card-excerpt">
					{sliceContent(getContent(provision))}
				</p>

				<div class="card-actions">
					{#if getCitationLabel(provision)}
						<button class="chip-btn tertiary">
							<Icon name="hash" size={10} />
							<span>{getCitationLabel(provision)}</span>
						</button>
					{/if}

					<a href="/library/{documentId}/node/{provision.id}" class="chip-btn accent">
						<span>View Statute</span>
						<Icon name="arrow-right" size={10} />
					</a>
				</div>
			</div>
		{:else}
			<div class="empty-state">
				<p class="text-sand/40 italic">No subsections detected in this provision.</p>
			</div>
		{/each}
	</div>
</div>

<style>
	.provisions-section {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.section-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding-left: 0.5rem;
	}

	.section-header h3 {
		font-size: 0.9rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #e0e0e0;
	}

	.provisions-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 1rem;
	}

	.provision-card {
		background: rgba(255, 255, 255, 0.02);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 12px;
		padding: 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
		position: relative;
	}

	.provision-card:hover {
		background: rgba(255, 255, 255, 0.04);
		border-color: rgba(255, 255, 255, 0.12);
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
	}

	.card-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
	}

	.card-header h4 {
		font-size: 0.875rem;
		font-weight: 600;
		color: #e0e0e8;
		margin: 0;
	}

	.card-excerpt {
		font-size: 0.8125rem;
		line-height: 1.5;
		color: rgba(255, 255, 255, 0.5);
		margin: 0;
	}

	.card-actions {
		margin-top: auto;
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		padding-top: 0.5rem;
	}

	.chip-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.25rem 0.6rem;
		border-radius: 6px;
		font-size: 0.6875rem;
		font-weight: 500;
		text-decoration: none;
		border: 1px solid transparent;
		transition: all 0.15s;
		cursor: pointer;
	}

	.chip-btn.tertiary {
		background: rgba(255, 255, 255, 0.05);
		color: rgba(255, 255, 255, 0.4);
		border-color: rgba(255, 255, 255, 0.08);
	}

	.chip-btn.accent {
		background: rgba(96, 165, 250, 0.1);
		color: #60a5fa;
		border-color: rgba(96, 165, 250, 0.2);
	}

	.chip-btn.accent:hover {
		background: rgba(96, 165, 250, 0.15);
		border-color: rgba(96, 165, 250, 0.3);
	}

	.empty-state {
		grid-column: 1 / -1;
		padding: 2rem;
		text-align: center;
		background: rgba(255, 255, 255, 0.01);
		border: 1px dashed rgba(255, 255, 255, 0.05);
		border-radius: 12px;
	}
</style>
