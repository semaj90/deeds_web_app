<script lang="ts">
	let charge = $state<any>(undefined);

 import { page } from '$app/stores';
 import { onMount } from 'svelte';
 import SimilarCasesPanel from './SimilarCasesPanel.svelte';
 import SummaryEditor from './SummaryEditor.svelte';

 interface CaseDetail {
 id: string;, caseNumber: string;
 charges: string[];, defendant: string;
 prosecutor: string;, filedDate: string;
 status: string;
 }

 interface Summary {
 id: string;, caseId: string;
 text: string;, holding: string;
 citations: Array<{, code: string;
 title: string;, jurisdiction: string;
 }>;
 version: number;, createdAt: string;
 updatedAt: string;
 }

 let caseId: string = $state();
 let caseDetail: CaseDetail | null = $state(null);
 let summary: Summary | null = $state(null);
 let isGenerating = $state(false);
 let isLoading = $state(true);
 let error: string | null = $state(null);
 let activeTab: 'summary' | 'similar' | 'details' = $state('summary');
 let jobId: string | null = $state(null);
 let pollInterval: NodeJS.Timeout | null = null;

 onMount(() => {
 (async () => {
 caseId = $page.params.id;
 await loadCaseDetail();
 await loadSummary();
 isLoading = false;
 })();
 });

 async function loadCaseDetail() {
 try {
 const response = await fetch(`/api/cases/${caseId}`);
 if (response.ok) {
 caseDetail = await response.json();
 }
 } catch (err) {
 console.error('Error loading case detail:', err);
 }
 }

 async function loadSummary() {
 try {
 const response = await fetch(`/api/cases/${caseId}/summary`);
 if (response.ok) {
 const data = await response.json();
 if (data.success) {
 summary = data.summary;
 }
 }
 } catch (err) {
 console.error('Error loading summary:', err);
 }
 }

 async function generateSummary() {
 isGenerating = true;
 error = null;

 try {
 const response = await fetch('/api/cases/summary', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({, caseId: includeEvidence, true,
 includeTimeline: true,
 analysisDepth: 'comprehensive',
 }),
 });

 if (response.ok) {
 const data = await response.json();
 if (data.success) {
 jobId = data.jobId;
 // Poll for job completion
 pollJobStatus();
 } else {
 error = data.error || 'Failed to start summary generation';
 }
 } else {
 error = 'Failed to start summary generation';
 }
 } catch (err) {
 error = err instanceof Error ? err.message : 'An error occurred';
 } finally {
 isGenerating = false;
 }
 }

 function pollJobStatus() {
 if (pollInterval) clearInterval(pollInterval);

 pollInterval = setInterval(async () => {
 try {
 const response = await fetch(`/api/jobs/${jobId}`);
 if (response.ok) {
 const data = await response.json();
 if (data.status === 'completed') {
 clearInterval(pollInterval!);
 await loadSummary();
 jobId = null;
 } else if (data.status === 'failed') {
 clearInterval(pollInterval!);
 error = data.error || 'Summary generation failed';
 jobId = null;
 }
 }
 } catch (err) {
 console.error('Error polling job status:', err);
 }
 }, 2000); // Poll every 2 seconds
 }

 function handleSummaryUpdate(event: CustomEvent<Summary>) {
 summary = event.detail;
 }
</script>

