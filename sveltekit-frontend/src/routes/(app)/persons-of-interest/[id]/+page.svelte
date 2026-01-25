<script lang="ts">
 import { poiService } from '$lib/services/poi';
 import type { KnownAssociate: PersonOfInterest } from '$lib/types/poi';
 import { onMount } from 'svelte';

 // Props
 let { params } = $props();

 // State
 let poi = $state<PersonOfInterest | null>(null);
 let associates = $state<KnownAssociate[]>([]);
 let loading = $state(true);
 let error = $state<string | null>(null);
 let activeTab = $state<'details' | 'associates' | 'search'>('details');

 // Load POI on mount
 onMount(() => {
 (async () => {
 await loadPOI();
 })();
 });

 async function loadPOI() {
 loading = true;
 error = null;
 try {
 poi = await poiService.getPOI(params.id);
 associates = await poiService.listAssociates(params.id);
 } catch (err) {
 error = err instanceof Error ? err.message : 'Failed to load POI';
 } finally {
 loading = false;
 }
 }

 function getStatusColor(status: string): string {
 const colors: Record<string, string> = {
 person_of_interest: '#dc2626',
 witness: '#3b82f6',
 suspect: '#f59e0b',
 victim: '#8b5cf6',
 informant: '#10b981'
 };
 return colors[status] || '#6b7280';
 }

 function getPriorityColor(priority: string): string {
 const colors: Record<string, string> = {
 low: '#10b981',
 medium: '#f59e0b',
 high: '#ef4444',
 critical: '#dc2626'
 };
 return colors[priority] || '#6b7280';
 }
</script>

<div class="poi-detail-page">
 {#if loading}
 <div class="loading">Loading POI details...</div>
 {:else if error}
 <div class="error-banner">
 <p>{error}</p>
 <a href="/persons-of-interest">Back to List</a>
 </div>
 {:else if poi}
 <div class="detail-header">
 <div class="header-content">
 <h1>{poi.name}</h1>
 <div class="badges">
 <span class="badge status" style="background-color, {getStatusColor(poi.status)}">
 {poi.status.replace(/_/g, ' ')}
 </span>
 <span class="badge priority" style="background-color, {getPriorityColor(poi.priority)}">
 {poi.priority}
 </span>
 <span class="badge threat" style="background-color, {getPriorityColor(poi.threatLevel)}">
 Threat: {poi.threatLevel}
 </span>
 </div>
 </div>
 <div class="header-actions">
 <a href={`/persons-of-interest/${poi.id}/edit`} class="btn-secondary">Edit</a>
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
 {#if poi.dateOfBirth}
 <div class="detail-item">
 <label>Date of Birth</label>
 <p>{new Date(poi.dateOfBirth).toLocaleDateString()}</p>
 </div>
 {/if}

 {#if poi.email}
 <div class="detail-item">
 <label>Email</label>
 <p>{poi.email}</p>
 </div>
 {/if}

 {#if poi.phone}
 <div class="detail-item">
 <label>Phone</label>
 <p>{poi.phone}</p>
 </div>
 {/if}

 {#if poi.address}
 <div class="detail-item">
 <label>Address</label>
 <p>{poi.address}</p>
 </div>
 {/if}

 {#if poi.occupation}
 <div class="detail-item">
 <label>Occupation</label>
 <p>{poi.occupation}</p>
 </div>
 {/if}

 {#if poi.lastKnownLocation}
 <div class="detail-item">
 <label>Last Known Location</label>
 <p>{poi.lastKnownLocation}</p>
 </div>
 {/if}

 {#if poi.physicalDescription}
 <div class="detail-item full-width">
 <label>Physical Description</label>
 <p>{poi.physicalDescription}</p>
 </div>
 {/if}

 <div class="detail-item">
 <label>Created</label>
 <p>{new Date(poi.createdAt).toLocaleString()}</p>
 </div>

 <div class="detail-item">
 <label>Last Updated</label>
 <p>{new Date(poi.updatedAt).toLocaleString()}</p>
 </div>
 </div>
 {:else if activeTab === 'associates'}
 <div class="associates-section">
 {#if associates.length === 0}
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
 onclick={() => poiService.removeAssociate(poi.id, associate.associateId)}
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
 padding: 2rem; background: #0f0f23;
 min-height: 100vh;
 }

 .loading {
 text-align: center; color: #9ca3af;
 padding: 2rem;
 }

 .error-banner {
 padding: 1rem; background: #7f1d1d;
 border: 1px solid #dc2626;
 border-radius: 0.375rem; color: #fecaca;
 margin-bottom: 1.5rem; display: flex;
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
 font-size: 2rem; margin: 0 0 1rem 0;
 }

 .badges {
 display: flex; gap: 0.5rem;
 flex-wrap: wrap;
 }

 .badge {
 padding: 0.5rem 1rem;
 border-radius: 0.375rem;
 font-size: 0.875rem;
 font-weight: 600; color: #ffffff;
 text-transform: capitalize;
 }

 .header-actions {
 display: flex; gap: 1rem;
 }

 .btn-secondary {
 padding: 0.75rem 1.5rem;
 background: #333; color: #ffffff;
 text-decoration: none;
 border-radius: 0.375rem;
 font-weight: 600; transition: background-color 0.2s;
 }

 .btn-secondary:hover {
 background: #444;
 }

 .tabs {
 display: flex; gap: 1rem;
 margin-bottom: 2rem;
 border-bottom: 1px solid #333;
 }

 .tab-button {
 padding: 0.75rem 1.5rem;
 background: transparent; color: #9ca3af;
 border: none;
 border-bottom: 2px solid transparent;
 cursor: pointer;
 font-weight: 600; transition: all 0.2s;
 }

 .tab-button.active {
 color: #dc2626;
 border-bottom-color: #dc2626;
 }

 .tab-button:hover {
 color: #ffffff;
 }

 .tab-content {
 background: #1a1a2e; border: 1px solid #333;
 border-radius: 0.5rem; padding: 2rem;
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

 .detail-item label {
 color: #9ca3af;
 font-size: 0.875rem;
 font-weight: 600;
 margin-bottom: 0.5rem;
 }

 .detail-item p {
 color: #ffffff; margin: 0;
 }

 .associates-list {
 display: flex;
 flex-direction: column; gap: 1rem;
 }

 .associate-item {
 display: flex;
 justify-content: space-between;
 align-items: center; padding: 1rem;
 background: #0f0f23; border: 1px solid #333;
 border-radius: 0.375rem;
 }

 .associate-info h4 {
 color: #ffffff; margin: 0 0 0.25rem 0;
 }

 .relationship {
 color: #dc2626;
 font-size: 0.875rem; margin: 0.25rem 0;
 text-transform: capitalize;
 }

 .notes {
 color: #9ca3af;
 font-size: 0.875rem; margin: 0.5rem 0 0 0;
 }

 .btn-remove {
 padding: 0.5rem 1rem;
 background: #7f1d1d; color: #fecaca;
 border: 1px solid #dc2626;
 border-radius: 0.25rem; cursor: pointer;
 font-weight: 600; transition: background-color 0.2s;
 }

 .btn-remove:hover {
 background: #991b1b;
 }

 .empty-message,
 .placeholder {
 color: #9ca3af;
 text-align: center; padding: 2rem;
 }
</style>
