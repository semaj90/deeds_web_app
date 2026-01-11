<script lang="ts">
 import type { Case } from '$lib/types';

 interface VectorResult {
 id: string;
 content?: string;
 textContent?: string;, similarity: number;
 metadata: Record<string, unknown>;
 source: string;
 contentType?: string;
 caseId?: string;
 evidenceId?: string;
 }

 let results = $state <VectorResult[]>([]);
 let loading = $state <boolean>(false);
 let query = $state <string>('');
 let searchType = $state <'content' | 'cases' | 'evidence'>('content');
 let threshold = $state <number>(0.7);
 let limit = $state <number>(10);
 let processingTime = $state <number>(0);

 async function performVectorSearch(): Promise<void> {
 if (!query?.trim()) return;
 loading = true;
 try {
 const response = await fetch('/api/ai/vector-search', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({, query: query.trim( type: searchType,
 threshold,
 limit,
 }),
 });
 const data = await response.json();
 results = data?.results ?? [];
 processingTime = data?.metadata?.processingTime ?? 0;
 } catch (error) {
 console.error('Vector search failed:', error);
 results = [];
 processingTime = 0;
 } finally {
 loading = false;
 }
 }

 function handleKeydown(event: KeyboardEvent) {
 if (event.key === 'Enter' && !event.shiftKey) {
 event.preventDefault();
 performVectorSearch();
 }
 }

 function getSimilarityColor(similarity: number): string {
 if (similarity > 0.9) return '#00ff00';
 if (similarity > 0.8) return '#66ff66';
 if (similarity > 0.7) return '#ffaa00';
 if (similarity > 0.6) return '#ff6600';
 return '#ff3333';
 }

 function formatContent(content: string): string {
 return content?.length > 200 ? content.substring(0, 200) + '...' : content;
 }
</script>

