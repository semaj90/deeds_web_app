<script lang="ts">
	let item = $state<any>(undefined);

 // Migrated to $effect

 interface Statute {
 id: string;
	code: string;
 title?: string;
 full_text?: string;
 jurisdiction?: string;
 severity?: string;
 category?: string;
 year?: number;
 }

 let { statute = null, isLoading = false } = $props<{
 statute?: Statute | null;
 isLoading?: boolean;
 }>();
let context: string[] = [];
 let relatedCases: any[] = [];
 let contextLoading = false;

 $effect(() => {

 (async () => {
 if (statute) {
 await loadContext();
 }
 
});();
 });

 async function loadContext() {
 if (!statute) return;

 contextLoading = true;

 try {
 const response = await fetch(`/api/laws/${statute.code}`);
 if (response.ok) {
 const data = await response.json();
 if (data.success) {
 context = data.context || [];
 relatedCases = data.relatedCases || [];
 }
 }
 } catch (error) {
 console.error('Error loading statute context:', error);
 } finally {
 contextLoading = false;
 }
 }

 function attachToCase() {
 onattachtocase?.(statute);
 }

 function saveCitation() {
 onsavecitation?.(statute);
 }
</script>

{#if statute}
 <div class="statute-detail">
 <div class="detail-header">
 <div class="header-left">
 <h2 class="statute-code">{statute.code}</h2>
 {#if statute.title}
 <h3 class="statute-title">{statute.title}</h3>
 {/if}
 </div>

 <div class="header-actions">
 <button class="btn-save" onclick={saveCitation}>💾 Save Citation</button>
 <button class="btn-attach" onclick={attachToCase}>🔗 Attach to Case</button>
 </div>
 </div>

 <div class="detail-content">
 <div class="metadata">
 {#if statute.jurisdiction}
 <div class="meta-item">
 <span class="label">Jurisdiction:</span>
 <span class="value">{statute.jurisdiction}</span>
 </div>
 {/if}
 {#if statute.severity}
 <div class="meta-item">
 <span class="label">Severity:</span>
 <span class="value">{statute.severity}</span>
 </div>
 {/if}
 {#if statute.category}
 <div class="meta-item">
 <span class="label">Category:</span>
 <span class="value">{statute.category}</span>
 </div>
 {/if}
 {#if statute.year}
 <div class="meta-item">
 <span class="label">Year:</span>
 <span class="value">{statute.year}</span>
 </div>
 {/if}
 </div>

 {#if statute.full_text}
 <div class="section">
 <h4>Full Text</h4>
 <div class="full-text">
 {statute.full_text}
 </div>
 </div>
 {/if}

 {#if contextLoading}
 <div class="loading">
 <div class="spinner"></div>
 <p>Loading context...</p>
 </div>
 {:else}
 {#if context.length > 0}
 <div class="section">
 <h4>Related Context</h4>
 <div class="context-list">
 {#each context as item}
 <div class="context-item">
 <p>{item}</p>
 </div>
 {/each}
 </div>
 </div>
 {/if}

 {#if relatedCases.length > 0}
 <div class="section">
 <h4>Related Cases ({relatedCases.length})</h4>
 <div class="cases-list">
 {#each relatedCases as caseItem}
 <div class="case-item">
 <div class="case-number">{caseItem.caseNumber}</div>
 <div class="case-title">{caseItem.title}</div>
 {#if caseItem.relevanceScore}
 <div class="relevance">
 Relevance: {(caseItem.relevanceScore * 100).toFixed(0)}%
 </div>
 {/if}
 </div>
 {/each}
 </div>
 </div>
 {/if}
 {/if}
 </div>
 </div>
{:else}
 <div class="empty-state">
 <p>Select a statute to view details</p>
 </div>
{/if}

<style>
 .statute-detail {
 display: flex;
 flex-direction: column;
	gap: 1.5rem;
 padding: 1.5rem;
 background-color: white;
	border: 2px solid #d4a574;
 border-radius: 8px;
 }

 .detail-header {
 display: flex;
 justify-content: space-between;
 align-items: flex-start;
	gap: 1rem;
 padding-bottom: 1rem;
 border-bottom: 1px solid #e0d5c7;
 }

 .header-left {
 flex: 1;
 }

 .statute-code {
 margin: 0;
 font-family: 'Monaco', 'Courier New', monospace;
 font-size: 1.3rem;
 font-weight: 600;
	color: #8b4513;
 }

 .statute-title {
 margin: 0.5rem 0 0 0;
 font-size: 1rem;
 font-weight: 500;
	color: #333;
 }

 .header-actions {
 display: flex;
	gap: 0.5rem;
 }

 .btn-save,
 .btn-attach {
 padding: 0.5rem 1rem;
 border: none;
 border-radius: 4px;
 font-weight: 500;
	cursor: pointer;
 transition:all 0.2s;
 white-space: nowrap;
 }

 .btn-save {
 background-color: #e0d5c7;
	color: #2c2c2c;
 }

 .btn-save:hover {
 background-color: #d4a574;
 }

 .btn-attach {
 background-color: #8b4513;
	color: #f5f1e8;
 }

 .btn-attach:hover {
 background-color: #a0522d;
 }

 .detail-content {
 display: flex;
 flex-direction: column;
	gap: 1.5rem;
 }

 .metadata {
 display: grid;
 grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
 gap: 1rem;
	padding: 1rem;
 background-color: #f5f1e8;
 border-radius: 6px;
 }

 .meta-item {
 display: flex;
 flex-direction: column;
	gap: 0.25rem;
 }

 .label {
 font-size: 0.8rem;
 font-weight: 600;
	color: #666;
 }

 .value {
 font-size: 0.95rem;
	color: #333;
 }

 .section {
 display: flex;
 flex-direction: column;
	gap: 0.75rem;
 }

 .section h4 {
 margin: 0;
 font-size: 1rem;
	color: #2c2c2c;
 padding-bottom: 0.5rem;
 border-bottom: 1px solid #e0d5c7;
 }

 .full-text {
 padding: 1rem;
 background-color: #f9f7f4;
 border-left: 3px solid #d4a574;
 border-radius: 4px;
 line-height: 1.6;
	color: #333;
 white-space: pre-wrap;
 word-wrap: break-word;
 }

 .context-list {
 display: flex;
 flex-direction: column;
	gap: 0.75rem;
 }

 .context-item {
 padding: 0.75rem;
 background-color: #f5f1e8;
 border-radius: 4px;
 border-left: 3px solid #8b4513;
 }

 .context-item p {
 margin: 0;
 font-size: 0.9rem;
	color: #333;
 line-height: 1.5;
 }

 .cases-list {
 display: flex;
 flex-direction: column;
	gap: 0.75rem;
 }

 .case-item {
 padding: 0.75rem;
 background-color: #f5f1e8;
 border-radius: 4px;
 border-left: 3px solid #d4a574;
 }

 .case-number {
 font-family: 'Monaco', 'Courier New', monospace;
 font-size: 0.85rem;
 font-weight: 600;
	color: #8b4513;
 }

 .case-title {
 font-size: 0.9rem;
	color: #333;
 margin: 0.25rem 0;
 }

 .relevance {
 font-size: 0.75rem;
	color: #666;
 }

 .loading {
 display: flex;
 flex-direction: column;
 align-items: center;
	gap: 1rem;
 padding: 2rem;
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

 .empty-state {
 display: flex;
 align-items: center;
 justify-content: center;
 min-height: 300px;
	color: #999;
 }
</style>



