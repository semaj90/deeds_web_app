<script lang="ts">
	import AddPoiModal from '$lib/components/poi/AddPoiModal.svelte';
	import POIEditor from '$lib/components/poi/POIEditor.svelte';
	import PersonCard from '$lib/components/PersonCard.svelte';
	import PersonForm from '$lib/components/PersonForm.svelte';
	import PersonOfInterestDetailView from '$lib/components/poi/PersonOfInterestDetailView.svelte';
	import POICard from '$lib/components/poi/POICard.svelte';
	import PersonList from '$lib/components/PersonList.svelte';
	import FilterPanel from '$lib/components/FilterPanel.svelte';
	import StatsPanel from '$lib/components/StatsPanel.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import type { FugitiveDexPerson } from '$lib/components/types';

	let filterPanelFilters = $state<{ status: string; priority: string; tags: string[] }>({ status: '', priority: '', tags: [] });

	let { data } = $props();

	let searchQuery = $state('');
	let selectedStatus = $state('');
	let selectedThreatLevel = $state('');
	let showAddModal = $state(false);
	let showPersonForm = $state(false);
	let editingPoi = $state<any>(null);
	let showEditor = $state(false);
	let viewMode = $state<'list' | 'ai-cards' | 'detail-cards' | 'fugitive-dex'>('list');
	let dexSelectedPerson = $state<FugitiveDexPerson | null>(null);
	let previewPoi = $state<any>(null);
	let showPreview = $state(false);
	let showStats = $state(false);
	let similarResults = $state<any[]>([]);
	let similarMethod = $state('');
	let similarSourceName = $state('');
	let loadingSimilar = $state(false);

	async function findSimilar(poi: any) {
		loadingSimilar = true;
		similarSourceName = poi.name;
		similarResults = [];
		try {
			const res = await fetch(`/api/persons-of-interest/${poi.id}/similar`);
			const data = await res.json();
			similarResults = data.similar ?? [];
			similarMethod = data.method ?? 'unknown';
		} catch (err) {
			console.error('Similar search failed:', err);
			similarResults = [];
			similarMethod = 'error';
		} finally {
			loadingSimilar = false;
		}
	}

	function closeSimilar() {
		similarResults = [];
		similarMethod = '';
		similarSourceName = '';
	}

	let poiStats = $derived.by(() => {
		const all = data.pois ?? [];
		const total = all.length;
		const active = all.filter((p: any) => p.status === 'active' || p.status === 'person_of_interest' || p.status === 'suspect').length;
		const highRisk = all.filter((p: any) => p.threatLevel === 'high' || p.threatLevel === 'critical' || p.threatLevel === 'extreme').length;
		const aiGenerated = all.filter((p: any) => p.source === 'ai' || p.aiGenerated).length;
		return {
			total, active, highRisk, aiGenerated,
			byPriority: {
				low: all.filter((p: any) => p.threatLevel === 'low').length,
				medium: all.filter((p: any) => p.threatLevel === 'medium').length,
				high: all.filter((p: any) => p.threatLevel === 'high').length,
				critical: all.filter((p: any) => p.threatLevel === 'critical' || p.threatLevel === 'extreme').length,
			},
			byStatus: {
				active: all.filter((p: any) => p.status === 'active' || p.status === 'person_of_interest' || p.status === 'suspect').length,
				inactive: all.filter((p: any) => p.status === 'cleared' || p.status === 'inactive').length,
				archived: all.filter((p: any) => p.status === 'archived').length,
			}
		};
	});

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

	function openPreview(poi: any) {
		previewPoi = {
			id: poi.id,
			name: poi.name,
			aliases: poi.aliases ?? [],
			dateOfBirth: '',
			address: '',
			phone: '',
			email: '',
			status: poi.status ?? 'person_of_interest',
			priority: poi.threatLevel ?? 'low',
			threatLevel: poi.threatLevel ?? 'low',
			physicalDescription: { height: '', weight: '', hair: '', eyes: '', distinguishingMarks: '' },
			profileData: { modusOperandi: '', knownHabits: [], associates: [] },
			lastKnownLocation: poi.lastLocation ?? '',
			lastSeen: '',
			dangerLevel: poi.threatLevel === 'critical' ? 9 : poi.threatLevel === 'high' ? 7 : poi.threatLevel === 'medium' ? 5 : 2,
			notes: poi.description ?? '',
			createdAt: poi.createdAt,
			updatedAt: poi.updatedAt,
		};
		showPreview = true;
	}
