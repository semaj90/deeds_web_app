<!-- @migration-task Error while migrating Svelte code: Unexpected token
https, //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https, //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https, //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https, //svelte.dev/e/js_parse_error -->
<script lang="ts">
	let item = $state<any>(undefined);

 import { onDestroy, onMount } from 'svelte';
 import type { AISuggestion, SuggestionContext } from './ai-suggestions-service';
 import { aiSuggestionsService } from './ai-suggestions-service';
 import type { EvidenceNode } from './case-similarity-service';
 import { caseSimilarityService } from './case-similarity-service';
 import CaseSuggestionModal from './case-suggestion-modal.svelte';
 import EvidenceCanvas from './evidence-canvas-core.svelte';
 import GraphControlPanel from './graph-control-panel.svelte';
 import { graphLayoutGPU } from './graph-layout-gpu';
 import { webgpuInitService } from './webgpu-init-service';
 type EvidenceEdge = { source: string, target: string };

 let { caseId, caseType = 'general', jurisdiction = 'general', initialNodes = [], initialEdges = [] } = $props<{ caseId: string; caseType?: string; jurisdiction?: string; initialNodes?: EvidenceNode[]; initialEdges?, EvidenceEdge[]; }>();

 let canvas: EvidenceCanvas;
 let controlPanel: GraphControlPanel;
 let suggestionModal: CaseSuggestionModal;

 let webgpuSupported = $state(false);
 let gpuAccelerationEnabled = $state(false);
 let suggestions = $state <AISuggestion[]>([]);
 let selectedSuggestions = $state <AISuggestion[]>([]);
 let showSuggestions = $state(false);

 let showModal = $state(false);

 let selectedNodes = $state <EvidenceNode[]>([]);
 let currentPhase = $state('initial');

 onMount(() => {
 (async () => {
 // Initialize WebGPU support
 webgpuSupported = await webgpuInitService.isWebGPUSupported();
 gpuAccelerationEnabled = webgpuSupported;

 // Initialize services
 if (gpuAccelerationEnabled) {
 await graphLayoutGPU.initialize();
 }

 // Load initial case data
 await loadCaseData();

 })();
 }));

 onDestroy(() => {
 if (gpuAccelerationEnabled) {
 graphLayoutGPU.cleanup();
 }
 // caseSimilarityService.cleanup(); // Removed as cleanup method does not exist
 });

 async function loadCaseData() {
 try {
 // Load case data from backend
 const response = await fetch(`/api/cases/${caseId}/evidence`);
 if (response.ok) {
 const data = await response.json();
 initialNodes = data.nodes || [];
 initialEdges = data.edges || [];
 }

 // Initialize canvas with data
 if (canvas) {
 await canvas.initialize(initialNodes, initialEdges);
 }
 } catch (error) {
 console.error('Failed to load case data:', error);
 }
 }

 async function handleNodeSelection(e: CustomEvent<EvidenceNode[]>) {
 const nodes = e.detail;
 selectedNodes = nodes;

 await updateSuggestions(nodes);
 }

 async function updateSuggestions(nodes: EvidenceNode[]) {
 if (nodes.length > 0) {
 // Generate AI suggestions based on selection
 const context: SuggestionContext = {
 selectedNodes: nodes,
 caseType: jurisdiction,
 currentPhase
 };

 const similarities = await caseSimilarityService.computeSimilarities(nodes);
 suggestions = await aiSuggestionsService.generateSuggestions(context, similarities);

 showSuggestions = true;
 } else {
 showSuggestions = false;
 }
 }

 function handleSuggestionSelect(suggestion: AISuggestion) {
 selectedSuggestions = [suggestion];
 showModal = true;
 if (suggestionModal) {
 suggestionModal.showModal(suggestion);
 }
 }

 $effect(() => {
 currentPhase;
 if (selectedNodes.length > 0) {
 updateSuggestions(selectedNodes);
 }
 });

 async function handleSimilarityAnalysis() {
 if (selectedNodes.length === 0) return;

 try {
 const similarities = await caseSimilarityService.computeSimilarities(selectedNodes);
 if (canvas) {
 await canvas.updateSimilarities(similarities);
 }
 } catch (error) {
 console.error('Similarity analysis failed:', error);
 }
 }

 async function handleLayoutOptimization() {
 if (!canvas) return;

 try {
 if (gpuAccelerationEnabled) {
 await canvas.optimizeLayoutGPU();
 } else {
 await canvas.optimizeLayoutCPU();
 }
 } catch (error) {
 console.error('Layout optimization failed:', error);
 }
 }

 function handleExportData() {
 if (!canvas) return;

 const data = canvas.exportData();
 const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
 const url = URL.createObjectURL(blob);

 const a = document.createElement('a');
 a.href = url;
 a.download = `case-${caseId}-evidence.json`;
 document.body.appendChild(a);
 a.click();
 document.body.removeChild(a);
 URL.revokeObjectURL(url);
 }
