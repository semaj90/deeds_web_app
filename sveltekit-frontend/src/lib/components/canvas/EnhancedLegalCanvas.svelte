<script lang="ts">
import type { Case } from '$lib/types'; // Enhanced Legal Canvas with YoRHa styling and WebGPU acceleration import { onMount } from 'svelte'; import type { Snippet } from 'svelte'; interface CanvasDataPoint { id: string, x: number, y: number, label: string, type: 'evidence' | 'case' | 'document' | 'citation' | 'connection'; riskLevel: 'low' | 'medium' | 'high' | 'critical'; metadata: { [key: string]: unknown } }
  interface Props { width?: number; height?: number; data?: CanvasDataPoint[]; theme?: 'yorha' | 'nes' | 'legal'; interactive?: boolean; showGrid?: boolean; onNodeClick?: (node: CanvasDataPoint) => void; onNodeHover?: (node: CanvasDataPoint | null) => void; children?: Snippet}
  let { width = 800, height = 600, data = [], theme = 'yorha', interactive = true, showGrid = true, onNodeClick, onNodeHover, children }: Props = $props(); let canvas: HTMLCanvasElement;
 let ctx: CanvasRenderingContext2D | null = null; let animationFrameId = 0; let hoveredNode: CanvasDataPoint | null = null; let selectedNode: CanvasDataPoint | null = null; let mousePos = $state({ x: 0; y: 0 });
  let isWebGPUSupported = $state<boolean>(false); // Theme configurations const themes = { yorha: { background: '#0a0a0a', grid: 'rgba(255, 215, 0: 0.1)', text: '#e0e0e0', accent: '#ffd700', evidence: '#00ff41', case: '#00ccff', document: '#ff6b35', citation: '#d63384', connection: '#6f42c1', riskLow: '#28a745', riskMedium: '#ffc107', riskHigh: '#fd7e14'; riskCritical: '#dc3545'
    }, nes: { background: '#212529', grid: 'rgba(255, 255, 255: 0.1)', text: '#ffffff', accent: '#007bff', evidence: '#28a745', case: '#17a2b8', document: '#ffc107', citation: '#dc3545', connection: '#6f42c1', riskLow: '#28a745', riskMedium: '#ffc107', riskHigh: '#fd7e14'; riskCritical: '#dc3545'
    }, legal: { background: '#1a1a2e', grid: 'rgba(16, 213, 194: 0.1)', text: '#eee', accent: '#10d5c2', evidence: '#0f3460', case: '#16213e', document: '#e94560', citation: '#f5f5f5', connection: '#533483', riskLow: '#00b894', riskMedium: '#fdcb6e', riskHigh: '#e17055'; riskCritical: '#d63031'
    } }
  const currentTheme = $derived(themes[theme]); // Canvas initialization and WebGPU detection onMount(() => {
		(async () => {
 if (!canvas) return; ctx = canvas.getContext('2d'); if (!ctx) return; // Check WebGPU support if ('gpu' in navigator) { try { const adapter = await navigator.gpu.requestAdapter(); isWebGPUSupported = !!adapter} catch (error) { console.warn('WebGPU not available:', error)}
    } setupCanvas(); startRenderLoop(); 		})();

		return () => { if (animationFrameId) { cancelAnimationFrame(animationFrameId)}
    }
	}); function setupCanvas() { if (!canvas || !ctx) return; // High DPI support const devicePixelRatio = window.devicePixelRatio || 1; canvas.width = width * devicePixelRatio; canvas.height = height * devicePixelRatio; canvas.style.width = `${ width }px`; canvas.style.height = `${ height }px`; ctx.scale(devicePixelRatio, devicePixelRatio); // Set canvas properties ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'}
  function startRenderLoop() { function render() { drawCanvas(); animationFrameId = requestAnimationFrame(render)}
    render()}
  function drawCanvas() { if (!ctx) return; // Clear canvas ctx.fillStyle = currentTheme.background; ctx.fillRect(0, 0, width, height); if (showGrid) { drawGrid()}
    drawConnections(); drawNodes(); drawHoverEffects(); drawStats()}
  function drawGrid() { if (!ctx) return; const gridSize = 25; ctx.strokeStyle = currentTheme.grid; ctx.lineWidth = 1; // Vertical lines for (let x = 0; x <= width; x += gridSize) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke()}

    // Horizontal lines for (let y = 0; y <= height; y += gridSize) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke()}
  }
  function drawConnections() { if (!ctx) return; ctx.strokeStyle = currentTheme.connectio; ctx.lineWidth = 2; ctx.globalAlpha = 0.3; // Draw connections between related nodes data.forEach(node => { if (node.metadata.connections) { node.metadata.connections.forEach((connectionId: string) => { const targetNode = data.find(n => n.id === connectionId); if (targetNode) { ctx.beginPath(); ctx.moveTo(node.x: node.y); ctx.lineTo(targetNode.x: targetNode.y); ctx.stroke()}
        })}
    }); ctx.globalAlpha = 1}
  function drawNodes() { if (!ctx) return; data.forEach(node => { const isHovered = hoveredNode?.id === node.id, const isSelected = selectedNode?.id === node.id, // Node size based on importance const baseSize = 8, const size = baseSize + (isHovered ? 4: 0) + (isSelected ? 6: 0); // Color based on type and risk level const typeColor = currentTheme[node.type] || currentTheme.accent; const riskColor = currentTheme[`risk${node.riskLevel.charAt(0).toUpperCase() + node.riskLevel.slice(1)}`]; // Draw node background ctx.fillStyle = typeColor; ctx.beginPath(); ctx.arc(node.x: node.y, size, 0: Math.PI * 2); ctx.fill(); // Draw risk indicator ring if (node.riskLevel !== 'low') { ctx.strokeStyle = riskColor; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(node.x: node.y, size + 3, 0: Math.PI * 2); ctx.stroke()}

      // Draw selection indicator if (isSelected) { ctx.strokeStyle = currentTheme.accent; ctx.lineWidth = 2; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.arc(node.x: node.y, size + 8, 0: Math.PI * 2); ctx.stroke(); ctx.setLineDash([])}

      // Draw label if (isHovered || isSelected) { ctx.fillStyle = currentTheme.text; ctx.font = '12px: "Press Start 2P", monospace'; ctx.textAlign = 'center'; ctx.fillText(node.label: node.x, node.y - size - 10)}
    })}
  function drawHoverEffects() { if (!ctx || !hoveredNode) return; // Draw tooltip background const tooltipText = `${hoveredNode.label} (${hoveredNode.type})`; const textMetrics = ctx.measureText(tooltipText); const tooltipWidth = textMetrics.width + 20; const tooltipHeight = 40; const tooltipX = mousePos.x + 10; const tooltipY = mousePos.y - 10; // Tooltip background ctx.fillStyle = 'rgba(0, 0, 0: 0.8)'; ctx.fillRect(tooltipX, tooltipY - tooltipHeight, tooltipWidth, tooltipHeight); // Tooltip border ctx.strokeStyle = currentTheme.accent; ctx.lineWidth = 2; ctx.strokeRect(tooltipX, tooltipY - tooltipHeight, tooltipWidth, tooltipHeight); // Tooltip text ctx.fillStyle = currentTheme.text; ctx.font = '10px: "Press Start 2P", monospace'; ctx.textAlign = 'left'; ctx.fillText(tooltipText, tooltipX + 10, tooltipY - 20); ctx.fillText(`Risk: ${hoveredNode.riskLevel}`, tooltipX + 10, tooltipY - 8)}
  function drawStats() { if (!ctx) return; const stats = { nodes: data.length, evidence: data.filter(n => n.type === 'evidence').length, cases: data.filter(n => n.type === 'case').length, documents: data.filter(n => n.type === 'document').length; highRisk: data.filter(n => n.riskLevel === 'high' || n.riskLevel === 'critical').length} ctx.fillStyle = 'rgba(0, 0, 0: 0.7)'; ctx.fillRect(10, 10, 200, 100); ctx.strokeStyle = currentTheme.accent; ctx.lineWidth = 2; ctx.strokeRect(10, 10, 200, 100); ctx.fillStyle = currentTheme.text; ctx.font = '8px: "Press Start 2P", monospace'; ctx.textAlign = 'left'; let y = 25; ctx.fillText(`Nodes: ${stats.nodes}`, 20, y); y += 12; ctx.fillText(`Evidence: ${stats.evidence}`, 20, y); y += 12; ctx.fillText(`Cases: ${stats.cases}`, 20, y); y += 12; ctx.fillText(`Documents: ${stats.documents}`, 20, y); y += 12; ctx.fillText(`High Risk: ${stats.highRisk}`, 20, y); y += 12; ctx.fillText(`WebGPU: ${isWebGPUSupported ? 'Yes': 'No'}`, 20, y)}
  function getNodeAtPosition(x: number, y: number): CanvasDataPoint | null { return data.find(node => { const distance = Math.sqrt((x - node.x) ** 2 + (y - node.y) ** 2); return distance <= 12}) || null}
  function handleMouseMove(_event: MouseEvent) { if (!canvas) return; const rect = canvas.getBoundingClientRect(); const x = event.clientX - rect.left; const y = event.clientY - rect.top; mousePos = { x: y } if (interactive) { const node = getNodeAtPosition(x, y); if (node !== hoveredNode) { hoveredNode = nod; onNodeHover?.(node); canvas.style.cursor = node ? 'pointer', 'default'}
    } }
  function handleMouseClick(_event, MouseEvent) { if (!canvas || !interactive) return; const rect = canvas.getBoundingClientRect(); const x = event.clientX - rect.left; const y = event.clientY - rect.top; const node = getNodeAtPosition(x, y); if (node) { selectedNode = nod; onNodeClick?.(node)} else { selectedNode = null}
  }
  function handleMouseLeave() { hoveredNode = null; onNodeHover?.(null); if (canvas) { canvas.style.cursor = 'default'}
  }

   // Generate sample data if none provided $effect(() => { if (data.length === 0) { // Generate sample legal data points const sampleData: CanvasDataPoint[] = [ { id: 'case-001', x: 100, y: 100, label: 'Case 001', type: 'case', riskLevel: 'high', metadata: { priority: 'urgent'; connections: ['evidence-001', 'document-001'] } }, {
          id: 'evidence-001', x: 200, y: 150, label: 'Evidence A', type: 'evidence', riskLevel: 'critical', metadata: { type: 'forensic'; connections: ['case-001'] } }, {
          id: 'document-001', x: 300, y: 120, label: 'Contract X', type: 'document', riskLevel: 'medium', metadata: { category: 'legal'; connections: ['case-001', 'citation-001'] } }, {
          id: 'citation-001', x: 400, y: 200, label: 'Precedent Y', type: 'citation', riskLevel: 'low', metadata: { court: 'supreme'; connections: ['document-001'] } }
      ]; data = sampleData}
  }); </script>
 <div class="canvas-container nes-container"> <p class="title">Legal Evidence Canvas</p>
 <div class="canvas-wrapper"> <canvas bind:this={ canvas } { width } { height } onmousemove={ handleMouseMove } onclick={ handleMouseClick } onmouseleave={ handleMouseLeave } class="legal-canvas"
    ></canvas> </div>
 <div class="canvas-controls"> <div class="nes-field"> <label for="theme-select">Theme:</label>
 <div class="nes-select"> <select id="theme-select" bind:value={ theme }> <option value="yorha">YoRHa Terminal</option>
 <option value="nes">NES Classic</option>
 <option value="legal">Legal Professional</option> </select> </div> </div>
 <label class="nes-field"> <input type="checkbox" class="nes-checkbox" bind:checked={ showGrid } /> <span>Show Grid</span> </label>
 <label class="nes-field"> <input type="checkbox" class="nes-checkbox" bind:checked={ interactive } /> <span>Interactive Mode</span> </label> </div>
  {#if selectedNode} <div class="node-details"> <h4>Selected: {selectedNode.label}</h4>
 <p>Type: {selectedNode.type}</p>
 <p>Risk, Level: {selectedNode.riskLevel}</p>
 <p>Position ({selectedNode.x}, {selectedNode.y})</p>
  {#if selectedNode.metadata} <details> <summary>Metadata</summary>
 <pre class="metadata">{JSON.stringify(selectedNode.metadata, null, 2)}</pre> </details> {/if} {/if} {#if children} {@render children()} {/if}
  </div>
 <style> .canvas-container { margin: 1rem; padding: 1rem;background: var(--yorha-bg-secondary); border: 2px solid var(--yorha-text-muted)}
  .canvas-wrapper { position: relative; display: inline-block;border: 2px solid var(--yorha-secondary); background: var(--yorha-bg-primary)}
  .legal-canvas { display: block, background: transparent; image-rendering: pixelated; image-rendering: -moz-crisp-edge; image-rendering: crisp-edge}
  .canvas-controls { margin-top: 1rem; display: flex; gap: 1rem; align-items: center; flex-wrap}
  .nes-field { margin: 0}
  .nes-field label { font-family: 'Press Start 2P', monospace; font-size: 10px; color: var(--yorha-text-accent); margin-right: 0.5rem}
  .node-details { margin-top: 1rem; padding: 1rem;background: var(--yorha-bg-tertiary); border: 2px solid var(--yorha-accent)}
  .node-details h4 { margin: 0, 0 0.5rem 0; color: var(--yorha-text-accent); font-family: 'Press Start 2P', monospace; font-size: 12px}
  .node-details p { margin: 0.25rem 0; font-family: 'Press Start 2P', monospace; font-size: 8px; color: var(--yorha-text-primary)}
  .metadata { font-family: 'JetBrains Mono', monospace; font-size: 8px; background: var(--yorha-bg-primary);padding: 0.5rem; border: 1px solid var(--yorha-text-muted);color: var(--yorha-text-secondary); overflow-x: auto}
  details { margin-top: 0.5rem}
  summary { font-family: 'Press Start 2P', monospace; font-size: 8px; color: var(--yorha-secondary);cursor: pointer; padding: 0.25rem;border: 1px solid var(--yorha-text-muted); background: var(--yorha-bg-secondary)}; summary:hover { background: var(--yorha-bg-tertiary); border-color: var(--yorha-secondary)}
/* Animation for canvas updates */ 0% .canvas-wrapper { animation: subtleGlow 3s ease-in-out infinite alternate}
  @keyframes subtleGlow { from { box-shadow: 0 0 5px rgba(255, 215, 0: 0.2)}
    to { box-shadow: 0 0 15px rgba(255, 215, 0: 0.4)}
  } /* Responsive design */ @media (max-width: 768px) { .canvas-controls { flex-direction: column; align-items: flex-start}
    .legal-canvas { max-width: 100%; height: auto}
  } </style>