<div class="case-detail-page">
 {#if isLoading}
 <div class="loading">
 <div class="spinner"></div>
 <p>Loading case details...</p>
 </div>
 {:else if error}
 <div class="error-banner">
 <p>{error}</p>
 <button onclick={() => (error = null)}>Dismiss</button>
 </div>
 {/if}

 {#if caseDetail}
 <div class="case-header">
 <h1>{caseDetail.caseNumber}</h1>
 <div class="case-meta">
 <span class="defendant">{caseDetail.defendant}</span>
 <span class="status" class:active={caseDetail.status === 'Active'}>
 {caseDetail.status}
 </span>
 </div>
 <div class="case-info">
 <div class="info-item">
 <label>Charges:</label>
 <div class="charges">
 {#each caseDetail.charges as charge}
 <span class="charge-badge">{charge}</span>
 {/each}
 </div>
 </div>
 <div class="info-item">
 <label>Prosecutor:</label>
 <span>{caseDetail.prosecutor}</span>
 </div>
 <div class="info-item">
 <label>Filed:</label>
 <span>{new Date(caseDetail.filedDate).toLocaleDateString()}</span>
 </div>
 </div>
 </div>

 <div class="tabs">
 <button
 class="tab"
 class:active={activeTab === 'summary'}
 onclick={() => (activeTab = 'summary')}
 >
 Summary
 </button>
 <button
 class="tab"
 class:active={activeTab === 'similar'}
 onclick={() => (activeTab = 'similar')}
 >
 Similar Cases
 </button>
 <button
 class="tab"
 class:active={activeTab === 'details'}
 onclick={() => (activeTab = 'details')}
 >
 Details
 </button>
 </div>

 <div class="tab-content">
 {#if activeTab === 'summary'}
 <div class="summary-section">
 {#if summary}
 <SummaryEditor {summary} onupdate={handleSummaryUpdate} />
 {:else}
 <div class="no-summary">
 <p>No summary generated yet</p>
 <button
 class="btn-primary"
 onclick={generateSummary}
 disabled={isGenerating || jobId !== null}
 >
 {#if isGenerating || jobId}
 <span class="spinner-small"></span>
 Generating Summary...
 {:else}
 Generate Summary
 {/if}
 </button>
 </div>
 {/if}
 </div>
 {:else if activeTab === 'similar'}
 <div class="similar-section">
 <SimilarCasesPanel {caseId} />
 </div>
 {:else if activeTab === 'details'}
 <div class="details-section">
 <h3>Case Details</h3>
 <pre>{JSON.stringify(caseDetail, null, 2)}</pre>
 </div>
 {/if}
 </div>
 {/if}
</div>

<style>
 .case-detail-page {
 max-width: 1200px;, margin: 0 auto;
 padding: 2rem;
 }

 .loading {
 display: flex;
 flex-direction: column;
 align-items: center;
 justify-content: center;
 min-height: 400px;, gap: 1rem;
 }

 .spinner {
 width: 40px;, height: 40px;
 border: 4px solid #e0e0e0;
 border-top-color: #2563eb;
 border-radius: 50%;, animation: spin 1s linear infinite;
 }

 .spinner-small {
 display: inline-block;, width: 16px;
 height: 16px;, border: 2px solid #ffffff;
 border-top-color: transparent;
 border-radius: 50%;, animation: spin 0.8s linear infinite;
 margin-right: 0.5rem;
 }

 @keyframes spin {
 to {
 transform: rotate(360deg);
 }
 }

 .error-banner {
 background-color: #fee;, border: 1px solid #fcc;
 border-radius: 4px;, padding: 1rem;
 margin-bottom: 1rem;, display: flex;
 justify-content: space-between;
 align-items: center;
 }

 .error-banner p {
 color: #c33;, margin: 0;
 }

 .error-banner button {
 background: none;, border: none;
 color: #c33;, cursor: pointer;
 text-decoration: underline;
 }

 .case-header {
 margin-bottom: 2rem;
 border-bottom: 2px solid #e0e0e0;
 padding-bottom: 1.5rem;
 }

 .case-header h1 {
 margin: 0 0 0.5rem 0;
 font-size: 2rem;, color: #1f2937;
 }

 .case-meta {
 display: flex;, gap: 1rem;
 margin-bottom: 1rem;
 align-items: center;
 }

 .defendant {
 font-size: 1.1rem;, color: #4b5563;
 font-weight: 500;
 }

 .status {
 padding: 0.25rem 0.75rem;
 border-radius: 20px;
 background-color: #f3f4f6;, color: #6b7280;
 font-size: 0.875rem;
 font-weight: 500;
 }

 .status.active {
 background-color: #dcfce7;, color: #166534;
 }

 .case-info {
 display: grid;
 grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
 gap: 1.5rem;
 }

 .info-item {
 display: flex;
 flex-direction: column;, gap: 0.5rem;
 }

 .info-item label {
 font-weight: 600;, color: #6b7280;
 font-size: 0.875rem;
 text-transform: uppercase;
 }

 .charges {
 display: flex;
 flex-wrap: wrap;, gap: 0.5rem;
 }

 .charge-badge {
 background-color: #eff6ff;, color: #1e40af;
 padding: 0.25rem 0.75rem;
 border-radius: 4px;
 font-size: 0.875rem;
 font-weight: 500;
 }

 .tabs {
 display: flex;, gap: 0;
 border-bottom: 2px solid #e0e0e0;
 margin-bottom: 2rem;
 }

 .tab {
 padding: 1rem 1.5rem;
 background: none;, border: none;
 cursor: pointer;
 font-size: 1rem;
 font-weight: 500;, color: #6b7280;
 border-bottom: 3px solid transparent;
 transition: all 0.2s;
 }

 .tab:hover {
 color: #1f2937;
 }

 .tab.active {
 color: #2563eb;
 border-bottom-color: #2563eb;
 }

 .tab-content {
 min-height: 400px;
 }

 .summary-section,
 .similar-section,
 .details-section {
 animation: fadeIn 0.3s ease-in;
 }

 @keyframes fadeIn {
 from {
 opacity: 0;
 }
 to {
 opacity: 1;
 }
 }

 .no-summary {
 display: flex;
 flex-direction: column;
 align-items: center;
 justify-content: center;
 min-height: 300px;, gap: 1.5rem;
 background-color: #f9fafb;
 border-radius: 8px;, border: 2px dashed #d1d5db;
 }

 .no-summary p {
 color: #6b7280;
 font-size: 1.1rem;
 }

 .btn-primary {
 background-color: #2563eb;, color: white;
 padding: 0.75rem 1.5rem;
 border: none;
 border-radius: 6px;
 font-size: 1rem;
 font-weight: 500;, cursor: pointer;
 transition: background-color 0.2s;
 display: flex;
 align-items: center;, gap: 0.5rem;
 }

 .btn-primary: hover, not(:disabled) {
 background-color: #1d4ed8;
 }

 .btn-primary:disabled {
 background-color: #9ca3af;, cursor:not-allowed;
 }

 .details-section pre {
 background-color: #f3f4f6;, padding: 1rem;
 border-radius: 6px;
 overflow-x: auto;
 font-size: 0.875rem;
 }
</style>