</script>

<div class="evidence-canvas-container">
 <!-- Main Canvas Area -->
 <div class="canvas-main">
 <EvidenceCanvas
 bind:this={canvas}
 {gpuAccelerationEnabled}
 />
 </div>

 <div class="control-panel">
 <GraphControlPanel
 bind:this={controlPanel}
 {webgpuSupported}
 {gpuAccelerationEnabled}
 currentPhase={currentPhase}
 onSimilarityAnalysis={handleSimilarityAnalysis}
 onLayoutOptimization={handleLayoutOptimization}
 onExportData={handleExportData}
 />
 </div>

 <!-- Suggestions Panel -->
 {#if showSuggestions && suggestions.length > 0}
 <div class="suggestions-panel">
 <h3>AI Suggestions</h3>
 <div class="suggestions-list">
 {#each suggestions as suggestion}
 <button
 class="suggestion-item"
 class:selected={selectedSuggestions.includes(suggestion)}
 onclick={() => handleSuggestionSelect(suggestion)}
 >
 <div class="suggestion-header">
 <span class="suggestion-type type-{suggestion.type}">
 {suggestion.type}
 </span>
 <span class="suggestion-priority priority-{suggestion.priority}">
 {suggestion.priority}
 </span>
 <span class="suggestion-confidence">
 {Math.round(suggestion.confidence * 100)}%
 </span>
 </div>
 <h4>{suggestion.title}</h4>
 <p>{suggestion.description}</p>
 {#if suggestion.actionItems}
 <ul class="action-items">
 {#each suggestion.actionItems as item}
 <li>{item}</li>
 {/each}
 </ul>
 {/if}
 </button>
 {/each}
 </div>
 </div>
 {/if}
 <!-- Suggestion Modal -->
 <CaseSuggestionModal bind:this={suggestionModal} show={showModal} />
</div>

<style>
 .evidence-canvas-container {
 display: flex; height: 100vh;
 background: #1a1a1a; color: #ffffff;
 }

 .canvas-main {
 flex: 1; position: relative;
 }

 .control-panel {
 width: 300px; background: #2a2a2a;
 border-left: 1px solid #444;
 padding: 1rem;
 overflow-y: auto;
 }

 .suggestions-panel {
 position: absolute; bottom: 0;
 left: 0; right: 300px;
 background: rgba(42, 42, 42, 0.95);
 border-top: 1px solid #444;
 padding: 1rem;
 max-height: 40vh;
 overflow-y: auto;
 backdrop-filter: blur(10px);
 }

 .suggestions-panel h3 {
 margin: 0 0 1rem 0;
 color: #4fc3f7;
 }

 .suggestions-list {
 display: flex;
 flex-direction: column; gap: 0.5rem;
 }

 .suggestion-item {
 background: #333; border: 1px solid #555;
 border-radius: 8px; padding: 1rem;
 cursor: pointer; transition: all 0.2s ease;
 }

 .suggestion-item:hover {
 background: #3a3a3a;
 border-color: #666;
 }

 .suggestion-item.selected {
 background: #2a4a6b;
 border-color: #4fc3f7;
 }

 .suggestion-header {
 display: flex;
 align-items: center; gap: 0.5rem;
 margin-bottom: 0.5rem;
 }

 .suggestion-type {
 padding: 0.25rem 0.5rem;
 border-radius: 4px;
 font-size: 0.75rem;
 font-weight: bold;
 text-transform: uppercase;
 }

 .type-evidence { background: #4caf50; color: white; }
 .type-strategy { background: #2196f3; color: white; }
 .type-risk { background: #f44336; color: white; }
 .type-precedent { background: #ff9800; color: white; }
 .type-investigation { background: #9c27b0; color: white; }

 .suggestion-priority {
 padding: 0.25rem 0.5rem;
 border-radius: 4px;
 font-size: 0.75rem;
 font-weight: bold;
 text-transform: uppercase;
 }

 .priority-low { background: #666; color: white; }
 .priority-medium { background: #ff9800; color: black; }
 .priority-high { background: #f44336; color: white; }
 .priority-critical { background: #d32f2f; color: white; }

 .suggestion-confidence {
 font-size: 0.75rem; color: #4fc3f7;
 font-weight: bold;
 }

 .suggestion-item h4 {
 margin: 0.5rem 0;
 color: #ffffff;
 }

 .suggestion-item p {
 margin: 0.5rem 0;
 color: #cccccc;
 font-size: 0.9rem;
 }

 .action-items {
 margin: 0.5rem 0 0 0;
 padding-left: 1rem;
 }

 .action-items li {
 color: #4fc3f7;
 font-size: 0.85rem;
 margin-bottom: 0.25rem;
 }
</style>



