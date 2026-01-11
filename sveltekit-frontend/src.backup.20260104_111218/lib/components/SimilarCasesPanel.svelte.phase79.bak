<script lang="ts">
 import { onMount } from 'svelte';

 let { caseId } = $props<{
 caseId: string;
 }>();

 interface SimilarCase {
 caseId: string;
 caseNumber: string;
 charges: string[];
 outcome: string;
 relevanceScore: number;
 matchedCharges: string[];
 precedentRank: number;
 }

 let cases: SimilarCase[] = [];
 let isLoading = true;
 let error: string | null = null;
 let limit = 5;
 let minRelevance = 0.5;
 let sortBy: 'relevance' | 'rank' = 'relevance';

 onMount(() => {
 (async () => {
 await loadSimilarCases();
 })();
 });

 async function loadSimilarCases() {
 isLoading = true;
 error = null;

 try {
 const params = new URLSearchParams({
 limit: limit.toString(),
 minRelevance: minRelevance.toString(),
 });

 const response = await fetch(`/api/cases/${caseId}/summary/similar?${params}`);

 if (response.ok) {
 const data = await response.json();
 if (data.success) {
 cases = data.cases;
 } else {
 error = data.error || 'Failed to load similar cases';
 }
 } else {
 error = 'Failed to load similar cases';
 }
 } catch (err) {
 error = err instanceof Error ? err.message : 'An error occurred';
 } finally {
 isLoading = false;
 }
 }

 function getSortedCases(): SimilarCase[] {
 const sorted = [...cases];
 if (sortBy === 'relevance') {
 sorted.sort((a, b) => b.relevanceScore - a.relevanceScore);
 } else {
 sorted.sort((a, b) => a.precedentRank - b.precedentRank);
 }
 return sorted;
 }

 function getRelevanceColor(score: number): string {
 if (score >= 0.8) return '#10b981'; // green
 if (score >= 0.6) return '#f59e0b'; // amber
 return '#ef4444'; // red
 }

 function getOutcomeColor(outcome: string): string {
 const lower = outcome.toLowerCase();
 if (lower.includes('guilty') || lower.includes('convicted')) return '#ef4444';
 if (lower.includes('not guilty') || lower.includes('acquitted')) return '#10b981';
 return '#6b7280';
 }

 function navigateToCase(caseNumber: string) {
 window.location.href = `/cases/${caseNumber}`;
 }
</script>

