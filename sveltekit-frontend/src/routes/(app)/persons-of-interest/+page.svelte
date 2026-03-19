<script lang="ts">
	import { Dialog } from 'bits-ui';
	import { fade, fly } from 'svelte/transition';
	import AddPoiModal from '$lib/components/poi/AddPoiModal.svelte';
	import POIEditor from '$lib/components/poi/POIEditor.svelte';
	import PersonOfInterestDetailView from '$lib/components/poi/PersonOfInterestDetailView.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';
	import POIPhotoModal from '$lib/components/POIPhotoModal.svelte';
	import POIPhotoUploader from '$lib/client/ui/POIPhotoUploader.svelte';

	// Toast notifications
	let toasts = $state<{ id: number; message: string; type: 'success' | 'error' | 'info' }[]>([]);
	let toastIdCounter = $state(0);

	function showToast(message: string, type: 'success' | 'error' | 'info' = 'info') {
		const id = ++toastIdCounter;
		toasts = [...toasts, { id, message, type }];
		setTimeout(() => { toasts = toasts.filter(t => t.id !== id); }, 4000);
	}

	let { data } = $props();

	let searchQuery = $state('');
	let selectedStatus = $state('');
	let selectedThreatLevel = $state('');
	let showAddModal = $state(false);
	let editingPoi = $state<any>(null);
	let showEditor = $state(false);
	let viewMode = $state<'list' | 'detail-cards'>('list');
	let previewPoi = $state<any>(null);
	let showPreview = $state(false);
	let showStats = $state(false);
	let similarResults = $state<any[]>([]);
	let similarMethod = $state('');
	let similarSourceName = $state('');
	let loadingSimilar = $state(false);
	let photoModalOpen = $state(false);
	let photoModalPhotos = $state<any[]>([]);
	let photoModalIndex = $state(0);
	let showPhotoUploader = $state(false);
	let uploadingPoiId = $state<number>(0);

	function normalizePoiPhoto(photo: any) {
		if (!photo) return photo;
		return {
			...photo,
			url: photo.url ?? photo.thumbnailUrl ?? '',
			thumbnailUrl: photo.thumbnailUrl ?? photo.url ?? null,
			aiCaption: photo.aiCaption ?? photo.metadata?.ai?.caption ?? photo.ai?.caption ?? null,
			aiTags: photo.aiTags ?? photo.metadata?.ai?.tags ?? photo.ai?.tags ?? [],
		};
	}

	function openPhotoModal(photo: any) {
		const normalizedPhotos = (editingPoi?.photos ?? []).map(normalizePoiPhoto);
		const normalizedPhoto = normalizePoiPhoto(photo);
		photoModalPhotos = normalizedPhotos.length > 0 ? normalizedPhotos : normalizedPhoto ? [normalizedPhoto] : [];
		const photoIndex = photoModalPhotos.findIndex((candidate) => candidate?.id && candidate.id === normalizedPhoto?.id);
		photoModalIndex = photoIndex >= 0 ? photoIndex : 0;
		photoModalOpen = photoModalPhotos.length > 0;
	}

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
			<button class="header-btn" onclick={() => (showStats = !showStats)}>
				<Icon name="bar-chart-2" />
				{showStats ? 'HIDE STATS' : 'ANALYTICS'}
			</button>
			<button class="header-btn primary" onclick={() => (showAddModal = true)}>
				<Icon name="user-plus" />
				REGISTER POI
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
					<div class="stat-cards">
						<div class="stat-card">
							<div class="stat-card-icon" style="background: rgba(59, 130, 246, 0.12); color: #3b82f6;"><Icon name="users" size={14} /></div>
							<div class="stat-card-info">
								<span class="stat-card-num">{poiStats.total}</span>
								<span class="stat-card-label">Total</span>
							</div>
						</div>
						<div class="stat-card">
							<div class="stat-card-icon" style="background: rgba(102, 126, 234, 0.12); color: #667eea;"><Icon name="activity" size={14} /></div>
							<div class="stat-card-info">
								<span class="stat-card-num">{poiStats.active}</span>
								<span class="stat-card-label">Active</span>
							</div>
						</div>
						<div class="stat-card">
							<div class="stat-card-icon" style="background: rgba(239, 68, 68, 0.12); color: #ef4444;"><Icon name="shield-alert" size={14} /></div>
							<div class="stat-card-info">
								<span class="stat-card-num">{poiStats.highRisk}</span>
								<span class="stat-card-label">High Risk</span>
							</div>
						</div>
						<div class="stat-card">
							<div class="stat-card-icon" style="background: rgba(16, 185, 129, 0.12); color: #10b981;"><Icon name="sparkles" size={14} /></div>
							<div class="stat-card-info">
								<span class="stat-card-num">{poiStats.aiGenerated}</span>
								<span class="stat-card-label">AI Gen</span>
							</div>
						</div>
					</div>

					<!-- Threat breakdown bar -->
					{#if poiStats.total > 0}
						<div class="threat-breakdown">
							<div class="threat-breakdown-label">THREAT DISTRIBUTION</div>
							<div class="threat-bar">
								{#if poiStats.byPriority.low > 0}
									<div class="threat-bar-seg low" style="width: {(poiStats.byPriority.low / poiStats.total * 100)}%" title="Low: {poiStats.byPriority.low}"></div>
								{/if}
								{#if poiStats.byPriority.medium > 0}
									<div class="threat-bar-seg med" style="width: {(poiStats.byPriority.medium / poiStats.total * 100)}%" title="Medium: {poiStats.byPriority.medium}"></div>
								{/if}
								{#if poiStats.byPriority.high > 0}
									<div class="threat-bar-seg high" style="width: {(poiStats.byPriority.high / poiStats.total * 100)}%" title="High: {poiStats.byPriority.high}"></div>
								{/if}
								{#if poiStats.byPriority.critical > 0}
									<div class="threat-bar-seg crit" style="width: {(poiStats.byPriority.critical / poiStats.total * 100)}%" title="Critical: {poiStats.byPriority.critical}"></div>
								{/if}
							</div>
							<div class="threat-legend">
								<span class="legend-dot low"></span>Low
								<span class="legend-dot med"></span>Med
								<span class="legend-dot high"></span>High
								<span class="legend-dot crit"></span>Crit
							</div>
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Main Content -->
		<div class="yorha-main">
			{#if data.error}
				<div class="error-banner">
					<Icon name="circle-alert" />
					<span>{data.error}</span>
				</div>
			{/if}

			<!-- Filters & Search -->
			<div class="filter-section">
				<div class="search-group">
					<div class="search-input-wrap">
						<Icon name="search" size={16} />
						<input
							type="text"
							placeholder="Search by name or description..."
							bind:value={searchQuery}
							class="yorha-input search-input"
						/>
						{#if searchQuery}
							<button class="search-clear" onclick={() => (searchQuery = '')} aria-label="Clear search">
								<Icon name="x" size={14} />
							</button>
						{/if}
					</div>
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

					{#if selectedStatus || selectedThreatLevel}
						<button class="filter-clear-btn" onclick={() => { selectedStatus = ''; selectedThreatLevel = ''; }}>
							<Icon name="filter-x" size={14} />
							CLEAR
						</button>
					{/if}

					<div class="view-toggle">
						<button class="toggle-btn" class:active={viewMode === 'list'} onclick={() => (viewMode = 'list')}>
							<Icon name="list" size={14} />
							LIST
						</button>
						<button class="toggle-btn" class:active={viewMode === 'detail-cards'} onclick={() => (viewMode = 'detail-cards')}>
							<Icon name="layout-grid" size={14} />
							CARDS
						</button>
					</div>
				</div>

				<!-- Active filter + results count -->
				<div class="filter-status-bar">
					<span class="results-count">{filtered.length} record{filtered.length !== 1 ? 's' : ''}</span>
					{#if selectedStatus}
						<span class="active-chip">
							{selectedStatus.replace(/_/g, ' ')}
							<button onclick={() => (selectedStatus = '')} aria-label="Remove status filter"><Icon name="x" size={12} /></button>
						</span>
					{/if}
					{#if selectedThreatLevel}
						<span class="active-chip threat">
							{selectedThreatLevel}
							<button onclick={() => (selectedThreatLevel = '')} aria-label="Remove threat filter"><Icon name="x" size={12} /></button>
						</span>
					{/if}
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
					<div class="empty-icon-ring">
						<Icon name="user-x" size={32} />
					</div>
					<p class="empty-title">NO PERSONS OF INTEREST FOUND</p>
					<p class="empty-subtitle">{searchQuery || selectedStatus || selectedThreatLevel ? 'Try adjusting your filters or clearing search' : 'Register persons of interest to get started'}</p>
					<div class="empty-actions">
						{#if searchQuery || selectedStatus || selectedThreatLevel}
							<button class="btn-yorha" onclick={() => { searchQuery = ''; selectedStatus = ''; selectedThreatLevel = ''; }}>
								<Icon name="filter-x" size={14} />
								CLEAR FILTERS
							</button>
						{/if}
						<button class="btn-yorha primary" onclick={() => (showAddModal = true)}>
							<Icon name="user-plus" size={14} />
							REGISTER POI
						</button>
					</div>
				</div>
			{:else if viewMode === 'detail-cards'}
				<div class="poi-grid">
					{#each filtered as poi (poi.id)}
						<div class="poi-card">
							<div class="card-status-ribbon" style="background: {getStatusColor(poi.status)}"></div>
							<div class="card-header">
								<div class="card-avatar" style="background: {getStatusColor(poi.status)}20; color: {getStatusColor(poi.status)};">
									{poi.name?.charAt(0)?.toUpperCase() ?? '?'}
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

	<!-- Register POI Modal (bits-ui Dialog) -->
	<AddPoiModal bind:open={showAddModal} />

	<!-- Editor Modal (bits-ui Dialog) -->
	<Dialog.Root bind:open={showEditor} onOpenChange={(v) => { if (!v) { editingPoi = null; } }}>
		<Dialog.Portal>
			<Dialog.Overlay forceMount>
				{#snippet child({ props, open })}
					{#if open}
						<div {...props} class="dialog-backdrop" transition:fade={{ duration: 200 }}></div>
					{/if}
				{/snippet}
			</Dialog.Overlay>
			<Dialog.Content forceMount>
				{#snippet child({ props, open })}
					{#if open && editingPoi}
						<div {...props} class="dialog-panel" transition:fly={{ y: 16, duration: 250 }}>
							<div class="dialog-title-bar">
								<div class="dialog-title-icon">
									<Icon name="pencil" size={16} />
								</div>
								<div>
									<Dialog.Title class="dialog-title">Edit Profile</Dialog.Title>
									<Dialog.Description class="dialog-desc">Update details for {editingPoi.name ?? 'this person'}.</Dialog.Description>
								</div>
								<Dialog.Close class="dialog-close-btn">
									<Icon name="x" size={18} />
								</Dialog.Close>
							</div>
							<div class="dialog-body">
								<POIEditor
									poi={{ name: editingPoi.name ?? '', alias: editingPoi.alias ?? '', threatLevel: editingPoi.threatLevel ?? 'low', photos: editingPoi.photos ?? [], notes: editingPoi.description ?? '' }}
									onSave={async (formData) => {
										try {
											const res = await fetch(`/api/persons-of-interest/${editingPoi.id}`, {
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
												showToast(`${formData.name} updated successfully.`, 'success');
											} else {
												showToast('Failed to save changes.', 'error');
											}
											showEditor = false;
											editingPoi = null;
										} catch (e) {
											console.error('Save failed:', e);
											showToast('Network error — could not save.', 'error');
										}
									}}
									onCancel={() => { showEditor = false; editingPoi = null; }}
									onUploadPhoto={() => { uploadingPoiId = editingPoi.id; showPhotoUploader = true; }}
									onViewPhoto={(photo) => { openPhotoModal(photo); }}
								/>
							</div>
						</div>
					{/if}
				{/snippet}
			</Dialog.Content>
		</Dialog.Portal>
	</Dialog.Root>

	<!-- Photo Uploader Modal (bits-ui Dialog) -->
	<Dialog.Root bind:open={showPhotoUploader} onOpenChange={(v) => { if (!v) uploadingPoiId = 0; }}>
		<Dialog.Portal>
			<Dialog.Overlay forceMount>
				{#snippet child({ props, open })}
					{#if open}
						<div {...props} class="dialog-backdrop" transition:fade={{ duration: 200 }}></div>
					{/if}
				{/snippet}
			</Dialog.Overlay>
			<Dialog.Content forceMount>
				{#snippet child({ props, open })}
					{#if open && uploadingPoiId}
						<div {...props} class="dialog-panel dialog-panel-sm" transition:fly={{ y: 16, duration: 250 }}>
							<div class="dialog-title-bar">
								<div class="dialog-title-icon upload">
									<Icon name="image-plus" size={16} />
								</div>
								<div>
									<Dialog.Title class="dialog-title">Upload Photo</Dialog.Title>
									<Dialog.Description class="dialog-desc">Add a photo to this person's profile.</Dialog.Description>
								</div>
								<Dialog.Close class="dialog-close-btn">
									<Icon name="x" size={18} />
								</Dialog.Close>
							</div>
							<div class="dialog-body">
								<POIPhotoUploader
									poiId={uploadingPoiId}
									onUpload={(result) => {
										const uploadedPhoto = normalizePoiPhoto(result);
										if (editingPoi?.id === uploadingPoiId) {
											editingPoi = { ...editingPoi, photos: [uploadedPhoto, ...(editingPoi.photos ?? [])] };
										}
										showToast('Photo uploaded successfully.', 'success');
										showPhotoUploader = false;
									}}
									onError={(err) => {
										console.error('Photo upload error:', err);
										showToast('Photo upload failed.', 'error');
									}}
								/>
							</div>
						</div>
					{/if}
				{/snippet}
			</Dialog.Content>
		</Dialog.Portal>
	</Dialog.Root>

	<!-- Photo Viewer -->
	<POIPhotoModal
		photos={photoModalPhotos}
		bind:currentIndex={photoModalIndex}
		bind:open={photoModalOpen}
		onclose={() => {
			photoModalOpen = false;
			photoModalPhotos = [];
			photoModalIndex = 0;
		}}
	/>

	<!-- Detail Preview -->
	<PersonOfInterestDetailView
		poi={previewPoi}
		open={showPreview}
		onOpenChange={(v) => { showPreview = v; }}
		onEdit={(poi) => { showPreview = false; editingPoi = poi; showEditor = true; }}
	/>

	<!-- Toast Notifications -->
	{#if toasts.length > 0}
		<div class="toast-container">
			{#each toasts as toast (toast.id)}
				<div class="toast toast-{toast.type}" transition:fly={{ y: 20, duration: 300 }}>
					<Icon name={toast.type === 'success' ? 'circle-check' : toast.type === 'error' ? 'circle-alert' : 'info'} size={16} />
					<span>{toast.message}</span>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.yorha-page {
		min-height: 100vh;
		background: #131519;
		font-family: 'JetBrains Mono', 'Courier New', monospace;
		color: rgba(212, 199, 163, 0.9);
	}

	/* Header */
	.yorha-header {
		background: rgba(0, 0, 0, 0.4);
		border-bottom: 1px solid rgba(212, 199, 163, 0.08);
		padding: 1rem 2rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
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
		color: rgba(212, 199, 163, 0.35);
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
		color: rgba(212, 199, 163, 0.4);
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
		background: rgba(0, 0, 0, 0.3);
		border: 1px solid rgba(212, 199, 163, 0.1);
		padding: 0.5rem 1rem;
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.1em;
		color: rgba(212, 199, 163, 0.6);
		cursor: pointer;
		font-family: 'JetBrains Mono', monospace;
		transition: all 0.2s;
		border-radius: 8px;
	}

	.header-btn:hover {
		border-color: rgba(102, 126, 234, 0.4);
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
		background: rgba(0, 0, 0, 0.25);
		border-right: 1px solid rgba(212, 199, 163, 0.08);
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
		color: rgba(212, 199, 163, 0.35);
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
		color: rgba(212, 199, 163, 0.5);
		cursor: pointer;
		font-family: 'JetBrains Mono', monospace;
		text-align: left;
		transition: all 0.2s;
		border-radius: 6px;
	}

	.menu-item:hover {
		background: rgba(212, 199, 163, 0.06);
		color: #667eea;
	}

	.menu-item.active {
		background: rgba(102, 126, 234, 0.1);
		color: #667eea;
		border-left: 3px solid #667eea;
		font-weight: 600;
	}

	/* Stat cards */
	.stat-cards {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}

	.stat-card {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.6rem;
		background: rgba(0, 0, 0, 0.2);
		border: 1px solid rgba(212, 199, 163, 0.06);
		border-radius: 10px;
		transition: border-color 0.2s;
	}

	.stat-card:hover {
		border-color: rgba(212, 199, 163, 0.12);
	}

	.stat-card-icon {
		width: 28px;
		height: 28px;
		border-radius: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.stat-card-info {
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	.stat-card-num {
		font-size: 1rem;
		font-weight: 700;
		color: rgba(212, 199, 163, 0.95);
		line-height: 1.2;
	}

	.stat-card-label {
		font-size: 0.6rem;
		color: rgba(212, 199, 163, 0.35);
		letter-spacing: 0.08em;
		font-weight: 600;
	}

	/* Threat breakdown bar */
	.threat-breakdown {
		padding-top: 0.25rem;
	}

	.threat-breakdown-label {
		font-size: 0.6rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		color: rgba(212, 199, 163, 0.35);
		margin-bottom: 0.4rem;
	}

	.threat-bar {
		display: flex;
		height: 6px;
		border-radius: 3px;
		overflow: hidden;
		background: rgba(212, 199, 163, 0.06);
	}

	.threat-bar-seg {
		min-width: 4px;
		transition: width 0.4s ease;
	}

	.threat-bar-seg.low { background: #10b981; }
	.threat-bar-seg.med { background: #f59e0b; }
	.threat-bar-seg.high { background: #ef4444; }
	.threat-bar-seg.crit { background: #991b1b; }

	.threat-legend {
		display: flex;
		gap: 0.625rem;
		margin-top: 0.35rem;
		font-size: 0.55rem;
		color: rgba(212, 199, 163, 0.4);
		align-items: center;
		font-weight: 600;
		letter-spacing: 0.05em;
	}

	.legend-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		display: inline-block;
	}

	.legend-dot.low { background: #10b981; }
	.legend-dot.med { background: #f59e0b; }
	.legend-dot.high { background: #ef4444; }
	.legend-dot.crit { background: #991b1b; }

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
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid rgba(239, 68, 68, 0.2);
		border-radius: 8px;
		color: #f87171;
		margin-bottom: 1.5rem;
		font-size: 0.85rem;
	}

	/* Filters */
	.filter-section {
		margin-bottom: 1.5rem;
	}

	.search-group {
		display: flex;
		gap: 1rem;
		margin-bottom: 0.75rem;
	}

	.search-input-wrap {
		position: relative;
		flex: 1;
		display: flex;
		align-items: center;
	}

	.search-input-wrap > :global(svg:first-child) {
		position: absolute;
		left: 0.875rem;
		color: rgba(212, 199, 163, 0.3);
		pointer-events: none;
		transition: color 0.2s;
	}

	.search-input-wrap:focus-within > :global(svg:first-child) {
		color: #667eea;
	}

	.search-input {
		padding-left: 2.5rem !important;
		padding-right: 2.25rem !important;
	}

	.search-clear {
		position: absolute;
		right: 0.625rem;
		background: none;
		border: none;
		color: rgba(212, 199, 163, 0.4);
		cursor: pointer;
		padding: 4px;
		border-radius: 6px;
		transition: all 0.15s;
		display: flex;
		align-items: center;
	}

	.search-clear:hover {
		background: rgba(212, 199, 163, 0.08);
		color: rgba(212, 199, 163, 0.8);
	}

	.yorha-input {
		flex: 1;
		width: 100%;
		padding: 0.75rem 1rem;
		border: 1px solid rgba(212, 199, 163, 0.1);
		border-radius: 10px;
		font-size: 0.85rem;
		font-family: 'JetBrains Mono', monospace;
		transition: all 0.2s;
		background: rgba(0, 0, 0, 0.3);
		color: rgba(212, 199, 163, 0.9);
	}

	.yorha-input::placeholder {
		color: rgba(212, 199, 163, 0.25);
	}

	.yorha-input:focus {
		outline: none;
		border-color: rgba(102, 126, 234, 0.5);
		box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
	}

	.filter-clear-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.5rem 0.875rem;
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid rgba(239, 68, 68, 0.2);
		border-radius: 8px;
		font-size: 0.65rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		color: #f87171;
		cursor: pointer;
		font-family: 'JetBrains Mono', monospace;
		transition: all 0.15s;
	}

	.filter-clear-btn:hover {
		background: rgba(239, 68, 68, 0.15);
	}

	.filter-row {
		display: flex;
		gap: 0.75rem;
		align-items: center;
	}

	.filter-status-bar {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.6rem;
		min-height: 1.5rem;
	}

	.results-count {
		font-size: 0.7rem;
		color: rgba(212, 199, 163, 0.4);
		font-weight: 600;
		letter-spacing: 0.08em;
	}

	.active-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.2rem 0.5rem 0.2rem 0.6rem;
		background: rgba(102, 126, 234, 0.12);
		border: 1px solid rgba(102, 126, 234, 0.25);
		border-radius: 6px;
		font-size: 0.65rem;
		font-weight: 600;
		color: #667eea;
		text-transform: capitalize;
	}

	.active-chip.threat {
		background: rgba(245, 158, 11, 0.12);
		border-color: rgba(245, 158, 11, 0.25);
		color: #f59e0b;
	}

	.active-chip button {
		background: none;
		border: none;
		cursor: pointer;
		padding: 1px;
		color: inherit;
		opacity: 0.6;
		transition: opacity 0.15s;
		display: flex;
	}

	.active-chip button:hover {
		opacity: 1;
	}

	.yorha-select {
		padding: 0.75rem 1rem;
		border: 1px solid rgba(212, 199, 163, 0.1);
		border-radius: 10px;
		font-size: 0.85rem;
		font-family: 'JetBrains Mono', monospace;
		background: rgba(0, 0, 0, 0.3);
		color: rgba(212, 199, 163, 0.8);
		cursor: pointer;
		transition: all 0.2s;
	}

	.yorha-select option {
		background: #1a1d24;
		color: rgba(212, 199, 163, 0.9);
	}

	.yorha-select:focus {
		outline: none;
		border-color: rgba(102, 126, 234, 0.5);
		box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
	}

	.view-toggle {
		display: flex;
		border: 1px solid rgba(212, 199, 163, 0.1);
		border-radius: 8px;
		overflow: hidden;
		margin-left: auto;
	}

	.toggle-btn {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.625rem 1rem;
		background: rgba(0, 0, 0, 0.2);
		border: none;
		border-right: 1px solid rgba(212, 199, 163, 0.08);
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		color: rgba(212, 199, 163, 0.4);
		cursor: pointer;
		font-family: 'JetBrains Mono', monospace;
		transition: all 0.2s;
	}

	.toggle-btn:last-child {
		border-right: none;
	}

	.toggle-btn:hover {
		background: rgba(212, 199, 163, 0.06);
		color: rgba(212, 199, 163, 0.7);
	}

	.toggle-btn.active {
		background: #667eea;
		color: #fff;
	}

	/* Empty State */
	.empty-state {
		text-align: center;
		padding: 4rem 2rem;
		background: rgba(0, 0, 0, 0.2);
		border-radius: 16px;
		border: 1px solid rgba(212, 199, 163, 0.08);
	}

	.empty-icon-ring {
		width: 80px;
		height: 80px;
		border-radius: 50%;
		background: rgba(102, 126, 234, 0.08);
		border: 2px solid rgba(212, 199, 163, 0.1);
		display: flex;
		align-items: center;
		justify-content: center;
		color: rgba(102, 126, 234, 0.4);
		margin: 0 auto 1.25rem;
	}

	.empty-title {
		font-size: 1rem;
		font-weight: 600;
		letter-spacing: 0.1em;
		color: rgba(212, 199, 163, 0.6);
		margin: 0 0 0.5rem 0;
	}

	.empty-subtitle {
		font-size: 0.8rem;
		color: rgba(212, 199, 163, 0.35);
		margin: 0 0 1.5rem 0;
		line-height: 1.5;
	}

	.empty-actions {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
	}

	.btn-yorha {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1.5rem;
		background: rgba(0, 0, 0, 0.3);
		border: 1px solid rgba(212, 199, 163, 0.1);
		border-radius: 8px;
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.1em;
		color: rgba(212, 199, 163, 0.6);
		text-decoration: none;
		cursor: pointer;
		font-family: 'JetBrains Mono', monospace;
		transition: all 0.2s;
	}

	.btn-yorha:hover {
		border-color: rgba(102, 126, 234, 0.4);
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
		background: rgba(0, 0, 0, 0.25);
		border: 1px solid rgba(212, 199, 163, 0.08);
		border-radius: 14px;
		overflow: hidden;
		transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
	}

	.poi-card:hover {
		box-shadow: 0 8px 24px rgba(102, 126, 234, 0.12), 0 2px 8px rgba(0, 0, 0, 0.2);
		border-color: rgba(102, 126, 234, 0.35);
		transform: translateY(-2px);
	}

	.card-header {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1.25rem 1.5rem;
		border-bottom: 1px solid rgba(212, 199, 163, 0.06);
	}

	.card-avatar {
		width: 48px;
		height: 48px;
		border-radius: 12px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.25rem;
		font-weight: 700;
		flex-shrink: 0;
		transition: transform 0.2s;
	}

	.poi-card:hover .card-avatar {
		transform: scale(1.05);
	}

	.card-status-ribbon {
		height: 3px;
		border-radius: 3px 3px 0 0;
	}

	.card-info {
		flex: 1;
		min-width: 0;
	}

	.card-name {
		font-size: 1rem;
		font-weight: 600;
		color: rgba(212, 199, 163, 0.95);
		margin: 0 0 0.25rem 0;
		letter-spacing: 0.05em;
	}

	.card-status {
		font-size: 0.7rem;
		color: rgba(212, 199, 163, 0.4);
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
		background: rgba(16, 185, 129, 0.15);
		color: #34d399;
	}

	.threat-badge.threat-medium {
		background: rgba(245, 158, 11, 0.15);
		color: #fbbf24;
	}

	.threat-badge.threat-high {
		background: rgba(239, 68, 68, 0.15);
		color: #f87171;
	}

	.threat-badge.threat-critical {
		background: rgba(220, 38, 38, 0.2);
		color: #ef4444;
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
		color: rgba(212, 199, 163, 0.35);
		margin-bottom: 0.25rem;
	}

	.field-value {
		font-size: 0.85rem;
		color: rgba(212, 199, 163, 0.7);
		margin: 0;
		line-height: 1.5;
	}

	.card-actions {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr;
		border-top: 1px solid rgba(212, 199, 163, 0.06);
	}

	.action-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.875rem;
		background: transparent;
		border: none;
		border-right: 1px solid rgba(212, 199, 163, 0.06);
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		color: rgba(212, 199, 163, 0.5);
		cursor: pointer;
		font-family: 'JetBrains Mono', monospace;
		text-decoration: none;
		transition: all 0.2s;
	}

	.action-btn:last-child {
		border-right: none;
	}

	.action-btn:hover {
		background: rgba(102, 126, 234, 0.08);
		color: #667eea;
	}

	.action-btn.primary {
		background: rgba(102, 126, 234, 0.15);
		color: #667eea;
	}

	.action-btn.primary:hover {
		background: rgba(102, 126, 234, 0.25);
	}

	/* Table */
	.poi-table-wrapper {
		background: rgba(0, 0, 0, 0.25);
		border: 1px solid rgba(212, 199, 163, 0.08);
		border-radius: 12px;
		overflow: hidden;
	}

	.yorha-table {
		width: 100%;
		border-collapse: collapse;
	}

	.yorha-table thead {
		background: rgba(0, 0, 0, 0.3);
		border-bottom: 1px solid rgba(212, 199, 163, 0.08);
	}

	.yorha-table th {
		text-align: left;
		padding: 1rem 1.5rem;
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.15em;
		color: rgba(212, 199, 163, 0.45);
	}

	.table-row {
		border-bottom: 1px solid rgba(212, 199, 163, 0.04);
		transition: background 0.15s;
	}

	.table-row:hover {
		background: rgba(102, 126, 234, 0.05);
	}

	.yorha-table td {
		padding: 1.25rem 1.5rem;
		font-size: 0.85rem;
	}

	.name-cell {
		font-weight: 500;
	}

	.name-link {
		color: rgba(212, 199, 163, 0.9);
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
		background: rgba(16, 185, 129, 0.15);
		color: #34d399;
	}

	.threat-pill.threat-medium {
		background: rgba(245, 158, 11, 0.15);
		color: #fbbf24;
	}

	.threat-pill.threat-high {
		background: rgba(239, 68, 68, 0.15);
		color: #f87171;
	}

	.threat-pill.threat-critical {
		background: rgba(220, 38, 38, 0.2);
		color: #ef4444;
	}

	.location-cell,
	.date-cell {
		color: rgba(212, 199, 163, 0.5);
		font-size: 0.8rem;
	}

	.actions-cell {
		display: flex;
		gap: 0.5rem;
	}

	.icon-btn {
		background: transparent;
		border: none;
		color: rgba(212, 199, 163, 0.35);
		cursor: pointer;
		padding: 0.25rem;
		transition: color 0.2s;
	}

	.icon-btn:hover {
		color: #667eea;
	}

	/* bits-ui Dialog Styles */
	:global(.dialog-backdrop) {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		backdrop-filter: blur(6px);
		z-index: 1100;
	}

	:global(.dialog-panel) {
		position: fixed;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		z-index: 1200;
		width: 95%;
		max-width: 600px;
		max-height: 90vh;
		overflow-y: auto;
		background: #1a1d24;
		border: 1px solid rgba(212, 199, 163, 0.1);
		border-radius: 16px;
		box-shadow: 0 24px 48px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(212, 199, 163, 0.05);
	}

	:global(.dialog-panel-sm) {
		max-width: 480px;
	}

	:global(.dialog-title-bar) {
		display: flex;
		align-items: flex-start;
		gap: 0.875rem;
		padding: 1.5rem 1.5rem 1rem;
	}

	:global(.dialog-title-icon) {
		width: 36px;
		height: 36px;
		border-radius: 10px;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		color: #fff;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	:global(.dialog-title-icon.upload) {
		background: linear-gradient(135deg, #10b981 0%, #059669 100%);
	}

	:global(.dialog-title) {
		font-size: 1rem;
		font-weight: 700;
		color: rgba(212, 199, 163, 0.95);
		margin: 0;
	}

	:global(.dialog-desc) {
		font-size: 0.775rem;
		color: rgba(212, 199, 163, 0.5);
		margin: 0.15rem 0 0;
	}

	:global(.dialog-close-btn) {
		margin-left: auto;
		background: none;
		border: none;
		color: rgba(212, 199, 163, 0.4);
		padding: 6px;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.15s;
	}

	:global(.dialog-close-btn:hover) {
		background: rgba(212, 199, 163, 0.08);
		color: rgba(212, 199, 163, 0.8);
	}

	:global(.dialog-body) {
		padding: 0 1.5rem 1.5rem;
	}

	/* Toast notifications */
	.toast-container {
		position: fixed;
		bottom: 1.5rem;
		right: 1.5rem;
		z-index: 2000;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		max-width: 380px;
	}

	.toast {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 0.75rem 1.25rem;
		border-radius: 12px;
		font-size: 0.8rem;
		font-weight: 500;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
		font-family: inherit;
	}

	.toast-success {
		background: rgba(16, 185, 129, 0.15);
		color: #34d399;
		border: 1px solid rgba(16, 185, 129, 0.25);
	}

	.toast-error {
		background: rgba(239, 68, 68, 0.15);
		color: #f87171;
		border: 1px solid rgba(239, 68, 68, 0.25);
	}

	.toast-info {
		background: rgba(96, 165, 250, 0.15);
		color: #60a5fa;
		border: 1px solid rgba(96, 165, 250, 0.25);
	}

	/* 4-column card actions */
	.card-actions-4 {
		grid-template-columns: 1fr 1fr 1fr 1fr;
	}

	/* Similar POIs Panel */
	.similar-panel {
		background: rgba(0, 0, 0, 0.25);
		border: 2px solid rgba(102, 126, 234, 0.35);
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
		color: rgba(212, 199, 163, 0.4);
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
		border-bottom: 1px solid rgba(212, 199, 163, 0.06);
		text-decoration: none;
		color: inherit;
		transition: background 0.15s;
	}

	.similar-item:hover {
		background: rgba(102, 126, 234, 0.06);
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
		color: rgba(212, 199, 163, 0.9);
		margin-bottom: 0.25rem;
	}

	.sim-meta {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.7rem;
		color: rgba(212, 199, 163, 0.4);
		letter-spacing: 0.05em;
	}

	.sim-desc {
		width: 100%;
		margin: 0.25rem 0 0 0;
		padding-left: 3.75rem;
		font-size: 0.8rem;
		color: rgba(212, 199, 163, 0.5);
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
