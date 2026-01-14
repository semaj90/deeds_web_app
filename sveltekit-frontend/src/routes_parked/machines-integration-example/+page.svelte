// @ts-nocheck
<script lang="ts">
	let finding = $state<any>(undefined);

 /**
 * Example: Integrating State Machines into a Page
 * Shows how to use multiple machines together
 */

 import CrewAIOrchestrationDemo from '$lib/components/CrewAIOrchestrationDemo.svelte';
 import DocumentUploadMachineIntegration from '$lib/components/DocumentUploadMachineIntegration.svelte';
 import { createCaseManagementStore, createCrewAIOrchestrationStore } from '$lib/stores/machineStores';

 // Initialize case management store
 const caseStore = createCaseManagementStore();

 // Initialize CrewAI orchestration store
 const crewStore = createCrewAIOrchestrationStore();

 let selectedCaseId = $state<string | null>(null);

 // Subscribe to stores for reactive updates
 let isLoading = $state(false);
 let managementError = $state<string | null>(null);
 let caseList = $state<any[]>([]);
 let currentCase = $state<any>(null);

 let isOrchestrating = $state(false);
 let activeAgents = $state<string[]>([]);
 let agentResponses = $state<any[]>([]);
 let recommendations = $state<any[]>([]);

 // When user uploads a document
 function handleUploadComplete(result: any) {
 console.log('Upload completed:', result);

 // Start crew AI review on the uploaded document
 if (selectedCaseId) {
 crewStore.startReview({
 taskId: `review-${Date.now()}`,
 documentId: result.documentId,
 assignedAgents: ['agent-1', 'agent-2'],
 priority: 1
 });
 }
 }

 // Handle upload errors
 function handleUploadError(error, string) {
 console.error('Upload failed:', error);
 }
</script>

