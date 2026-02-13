<script lang="ts">
	import { poiService } from '$lib/features/poi/services/poi';
	import type { KnownAssociate } from '$lib/types/poi';
	import { onMount } from 'svelte';

	let { data } = $props();

	let associates = $state<KnownAssociate[]>([]);
	let associatesLoading = $state(false);
	let associatesError = $state<string | null>(null);
	let activeTab = $state<'details' | 'associates' | 'search'>('details');

	onMount(async () => {
		if (data.poi?.id) {
			await loadAssociates();
		}
	});

	async function loadAssociates() {
		associatesLoading = true;
		associatesError = null;
		try {
			associates = await poiService.listAssociates(data.poi.id);
		} catch (err) {
			associatesError = err instanceof Error ? err.message : 'Failed to load associates';
			associates = [];
		} finally {
			associatesLoading = false;
		}
	}

	async function removeAssociate(associateId: string) {
		try {
			await poiService.removeAssociate(data.poi.id, associateId);
			associates = associates.filter((a) => a.associateId !== associateId);
		} catch (err) {
			console.error('Failed to remove associate:', err);
		}
	}

	function getStatusColor(status: string): string {
		const colors: Record<string, string> = {
			person_of_interest: '#dc2626',
			witness: '#3b82f6',
			suspect: '#f59e0b',
			victim: '#8b5cf6',
			informant: '#10b981',
			surveillance: '#f59e0b',
			wanted: '#dc2626',
			active: '#3b82f6',
			cleared: '#10b981'
		};
		return colors[status] || '#6b7280';
	}

	function getThreatColor(level: string): string {
		const colors: Record<string, string> = {
			low: '#10b981',
			medium: '#f59e0b',
			high: '#ef4444',
			critical: '#dc2626',
			extreme: '#7c2d12'
		};
		return colors[level] || '#6b7280';
	}
</script>

