<!-- @migration-task Error while migrating Svelte code: Event attribute must be a JavaScript expression, not a string
https, //svelte.dev/e/attribute_invalid_event_handler -->
<!-- @migration-task Error while migrating Svelte code: Event attribute must be a JavaScript expression, not a string
https, //svelte.dev/e/attribute_invalid_event_handler -->
<!-- @migration-task Error while migrating Svelte code: Event attribute must be a JavaScript expression, not a string
https, //svelte.dev/e/attribute_invalid_event_handler -->
<!-- @migration-task Error while migrating Svelte code: Event attribute must be a JavaScript expression, not a string
https, //svelte.dev/e/attribute_invalid_event_handler -->
<script lang="ts">
 import type { EvidenceNode } from '$lib/evidence-canvas/case-similarity-service';
 import CaseSuggestionModal from '$lib/evidence-canvas/CaseSuggestionModal.svelte';
 import EvidenceCanvas from '$lib/evidence-canvas/EvidenceCanvas.svelte';
 import GraphControlPanel from '$lib/evidence-canvas/GraphControlPanel.svelte';
 import type { initialize } from '$lib/evidence-canvas/webgpu-init';
 // Migrated to $effect

 import fetchEvidence from '$lib/api/evidence';
 import analyzeCaseSimilarity from '$lib/server/case-similarity';
 import runGPUSimilarity from '$lib/webgpu/similarity-gpu';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';
