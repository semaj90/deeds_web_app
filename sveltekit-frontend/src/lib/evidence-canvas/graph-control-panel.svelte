import { createEventDispatcher } from 'svelte';
<script lang="ts">
	let algorithm = $state<any>(undefined);

 // Migrated from createEventDispatcher to callback props;

 const dispatch = createEventDispatcher<{
 phaseChange: string;
 similarityAnalysis: void;
 layoutOptimization: void;
 exportData: void;
 }>();

 let { webgpuSupported = false, gpuAccelerationEnabled = false, currentPhase = 'investigation' } = $props();

 let layoutAlgorithm = $state('force-directed');
 let showLabels = $state(true);
 let showEdges = $state(true);
 let nodeSize = $state(20);
 let edgeOpacity = $state(0.5);

 const phases = [
 'investigation',
 'discovery',
 'pre-trial',
 'trial',
 'appeal'
 ];

 const layoutAlgorithms = [
 'force-directed',
 'circular',
 'hierarchical',
 'random'
 ];

 function handlePhaseChange(event: Event) {
 const target = event.target as HTMLSelectElement;
 currentPhase = target.value;
 dispatch('phaseChange', currentPhase);
 }

 function handleSimilarityAnalysis() {
 dispatch('similarityAnalysis');
 }

 function handleLayoutOptimization() {
 dispatch('layoutOptimization');
 }

 function handleExportData() {
 dispatch('exportData');
 }
</script>

