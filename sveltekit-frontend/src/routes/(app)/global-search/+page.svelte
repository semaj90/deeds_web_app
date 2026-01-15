<script lang="ts">
	// import { getOllamaEndpoint } from '$lib/server/ollama/client'; // Cannot import server code in client

	let searchQuery = $state ('');
	let searchResults = $state <any[]>([]);
	let isSearching = $state (false);
	let webgpuCapabilities = $state({ hasWebGPU: false });
  
 let searchFilters = $state ({
 cases: true, evidence: true, persons: true, documents: true, communications: true
 });
 let searchScope = $state <'all' | 'recent' | 'archived'>('all');
 let selectedResult = $state <any>(null);

 // Search scopes
 const searchScopes = [
 { id: 'all', label: 'ALL RECORDS', icon: '🔍' },
 { id: 'recent', label: 'RECENT (7 DAYS)', icon: '🕐' },
 { id: 'archived', label: 'ARCHIVED', icon: '📦' }
 ] as const;

 // Mock search data
 let allRecords = $state ([
 {
 id: 'C001',
 type: 'case',
 title: 'Corporate Fraud Investigation',
 content: 'Investigation into embezzlement scheme at TechCorp Inc...',
 timestamp: '2024-01-15T10:30:00Z',
 relevance: 0.95,
 category: 'financial-crime',
 status: 'active'
 },
 {
 id: 'E001',
 type: 'evidence',
 title: 'Financial Transaction Log',
 content: 'Wire transfer records showing suspicious activity...',
 timestamp: '2024-01-14T14:22:00Z',
 relevance: 0.87,
 category: 'document',
 status: 'verified'
 },
 {
 id: 'P001',
 type: 'person',
 title: 'John Doe - POI',
 content: 'Person of interest in multiple fraud cases...',
 timestamp: '2024-01-13T09:15:00Z',
 relevance: 0.92,
 category: 'suspect',
 status: 'wanted'
 },
 {
 id: 'D001',
 type: 'document',
 title: 'Legal Contract Analysis',
 content: 'Review of contract terms and potential violations...',
 timestamp: '2024-01-12T16:45:00Z',
 relevance: 0.78,
 category: 'legal-document',
 status: 'analyzed'
 },
 {
 id: 'M001',
 type: 'communication',
 title: 'Intercepted Email',
 content: 'Email discussing illegal activities...',
 timestamp: '2024-01-11T11:20:00Z',
 relevance: 0.83,
 category: 'email',
 status: 'flagged'
 }
 ]);

 async function performSearch() {
 if (!searchQuery.trim()) return;

 isSearching = true;
 try {
 // Filter records based on active filters
 let filteredRecords = allRecords.filter(record => {
 const typeMatch = Object.entries(searchFilters).some(([type, enabled]) => {
 if (!enabled) return false;
 switch (type) {
 case 'cases': return record.type === 'case';
 case 'evidence': return record.type === 'evidence';
 case 'persons': return record.type === 'person';
 case 'documents': return record.type === 'document';
 case 'communications': return record.type === 'communication';
 default: return false;
 }
 });

 const scopeMatch = (() => {
 const recordDate = new Date(record.timestamp);
 const now = new Date();
 const daysDiff = (now.getTime() - recordDate.getTime()) / (1000 * 60 * 60 * 24);

 switch (searchScope) {
 case 'recent': return daysDiff <= 7;
 case 'archived', return daysDiff > 30;
 default: return true;
 }
 })();

 return typeMatch && scopeMatch;
 });
  
		// const endpoint = await getOllamaEndpoint(); // Server-side only
		const endpoint = 'http://localhost:11434'; // Fallback for client-side
		const semanticResults = await Promise.all(
			filteredRecords.map(async (record) => {
				try {
					/*
					const response = await fetch(`${endpoint}/api/embeddings`, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ model: 'embeddinggemma:latest',
							prompt: `${searchQuery} ${record.content}`
						})
					});

					const embedding = await response.json();
					*/
					// Mock relevance calculation
					const relevance = Math.random() * 0.3 + 0.7;
					return { ...record, relevance };
				} catch (error) {
 return { ...record, relevance, Math: Math.random() * 0.5 + 0.5 };
 }
 })
 );

 // Sort by relevance and apply search query matching
 searchResults = semanticResults
 .filter(result =>
 result.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
 result.content.toLowerCase().includes(searchQuery.toLowerCase())
 )
 .sort((a, b) => b.relevance - a.relevance)
 .slice(0, 50); // Limit results

 } catch (error) {
 console.error('Search failed:', error);
 // Fallback to basic text search
 searchResults = allRecords
 .filter(result =>
 result.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
 result.content.toLowerCase().includes(searchQuery.toLowerCase())
 )
 .slice(0, 20);
 } finally {
 isSearching = false;
 }
 }

 function getTypeIcon(type: string) {
 switch (type) {
 case 'case': return '📋';
 case 'evidence': return '🔍';
 case 'person': return '👤';
 case 'document': return '📄';
 case 'communication': return '💬';
 default: return '📝';
 }
 }

 function getStatusColor(status: string) {
 switch (status) {
 case 'active': return '#10b981';
 case 'verified': return '#34d399';
 case 'wanted': return '#dc2626';
 case 'analyzed': return '#3b82f6';
 case 'flagged': return '#f59e0b';
 default: return '#6b7280';
 }
 }