<div class="poi-detail-page">
	{#if !data.poi}
		<div class="error-banner">
			<p>Person of interest not found</p>
			<a href="/persons-of-interest">Back to List</a>
		</div>
	{:else}
		{@const poi = data.poi}
		<div class="detail-header">
			<div class="header-content">
				<h1>{poi.name}</h1>
				<div class="badges">
					<span class="badge status" style="background-color: {getStatusColor(poi.status)}">
						{poi.status.replace(/_/g, ' ')}
					</span>
					<span class="badge threat" style="background-color: {getThreatColor(poi.threatLevel)}">
						Threat: {poi.threatLevel}
					</span>
				</div>
			</div>
			<div class="header-actions">
				<a href="/persons-of-interest" class="btn-secondary">Back</a>
			</div>
		</div>

		<div class="tabs">
			<button
				class="tab-button"
				class:active={activeTab === 'details'}
				onclick={() => (activeTab = 'details')}
			>
				Details
			</button>
			<button
				class="tab-button"
				class:active={activeTab === 'associates'}
				onclick={() => (activeTab = 'associates')}
			>
				Known Associates ({associates.length})
			</button>
			<button
				class="tab-button"
				class:active={activeTab === 'search'}
				onclick={() => (activeTab = 'search')}
			>
				Similar POIs
			</button>
		</div>

		<div class="tab-content">
			{#if activeTab === 'details'}
				<div class="details-grid">
					{#if poi.description}
						<div class="detail-item full-width">
							<div class="label">Description</div>
							<p>{poi.description}</p>
						</div>
					{/if}

					{#if poi.lastLocation}
						<div class="detail-item">
							<div class="label">Last Known Location</div>
							<p>{poi.lastLocation}</p>
						</div>
					{/if}

					{#if poi.lastSeen}
						<div class="detail-item">
							<div class="label">Last Seen</div>
							<p>{poi.lastSeen}</p>
						</div>
					{/if}

					{#if poi.caseId}
						<div class="detail-item">
							<div class="label">Case ID</div>
							<p><a href={`/cases/${poi.caseId}`} class="case-link">{poi.caseId}</a></p>
						</div>
					{/if}

					{#if (poi.aliases ?? []).length > 0}
						<div class="detail-item full-width">
							<div class="label">Known Aliases</div>
							<div class="aliases-list">
								{#each poi.aliases ?? [] as alias}
									<span class="alias-tag">{alias}</span>
								{/each}
							</div>
						</div>
					{/if}

					<div class="detail-item">
						<div class="label">Created</div>
						<p>{new Date(poi.createdAt).toLocaleString()}</p>
					</div>

					<div class="detail-item">
						<div class="label">Last Updated</div>
						<p>{new Date(poi.updatedAt).toLocaleString()}</p>
					</div>
				</div>
			{:else if activeTab === 'associates'}
				<div class="associates-section">
					{#if associatesLoading}
						<p class="empty-message">Loading associates...</p>
					{:else if associatesError}
						<div class="associates-error">
							<p>{associatesError}</p>
							<button class="btn-retry" onclick={loadAssociates}>Retry</button>
						</div>
					{:else if associates.length === 0}
						<p class="empty-message">No known associates</p>
					{:else}
						<div class="associates-list">
							{#each associates as associate (associate.id)}
								<div class="associate-item">
									<div class="associate-info">
										<h4>{associate.associate?.name ?? 'Unknown'}</h4>
										<p class="relationship">{associate.relationshipType}</p>
										{#if associate.notes}
											<p class="notes">{associate.notes}</p>
										{/if}
									</div>
									<button
										class="btn-remove"
										onclick={() => removeAssociate(associate.associateId)}
									>
										Remove
									</button>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{:else if activeTab === 'search'}
				<div class="search-section">
					<p>Similar POIs based on profile analysis</p>
					<p class="placeholder">Search results will appear here</p>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.poi-detail-page {
		padding: 2rem;
		background: #0f0f23;
		min-height: 100vh;
	}

	.error-banner {
		padding: 1rem;
		background: #7f1d1d;
		border: 1px solid #dc2626;
		border-radius: 0.375rem;
		color: #fecaca;
		margin-bottom: 1.5rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.error-banner a {
		color: #fecaca;
		text-decoration: underline;
	}

	.detail-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 2rem;
		padding-bottom: 1.5rem;
		border-bottom: 1px solid #333;
	}

	.header-content h1 {
		color: #ffffff;
		font-size: 2rem;
		margin: 0 0 1rem 0;
	}

	.badges {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.badge {
		padding: 0.5rem 1rem;
		border-radius: 0.375rem;
		font-size: 0.875rem;
		font-weight: 600;
		color: #ffffff;
		text-transform: capitalize;
	}

	.header-actions {
		display: flex;
		gap: 1rem;
	}

	.btn-secondary {
		padding: 0.75rem 1.5rem;
		background: #333;
		color: #ffffff;
		text-decoration: none;
		border-radius: 0.375rem;
		font-weight: 600;
		transition: background-color 0.2s;
	}

	.btn-secondary:hover {
		background: #444;
	}

	.tabs {
		display: flex;
		gap: 1rem;
		margin-bottom: 2rem;
		border-bottom: 1px solid #333;
	}

	.tab-button {
		padding: 0.75rem 1.5rem;
		background: transparent;
		color: #9ca3af;
		border: none;
		border-bottom: 2px solid transparent;
		cursor: pointer;
		font-weight: 600;
		transition: all 0.2s;
	}

	.tab-button.active {
		color: #dc2626;
		border-bottom-color: #dc2626;
	}

	.tab-button:hover {
		color: #ffffff;
	}

	.tab-content {
		background: #1a1a2e;
		border: 1px solid #333;
		border-radius: 0.5rem;
		padding: 2rem;
	}

	.details-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
		gap: 2rem;
	}

	.detail-item {
		display: flex;
		flex-direction: column;
	}

	.detail-item.full-width {
		grid-column: 1 / -1;
	}

	.detail-item .label {
		color: #9ca3af;
		font-size: 0.875rem;
		font-weight: 600;
		margin-bottom: 0.5rem;
	}

	.detail-item p {
		color: #ffffff;
		margin: 0;
	}

	.case-link {
		color: #3b82f6;
		text-decoration: underline;
	}

	.aliases-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.alias-tag {
		padding: 0.375rem 0.75rem;
		background: #0f0f23;
		border: 1px solid #333;
		border-radius: 0.375rem;
		color: #d1d5db;
		font-size: 0.875rem;
	}

	.associates-list {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.associate-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem;
		background: #0f0f23;
		border: 1px solid #333;
		border-radius: 0.375rem;
	}

	.associate-info h4 {
		color: #ffffff;
		margin: 0 0 0.25rem 0;
	}

	.relationship {
		color: #dc2626;
		font-size: 0.875rem;
		margin: 0.25rem 0;
		text-transform: capitalize;
	}

	.notes {
		color: #9ca3af;
		font-size: 0.875rem;
		margin: 0.5rem 0 0 0;
	}

	.associates-error {
		text-align: center;
		padding: 1rem;
		color: #fecaca;
	}

	.btn-retry {
		margin-top: 0.5rem;
		padding: 0.5rem 1rem;
		background: #333;
		color: #ffffff;
		border: none;
		border-radius: 0.25rem;
		cursor: pointer;
	}

	.btn-remove {
		padding: 0.5rem 1rem;
		background: #7f1d1d;
		color: #fecaca;
		border: 1px solid #dc2626;
		border-radius: 0.25rem;
		cursor: pointer;
		font-weight: 600;
		transition: background-color 0.2s;
	}

	.btn-remove:hover {
		background: #991b1b;
	}

	.empty-message,
	.placeholder {
		color: #9ca3af;
		text-align: center;
		padding: 2rem;
	}

	.search-section {
		text-align: center;
		color: #9ca3af;
		padding: 2rem;
	}
</style>
