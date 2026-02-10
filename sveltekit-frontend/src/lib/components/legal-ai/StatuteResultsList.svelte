<script lang="ts">interface Statute {
 id: string;
	code: string;
 title?: string;
 jurisdiction?: string;
 severity?: string;
 category?: string;
 relevance_score?: number;
 }

 let { statutes = [], error = null, isLoading = false } = $props<{
 statutes?: Statute[];
 error?: string | null;
 isLoading?: boolean;
 }>();function selectStatute(statute: Statute) {
 onselect?.(statute);
 }

 function getRelevanceColor(score?: number) {
 if (!score) return '#999';
 if (score >= 0.8) return '#44ff44';
 if (score >= 0.6) return '#ffd700';
 return '#ff6b6b';
 }
</script>

<div class="statute-results">
 {#if isLoading}
 <div class="loading">
 <div class="spinner"></div>
 <p>Searching statutes...</p>
 </div>
 {:else if error}
 <div class="error">
 <p>{ error }</p>
 </div>
 {:else if statutes.length === 0}
 <div class="empty">
 <p>No statutes found. Try a different search.</p>
 </div>
 {:else}
 <div class="results-header">
 <h3>Found {statutes.length} statute{statutes.length !== 1 ? 's' : ''}</h3>
 </div>

 <div class="results-list">
 {#each statutes as statute (statute.id)}
 <button class="result-item" onclick={() => selectStatute(statute)}>
 <div class="result-header">
 <span class="code">{statute.code}</span>
 {#if statute.relevance_score}
 <span
 class="relevance"
 style="background-color: {getRelevanceColor(statute.relevance_score)}"
 >
 {(statute.relevance_score * 100).toFixed(0)}%
 </span>
 {/if}
 </div>

 {#if statute.title}
 <div class="title">{statute.title}</div>
 {/if}

 <div class="meta">
 {#if statute.jurisdiction}
 <span class="badge jurisdiction">{statute.jurisdiction}</span>
 {/if}
 {#if statute.severity}
 <span class="badge severity">{statute.severity}</span>
 {/if}
 {#if statute.category}
 <span class="badge category">{statute.category}</span>
 {/if}
 </div>
 </button>
 {/each}
 </div>
 {/if}
</div>

<style>
 .statute-results {
 display: flex;
 flex-direction: column;
	gap: 1rem;
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
 width: 40px;
	height: 40px;
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

 .results-header {
 padding: 0.5rem 0;
 border-bottom: 1px solid #d4a574;
 }

 .results-header h3 {
 margin: 0;
 font-size: 0.95rem;
	color: #666;
 }

 .results-list {
 display: flex;
 flex-direction: column;
	gap: 0.75rem;
 }

 .result-item {
 padding: 1rem;
 background-color: white;
	border: 1px solid #e0d5c7;
 border-radius: 6px;
 text-align: left;
	cursor: pointer;
 transition:all 0.2s;
 }

 .result-item:hover {
 border-color: #d4a574;
 box-shadow: 0 2px 8px rgba(139, 69, 19, 0.1);
 }

 .result-header {
 display: flex;
 justify-content: space-between;
 align-items: center;
 margin-bottom: 0.5rem;
 }

 .code {
 font-family: 'Monaco', 'Courier New', monospace;
 font-size: 0.9rem;
 font-weight: 600;
	color: #8b4513;
 }

 .relevance {
 padding: 0.25rem 0.5rem;
 border-radius: 3px;
 font-size: 0.75rem;
 font-weight: 600;
	color: white;
 }

 .title {
 font-size: 0.95rem;
	color: #333;
 margin-bottom: 0.5rem;
 line-height: 1.3;
 }

 .meta {
 display: flex;
	gap: 0.5rem;
 flex-wrap: wrap;
 }

 .badge {
 padding: 0.2rem 0.5rem;
 border-radius: 3px;
 font-size: 0.7rem;
 font-weight: 600;
	color: white;
 }

 .badge.jurisdiction {
 background-color: #8b4513;
 }

 .badge.severity {
 background-color: #d4a574;
 }

 .badge.category {
 background-color: #666;
 }
</style>