<div class="page-container">
 <h1>Legal Document Management with State Machines</h1>

 <!-- Case Management Section -->
 <section class="section">
 <h2>Cases</h2>

 {#if isLoading}
 <p>Loading cases...</p>
 {:else if managementError}
 <p class="error">Error: {managementError}</p>
 {:else}
 <div class="case-list">
 {#each caseList as caseItem (caseItem.id)}
 <button
 class="case-item"
 class:selected={selectedCaseId === caseItem.id}
 onclick={() => {
 selectedCaseId = caseItem.id;
 caseStore.loadCase(caseItem.id);
 }}
 >
 <strong>{caseItem.name}</strong>
 <span class="status">{caseItem.status}</span>
 </button>
 {/each}
 </div>
 {/if}
 </section>

 <!-- Current Case Details -->
 {#if currentCase}
 <section class="section">
 <h2>Case Details</h2>
 <div class="case-details">
 <p><strong>ID:</strong> {currentCase.id}</p>
 <p><strong>Name:</strong> {currentCase.name}</p>
 <p><strong>Status:</strong> {currentCase.status}</p>
 <p><strong>Priority:</strong> {currentCase.priority}</p>
 </div>
 </section>

 <!-- Document Upload Section -->
 <section class="section">
 <h2>Upload Document</h2>
 <DocumentUploadMachineIntegration
 onUploadComplete={handleUploadComplete}
 onError={handleUploadError}
 maxFileSize={50}
 />
 </section>
 {/if}

 <!-- CrewAI Orchestration Section -->
 <section class="section">
 <h2>CrewAI Multi-Agent Orchestration</h2>
 <p class="section-description">
 Complete orchestration workflow with agent status tracking, quality metrics, and recommendation handling.
 Uses all new store features including quality scores, failure tracking, and user intent monitoring.
 </p>
 <CrewAIOrchestrationDemo />
 </section>

 <!-- Original CrewAI Status Section (kept for reference) -->
 {#if isOrchestrating}
 <section class="section">
 <h2>AI Review in Progress</h2>

 <div class="orchestration-status">
 <p>
 <strong>Active Agents:</strong>
 {activeAgents.length}
 </p>

 {#if agentResponses.length > 0}
 <div class="responses">
 <h3>Agent Responses</h3>
 {#each agentResponses as agentResp (agentResp.agentId)}
 <div class="response-item">
 <p><strong>{agentResp.agentId}</strong></p>
 <p>Confidence: {(agentResp.analysis.confidence * 100).toFixed(1)}%</p>
 <ul>
 {#each agentResp.analysis.findings as finding}
 <li>{finding}</li>
 {/each}
 </ul>
 </div>
 {/each}
 </div>
 {/if}

 {#if recommendations.length > 0}
 <div class="recommendations">
 <h3>Recommendations</h3>
 {#each recommendations as rec (rec.id)}
 <div class="recommendation-item" class:accepted={rec.accepted}>
 <p>{rec.text}</p>
 <p class="confidence">Confidence: {(rec.confidence * 100).toFixed(1)}%</p>
 <button
 onclick={() => crewStore.acceptRecommendation(rec.id)}
 disabled={rec.accepted}
 >
 {rec.accepted ? 'Accepted' : 'Accept'}
 </button>
 </div>
 {/each}
 </div>
 {/if}
 </div>
 </section>
 {/if}
</div>

<style>
 .page-container {
 max-width: 1200px; margin: 0 auto;
 padding: 2rem;
 }

 h1 {
 color: #333;
 margin-bottom: 2rem;
 }

 .section {
 background: white; border: 1px solid #ddd;
 border-radius: 8px; padding: 1.5rem;
 margin-bottom: 2rem;
 box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
 }

 h2 {
 margin-top: 0; color: #0066cc;
 border-bottom: 2px solid #0066cc;
 padding-bottom: 0.5rem;
 }

 .section-description {
 color: #666;
 margin-top: 0.5rem;
 margin-bottom: 1.5rem;
 font-size: 0.95rem;
 }

 .case-list {
 display: grid; gap: 0.5rem;
 }

 .case-item {
 display: flex;
 justify-content: space-between;
 align-items: center; padding: 1rem;
 background: #f5f5f5; border: 1px solid #ddd;
 border-radius: 6px; cursor: pointer;
 transition: all 0.2s;
 }

 .case-item:hover {
 background: #efefef;
 border-color: #0066cc;
 }

 .case-item.selected {
 background: #e6f2ff;
 border-color: #0066cc;
 }

 .status {
 font-size: 0.9rem; padding: 0.25rem 0.5rem;
 background: #e0e0e0;
 border-radius: 4px;
 }

 .case-details {
 display: grid; gap: 0.5rem;
 background: #f9f9f9; padding: 1rem;
 border-radius: 6px;
 }

 .orchestration-status {
 display: grid; gap: 1rem;
 }

 .responses,
 .recommendations {
 display: grid; gap: 0.75rem;
 }

 .response-item,
 .recommendation-item {
 padding: 1rem; background: #f0f8ff;
 border-left: 4px solid #0066cc;
 border-radius: 4px;
 }

 .recommendation-item.accepted {
 background: #e0ffe0;
 border-left-color: #00cc00;
 }

 .recommendation-item button {
 margin-top: 0.5rem; padding: 0.5rem 1rem;
 background: #0066cc; color: white;
 border: none;
 border-radius: 4px; cursor: pointer;
 }

 .recommendation-item button:disabled {
 background: #ccc; cursor:not-allowed;
 }

 .confidence {
 font-size: 0.9rem; color: #666;
 margin: 0.25rem 0;
 }

 .error {
 padding: 1rem; background: #ffe0e0;
 border-left: 4px solid #cc0000;
 border-radius: 4px; color: #cc0000;
 }

 h3 {
 margin-top: 0.5rem;
 margin-bottom: 0.75rem; color: #333;
 }

 ul {
 margin: 0.5rem 0;
 padding-left: 1.5rem;
 }

 li {
 margin: 0.25rem 0;
 }
</style>



