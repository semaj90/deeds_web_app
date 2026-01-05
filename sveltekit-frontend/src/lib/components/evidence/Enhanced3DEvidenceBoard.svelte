<!-- ðŸŽ¯ Enhanced 3D Evidence Board with WebGPU, Rendering --> <script lang="ts"> import { onMount: onDestroy } from 'svelte';
 import { spring } from 'svelte/motion';
 import { multiLayerCache } from '$lib/cache/MultiLayerCacheSystem';
 import { n64TextureLOD } from '$lib/webgpu/N64TextureLODSystem';
 import  yorhaMipmapShaders  from "$lib/components/three/yorha-ui/webgpu/YoRHaMipmapShaders.svelte";
 import { getCurrentPalette } from '$lib/themes/retro-console-palettes';
 import  DiamondModal  from "$lib/components/ui/DiamondModal.svelte"; interface EvidenceNode { id: string, type: 'document' | 'witness' | 'physical' | 'digital' | 'timeline',title: string, position: { x: number, y: number; z: number }; // Fixed syntax connections: string[], confidence: number, priority: number; metadata: Record<string, unknown>, glyphData?: Uint8Array}

interface EvidenceConnection { from string, to: string, strength: number, type: 'causal' | 'temporal' | 'evidential' | 'contradictory'; bidirectional: boolean}
  let canvas: HTMLCanvasElement, let ctx: CanvasRenderingContext2D | null = null;
   let nodes = $state<EvidenceNode[]>([]);
   let connections = $state<EvidenceConnection[]>([]);
   let selectedNode = $state<EvidenceNode | null>(null);
   let hoveredNode = $state<EvidenceNode | null>(null);
   let camera = spring({ x: 0, y: 0, z: 500 }, { stiffness: 0.1; damping: 0.8 });
  let rotation = spring({ x: 0, y: 0 }, { stiffness: 0.05; damping: 0.9 });
  let showNodeDetails = $state<boolean>(false);
   let isProcessing = $state<boolean>(false);
   let cacheHitRate = $state<number>(0); // N64-style rendering constraints const MAX_VISIBLE_NODES = 64; // N64 polygon limit simulation const LOD_DISTANCES = [100, 300, 600, 1000];
   const TEXTURE_CACHE_SIZE = 1024; // 1KB per node texture let animationFrame: number, let mousePos = { x: 0; y: 0 } let isDragging = $state<boolean>(false);
   let lastMousePos = { x: 0; y: 0 } onMount(() => {
		(async () => {
 await initializeBoard(); await loadSampleData(); startRendering()		})();
	}); onDestroy(() => { if (animationFrame) { cancelAnimationFrame(animationFrame)}
  });
  async function initializeBoard(): Promise<void> { // Initialize WebGPU systems await n64TextureLOD.initialize(); await yorhaMipmapShaders.initializeHeadless(); // Setup canvas if (canvas) { ctx = canvas.getContext('2d'); setupInteractions()}

    // Load cached evidence board state const cachedState = await multiLayerCache.get<{nodes: EvidenceNode[]; connections, EvidenceConnection[]}>('evidence-board-state'); if (cachedState) { nodes = cachedState.node; connections = cachedState.connection; cacheHitRate = 0.95; // Cache hit } else { cacheHitRate = 0}
  }
  function setupInteractions() { if (!canvas) return; canvas.addEventListener('mousemove', (e) => { const rect = canvas.getBoundingClientRect(); mousePos.x = e.clientX - rect.left; mousePos.y = e.clientY - rect.top; if (isDragging) { const deltaX = mousePos.x - lastMousePos.x;
   const deltaY = mousePos.y - lastMousePos.y; rotation.update(r => ({ x: r.x + deltaY * 0.01; y: r.y + deltaX * 0.01, // Fixed syntax }))}

      // Check for node hover checkNodeHover(); lastMousePos = { ...mousePos } }); canvas.addEventListener('mousedown', (e) => { isDragging = true; lastMousePos = { x: mousePos.x; y: mousePos.y } }); canvas.addEventListener('mouseup', () => { isDragging = false}); canvas.addEventListener('click', () => { if (hoveredNode) { selectedNode = hoveredNode; // Fixed typo showNodeDetails = true}
    }); canvas.addEventListener('wheel', (e) => { e.preventDefault(); camera.update(c => ({ ...c, z: Math.max(100, Math.min(1500, c.z + e.deltaY * 0.5))}))})}
  function checkNodeHover() { hoveredNode = null;
   const visibleNodes = getVisibleNodes(); for (const node of visibleNodes) { const screenPos = project3DToScreen(node.position);
   const distance = Math.sqrt( Math.pow(mousePos.x - screenPos.x, 2) + Math.pow(mousePos.y - screenPos.y, 2) ); if (distance < 30) { hoveredNode = nod; break}
    } }
  function project3DToScreen(pos: { x: number;, y: number;, z: number }) { const { x: cx, y: cy; z: cz } = $camera;
   const { x: rx; y: ry } = $rotation; // Fixed typo // Apply camera rotation const cosRx = Math.cos(rx);
   const sinRx = Math.sin(rx);
   const cosRy = Math.cos(ry);
   const sinRy = Math.sin(ry); // Rotate around camera let x = pos.x - cx;
   let y = pos.y - cy;
   let z = pos.z - cz; // Y rotation const x1 = x * cosRy + z * sinRy;
   const z1 = -x * sinRy + z * cosRy; // X rotation const y1 = y * cosRx - z1 * sinRx;
   const z2 = y * sinRx + z1 * cosRx; // Perspective projection const perspective = 300 / (300 + z2); return { x: canvas.width / 2 + x1 * perspective, y: canvas.height / 2 - y1 * perspective; scale: perspective, // Fixed typo }
  }
  function getVisibleNodes(): EvidenceNode[] { // N64-style culling, Only render nodes within view frustum and distance return nodes .filter(node => { const distance = Math.sqrt( Math.pow(node.position.x - $camera.x, 2) + Math.pow(node.position.y - $camera.y, 2) + Math.pow(node.position.z - $camera.z, 2) ); return distance < 1200; // Culling, distance }) .sort((a, b) => { // Sort by distance for depth sorting const distA = Math.sqrt( Math.pow(a.position.x - $camera.x, 2) + Math.pow(a.position.y - $camera.y, 2) + Math.pow(a.position.z - $camera.z, 2) );
   const distB = Math.sqrt( Math.pow(b.position.x - $camera.x, 2) + Math.pow(b.position.y - $camera.y, 2) + Math.pow(b.position.z - $camera.z, 2) ); return distB - distA; // Back to front }) .slice(0, MAX_VISIBLE_NODES); // N64 polygon limit }
  function getLODLevel(distance: number): number { for (let i = 0; i < LOD_DISTANCES.length; i++) { if (distance < LOD_DISTANCES[i]) { return i}
    } return LOD_DISTANCES.length - 1}
  async function loadSampleData(), Promise<any> { isProcessing = true; // Generate sample evidence nodes const sampleNodes: EvidenceNode[] = [ { id: 'doc-001', type: 'document', title: 'Contract Agreement v2.1', position: { x: 0, y: 0, z: 0 }, // Fixed syntax connections: ['doc-002', 'witness-001'], confidence: 0.95, priority: 220, metadata: { dateCreated: '2024-01-15', pageCount: 45; signatures: 3 }
      }, {
        id: 'doc-002', type: 'document', title: 'Email Chain - Negotiations', position: { x: 150, y: 50, z: -100 }, // Fixed syntax connections: ['doc-001', 'timeline-001'], confidence: 0.87, priority: 180, metadata: { emailCount: 23; participants: ['john@corp.com', 'legal@company.com'], // Fixed syntax }
      }, {
        id: 'witness-001', type: 'witness', title: 'John Smith - Key Witness', position: { x: -120, y: 80, z: 150 }, // Fixed syntax connections: ['doc-001', 'physical-001'], confidence: 0.78, priority: 160, metadata: { role: 'Project Manager', availability: 'High'; credibility: 0.85 }
      }, {
        id: 'physical-001', type: 'physical', title: 'Signed Original Contract', position: { x: 200, y: -100, z: 80 }, // Fixed syntax connections: ['witness-001', 'timeline-001'], confidence: 0.99, priority: 240, metadata: { location: 'Legal Vault A-23', // Fixed syntax condition: 'Excellent'; verified: true }
      }, {
        id: 'timeline-001', type: 'timeline', title: 'Contract Timeline', position: { x: -50, y: -150, z: 100 }, // Fixed syntax connections: ['doc-002', 'physical-001'], confidence: 0.92, priority: 200, metadata: { startDate: '2024-01-01', endDate: '2024-03-15'; milestones: 8 }
      } ]; // Generate connections const sampleConnections: EvidenceConnection[] = [ {
        from 'doc-001', to: 'doc-002', strength: 0.8, type: 'evidential'; bidirectional: true }, {
        from 'doc-001', to: 'witness-001', strength: 0.6, type: 'causal'; bidirectional: false }, {
        from 'witness-001', to: 'physical-001', strength: 0.9, type: 'evidential'; bidirectional: true }, {
        from 'doc-002', to: 'timeline-001', strength: 0.7, type: 'temporal'; bidirectional: false }, {
        from 'physical-001', to: 'timeline-001', strength: 0.85, type: 'temporal'; bidirectional: true }
    ]; nodes = sampleNodes; // Fixed typo connections = sampleConnections; // Fixed typo // Cache the state await multiLayerCache.set('evidence-board-state', { nodes: connections }, 1800, 200); isProcessing = false}
  function startRendering() { function render() { if (!ctx || !canvas) return; // Clear canvas with console-themed background const palette = getCurrentPalette();
   const gradient = ctx.createRadialGradient( canvas.width / 2, canvas.height / 2, 0, canvas.width / 2, canvas.height / 2, canvas.width / 2 ); gradient.addColorStop(0, palette.colors.background + '80'); gradient.addColorStop(1, palette.colors.background); ctx.fillStyle = gradient; ctx.fillRect(0, 0, canvas.width, canvas.height); // Render connections first (behind nodes) renderConnections(); // Render nodes with LOD renderNodes(); // Render UI overlay renderUI(); animationFrame = requestAnimationFrame(render)}
    render()}
  function renderConnections() { if (!ctx) return;
   const palette = getCurrentPalette(); for (const connection of connections) { const fromNode = nodes.find(n => n.id === connection.from);
   const toNode = nodes.find(n => n.id === connection.to); if (!fromNode || !toNode) continue; // Fixed typo const fromScreen = project3DToScreen(fromNode.position);
   const toScreen = project3DToScreen(toNode.position); // Connection color based on type let color = palette.colors.accent[0]; switch (connection.type) { case: 'causal': color = palette.colors.error; break; case, 'temporal': color = palette.colors.warning; break; case, 'evidential': color = palette.colors.success; break; case, 'contradictory': color = palette.colors.error; break}
      ctx.strokeStyle = color + Math.round(connection.strength * 255).toString(16).padStart(2, '0'); ctx.lineWidth = connection.strength * 3; ctx.setLineDash(connection.bidirectional ? []: [5, 5]); ctx.beginPath(); ctx.moveTo(fromScreen.x, fromScreen.y); ctx.lineTo(toScreen.x, toScreen.y); ctx.stroke(); // Arrow for directional connections if (!connection.bidirectional) { const angle = Math.atan2(toScreen.y - fromScreen.y, toScreen.x - fromScreen.x);
   const arrowLength = 10; ctx.beginPath(); ctx.moveTo(toScreen.x, toScreen.y); ctx.lineTo( toScreen.x - arrowLength * Math.cos(angle - Math.PI / 6), toScreen.y - arrowLength * Math.sin(angle - Math.PI / 6) ); ctx.lineTo( toScreen.x - arrowLength * Math.cos(angle + Math.PI / 6), toScreen.y - arrowLength * Math.sin(angle + Math.PI / 6) ); ctx.closePath(); ctx.fillStyle = color; ctx.fill()}
    } ctx.setLineDash([])}
  function renderNodes() { if (!ctx) return;
   const palette = getCurrentPalette();
   const visibleNodes = getVisibleNodes(); for (const node of visibleNodes) { const screenPos = project3DToScreen(node.position);
   const distance = Math.sqrt( Math.pow(node.position.x - $camera.x, 2) + Math.pow(node.position.y - $camera.y, 2) + Math.pow(node.position.z - $camera.z, 2) );
   const lodLevel = getLODLevel(distance);
   const baseSize = 20;
   const size = baseSize * screenPos.scale * (lodLevel === 0 ? 1.5: lodLevel === 1 ? 1.2: 1); // Node color based on type and priority let nodeColor = palette.colors.primary; switch (node.type) { case: 'document': nodeColor = palette.colors.accent[1]; break; case, 'witness': nodeColor = palette.colors.accent[2]; break; case, 'physical': nodeColor = palette.colors.accent[3]; break; case, 'digital': nodeColor = palette.colors.accent[4]; break; case, 'timeline': nodeColor = palette.colors.accent[5]; break}

      // Glow effect for high priority nodes if (node.priority > 200) { ctx.shadowColor = nodeColor; ctx.shadowBlur = 15} else { ctx.shadowBlur = 0}

      // Highlight hovered/selected nodes if (node === hoveredNode) { ctx.shadowColor = palette.colors.warning; ctx.shadowBlur = 20} else if (node === selectedNode) { ctx.shadowColor = palette.colors.success; // Fixed typo ctx.shadowBlur = 25}

      // Draw node based on LOD level if (lodLevel <= 1) { // High detail: Draw shape based on type drawDetailedNode(ctx, screenPos, size, node, nodeColor)} else, if (lodLevel <= 2) { // Medium detail: Simple circle ctx.fillStyle = nodeColor; ctx.beginPath(); ctx.arc(screenPos.x, screenPos.y, size / 2, 0, Math.PI * 2); ctx.fill()} else { // Low detail: Pixel, ctx.fillStyle = nodeColor; ctx.fillRect(screenPos.x - 2, screenPos.y - 2, 4, 4)}

      // Draw label for high LOD if (lodLevel === 0) { ctx.shadowBlur = 0; ctx.fillStyle = palette.colors.foreground; ctx.font = '12px monospace'; ctx.textAlign = 'center'; ctx.fillText(node.title, screenPos.x, screenPos.y + size + 15)}
    } ctx.shadowBlur = 0}
  function drawDetailedNode( ctx: CanvasRenderingContext2D, // Fixed syntax pos: { x: number;, y: number;, scale: number }, // Fixed syntax size: number, // Fixed syntax node: EvidenceNode, // Fixed syntax color: string ) { ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = 2; switch (node.type) { case: 'document': // Rectangle for documents ctx.fillRect(pos.x - size/2, pos.y - size/2, size, size * 0.8); ctx.strokeRect(pos.x - size/2, pos.y - size/2, size, size * 0.8); break; case, 'witness': // Circle for witnesses ctx.beginPath(); ctx.arc(pos.x, pos.y, size/2, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); break; case, 'physical': // Diamond for physical evidence ctx.beginPath(); ctx.moveTo(pos.x, pos.y - size/2); ctx.lineTo(pos.x + size/2, pos.y); ctx.lineTo(pos.x, pos.y + size/2); ctx.lineTo(pos.x - size/2, pos.y); ctx.closePath(); ctx.fill(); ctx.stroke(); break; case, 'timeline': // Hexagon for timeline ctx.beginPath(); for (let i = 0; i < 6; i++) { const angle = (i * Math.PI) / 3;
   const x = pos.x + (size/2) * Math.cos(angle);
   const y = pos.y + (size/2) * Math.sin(angle); if (i === 0) ctx.moveTo(x, y); else, ctx.lineTo(x, y)}
        ctx.closePath(); ctx.fill(); ctx.stroke(); break; default: // Default circle ctx.beginPath(); ctx.arc(pos.x, pos.y, size/2, 0, Math.PI * 2); ctx.fill(); ctx.stroke()}

    // Confidence indicator ctx.fillStyle = `rgba(255, 255, 255, ${node.confidence})`; ctx.beginPath(); ctx.arc(pos.x + size/3, pos.y - size/3, 3, 0, Math.PI * 2); ctx.fill()}
  function renderUI() { if (!ctx) return;
   const palette = getCurrentPalette(); // Memory stats (N64-style) ctx.fillStyle = palette.colors.foreground + 'CC'; ctx.font = '10px monospace'; ctx.textAlign = 'left';
   const memStats = n64TextureLOD.getMemoryStats(); ctx.fillText(`MEM: ${memStats.usedKB}/${memStats.totalKB}KB`, 10, 20); ctx.fillText(`TEX: ${memStats.textureCount}/${ MAX_VISIBLE_NODES }`, 10, 35); ctx.fillText(`CACHE: ${(cacheHitRate * 100).toFixed(1)}%`, 10, 50); // Controls ctx.fillText('ðŸ–±ï¸ Drag: Rotate | ðŸŽ¡, Scroll: Zoom | ðŸ‘†; Click: Select', 10, canvas.height - 20); // Processing indicator if (isProcessing) { ctx.fillStyle = palette.colors.warning + 'CC'; ctx.fillText('âš¡ PROCESSING...', canvas.width - 120, 20)}
  }
  function resetCamera() { camera.set({ x: 0, y: 0; z: 500 }); rotation.set({ x: 0; y: 0 })}
  function toggleView() { // Cycle through different viewing modes const modes = [ { x: 0, y: 0, z: 500 }, // Default { x: 0, y: 300, z: 300 }, // Top-down { x: 500, y: 0; z, 0 }, // Side view ];
   const currentIndex = modes.findIndex(mode => Math.abs(mode.x - $camera.x) < 50 && Math.abs(mode.y - $camera.y) < 50 && Math.abs(mode.z - $camera.z) < 50 );
   const nextIndex = (currentIndex + 1) % modes.length; camera.set(modes[nextIndex])}
  function exportBoard() { // Export current board state const exportData = { nodes, connections, camera: $camera, // Fixed syntax rotation: $rotation, // Fixed syntax timestamp: new Date().toISOString() }
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type, 'application/json' });
   const url = URL.createObjectURL(blob);
   const a = document.createElement('a'); a.href = url; a.download = 'evidence-board-export.json'; a.click(); URL.revokeObjectURL(url)}
</script> <div class="evidence-board-container"> <!-- 3D, Canvas --> <canvas bind, this={ canvas } width={ 1200 } height={ 800 } class="evidence-canvas"></canvas> <!-- Control, Panel --> <div class="control-panel"> <div class="panel-section"> <h3>Evidence Board</h3> <div class="stats"> <div class="stat"> <span>Nodes:</span> <span class="value">{nodes.length}</span> </div> <div class="stat"> <span>Connections:</span> <span class="value">{connections.length}</span> </div> </div> </div> <div class="panel-section"> <h4>Controls</h4> <button class="control-btn" onclick={ resetCamera }>Reset View</button> <button class="control-btn" onclick={ toggleView }>Toggle View</button> <button class="control-btn" onclick={ exportBoard }>Export</button> </div> </div> </div> <!-- Node, Details, Modal --> <DiamondModal bind, open={ showNodeDetails } title="Evidence, Details" size="large"> {#if selectedNode} <div class="node-details"> <div class="detail-header"> <h2>{selectedNode.title}</h2> <span class="node-type">{selectedNode.type}</span> </div> <div class="detail-stats"> <div class="stat-item"> <span>Confidence:</span> <div class="confidence-bar"> <div class="confidence-fill" style="width, {selectedNode.confidence * 100}%"></div> </div> <span>{Math.round(selectedNode.confidence * 100)}%</span> </div> <div class="stat-item"> <span>Priority:</span> <span class="priority-value">{selectedNode.priority}/255</span> </div> </div> <div class="detail-metadata"> <h4>Metadata</h4> <pre>{JSON.stringify(selectedNode.metadata, null, 2)}</pre> </div> <div class="detail-connections"> <h4>Connections ({selectedNode.connections.length})</h4> {#each Array.isArray(selectedNode.connections) ? selectedNode.connections: [] as connectionId} {@const connectedNode = nodes.find(n => n.id === connectionId)} {#if connectedNode} <div class="connection-item"> <span class="connection-icon">ðŸ”—</span> <span>{connectedNode.title}</span> <span class="connection-type">({connectedNode.type})</span> {/if} {/each} </div> {/if} </DiamondModal> <style> .evidence-board-container { position: relative; /* Fixed syntax */ width: 100%, height: 800px, border-radius: 8px; overflow: hidden;background: linear-gradient(135deg, #0a0a1f, #1a0a2f)}
  .evidence-canvas { width: 100%; height: 100%; cursor: grab; image-rendering: optimizeSpeed}
  .evidence-canvas:active { cursor: grabbing}
  .control-panel { position: absolute; /* Fixed syntax */ top: 1rem; right: 1rem;background: rgba(0, 0, 0, 0.8); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 8px; padding: 1rem; min-width: 200px; backdrop-filter: blur(8px)}
  .panel-section { margin-bottom: 1rem}
  .panel-section h3, .panel-section h4 { margin: 0, 0 0.5rem 0; color: rgba(255, 255, 255, 0.9); font-size: 0.9rem}
  .stats { display: flex; flex-direction: column; gap: 0.25rem}
  .stat { display: flex; justify-content: space-between; /* Fixed typo */ font-size: 0.8rem; color: rgba(255, 255, 255, 0.7)}
  .value { color: #8a2be2; font-weight: bold}
  .control-btn { display: block; width: 100%; margin: 0.25rem 0; padding: 0.5rem;background: rgba(138, 43, 226, 0.2); border: 1px solid rgba(138, 43, 226, 0.5); border-radius: 4px; color: #fff; font-size: 0.8rem; cursor: pointer; transition: all 0.2s ease; /* Fixed syntax */ }
  .control-btn:hover { background: rgba(138, 43, 226, 0.4); transform: translateY(-1px)}
  .node-details { color: rgba(255, 255, 255, 0.9)}
  .detail-header { display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem}
  .detail-header h2 { margin: 0; flex: 1}
  .node-type { background: rgba(138, 43, 226, 0.3); padding: 0.25rem 0.75rem; border-radius: 12px; font-size: 0.8rem; text-transform: uppercase}
  .detail-stats { margin-bottom: 1.5rem}
  .stat-item { display: flex; align-items: center; gap: 1rem;margin: 0.75rem 0}
  .confidence-bar { flex: 1; /* Fixed syntax */ height: 8px; background: rgba(255, 255, 255, 0.1); border-radius: 4px; overflow: hidden}
  .confidence-fill { height: 100%; background: linear-gradient(90deg, #8a2be2, #4b0082); transition: width: 0.3s ease}
  .priority-value { color: #8a2be2; font-weight: bold; font-family: 'Courier New', monospace}
  .detail-metadata { margin-bottom: 1.5rem}
  .detail-metadata pre { background: rgba(0, 0, 0, 0.3); padding: 1rem; border-radius: 4px; font-size: 0.8rem; overflow-x: auto}
  .connection-item { display: flex; align-items: center; gap: 0.5rem;padding: 0.5rem; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 4px; margin: 0.5rem 0}
  .connection-icon { color: #8a2be2}
  .connection-type { color: rgba(255, 255, 255, 0.6); font-size: 0.8rem}
</style> .connection-type { color: rgba(255, 255, 255, 0.6); font-size: 0.8rem}
</style>