</script>

<div class="yorha-page">
	<!-- YoRHa Header -->
	<div class="yorha-header">
		<div class="header-logo">
			<div class="logo-icon">YoRHa</div>
			<div class="logo-subtitle">LEGAL UNIT</div>
		</div>
		<div class="header-nav">
			<button class="nav-item active">POI REGISTRY</button>
			<button class="nav-item">UNIT REPORTS</button>
		</div>
		<div class="header-actions">
			<button class="header-btn" onclick={() => (showPersonForm = !showPersonForm)}>
				<Icon name="sparkles" />
				AI CREATE
			</button>
			<button class="header-btn primary" onclick={() => (showAddModal = true)}>
				<Icon name="plus" />
				REGISTER
			</button>
		</div>
	</div>

	<div class="yorha-content">
		<!-- Left Sidebar -->
		<div class="yorha-sidebar">
			<div class="sidebar-section">
				<div class="sidebar-title">PROJECT DEUS</div>
				<div class="sidebar-menu">
					<button class="menu-item active">
						<Icon name="users" />
						<span>POI LIST</span>
					</button>
					<button class="menu-item">
						<Icon name="target" />
						<span>GALAXY PROFILE</span>
					</button>
					<button class="menu-item">
						<Icon name="shield" />
						<span>RESOURCES</span>
					</button>
					<button class="menu-item">
						<Icon name="settings" />
						<span>SETTINGS</span>
					</button>
				</div>
			</div>

			<!-- Stats Panel -->
			{#if showStats}
				<div class="sidebar-section">
					<div class="sidebar-title">STATISTICS</div>
					<div class="stats-compact">
						<div class="stat-row">
							<span class="stat-label">Total</span>
							<span class="stat-value">{poiStats.total}</span>
						</div>
						<div class="stat-row">
							<span class="stat-label">Active</span>
							<span class="stat-value highlight">{poiStats.active}</span>
						</div>
						<div class="stat-row">
							<span class="stat-label">High Risk</span>
							<span class="stat-value danger">{poiStats.highRisk}</span>
						</div>
						<div class="stat-row">
							<span class="stat-label">AI Generated</span>
							<span class="stat-value">{poiStats.aiGenerated}</span>
						</div>
					</div>
				</div>
			{/if}
		</div>

		<!-- Main Content -->
		<div class="yorha-main">
			{#if data.error}
				<div class="error-banner">
					<Icon name="alert-circle" />
					<span>{data.error}</span>
				</div>
			{/if}

			<!-- Filters & Search -->
			<div class="filter-section">
				<div class="search-group">
					<input
						type="text"
						placeholder="Search by name or description..."
						bind:value={searchQuery}
						class="yorha-input search-input"
					/>
					<button class="filter-btn" onclick={() => (showStats = !showStats)}>
						<Icon name="bar-chart" />
						{showStats ? 'HIDE STATS' : 'STATS'}
					</button>
				</div>

				<div class="filter-row">
					<select bind:value={selectedStatus} class="yorha-select">
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

					<select bind:value={selectedThreatLevel} class="yorha-select">
						<option value="">All Threat Levels</option>
						<option value="low">Low</option>
						<option value="medium">Medium</option>
						<option value="high">High</option>
						<option value="critical">Critical</option>
					</select>

					<div class="view-toggle">
						<button class="toggle-btn" class:active={viewMode === 'list'} onclick={() => (viewMode = 'list')}>LIST</button>
						<button class="toggle-btn" class:active={viewMode === 'detail-cards'} onclick={() => (viewMode = 'detail-cards')}>CARDS</button>
					</div>
				</div>
			</div>

			<!-- Similar POIs Results Panel -->
			{#if loadingSimilar || similarResults.length > 0 || similarMethod === 'error'}
				<div class="similar-panel">
					<div class="similar-header">
						<div class="similar-title-group">
							<Icon name="radar" />
							<span class="similar-title">SIMILAR TO: {similarSourceName}</span>
							<span class="similar-method">{similarMethod.toUpperCase()}</span>
						</div>
						<button class="close-similar" onclick={closeSimilar}>
							<Icon name="x" />
						</button>
					</div>
					{#if loadingSimilar}
						<div class="similar-loading">Searching for similar persons...</div>
					{:else if similarResults.length === 0}
						<div class="similar-empty">No similar persons found.</div>
					{:else}
						<div class="similar-list">
							{#each similarResults as sim}
								<a href="/persons-of-interest/{sim.poiId}" class="similar-item">
									<div class="sim-score">{(sim.similarity * 100).toFixed(0)}%</div>
									<div class="sim-info">
										<span class="sim-name">{sim.name}</span>
										<span class="sim-meta">
											<span class="threat-pill threat-{sim.threatLevel ?? 'low'}">{sim.threatLevel?.toUpperCase() ?? 'LOW'}</span>
											{sim.status?.replace(/_/g, ' ').toUpperCase() ?? ''}
										</span>
									</div>
									{#if sim.description}
										<p class="sim-desc">{sim.description.slice(0, 120)}{sim.description.length > 120 ? '...' : ''}</p>
									{/if}
								</a>
							{/each}
						</div>
					{/if}
				</div>
			{/if}

			<!-- Content Display -->
			{#if filtered.length === 0}
				<div class="empty-state">
					<div class="empty-icon">
						<Icon name="user-x" />
					</div>
					<p class="empty-title">NO PERSONS OF INTEREST FOUND</p>
					<p class="empty-subtitle">Try adjusting your filters or create a new entry</p>
					<a href="/persons-of-interest/create{data.caseId ? `?caseId=${data.caseId}` : ''}" class="btn-yorha primary">CREATE FIRST POI</a>
				</div>
			{:else if viewMode === 'detail-cards'}
				<div class="poi-grid">
					{#each filtered as poi (poi.id)}
						<div class="poi-card">
							<div class="card-header">
								<div class="card-photo">
									<Icon name="user" />
								</div>
								<div class="card-info">
									<h3 class="card-name">{poi.name}</h3>
									<p class="card-status">{poi.status?.replace(/_/g, ' ').toUpperCase() ?? 'UNKNOWN'}</p>
								</div>
								<div class="card-threat">
									<div class="threat-badge threat-{poi.threatLevel ?? 'low'}">
										{poi.threatLevel?.toUpperCase() ?? 'LOW'}
									</div>
								</div>
							</div>

							<div class="card-body">
								{#if poi.description}
									<div class="field-group">
										<label class="field-label">DESCRIPTION</label>
										<p class="field-value">{poi.description}</p>
									</div>
								{/if}
								{#if poi.lastLocation}
									<div class="field-group">
										<label class="field-label">LAST KNOWN LOCATION</label>
										<p class="field-value">{poi.lastLocation}</p>
									</div>
								{/if}
								<div class="field-group">
									<label class="field-label">REGISTERED</label>
									<p class="field-value">{new Date(poi.createdAt).toLocaleDateString()}</p>
								</div>
							</div>

							<div class="card-actions card-actions-4">
								<button class="action-btn" onclick={(e) => { e.stopPropagation(); openPreview(poi); }}>
									<Icon name="eye" />
									VIEW
								</button>
								<button class="action-btn" onclick={(e) => { e.stopPropagation(); editingPoi = poi; showEditor = true; }}>
									<Icon name="pencil" />
									EDIT
								</button>
								<button class="action-btn" onclick={(e) => { e.stopPropagation(); findSimilar(poi); }}>
									<Icon name="radar" />
									SIMILAR
								</button>
								<a href="/persons-of-interest/{poi.id}" class="action-btn primary">
									<Icon name="arrow-right" />
									DETAILS
								</a>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<div class="poi-table-wrapper">
					<table class="yorha-table">
						<thead>
							<tr>
								<th>NAME</th>
								<th>STATUS</th>
								<th>THREAT LEVEL</th>
								<th>LAST LOCATION</th>
								<th>REGISTERED</th>
								<th>ACTIONS</th>
							</tr>
						</thead>
						<tbody>
							{#each filtered as poi (poi.id)}
								<tr class="table-row" tabindex="0">
									<td class="name-cell">
										<a href="/persons-of-interest/{poi.id}" class="name-link">
											{poi.name}
										</a>
									</td>
									<td>
										<span class="status-pill" style="background-color: {getStatusColor(poi.status)};">
											{poi.status?.replace(/_/g, ' ').toUpperCase() ?? 'UNKNOWN'}
										</span>
									</td>
									<td>
										<span class="threat-pill threat-{poi.threatLevel ?? 'low'}">
											{poi.threatLevel?.toUpperCase() ?? 'LOW'}
										</span>
									</td>
									<td class="location-cell">{poi.lastLocation ?? 'Unknown'}</td>
									<td class="date-cell">{new Date(poi.createdAt).toLocaleDateString()}</td>
									<td class="actions-cell">
										<button class="icon-btn" aria-label="View details" onclick={(e) => { e.stopPropagation(); openPreview(poi); }}>
											<Icon name="eye" />
										</button>
										<button class="icon-btn" aria-label="Edit" onclick={(e) => { e.stopPropagation(); editingPoi = poi; showEditor = true; }}>
											<Icon name="pencil" />
										</button>
										<button class="icon-btn" aria-label="Find similar" title="Find similar" onclick={(e) => { e.stopPropagation(); findSimilar(poi); }}>
											<Icon name="radar" />
										</button>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>
	</div>

	<!-- Modals -->
	<AddPoiModal bind:open={showAddModal} />

	{#if showPersonForm}
		<div class="modal-overlay" onclick={() => (showPersonForm = false)}>
			<div class="modal-content" onclick={(e) => e.stopPropagation()}>
				<PersonForm />
			</div>
		</div>
	{/if}

	{#if showEditor && editingPoi}
		<div class="modal-overlay" onclick={() => { showEditor = false; editingPoi = null; }}>
			<div class="modal-content" onclick={(e) => e.stopPropagation()}>
				<POIEditor
					poi={{ name: editingPoi.name ?? '', alias: editingPoi.alias ?? '', threatLevel: editingPoi.threatLevel ?? 'low', photos: [], notes: editingPoi.description ?? '' }}
					onSave={async (formData) => {
						try {
							const res = await fetch(`/api/persons/${editingPoi.id}`, {
								method: 'PATCH',
								headers: { 'Content-Type': 'application/json' },
								body: JSON.stringify({ name: formData.name, alias: formData.alias, threatLevel: formData.threatLevel, description: formData.notes })
							});
							if (res.ok) {
								const idx = data.pois.findIndex((p: any) => p.id === editingPoi.id);
								if (idx !== -1) {
									data.pois[idx] = { ...data.pois[idx], name: formData.name, alias: formData.alias, threatLevel: formData.threatLevel, description: formData.notes };
									data.pois = [...data.pois];
								}
							}
							showEditor = false;
							editingPoi = null;
						} catch (e) { console.error('Save failed:', e); }
					}}
					onCancel={() => { showEditor = false; editingPoi = null; }}
					onUploadPhoto={() => {}}
					onViewPhoto={() => {}}
				/>
			</div>
		</div>
	{/if}

	<PersonOfInterestDetailView
		poi={previewPoi}
		bind:open={showPreview}
		onOpenChange={(v) => { showPreview = v; }}
		onEdit={(poi) => { showPreview = false; editingPoi = poi; showEditor = true; }}
	/>
</div>

<style>
	.yorha-page {
		min-height: 100vh;
		background: #f8f9fa;
		font-family: 'JetBrains Mono', 'Courier New', monospace;
	}

	/* Header */
	.yorha-header {
		background: linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%);
		border-bottom: 2px solid #e5e7eb;
		padding: 1rem 2rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
	}

	.header-logo {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.logo-icon {
		font-size: 1rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		color: #fff;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		border-radius: 12px;
		padding: 0.625rem 1rem;
		box-shadow: 0 4px 12px rgba(102, 126, 234, 0.25);
	}

	.logo-subtitle {
		font-size: 0.7rem;
		color: #9ca3af;
		letter-spacing: 0.15em;
	}

	.header-nav {
		display: flex;
		gap: 0.5rem;
	}

	.nav-item {
		background: transparent;
		border: none;
		padding: 0.5rem 1rem;
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.1em;
		color: #9ca3af;
		cursor: pointer;
		font-family: 'JetBrains Mono', monospace;
		transition: all 0.2s;
	}

	.nav-item:hover {
		color: #667eea;
	}

	.nav-item.active {
		color: #667eea;
		border-bottom: 2px solid #667eea;
	}

	.header-actions {
		display: flex;
		gap: 0.75rem;
	}

	.header-btn {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		background: #fff;
		border: 1px solid #e5e7eb;
		padding: 0.5rem 1rem;
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.1em;
		color: #6b7280;
		cursor: pointer;
		font-family: 'JetBrains Mono', monospace;
		transition: all 0.2s;
		border-radius: 8px;
	}

	.header-btn:hover {
		border-color: #667eea;
		color: #667eea;
	}

	.header-btn.primary {
		background: #667eea;
		border-color: #667eea;
		color: #fff;
	}

	.header-btn.primary:hover {
		background: #5a6fd6;
	}

	/* Content Layout */
	.yorha-content {
		display: grid;
		grid-template-columns: 250px 1fr;
		min-height: calc(100vh - 65px);
	}

	/* Sidebar */
	.yorha-sidebar {
		background: #fff;
		border-right: 1px solid #e5e7eb;
		padding: 1.5rem 0;
	}

	.sidebar-section {
		margin-bottom: 2rem;
		padding: 0 1rem;
	}

	.sidebar-title {
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.15em;
		color: #9ca3af;
		margin-bottom: 1rem;
	}

	.sidebar-menu {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.menu-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		background: transparent;
		border: none;
		padding: 0.75rem 1rem;
		font-size: 0.75rem;
		font-weight: 500;
		color: #6b7280;
		cursor: pointer;
		font-family: 'JetBrains Mono', monospace;
		text-align: left;
		transition: all 0.2s;
		border-radius: 6px;
	}

	.menu-item:hover {
		background: #f8f9fa;
		color: #667eea;
	}

	.menu-item.active {
		background: #f0f0ff;
		color: #667eea;
		border-left: 3px solid #667eea;
	}

	.stats-compact {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.stat-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 0.75rem;
	}

	.stat-label {
		color: #9ca3af;
	}

	.stat-value {
		font-weight: 600;
		color: #1f2937;
	}

	.stat-value.highlight {
		color: #667eea;
	}

	.stat-value.danger {
		color: #ef4444;
	}

	/* Main Content */
	.yorha-main {
		padding: 2rem;
		max-width: 1400px;
	}

	.error-banner {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 1rem;
		background: #fef2f2;
		border: 1px solid #fecaca;
		border-radius: 8px;
		color: #dc2626;
		margin-bottom: 1.5rem;
		font-size: 0.85rem;
	}

	/* Filters */
	.filter-section {
		margin-bottom: 2rem;
	}

	.search-group {
		display: flex;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.yorha-input {
		flex: 1;
		padding: 0.75rem 1rem;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		font-size: 0.85rem;
		font-family: 'JetBrains Mono', monospace;
		transition: all 0.2s;
	}

	.yorha-input:focus {
		outline: none;
		border-color: #667eea;
		box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
	}

	.filter-btn {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		background: #fff;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		color: #6b7280;
		cursor: pointer;
		font-family: 'JetBrains Mono', monospace;
		transition: all 0.2s;
	}

	.filter-btn:hover {
		border-color: #667eea;
		color: #667eea;
	}

	.filter-row {
		display: flex;
		gap: 1rem;
		align-items: center;
	}

	.yorha-select {
		padding: 0.75rem 1rem;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		font-size: 0.85rem;
		font-family: 'JetBrains Mono', monospace;
		background: #fff;
		cursor: pointer;
		transition: all 0.2s;
	}

	.yorha-select:focus {
		outline: none;
		border-color: #667eea;
		box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
	}

	.view-toggle {
		display: flex;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		overflow: hidden;
		margin-left: auto;
	}

	.toggle-btn {
		padding: 0.75rem 1.25rem;
		background: #fff;
		border: none;
		border-right: 1px solid #e5e7eb;
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		color: #9ca3af;
		cursor: pointer;
		font-family: 'JetBrains Mono', monospace;
		transition: all 0.2s;
	}

	.toggle-btn:last-child {
		border-right: none;
	}

	.toggle-btn:hover {
		background: #f8f9fa;
		color: #6b7280;
	}

	.toggle-btn.active {
		background: #667eea;
		color: #fff;
	}

	/* Empty State */
	.empty-state {
		text-align: center;
		padding: 4rem 2rem;
		background: #fff;
		border-radius: 12px;
		border: 1px solid #e5e7eb;
	}

	.empty-icon {
		font-size: 3rem;
		color: #d1d5db;
		margin-bottom: 1rem;
	}

	.empty-title {
		font-size: 1rem;
		font-weight: 600;
		letter-spacing: 0.1em;
		color: #6b7280;
		margin: 0 0 0.5rem 0;
	}

	.empty-subtitle {
		font-size: 0.85rem;
		color: #9ca3af;
		margin: 0 0 1.5rem 0;
	}

	.btn-yorha {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1.5rem;
		background: #fff;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.1em;
		color: #6b7280;
		text-decoration: none;
		cursor: pointer;
		font-family: 'JetBrains Mono', monospace;
		transition: all 0.2s;
	}

	.btn-yorha:hover {
		border-color: #667eea;
		color: #667eea;
	}

	.btn-yorha.primary {
		background: #667eea;
		border-color: #667eea;
		color: #fff;
	}

	.btn-yorha.primary:hover {
		background: #5a6fd6;
	}

	/* POI Grid */
	.poi-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
		gap: 1.5rem;
	}

	.poi-card {
		background: #fff;
		border: 1px solid #e5e7eb;
		border-radius: 12px;
		overflow: hidden;
		transition: all 0.2s;
	}

	.poi-card:hover {
		box-shadow: 0 4px 16px rgba(102, 126, 234, 0.1);
		border-color: #667eea;
	}

	.card-header {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1.5rem;
		border-bottom: 1px solid #f3f4f6;
	}

	.card-photo {
		width: 60px;
		height: 60px;
		background: #f3f4f6;
		border: 2px solid #e5e7eb;
		border-radius: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.5rem;
		color: #9ca3af;
	}

	.card-info {
		flex: 1;
		min-width: 0;
	}

	.card-name {
		font-size: 1rem;
		font-weight: 600;
		color: #1f2937;
		margin: 0 0 0.25rem 0;
		letter-spacing: 0.05em;
	}

	.card-status {
		font-size: 0.7rem;
		color: #9ca3af;
		margin: 0;
		letter-spacing: 0.1em;
	}

	.card-threat {
		display: flex;
		align-items: center;
	}

	.threat-badge {
		padding: 0.375rem 0.75rem;
		border-radius: 8px;
		font-size: 0.65rem;
		font-weight: 700;
		letter-spacing: 0.1em;
	}

	.threat-badge.threat-low {
		background: #d1fae5;
		color: #065f46;
	}

	.threat-badge.threat-medium {
		background: #fef3c7;
		color: #92400e;
	}

	.threat-badge.threat-high {
		background: #fee2e2;
		color: #991b1b;
	}

	.threat-badge.threat-critical {
		background: #fecaca;
		color: #7f1d1d;
	}

	.card-body {
		padding: 1.5rem;
	}

	.field-group {
		margin-bottom: 1rem;
	}

	.field-group:last-child {
		margin-bottom: 0;
	}

	.field-label {
		display: block;
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.1em;
		color: #9ca3af;
		margin-bottom: 0.25rem;
	}

	.field-value {
		font-size: 0.85rem;
		color: #374151;
		margin: 0;
		line-height: 1.5;
	}

	.card-actions {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr;
		border-top: 1px solid #f3f4f6;
	}

	.action-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.875rem;
		background: #fff;
		border: none;
		border-right: 1px solid #f3f4f6;
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		color: #6b7280;
		cursor: pointer;
		font-family: 'JetBrains Mono', monospace;
		text-decoration: none;
		transition: all 0.2s;
	}

	.action-btn:last-child {
		border-right: none;
	}

	.action-btn:hover {
		background: #f8f9fa;
		color: #667eea;
	}

	.action-btn.primary {
		background: #667eea;
		color: #fff;
	}

	.action-btn.primary:hover {
		background: #5a6fd6;
	}

	/* Table */
	.poi-table-wrapper {
		background: #fff;
		border: 1px solid #e5e7eb;
		border-radius: 12px;
		overflow: hidden;
	}

	.yorha-table {
		width: 100%;
		border-collapse: collapse;
	}

	.yorha-table thead {
		background: #f9fafb;
		border-bottom: 1px solid #e5e7eb;
	}

	.yorha-table th {
		text-align: left;
		padding: 1rem 1.5rem;
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.15em;
		color: #6b7280;
	}

	.table-row {
		border-bottom: 1px solid #f3f4f6;
		transition: background 0.15s;
	}

	.table-row:hover {
		background: #f8f8ff;
	}

	.yorha-table td {
		padding: 1.25rem 1.5rem;
		font-size: 0.85rem;
	}

	.name-cell {
		font-weight: 500;
	}

	.name-link {
		color: #1f2937;
		text-decoration: none;
		transition: color 0.2s;
	}

	.name-link:hover {
		color: #667eea;
	}

	.status-pill {
		display: inline-block;
		padding: 0.25rem 0.75rem;
		border-radius: 12px;
		font-size: 0.65rem;
		font-weight: 600;
		letter-spacing: 0.1em;
		color: #fff;
	}

	.threat-pill {
		display: inline-block;
		padding: 0.25rem 0.75rem;
		border-radius: 12px;
		font-size: 0.65rem;
		font-weight: 700;
		letter-spacing: 0.1em;
	}

	.threat-pill.threat-low {
		background: #d1fae5;
		color: #065f46;
	}

	.threat-pill.threat-medium {
		background: #fef3c7;
		color: #92400e;
	}

	.threat-pill.threat-high {
		background: #fee2e2;
		color: #991b1b;
	}

	.threat-pill.threat-critical {
		background: #fecaca;
		color: #7f1d1d;
	}

	.location-cell,
	.date-cell {
		color: #6b7280;
		font-size: 0.8rem;
	}

	.actions-cell {
		display: flex;
		gap: 0.5rem;
	}

	.icon-btn {
		background: transparent;
		border: none;
		color: #9ca3af;
		cursor: pointer;
		padding: 0.25rem;
		transition: color 0.2s;
	}

	.icon-btn:hover {
		color: #667eea;
	}

	/* Modals */
	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}

	.modal-content {
		background: #fff;
		border-radius: 12px;
		padding: 2rem;
		max-width: 600px;
		width: 90%;
		max-height: 90vh;
		overflow-y: auto;
		box-shadow: 0 20px 40px rgba(102, 126, 234, 0.15);
	}

	/* 4-column card actions */
	.card-actions-4 {
		grid-template-columns: 1fr 1fr 1fr 1fr;
	}

	/* Similar POIs Panel */
	.similar-panel {
		background: #fff;
		border: 2px solid #667eea;
		border-radius: 12px;
		margin-bottom: 1.5rem;
		overflow: hidden;
	}

	.similar-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.875rem 1.25rem;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		color: #fff;
	}

	.similar-title-group {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.similar-title {
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.1em;
	}

	.similar-method {
		font-size: 0.6rem;
		padding: 0.2rem 0.5rem;
		background: rgba(255, 255, 255, 0.2);
		border-radius: 6px;
		letter-spacing: 0.05em;
	}

	.close-similar {
		background: transparent;
		border: none;
		color: #fff;
		cursor: pointer;
		padding: 0.25rem;
		opacity: 0.7;
		transition: opacity 0.2s;
	}

	.close-similar:hover {
		opacity: 1;
	}

	.similar-loading,
	.similar-empty {
		padding: 1.5rem;
		text-align: center;
		font-size: 0.85rem;
		color: #9ca3af;
		letter-spacing: 0.05em;
	}

	.similar-list {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 0;
	}

	.similar-item {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		gap: 0.75rem;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid #f3f4f6;
		text-decoration: none;
		color: inherit;
		transition: background 0.15s;
	}

	.similar-item:hover {
		background: #f8f8ff;
	}

	.similar-item:last-child {
		border-bottom: none;
	}

	.sim-score {
		font-size: 1.25rem;
		font-weight: 700;
		color: #667eea;
		min-width: 3rem;
		text-align: center;
		line-height: 1;
		padding-top: 0.1rem;
	}

	.sim-info {
		flex: 1;
		min-width: 0;
	}

	.sim-name {
		display: block;
		font-size: 0.9rem;
		font-weight: 600;
		color: #1f2937;
		margin-bottom: 0.25rem;
	}

	.sim-meta {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.7rem;
		color: #9ca3af;
		letter-spacing: 0.05em;
	}

	.sim-desc {
		width: 100%;
		margin: 0.25rem 0 0 0;
		padding-left: 3.75rem;
		font-size: 0.8rem;
		color: #6b7280;
		line-height: 1.4;
	}

	/* Responsive breakpoints */
	@media (max-width: 1024px) {
		.poi-grid {
			grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
			gap: 1rem;
		}
	}

	@media (max-width: 768px) {
		.header-actions {
			flex-wrap: wrap;
			gap: 0.5rem;
		}

		.poi-grid {
			grid-template-columns: 1fr;
		}

		.poi-table-wrapper {
			overflow-x: auto;
			-webkit-overflow-scrolling: touch;
		}

		.yorha-table {
			min-width: 700px;
		}

		.card-header {
			flex-direction: column;
			align-items: flex-start;
			gap: 0.5rem;
		}

		.actions-cell {
			white-space: nowrap;
		}
	}

	@media (max-width: 480px) {
		.header-actions {
			width: 100%;
		}

		.header-btn {
			flex: 1;
			justify-content: center;
			font-size: 0.75rem;
			padding: 0.5rem 0.75rem;
		}

		.card-header {
			padding: 1rem;
		}
	}
</style>
