<script lang="ts">
	import Icon from '$lib/components/ui/Icon.svelte';
	import { fly } from 'svelte/transition';

	let { isOpen = $bindable(false), citations = [], definitions = [] } = $props<{
		isOpen: boolean;
		citations: any[];
		definitions: any[];
	}>();
</script>

{#if isOpen}
	<!-- Backdrop -->
	<div
		class="overlay-backdrop"
		onclick={() => isOpen = false}
		onkeydown={(e) => e.key === 'Escape' && (isOpen = false)}
		role="button"
		tabindex="0"
		aria-label="Close overlay"
	></div>

	<!-- Side Panel -->
	<div class="cited-sources-panel" transition:fly={{ x: 400, duration: 300 }}>
		<div class="panel-header">
			<div class="title-row">
				<Icon name="scroll-text" size={16} class="text-accent" />
				<h3>Cited Sources</h3>
				<span class="count-badge">{citations.length + definitions.length}</span>
			</div>
			<button class="close-btn" onclick={() => isOpen = false}>
				<Icon name="x" size={20} />
			</button>
		</div>

		<div class="panel-content">
			<!-- Defined Terms Section -->
			{#if definitions.length > 0}
				<div class="source-section">
					<div class="section-label">Defined Terms</div>
					{#each definitions as def}
						<div class="source-card">
							<div class="card-meta">
								<span class="type-tag">Definition</span>
								<span class="ref-tag">{def.term}</span>
							</div>
							<p class="source-body">
								{def.definition_text}
							</p>
							<div class="card-footer">
								<button class="action-link">
									<Icon name="copy" size={12} />
									<span>Copy Definition</span>
								</button>
							</div>
						</div>
					{/each}
				</div>
			{/if}

			<!-- Statutory Citations Section -->
			{#if citations.length > 0}
				<div class="source-section">
					<div class="section-label">Cited Authorities</div>
					{#each citations as citation}
						<div class="source-card">
							<div class="card-meta">
								<span class="type-tag">{citation.type || 'Statute'}</span>
								<span class="ref-tag">{citation.label}</span>
							</div>
							<p class="source-body">
								{citation.content || 'Content not indexed in current corpus view.'}
							</p>
							<div class="card-footer">
								<button class="action-link">
									<Icon name="external-link" size={12} />
									<span>View Authority</span>
								</button>
								<button class="action-link">
									<Icon name="copy" size={12} />
									<span>Copy Text</span>
								</button>
							</div>
						</div>
					{/each}
				</div>
			{:else if definitions.length === 0}
				<div class="empty-state">
					<Icon name="search" size={32} class="text-sand/10 mb-2" />
					<p>No cited sources detected in this section.</p>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.overlay-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.4);
		backdrop-filter: blur(2px);
		z-index: 1100;
	}

	.cited-sources-panel {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		width: 380px;
		background: #1a1b23;
		border-left: 1px solid rgba(255, 255, 255, 0.1);
		box-shadow: -8px 0 32px rgba(0, 0, 0, 0.5);
		z-index: 1200;
		display: flex;
		flex-direction: column;
	}

	.panel-header {
		padding: 1.5rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.title-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.panel-header h3 {
		font-size: 0.9rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #e0e0e0;
	}

	.count-badge {
		background: rgba(96, 165, 250, 0.15);
		color: #60a5fa;
		font-size: 0.625rem;
		font-weight: 700;
		padding: 0.1rem 0.4rem;
		border-radius: 99px;
		font-family: monospace;
	}

	.close-btn {
		background: transparent;
		border: none;
		color: rgba(255, 255, 255, 0.4);
		cursor: pointer;
		padding: 4px;
		transition: color 0.15s;
	}

	.close-btn:hover {
		color: #e0e0e0;
	}

	.panel-content {
		flex: 1;
		overflow-y: auto;
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 2rem;
	}

	.section-label {
		font-size: 0.625rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: rgba(255, 255, 255, 0.3);
		margin-bottom: 1rem;
	}

	.source-section {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.source-card {
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 8px;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.card-meta {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.type-tag {
		font-size: 0.5625rem;
		font-weight: 700;
		text-transform: uppercase;
		background: rgba(255, 255, 255, 0.05);
		color: rgba(255, 255, 255, 0.4);
		padding: 0.1rem 0.35rem;
		border-radius: 2px;
	}

	.ref-tag {
		font-size: 0.75rem;
		font-weight: 600;
		color: #4ade80;
	}

	.source-body {
		font-size: 0.75rem;
		line-height: 1.5;
		color: rgba(255, 255, 255, 0.6);
	}

	.card-footer {
		display: flex;
		gap: 1rem;
		padding-top: 0.5rem;
		border-top: 1px solid rgba(255, 255, 255, 0.04);
	}

	.action-link {
		background: transparent;
		border: none;
		display: flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.6875rem;
		color: #60a5fa;
		cursor: pointer;
		padding: 0;
	}

	.action-link:hover {
		text-decoration: underline;
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 4rem 2rem;
		text-align: center;
		color: rgba(255, 255, 255, 0.2);
		font-size: 0.75rem;
	}
</style>
