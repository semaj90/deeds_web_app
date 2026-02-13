<script lang="ts">
	let { data } = $props();

	let searchQuery = $state('');
	let selectedStatus = $state('');
	let selectedThreatLevel = $state('');

	let filtered = $derived(
		(data.pois ?? []).filter((poi: any) => {
			const matchesSearch =
				poi.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
				poi.description?.toLowerCase().includes(searchQuery.toLowerCase());
			const matchesStatus = !selectedStatus || poi.status === selectedStatus;
			const matchesThreat = !selectedThreatLevel || poi.threatLevel === selectedThreatLevel;
			return matchesSearch && matchesStatus && matchesThreat;
		})
	);

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

<div class="poi-list-page">
	<div class="page-header">
		<h1>Persons of Interest</h1>
		<a href="/persons-of-interest/create{data.caseId ? `?caseId=${data.caseId}` : ''}" class="btn-create">+ New POI</a>
	</div>

	{#if data.error}
		<div class="error-banner">
			<p>{data.error}</p>
		</div>
	{/if}

	<div class="filters">
		<input
			type="text"
			placeholder="Search by name or description..."
			bind:value={searchQuery}
			class="search-input"
		/>

		<select bind:value={selectedStatus} class="filter-select">
			<option value="">All Statuses</option>
			<option value="person_of_interest">Person of Interest</option>
			<option value="witness">Witness</option>
			<option value="suspect">Suspect</option>
			<option value="victim">Victim</option>
			<option value="informant">Informant</option>
			<option value="surveillance">Surveillance</option>
			<option value="wanted">Wanted</option>
			<option value="active">Active</option>
			<option value="cleared">Cleared</option>
		</select>

		<select bind:value={selectedThreatLevel} class="filter-select">
			<option value="">All Threat Levels</option>
			<option value="low">Low</option>
			<option value="medium">Medium</option>
			<option value="high">High</option>
			<option value="critical">Critical</option>
		</select>
	</div>

	{#if filtered.length === 0}
		<div class="empty-state">
			<p>No persons of interest found</p>
			<a href="/persons-of-interest/create{data.caseId ? `?caseId=${data.caseId}` : ''}" class="btn-primary">Create First POI</a>
		</div>
	{:else}
		<div class="poi-grid">
			{#each filtered as poi (poi.id)}
				<a href={`/persons-of-interest/${poi.id}`} class="poi-card">
					<div class="card-header">
						<h3>{poi.name}</h3>
						<div class="badges">
							<span class="badge status" style="background-color: {getStatusColor(poi.status)}">
								{poi.status.replace(/_/g, ' ')}
							</span>
							<span class="badge threat" style="background-color: {getThreatColor(poi.threatLevel)}">
								{poi.threatLevel}
							</span>
						</div>
					</div>

					<div class="card-body">
						{#if poi.description}
							<p class="description">{poi.description}</p>
						{/if}
						{#if poi.lastLocation}
							<p><strong>Last Location:</strong> {poi.lastLocation}</p>
						{/if}
					</div>

					<div class="card-footer">
						<span class="threat-level" style="color: {getThreatColor(poi.threatLevel)}">
							Threat: {poi.threatLevel}
						</span>
						<span class="date">
							{new Date(poi.createdAt).toLocaleDateString()}
						</span>
					</div>
				</a>
			{/each}
		</div>
	{/if}
</div>

<style>
	.poi-list-page {
		padding: 2rem;
		background: #0f0f23;
		min-height: 100vh;
	}

	.page-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 2rem;
	}

	.page-header h1 {
		color: #ffffff;
		font-size: 2rem;
		margin: 0;
	}

	.btn-create {
		padding: 0.75rem 1.5rem;
		background: #dc2626;
		color: #ffffff;
		text-decoration: none;
		border-radius: 0.375rem;
		font-weight: 600;
		transition: background-color 0.2s;
	}

	.btn-create:hover {
		background: #b91c1c;
	}

	.error-banner {
		padding: 1rem;
		background: #7f1d1d;
		border: 1px solid #dc2626;
		border-radius: 0.375rem;
		color: #fecaca;
		margin-bottom: 1.5rem;
	}

	.filters {
		display: flex;
		gap: 1rem;
		margin-bottom: 2rem;
		flex-wrap: wrap;
	}

	.search-input,
	.filter-select {
		padding: 0.75rem;
		background: #1a1a2e;
		border: 1px solid #333;
		border-radius: 0.375rem;
		color: #ffffff;
		font-size: 0.875rem;
	}

	.search-input {
		flex: 1;
		min-width: 200px;
	}

	.search-input:focus,
	.filter-select:focus {
		outline: none;
		border-color: #dc2626;
	}

	.empty-state {
		text-align: center;
		padding: 3rem;
		color: #9ca3af;
	}

	.empty-state .btn-primary {
		margin-top: 1rem;
		padding: 0.75rem 1.5rem;
		background: #dc2626;
		color: #ffffff;
		text-decoration: none;
		border-radius: 0.375rem;
		display: inline-block;
	}

	.poi-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 1.5rem;
	}

	.poi-card {
		display: flex;
		flex-direction: column;
		background: #1a1a2e;
		border: 1px solid #333;
		border-radius: 0.5rem;
		padding: 1.5rem;
		text-decoration: none;
		color: inherit;
		transition: all 0.2s;
	}

	.poi-card:hover {
		border-color: #dc2626;
		box-shadow: 0 0 20px rgba(220, 38, 38, 0.2);
	}

	.card-header {
		margin-bottom: 1rem;
	}

	.card-header h3 {
		color: #ffffff;
		margin: 0 0 0.5rem 0;
		font-size: 1.125rem;
	}

	.badges {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.badge {
		padding: 0.25rem 0.75rem;
		border-radius: 0.25rem;
		font-size: 0.75rem;
		font-weight: 600;
		color: #ffffff;
		text-transform: capitalize;
	}

	.card-body {
		flex: 1;
		margin-bottom: 1rem;
	}

	.card-body p {
		margin: 0.5rem 0;
		color: #d1d5db;
		font-size: 0.875rem;
	}

	.card-body .description {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.card-body strong {
		color: #ffffff;
	}

	.card-footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding-top: 1rem;
		border-top: 1px solid #333;
		font-size: 0.75rem;
		color: #9ca3af;
	}

	.threat-level {
		font-weight: 600;
		text-transform: capitalize;
	}
</style>
