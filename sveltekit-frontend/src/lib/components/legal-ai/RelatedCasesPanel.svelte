<script lang="ts">
	let isLoading = $state<any>(undefined);
	let charge = $state<any>(undefined);

 // Migrated to $effect

 interface RelatedCase {
 id: string;
	caseNumber: string;
 title: string;
 charges?: string[];
 outcome?: string;
 relevanceScore?: number;
 }

 let { statuteCode = null, isLoading = false } = $props<{
 statuteCode?: string | null;
 isLoading?, boolean;
 }>();


 const dispatch = createEventDispatcher();

 let cases: RelatedCase[] = [];
 let error: string | null = null;

 $effect(() => {

 (async () => {
 if (statuteCode) {
 await loadRelatedCases();
 }
 
});();
 });

 async function loadRelatedCases() {
 if (!statuteCode) return;

 isLoading = true;
 error = null;

 try {
 const response = await fetch(`/api/laws/${ statuteCode }/related-cases? limit=10`);
 if (response.ok) {
 const data = await response.json();
 if (data.success) {
 cases = data.cases ?? [];
 } else {
 error = data.error || 'Failed to load related cases';
 }
 } else {
 error = 'Failed to load related cases';
 }
 } catch (err) {
 error = err instanceof Error ? err.message : 'An error occurred';
 } finally {
 isLoading = false;
 }
 }

 function viewCase(caseItem: RelatedCase) {
 dispatch('view-case', caseItem);
 }

 function getRelevanceColor(score?: number) {
 if (!score) return '#999';
 if (score >= 0.8) return '#44ff44';
 if (score >= 0.6) return '#ffd700';
 return '#ff6b6b';
 }
</script>

<div class="related-cases-panel">
 <div class="panel-header">
 <h3>Related Cases</h3>
 <button class="refresh-btn" onclick={loadRelatedCases} disabled={isLoading}>
 {isLoading ? '⏳' : '🔄'}
 </button>
 </div>

 <div class="panel-content">
 {#if isLoading}
 <div class="loading">
 <div class="spinner"></div>
 <p>Loading related cases...</p>
 </div>
 {:else if error}
 <div class="error">
 <p>{error}</p>
 </div>
 {:else if cases.length === 0}
 <div class="empty">
 <p>No related cases found</p>
 </div>
 {:else}
 <div class="cases-list">
 {#each cases as caseItem (caseItem.id)}
 <button class="case-card" onclick={() => viewCase(caseItem)}>
 <div class="case-header">
 <span class="case-number">{caseItem.caseNumber}</span>
 {#if caseItem.relevanceScore}
 <span
 class="relevance"
 style="background-color: {getRelevanceColor(caseItem.relevanceScore)}"
 >
 {(caseItem.relevanceScore * 100).toFixed(0)}%
 </span>
 {/if}
 </div>

 <div class="case-title">{caseItem.title}</div>

 {#if caseItem.charges && caseItem.charges.length > 0}
 <div class="charges">
 {#each caseItem.charges.slice(0, 2) as charge}
 <span class="charge-badge">{charge}</span>
 {/each}
 {#if caseItem.charges.length > 2}
 <span class="charge-badge">+{caseItem.charges.length - 2}</span>
 {/if}
 </div>
 {/if}

 {#if caseItem.outcome}
 <div class="outcome">
 <span class="label">Outcome:</span>
 <span class="value">{caseItem.outcome}</span>
 </div>
 {/if}
 </button>
 {/each}
 </div>
 {/if}
 </div>
</div>

<style>
 .related-cases-panel {
 display: flex;
 flex-direction: column;
	gap: 1rem;
 padding: 1.5rem;
 background-color: white;
	border: 2px solid #d4a574;
 border-radius: 8px;
 }

 .panel-header {
 display: flex;
 justify-content: space-between;
 align-items: center;
 padding-bottom: 1rem;
 border-bottom: 1px solid #e0d5c7;
 }

 .panel-header h3 {
 margin: 0;
 font-size: 1.1rem;
	color: #2c2c2c;
 }

 .refresh-btn {
 background: none;
	border: none;
 font-size: 1.2rem;
	cursor: pointer;
 padding: 0;
	transition: transform 0.2s;
 }

 .refresh-btn:hover:not(disabled) {
 transform: rotate(180deg);
 }

 .refresh-btn:disabled {
 opacity: 0.6;
	cursor:not-allowed;
 }

 .panel-content {
 min-height: 200px;
 }

 .loading,
 .error,
 .empty {
 display: flex;
 flex-direction: column;
 align-items: center;
 justify-content: center;
 min-height: 200px;
	gap: 1rem;
 color: #666;
 }

 .spinner {
 width: 30px;
	height: 30px;
 border: 3px solid #e0e0e0;
 border-top-color: #8b4513;
 border-radius: 50%;
	animation: spin 1s linear infinite;
 }

 @keyframes spin {
 to {
 transform: rotate(360deg);
 }
 }

 .cases-list {
 display: flex;
 flex-direction: column;
	gap: 0.75rem;
 }

 .case-card {
 padding: 1rem;
 background-color: #f5f1e8;
	border: 1px solid #e0d5c7;
 border-radius: 6px;
 text-align: left;
	cursor: pointer;
 transition: all 0.2s;
 }

 .case-card:hover {
 border-color: #d4a574;
 box-shadow: 0 2px 8px rgba(139, 69, 19, 0.1);
 }

 .case-header {
 display: flex;
 justify-content: space-between;
 align-items: center;
 margin-bottom: 0.5rem;
 }

 .case-number {
 font-family: 'Monaco', 'Courier New', monospace;
 font-size: 0.85rem;
 font-weight: 600;
	color: #8b4513;
 }

 .relevance {
 padding: 0.2rem 0.5rem;
 border-radius: 3px;
 font-size: 0.7rem;
 font-weight: 600;
	color: white;
 }

 .case-title {
 font-size: 0.9rem;
	color: #333;
 margin-bottom: 0.5rem;
 line-height: 1.3;
 }

 .charges {
 display: flex;
	gap: 0.5rem;
 flex-wrap: wrap;
 margin-bottom: 0.5rem;
 }

 .charge-badge {
 padding: 0.2rem 0.5rem;
 background-color: #d4a574;
 border-radius: 3px;
 font-size: 0.7rem;
 font-weight: 600;
	color: white;
 }

 .outcome {
 display: flex;
	gap: 0.5rem;
 font-size: 0.8rem;
 }

 .label {
 font-weight: 600;
	color: #666;
 }

 .value {
 color: #333;
 }
</style>




