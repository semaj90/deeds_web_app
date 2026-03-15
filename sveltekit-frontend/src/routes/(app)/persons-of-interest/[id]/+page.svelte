<script lang="ts">
	import { poiService } from '$lib/features/poi/services/poi';
	import type { KnownAssociate } from '$lib/types/poi';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import POIPhotoGrid from '$lib/components/poi/POIPhotoGrid.svelte';
	import POIQuickActions from '$lib/components/poi/POIQuickActions.svelte';
	import POIThreatBadge from '$lib/components/poi/POIThreatBadge.svelte';
	import PersonProfile from '$lib/components/PersonProfile.svelte';
	import PersonStatsPanel from '$lib/components/PersonStatsPanel.svelte';
	import POIFaceMatchDialog from '$lib/components/poi/POIFaceMatchDialog.svelte';
	import POIStats from '$lib/components/poi/POIStats.svelte';
	import POIPhotoModal from '$lib/components/POIPhotoModal.svelte';
	import CriminalProfile from '$lib/components/legal/CriminalProfile.svelte';
	import type { FugitiveDexPerson } from '$lib/components/types';

	let { data } = $props();

	let photoModalOpen = $state(false);
	let photoModalIndex = $state(0);

	let associates = $state<KnownAssociate[]>([]);
	let associatesLoading = $state(false);
	let associatesError = $state<string | null>(null);
	let activeTab = $state<'details' | 'associates' | 'photos' | 'search' | 'dex' | 'criminal'>('details');
	let faceMatchOpen = $state(false);
	let faceMatches = $state<any[]>([]);
	let faceMatchLoading = $state(false);
	let faceMatchError = $state<string | null>(null);
	let photos = $state<any[]>([]);
	$effect(() => { photos = (data as any).photos ?? []; });
	let uploading = $state(false);
	let uploadError = $state<string | null>(null);
	let similarPOIs = $state<any[]>([]);
	let similarLoading = $state(false);
	let similarError = $state<string | null>(null);
	let similarMethod = $state('');
	let searchQuery = $state('');
	let searchResults = $state<any[]>([]);
	let searchLoading = $state(false);
	let searchError = $state<string | null>(null);

	async function loadSimilarPOIs() {
		if (!data.poi?.id) return;
		similarLoading = true;
		similarError = null;
		try {
			const res = await fetch(`/api/persons-of-interest/${data.poi.id}/similar`);
			if (!res.ok) throw new Error("Failed to fetch similar POIs");
			const json = await res.json();
			similarPOIs = json.similar || [];
			similarMethod = json.method || "";
		} catch (err) {
			similarError = err instanceof Error ? err.message : "Failed to load";
			similarPOIs = [];
		} finally {
			similarLoading = false;
		}
	}

	
	async function searchSimilarPOIs(query?: string) {
		const q = query ?? searchQuery.trim();
		if (!q) return;
		searchLoading = true;
		searchError = null;
		try {
			const res = await fetch('/api/persons-of-interest/search', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ query: q, excludeId: data.poi?.id, limit: 10 })
			});
			if (!res.ok) throw new Error('Search failed');
			searchResults = await res.json();
		} catch (err) {
			searchError = err instanceof Error ? err.message : 'Search failed';
			searchResults = [];
		} finally {
			searchLoading = false;
		}
	}

	function autoSearchFromProfile() {
		if (data.poi?.name) {
			const parts = data.poi.name.split(' ');
			searchQuery = parts.length > 1 ? parts[parts.length - 1] : data.poi.name;
			searchSimilarPOIs();
		}
	}

	onMount(async () => {
		if (data.poi?.id) {
			await loadAssociates();
			loadSimilarPOIs();
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

	let fileInputEl = $state<HTMLInputElement | undefined>(undefined);

	async function uploadPhoto(file: File) {
		if (!data.poi?.id) return;
		uploading = true;
		uploadError = null;
		try {
			const formData = new FormData();
			formData.append('file', file);
			const res = await fetch(`/api/persons-of-interest/${data.poi.id}/photos`, {
				method: 'POST',
				body: formData
			});
			if (!res.ok) {
				const err = await res.json().catch(() => ({}));
				throw new Error(err.error ?? `Upload failed (${res.status})`);
			}
			const newPhoto = await res.json();
			photos = [newPhoto, ...photos];
		} catch (err) {
			uploadError = err instanceof Error ? err.message : 'Upload failed';
		} finally {
			uploading = false;
		}
	}

	function handleUploadClick() {
		fileInputEl?.click();
	}

	function handleFileSelected(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file) {
			uploadPhoto(file);
			input.value = '';
		}
	}

	async function deletePhoto(index: number) {
		const photo = photos[index];
		if (!photo?.id || !data.poi?.id) return;
		if (!confirm(`Delete photo "${photo.originalName ?? 'this photo'}"?`)) return;
		try {
			const res = await fetch(`/api/persons-of-interest/${data.poi.id}/photos`, {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ photoId: photo.id })
			});
			if (!res.ok) throw new Error('Delete failed');
			photos = photos.filter((_, i) => i !== index);
		} catch (err) {
			console.error('Failed to delete photo:', err);
		}
	}

	function viewPhoto(photo: any) {
		const idx = photos.indexOf(photo);
		photoModalIndex = idx >= 0 ? idx : 0;
		photoModalOpen = true;
	}

	async function findFaceMatches() {
		if (!data.poi?.id) return;
		faceMatchLoading = true;
		faceMatchError = null;
		try {
			const res = await fetch(`/api/persons-of-interest/${data.poi.id}/face-match`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
			});
			if (!res.ok) throw new Error(`Face match failed (${res.status})`);
			const json = await res.json();
			faceMatches = json.matches ?? [];
			if (faceMatches.length > 0) {
				faceMatchOpen = true;
			} else {
				faceMatchError = json.message ?? 'No similar faces found';
			}
		} catch (err) {
			faceMatchError = err instanceof Error ? err.message : 'Face match failed';
		} finally {
			faceMatchLoading = false;
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
					<POIThreatBadge threatLevel={poi.threatLevel} size="md" />
				</div>
			</div>
			<div class="header-right">
				<POIQuickActions caseId={poi.caseId} />
				<a href="/persons-of-interest" class="btn-secondary">Back</a>
			</div>
		</div>

		{#if poi.caseId}
			<POIStats caseId={poi.caseId} />
		{/if}

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
				class:active={activeTab === 'photos'}
				onclick={() => (activeTab = 'photos')}
			>
				Photos ({photos.length})
			</button>
			<button
				class="tab-button"
				class:active={activeTab === 'search'}
				onclick={() => (activeTab = 'search')}
			>
				Similar POIs
			</button>
			<button
				class="tab-button"
				class:active={activeTab === 'dex'}
				onclick={() => (activeTab = 'dex')}
			>
				Dex Profile
			</button>
			<button
				class="tab-button"
				class:active={activeTab === 'criminal'}
				onclick={() => (activeTab = 'criminal')}
			>
				Criminal Record
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
			{:else if activeTab === 'photos'}
				<div class="face-match-bar">
					<button
						class="btn-face-match"
						onclick={findFaceMatches}
						disabled={faceMatchLoading || photos.length === 0}
					>
						<span class="i-lucide-scan w-4 h-4 inline-block"></span>
						{faceMatchLoading ? 'Searching...' : 'Find Similar Faces'}
					</button>
					{#if faceMatchError}
						<span class="face-match-msg">{faceMatchError}</span>
					{/if}
				</div>
				{#if uploading}
					<div class="upload-status">Uploading photo...</div>
				{/if}
				{#if uploadError}
					<div class="upload-error">{uploadError}</div>
				{/if}
				<POIPhotoGrid
					{photos}
					editable={true}
					onupload={handleUploadClick}
					ondelete={deletePhoto}
					onview={viewPhoto}
				/>
				<input type="file" bind:this={fileInputEl} onchange={handleFileSelected} accept="image/*" style="display:none" />
				{#if photos.length > 0}
					<POIPhotoModal {photos} bind:currentIndex={photoModalIndex} bind:open={photoModalOpen} onclose={() => { photoModalOpen = false; }} />
				{/if}
				<POIFaceMatchDialog bind:open={faceMatchOpen} matches={faceMatches} onSelect={(selected) => { goto(`/persons-of-interest/${selected.id}`); }} />
			{:else if activeTab === 'search'}
				<div class="similar-panel">
					<h3 class="similar-heading">Similar Persons <span class="method-tag">{similarMethod}</span></h3>
					{#if similarLoading}
						<p class="empty-message">Finding similar persons...</p>
					{:else if similarError}
						<div class="search-error">{similarError}
							<button class="btn-retry" onclick={loadSimilarPOIs}>Retry</button>
						</div>
					{:else if similarPOIs.length === 0}
						<p class="empty-message">No similar persons found</p>
					{:else}
						<div class="search-results">
							{#each similarPOIs as sp (sp.poiId)}
								<a href="/persons-of-interest/{sp.poiId}" class="result-card">
									<div class="result-header">
										{#if sp.photoUrl}
											<img src={sp.photoUrl} alt={sp.name} style="width:32px;height:32px;border-radius:50%;object-fit:cover;margin-right:0.5rem;flex-shrink:0;" />
										{/if}
										<span class="result-name">{sp.name}</span>
										<span class="result-score" style="opacity: {0.4 + sp.similarity * 0.6}">
											{Math.round(sp.similarity * 100)}% match
										</span>
									</div>
									<div class="result-meta">
										<span class="badge status" style="background-color: {getStatusColor(sp.status)}; font-size: 0.75rem; padding: 0.25rem 0.5rem;">
											{sp.status}
										</span>
										<span class="badge" style="background-color: {getThreatColor(sp.threatLevel)}; font-size: 0.75rem; padding: 0.25rem 0.5rem;">
											{sp.threatLevel}
										</span>
										{#if sp.lastLocation}
											<span class="result-location">{sp.lastLocation}</span>
										{/if}
									</div>
									{#if sp.description}
										<p class="result-desc">{sp.description}</p>
									{/if}
								</a>
							{/each}
						</div>
					{/if}
				</div>
				<hr style="border-color: #333; margin: 1.5rem 0;" />
				<h3 class="results-heading">MANUAL SEARCH</h3>

				<div class="search-section">
					<div class="search-bar">
						<input
							type="text"
							bind:value={searchQuery}
							placeholder="Search by name, alias, description, location..."
							class="search-input"
							onkeydown={(e) => { if (e.key === 'Enter') searchSimilarPOIs(); }}
						/>
						<button class="btn-search" onclick={() => searchSimilarPOIs()} disabled={searchLoading || !searchQuery.trim()}>
							{searchLoading ? 'Searching...' : 'Search'}
						</button>
						<button class="btn-secondary btn-auto" onclick={autoSearchFromProfile} disabled={searchLoading}>
							Find Similar
						</button>
					</div>

					{#if searchError}
						<div class="search-error">{searchError}</div>
					{/if}

					{#if searchResults.length > 0}
						<div class="search-results">
							<h3 class="results-heading">{searchResults.length} result{searchResults.length !== 1 ? 's' : ''}</h3>
							{#each searchResults as result (result.poiId)}
								<a href="/persons-of-interest/{result.poiId}" class="result-card">
									<div class="result-header">
										{#if result.photoUrl}
											<img src={result.photoUrl} alt={result.name} style="width:32px;height:32px;border-radius:50%;object-fit:cover;margin-right:0.5rem;flex-shrink:0;" />
										{/if}
										<span class="result-name">{result.name}</span>
										<span class="result-score" style="opacity: {0.4 + result.similarityScore * 0.6}">
											{Math.round(result.similarityScore * 100)}% match
										</span>
									</div>
									<div class="result-meta">
										<span class="badge status" style="background-color: {getStatusColor(result.status)}; font-size: 0.75rem; padding: 0.25rem 0.5rem;">
											{result.status}
										</span>
										<span class="badge" style="background-color: {getThreatColor(result.threatLevel)}; font-size: 0.75rem; padding: 0.25rem 0.5rem;">
											{result.threatLevel}
										</span>
										{#if result.lastLocation}
											<span class="result-location">{result.lastLocation}</span>
										{/if}
									</div>
									{#if result.description}
										<p class="result-desc">{result.description}</p>
									{/if}
								</a>
							{/each}
						</div>
					{:else if !searchLoading && searchQuery.trim()}
						<p class="empty-message">No matching persons found</p>
					{:else if !searchQuery.trim()}
						<p class="empty-message">Enter a search term or click "Find Similar" to search by this person's name</p>
					{/if}
				</div>
			{:else if activeTab === 'criminal'}
				{@const criminalData = {
					id: poi.id,
					personalInfo: {
						firstName: poi.name?.split(' ')[0] ?? '',
						lastName: poi.name?.split(' ').slice(1).join(' ') ?? '',
						dateOfBirth: poi.dateOfBirth,
						aliases: poi.aliases ?? [],
						gender: poi.physicalDescription?.gender,
						height: poi.physicalDescription?.height ?? poi.physicalDescription?.heightCm ? `${poi.physicalDescription?.heightCm}cm` : undefined,
						weight: poi.physicalDescription?.weight,
						eyeColor: poi.physicalDescription?.eyes,
						hairColor: poi.physicalDescription?.hair,
						distinguishingMarks: poi.physicalDescription?.distinguishingMarks ?? []
					},
					identification: {
						mugshots: photos.map((p: any) => p.url).filter(Boolean)
					},
					currentStatus: poi.status === 'wanted' ? 'at_large' as const
						: poi.status === 'cleared' ? 'cleared' as const
						: poi.status === 'surveillance' ? 'on_parole' as const
						: undefined,
					riskAssessment: {
						riskLevel: poi.threatLevel === 'critical' ? 'extreme' as const
							: poi.threatLevel === 'high' ? 'high' as const
							: poi.threatLevel === 'medium' ? 'medium' as const
							: 'low' as const,
						flightRisk: poi.threatLevel === 'critical' || poi.threatLevel === 'high',
						violentHistory: poi.profileData?.violentHistory ?? false
					},
					warrants: poi.profileData?.warrants ?? [],
					criminalHistory: poi.profileData?.criminalHistory ?? [],
					notes: poi.description
				}}
				<CriminalProfile profile={criminalData} viewMode="full" />
			{:else if activeTab === 'dex'}
				{@const dexPerson = {
					id: poi.id,
					name: poi.name,
					alias: poi.aliases?.[0] ?? '',
					role: poi.status ?? 'unknown',
					status: poi.status === 'wanted' ? 'WANTED' : poi.status === 'surveillance' ? 'MONITORING' : 'COOPERATIVE',
					priority: poi.threatLevel === 'critical' || poi.threatLevel === 'high' ? 'HIGH' : poi.threatLevel === 'medium' ? 'MEDIUM' : 'LOW',
					height: poi.physicalDescription?.height ?? '',
					age: poi.dateOfBirth ?? '',
					hair: poi.physicalDescription?.hair ?? '',
					eyes: poi.physicalDescription?.eyes ?? '',
					modusOperandi: poi.profileData?.modusOperandi ?? poi.description ?? '',
					lastSeen: poi.lastKnownLocation ?? '',
					dangerLevel: poi.threatLevel === 'critical' ? 9 : poi.threatLevel === 'high' ? 7 : poi.threatLevel === 'medium' ? 5 : 2,
					photo: '',
					knownAssociates: poi.profileData?.associates ?? [],
					knownHabits: poi.profileData?.knownHabits ?? [],
					attributes: { stealth: 50, intelligence: 50, strength: 50, speed: 50, dangerousness: 50 }
				} satisfies FugitiveDexPerson}
				<div class="dex-layout" style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
					<PersonProfile selectedPerson={dexPerson} onOpenAIModal={() => { console.log('AI report for', poi.name); }} />
					<PersonStatsPanel selectedPerson={dexPerson} />
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

	.header-right {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		align-items: flex-end;
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

	.empty-message {
		color: #9ca3af;
		text-align: center;
		padding: 2rem;
	}

	.search-section {
		color: #d1d5db;
	}

	.search-bar {
		display: flex;
		gap: 0.75rem;
		margin-bottom: 1.5rem;
	}

	.search-input {
		flex: 1;
		padding: 0.75rem 1rem;
		background: #0f0f23;
		border: 1px solid #333;
		border-radius: 0.375rem;
		color: #ffffff;
		font-size: 0.9rem;
	}

	.search-input:focus {
		outline: none;
		border-color: #dc2626;
	}

	.btn-search {
		padding: 0.75rem 1.5rem;
		background: #dc2626;
		color: #ffffff;
		border: none;
		border-radius: 0.375rem;
		font-weight: 600;
		cursor: pointer;
		transition: background-color 0.2s;
	}

	.btn-search:hover:not(:disabled) {
		background: #b91c1c;
	}

	.btn-search:disabled,
	.btn-auto:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-auto {
		white-space: nowrap;
	}

	.search-error {
		padding: 0.75rem;
		background: #7f1d1d;
		border: 1px solid #dc2626;
		border-radius: 0.375rem;
		color: #fecaca;
		margin-bottom: 1rem;
	}

	.results-heading {
		color: #9ca3af;
		font-size: 0.875rem;
		font-weight: 600;
		margin: 0 0 1rem 0;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.search-results {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.result-card {
		display: block;
		padding: 1rem;
		background: #0f0f23;
		border: 1px solid #333;
		border-radius: 0.375rem;
		text-decoration: none;
		transition: border-color 0.2s;
	}

	.result-card:hover {
		border-color: #dc2626;
	}

	.result-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.5rem;
	}

	.result-name {
		color: #ffffff;
		font-weight: 600;
		font-size: 1rem;
	}

	.result-score {
		color: #10b981;
		font-size: 0.8rem;
		font-weight: 600;
	}

	.result-meta {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		flex-wrap: wrap;
	}

	.result-location {
		color: #9ca3af;
		font-size: 0.8rem;
	}

	.result-desc {
		color: #9ca3af;
		font-size: 0.85rem;
		margin: 0.5rem 0 0 0;
		line-height: 1.4;
	}

	.similar-panel {
		margin-bottom: 1.5rem;
	}

	.similar-heading {
		color: #ffffff;
		font-size: 1rem;
		font-weight: 600;
		margin: 0 0 1rem 0;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.method-tag {
		font-size: 0.7rem;
		padding: 0.2rem 0.5rem;
		background: #1e293b;
		border: 1px solid #334155;
		border-radius: 0.25rem;
		color: #94a3b8;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.face-match-bar {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 1rem;
		padding: 0.75rem;
		background: #0f0f23;
		border: 1px solid #333;
		border-radius: 0.375rem;
	}

	.btn-face-match {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		background: #7c3aed;
		color: #ffffff;
		border: none;
		border-radius: 0.375rem;
		font-weight: 600;
		font-size: 0.875rem;
		cursor: pointer;
		transition: background-color 0.2s;
	}

	.btn-face-match:hover:not(:disabled) {
		background: #6d28d9;
	}

	.btn-face-match:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.face-match-msg {
		color: #9ca3af;
		font-size: 0.85rem;
	}

	.upload-status {
		padding: 0.75rem;
		background: #1e3a5f;
		border: 1px solid #3b82f6;
		border-radius: 0.375rem;
		color: #93c5fd;
		margin-bottom: 1rem;
		text-align: center;
	}

	.upload-error {
		padding: 0.75rem;
		background: #7f1d1d;
		border: 1px solid #dc2626;
		border-radius: 0.375rem;
		color: #fecaca;
		margin-bottom: 1rem;
	}
</style>