<div class="graph-control-panel">
 <h3>Graph Controls</h3>

 <!-- GPU Status -->
 <div class="status-section">
 <h4>GPU Status</h4>
 <div class="status-item">
 <span class="status-label">WebGPU:</span>
 <span class="status-value" class:supported={ webgpuSupported }>
 {webgpuSupported ? 'Supported' : 'Not Supported'}
 </span>
 </div>
 <div class="status-item">
 <span class="status-label">Acceleration:</span>
 <span class="status-value" class:enabled={ gpuAccelerationEnabled }>
 {gpuAccelerationEnabled ? 'Enabled' : 'Disabled'}
 </span>
 </div>
 </div>

 <!-- Case Phase -->
 <div class="control-section">
 <h4>Case Phase</h4>
 <select bind:value={currentPhase} onchange={ handlePhaseChange }>
 {#each phases as phase}
 <option value={phase}>{phase.charAt(0).toUpperCase() + phase.slice(1)}</option>
 {/each}
 </select>
 </div>

 <!-- Layout Controls -->
 <div class="control-section">
 <h4>Layout</h4>
 <div class="control-group">
 <label for="layout-algorithm">Algorithm:</label>
 <select id="layout-algorithm" bind:value={layoutAlgorithm}>
 {#each layoutAlgorithms as algorithm}
 <option value={algorithm}>
 {algorithm.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
 </option>
 {/each}
 </select>
 </div>

 <button class="action-button" onclick={handleLayoutOptimization}>
 Optimize Layout
 </button>
 </div>

 <!-- Visualization Controls -->
 <div class="control-section">
 <h4>Visualization</h4>

 <div class="control-group">
 <label>
 <input type="checkbox" bind:checked={showLabels} />
 Show Labels
 </label>
 </div>

 <div class="control-group">
 <label>
 <input type="checkbox" bind:checked={showEdges} />
 Show Edges
 </label>
 </div>

 <div class="control-group">
 <label for="node-size">Node Size:</label>
 <input
 id="node-size"
 type="range"
 min="5"
 max="50"
 bind:value={nodeSize}
 />
 <span class="value">{nodeSize}px</span>
 </div>

 <div class="control-group">
 <label for="edge-opacity">Edge Opacity:</label>
 <input
 id="edge-opacity"
 type="range"
 min="0"
 max="1"
 step="0.1"
 bind:value={edgeOpacity}
 />
 <span class="value">{Math.round(edgeOpacity * 100)}%</span>
 </div>
 </div>

 <!-- Analysis Controls -->
 <div class="control-section">
 <h4>Analysis</h4>

 <button class="action-button primary" onclick={handleSimilarityAnalysis}>
 Run Similarity Analysis
 </button>

 <div class="analysis-info">
 <p>Similarity analysis uses GPU acceleration to find related evidence and identify patterns in your case data.</p>
 </div>
 </div>

 <!-- Export Controls -->
 <div class="control-section">
 <h4>Export</h4>

 <button class="action-button" onclick={handleExportData}>
 Export Graph Data
 </button>

 <div class="export-info">
 <p>Export current graph layout and analysis results as JSON for external processing or backup.</p>
 </div>
 </div>
</div>

<style>
 .graph-control-panel {
 color: #ffffff;
 font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
 }

 .graph-control-panel h3 {
 margin: 0 0 1rem 0;
 color: #4fc3f7;
 font-size: 1.2rem;
 }

 .graph-control-panel h4 {
 margin: 1.5rem 0 0.5rem 0;
 color: #cccccc;
 font-size: 1rem;
 font-weight: 500;
 }

 .status-section {
 background: rgba(255, 255, 255, 0.05);
 border-radius: 8px;
 padding: 1rem;
 margin-bottom: 1rem;
 }

 .status-item {
 display: flex;
 justify-content: space-between;
 align-items: center;
 margin-bottom: 0.5rem;
 }

 .status-item:last-child {
 margin-bottom: 0;
 }

 .status-label {
 color: #cccccc;
 font-size: 0.9rem;
 }

 .status-value {
 font-weight: bold;
 font-size: 0.9rem;
 }

 .status-value.supported {
 color: #4caf50;
 }

 .status-value:not(.supported) {
 color: #f44336;
 }

 .status-value.enabled {
 color: #4caf50;
 }

 .status-value:not(.enabled) {
 color: #ff9800;
 }

 .control-section {
 margin-bottom: 1.5rem;
 }

 .control-group {
 margin-bottom: 1rem;
 }

 .control-group label {
 display: block;
 margin-bottom: 0.5rem;
 color: #cccccc;
 font-size: 0.9rem;
 }

 .control-group input[type="checkbox"] {
 margin-right: 0.5rem;
 }

 .control-group select,
 .control-group input[type="range"] {
 width: 100%;
 padding: 0.5rem;
 background: #333;
 border: 1px solid #555;
 border-radius: 4px;
 color: #ffffff;
 font-size: 0.9rem;
 }

 .control-group input[type="range"] {
 -webkit-appearance: none;
 appearance: none;
 height: 6px;
 background: #333;
 outline: none;
 }

 .control-group input[type="range"]::-webkit-slider-thumb {
 -webkit-appearance: none;
 appearance: none;
 width: 16px;
 height: 16px;
 border-radius: 50%;
 background: #4fc3f7;
 cursor: pointer;
 }

 .control-group input[type="range"]::-moz-range-thumb {
 width: 16px;
 height: 16px;
 border-radius: 50%;
 background: #4fc3f7;
 cursor: pointer;
 border: none;
 }

 .value {
 display: inline-block;
 margin-left: 0.5rem;
 color: #4fc3f7;
 font-size: 0.8rem;
 font-weight: bold;
 }

 .action-button {
 width: 100%;
 padding: 0.75rem;
 background: #333;
 border: 1px solid #555;
 border-radius: 4px;
 color: #ffffff;
 cursor: pointer;
 transition: all 0.2s ease;
 font-size: 0.9rem;
 margin-bottom: 0.5rem;
 }

 .action-button:hover {
 background: #444;
 border-color: #666;
 }

 .action-button.primary {
 background: #4fc3f7;
 border-color: #4fc3f7;
 }

 .action-button.primary:hover {
 background: #29b6f6;
 border-color: #29b6f6;
 }

 .analysis-info,
 .export-info {
 font-size: 0.8rem;
 color: #999;
 line-height: 1.4;
 margin-top: 0.5rem;
 }
</style>