<div class="similar-cases-panel">
 <div class="panel-header">
 <h2>Similar Cases</h2>
 <div class="controls">
 <div class="control-group">
 <label for="limit">Limit:</label>
 <select id="limit" bind:value={limit} onchange={loadSimilarCases}>
 <option value={3}>3</option>
 <option value={5}>5</option>
 <option value={10}>10</option>
 <option value={20}>20</option>
 </select>
 </div>

 <div class="control-group">
 <label for="minRelevance">Min Relevance:</label>
 <input
 id="minRelevance"
 type="range"
 min="0"
 max="1"
 step="0.1"
 bind:value={minRelevance}
 onchange={loadSimilarCases}
 />
 <span class="relevance-value">{(minRelevance * 100).toFixed(0)}%</span>
 </div>

 <div class="control-group">
 <label for="sortBy">Sort by:</label>
 <select id="sortBy" bind:value={sortBy}>
 <option value="relevance">Relevance</option>
 <option value="rank">Rank</option>
 </select>
 </div>
 </div>
 </div>

 {#if isLoading}
 <div class="loading">
 <div class="spinner"></div>
 <p>Loading similar cases...</p>
 </div>
 {:else if error}
 <div class="error">
 <p>{error}</p>
 <button onclick={loadSimilarCases}>Retry</button>
 </div>
 {:else if cases.length === 0}
 <div class="no-cases">
 <p>No similar cases found</p>
 </div>
 {:else}
 <div class="cases-list">
 {#each getSortedCases() as caseItem (caseItem.caseId)}
 <div class="case-card">
 <div class="card-header">
 <button
 class="case-number"
 onclick={() => navigateToCase(caseItem.caseNumber)}
 >
 {caseItem.caseNumber}
 </button>
 <div class="relevance-badge" style="background-color: {getRelevanceColor(caseItem.relevanceScore)}">
 {(caseItem.relevanceScore * 100).toFixed(0)}%
 </div>
 </div>

 <div class="card-content">
 <div class="info-row">
 <label for="$1">$1</label>
 <span class="rank-badge">#{caseItem.precedentRank}</span>
 </div>

 <div class="info-row">
 <label for="$1">$1</label>
 <span
 class="outcome-badge"
 style="background-color: {getOutcomeColor(caseItem.outcome)}"
 >
 {caseItem.outcome}
 </span>
 </div>

 {#if caseItem.charges && caseItem.charges.length > 0}
 <div class="info-row">
 <label for="$1">$1</label>
 <div class="charges">
 {#each caseItem.charges as charge}
 <span class="charge-tag">{charge}</span>
 {/each}
 </div>
 </div>
 {/if}

 {#if caseItem.matchedCharges && caseItem.matchedCharges.length > 0}
 <div class="info-row">
 <label for="$1">$1</label>
 <div class="matched-charges">
 {#each caseItem.matchedCharges as charge}
 <span class="matched-charge-tag">{charge}</span>
 {/each}
 </div>
 </div>
 {/if}
 </div>

 <div class="card-footer">
 <button
 class="btn-view"
 onclick={() => navigateToCase(caseItem.caseNumber)}
 >
 View Case
 </button>
 </div>
 </div>
 {/each}
 </div>

 <div class="panel-footer">
 <p>Showing {cases.length} of {cases.length} similar cases</p>
 </div>
 {/if}
</div>

<style>
 .similar-cases-panel {
 background-color: white;
 border-radius: 8px;
 border: 1px solid #e0e0e0;
 overflow: hidden;
 }

 .panel-header {
 padding: 1.5rem;
 border-bottom: 1px solid #e0e0e0;
 background-color: #f9fafb;
 }

 .panel-header h2 {
 margin: 0 0 1rem 0;
 font-size: 1.5rem;
 color: #1f2937;
 }

 .controls {
 display: flex;
 gap: 1.5rem;
 flex-wrap: wrap;
 }

 .control-group {
 display: flex;
 align-items: center;
 gap: 0.5rem;
 }

 .control-group label {
 font-size: 0.875rem;
 font-weight: 500;
 color: #6b7280;
 }

 .control-group select,
 .control-group input {
 padding: 0.375rem 0.5rem;
 border: 1px solid #d1d5db;
 border-radius: 4px;
 font-size: 0.875rem;
 }

 .control-group select:focus,
 .control-group input:focus {
 outline: none;
 border-color: #2563eb;
 box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
 }

 .relevance-value {
 font-size: 0.875rem;
 color: #6b7280;
 min-width: 40px;
 }

 .loading {
 display: flex;
 flex-direction: column;
 align-items: center;
 justify-content: center;
 min-height: 300px;
 gap: 1rem;
 }

 .spinner {
 width: 40px;
 height: 40px;
 border: 4px solid #e0e0e0;
 border-top-color: #2563eb;
 border-radius: 50%;
 animation: spin 1s linear infinite;
 }

 @keyframes spin {
 to {
 transform: rotate(360deg);
 }
 }

 .error {
 padding: 2rem;
 text-align: center;
 color: #dc2626;
 }

 .error button {
 margin-top: 1rem;
 padding: 0.5rem 1rem;
 background-color: #dc2626;
 color: white;
 border: none;
 border-radius: 4px;
 cursor: pointer;
 }

 .error button:hover {
 background-color: #b91c1c;
 }

 .no-cases {
 padding: 2rem;
 text-align: center;
 color: #6b7280;
 }

 .cases-list {
 padding: 1.5rem;
 display: grid;
 grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
 gap: 1rem;
 }

 .case-card {
 border: 1px solid #e0e0e0;
 border-radius: 8px;
 overflow: hidden;
 transition: all 0.2s;
 display: flex;
 flex-direction: column;
 }

 .case-card:hover {
 border-color: #2563eb;
 box-shadow: 0 4px 12px rgba(37, 99, 235, 0.1);
 }

 .card-header {
 display: flex;
 justify-content: space-between;
 align-items: center;
 padding: 1rem;
 background-color: #f9fafb;
 border-bottom: 1px solid #e0e0e0;
 }

 .case-number {
 background: none;
 border: none;
 color: #2563eb;
 font-size: 1rem;
 font-weight: 600;
 cursor: pointer;
 text-decoration: none;
 }

 .case-number:hover {
 text-decoration: underline;
 }

 .relevance-badge {
 color: white;
 padding: 0.25rem 0.75rem;
 border-radius: 20px;
 font-size: 0.875rem;
 font-weight: 600;
 }

 .card-content {
 padding: 1rem;
 flex: 1;
 }

 .info-row {
 display: flex;
 gap: 0.75rem;
 margin-bottom: 0.75rem;
 align-items: flex-start;
 }

 .info-row label {
 font-weight: 600;
 color: #6b7280;
 font-size: 0.875rem;
 min-width: 100px;
 }

 .rank-badge {
 background-color: #f3f4f6;
 color: #1f2937;
 padding: 0.25rem 0.5rem;
 border-radius: 4px;
 font-weight: 600;
 font-size: 0.875rem;
 }

 .outcome-badge {
 color: white;
 padding: 0.25rem 0.75rem;
 border-radius: 4px;
 font-size: 0.875rem;
 font-weight: 500;
 }

 .charges {
 display: flex;
 flex-wrap: wrap;
 gap: 0.5rem;
 }

 .charge-tag {
 background-color: #eff6ff;
 color: #1e40af;
 padding: 0.25rem 0.5rem;
 border-radius: 4px;
 font-size: 0.75rem;
 font-weight: 500;
 }

 .matched-charges {
 display: flex;
 flex-wrap: wrap;
 gap: 0.5rem;
 }

 .matched-charge-tag {
 background-color: #dcfce7;
 color: #166534;
 padding: 0.25rem 0.5rem;
 border-radius: 4px;
 font-size: 0.75rem;
 font-weight: 500;
 }

 .card-footer {
 padding: 1rem;
 border-top: 1px solid #e0e0e0;
 background-color: #f9fafb;
 }

 .btn-view {
 width: 100%;
 padding: 0.5rem;
 background-color: #2563eb;
 color: white;
 border: none;
 border-radius: 4px;
 font-size: 0.875rem;
 font-weight: 500;
 cursor: pointer;
 transition: background-color 0.2s;
 }

 .btn-view:hover {
 background-color: #1d4ed8;
 }

 .panel-footer {
 padding: 1rem 1.5rem;
 border-top: 1px solid #e0e0e0;
 background-color: #f9fafb;
 text-align: center;
 color: #6b7280;
 font-size: 0.875rem;
 }
</style>