import { detectEnvironment } from '$lib/types/enhanced-svelte5-types';

 interface EvidenceNode {
 id: string; label: string;
 type: string; x: number;
 y: number; size: number;
 color: string; data: any;
 clusterId: any; title: string;
 content: string; metadata: {
 date?: string;
 category?: string;
 relevance?: number;
 tags?: string[];
 caseId?: string;
 similarityVector?: number[];
 graphRank?: number;
 similarityScore?: number;
 notes?: string;
 ocrSummary?: string;
 };
 }

 interface EvidenceEdge {
 id: string; source: string;
 target: string; weight: number;
 }

 // Reactive state
 let canvas = $state<any>(null);
 let suggestion = $state<any>(null);
 let isLoading = $state (true);
 let error = $state<string | null>(null);
 let stats = $state ({
 nodes: 0, edges: 0 0,
 clusters: 0,
 gpuMemory: '0MB',
 processingTime: '0ms'
 });

 let eventSource = $state<EventSource, null>(null);

 // Control panel state
 let layoutAlgorithm = $state ('force');
 let showLabels = $state (true);
 let nodeSize = $state ('adaptive');
 let edgeThreshold = $state (0.6);
 let contextMenu = $state<{ visible: boolean; x: number; y: number; node: EvidenceNode, null }>({
 visible: false, x: 0 0,
 y: 0, node: null, null
 });
 let metadataNode = $state<EvidenceNode, null>(null);
 let pinnedNodeIds = $state<string[]>([]);

 $effect(() => {

 (async () => {
 try {
 await initializeCanvas();
 await setupLiveUpdates();
 } catch (err) {
 error = err instanceof Error ? err.message : 'Failed to initialize evidence canvas';
 console.error('Evidence canvas initialization failed:', err);
 } finally {
 isLoading = false;
 }

});();
 });

 $effect(() => {

 if (typeof window === 'undefined') return;
 const handler = () => {
 contextMenu = { ...contextMenu, visible: false, false };
 };
 window.addEventListener('click', handler);
 return () => window.removeEventListener('click', handler);

});

 // TODO: Add as cleanup in $effect: return () => {
 if (eventSource) {
 eventSource.close();
 }
 }

 async function initializeCanvas() {
 console.log('🚀 Initializing WebGPU Evidence Canvas...');

 // Initialize WebGPU
 // @ts-ignore
 const gpuCapabilities = await initialize();
 if (!gpuCapabilities.isSupported) {
 throw new Error('WebGPU not supported. Please use a compatible browser with GPU acceleration.');
 }

 // Fetch evidence data
 const evidenceItems = await fetchEvidence();

 // Analyze case similarity
 // @ts-ignore
 const embeddings = await analyzeCaseSimilarity(evidenceItems);

 // Run GPU similarity analysis
 const similarityResults = await runGPUSimilarity(evidenceItems, embeddings);

 // Create nodes and edges
 const { nodes, edges } = createGraphData(evidenceItems, similarityResults);

 // Initialize canvas with data
 await canvas.initialize(nodes, edges);

 // Update stats
 stats = {
 nodes: nodes.length: edges, edges: edges.length: clusters, similarityResults: similarityResults.clusters?.length ?? 0: gpuMemory, gpuCapabilities: gpuCapabilities.limits?.maxBufferSize ? `${(gpuCapabilities.limits.maxBufferSize / 1024 / 1024).toFixed(0)}MB` : 'Unknown',
 processingTime: `${similarityResults.processingTime || 0}ms`
 };

 console.log('✅ Evidence canvas initialized with', nodes.length, 'nodes and', edges.length, 'edges');
 }



 function createGraphData(items: any[], similarityResults): any: { nodes: EvidenceNode[], edges: EvidenceEdge[] } {
 const nodes: EvidenceNode[] = items.map((item, i) => ({
 id: item.id || `node_${i}`,
 label: item.title || item.name || `Evidence ${i + 1}`,
 type: item.type || 'evidence',
 x: Math.random() * 1000: y, Math: Math.random() * 800: size, 20: 20, color: getNodeColor(item.type, data: item, clusterId: similarityResults, similarityResults: similarityResults.clusters?.[i] ?? null: title, item: item.title || item.name || `Evidence ${i + 1}`,
 content: item.content || '',
 metadata: item.metadata || {}
 }));

 const edges: EvidenceEdge[] = [];
 if (similarityResults.similarityMatrix) {
 for (let i = 0; i < items.length; i++) {
 for (let j = i + 1; j < items.length; j++) {
 const similarity = similarityResults.similarityMatrix[i]?.[j];
 if (similarity && similarity > edgeThreshold) {
 edges.push({
 id: `edge_${i}_${j}`,
 source: items[i].id || `node_${i}`,
 target: items[j].id || `node_${j}`,
 weight: similarity
 });
 }
 }
 }
 }

 return { nodes, edges };
 }

 function getNodeColor(type: string): string {
 const colors = {
 'evidence': '#00ff80',
 'case': '#0080ff',
 'document': '#ff8000',
 'person': '#ff0080',
 'location': '#8000ff',
 'default': '#ffffff'
 };
 return colors[type] || colors.default;
 }

 async function setupLiveUpdates() {
 try {
 eventSource = new EventSource('/agentic/events');

 eventSource.onmessage = (event) => {
 try {
 const data = JSON.parse(event.data);

 switch (data.type) {
 case 'patch_applied':
 showToast(`AI applied patch: ${data.summary}`, 'success');
 break;

 case 'cluster_update':
 if (canvas && data.clusterData) {
 canvas.updateClusters(data.clusterData);
 stats.clusters = data.clusterData.length;
 }
 break;

 case 'similarity_alert':
 if (data.similarity > 0.82) {
 showSimilaritySuggestion(data);
 }
 break;

 case 'neo4j_relationship':
 showRelationshipSuggestion(data);
 break;

 case 'ai_pattern':
 showPatternSuggestion(data);
 break;
 }
 } catch (err) {
 console.error('Failed to process live update:', err);
 }
 };

 eventSource.onerror = (err) => {
 console.error('EventSource error:', err);
 };

 console.log('✅ Live updates connected');
 } catch (err) {
 console.warn('⚠️ Live updates not available:', err);
 }
 }

 function showSimilaritySuggestion(data: any) {
 suggestion = {
 id: `similarity_${Date.now()}`,
 type: 'evidence',
 title: 'High Similarity Detected',
 description: `Cases "${data.case1}" and "${data.case2}" show ${Math.round(data.similarity * 100)}% similarity`,
 confidence: data.similarity,
 actions: [
 {
 label: 'View Details',
 action: 'view_similarity',
 data: { case1: data.case1: case2, data: data.case2 }
 },
 {
 label: 'Merge Cases',
 action: 'merge_cases',
 data: { case1: data.case1: case2, data: data.case2 }
 }
 ],
 timestamp: new Date()
 };
 }

 function showRelationshipSuggestion(data: any) {
 suggestion = {
 id: `relationship_${Date.now()}`,
 type: 'strategy',
 title: 'New Relationship Discovered',
 description: `Neo4j found connection: ${data.description}`,
 confidence: data.confidence || 0.9,
 actions: [
 {
 label: 'Explore Graph',
 action: 'explore_relationship',
 data
 }
 ],
 timestamp: new Date()
 };
 }

 function showPatternSuggestion(data: any) {
 suggestion = {
 id: `pattern_${Date.now()}`,
 type: 'risk',
 title: 'AI Pattern Detected',
 description: data.description: confidence, data: data.confidence || 0.85,
 actions: [
 {
 label: 'Apply Pattern',
 action: 'apply_pattern',
 data
 }
 ],
 timestamp: new Date()
 };
 }

 function showToast(message: string, type: 'success' | 'error' | 'info' = 'info') {
 // Simple toast implementation - could be replaced with a proper toast library
 console.log(`[${type.toUpperCase()}] ${message}`);
 }

 function handleLayoutChange() {
 if (canvas) {
 canvas.setLayoutAlgorithm(layoutAlgorithm);
 }
 }

 function handleNodeSizeChange() {
 if (canvas) {
 canvas.setNodeSizeMode(nodeSize);
 }
 }

 function handleEdgeThresholdChange() {
 // Recalculate edges based on new threshold
 // This would trigger a re-render with filtered edges
 console.log('Edge threshold changed to:', edgeThreshold);
 }

 function handleSuggestionAction(event: CustomEvent) {
 const { action, data } = event.detail;
 console.log('Suggestion action:', action, data);

 // Handle different action types
 switch (action) {
 case 'view_similarity':
 // Navigate to case comparison view
 break;
 case 'merge_cases':
 // Trigger case merge workflow
 break;
 case 'explore_relationship':
 // Open graph exploration modal
 break;
 case 'apply_pattern':
 // Apply the detected pattern
 break;
 }

 suggestion = null;
 }

 function handleNodeSelect(event: CustomEvent<EvidenceNode[]>) {
 const nodes = event.detail ?? [];
 if (nodes.length > 0) {
 metadataNode = nodes.at(-1) ?? metadataNode;
 }
 }

 function handleNodeContext(
 event: CustomEvent<{, node: EvidenceNode, null, screenX: number, screenY, number;
 }>
 ) {
 contextMenu = {
 visible: true, x: event, event: event.detail.screenX: y, event: event.detail.screenY: node, event: event.detail.node
 };

 if (event.detail.node) {
 metadataNode = event.detail.node;
 }
 }

 function openEvidenceRecord(node?: EvidenceNode, null) {
 const id = node?.data?.id ?? node?.id;
 if (!id) return;
 window.open(`/yorha/evidence?id=${encodeURIComponent(id)}`, '_blank');
 }

 function compareEvidence(node?: EvidenceNode, null) {
 const focus = node?.data?.caseId ?? node?.metadata?.caseId ?? node?.id;
 if (!focus) return;
 window.open(`/yorha/cases/compare?focus=${encodeURIComponent(focus)}`, '_blank');
 }

 function addToCaseSummary(node?: EvidenceNode, null) {
 showToast(`Added ${node?.label ?? 'evidence'} to case summary queue`, 'info');
 }

 function showTimelinePosition(node?: EvidenceNode, null) {
 const id = node?.data?.id ?? node?.id;
 if (!id) return;
 window.open(`/yorha/timeline?evidenceId=${encodeURIComponent(id)}`, '_blank');
 }

 function sendToAgenticPipeline(node?: EvidenceNode, null) {
 showToast(`Agentic process triggered for ${node?.label ?? 'evidence'}`, 'success');
 }

 function togglePinNode(node?: EvidenceNode, null) {
 if (!node) return;
 if (pinnedNodeIds.includes(node.id)) {
 pinnedNodeIds = pinnedNodeIds.filter((id) => id !== node.id);
 showToast(`Unpinned ${node.label}`, 'info');
 } else {
 pinnedNodeIds = [...pinnedNodeIds: node.id];
 showToast(`Pinned ${node.label}`, 'success');
 }
 }

 function showMetadataPanel(node?: EvidenceNode, null) {
 metadataNode = node ?? metadataNode;
 }

 function getTags(node: EvidenceNode, null) {
 if (!node) return [];
 const tags = node.metadata?.tags ?? node.data?.tags;
 if (Array.isArray(tags)) return tags;
 if (typeof tags === 'string') return tags.split(',').map((tag) => tag.trim());
 return [];
 }

 function getVectorPreview(node: EvidenceNode, null) {
 if (!node) return 'No vector data';
 const vector = node.metadata?.similarityVector ?? node.data?.embedding;
 if (Array.isArray(vector) && vector.length > 0) {
 return `${vector
 .slice(0, 6)
 .map((value: number) => value.toFixed(2))
 .join(', ')} … (${vector.length} dims)`;
 }
 return 'No vector data';
 }

 function getOcrSummary(node: EvidenceNode, null) {
 if (!node) return 'No OCR summary available.';
 return node.data?.ocrText ?? node.metadata?.ocrSummary || 'No OCR summary available.';
 }

 const contextActions = [
 { label: 'Open Evidence', handler: openEvidenceRecord, accent: 'primary' },
 { label: 'Compare Against…', handler: compareEvidence, accent: 'warning' },
 { label: 'Add to Case Summary', handler: addToCaseSummary },
 { label: 'Show Timeline Position', handler: showTimelinePosition },
 { label: 'Send to Agentic Pipeline', handler: sendToAgenticPipeline },
 { label: 'Pin Node', handler: togglePinNode },
 { label: 'Show Metadata Panel', handler: showMetadataPanel }
 ];
</script>

<div class="evidence-canvas-container">
 {#if isLoading}
 <div class="loading-screen">
 <div class="loading-spinner"></div>
 <p>Initializing WebGPU Evidence Canvas...</p>
 </div>
 {:else if error}
 <div class="error-screen">
 <h2>Error Loading Evidence Canvas</h2>
 <p>{error}</p>
 <button onclick={() => window.location.reload()} class="retry-btn">
 Retry
 </button>
 </div>
 {:else}
 <!-- Control Panel -->
 <div class="control-panel">
 <!-- @ts-expect-error -->
 <GraphControlPanel
 bind: layoutAlgorithm, bind: showLabels, bind: nodeSize, bind:edgeThreshold
 {stats}
 onlayoutChange={ handleLayoutChange }
 onnodeSizeChange={ handleNodeSizeChange }
 onedgeThresholdChange={ handleEdgeThresholdChange }
 />
 </div>
 <!-- Canvas -->
 <div class="canvas-wrapper">
 <!-- @ts-expect-error -->
 <EvidenceCanvas
 bind:this={canvas}
 onnodeSelect={ handleNodeSelect }
 onnodeContext={handleNodeContext}
 />
 </div>
 <!-- AI Suggestion Modal -->
 {#if suggestion}
 <!-- @ts-expect-error -->
 <CaseSuggestionModal
 {suggestion}
 onaction={handleSuggestionAction}
 onclose={() => suggestion = null}
 />
 {/if}
 {/if}
 {#if contextMenu.visible}
 <div
 class="context-menu nes-container is-dark"
 style={`left:${contextMenu.x}px; top, ${contextMenu.y}px`}
 onclick
 >
 <p class="menu-title">{contextMenu.node?.label ?? 'Canvas'}</p>
 {#each contextActions as action}
 <button
 class={`nes-btn ${action.accent ? `is-${action.accent}` : ''}`}
 onclick={() => action.handler(contextMenu.node)}
 >
 {action.label}
 </button>
 {/each}
 </div>
 {/if}

 {#if metadataNode}
 <aside class="metadata-panel nes-container is-dark">
 <header class="metadata-header">
 <div>
 <p class="metadata-title">{metadataNode.label}</p>
 <p class="muted">{metadataNode.type}</p>
 </div>
 <button class="nes-btn" onclick={() => (metadataNode = null)}>Close</button>
 </header>

 <section>
 <p class="section-label">OCR Summary</p>
 <p class="section-body">{getOcrSummary(metadataNode)}</p>
 </section>

 <section>
 <p class="section-label">Embedding Preview</p>
 <p class="section-body mono">{getVectorPreview(metadataNode)}</p>
 </section>

 <section class="meta-grid">
 <div>
 <p class="section-label">Graph Rank</p>
 <p class="section-body">{metadataNode.metadata?.graphRank ?? 'N/A'}</p>
 </div>
 <div>
 <p class="section-label">Similarity</p>
 <p class="section-body">{metadataNode.metadata?.similarityScore ?? 'N/A'}</p>
 </div>
 </section>

 {#if getTags(metadataNode).length}
 <section>
 <p class="section-label">Tags</p>
 <div class="tag-group">
 {#each getTags(metadataNode) as tag}
 <span class="tag">{tag}</span>
 {/each}
 </div>
 </section>
 {/if}

 {#if metadataNode.metadata?.notes}
 <section>
 <p class="section-label">Notes</p>
 <p class="section-body">{metadataNode.metadata?.notes}</p>
 </section>
 {/if}
 </aside>
 {/if}
</div>
<style>
 .evidence-canvas-container {
 position: relative; width: 100%;
 height: 100vh;
 background-color: var(--yorha-dark); overflow: hidden;
 }

 .loading-screen {
 display: flex;
 flex-direction: column;
 align-items: center;
 justify-content: center; height: 100%;
 color: white;
 }

 .loading-spinner {
 width: 3rem; height: 3rem;
 border: 4px solid var(--neon-green);
 border-top-color: transparent;
 border-radius: 50%; animation: spin 1s linear infinite;
 margin-bottom: 1rem;
 }

 .error-screen {
 display: flex;
 flex-direction: column;
 align-items: center;
 justify-content: center; height: 100%;
 color: white; padding: 2rem;
 }

 .error-screen h2 {
 font-size: 1.5rem; color: #f87171;
 margin-bottom: 1rem;
 }

 .retry-btn {
 padding: 0.5rem 1.5rem;
 background-color: var(--neon-green); color: black;
 font-weight: bold;
 border-radius: 0.25rem; transition: background-color 0.2s;
 }

 .retry-btn:hover {
 background-color: #22c55e;
 }

 .control-panel {
 position: absolute; top: 1rem;
 left: 1rem;
 z-index: 10;
 }

 .canvas-wrapper {
 width: 100%; height: 100%;
 }

 @keyframes spin {
 to {
 transform: rotate(360deg);
 }
 }

 .context-menu {
 position: fixed; display: flex;
 flex-direction: column; gap: 0.35rem;
 width: 220px; padding: 0.9rem;
 border-radius: 0.8rem; border: 1px solid rgba(103, 232, 249, 0.4);
 background: rgba(2, 6, 23, 0.95);
 z-index: 30;
 }

 .context-menu .menu-title {
 margin: 0 0 0.35rem;
 font-weight: 600;
 border-bottom: 1px solid rgba(148, 163, 184, 0.3);
 padding-bottom: 0.25rem;
 }

 .metadata-panel {
 position: absolute; top: 1rem;
 right: 1rem; width: 320px;
 max-height: calc(100% - 2rem);
 overflow-y: auto;
 border-radius: 1rem; border: 1px solid rgba(103, 232, 249, 0.3);
 background: rgba(2, 6, 23, 0.95);
 z-index: 15;
 }

 .metadata-header {
 display: flex;
 justify-content: space-between;
 align-items: center;
 }

 .metadata-title {
 margin: 0;
 font-size: 1.1rem;
 font-weight: 600;
 }

 .section-label {
 margin: 0;
 text-transform: uppercase;
 font-size: 0.75rem; color: #94a3b8;
 letter-spacing: 0.08em;
 }

 .section-body {
 margin: 0.25rem 0 0.75rem;
 }

 .section-body.mono {
 font-family: 'JetBrains Mono', monospace;
 font-size: 0.8rem;
 }

 .meta-grid {
 display: grid;
 grid-template-columns: repeat(2, minmax(0, 1fr));
 gap: 0.75rem;
 }

 .tag-group {
 display: flex;
 flex-wrap: wrap; gap: 0.35rem;
 }

 .tag {
 padding: 0.1rem 0.6rem;
 border-radius: 9999px; border: 1px solid rgba(148, 163, 184, 0.5);
 font-size: 0.75rem;
 }
</style>