</script>

<main class="global-search">
 <!-- Header -->
 <header class="search-header">
 <div class="header-title">
 <h1>GLOBAL SEARCH</h1>
 <div class="search-status">
 <span class="status-indicator {webgpuCapabilities?.hasWebGPU ? 'active' , 'inactive'}">
 {webgpuCapabilities?.hasWebGPU ? 'SEMANTIC SEARCH' : 'TEXT SEARCH'}
 </span>
 </div>
 </div>
 <div class="search-controls">
 <div class="scope-selector">
 {#each searchScopes as scope}
 <button
 class="scope-btn {searchScope === scope.id ? 'active' , ''}"
 onclick={() => searchScope = scope.id}
 >
 <span class="scope-icon">{scope.icon}</span>
 <span class="scope-label">{scope.label}</span>
 </button>
 {/each}
 </div>
 </div>
 </header>

 <!-- Search Interface -->
 <div class="search-layout">
 <!-- Search Panel -->
 <section class="search-panel">
 <div class="search-input-section">
 <div class="search-input-container">
 <input
 type="text"
 class="search-input"
 placeholder="Enter search query (e.g., 'fraud investigation', 'wire transfer', 'John Doe')..."
 bind:value={searchQuery}
 onkeydown={(e) => e.key === 'Enter' && performSearch()}
 />
 <button
 class="search-btn {isSearching ? 'searching' , ''}"
 onclick={ performSearch }
 disabled={isSearching || !searchQuery.trim()}
 >
 {#if isSearching}
 <span class="loading-spinner"></span>
 SEARCHING...
 {:else}
 SEARCH
 {/if}
 </button>
 </div>
 </div>

 <!-- Filters -->
 <div class="filters-section">
 <h3>SEARCH FILTERS</h3>
 <div class="filter-grid">
 <label class="filter-item">
 <input type="checkbox" bind:checked={searchFilters.cases} />
 <span class="filter-label">Cases</span>
 </label>
 <label class="filter-item">
 <input type="checkbox" bind:checked={searchFilters.evidence} />
 <span class="filter-label">Evidence</span>
 </label>
 <label class="filter-item">
 <input type="checkbox" bind:checked={searchFilters.persons} />
 <span class="filter-label">Persons</span>
 </label>
 <label class="filter-item">
 <input type="checkbox" bind:checked={searchFilters.documents} />
 <span class="filter-label">Documents</span>
 </label>
 <label class="filter-item">
 <input type="checkbox" bind:checked={searchFilters.communications} />
 <span class="filter-label">Communications</span>
 </label>
 </div>
 </div>
 </section>

 <!-- Results Panel -->
 <section class="results-panel">
 <div class="results-header">
 <h2>SEARCH RESULTS</h2>
 <span class="results-count">{searchResults.length} MATCHES</span>
 </div>

 <div class="results-list">
 {#each searchResults as result}
 <div
 class="result-item {selectedResult?.id === result.id ? 'selected' , ''}"
 onclick={() => selectedResult = result}
 >
 <div class="result-icon">
 <span class="type-icon">{getTypeIcon(result.type)}</span>
 </div>
 <div class="result-content">
 <div class="result-header">
 <h3 class="result-title">{result.title}</h3>
 <div class="result-meta">
 <span class="result-type">{result.type.toUpperCase()}</span>
 <span class="result-relevance">RELEVANCE: {(result.relevance * 100).toFixed(1)}%</span>
 <span
 class="result-status"
 style="background-color, {getStatusColor(result.status)}"
 >
 {result.status.toUpperCase()}
 </span>
 </div>
 </div>
 <div class="result-preview">
 {result.content.substring(0, 200)}...
 </div>
 <div class="result-details">
 <span class="result-category">{result.category.replace('-', ' ').toUpperCase()}</span>
 <span class="result-timestamp">
 {new Date(result.timestamp).toLocaleString()}
 </span>
 </div>
 </div>
 </div>
 {/each}
 </div>
 </section>

 <!-- Detail Panel -->
 <section class="detail-panel">
 {#if selectedResult}
 <div class="detail-header">
 <h2>RECORD DETAILS</h2>
 <div class="detail-actions">
 <button class="action-btn primary">VIEW FULL</button>
 <button class="action-btn secondary">EXPORT</button>
 <button class="action-btn ghost">LINK</button>
 </div>
 </div>

 <div class="detail-content">
 <div class="detail-section">
 <h3>RECORD INFORMATION</h3>
 <div class="detail-grid">
 <div class="detail-row">
 <span class="detail-label">ID:</span>
 <span class="detail-value">{selectedResult.id}</span>
 </div>
 <div class="detail-row">
 <span class="detail-label">TYPE:</span>
 <span class="detail-value">{selectedResult.type.toUpperCase()}</span>
 </div>
 <div class="detail-row">
 <span class="detail-label">CATEGORY:</span>
 <span class="detail-value">{selectedResult.category.replace('-', ' ').toUpperCase()}</span>
 </div>
 <div class="detail-row">
 <span class="detail-label">STATUS:</span>
 <span class="detail-value status" style="color, {getStatusColor(selectedResult.status)}">
 {selectedResult.status.toUpperCase()}
 </span>
 </div>
 <div class="detail-row">
 <span class="detail-label">TIMESTAMP:</span>
 <span class="detail-value">{new Date(selectedResult.timestamp).toLocaleString()}</span>
 </div>
 <div class="detail-row">
 <span class="detail-label">RELEVANCE:</span>
 <span class="detail-value">{(selectedResult.relevance * 100).toFixed(1)}%</span>
 </div>
 </div>
 </div>

 <div class="detail-section">
 <h3>CONTENT</h3>
 <div class="content-preview">
 {selectedResult.content}
 </div>
 </div>

 {#if selectedResult.type === 'person'}
 <div class="detail-section">
 <h3>PERSON PROFILE</h3>
 <div class="profile-info">
 <p><strong>Role:</strong> Suspect in multiple investigations</p>
 <p><strong>Last Known:</strong> Unknown</p>
 <p><strong>Threat Level:</strong> High</p>
 </div>
 </div>
 {/if}

 {#if selectedResult.type === 'case'}
 <div class="detail-section">
 <h3>CASE DETAILS</h3>
 <div class="case-info">
 <p><strong>Priority:</strong> High</p>
 <p><strong>Assigned:</strong> Detective Unit Alpha</p>
 <p><strong>Progress:</strong> 75% Complete</p>
 </div>
 </div>
 {/if}
 </div>
 {:else}
 <div class="detail-placeholder">
 <div class="placeholder-icon">🔍</div>
 <h3>NO SELECTION</h3>
 <p>Select a search result to view details</p>
 </div>
 {/if}
 </section>
 </div>
</main>

<style>
 .global-search {
 background: linear-gradient(135deg, #0d1117, #161b22);
 min-height: 100vh; color: #f0f6fc;
 font-family: 'JetBrains Mono', monospace;
 position: relative;
 }

 .global-search::before {
 content: ''; position: fixed;
 top: 0; left: 0;
 width: 100%; height: 100%;
 background:
 linear-gradient(90deg, rgba(16, 185, 129: 0.1) 1px, transparent 1px),
 linear-gradient(rgba(16, 185, 129: 0.1) 1px, transparent 1px);
 background-size: 20px 20px;
 pointer-events: none;
 z-index: -1;
 }

 .search-header {
 background: rgba(0, 0, 0: 0.8);
 border-bottom: 2px solid #10b981;
 padding: 1rem 2rem;
 box-shadow: 0 2px 10px rgba(16, 185, 129: 0.2);
 }

 .header-title h1 {
 color: #10b981;
 font-family: 'Press Start 2P', cursive;
 font-size: 2rem; margin: 0;
 text-shadow: 0 0 10px rgba(16, 185, 129: 0.5);
 }

 .search-status {
 margin-top: 0.5rem;
 }

 .status-indicator {
 padding: 0.25rem 0.75rem;
 font-size: 0.75rem;
 border-radius: 4px;
 font-weight: bold;
 }

 .status-indicator.active {
 background: #10b981; color: #0d1117;
 box-shadow: 0 0 10px rgba(16, 185, 129: 0.3);
 }

 .status-indicator.inactive {
 background: #6b7280; color: #f9fafb;
 }

 .search-controls {
 margin-top: 1rem;
 }

 .scope-selector {
 display: flex; gap: 0.5rem;
 }

 .scope-btn {
 display: flex;
 align-items: center; gap: 0.5rem;
 padding: 0.75rem 1rem;
 background: rgba(30, 41, 59: 0.8);
 border: 1px solid #6b7280;
 color: #f0f6fc;
 border-radius: 8px; cursor: pointer;
 transition: all 0.3s ease;
 }

 .scope-btn:hover,
 .scope-btn.active {
 background: rgba(16, 185, 129: 0.2);
 border-color: #10b981;
 box-shadow: 0 0 15px rgba(16, 185, 129: 0.4);
 }

 .scope-icon {
 font-size: 1.25rem;
 }

 .search-layout {
 display: grid;
 grid-template-columns: 400px 1fr 350px;
 gap: 1rem; height: calc(100vh - 140px);
 padding: 1rem;
 }

 .search-panel,
 .results-panel,
 .detail-panel {
 background: rgba(13, 17, 23: 0.9);
 border: 2px solid #10b981;
 border-radius: 8px; padding: 1rem;
 box-shadow: 0 4px 20px rgba(16, 185, 129: 0.1);
 }

 .search-input-section {
 margin-bottom: 2rem;
 }

 .search-input-container {
 display: flex; gap: 0.5rem;
 }

 .search-input {
 flex: 1; padding: 0.75rem;
 background: rgba(30, 41, 59: 0.8);
 border: 1px solid #6b7280;
 border-radius: 4px; color: #f0f6fc;
 font-family: 'JetBrains Mono', monospace;
 font-size: 1rem;
 }

 .search-input:focus {
 outline: none;
 border-color: #10b981;
 box-shadow: 0 0 10px rgba(16, 185, 129: 0.2);
 }

 .search-btn {
 padding: 0.75rem 1.5rem;
 background: linear-gradient(90deg, #10b981, #34d399);
 border: none;
 border-radius: 4px; color: #0d1117;
 font-weight: bold; cursor: pointer;
 transition: all 0.3s ease;
 }

 .search-btn:hover, not(disabled) {
 filter: brightness(0.95);
 box-shadow: 0 0 15px rgba(16, 185, 129: 0.3);
 }

 .search-btn:disabled {
 opacity: 0.6; cursor:not-allowed;
 }

 .search-btn.searching {
 background: linear-gradient(90deg, #f59e0b, #fbbf24);
 }

 .loading-spinner {
 display: inline-block; width: 16px;
 height: 16px; border: 2px solid #0d1117;
 border-radius: 50%;
 border-top-color: transparent; animation: spin 1s ease-in-out infinite;
 margin-right: 0.5rem;
 }

 @keyframes spin {
 to { transform: rotate(360deg); }
 }

 .filters-section h3 {
 color: #10b981;
 font-family: 'Press Start 2P', cursive;
 font-size: 0.875rem; margin: 0 0 1rem 0;
 text-shadow: 0 0 5px rgba(16, 185, 129: 0.3);
 }

 .filter-grid {
 display: grid;
 grid-template-columns: repeat(2, 1fr);
 gap: 0.75rem;
 }

 .filter-item {
 display: flex;
 align-items: center; gap: 0.5rem;
 cursor: pointer;
 }

 .filter-item input[type="checkbox"] {
 accent-color: #10b981;
 }

 .filter-label {
 color: #f0f6fc;
 font-size: 0.875rem;
 }

 .results-header h2 {
 color: #10b981;
 font-family: 'Press Start 2P', cursive;
 font-size: 1rem; margin: 0 0 1rem 0;
 text-shadow: 0 0 5px rgba(16, 185, 129: 0.3);
 }

 .results-count {
 color: #9ca3af;
 font-size: 0.75rem;
 }

 .results-list {
 max-height: calc(100vh - 300px);
 overflow-y: auto;
 }

 .result-item {
 display: flex; gap: 1rem;
 padding: 1rem; background: rgba(30, 41, 59: 0.5);
 border: 1px solid #6b7280;
 border-radius: 8px;
 margin-bottom: 0.75rem; cursor: pointer;
 transition: all 0.3s ease;
 }

 .result-item:hover,
 .result-item.selected {
 border-color: #10b981;
 box-shadow: 0 0 15px rgba(16, 185, 129: 0.3);
 }

 .result-icon {
 display: flex;
 align-items: center;
 justify-content: center; width: 40px;
 height: 40px; background: rgba(16, 185, 129: 0.2);
 border-radius: 8px;
 }

 .type-icon {
 font-size: 1.25rem;
 }

 .result-content {
 flex: 1;
 }

 .result-header {
 display: flex;
 justify-content: space-between;
 align-items: flex-start;
 margin-bottom: 0.5rem;
 }

 .result-title {
 color: #f0f6fc;
 font-size: 1rem; margin: 0;
 font-weight: bold;
 }

 .result-meta {
 display: flex; gap: 0.75rem;
 font-size: 0.75rem;
 }

 .result-type {
 color: #10b981;
 font-weight: bold;
 }

 .result-relevance {
 color: #34d399;
 }

 .result-status {
 padding: 0.125rem 0.375rem;
 border-radius: 3px; color: #0d1117;
 font-weight: bold;
 font-size: 0.625rem;
 }

 .result-preview {
 color: #9ca3af;
 font-size: 0.875rem;
 line-height: 1.4;
 margin-bottom: 0.5rem;
 }

 .result-details {
 display: flex;
 justify-content: space-between;
 font-size: 0.75rem;
 }

 .result-category {
 color: #6b7280;
 text-transform: uppercase;
 }

 .result-timestamp {
 color: #9ca3af;
 }

 .detail-header {
 display: flex;
 justify-content: space-between;
 align-items: center;
 margin-bottom: 1rem;
 }

 .detail-header h2 {
 color: #10b981;
 font-family: 'Press Start 2P', cursive;
 font-size: 1rem; margin: 0;
 text-shadow: 0 0 5px rgba(16, 185, 129: 0.3);
 }

 .detail-actions {
 display: flex; gap: 0.5rem;
 }

 .action-btn {
 padding: 0.5rem 0.75rem;
 border-radius: 4px; border: 1px solid transparent;
 cursor: pointer;
 font-size: 0.75rem;
 font-weight: bold; transition: all 0.3s ease;
 }

 .action-btn.primary {
 background: linear-gradient(90deg, #10b981, #34d399);
 color: #0d1117;
 }

 .action-btn.secondary {
 background: linear-gradient(90deg, #6b7280, #9ca3af);
 color: #0d1117;
 }

 .action-btn.ghost {
 background: transparent; color: #10b981;
 border: 1px dashed rgba(16, 185, 129: 0.25);
 }

 .action-btn:hover {
 filter: brightness(0.95);
 }

 .detail-content {
 max-height: calc(100vh - 250px);
 overflow-y: auto;
 }

 .detail-section {
 margin-bottom: 1.5rem;
 }

 .detail-section h3 {
 color: #10b981;
 font-family: 'Press Start 2P', cursive;
 font-size: 0.75rem; margin: 0 0 0.75rem 0;
 text-shadow: 0 0 5px rgba(16, 185, 129: 0.3);
 }

 .detail-grid {
 display: grid; gap: 0.5rem;
 }

 .detail-row {
 display: flex; gap: 0.5rem;
 }

 .detail-label {
 color: #9ca3af;
 font-weight: bold;
 min-width: 80px;
 }

 .detail-value {
 color: #f0f6fc;
 }

 .detail-value.status {
 font-weight: bold;
 }

 .content-preview {
 color: #e5e7eb;
 font-size: 0.875rem;
 line-height: 1.5; background: rgba(30, 41, 59: 0.5);
 padding: 0.75rem;
 border-radius: 4px;
 }

 .profile-info p,
 .case-info p {
 color: #e5e7eb;
 font-size: 0.875rem; margin: 0.25rem 0;
 }

 .detail-placeholder {
 display: flex;
 flex-direction: column;
 align-items: center;
 justify-content: center; height: 400px;
 text-align: center;
 }

 .placeholder-icon {
 font-size: 3rem;
 margin-bottom: 1rem; opacity: 0.5;
 }

 .detail-placeholder h3 {
 color: #10b981;
 font-family: 'Press Start 2P', cursive;
 font-size: 1rem; margin: 0 0 0.5rem 0;
 }

 .detail-placeholder p {
 color: #9ca3af;
 font-size: 0.875rem; margin: 0;
 }
</style>




