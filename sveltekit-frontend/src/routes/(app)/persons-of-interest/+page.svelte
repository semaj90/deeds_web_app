<script lang="ts">
	import AddPoiModal from '$lib/components/poi/AddPoiModal.svelte';
	import POIEditor from '$lib/components/poi/POIEditor.svelte';
	import PersonCard from '$lib/components/PersonCard.svelte';
	import PersonForm from '$lib/components/PersonForm.svelte';
	import PersonOfInterestDetailView from '$lib/components/poi/PersonOfInterestDetailView.svelte';
	import POICard from '$lib/components/poi/POICard.svelte';
	import PersonList from '$lib/components/PersonList.svelte';
	import FilterPanel from '$lib/components/FilterPanel.svelte';
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

<div class="poi-list-page">
	<div class="page-header">
		<h1>Persons of Interest</h1>
		<div class="header-actions">
			<button onclick={() => (showAddModal = true)} class="btn-create">+ Quick Add</button>
			<button onclick={() => (showPersonForm = !showPersonForm)} class="btn-create-full">AI Create</button>
			<a href="/persons-of-interest/create{data.caseId ? `?caseId=${data.caseId}` : ''}" class="btn-create-full">+ Full Form</a>
		</div>
	</div>

	<AddPoiModal bind:open={showAddModal} />

	{#if showPersonForm}
		<PersonForm />
	{/if}

	<!-- POI Editor Modal -->
	{#if showEditor && editingPoi}
		<div class="editor-overlay">
			<div class="editor-container">
				<POIEditor
					poi={{ name: editingPoi.name ?? '', alias: editingPoi.alias ?? '', threatLevel: editingPoi.threatLevel ?? 'low', photos: [], notes: editingPoi.description ?? '' }}
					onSave={async (formData) => {
						try {
							await fetch(`/api/persons/${editingPoi.id}`, {
								method: 'PATCH',
								headers: { 'Content-Type': 'application/json' },
								body: JSON.stringify({ name: formData.name, alias: formData.alias, threatLevel: formData.threatLevel, description: formData.notes })
							});
							showEditor = false;
							editingPoi = null;
							window.location.reload();
						} catch (e) { console.error('Save failed:', e); }
					}}
					onCancel={() => { showEditor = false; editingPoi = null; }}
					onUploadPhoto={() => {}}
					onViewPhoto={() => {}}
				/>
			</div>
		</div>
	{/if}

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
		<div class="view-toggle" style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
			<button class="toggle-btn" class:active={viewMode === 'list'} onclick={() => (viewMode = 'list')}>List</button>
			<button class="toggle-btn" class:active={viewMode === 'ai-cards'} onclick={() => (viewMode = 'ai-cards')}>AI Cards</button>
			<button class="toggle-btn" class:active={viewMode === 'detail-cards'} onclick={() => (viewMode = 'detail-cards')}>Detail Cards</button>
			<button class="toggle-btn" class:active={viewMode === 'fugitive-dex'} onclick={() => (viewMode = 'fugitive-dex')}>Fugitive Dex</button>
			<div style="margin-left: auto;">
				<FilterPanel filters={filterPanelFilters} onfilter={(f) => { filterPanelFilters = f; if (f.status) selectedStatus = f.status; if (f.priority) selectedThreatLevel = f.priority; }} />
			</div>
		</div>

		{#if viewMode === 'ai-cards'}
			<div class="poi-grid">
				{#each filtered as poi (poi.id)}
					<PersonCard
						person={{ ...poi, priority: poi.threatLevel, lastUpdated: poi.updatedAt }}
						onedit={(id) => { editingPoi = filtered.find((p: any) => p.id === id) ?? null; showEditor = true; }}
						ondelete={(id) => { if (confirm('Delete this person of interest?')) fetch(`/api/persons/${id}`, { method: 'DELETE' }).then(() => window.location.reload()); }}
					/>
				{/each}
			</div>
		{:else if viewMode === 'detail-cards'}
			<div class="poi-grid">
				{#each filtered as poi (poi.id)}
					<POICard
						poi={{ id: poi.id, name: poi.name, alias: poi.aliases?.[0], threatLevel: poi.threatLevel ?? 'low', notes: poi.description, createdAt: poi.createdAt }}
						onView={(p) => openPreview({ ...poi, aliases: poi.aliases ?? [] })}
						onEdit={(p) => { editingPoi = poi; showEditor = true; }}
						onDelete={(p) => { if (confirm('Delete this person of interest?')) fetch(`/api/persons/${p.id}`, { method: 'DELETE' }).then(() => window.location.reload()); }}
					/>
				{/each}
			</div>
		{:else if viewMode === 'fugitive-dex'}
			<PersonList
				persons={filtered.map((poi: any) => ({
					id: poi.id,
					name: poi.name,
					alias: poi.aliases?.[0] ?? poi.description?.slice(0, 30) ?? '',
					role: poi.status ?? 'unknown',
					status: poi.status === 'wanted' ? 'WANTED' : poi.status === 'surveillance' ? 'MONITORING' : 'COOPERATIVE',
					priority: poi.threatLevel === 'critical' || poi.threatLevel === 'high' ? 'HIGH' : poi.threatLevel === 'medium' ? 'MEDIUM' : 'LOW',
					height: '',
					age: '',
					hair: '',
					eyes: '',
					modusOperandi: poi.description ?? '',
					lastSeen: poi.lastLocation ?? '',
					dangerLevel: poi.threatLevel === 'critical' ? 9 : poi.threatLevel === 'high' ? 7 : poi.threatLevel === 'medium' ? 5 : 2,
					photo: '',
					knownAssociates: [],
					knownHabits: [],
					attributes: { stealth: 50, intelligence: 50, strength: 50, speed: 50, dangerousness: 50 }
				}))}
				selectedPerson={dexSelectedPerson}
				bind:searchQuery
				onSelect={(person) => { dexSelectedPerson = person; }}
			/>
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
							<div class="footer-right">
								<button class="btn-preview" onclick={(e) => { e.preventDefault(); e.stopPropagation(); openPreview(poi); }}>Quick View</button>
								<button class="btn-edit" onclick={(e) => { e.preventDefault(); e.stopPropagation(); editingPoi = poi; showEditor = true; }}>Edit</button>
								<span class="date">
									{new Date(poi.createdAt).toLocaleDateString()}
								</span>
							</div>
						</div>
					</a>
				{/each}
			</div>
		{/if}
	{/if}

	<PersonOfInterestDetailView
		poi={previewPoi}
		bind:open={showPreview}
		onOpenChange={(v) => { showPreview = v; }}
		onEdit={(poi) => { showPreview = false; editingPoi = poi; showEditor = true; }}
	/>
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

	.header-actions {
		display: flex;
		gap: 0.75rem;
	}

	.btn-create,
	.btn-create-full {
		padding: 0.75rem 1.5rem;
		background: #dc2626;
		color: #ffffff;
		text-decoration: none;
		border: none;
		border-radius: 0.375rem;
		font-weight: 600;
		cursor: pointer;
		transition: background-color 0.2s;
	}

	.btn-create:hover,
	.btn-create-full:hover {
		background: #b91c1c;
	}

	.btn-create-full {
		background: #333;
	}

	.btn-create-full:hover {
		background: #444;
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

	.footer-right {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.btn-edit,
	.btn-preview {
		padding: 0.25rem 0.75rem;
		background: #333;
		color: #d1d5db;
		border: 1px solid #555;
		border-radius: 0.25rem;
		font-size: 0.7rem;
		cursor: pointer;
		transition: all 0.2s;
	}

	.btn-edit:hover {
		background: #dc2626;
		border-color: #dc2626;
		color: #ffffff;
	}

	.btn-preview:hover {
		background: #3b82f6;
		border-color: #3b82f6;
		color: #ffffff;
	}

	.threat-level {
		font-weight: 600;
		text-transform: capitalize;
	}

	.editor-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.7);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 50;
	}

	.editor-container {
		background: #1a1a2e;
		border: 1px solid #333;
		border-radius: 0.5rem;
		padding: 1.5rem;
		width: 90%;
		max-width: 600px;
		max-height: 90vh;
		overflow-y: auto;
	}

	.view-toggle {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1.5rem;
	}

	.toggle-btn {
		padding: 0.5rem 1.25rem;
		background: #1a1a2e;
		border: 1px solid #333;
		color: #9ca3af;
		border-radius: 0.375rem;
		cursor: pointer;
		font-size: 0.8rem;
		font-weight: 600;
		transition: all 0.2s;
	}

	.toggle-btn:hover {
		border-color: #dc2626;
		color: #fff;
	}

	.toggle-btn.active {
		background: #dc2626;
		border-color: #dc2626;
		color: #fff;
	}
</style>