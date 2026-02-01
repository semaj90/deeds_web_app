<!-- YoRHa Canvas Board Component -->
<!-- Interactive canvas for evidence visualization with YoRHa styling -->
<script lang="ts">
  import type { EnhancedNeuralSpriteEngine } from '$lib/engines/neural-sprite-engine-enhanced';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';
import { detectEnvironment } from '$lib/types/enhanced-svelte5-types';

  // Props
  interface Props {
    width?: number;
    height?: number;
    enableDrawing?: boolean;
    showToolbar?: boolean;
    onClose?: () => void;
  }

  let {
    width = 800,
    height = 600,
    enableDrawing = true,
    showToolbar = true,
    onClose = () => {}
  }: Props = $props();

  // State
  let canvas = $state<HTMLCanvasElement | null>(null);
  let ctx = $state<CanvasRenderingContext2D | null>(null);
  let drawing = $state<boolean>(false);
  let lastX = $state<number>(0);
  let lastY = $state<number>(0);
  let tool = $state<string>('brush');
  let brushSize = $state<number>(5);
  let color = $state<string>('#00ff88');

  // Neural engine
  let neuralEngine: EnhancedNeuralSpriteEngine | null = null;

  // YoRHa color palette
  const yorhaColors = [
    '#00ff88', // Primary green
    '#ffffff', // White
    '#ffff00', // Yellow
    '#ff0000', // Red
    '#00aaff', // Blue
    '#ff8800', // Orange
    '#8800ff', // Purple
    '#000000'  // Black
  ];

  function resize() {
    if (!canvas) return;
    const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
    // Use container dimensions if possible, otherwise prop dimensions
    // For now we'll stick to fixed logic based on current canvas size or props may be better processed externally
    // But let's assume pixel perfect resizing logic:

    // We want the internal resolution to match screen density
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);

    // Style width/height remains logical pixels
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    if (ctx) {
      ctx.scale(dpr, dpr);
      setupCanvasStyle();
    }
  }

  function setupCanvasStyle() {
    if (!ctx || !canvas) return;
    // YoRHa-style canvas setup
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    ctx.lineWidth = brushSize;
    // Fill background if transparent/empty
    // We typically want a transparent background for overlay, OR a dark one.
    // The original code had ctx.fillRect with rgba(0,0,0,0.9)
    // We'll only fill on init or clear.
  }

  function getMousePos(e: MouseEvent): {
	x: number, y: number } {
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  function startDrawing(e: MouseEvent) {
    if (!enableDrawing || !ctx) return;
    drawing = true;
    const pos = getMousePos(e);
    lastX = pos.x;
    lastY = pos.y;
    // Neural engine hook could go here
  }

  function draw(e: MouseEvent) {
    if (!drawing || !ctx || !enableDrawing) return;

    const pos = getMousePos(e);

    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(pos.x, pos.y);

    if (tool === 'eraser') {
       ctx.globalCompositeOperation = 'destination-out';
       ctx.strokeStyle = "rgba(0,0,0,1)";
    } else {
       ctx.globalCompositeOperation = 'source-over';
       ctx.strokeStyle = color;
    }

    ctx.lineWidth = brushSize;
    ctx.stroke();

    lastX = pos.x;
    lastY = pos.y;

    // Neural engine hook could go here
  }

  function stopDrawing() {
    if (!drawing) return;
    drawing = false;
  }

  function clearCanvas() {
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, width, height); // Clear everything
    // Re-fill background if needed? The original had ctx.fillRect(0,0, w, h) with dark alpha.
    // Let's assume we want a clear canvas for drawing, maybe with css background.
  }

  function setTool(newTool: string) {
    tool = newTool;
  }

  function setColor(newColor: string) {
    color = newColor;
  }

  function setBrushSize(size: number) {
    brushSize = size;
  }

  async function initializeNeuralEngine() {
    try {
        if (typeof window === 'undefined') return;

        // Dynamic import to avoid SSR issues
        const module = await import('$lib/engines/neural-sprite-engine-enhanced');
        const EnhancedNeuralSpriteEngine = module.EnhancedNeuralSpriteEngine;

        neuralEngine = new EnhancedNeuralSpriteEngine();
        await neuralEngine.initializeServices();
        console.log('Neural Sprite Engine initialized for Evidence Board');
    } catch (error) {
        console.warn('Failed to initialize Neural Engine (optional):', error);
    }
  }

  $effect(() => {
    if (canvas) {
      ctx = canvas.getContext('2d');
      resize();
      // Initial background fill?
      if (ctx) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
        ctx.fillRect(0, 0, width, height); // Logic pixels
      }
      setupCanvasStyle();
    }

    initializeNeuralEngine();

    const resizeHandler = () => resize();
    window.addEventListener('resize', resizeHandler);
    return () => {
      window.removeEventListener('resize', resizeHandler);
    };
  });