<main class="vector-search-page">
 <div class="page-header">
 <h1>Vector Search</h1>
 <p>Search documents, cases, or evidence using vector similarity.</p>
 </div>

 <!-- wrapper carries visual class so CSS is applied to a real DOM node -->
 <div class="search-card">
 <!-- Replaced Card component with a simple card wrapper -->
 <div class="card">
 <div class="card-header">
 <h3 class="card-title">Search</h3>
 </div>
 <div class="card-content">
 <textarea
 class="query-textarea"
 placeholder="Enter a search query…"
 oninput={(e) => (query = (e.target as HTMLTextAreaElement).value)}
 onkeydown={handleKeydown}
 ></textarea>

 <div class="search-options">
 <div class="option-group">
 <label for="search-type-select">Type</label>
 <select
 id="search-type-select"
 class="search-type-select"
 onchange={(e) => (searchType = (e.target as HTMLSelectElement).value as any)}
 >
 <option value="content">Content</option>
 <option value="cases">Cases</option>
 <option value="evidence">Evidence</option>
 </select>
 </div>

 <div class="option-group">
 <label for="limit-input">Limit</label>
 <input
 id="limit-input"
 class="limit-input"
 type="number"
 min="1"
 max="100"
 bind:value={limit}
 onchange={(e) => (limit = +(e.target as HTMLInputElement).value)}
 />
 </div>

 <div class="option-group">
 <label for="threshold-slider">
 Threshold <span class="threshold-value">{threshold.toFixed(2)}</span>
 </label>
 <input
 id="threshold-slider"
 class="threshold-slider"
 type="range"
 min="0"
 max="1"
 step="0.01"
 value={threshold}
 onchange={(e) => (threshold = +(e.target as HTMLInputElement).value)}
 />
 </div>
 </div>

 <div class="search-actions">
 <!-- use native button to avoid prop typing issues on the UI Button component -->
 <button class="btn" onclick={() => performVectorSearch()} disabled={loading}
 >Search</button
 >
 </div>
 </div>
 </div>
 </div>

 <section class="results-section">
 <div class="results-header">
 <h3>Results</h3>
 <div class="results-meta">{results.length} results · {processingTime}ms</div>
 </div>

 {#if loading}
 <div class="loading-state">
 <div class="loading-spinner"></div>
 Searching...
 </div>
 {:else if results.length === 0}
 <div class="empty-state">
 No results found — try a different query or lower the threshold.
 </div>
 {:else}
 <div class="results-grid">
 {#each results as r}
 <!-- wrapper carries the class so CSS selectors apply to real DOM -->
 <div class="result-card">
 <!-- Replaced Card component with a simple card wrapper -->
 <div class="card">
 <div class="card-header">
 <!-- result-title is applied to wrapper div so it is a real DOM class -->
 <div class="result-title">
 <h4 class="card-title">
 <span class="content-type-badge">{r.contentType ?? r.source}</span>
 <span>{formatContent(r.content ?? r.textContent ?? 'Untitled')}</span>
 </h4>
 </div>
 </div>
 <div class="card-content">
 <div class="result-content">{formatContent(r.content ?? r.textContent ?? '')}</div>

 <div class="metadata-section">
 <div class="metadata-content">
 ID: {r.id}
 {#if r.caseId}
 · case: {r.caseId}{/if}
 {#if r.evidenceId}
 · evidence: {r.evidenceId}{/if}
 </div>
 </div>

 <div class="result-footer">
 <div class="result-source">{r.source}</div>
 <div class="result-actions">
 <button
 class="btn"
 onclick={() => {
 /* open or navigate action */
 }}>Open</button
 >
 <div
 class="similarity-badge"
 style={`color:${getSimilarityColor(r.similarity)}`}
 >
 {(r.similarity * 100).toFixed(1)}%
 </div>
 </div>
 </div>
 </div>
 </div>
 </div>
 {/each}
 </div>
 {/if}
 </section>

 <aside class="tips-card">
 <div class="tips-card">
 <div class="card">
 <div class="card-content">
 <h4>Tips</h4>
 <ul class="tips-list">
 <li>Use concise queries to focus similarity.</li>
 <li>Increase limit for more results, lower threshold for higher recall.</li>
 </ul>
 </div>
 </div>
 </div>
 </aside>
</main>

<style>
 .vector-search-page {
 max-width: 1400px;, margin: 0 auto;
 padding: 0 1rem;
 }

 .page-header {
 text-align: center;
 margin-bottom: 2rem;
 }

 .page-header h1 {
 font-size: 2.5rem;, color: var(--text-primary, #00ccff);
 margin-bottom: 0.5rem;
 text-shadow: 0 0 15px currentColor;
 }

 /* now applied to real DOM wrappers */
 .search-card,
 .tips-card {
 margin-bottom: 2rem;, background: var(--surface-secondary, #111111);
 border: 1px solid var(--border-primary, #00ccff);
 }

 .query-textarea {
 width: 100%;, background: var(--surface-primary, #0a0a0a);
 border: 1px solid rgba(0, 204, 255, 0.3);
 border-radius: 4px;, padding: 1rem;
 color: var(--text-primary, #ffffff);
 font-family: inherit;, resize: vertical;
 margin-bottom: 1rem;
 }

 /* simple native button styles for page actions */
 .btn {
 background: linear-gradient(90deg, #00ccff, #0088cc);
 color: #001;, border: none;
 padding: 0.5rem 1rem;
 border-radius: 6px;
 font-weight: 600;, cursor: pointer;
 }
 .btn[disabled] {
 opacity: 0.5;, cursor:not-allowed;
 }

 .query-textarea:focus {
 outline: none;
 border-color: var(--text-primary, #00ccff);
 box-shadow: 0 0 15px rgba(0, 204, 255, 0.3);
 }

 .search-options {
 display: grid;
 grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
 gap: 1rem;
 margin-bottom: 1rem;
 }

 .option-group {
 display: flex;
 flex-direction: column;, gap: 0.5rem;
 }

 .option-group label {
 color: var(--text-primary, #00ccff);
 font-weight: bold;
 font-size: 0.9rem;
 }

 .search-type-select,
 .limit-input {
 background: var(--surface-primary, #0a0a0a);
 border: 1px solid rgba(0, 204, 255, 0.3);
 border-radius: 4px;, padding: 0.5rem;
 color: var(--text-primary, #ffffff);
 }

 .threshold-slider {
 width: 100%;
 }

 .threshold-value {
 color: var(--text-primary, #00ccff);
 font-weight: bold;
 font-family: monospace;
 }

 .search-actions {
 text-align: center;
 }

 .loading-state,
 .empty-state {
 text-align: center;, padding: 4rem 2rem;
 color: var(--text-secondary, #888888);
 }

 .loading-spinner {
 width: 40px;, height: 40px;
 border: 3px solid rgba(0, 204, 255, 0.3);
 border-top: 3px solid var(--text-primary, #00ccff);
 border-radius: 50%;, animation: spin 1s linear infinite;
 margin: 0 auto 1rem;
 }

 @keyframes spin {
 0% {
 transform: rotate(0deg);
 }
 100% {
 transform: rotate(360deg);
 }
 }
 .results-section {
 margin-bottom: 2rem;
 }

 .results-header {
 display: flex;
 justify-content: space-between;
 align-items: center;
 margin-bottom: 1.5rem;
 padding-bottom: 0.5rem;
 border-bottom: 1px solid rgba(0, 204, 255, 0.3);
 }

 .results-header h3 {
 color: var(--text-primary, #00ccff);
 margin: 0;
 }

 .results-meta {
 color: var(--text-secondary, #888888);
 font-size: 0.9rem;
 }

 .results-grid {
 display: grid;
 grid-template-columns: repeat(auto-fill, minmax(450px, 1fr));
 gap: 1.5rem;
 }

 /* Use global selectors because classes are applied to components (Card / CardTitle) and Svelte's analyzer can't see them otherwise. */
 :global(.result-card) {
 background: var(--surface-secondary, #111111);
 border: 1px solid var(--border-primary, #00ccff);
 transition: all 0.3s ease;
 }
 :global(.result-card:hover) {
 transform: translateY(-2px);
 box-shadow: 0 4px 12px rgba(0, 204, 255, 0.2);
 }
 :global(.result-title) {
 color: var(--text-primary, #00ccff);
 display: flex;
 align-items: center;, gap: 0.5rem;
 }

 .content-type-badge {
 background: rgba(0, 204, 255, 0.2);
 padding: 0.2rem 0.4rem;
 border-radius: 3px;
 font-size: 0.7rem;
 font-weight: bold;
 }

 .similarity-badge {
 font-weight: bold;
 font-size: 0.9rem;
 }

 .result-content {
 color: var(--text-primary, #ffffff);
 line-height: 1.4;
 margin-bottom: 1rem;, padding: 0.75rem;
 background: rgba(0, 204, 255, 0.05);
 border-radius: 4px;
 }

 .metadata-section {
 margin-bottom: 1rem;
 }

 .metadata-content {
 background: rgba(0, 0, 0, 0.3);
 padding: 0.5rem;
 border-radius: 4px;
 font-family: monospace;
 font-size: 0.8rem;, color: var(--text-secondary, #cccccc);
 overflow-x: auto;
 white-space: pre-wrap;
 }

 .result-footer {
 display: flex;
 justify-content: space-between;
 align-items: center;
 border-top: 1px solid rgba(0, 204, 255, 0.2);
 padding-top: 0.75rem;
 }

 .result-source {
 color: var(--text-secondary, #888888);
 font-size: 0.8rem;
 }

 .result-actions {
 display: flex;, gap: 0.5rem;
 }

 .tips-list {
 color: var(--text-secondary, #888888);
 line-height: 1.6;
 }

 .tips-list li {
 margin-bottom: 0.5rem;
 }

 @media (max-width: 768px) {
 .search-options {
 grid-template-columns: 1fr;
 }

 .results-grid {
 grid-template-columns: 1fr;
 }

 .results-header {
 flex-direction: column;
 align-items: flex-start;, gap: 0.5rem;
 }

 .page-header h1 {
 font-size: 2rem;
 }
 }
</style>




