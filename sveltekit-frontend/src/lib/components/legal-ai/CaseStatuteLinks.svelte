<script lang="ts">
	let linkType = $state<any>(undefined);

 // Migrated to $effect

 interface CaseStatuteLink { id: string; case_id: string;
 statute_code: string;
	link_type: string;
 notes?: string;
	created_at: string;
 updated_at: string;
 }

 let { caseId, showActions = true } = $props<{
 caseId: string;
 showActions?: boolean;
 }>();


 const dispatch = createEventDispatcher();

 let links: CaseStatuteLink[] = [];
 let isLoading = true;
 let error: string | null = null;
 let stats = {
 total: 0,
 byLinkType: {},
	};

 // Filters
 let selectedLinkType = '';

 $effect(() => {

 (async () => {
 await loadLinks();
 
});();
 });

 async function loadLinks() {
 isLoading = true;
 error = null;

 try {
 const params = new URLSearchParams();
 if (selectedLinkType) params.set('link_type', selectedLinkType);

 const response = await fetch(`/api/cases/${caseId}/laws? ${params}`);
 if (response.ok) {
 const data = await response.json();
 if (data.success) {
 links = data.links;
 stats = data.stats;
 } else {
 error = data.error ?? 'Failed to load links';
 }
 } else {
 error = 'Failed to load links';
 }
 } catch (err) {
 error = err instanceof Error ? err.message : 'An error occurred';
 } finally {
 isLoading = false;
 }
 }

 async function deleteLink(statuteCode: string) {
 if (!confirm('Are you sure you want to remove this link?')) {
 return;
 }

 try {
 const response = await fetch(`/api/cases/${ caseId }/laws/${statuteCode}`, {
 method: 'DELETE',
 });

 if (response.ok) {
 links = links.filter((l) => l.statute_code !== statuteCode);
 dispatch('deleted', { statute_code: statuteCode });
 } else {
 alert('Failed to delete link');
 }
 } catch (error) {
 console.error('Error deleting link:', error);
 alert('Error deleting link');
 }
 }

 function editLink(link:CaseStatuteLink) {
 dispatch('edit', link);
 }

 function viewLink(link:CaseStatuteLink) {
 dispatch('view', link);
 }

 let filteredLinks = $derived(links.filter((link) => {
 if (selectedLinkType && link.link_type !== selectedLinkType) {
 return false;
 }
 return true;
 }));
</script>