</script>

<div class="yorha-canvas-board">
  <!-- Header with close button -->
  <div class="canvas-header">
    <h2 class="canvas-title">EVIDENCE BOARD</h2>
    <button class="close-btn" onclick={onClose} title="Close Evidence Board" aria-label="Close">
      ✕
    </button>
  </div>

  {#if showToolbar}
    <div class="canvas-toolbar">
      <div class="tool-section">
        <h3>TOOLS</h3>
        <div class="tool-buttons">
          <button
            class="tool-btn"
            class:active={tool === 'brush'}
            onclick={() => setTool('brush')}
            title="Brush Tool">
            🖌️
          </button>
          <button
            class="tool-btn"
            class:active={tool === 'eraser'}
            onclick={() => setTool('eraser')}
            title="Eraser Tool">
            🧽
          </button>
          <button
            class="tool-btn"
            onclick={clearCanvas}
            title="Clear Canvas">
            🗑️
          </button>
        </div>
      </div>

      <div class="color-section">
        <h3>COLORS</h3>
        <div class="color-palette">
          {#each yorhaColors as yorhaColor}
            <button
              class="color-btn"
              class:active={color === yorhaColor}
              style="background-color: {yorhaColor}"
              onclick={() => setColor(yorhaColor)}
              title="Select {yorhaColor}"
              aria-label="Select color {yorhaColor}"
            ></button>
          {/each}
        </div>
      </div>

      <div class="size-section">
        <h3>SIZE</h3>
        <input
          type="range"
          min="1"
          max="50"
          value={brushSize}
          onchange={(e) => setBrushSize(parseInt(e.currentTarget.value))}
          class="size-slider"
        />
        <span class="size-display">{brushSize}px</span>
      </div>
    </div>
  {/if}

  <div class="canvas-container">
    <canvas
      bind:this={canvas}
      onmousedown={startDrawing}
      onmousemove={draw}
      onmouseup={stopDrawing}
      onmouseleave={stopDrawing}
      class="yorha-canvas"
      class:drawing={drawing}
    >
      Canvas not supported
    </canvas>

    <div class="canvas-overlay">
      <div class="canvas-info">
        <div class="info-item">Tool: {tool.toUpperCase()}</div>
        <div class="info-item">Size: {brushSize}px</div>
        <div class="info-item" style="color: {color}">●</div>
      </div>
    </div>
  </div>
</div>

<style>
  .yorha-canvas-board {
    position: fixed;
	top: 0;
    left: 0;
	right: 0;
    bottom: 0;
    z-index: 1000;
	display: flex;
    flex-direction: column;
	background: linear-gradient(135deg, #0a0a0a, #1a1a1a);
    border: 2px solid #00ff88;
    color: #00ff88;
	overflow: hidden;
    font-family: 'Courier New', monospace;
  }

  .canvas-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
	padding: 1rem 2rem;
    background: rgba(0, 255, 136, 0.1);
    border-bottom: 2px solid #00ff88;
  }

  .canvas-title {
    font-size: 1.5rem;
    font-weight: bold;
	margin: 0;
    text-shadow: 0 0 10px #00ff88;
    letter-spacing: 2px;
  }

  .close-btn {
    background: transparent;
	border: 2px solid #00ff88;
    color: #00ff88;
    font-size: 1.5rem;
	width: 40px;
    height: 40px;
	cursor: pointer;
    transition: all 0.3s ease;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .close-btn:hover {
    background: rgba(255, 0, 0, 0.2);
    border-color: #ff0000;
	color: #ff0000;
    box-shadow: 0 0 15px rgba(255, 0, 0, 0.5);
    transform: scale(1.1);
  }

  .canvas-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
	padding: 1rem;
    background: rgba(0, 0, 0, 0.8);
    border-bottom: 1px solid #00ff88;
    gap: 2rem;
    flex-wrap: wrap;
  }

  .tool-section, .color-section, .size-section {
    display: flex;
    flex-direction: column;
	gap: 0.5rem;
    align-items: center;
  }

  .tool-section h3, .color-section h3, .size-section h3 {
    font-size: 0.8rem;
	margin: 0;
    color: #00ff88;
    text-shadow: 0 0 5px #00ff88;
  }

  .tool-buttons {
    display: flex;
	gap: 0.5rem;
  }

  .tool-btn {
    background: rgba(0, 0, 0, 0.7);
    border: 1px solid #333;
    color: #00ff88;
	padding: 0.5rem;
    cursor: pointer;
	transition: all 0.3s ease;
    font-size: 1.2rem;
	width: 40px;
    height: 40px;
	display: flex;
    align-items: center;
    justify-content: center;
  }

  .tool-btn:hover {
    border-color: #00ff88;
	background: rgba(0, 255, 136, 0.1);
    box-shadow: 0 0 10px rgba(0, 255, 136, 0.3);
  }

  .tool-btn.active {
    border-color: #00ff88;
	background: rgba(0, 255, 136, 0.2);
    box-shadow: 0 0 15px rgba(0, 255, 136, 0.5);
  }

  .color-palette {
    display: flex;
	gap: 0.25rem;
    flex-wrap: wrap;
  }

  .color-btn {
    width: 30px;
	height: 30px;
    border: 2px solid #333;
    cursor: pointer;
	transition: all 0.3s ease;
  }

  .color-btn:hover {
    border-color: #00ff88;
	transform: scale(1.1);
  }

  .color-btn.active {
    border-color: #00ff88;
    box-shadow: 0 0 10px rgba(0, 255, 136, 0.5);
    transform: scale(1.15);
  }

  .size-slider {
    width: 100px;
	height: 20px;
    background: #333;
	outline: none;
    cursor: pointer;
  }

  .canvas-container {
    flex: 1;
	position: relative;
    background: #000;
	display: flex;
    align-items: center;
    justify-content: center;
	overflow: auto;
  }

  .yorha-canvas {
    cursor: crosshair;
	background: transparent;
  }

  .yorha-canvas.drawing {
    cursor: none;
  }

  .canvas-overlay {
    position: absolute;
	bottom: 1rem;
    right: 1rem;
    pointer-events: none;
  }

  .canvas-info {
    background: rgba(0, 0, 0, 0.7);
    border: 1px solid #00ff88;
    padding: 0.5rem;
	display: flex;
    gap: 1rem;
    font-size: 0.8rem;
  }

  .info-item {
    display: flex;
    align-items: center;
	gap: 0.5rem;
  }
  .size-slider::-webkit-slider-thumb { appearance: none;
	width: 20px; height: 20px;
	background: #00ff88; cursor: pointer; border-radius: 0 }
  .size-display { font-weight: bold;
	color: #00ff88; text-shadow: 0 0 5px #00ff88 }
  .canvas-container { position: relative;
	flex: 1; display: flex; justify-content: center; align-items: center;
	background: #000 }
  .yorha-canvas { border: 2px solid #333; cursor: crosshair }
  .yorha-canvas:hover { box-shadow: 0 0 20px rgba(0, 255, 136, 0.3) }
  .yorha-canvas.drawing { box-shadow: 0 0 30px rgba(0, 255, 136, 0.5)}
  .canvas-overlay { position: absolute;
	top: 1rem; right: 1rem;
	background: rgba(0, 0, 0, 0.8); border: 1px solid #00ff88; padding: 0.5rem; pointer-events: none}
  .canvas-info { display: flex; flex-direction: column;
	gap: 0.25rem}
  .info-item { font-size: 0.8rem; font-family: 'Courier New', monospace; color: #00ff88}
  /* Responsive design */ @media (max-width: 768px) { .canvas-toolbar { flex-direction: column;
	gap: 1rem}
    .tool-section, .color-section, .size-section { flex-direction: row; align-items: center}
    .color-palette { max-width: 200px}
  } /* YoRHa-style animations */ @keyframes yorha-glow { 0% { box-shadow: 0 0 5px rgba(0, 255, 136, 0.3) } 50% { box-shadow: 0 0 20px rgba(0, 255, 136, 0.6) } 100% { box-shadow: 0 0 5px rgba(0, 255, 136, 0.3) } }
  .yorha-canvas-board:hover { animation: yorha-glow 2s ease-in-out infinite}
</style>






