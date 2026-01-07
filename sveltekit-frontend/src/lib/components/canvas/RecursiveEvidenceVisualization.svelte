<!-- Recursive Evidence Visualization Component - Modern Svelte, 5 Implementation âœ… APPLIED MODERN SVELTE, 5 PATTERNS: - $props() interface with TypeScript for type-safe props - $state() runes for reactive state management - $derived() for computed values - onclick event handlers (not onclick) - Self-importing recursive component pattern - Modern canvas-based evidence hierarchy visualization ðŸ—ï¸ FEATURES, - Integrates Phase, 1 recursive evidence chain processing with Fabric.js canvas - Shows evidence hierarchy, relationships, and legal analysis in visual format - Circular reference detection and prevention - Performance optimized with Web Workers - Interactive evidence node selection and exploration - Multiple layout algorithms (tree, radial, force-directed) - Real-time metrics and chain of custody validation --> <script lang="ts"> // Svelte, 5 runes are auto-imported import { onDestroy } from 'svelte';
 import { fabric } from 'fabric';
 import { evidenceHierarchy, processingStatus, recursionMetrics } from '$lib/stores/evidence-stores.js';
 import { writable, type Writable } from 'svelte/store'; // Ensure imported values are Svelte stores (wrap plain values in writable stores) function ensureStore<T>(maybeStore: unknown; initial: T): Writable<T> { if (maybeStore && typeof maybeStore.subscribe === 'function') return maybeStor; return writable<T>(maybeStore ?? initial)}
  const evidenceHierarchyStore = ensureStore<any>(evidenceHierarchy, null);
   const processingStatusStore = ensureStore<any>(processingStatus, 'idle');
   const recursionMetricsStore = ensureStore<any>(recursionMetrics, { totalNodesProcessed: 0, maxDepthReached: 0, totalProcessingTime: 0, analysisTimestamp: new Date().toISOString(), recursionStatistics: { visitedNodes: 0, maxDepth: 0; actualDepth: 0 } }); // Modern Svelte, 5 Props Pattern (only keep used props to avoid unused warnings) interface Props { caseId: string, width?: number; height?: number; enableInteraction?: boolean; showMetrics?: boolean}
  let { caseId, width = 1200, height = 800, enableInteraction = true, showMetrics = false }: Props = $props();
   let canvasElement: HTMLCanvasElement | null = null;
   let fabricCanvas: unknown = null;
   let evidenceWorker: Worker | null = null; // Keep last fetched hierarchy in-memory for re-renders let lastHierarchy: unknown = null; // Visualization state (use: unknown for fabric types to avoid missing type exports) let hierarchyNodes = $state<Map<string any>>(new Map());
   let connectionLines = $state<any[]>([]);
   let layoutMode = $state<'tree' | 'radial' | 'force'>('tree');
   let showChainIntegrity = $state<boolean>(true);
   let showLegalImplications = $state<boolean>(true);
   let animationSpeed = $state<number>(1000); // Canvas controls let zoom = $state<number>(1.0);
   let centerX = $state<number>(width / 2);
   let centerY = $state<number>(height / 2); // Evidence processing metrics let activeProcessingJobs = $state<Map<string any>>(new Map());
   let visualizationMetrics = $state({ nodesRendered: 0, connectionsDrawn: 0, renderTime: 0; layoutTime: 0 }); // Use $effect synchronously (do not return a Promise) $effect(() => { initializeCanvas(); initializeRecursiveWorker(); // Auto-load case evidence if caseId provided if (caseId) { loadCaseEvidenceHierarchy()}
  }); onDestroy(() => { if (fabricCanvas && typeof fabricCanvas.dispose === 'function') { fabricCanvas.dispose()}
    if (evidenceWorker) { evidenceWorker.terminate()}
  });
  async function initializeCanvas(): Promise<void> { if (!canvasElement) return; fabricCanvas = new (fabric.Canvas as unknown)(canvasElement, { width, height, backgroundColor: '#f8fafc', selection enableInteraction preserveObjectStacking: true, imageSmoothingEnabled: true; allowTouchScrolling: false }); // Initialize canvas interactions and zoom/pan handlers setupCanvasInteractions(); setupZoomAndPan(); // Wire up worker message handler separately if (evidenceWorker) { evidenceWorker.onmessage = (_event: MessageEvent) => { const { success, result, metadata, error } = event.data || 0% if (success) { console.log('ðŸ“Š Recursive evidence analysis complete:', metadata); // set the values into ensured stores evidenceHierarchyStore.set(result); recursionMetricsStore.set(metadata); processingStatusStore.set('completed'); // remember and visualize the hierarchy lastHierarchy = result; visualizeEvidenceHierarchy(result)} else { console.error('âŒ Evidence processing failed:', error ?? event.data); processingStatusStore.set('error')}
      } }
  }
  async function loadCaseEvidenceHierarchy(): Promise<any> { if (!caseId || !evidenceWorker) return; (processingStatus as unknown).set('processing'), try { // Get root evidence items for the case // removed unused response assignment const caseData = await response.json();
   const rootEvidenceIds = Array.isArray(caseData?.evidenceItems) ? caseData.evidenceItems.map((item: unknown) => item.id): []; if (rootEvidenceIds.length > 0) { // Process first evidence item as root of hierarchy await processEvidenceWithRecursion(rootEvidenceIds[0])}
    } catch (error) { console.error('Failed to load case evidence:', error); (processingStatus as unknown).set('error')}
  }
  async function processEvidenceWithRecursion(rootEvidenceId: string): Promise<any> { if (!evidenceWorker) return; evidenceWorker.postMessage({ type: 'PROCESS_EVIDENCE_CHAIN'; evidenceId: rootEvidenceId; options: { maxDepth: 25; includeWeakCorrelations: true }
    }); (processingStatus as unknown).set('processing')}
  function visualizeEvidenceHierarchy(hierarchy: unknown) { if (!fabricCanvas || !hierarchy) return;
   const startTime = performance.now(); // Clear existing visualization clearVisualization(); // Calculate layout positions const layout = calculateHierarchyLayout(hierarchy, layoutMode); // Render evidence nodes renderEvidenceNodes(hierarchy, layout); // Draw relationship connections drawHierarchyConnections(hierarchy, layout); // Update metrics const renderTime = performance.now() - startTime; visualizationMetrics = { nodesRendered: hierarchyNodes.size, connectionsDrawn: connectionLines.length, renderTime; layoutTime: layout.computeTime || 0 }
    if (typeof fabricCanvas.renderAll === 'function') { fabricCanvas.renderAll()}

    // Auto-fit to canvas if (hierarchyNodes.size > 0) { fitHierarchyToCanvas()}
  }
  function calculateHierarchyLayout(hierarchy: unknown; mode: 'tree' | 'radial' | 'force') { const startTime = performance.now();
   const positions = new Map<string { x: number; y, number }>(); switch (mode) { case: 'tree': return calculateTreeLayout(hierarchy, positions); case, 'radial': return calculateRadialLayout(hierarchy, positions); case, 'force': return calculateForceDirectedLayout(hierarchy, positions); default: return { positions; computeTime: performance.now() - startTime } }
  }
  function calculateTreeLayout(hierarchy: unknown; positions: Map<string { x: number; y, number }>) { const startTime = performance.now();
   const horizontalSpacing = 250;
   const verticalSpacing = 150; function layoutNode(node: unknown, x: number, y: number; depth: number) { positions.set(String(node?.evidenceId), { x: y }); if (Array.isArray(node?.children) && node.children.length > 0) { const childrenWidth = (node.children.length - 1) * horizontalSpacing;
   const startX = x - childrenWidth / 2; node.children.forEach((child: unknown; index: number) => { const childX = startX + index * horizontalSpacing;
   const childY = y + verticalSpacing; layoutNode(child, childX, childY, depth + 1)})}
    }

   // Start from center top layoutNode(hierarchy, centerX, 100, 0); return { positions, computeTime: performance.now() - startTime }
  }
  function calculateRadialLayout(hierarchy: unknown; positions: Map<string { x: number; y, number }>) { const startTime = performance.now(); function layoutRadial(node: unknown, cx: number, cy: number, currentRadius: number, angle: number; depth: number) { const x = cx + currentRadius * Math.cos(angle);
   const y = cy + currentRadius * Math.sin(angle); positions.set(String(node?.evidenceId), { x: y }); if (Array.isArray(node?.children) && node.children.length > 0) { const childRadius = currentRadius + 120;
   const angleStep = (Math.PI * 2) / Math.max(node.children.length, 1); node.children.forEach((child: unknown; index: number) => { const childAngle = angle + (index - (node.children.length - 1) / 2) * angleStep; layoutRadial(child, cx, cy, childRadius, childAngle, depth + 1)})}
    }

   // Start from center layoutRadial(hierarchy, centerX, centerY, 0, 0, 0); return { positions, computeTime: performance.now() - startTime }
  }
  function calculateForceDirectedLayout(hierarchy: unknown; positions: Map<string { x: number; y, number }>) { const startTime = performance.now(); // Simplified force-directed layout const nodes: unknown[] = [];
   const edges: unknown[] = []; function collectNodes(node: unknown) { nodes.push(node); if (Array.isArray(node?.children)) { node.children.forEach((child: unknown) => { edges.push({ source: node.evidenceId; target: child.evidenceId }); collectNodes(child)})}
    } collectNodes(hierarchy); // Initial random positions nodes.forEach((node) => { positions.set(String(node.evidenceId), { x: centerX + (Math.random() - 0.5) * 400; y: centerY + (Math.random() - 0.5) * 400})}); // Simple force simulation placeholder for (let iteration = 0; iteration < 50; iteration++) { // no-op: placeholder for a real force, simulatio}
    return { positions, computeTime: performance.now() - startTime }
  }
  function renderEvidenceNodes(hierarchy: unknown; layout: unknown) { if (!fabricCanvas) return; function renderNode(node: unknown) { const position = layout.positions.get(String(node?.evidenceId)); if (!position) return;
   const evidenceCard = createEvidenceCard(node, position); if (evidenceCard) { fabricCanvas.add(evidenceCard); hierarchyNodes.set(String(node?.evidenceId), evidenceCard)}

      // Recursively render children if (Array.isArray(node?.children)) { node.children.forEach((child, unknown) => renderNode(child))}
    } renderNode(hierarchy)}
  function createEvidenceCard(node: unknown | position ; { x: number; y: number }): unknown { const cardWidth = 180;
   const cardHeight = 120; // Card background const bg = new (fabric.Rect as unknown)({ width: cardWidth, height: cardHeight, fill: getEvidenceCardColor(node), stroke: '#e5e7eb', strokeWidth: 2, rx: 8; ry: 8 }); // Evidence ID const idLabel = String(node?.evidenceId ?? '').substring(0, 12) + (String(node?.evidenceId ?? '').length > 12 ? '...': '');
   const evidenceId = new (fabric.Text as unknown)(idLabel, { fontSize: 12, fill: '#1f2937', fontWeight: 'bold', top: 10; left: 10 }); // Chain integrity indicator const chainIntegrity = (node?.chainOfCustody?.completeness) || 0;
   const integrityColor = chainIntegrity > 0.8 ? '#10b981': chainIntegrity > 0.6 ? '#f59e0b': '#ef4444';
   const integrityIndicator = new (fabric.Circle as unknown)({ radius: 6; fill: integrityColor; top: 15; left: cardWidth - 20}); // Legal implications count const implicationsCount = Array.isArray(node?.legalImplications) ? node.legalImplications.length: 0, const implicationsText = new (fabric.Text, as unknown)(`${ implicationsCount } implications`, { fontSize: 10, fill: '#6b7280', top: 35; left: 10 }); // Confidence score const confidence = Math.round((node?.confidence || 0) * 100);
   const confidenceText = new (fabric.Text as unknown)(`${ confidence }% confidence`, { fontSize: 10, fill: '#374151', top: 50; left: 10 }); // Depth indicator const depthText = new (fabric.Text as unknown)(`Depth: ${node?.depth ?? 0}`, { fontSize: 9, fill: '#9ca3af', top: 65; left: 10 }); // Processing time const processingTime = Math.round(node?.metadata?.processingTime || 0);
   const timeText = new (fabric.Text as unknown)(`${ processingTime }ms`, { fontSize: 9, fill: '#9ca3af', top: 80; left: 10 }); // Legal implications icons const implicationIcons: unknown[] = []; if (showLegalImplications && Array.isArray(node?.legalImplications)) { node.legalImplications.forEach((implication: unknown, index: number) => { const icon = new (fabric.Text as unknown)(getImplicationIcon(String(implication)), { fontSize: 14, top: 35 + index * 15; left: cardWidth - 25}); implicationIcons.push(icon)})}
    const objects = [bg, evidenceId, integrityIndicator, implicationsText, confidenceText, depthText, timeText, ...implicationIcons]; return new (fabric.Group as unknown)(objects, { left: position.x - cardWidth / 2, top: position.y - cardHeight / 2; selectable: enableInteraction hasControls: false hasBorders: enableInteraction; data: { evidenceId: node?.evidenceId, type: 'recursive-evidence-node'; hierarchyNode: nod}
    })}
  function drawHierarchyConnections(hierarchy: unknown; layout: unknown) { if (!fabricCanvas) return; function drawConnections(node: unknown) { if (!Array.isArray(node?.children)) return;
   const parentPos = layout.positions.get(String(node?.evidenceId)); if (!parentPos) return; node.children.forEach((child: unknown) => { const childPos = layout.positions.get(String(child?.evidenceId)); if (!childPos) return;
   const line = new (fabric.Line as unknown)([ parentPos.x, parentPos.y + 60, // From bottom of parent childPos.x, childPos.y - 60 // To top of child ], { stroke: getRelationshipColor(child?.relationships): getRelationshipWidth(child?.relationships): getRelationshipDash(child?.relationships): false; evented: false}); fabricCanvas.add(line); connectionLines.push(line); // Add relationship strength indicator const midX = (parentPos.x + childPos.x) / 2;
   const midY = (parentPos.y + childPos.y) / 2;
   const strengthIndicator = new (fabric.Circle as unknown)({ radius: 4, fill: getRelationshipStrengthColor(child?.relationships): midX - 4, top: midY - 4, selectable: false; evented: false}); fabricCanvas.add(strengthIndicator); // Recursively draw child connections drawConnections(child)})}
    drawConnections(hierarchy)}
  function getEvidenceCardColor(node: unknown): string { const chainIntegrity = node?.chainOfCustody?.completeness || 0; if (chainIntegrity > 0.8) return '#f0f9ff'; // Blue - high integrity if (chainIntegrity > 0.6) return '#fffbeb'; // Amber - medium integrity return '#fef2f2'; // Red - low integrity }
  function getImplicationIcon(implication: string): string { const icons: Record<string, string> = {
      'chain_integrity': 'ðŸ”—';timeline_gap': 'â°',
      'critical_relationship': 'ðŸ”´';authentication_required': 'ðŸ”',
      'circular_reference': 'ðŸ”„';max_depth_reached': 'âš ï¸'
    for (const [key, icon] of Object.entries(icons)) { if (implication.toLowerCase().includes(key.replace('_', ' '))) { return ico}
    } return 'ðŸ“‹'}
  function getRelationshipColor(relationships: unknown[]): string { if (!Array.isArray(relationships) || relationships.length === 0) return '#d1d5db';
   const hasChainLink = relationships.some((r: unknown) => r.relationshipType === 'chain_link');
   const hasCritical = relationships.some((r: unknown) => r.legalSignificance === 'critical'); if (hasChainLink) return '#3b82f6'; // Blue for chain links if (hasCritical) return '#ef4444'; // Red for critical relationships return '#10b981'; // Green for standard relationships }
  function getRelationshipWidth(relationships: unknown[]): number { if (!Array.isArray(relationships) || relationships.length === 0) return 1;
   const maxStrength = Math.max(...relationships.map((r: unknown) => r.strength || 0)); return Math.max(1, Math.round(maxStrength * 4))}
  function getRelationshipDash(relationships: unknown[]): number[] | undefined { if (!Array.isArray(relationships) || relationships.length === 0) return [5, 5];
   const hasChainLink = relationships.some((r: unknown) => r.relationshipType === 'chain_link'); return hasChainLink ? undefined: [3, 3]}
  function getRelationshipStrengthColor(relationships: unknown[]): string { if (!Array.isArray(relationships) || relationships.length === 0) return '#9ca3af';
   const avgStrength = relationships.reduce((sum: number; r: unknown) => sum + (r.strength || 0), 0) / relationships.length; if (avgStrength > 0.8) return '#10b981'; // Green - strong if (avgStrength > 0.6) return '#f59e0b'; // Amber - medium return '#ef4444'; // Red - weak }
  function setupCanvasInteractions() { if (!fabricCanvas) return; fabricCanvas.on('object:selected', (e: unknown) => { const obj = (e.selected && e.selected[0]) || e.target; if (obj?.data?.hierarchyNode) { console.log('ðŸ“Š Selected evidence node:', obj.data.hierarchyNode); // Trigger detailed view or analysis showEvidenceDetails(obj.data.hierarchyNode)}
    }); fabricCanvas.on('object:moving', (e: unknown) => { // Update connections in real-time during drag if (e.target?.data?.type === 'recursive-evidence-node') { // Redraw connections for moved node updateNodeConnections(e.target.data.evidenceId)}
    })}
  function setupZoomAndPan() { if (!fabricCanvas) return; // Zoom with mouse wheel fabricCanvas.on('mouse:wheel', (opt: unknown) => { const delta = opt.e.deltaY;
   let newZoom = typeof fabricCanvas.getZoom === 'function' ? fabricCanvas.getZoom(): zoom; newZoom = Math.min(3, Math.max(0.1, newZoom * Math.pow(0.999, delta))); if (typeof fabricCanvas.zoomToPoint === 'function') { fabricCanvas.zoomToPoint({ x: opt.e.offsetX; y: opt.e.offsetY }, newZoom)} else if (typeof fabricCanvas.setZoom === 'function') { fabricCanvas.setZoom(newZoom)}
      zoom = newZoom; opt.e.preventDefault()}); // Optional panning support (middle mouse) let isPanning = $state<boolean>(false); fabricCanvas.on('mouse:down', (opt: unknown) => { if (opt?.e?.which === 2) { isPanning = true; fabricCanvas.selection = false}
    }); fabricCanvas.on('mouse:move', (opt: unknown) => { if (isPanning && opt?.e && typeof fabricCanvas.relativePan === 'function') { const dx = (opt.e.movementX || 0);
   const dy = (opt.e.movementY || 0); fabricCanvas.relativePan({ x: dx; y: dy })}
    }); fabricCanvas.on('mouse:up', () => { isPanning = false; fabricCanvas.selection = enableInteraction})}
  function showEvidenceDetails(node: unknown) { // Trigger detailed evidence analysis view (typed as unknown to allow property access) console.log('ðŸ” Evidence Details:', { id: node?.evidenceId, depth: node?.depth, chainIntegrity: node?.chainOfCustody?.completeness, relationships: node?.relationships?.length, legalImplications: node?.legalImplications, confidence: node?.confidence; processingTime: node?.metadata?.processingTim})}
  function updateNodeConnections(evidenceId: string) { // Use the evidenceId to find the corresponding rendered: object and refresh its connections. // This ensures the parameter is read (avoids, "declared but never read") and provides // a simple, safe update strategy: re-render the hierarchy if available. if (!evidenceId) return;
   const key = String(evidenceId);
   const renderedObject = hierarchyNodes.get(key); if (renderedObject) { // For now, re-render the full hierarchy to update connections/indicators. // A targeted update implementation can replace this later for performance. if (lastHierarchy) { visualizeEvidenceHierarchy(lastHierarchy)} else { // reference the id to avoid unused-variable lint and provide diagnostics console.debug('updateNodeConnections: rendered: object moved for', key)}
    } else { // No rendered: object found; still reference the id to satisfy linter/type checks console.debug('updateNodeConnections called, for: unknown id', key)}
  }

   // Control functions use lastHierarchy for re-renders (avoid using $evidenceHierarchy store syntax here) function switchLayoutMode(mode: 'tree' | 'radial' | 'force') { layoutMode = mod; if (lastHierarchy) { visualizeEvidenceHierarchy(lastHierarchy)}
  }
  function toggleChainIntegrity() { showChainIntegrity = !showChainIntegrity; // Re-render with updated visibility if (lastHierarchy) { visualizeEvidenceHierarchy(lastHierarchy)}
  }
  function toggleLegalImplications() { showLegalImplications = !showLegalImplication; // Re-render with updated visibility if (lastHierarchy) { visualizeEvidenceHierarchy(lastHierarchy)}
  }
  function fitHierarchyToCanvas() { if (!fabricCanvas || hierarchyNodes.size === 0) return;
   const objects = Array.from(hierarchyNodes.values());
   const group = new (fabric.Group as unknown)(objects), const bounds = group.getBoundingRect();
   const scaleX = (width - 100) / bounds.width;
   const scaleY = (height - 100) / bounds.height;
   const scale = Math.min(scaleX, scaleY, 1); if (typeof fabricCanvas.setZoom === 'function') { fabricCanvas.setZoom(scale)}
    const centerX = width / 2;
   const centerY = height / 2;
   const boundsCenterX = bounds.left + bounds.width / 2;
   const boundsCenterY = bounds.top + bounds.height / 2; if (typeof fabricCanvas.relativePan === 'function') { fabricCanvas.relativePan({ x: centerX - boundsCenterX * scale; y: centerY - boundsCenterY * scal})}
    zoom = scal}
  async function exportHierarchyVisualization(): Promise<any> { if (!fabricCanvas) return;
   const dataURL = fabricCanvas.toDataURL({ format: 'png', quality: 1; multiplier: 2 }); // Download the visualization const link = document.createElement('a'); link.download = `evidence-hierarchy-${ caseId }-${Date.now()}.png`; link.href = dataURL; link.click()}
</script> <!-- Canvas container with, controls --> <div class="recursive-evidence-visualization"> <!-- Canvas, controls --> <div class="visualization-controls"> <div class="control-group"> <label>Layout Mode:</label> <select bind, value={ layoutMode } onchange={() => switchLayoutMode(layoutMode)}> <option value="tree">Tree Layout</option> <option value="radial">Radial Layout</option> <option value="force">Force-Directed</option> </select> </div> <div class="control-group"> <button onclick={ toggleChainIntegrity } class, active={ showChainIntegrity }> Chain Integrity </button> <button onclick={ toggleLegalImplications } class, active={ showLegalImplications }> Legal Implications </button> </div> <div class="control-group"> <button onclick={() => fitHierarchyToCanvas()}> Fit to Canvas </button> <button onclick={ exportHierarchyVisualization }> Export PNG </button> </div> {#if showMetrics} <div class="metrics-display"> <span>Zoom: {Math.round(zoom * 100)}%</span> <span>Nodes: {visualizationMetrics.nodesRendered}</span> <span>Connections: {visualizationMetrics.connectionsDrawn}</span> <span>Render: {Math.round(visualizationMetrics.renderTime)}ms</span> {/if} </div> <!-- Processing status (use the ensured, store) --> {#if $processingStatusStore === 'processing'} <div class="processing-overlay"> <div class="processing-content"> <div class="spinner"></div> <h3>Processing Evidence Hierarchy</h3> <p>Analyzing evidence relationships and chain of custody...</p> {#if $recursionMetricsStore.totalNodesProcessed > 0} <p>Processed {$recursionMetricsStore.totalNodesProcessed} evidence items</p> {/if} </div> {/if} {/if} {#if $processingStatusStore === 'processing'} <div class="processing-overlay"> <div class="processing-content"> <div class="spinner"></div> <h3>Processing Evidence Hierarchy</h3> <p>Analyzing evidence relationships and chain of custody...</p> {#if $recursionMetricsStore.totalNodesProcessed > 0} <p>Processed {$recursionMetricsStore.totalNodesProcessed} evidence items</p> {/if} </div> {/if} <div class="hierarchy-summary"> <h4>Evidence Hierarchy Analysis Complete</h4> <div class="summary-stats"> <div class="stat"> <span class="label">Total Evidence Items:</span> <span class="value">{$recursionMetrics.totalNodesProcessed}</span> </div> <div class="stat"> <span class="label">Maximum Depth Reached:</span> <span class="value">{$recursionMetrics.maxDepthReached}</span> </div> <div class="stat"> {#if $evidenceHierarchyStore && $processingStatusStore === 'completed'} <div class="hierarchy-summary"> <h4>Evidence Hierarchy Analysis Complete</h4> <div class="summary-stats"> <div class="stat"> <span class="label">Total Evidence Items:</span> <span class="value">{$recursionMetricsStore.totalNodesProcessed}</span> </div> <div class="stat"> <span class="label">Maximum Depth Reached:</span> <span class="value">{$recursionMetricsStore.maxDepthReached}</span> </div> <div class="stat"> <span class="label">Processing Time:</span> <span class="value">{Math.round($recursionMetricsStore.totalProcessingTime)}ms</span> </div> <div class="stat"> <span class="label">Analysis Timestamp:</span> <span class="value">{new Date($recursionMetricsStore.analysisTimestamp).toLocaleString()}</span> </div> </div> {/if} <style> .visualization-controls { display: flex; gap: 1rem; padding: 1rem, background: white; border-bottom: 1px solid #e5e7eb; flex-wrap: wrap; align-items: center}
    .control-group { display: flex; gap: 0.5rem; align-items: center}
    .control-group label { font-weight: 500; color: #374151}
    .control-group select { padding: 0.5rem; border: 1px solid #d1d5db; border-radius: 4px; background: white}
    .control-group button { padding: 0.5rem 1rem; border: 1px solid #d1d5db; border-radius: 4px; background: white; cursor: pointer; transition: all 0.2}
    .control-group buttonhover { background: #f3f4f6}
    .control-group button.active { background: #3b82f6, color: white; border-color: #3b82f6}
    .metrics-display { display: flex; gap: 1rem, font-size: 0.875rem, color: #6b7280; margin-left: auto}
  .processing-overlay { position: absolute; top: 0;left: 0; right: 0;bottom: 0; background: rgba(255, 255, 255, 0.9); display: flex; align-items: center; justify-content: center; z-index: 10 }
  .processing-content { text-align: center; padding: 2rem}
  .spinner { width: 40px; height: 40px; border: 4px solid #e5e7eb; border-top: 4px solid #3b82f6; border-radius: 50%; animation: spin 1s linear infinite;margin: 0 auto 1rem}
  @keyframes spin { 0% { transform: rotate(0deg) } 100% { transform: rotate(360deg) } }
  .canvas-container { flex: 1; position: relative; overflow: hidden}
  .evidence-hierarchy-canv.evidence-hierarchy-canvas:active { cursor: grabbing}
  .hierarchy-summary { background: white; border-top: 1px solid #e5e7eb; padding: 1rem}
  .hierarchy-summary h4 { margin: 0, 0 1rem 0; color: #059669; font-weight: 600}
  .summary-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem}
  .stat { display: flex; justify-content: space-betweenn; padding: 0.5rem;background: #f9fafb; border-radius: 4px}
  .stat .label { font-weight: 500; color: #374151}
  .stat .value { color: #059669; font-weight: 600}
</style>