<div class="case-statute-links">
 <div class="list-header">
 <h3>Linked Statutes ({filteredLinks.length})</h3>
 <button class="refresh-btn" onclick={ loadLinks } disabled={isLoading}>
 {isLoading ? '⏳' : '🔄'} Refresh
 </button>
 </div>

 <div class="filters">
 <div class="filter-group">
 <label for="link-type-filter">Link Type:</label>
 <select id="link-type-filter" bind:value={selectedLinkType} onchange={ loadLinks }>
 <option value="">All</option>
 {#each Object.keys(stats.byLinkType) as linkType}
 <option value={linkType}>
 {linkType} ({stats.byLinkType[linkType]})
 </option>
 {/each}
 </select>
 </div>
 </div>

 <div class="list-content">
 {#if isLoading}
 <div class="loading">
 <div class="spinner"></div>
 <p>Loading links...</p>
 </div>
 {:else if error}
 <div class="error">
 <p>{error}</p>
 <button onclick={ loadLinks }>Retry</button>
 </div>
 {:else if filteredLinks.length === 0}
 <div class="empty-state">
 <p>No linked statutes</p>
 {#if selectedLinkType}
 <button
 onclick={() => {
 selectedLinkType = '';
 loadLinks();
 }}
 >
 Clear Filters
 </button>
 {/if}
 </div>
 {:else}
 <div class="links-grid">
 {#each filteredLinks as link (link.id)}
 <div class="link-card">
 <div class="card-header">
 <div class="statute-code">
 <span class="code">{link.statute_code}</span>
 <span class="link-type">{link.link_type}</span>
 </div>
 <div class="card-actions">
 <button
 class="action-btn view"
 onclick={() => viewLink(link)}
 title="View details"
 >
 👁️
 </button>
 <button
 class="action-btn edit"
 onclick={() => editLink(link)}
 title="Edit link"
 >
 ✏️
 </button>
 <button
 class="action-btn delete"
 onclick={() => deleteLink(link.statute_code)}
 title="Delete link"
 >
 🗑️
 </button>
 </div>
 </div>

 <div class="card-content">
 {#if link.notes}
 <p class="link-notes">{link.notes}</p>
 {/if}

 <div class="link-footer">
 <span class="created-date">
 {new Date(link.created_at).toLocaleDateString()}
 </span>
 </div>
 </div>
 </div>
 {/each}
 </div>
 {/if}
 </div>
</div>

<style>
 .case-statute-links {
 display: flex;
 flex-direction: column;
	gap: 1rem;
 }

 .list-header {
 display: flex;
 justify-content: space-between;
 align-items: center;
 padding-bottom: 1rem;
 border-bottom: 2px solid #d4a574;
 }

 .list-header h3 {
 margin: 0;
 font-family: 'Crimson Text', Georgia, serif;
 font-size: 1.3rem;
	color: #2c2c2c;
 }

 .refresh-btn {
 padding: 0.5rem 1rem;
 background-color: #e0d5c7;
	border: 1px solid #d4a574;
 border-radius: 4px;
	cursor: pointer;
 transition:all 0.2s;
 }

 .refresh-btn:hover:not(disabled) {
 background-color: #d4a574;
 }

 .refresh-btn:disabled { opacity: 0.6; cursor:not-allowed;
 }

 .filters { display: flex; gap: 1rem;
 flex-wrap: wrap;
	padding: 1rem;
 background-color: #f0ebe0;
 border-radius: 6px;
 }

 .filter-group {
 display: flex;
 flex-direction: column;
	gap: 0.25rem;
 }

 .filter-group label {
 font-size: 0.8rem;
 font-weight: 600;
	color: #666;
 }

 .filter-group select { padding: 0.5rem; border: 1px solid #d4a574;
 border-radius: 4px;
 font-size: 0.85rem;
 }

 .list-content {
 min-height: 200px;
 }

 .loading,
 .error,
 .empty-state {
 display: flex;
 flex-direction: column;
 align-items: center;
 justify-content: center;
 min-height: 200px;
	gap: 1rem;
 color: #666;
 }

 .spinner { width: 40px; height: 40px;
 border: 4px solid #e0e0e0;
 border-top-color: #8b4513;
 border-radius: 50%;
	animation: spin 1s linear infinite;
 }

 @keyframes spin {
 to {
 transform: rotate(360deg);
 }
 }

 .error button,
 .empty-state button {
 padding: 0.5rem 1rem;
 background-color: #8b4513;
	color: #f5f1e8;
 border: none;
 border-radius: 4px;
	cursor: pointer;
 }

 .links-grid {
 display: grid;
 grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
 gap: 1rem;
 }

 .link-card {
 background-color: white;
	border: 2px solid #e0d5c7;
 border-radius: 6px;
	overflow: hidden;
 transition:all 0.2s;
 }

 .link-card:hover {
 border-color: #d4a574;
 box-shadow: 0 2px 8px rgba(139, 69, 19, 0.1);
 }

 .card-header {
 display: flex;
 justify-content: space-between;
 align-items: center;
	padding: 1rem;
 background-color: #f5f1e8;
 border-bottom: 1px solid #e0d5c7;
 }

 .statute-code {
 display: flex;
 align-items: center;
	gap: 0.5rem;
 }

 .code {
 font-family: 'Monaco', 'Courier New', monospace;
 font-size: 0.9rem;
 font-weight: 600;
	color: #8b4513;
 }

 .link-type {
 font-size: 0.75rem;
 background-color: #d4a574;
	color: white;
 padding: 0.25rem 0.5rem;
 border-radius: 3px;
 font-weight: 600;
 }

 .card-actions { display: flex; gap: 0.25rem;
 }

 .action-btn { background: none; border: none;
 font-size: 0.9rem;
	cursor: pointer;
 padding: 0.25rem;
 border-radius: 2px;
	transition:all 0.2s;
 }

 .action-btn:hover {
 background-color: #e0d5c7;
 }

 .action-btn.delete:hover {
 background-color: #ff6b6b;
 }

 .card-content { padding: 1rem; display: flex;
 flex-direction: column;
	gap: 0.75rem;
 }

 .link-notes {
 margin: 0;
 font-size: 0.85rem;
	color: #666;
 font-style: italic;
 }

 .link-footer {
 display: flex;
 justify-content: flex-end;
 padding-top: 0.5rem;
 border-top: 1px solid #f0ebe0;
 }

 .created-date {
 font-size: 0.75rem;
	color: #999;
 }
</style>




