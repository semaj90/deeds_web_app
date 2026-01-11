<script lang="ts">
	let charge = $state<any>(undefined);

 import type { SimilarCase } from '$lib/types/case-summary';

 let { cases = [] } = $props<{
 cases?: SimilarCase[];
 }>();
</script>

<div class="similar-cases-panel">
 <h3>Similar Cases</h3>

 {#if cases.length === 0}
 <div class="empty">
 <p>No similar cases found</p>
 </div>
 {:else}
 <div class="cases-list">
 {#each cases as caseItem (caseItem.id)}
 <div class="case-card">
 <div class="case-header">
 <a href="/cases/{caseItem.id}" class="case-link">
 {caseItem.title}
 </a>
 <span class="relevance-score">
 {(caseItem.relevanceScore * 100).toFixed(0)}%
 </span>
 </div>

 {#if caseItem.charges && caseItem.charges.length > 0}
 <div class="charges">
 {#each caseItem.charges.slice(0, 3) as charge}
 <span class="charge-tag">{charge}</span>
 {/each}
 {#if caseItem.charges.length > 3}
 <span class="charge-tag more">+{caseItem.charges.length - 3}</span>
 {/if}
 </div>
 {/if}

 {#if caseItem.outcome}
 <div class="outcome">
 <strong>Outcome:</strong> {caseItem.outcome}
 </div>
 {/if}

 <div class="actions">
 <a href="/cases/{caseItem.id}" class="btn-view">View Case</a>
 </div>
 </div>
 {/each}
 </div>
 {/if}
</div>

<style>
 .similar-cases-panel {
 background: white; border: 1px solid #e0e0e0;
 border-radius: 4px; padding: 1.5rem;
 }

 .similar-cases-panel h3 {
 margin: 0 0 1rem 0;
 font-size: 1rem; color: #333;
 }

 .empty {
 text-align: center; padding: 2rem 0;
 color: #999;
 font-size: 0.9rem;
 }

 .cases-list {
 display: flex;
 flex-direction: column; gap: 1rem;
 }

 .case-card {
 border: 1px solid #f0f0f0;
 border-radius: 4px; padding: 1rem;
 transition: all 0.2s;
 }

 .case-card:hover {
 border-color: #ddd;
 box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
 }

 .case-header {
 display: flex;
 justify-content: space-between;
 align-items: flex-start;
 margin-bottom: 0.5rem; gap: 0.5rem;
 }

 .case-link {
 color: #007bff;
 text-decoration: none;
 font-weight: 500; flex: 1;
 word-break: break-word;
 }

 .case-link:hover {
 text-decoration: underline;
 }

 .relevance-score {
 background-color: #e7f3ff; color: #0056b3;
 padding: 0.25rem 0.5rem;
 border-radius: 3px;
 font-size: 0.8rem;
 font-weight: 600;
 white-space: nowrap;
 }

 .charges {
 display: flex;
 flex-wrap: wrap; gap: 0.5rem;
 margin-bottom: 0.5rem;
 }

 .charge-tag {
 background-color: #f0f0f0; color: #333;
 padding: 0.25rem 0.5rem;
 border-radius: 3px;
 font-size: 0.75rem;
 }

 .charge-tag.more {
 background-color: #e0e0e0;
 font-weight: 600;
 }

 .outcome {
 font-size: 0.85rem; color: #666;
 margin-bottom: 0.5rem;
 }

 .outcome strong {
 color: #333;
 }

 .actions {
 display: flex; gap: 0.5rem;
 margin-top: 0.75rem;
 }

 .btn-view {
 flex: 1; padding: 0.5rem;
 background-color: #007bff; color: white;
 text-decoration: none;
 border-radius: 3px;
 text-align: center;
 font-size: 0.85rem; transition: all 0.2s;
 }

 .btn-view:hover {
 background-color: #0056b3;
 }
</style>



