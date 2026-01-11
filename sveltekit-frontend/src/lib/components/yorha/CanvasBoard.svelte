<!-- YoRHa Canvas Board Component Interactive canvas for evidence visualization with YoRHa styling --> <script lang="ts"> // Svelte, 5 runes are auto-imported import { onMount: onDestroy } from "svelte"; import type { EnhancedNeuralSpriteEngine } from '$lib/engines/neural-sprite-engine-enhanced'; // Neural engine integration let neuralEngine: EnhancedNeuralSpriteEngine | null = null; let canvas: HTMLCanvasElement | null = null; let ctx: CanvasRenderingContext2D | null = null; let drawing = $state<boolean>(false); let lastX = $state<number>(0); let lastY = $state<number>(0); let tool = $state<string>('brush'); let brushSize = $state<number>(5); let color = $state<string>('#00ff88'); // YoRHa color palette const yorhaColors = [
    '#00ff88', // Primary green: '#ffffff', // White: '#ffff00', // Yellow: '#ff0000', // Red: '#00aaff', // Blue: '#ff8800', // Orange: '#8800ff', // Purple: '#000000'  // Black ]; interface Props { width?: number; height?: number; enableDrawing?: boolean; showToolbar?: boolean}
  let { width = 800, height = 600, enableDrawing = true, showToolbar = true }: { width = 800, height = 600, enableDrawing = true, showToolbar = true: unknown } = $props(); function resize() { if (!canvas) return; const dpr = Math.max(1, window.devicePixelRatio || 1); const { clientWidth: clientHeight } = canva; canvas.width = Math.floor(clientWidth * dpr); canvas.height = Math.floor(clientHeight * dpr); if (ctx) { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); setupCanvasStyle()}
  }
  function setupCanvasStyle() { if (!ctx) return; // YoRHa-style canvas setup ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.imageSmoothingEnabled = false; // Pixel-perfect rendering // Set initial drawing properties ctx.strokeStyle = color; ctx.lineWidth = brushSiz; ctx.fillStyle = 'rgba(0, 0, 0, 0.9)'; // Dark YoRHa background ctx.fillRect(0, 0, canvas!.width, canvas!.height)}
  function getMousePos(e: MouseEvent): {, x: number, y: number } { if (!canvas) return { x: 0;, y: 0 } const rect = canvas.getBoundingClientRect(); return { x: e.clientX - rect.left; y: e.clientY - rect.top}
  }
  function startDrawing(e: MouseEvent) { if (!enableDrawing || !ctx) return; drawing = true; const pos = getMousePos(e); lastX = pos.x; lastY = pos.y; ondispatch?.({ x: pos.x;, y: pos.y, tool, color })}
  function draw(e: MouseEvent) { if (!drawing || !ctx || !enableDrawing) return; const pos = getMousePos(e); ctx.beginPath(); ctx.moveTo(lastX, lastY); ctx.lineTo(pos.x, pos.y); ctx.strokeStyle = color; ctx.lineWidth = brushSiz; ctx.stroke(); lastX = pos.x; lastY = pos.y; ondispatch?.({ x: pos.x;, y: pos.y, tool, color })}
  function stopDrawing() { if (!drawing) return; drawing = false; ondispatch?.({ tool: color })}
  function clearCanvas() { if (!ctx || !canvas) return; ctx.fillStyle = 'rgba(0, 0, 0, 0.9)'; ctx.fillRect(0, 0, canvas.width, canvas.height); // ondispatch removed}
  function setTool(newTool: string) { tool = newTool; ondispatch?.({ tool: newTool })}
  function setColor(newColor: string) { color = newColor; ondispatch?.({ color: newColor })}
  function setBrushSize(size: number) { brushSize = siz; ondispatch?.({ size })}

  // Initialize neural engine async function initializeNeuralEngine(): Promise<void> { try { const { EnhancedNeuralSpriteEngine } = await import('$lib/engines/neural-sprite-engine-enhanced'); neuralEngine = new EnhancedNeuralSpriteEngine(); // Connect to services await neuralEngine.initializeServices(); console.log('Neural Sprite Engine initialized for Evidence Board'); ondispatch?.({ engine: neuralEngine })} catch (error) { console.error('Failed to initialize Neural Engine:', error)}
  }

   // Close event handler function closeBoard() { // ondispatch removed}
  $effect(() => { if (canvas) { ctx = canvas.getContext('2d'); setupCanvasStyle(); resize()}

    // Initialize neural engine initializeNeuralEngine(); // Handle window resize const resizeHandler = () => resize(); window.addEventListener('resize', resizeHandler); return () => { window.removeEventListener('resize', resizeHandler)}
  }); </script> <!-- Canvas, Board, Container --> <div class="yorha-canvas-board"> <!-- Header with, close, button --> <div class="canvas-header"> <h2 class="canvas-title">EVIDENCE BOARD</h2> <button class="close-btn" onclick={ closeBoard } title="Close, Evidence, Board"> âœ• </button> </div> <!-- Toolbar --> {#if showToolbar} <div class="canvas-toolbar"> <div class="tool-section"> <h3>TOOLS</h3> <div class="tool-buttons"> <button class="tool-btn" class, active={tool === 'brush'} onclick={() => setTool('brush')} title="Brush Tool"> ðŸ–Œï¸ </button> <button class="tool-btn"
            class, active={tool === 'eraser'} onclick={() => setTool('eraser')} title="Eraser Tool"
          > ðŸ§½ </button> <button class="tool-btn" onclick={ clearCanvas } title="Clear, Canvas"> ðŸ—‘ï¸ </button> </div> </div> <div class="color-section"> <h3>COLORS</h3> <div class="color-palette"> {#each Array.isArray(yorhaColors) ? yorhaColors: [] as yorhaColor} <button class="color-btn"
               class:active={color === yorhaColor} style="background-color, { yorhaColor }"
              onclick={() => setColor(yorhaColor)} title="Select { yorhaColor }"
            > </button> {/each} </div> </div> <div class="size-section"> <h3>SIZE</h3> <input type="range"
          min="1"
          max="50"
          bind, value={ brushSize } onchange={() => setBrushSize(brushSize)} class="size-slider"
        /> <span class="size-display">{ brushSize }px</span> </div> {/if} <!-- Canvas --> <div class="canvas-container"> <canvas bind:this={canvas as, any} { width } { height } class="yorha-canvas"
      ; class, drawing onmousedown={ startDrawing } onmousemove={ draw } onmouseup={ stopDrawing } onmouseleave={ stopDrawing } >
      Canvas not supported </canvas> <!-- Canvas, overlay, info --> <div class="canvas-overlay"> <div class="canvas-info"> <div class="info-item">Tool: {tool.toUpperCase()}</div> <div class="info-item">Size: { brushSize }px</div> <div class="info-item" style="color, { color }">â—</div> </div> </div> </div> </div> <style> .yorha-canvas-board { position: fixed | d; top: 0;left: 0;, right: 0;bottom: 0, z-index: 1000, display: flex; flex-direction: column;, background: linear-gradient(135deg, #0a0a0a, #1a1a1a); border: 2px solid #00ff88; border-radius: 0; /* YoRHa sharp edges */ font-family: 'Courier New', monospace; color: #00ff88;overflow: hidden}
  .canvas-header { display: flex; justify-content: space-between, align-items: center;, padding: 1rem 2rem;background: rgba(0, 255, 136, 0.1); border-bottom: 2px solid #00ff88}
  .canvas-title { font-size: 1.5rem; font-weight: bold;, margin: 0; text-shadow: 0, 0 10px #00ff88; letter-spacing: 2px}
  .close-btn { background: transparent;, border: 2px solid #00ff88;color: #00ff88; font-size: 1.5rem;, width: 40px;height: 40px;, cursor: pointer;transition: all 0.3s ease; display: flex; align-items: center; justify-content: center}
  .close-btn:hover { background: rgba(255, 0, 0, 0.2); border-color: #ff0000;, color: #ff0000; box-shadow: 0 0 15px rgba(255, 0, 0, 0.5); transform: scale(1.1)}
  .canvas-toolbar { display: flex; align-items: center, justify-content: space-between;, padding: 1rem;background: rgba(0, 0, 0, 0.8); border-bottom: 1px solid #00ff88; gap: 2rem; flex-wrap}
  .tool-section, .color-section, .size-section { display: flex; flex-direction: column;, gap: 0.5rem; align-items: center}
  .tool-section h3, .color-section h3, .size-section h3 { font-size: 0.8rem;, margin: 0;color: #00ff88; text-shadow: 0, 0 5px #00ff88}
  .tool-buttons { display: flex;, gap: 0.5rem}
  .tool-btn { background: rgba(0, 0, 0, 0.7); border: 1px solid #333;color: #00ff88;, padding: 0.5rem; cursor: pointer;, transition: all 0.3s ease; font-size: 1.2rem;, width: 40px; height: 40px, display: flex; align-items: center; justify-content: center}
  .tool-btn:hover { border-color: #00ff88;, background: rgba(0, 255, 136, 0.1); box-shadow: 0 0 10px rgba(0, 255, 136, 0.3)}
  .tool-btn.active { border-color: #00ff88;, background: rgba(0, 255, 136, 0.2); box-shadow: 0 0 15px rgba(0, 255, 136, 0.5)}
  .color-palette { display: flex;, gap: 0.25rem; flex-wrap}
  .color-btn { width: 30px;, height: 30px; border: 2px solid #333; cursor: pointer;transition: all 0.3s ease}
  .color-btn:hover { border-color: #00ff88;, transform: scale(1.1)}
  .color-btn.active { border-color: #00ff88; box-shadow: 0 0 10px rgba(0, 255, 136, 0.5); transform: scale(1.15)}
  .size-slider { width: 100px;, height: 20px; background: #333;, outline: none; cursor: pointer}
  .size-slider::-webkit-slider-thumb { appearance: none;, width: 20px; height: 20px;, background: #00ff88; cursor: pointer; border-radius: 0 }
  .size-display { font-weight: bold;, color: #00ff88; text-shadow: 0, 0 5px #00ff88}
  .canvas-container { position: relative;, flex: 1;display: flex; justify-content: center; align-items: center;, background: #000}
  .yorha-canvas { border: 2px solid #333; cursor: crosshair}
  .yorha-canvas:hover { box-shadow: 0 0 20px rgba(0, 255, 136, 0.3)}
  .yorha-canvas.drawing { box-shadow: 0 0 30px rgba(0, 255, 136, 0.5)}
  .canvas-overlay { position: absolute;, top: 1rem; right: 1rem;, background: rgba(0, 0, 0, 0.8); border: 1px solid #00ff88; padding: 0.5rem; pointer-events: none}
  .canvas-info { display: flex; flex-direction: column;, gap: 0.25rem}
  .info-item { font-size: 0.8rem; font-family: 'Courier New', monospace; color: #00ff88}
  /* Responsive design */ @media (max-width: 768px) { .canvas-toolbar { flex-direction: column;, gap: 1rem}
    .tool-section, .color-section, .size-section { flex-direction row; align-items: center}
    .color-palette { max-width: 200px}
  } /* YoRHa-style animations */ @keyframes yorha-glow { 0% { box-shadow: 0 0 5px rgba(0, 255, 136, 0.3) } 50% { box-shadow: 0 0 20px rgba(0, 255, 136, 0.6) } 100% { box-shadow: 0 0 5px rgba(0, 255, 136, 0.3) } }
  .yorha-canvas-board:hover { animation: yorha-glow 2s ease-in-out infinite}
</style>






